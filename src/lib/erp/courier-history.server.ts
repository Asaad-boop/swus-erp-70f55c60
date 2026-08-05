/**
 * Courier success-rate history (Pathao + BDCourier) with aggressive caching.
 * Server-only: loaded lazily from courier-history.functions.ts.
 */

const CACHE_TTL_HOURS = 24;
const HISTORY_FETCH_TIMEOUT_MS = 7_000;
const TOKEN_TTL_MS = 50 * 60_000;

// In-memory Pathao token cache (per warm worker instance) — avoids a full
// issue-token round-trip for every phone lookup.
const tokenCache = new Map<string, { token: string; exp: number }>();

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HISTORY_FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: init.signal ?? controller.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("Courier history request timed out");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export type ProviderResult = {
  name: string;
  label: string;
  total: number;
  success: number;
  cancelled: number;
  ok: boolean;
  error?: string;
};

export type HistoryData = {
  phone: string;
  found: boolean;
  fetched_at: string;
  providers: ProviderResult[];
  summary: { total: number; success: number; cancelled: number };
};

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("880")) return "0" + digits.slice(3);
  if (digits.length === 10 && digits.startsWith("1")) return "0" + digits;
  return digits;
}

function cachedProvider(data: HistoryData | null, name: string): ProviderResult | null {
  const provider = data?.providers?.find((p) => p.name === name);
  return provider?.ok ? provider : null;
}

function cachedOthers(data: HistoryData | null): ProviderResult[] | null {
  const rows = (data?.providers ?? []).filter((p) => p.name !== "pathao" && p.ok);
  return rows.length > 0 ? rows : null;
}

async function getPathaoToken(supabase: any, brandId: string | null) {
  const key = brandId ?? "default";
  const hit = tokenCache.get(key);
  if (hit && hit.exp > Date.now()) return hit;

  const { loadPathaoCreds } = await import("./pathao.server");
  const creds = await loadPathaoCreds(supabase, brandId);
  const tokenRes = await fetchWithTimeout(`${creds.base_url}/aladdin/api/v1/issue-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      username: creds.username,
      password: creds.password,
      grant_type: "password",
    }),
  });
  if (!tokenRes.ok) throw new Error(`auth ${tokenRes.status}`);
  const tokenJson = (await tokenRes.json()) as { access_token?: string; data?: { access_token?: string } };
  const token = tokenJson.access_token || tokenJson.data?.access_token;
  if (!token) throw new Error("auth: no access_token");
  const entry = { token, exp: Date.now() + TOKEN_TTL_MS };
  tokenCache.set(key, entry);
  return entry;
}

async function fetchPathao(supabase: any, brandId: string | null, phone: string): Promise<ProviderResult> {
  try {
    const { token } = await getPathaoToken(supabase, brandId);
    const res = await fetchWithTimeout("https://merchant.pathao.com/api/v1/user/success", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ phone }),
    });
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 401) tokenCache.delete(brandId ?? "default");
      if (res.status === 403 || /inactive/i.test(text)) {
        throw new Error("Pathao success-rate API access nei (403) — Pathao merchant support e access chan");
      }
      throw new Error(`${res.status}: ${text.slice(0, 120)}`);
    }
    const j = JSON.parse(text);
    const c = j?.data?.customer ?? j?.customer ?? j?.data ?? {};
    const total = Number(c.total_delivery ?? c.total ?? 0);
    const success = Number(c.successful_delivery ?? c.success ?? 0);
    const cancelled = Math.max(0, total - success);
    return { name: "pathao", label: "Pathao", ok: true, total, success, cancelled };
  } catch (e) {
    return {
      name: "pathao",
      label: "Pathao",
      ok: false,
      total: 0,
      success: 0,
      cancelled: 0,
      error: (e as Error).message,
    };
  }
}

function emptyHistory(phone: string): HistoryData {
  return {
    phone,
    found: false,
    fetched_at: new Date().toISOString(),
    providers: [],
    summary: { total: 0, success: 0, cancelled: 0 },
  };
}

async function fetchFresh(
  supabase: any,
  brandId: string | null,
  normalized: string,
  cachedPathao: ProviderResult | null,
  cachedRest: ProviderResult[] | null,
): Promise<HistoryData> {
  const { fetchBdCourierHistory } = await import("./bdcourier.server");
  const [pathao, others] = await Promise.all([
    cachedPathao ?? fetchPathao(supabase, brandId, normalized),
    cachedRest ?? fetchBdCourierHistory(supabase, normalized),
  ]);
  const providers: ProviderResult[] = [pathao, ...others];
  const okRows = providers.filter((p) => p.ok);
  const fresh: HistoryData = {
    phone: normalized,
    found: okRows.reduce((s, p) => s + p.total, 0) > 0,
    fetched_at: new Date().toISOString(),
    providers,
    summary: {
      total: okRows.reduce((s, p) => s + p.total, 0),
      success: okRows.reduce((s, p) => s + p.success, 0),
      cancelled: okRows.reduce((s, p) => s + p.cancelled, 0),
    },
  };
  if (okRows.length > 0) {
    await supabase
      .from("courier_history_cache")
      .upsert({ phone: normalized, data: fresh, fetched_at: fresh.fetched_at }, { onConflict: "phone" });
  }
  return fresh;
}

export async function getCourierHistory(
  supabase: any,
  brandId: string | null,
  phones: string[],
  force: boolean,
): Promise<Record<string, HistoryData>> {
  const results: Record<string, HistoryData> = {};
  const normalizedMap = new Map<string, string>(); // original -> normalized
  const valid: string[] = [];
  for (const p of phones) {
    const n = normalizePhone(p);
    normalizedMap.set(p, n);
    if (!n || n.length < 11) results[p] = emptyHistory(p);
    else if (!valid.includes(n)) valid.push(n);
  }
  if (valid.length === 0) return results;

  // ONE batched cache read for every phone instead of a query per phone.
  const cacheByPhone = new Map<string, { data: HistoryData | null; fetched_at: string | null }>();
  if (!force) {
    const chunks: string[][] = [];
    for (let i = 0; i < valid.length; i += 200) chunks.push(valid.slice(i, i + 200));
    const rows = (
      await Promise.all(
        chunks.map(async (chunk) => {
          const { data } = await supabase
            .from("courier_history_cache")
            .select("phone, data, fetched_at")
            .in("phone", chunk);
          return data ?? [];
        }),
      )
    ).flat();
    rows.forEach((r: any) => cacheByPhone.set(r.phone, { data: r.data ?? null, fetched_at: r.fetched_at ?? null }));
  }

  const byNormalized = new Map<string, HistoryData>();
  const toFetch: Array<{ phone: string; cachedPathao: ProviderResult | null; cachedRest: ProviderResult[] | null }> = [];

  for (const n of valid) {
    const cached = cacheByPhone.get(n);
    const cachedData = cached?.data && cached.fetched_at ? cached.data : null;
    const fresh = cached?.fetched_at
      ? (Date.now() - new Date(cached.fetched_at).getTime()) / 3_600_000 < CACHE_TTL_HOURS
      : false;
    const cachedPathao = fresh ? cachedProvider(cachedData, "pathao") : null;
    const cachedRest = fresh ? cachedOthers(cachedData) : null;
    if (cachedPathao && cachedRest) byNormalized.set(n, cachedData!);
    else toFetch.push({ phone: n, cachedPathao, cachedRest });
  }

  // Warm the Pathao token once so parallel lookups don't each re-authenticate.
  if (toFetch.some((t) => !t.cachedPathao)) {
    try { await getPathaoToken(supabase, brandId); } catch { /* handled per-request */ }
  }

  const CONCURRENCY = 10;
  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const batch = toFetch.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(
      batch.map(async (t) => ({
        phone: t.phone,
        hist: await fetchFresh(supabase, brandId, t.phone, t.cachedPathao, t.cachedRest),
      })),
    );
    settled.forEach(({ phone, hist }) => byNormalized.set(phone, hist));
  }

  for (const [original, n] of normalizedMap) {
    const hist = byNormalized.get(n);
    if (hist) {
      results[original] = hist;
      results[n] = hist;
    }
  }
  return results;
}
