/**
 * Pathao merchant-panel "paid invoice" puller.
 *
 * Pathao's public Aladdin API exposes no payout-invoice endpoint — invoices
 * live behind the merchant portal. The portal's Vue bundle uses:
 *   POST /api/v1/login                                   -> access_token
 *   GET  /api/v1/monetary/invoices/receivable            -> invoice list
 *   GET  /api/v1/monetary/invoices/{id}/export-csv       -> the same CSV the
 *                                                           "Download" button
 *                                                           produces
 * We reuse exactly those, then merge every invoice CSV inside the requested
 * date range into one CSV so the existing parser/preview/apply flow is unchanged.
 */

type Creds = { username: string; password: string; store_id: number };

export type FetchAttempt = { path: string; status: number | string; snippet: string };

const TIMEOUT_MS = 30_000;
const BASE = "https://merchant.pathao.com";

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function merchantLogin(creds: Creds): Promise<string> {
  const res = await fetchWithTimeout(`${BASE}/api/v1/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username: creds.username.trim().toLowerCase(), password: creds.password }),
  });
  const txt = await res.text();
  if (!res.ok) {
    if (res.status === 429) throw new Error("Pathao merchant login rate limit — 1-2 minute pore try korun.");
    throw new Error(`Pathao merchant login failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  let j: any = null;
  try { j = JSON.parse(txt); } catch { /* ignore */ }
  const token = j?.access_token || j?.data?.access_token;
  if (!token) throw new Error("Pathao merchant login: access_token pawa jayni");
  return token as string;
}

function authGet(token: string, path: string) {
  return fetchWithTimeout(`${BASE}${path}`, {
    method: "GET",
    headers: {
      Accept: "text/csv, application/json, */*",
      Authorization: `Bearer ${token}`,
      "X-Requested-With": "XMLHttpRequest",
    },
  });
}

function asList(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (Array.isArray(v?.data)) return v.data;
  if (Array.isArray(v?.data?.data)) return v.data.data;
  return [];
}

function pickDate(row: any): string | null {
  for (const k of ["invoice_created_at", "invoice_date", "payment_date", "created_at", "date", "transaction_date", "updated_at"]) {
    const v = row?.[k];
    if (typeof v === "string" && /\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  }
  return null;
}

function pickId(row: any): string | null {
  for (const k of ["order_invoice_id", "invoice_id", "id", "invoice_no", "invoiceId", "hash_id"]) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).length) return String(v);
  }
  return null;
}

function looksLikeCsv(text: string) {
  const head = text.slice(0, 500).toLowerCase();
  return head.includes(",") && (head.includes("consignment") || head.includes("collected"));
}

/** Merge CSVs: keep the first header, append the data rows of the rest. */
function mergeCsv(parts: string[]): string {
  const out: string[] = [];
  let header: string | null = null;
  for (const p of parts) {
    const lines = p.split(/\r?\n/).filter((l) => l.trim().length);
    if (!lines.length) continue;
    if (header === null) {
      header = lines[0];
      out.push(...lines);
    } else {
      out.push(...lines.slice(lines[0].trim() === header.trim() ? 1 : 0));
    }
  }
  return out.join("\n");
}

export async function fetchPathaoInvoiceCsv(
  creds: Creds,
  from: string,
  to: string,
): Promise<{ csv: string | null; invoiceIds: string[]; attempts: FetchAttempt[] }> {
  const token = await merchantLogin(creds);
  const attempts: FetchAttempt[] = [];

  // 1) Invoice list. The endpoint IGNORES date params and always returns the
  //    full history, newest first, 10 per page. So we page until the oldest
  //    invoice on a page falls before `from` (or we hit total_page).
  const invoices: any[] = [];
  let totalPage = 1;
  for (let page = 1; page <= totalPage && page <= 200; page++) {
    const path = `/api/v1/monetary/invoices/receivable?page=${page}`;
    const res = await authGet(token, path);
    const txt = await res.text();
    if (page === 1 || !res.ok) {
      attempts.push({ path, status: res.status, snippet: txt.slice(0, 160).replace(/\s+/g, " ") });
    }
    if (!res.ok) break;
    let j: any = null;
    try { j = JSON.parse(txt); } catch { break; }
    const tp = Number(j?.data?.total_page ?? j?.total_page ?? 1);
    if (Number.isFinite(tp) && tp > 0) totalPage = tp;
    const list = asList(j);
    if (!list.length) break;
    invoices.push(...list);
    const oldest = pickDate(list[list.length - 1]);
    if (oldest && oldest < from) break;
  }

  // 2) Keep invoices whose date falls in range (list may ignore date params).
  const inRange = invoices.filter((row) => {
    const d = pickDate(row);
    return !d || (d >= from && d <= to);
  });

  // 3) Per-invoice CSV export (small concurrency — a month can be 80+ invoices).
  const ids = inRange.map(pickId).filter((v): v is string => !!v);
  const csvParts: string[] = [];
  const invoiceIds: string[] = [];

  const grabOne = async (id: string) => {
    const path = `/api/v1/monetary/invoices/${encodeURIComponent(id)}/export-csv`;
    const res = await authGet(token, path);
    const txt = await res.text();
    if (!res.ok) {
      attempts.push({ path, status: res.status, snippet: txt.slice(0, 120).replace(/\s+/g, " ") });
      return;
    }
    if (looksLikeCsv(txt)) {
      csvParts.push(txt);
      invoiceIds.push(id);
      return;
    }
    // Some builds answer with { data: { url } } pointing at the generated file.
    try {
      const j = JSON.parse(txt);
      const url: string | undefined = j?.data?.url ?? j?.url ?? j?.data?.file ?? j?.data?.download_url;
      if (url && /^https?:\/\//.test(url)) {
        const r2 = await fetchWithTimeout(url);
        const t2 = await r2.text();
        if (r2.ok && looksLikeCsv(t2)) {
          csvParts.push(t2);
          invoiceIds.push(id);
          return;
        }
        attempts.push({ path: url, status: r2.status, snippet: t2.slice(0, 120).replace(/\s+/g, " ") });
      }
    } catch {
      attempts.push({ path, status: res.status, snippet: txt.slice(0, 120).replace(/\s+/g, " ") });
    }
  };

  const POOL = 5;
  for (let i = 0; i < ids.length; i += POOL) {
    await Promise.all(ids.slice(i, i + POOL).map(grabOne));
  }
  attempts.push({
    path: `invoices in ${from}..${to}`,
    status: "info",
    snippet: `listed ${invoices.length}, in-range ${inRange.length}, csv fetched ${invoiceIds.length}`,
  });

  return { csv: csvParts.length ? mergeCsv(csvParts) : null, invoiceIds, attempts };
}
