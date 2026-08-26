import { printHtml } from "@/lib/erp/utils/pdf";
import { fmtBdt } from "@/lib/erp/imports/types";

type AnyRelease = any;

type Helpers = {
  titleFor: (ri: any) => string;
  skuFor: (ri: any) => string;
  colorFor: (ri: any) => { name: string; hex: string } | null;
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );

const styles = `
  <style>
    table.doc-tbl { width:100%; border-collapse:collapse; font-size:11px; margin-top:10px; }
    table.doc-tbl th { text-align:left; background:#f1f5f9; border-bottom:1px solid #cbd5e1; padding:6px 8px; font-size:10px; text-transform:uppercase; letter-spacing:.04em; }
    table.doc-tbl td { border-bottom:1px solid #e2e8f0; padding:6px 8px; }
    table.doc-tbl td.num, table.doc-tbl th.num { text-align:right; font-variant-numeric:tabular-nums; }
    .sku { font-family:ui-monospace,monospace; font-size:9px; color:#64748b; }
    .chip { display:inline-block; border:1px solid #cbd5e1; border-radius:99px; padding:0 6px; font-size:9px; margin-left:4px; }
    .dot { display:inline-block; width:7px; height:7px; border-radius:99px; border:1px solid #cbd5e1; margin-right:3px; vertical-align:-1px; }
    .tiles { display:flex; gap:10px; margin-top:12px; flex-wrap:wrap; }
    .tile { border:1px solid #e2e8f0; border-radius:6px; padding:8px 12px; min-width:130px; }
    .tile .l { font-size:9px; text-transform:uppercase; letter-spacing:.05em; color:#64748b; }
    .tile .v { font-size:13px; font-weight:600; font-variant-numeric:tabular-nums; }
    .note { margin-top:10px; font-size:10px; color:#475569; }
    .sign { margin-top:34px; display:flex; gap:40px; font-size:10px; color:#475569; }
    .sign div { border-top:1px solid #94a3b8; padding-top:4px; min-width:170px; }
  </style>
`;

function rowsHtml(rel: AnyRelease, h: Helpers, qcMode: boolean) {
  return (rel.items ?? [])
    .map((ri: any) => {
      const col = h.colorFor(ri);
      const chip = col
        ? `<span class="chip"><span class="dot" style="background:${esc(col.hex)}"></span>${esc(col.name)}</span>`
        : "";
      const cells = qcMode
        ? `<td class="num">${ri.quantity ?? 0}</td>
           <td class="num">${ri.qc_good_qty ?? "—"}</td>
           <td class="num">${ri.qc_damaged_qty ?? 0}</td>
           <td class="num">${ri.qc_extra_qty ?? 0}</td>
           <td class="num">${fmtBdt(ri.final_unit_cost_bdt ?? ri.unit_landed_cost_bdt)}</td>`
        : `<td class="num">${ri.quantity ?? 0}</td>
           <td class="num">${ri.damaged_qty ?? 0}</td>
           <td class="num">${ri.missing_qty ?? 0}</td>
           <td class="num">${fmtBdt(ri.unit_landed_cost_bdt)}</td>`;
      return `<tr>
        <td>${esc(h.titleFor(ri))}<div class="sku">${esc(h.skuFor(ri))}${chip}</div></td>
        ${cells}
      </tr>`;
    })
    .join("");
}

function tile(l: string, v: string) {
  return `<div class="tile"><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div></div>`;
}

export function printReleaseSlip({ po, release, ...h }: { po: any; release: AnyRelease } & Helpers) {
  const list = release.items ?? [];
  const qty = list.reduce((s: number, i: any) => s + Number(i.quantity ?? 0), 0);
  const value = list.reduce(
    (s: number, i: any) => s + Number(i.quantity ?? 0) * Number(i.unit_landed_cost_bdt ?? 0), 0,
  );
  const html = `${styles}
    <table class="doc-tbl">
      <thead><tr><th>Product</th><th class="num">Released</th><th class="num">Damaged</th><th class="num">Missing</th><th class="num">Landed / pc</th></tr></thead>
      <tbody>${rowsHtml(release, h, false)}</tbody>
    </table>
    <div class="tiles">
      ${tile("Total pcs", `${qty} pcs`)}
      ${tile("Freight (ei lot)", fmtBdt(release.shipping_charge_bdt ?? 0))}
      ${tile("Release value", fmtBdt(value))}
      ${tile("Avg landed / pc", fmtBdt(qty > 0 ? value / qty : 0))}
    </div>
    ${release.notes ? `<div class="note">Note: ${esc(release.notes)}</div>` : ""}
    <div class="note">Ei pcs warehouse QC na howa porjonto <b>reserved</b> — sellable na.</div>
    <div class="sign"><div>Released by</div><div>Received by</div></div>`;
  printHtml(html, {
    title: `Release slip #${release.release_number} — ${po?.po_number ?? ""}`,
    docTitle: `Release Slip #${release.release_number}`,
    subtitle: `PO ${po?.po_number ?? "—"}${po?.supplier_name ? ` · ${po.supplier_name}` : ""}`,
    meta: [`Released: ${new Date(release.released_at).toLocaleString()}`],
  });
}

export function printQcReport({ po, release, ...h }: { po: any; release: AnyRelease } & Helpers) {
  const list = release.items ?? [];
  const good = list.reduce((s: number, i: any) => s + Number(i.qc_good_qty ?? 0), 0);
  const bad = list.reduce((s: number, i: any) => s + Number(i.qc_damaged_qty ?? 0), 0);
  const extra = list.reduce((s: number, i: any) => s + Number(i.qc_extra_qty ?? 0), 0);
  const finalTotal = list.reduce(
    (s: number, i: any) => s + Number(i.final_unit_cost_bdt ?? 0) * Number(i.qc_good_qty ?? 0), 0,
  );
  const courier = Number(release.local_courier_bdt ?? release.local_delivery_bdt ?? 0);
  const html = `${styles}
    <table class="doc-tbl">
      <thead><tr><th>Product</th><th class="num">Released</th><th class="num">Good</th><th class="num">Damaged</th><th class="num">Extra</th><th class="num">Final / pc</th></tr></thead>
      <tbody>${rowsHtml(release, h, true)}</tbody>
    </table>
    <div class="tiles">
      ${tile("Good (stocked)", `${good + extra} pcs`)}
      ${tile("Damaged", `${bad} pcs`)}
      ${tile("Local courier", fmtBdt(courier))}
      ${tile("Final cost / pc", fmtBdt(good > 0 ? finalTotal / good : 0))}
    </div>
    ${release.qc_notes ? `<div class="note">QC note: ${esc(release.qc_notes)}</div>` : ""}
    <div class="sign"><div>QC by</div><div>Warehouse in-charge</div></div>`;
  printHtml(html, {
    title: `QC report #${release.release_number} — ${po?.po_number ?? ""}`,
    docTitle: `Warehouse QC Report #${release.release_number}`,
    subtitle: `PO ${po?.po_number ?? "—"}${po?.supplier_name ? ` · ${po.supplier_name}` : ""}`,
    meta: [release.qc_at ? `QC: ${new Date(release.qc_at).toLocaleString()}` : null],
  });
}
