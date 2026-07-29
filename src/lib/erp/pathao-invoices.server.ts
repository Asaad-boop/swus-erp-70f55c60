/**
 * Pathao merchant-panel "paid invoice" puller.
 *
 * Pathao's public Aladdin API has no payout-invoice endpoint — the CSV lives
 * behind the merchant portal (Payments → Download paid invoice CSV). The Vue
 * portal logs in via /api/v1/login and then hits one of the payment/invoice
 * export endpoints below. Endpoint naming has changed between portal releases,
 * so we probe a candidate list and return whichever one answers with CSV.
 *
 * Every attempt is reported back (status + short snippet) so the operator can
 * see exactly what Pathao said if none of them work.
 */

type Creds = {
  username: string;
  password: string;
  store_id: number;
};

export type FetchAttempt = { path: string; status: number | string; snippet: string };

const TIMEOUT_MS = 30_000;

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
  const res = await fetchWithTimeout("https://merchant.pathao.com/api/v1/login", {
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

function looksLikeCsv(text: string) {
  const head = text.slice(0, 400).toLowerCase();
  return head.includes("consignment") && head.includes(",");
}

/** Candidate export endpoints, newest portal naming first. */
function candidates(from: string, to: string, storeId: number): string[] {
  const q = (extra: Record<string, string> = {}) =>
    new URLSearchParams({ start_date: from, end_date: to, from, to, ...extra }).toString();
  return [
    `/api/v1/payment/invoice/export?${q()}`,
    `/api/v1/payments/export?${q()}`,
    `/api/v1/payment/export?${q()}`,
    `/api/v1/invoice/export?${q()}`,
    `/api/v1/payments/paid-invoice/export?${q()}`,
    `/api/v1/payment/invoice/download?${q()}`,
    `/api/v1/finance/payment/export?${q()}`,
    `/api/v1/payment/invoice/export?${q({ store_id: String(storeId) })}`,
    `/api/v1/payments?${q({ page: "1", per_page: "500" })}`,
    `/api/v1/payment/invoice?${q({ page: "1", per_page: "500" })}`,
  ];
}

export async function fetchPathaoInvoiceCsv(
  creds: Creds,
  from: string,
  to: string,
): Promise<{ csv: string | null; endpoint: string | null; attempts: FetchAttempt[] }> {
  const token = await merchantLogin(creds);
  const attempts: FetchAttempt[] = [];

  for (const path of candidates(from, to, creds.store_id)) {
    let res: Response;
    try {
      res = await fetchWithTimeout(`https://merchant.pathao.com${path}`, {
        method: "GET",
        headers: {
          Accept: "text/csv, application/json, */*",
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (e: any) {
      attempts.push({ path, status: "network", snippet: String(e?.message ?? e).slice(0, 120) });
      continue;
    }
    const text = await res.text();
    attempts.push({ path, status: res.status, snippet: text.slice(0, 120).replace(/\s+/g, " ") });
    if (!res.ok) continue;
    if (looksLikeCsv(text)) return { csv: text, endpoint: path, attempts };

    // Some builds return { data: { url: "https://.../invoice.csv" } }
    try {
      const j = JSON.parse(text);
      const url: string | undefined =
        j?.data?.url ?? j?.data?.file ?? j?.url ?? j?.file ?? j?.data?.download_url;
      if (url && /^https?:\/\//.test(url)) {
        const r2 = await fetchWithTimeout(url);
        const t2 = await r2.text();
        attempts.push({ path: url, status: r2.status, snippet: t2.slice(0, 120).replace(/\s+/g, " ") });
        if (r2.ok && looksLikeCsv(t2)) return { csv: t2, endpoint: url, attempts };
      }
    } catch { /* not json */ }
  }

  return { csv: null, endpoint: null, attempts };
}
