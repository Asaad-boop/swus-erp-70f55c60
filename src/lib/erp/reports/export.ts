import { exportAoaXlsx } from "@/lib/erp/utils/excel";
import { printHtml } from "@/lib/erp/utils/pdf";

export type Aoa = (string | number | null | undefined)[][];

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV with UTF-8 BOM so Excel renders Bengali + ৳ correctly. */
export function exportCsv(aoa: Aoa, filename: string) {
  const csv = aoa.map((r) => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportXlsx(aoa: Aoa, sheet: string, filename: string) {
  exportAoaXlsx(aoa as any[][], sheet, filename);
}

const h = (v: unknown) =>
  String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);

/** Branded, print-ready PDF of a report table (browser "Save as PDF"). */
export function exportReportPdf(opts: {
  title: string;
  subtitle?: string;
  rangeLabel?: string;
  kpis?: { label: string; value: string; hint?: string }[];
  aoa: Aoa;
  note?: string;
}) {
  const [head = [], ...body] = opts.aoa;
  const kpiHtml = (opts.kpis ?? [])
    .map(
      (k) => `<div class="kpi"><span class="kl">${h(k.label)}</span><span class="kv">${h(k.value)}</span>${
        k.hint ? `<span class="kh">${h(k.hint)}</span>` : ""
      }</div>`,
    )
    .join("");
  const html = `
  <style>
    .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px}
    .kpi{border:1px solid #e2e8f0;border-left:3px solid #4f46e5;border-radius:8px;padding:8px 10px;background:#f8fafc;display:flex;flex-direction:column}
    .kl{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#64748b}
    .kv{font-size:15px;font-weight:700;margin-top:2px}
    .kh{font-size:9px;color:#94a3b8;margin-top:1px}
    table{border-collapse:collapse;width:100%;font-size:10.5px}
    thead th{background:#1e1b4b;color:#fff;border:0;padding:6px 7px;text-align:left;font-weight:600}
    tbody td{border:0;border-bottom:1px solid #eef2f7;padding:5px 7px}
    tbody tr:nth-child(even){background:#f8fafc}
    td.num{text-align:right;font-variant-numeric:tabular-nums}
    .rows{margin-top:12px;color:#94a3b8;font-size:10px}
  </style>
  ${kpiHtml ? `<div class="kpis">${kpiHtml}</div>` : ""}
  <table>
    <thead><tr>${head.map((c) => `<th>${h(c)}</th>`).join("")}</tr></thead>
    <tbody>${body
      .map(
        (r) =>
          `<tr>${r.map((c) => `<td class="${isNum(c) ? "num" : ""}">${
            isNum(c) ? (c as number).toLocaleString("en-BD", { maximumFractionDigits: 2 }) : h(c)
          }</td>`).join("")}</tr>`,
      )
      .join("")}</tbody>
  </table>
  <div class="rows">${h(opts.note ?? `${body.length} rows`)}</div>`;
  printHtml(html, {
    title: opts.title,
    docTitle: opts.title,
    subtitle: [opts.subtitle, opts.rangeLabel].filter(Boolean).join(" · ") || undefined,
    meta: [`${body.length} rows`],
  });
}

