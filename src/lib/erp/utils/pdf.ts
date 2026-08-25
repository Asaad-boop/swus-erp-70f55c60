/**
 * Print-based PDF helper. Mounts the given HTML in a hidden iframe and
 * triggers the browser print dialog so the user can "Save as PDF".
 *
 * Every document gets the same branded header (logo + company) and footer
 * (contact line + note + timestamp), repeated on each printed page.
 */
import { getDocBranding } from "@/lib/erp/utils/doc-branding";

export type PrintOptions = {
  /** Window/document title (also the suggested PDF file name). */
  title?: string;
  /** Big document heading in the branded header. Defaults to `title`. */
  docTitle?: string;
  /** Small line under the doc heading (e.g. date range, filters). */
  subtitle?: string;
  /** Extra right-aligned meta lines in the header. */
  meta?: (string | null | undefined)[];
  /** Override the footer note for this document. */
  footerNote?: string;
  /** Set false for raw, unbranded output. */
  branded?: boolean;
  /** Page orientation. */
  landscape?: boolean;
};

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

function brandHeaderHtml(opts: PrintOptions) {
  const b = getDocBranding();
  const contact = [b.address, b.phone, b.email, b.website].filter(Boolean).map(esc).join(" · ");
  const meta = (opts.meta ?? []).filter(Boolean).map((m) => `<div>${esc(m)}</div>`).join("");
  return `
  <div class="doc-head">
    <div class="doc-brand">
      ${b.logoUrl ? `<img class="doc-logo" src="${esc(b.logoUrl)}" alt="" />` : `<div class="doc-logo doc-logo-fb">${esc((b.company || "S").slice(0, 1).toUpperCase())}</div>`}
      <div class="doc-brand-txt">
        <div class="doc-company">${esc(b.company)}</div>
        ${contact ? `<div class="doc-contact">${contact}</div>` : ""}
        ${b.bin ? `<div class="doc-contact">BIN: ${esc(b.bin)}</div>` : ""}
      </div>
    </div>
    <div class="doc-meta">
      <div class="doc-title">${esc(opts.docTitle ?? opts.title ?? "")}</div>
      ${opts.subtitle ? `<div class="doc-sub">${esc(opts.subtitle)}</div>` : ""}
      ${meta}
    </div>
  </div>`;
}

function brandFooterHtml(opts: PrintOptions) {
  const b = getDocBranding();
  const note = opts.footerNote ?? b.footerNote;
  const right = [b.website, b.phone].filter(Boolean).map(esc).join(" · ");
  return `
  <div class="doc-foot">
    <span>${esc(note)}</span>
    <span>${right}</span>
    <span>${esc(new Date().toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" }))}</span>
  </div>`;
}

const SHELL_CSS = `
  *{box-sizing:border-box}
  body{font:13px/1.45 'Noto Sans Bengali',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;margin:0;padding:24px}
  table{width:100%;border-collapse:collapse} td,th{padding:6px 8px;border:1px solid #e2e8f0;text-align:left;vertical-align:top}
  th{background:#f1f5f9;font-weight:600}
  h1,h2,h3{margin:0 0 8px} .right{text-align:right} .muted{color:#64748b}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;gap:16px}
  .totals td{font-weight:600;background:#f8fafc}
  .sig{margin-top:48px;display:flex;justify-content:space-between} .sig div{border-top:1px solid #94a3b8;padding-top:6px;width:200px;text-align:center}

  /* Branded shell */
  .doc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;
    padding:0 0 10px;border-bottom:2.5px solid #1e1b4b;background:#fff}
  .doc-brand{display:flex;align-items:center;gap:12px;min-width:0}
  .doc-logo{width:46px;height:46px;object-fit:contain;border-radius:9px;flex:0 0 auto}
  .doc-logo-fb{display:flex;align-items:center;justify-content:center;background:#1e1b4b;color:#fff;font-weight:800;font-size:20px}
  .doc-company{font-size:16px;font-weight:800;letter-spacing:-.01em;line-height:1.15}
  .doc-contact{font-size:9.5px;color:#64748b;margin-top:2px;max-width:340px}
  .doc-meta{text-align:right;flex:0 0 auto;font-size:9.5px;color:#64748b}
  .doc-title{font-size:14px;font-weight:800;color:#1e1b4b;letter-spacing:-.01em;text-transform:uppercase}
  .doc-sub{font-size:10px;color:#475569;margin-top:2px}
  .doc-foot{display:flex;justify-content:space-between;gap:12px;font-size:9px;color:#94a3b8;
    padding-top:6px;border-top:1px solid #e2e8f0;background:#fff}
  .doc-body{padding:14px 0 6px}

  @page{margin:12mm 10mm}
  @media print{
    body{padding:0}
    .doc-head{position:fixed;top:0;left:0;right:0}
    .doc-foot{position:fixed;bottom:0;left:0;right:0}
    .doc-body{padding-top:72px;padding-bottom:26px}
    thead{display:table-header-group}
    tr{break-inside:avoid}
  }
`;

export function printHtml(html: string, opts?: PrintOptions) {
  if (typeof window === "undefined") return;
  const o = opts ?? {};
  const branded = o.branded !== false;
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "-10000px";
  iframe.style.bottom = "-10000px";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${esc(o.title ?? "Document")}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;600;800&display=swap" rel="stylesheet" />
    <style>${SHELL_CSS}${o.landscape ? "@page{size:landscape;margin:10mm}" : ""}</style></head>
    <body>${branded ? brandHeaderHtml(o) : ""}<div class="doc-body">${html}</div>${branded ? brandFooterHtml(o) : ""}</body></html>`);
  doc.close();
  const win = iframe.contentWindow!;
  const cleanup = () => setTimeout(() => iframe.remove(), 1000);
  win.onafterprint = cleanup;
  // Give webfonts + logo a moment so the header renders in the print snapshot.
  const fire = () => {
    win.focus();
    win.print();
  };
  const fonts = (doc as any).fonts;
  if (fonts?.ready) fonts.ready.then(() => setTimeout(fire, 250)).catch(() => setTimeout(fire, 400));
  else setTimeout(fire, 400);
}

export function fmtBdt(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return `৳${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(v)}`;
}
