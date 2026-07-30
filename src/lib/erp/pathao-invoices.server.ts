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

/** Short-lived token cache — the login endpoint rate-limits aggressively. */
const tokenCache = new Map<string, { token: string; exp: number }>();

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
  const cacheKey = creds.username.trim().toLowerCase();
  const hit = tokenCache.get(cacheKey);
  if (hit && hit.exp > Date.now()) return hit.token;
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
  tokenCache.set(cacheKey, { token: token as string, exp: Date.now() + 10 * 60_000 });
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

function pickNum(row: any, keys: string[]): number | null {
  for (const k of keys) {
    const v = row?.[k];
    const n = typeof v === "string" ? Number(v.replace(/[^0-9.\-]/g, "")) : Number(v);
    if (v !== undefined && v !== null && v !== "" && Number.isFinite(n)) return n;
  }
  return null;
}

export type PathaoInvoiceSummary = {
  id: string;
  date: string | null;
  invoiceNo: string | null;
  collected: number | null;
  fee: number | null;
  payout: number | null;
  orders: number | null;
  status: string | null;
};

/** List every payout invoice in the date range (no CSV download). */
export async function listPathaoInvoices(
  creds: Creds,
  from: string,
  to: string,
): Promise<{ invoices: PathaoInvoiceSummary[]; attempts: FetchAttempt[] }> {
  const token = await merchantLogin(creds);
  const attempts: FetchAttempt[] = [];
  const rows: any[] = [];
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
    rows.push(...list);
    const oldest = pickDate(list[list.length - 1]);
    if (oldest && oldest < from) break;
  }

  const invoices = rows
    .filter((r) => {
      const d = pickDate(r);
      return !d || (d >= from && d <= to);
    })
    .map((r): PathaoInvoiceSummary | null => {
      const id = pickId(r);
      if (!id) return null;
      const collected = pickNum(r, ["total_collected_amount", "collected_amount", "total_collected", "collected"]);
      const fee = pickNum(r, ["total_delivery_charge", "total_fee", "delivery_charge", "charge", "fee"]);
      const payout = pickNum(r, ["receivable_amount", "total_receivable", "payable_amount", "net_amount", "amount", "total_amount"]);
      return {
        id,
        date: pickDate(r),
        invoiceNo: (r?.invoice_no ?? r?.invoice_id ?? r?.hash_id ?? null) as string | null,
        collected,
        fee: fee ?? (collected != null && payout != null ? +(collected - payout).toFixed(2) : null),
        payout,
        orders: pickNum(r, ["total_order", "order_count", "total_orders", "total_consignment"]),
        status: (r?.status_text ?? r?.status ?? null) as string | null,
      };
    })
    .filter((v): v is PathaoInvoiceSummary => !!v);

  attempts.push({
    path: `invoices in ${from}..${to}`,
    status: "info",
    snippet: `listed ${rows.length}, in-range ${invoices.length}`,
  });
  return { invoices, attempts };
}

/** Download the CSV of one invoice. */
export async function fetchOnePathaoInvoiceCsv(
  creds: Creds,
  invoiceId: string,
): Promise<{ csv: string | null; attempts: FetchAttempt[] }> {
  const token = await merchantLogin(creds);
  const attempts: FetchAttempt[] = [];
  const path = `/api/v1/monetary/invoices/${encodeURIComponent(invoiceId)}/export-csv`;
  const res = await authGet(token, path);
  const txt = await res.text();
  if (res.ok && looksLikeCsv(txt)) return { csv: txt, attempts };
  attempts.push({ path, status: res.status, snippet: txt.slice(0, 160).replace(/\s+/g, " ") });
  try {
    const j = JSON.parse(txt);
    const url: string | undefined = j?.data?.url ?? j?.url ?? j?.data?.file ?? j?.data?.download_url;
    if (url && /^https?:\/\//.test(url)) {
      const r2 = await fetchWithTimeout(url);
      const t2 = await r2.text();
      if (r2.ok && looksLikeCsv(t2)) return { csv: t2, attempts };
      attempts.push({ path: url, status: r2.status, snippet: t2.slice(0, 160).replace(/\s+/g, " ") });
    }
  } catch { /* not JSON */ }
  return { csv: null, attempts };
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
