// Server-only Pathao API client.
// Imported lazily inside server function handlers — never from client code.

export type PathaoCreds = {
  base_url: string;
  client_id: string;
  client_secret: string;
  username: string;
  password: string;
  store_id: number;
};

const tokenCache = new Map<string, { access_token: string; expires_at: number }>();
const tokenInflight = new Map<string, Promise<{ access_token: string; expires_at: number }>>();
const merchantTokenCache = new Map<string, { access_token: string; expires_at: number }>();
const merchantTokenInflight = new Map<string, Promise<{ access_token: string; expires_at: number }>>();
const FETCH_TIMEOUT_MS = 12_000;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: init.signal ?? controller.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new Error("Pathao request timed out");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// In-memory caches for geo lookups. Pathao city/zone/area lists are huge but
// nearly static — caching them per worker process eliminates the biggest
// per-order latency in bulk uploads.
const TTL = 1000 * 60 * 60 * 6; // 6h
const geoCache = new Map<string, { value: any; expires_at: number }>();
const inflight = new Map<string, Promise<any>>();

async function memo<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const c = geoCache.get(key);
  if (c && c.expires_at > Date.now()) return c.value as T;
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = (async () => {
    try {
      const v = await loader();
      geoCache.set(key, { value: v, expires_at: Date.now() + TTL });
      return v;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

async function issueToken(creds: PathaoCreds) {
  const res = await fetchWithTimeout(`${creds.base_url}/aladdin/api/v1/issue-token`, {
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
  if (!res.ok) {
    const txt = await res.text();
    if (res.status === 429) {
      throw new Error("Pathao rate limit hoyeche. 1-2 minute pore abar try koro.");
    }
    throw new Error(`Pathao auth failed (${res.status}): ${txt.slice(0, 240)}`);
  }
  const j: any = await res.json();
  const access = j.access_token || j.data?.access_token;
  const expires = (j.expires_in || j.data?.expires_in || 3600) as number;
  if (!access) throw new Error("Pathao auth: no access_token in response");
  return { access_token: access, expires_at: Date.now() + (expires - 60) * 1000 };
}

async function getToken(creds: PathaoCreds): Promise<string> {
  const key = `${creds.base_url}::${creds.client_id}::${creds.username}`;
  const c = tokenCache.get(key);
  if (c && c.expires_at > Date.now()) return c.access_token;
  const existing = tokenInflight.get(key);
  if (existing) return (await existing).access_token;
  const pending = issueToken(creds);
  tokenInflight.set(key, pending);
  const t = await pending.finally(() => tokenInflight.delete(key));
  tokenCache.set(key, t);
  return t.access_token;
}

async function issueMerchantToken(creds: PathaoCreds) {
  // Pathao's merchant-panel APIs (including /api/v1/address-parser) do not
  // reliably accept the Aladdin `/issue-token` OAuth token. The Vue merchant
  // portal logs in with this endpoint, stores `data.access_token`, then calls
  // the address parser with `Authorization: Bearer <that-token>`. Using the
  // same token source is what makes our detected city/zone/area match Pathao's
  // reception/new-delivery form exactly.
  const res = await fetchWithTimeout("https://merchant.pathao.com/api/v1/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      username: creds.username.trim().toLowerCase(),
      password: creds.password,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    if (res.status === 429) {
      throw new Error("Pathao merchant login rate limit hoyeche. 1-2 minute pore abar try koro.");
    }
    throw new Error(`Pathao merchant login failed (${res.status}): ${txt.slice(0, 240)}`);
  }
  const j: any = await res.json();
  const access = j.access_token || j.data?.access_token;
  const expires = Number(j.expires_in || j.data?.expires_in || 3600);
  if (!access) throw new Error("Pathao merchant login: no access_token in response");
  return { access_token: access, expires_at: Date.now() + (Math.max(expires, 120) - 60) * 1000 };
}

async function getMerchantToken(creds: PathaoCreds): Promise<string> {
  const key = `merchant::${creds.username}`;
  const c = merchantTokenCache.get(key);
  if (c && c.expires_at > Date.now()) return c.access_token;
  const existing = merchantTokenInflight.get(key);
  if (existing) return (await existing).access_token;
  const pending = issueMerchantToken(creds);
  merchantTokenInflight.set(key, pending);
  const t = await pending.finally(() => merchantTokenInflight.delete(key));
  merchantTokenCache.set(key, t);
  return t.access_token;
}

export function createPathaoClient(creds: PathaoCreds) {
  async function callBase<T = any>(baseUrl: string, path: string, init: RequestInit = {}, tokenKind: "aladdin" | "merchant" = "aladdin"): Promise<T> {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const cacheKey = tokenKind === "merchant"
      ? `merchant::${creds.username}`
      : `${creds.base_url}::${creds.client_id}::${creds.username}`;
    const getAuthToken = () => tokenKind === "merchant" ? getMerchantToken(creds) : getToken(creds);
    const clearAuthToken = () => {
      if (tokenKind === "merchant") merchantTokenCache.delete(cacheKey);
      else tokenCache.delete(cacheKey);
    };
    const doFetch = async (tok: string) =>
      fetchWithTimeout(`${baseUrl}${normalizedPath}`, {
        ...init,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${tok}`,
          ...(init.headers || {}),
        },
      });
    let res = await doFetch(await getAuthToken());
    if (res.status === 401) {
      clearAuthToken();
      res = await doFetch(await getAuthToken());
    }
    // Retry-on-429 with exponential backoff. Pathao rate-limits burst traffic
    // (bulk courier sync) — retry a few times before surfacing the error.
    let attempt = 0;
    while (res.status === 429 && attempt < 3) {
      const wait = 1500 * Math.pow(2, attempt) + Math.floor(Math.random() * 400);
      await new Promise((r) => setTimeout(r, wait));
      res = await doFetch(await getAuthToken());
      attempt++;
    }
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
    if (!res.ok) {
      const baseMsg = json?.message || json?.error || text || `Pathao error ${res.status}`;
      // Pathao 422 returns { message: "Please fix the given errors", errors: { field: ["..."] } }
      // Surface those field-level errors so the user can actually fix the order.
      let detail = "";
      if (json?.errors && typeof json.errors === "object") {
        const parts: string[] = [];
        for (const [k, v] of Object.entries(json.errors)) {
          const val = Array.isArray(v) ? v.join(", ") : String(v);
          parts.push(`${k}: ${val}`);
        }
        if (parts.length) detail = ` — ${parts.join(" | ")}`;
      }
      const msg = `${typeof baseMsg === "string" ? baseMsg : JSON.stringify(baseMsg)}${detail}`;
      if (res.status === 429) {
        throw new Error("Pathao rate limit hoyeche. 1-2 minute pore abar try koro.");
      }
      if (res.status === 412 && /criminal activity/i.test(msg)) {
        throw new Error(
          "[PATHAO_CUSTOMER_BLOCKED] Pathao এই customer number-এ booking block করেছে (previous criminal activity)। Customer-এর verified অন্য number থাকলে order-এ update করুন, নাহলে অন্য courier ব্যবহার করুন।",
        );
      }
      throw new Error(`Pathao ${path} failed (${res.status}): ${msg.slice(0, 480)}`);
    }
    return (json?.data ?? json) as T;
  }

  async function call<T = any>(path: string, init: RequestInit = {}): Promise<T> {
    return callBase<T>(creds.base_url, path, init);
  }

  async function merchantCall<T = any>(path: string, init: RequestInit = {}): Promise<T> {
    return callBase<T>("https://merchant.pathao.com", path, init, "merchant");
  }

  return {
    storeId: creds.store_id,
    cities: async () =>
      memo(`cities::${creds.base_url}::${creds.client_id}`, async () => {
        const d: any = await call("/aladdin/api/v1/city-list");
        return d?.data ?? d ?? [];
      }),
    zones: async (cityId: number) =>
      memo(`zones::${creds.base_url}::${creds.client_id}::${cityId}`, async () => {
        const d: any = await call(`/aladdin/api/v1/cities/${cityId}/zone-list`);
        return d?.data ?? d ?? [];
      }),
    areas: async (zoneId: number) =>
      memo(`areas::${creds.base_url}::${creds.client_id}::${zoneId}`, async () => {
        const d: any = await call(`/aladdin/api/v1/zones/${zoneId}/area-list`);
        return d?.data ?? d ?? [];
      }),
    price: (input: Record<string, unknown>) => call("/aladdin/api/v1/merchant/price-plan", { method: "POST", body: JSON.stringify(input) }),
    createOrder: (input: Record<string, unknown>) => call("/aladdin/api/v1/orders", { method: "POST", body: JSON.stringify(input) }),
    track: (consignmentId: string) => call(`/aladdin/api/v1/orders/${consignmentId}/info`),
    /**
     * Pathao's own merchant-portal "customer info" lookup. Given a phone
     * number, returns the last-used recipient name, address, city/zone/area
     * IDs and the customer's success ratio — exactly what the Pathao
     * dashboard pre-fills when an operator types a phone in "New Delivery".
     * Endpoint is officially documented under the Aladdin/Merchant API.
     */
    lookupCustomer: async (phone: string) => {
      try {
        return await call("/aladdin/api/v1/user/info", {
          method: "POST",
          body: JSON.stringify({ phone }),
        });
      } catch (e) {
        // 404 / "customer not found" — perfectly normal for a new buyer.
        return null;
      }
    },
    /**
     * Same address parser used by the Pathao Merchant "New Delivery" form.
     * It is different from our local city/zone/area list matching: Pathao's
     * backend returns district/city, zone and area for the typed recipient
     * address, so our preview mirrors what Pathao itself would show.
     */
    parseAddress: async (address: string) => {
      const trimmed = address.trim();
      if (trimmed.length < 10) return null;
      const qs = new URLSearchParams({ address: trimmed }).toString();
      try {
        return await merchantCall(`/api/v1/address-parser?${qs}`, { method: "GET" });
      } catch (firstError) {
        try {
          return await merchantCall("/api/v1/address-parser", {
            method: "POST",
            body: JSON.stringify({ address: trimmed }),
          });
        } catch {
          throw firstError;
        }
      }
    },
  };
}

function envCreds(): PathaoCreds | null {
  const cid = process.env.PATHAO_CLIENT_ID;
  const cs = process.env.PATHAO_CLIENT_SECRET;
  const u = process.env.PATHAO_USERNAME;
  const p = process.env.PATHAO_PASSWORD;
  const sid = Number(process.env.PATHAO_STORE_ID);
  if (!cid || !cs || !u || !p || !sid) return null;
  return {
    base_url: process.env.PATHAO_BASE_URL || "https://api-hermes.pathao.com",
    client_id: cid, client_secret: cs, username: u, password: p, store_id: sid,
  };
}

export async function loadPathaoCreds(supabase: any, brandId?: string | null): Promise<PathaoCreds> {
  // Prefer service-role client so admin-only RLS on erp_courier_settings still
  // works for non-admin operations users. Fall back to the caller's client if
  // the service-role env isn't configured (dev/preview).
  let client: any = supabase;
  try {
    const { tryGetSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    client = tryGetSupabaseAdmin() ?? client;
  } catch {
    // fall back to caller's client
  }
  // Fetch all active pathao rows; pick brand-specific row first, otherwise
  // share credentials from any other brand and only swap store_id when the
  // requested brand has its own row with just a store_id set.
  const { data: rows, error } = await client
    .from("erp_courier_settings")
    .select("brand_id, base_url, client_id, client_secret, username, password, store_id, is_active")
    .eq("provider", "pathao")
    .eq("is_active", true);
  let list: any[] = Array.isArray(rows) ? rows : [];
  // Non-admin staff (operations / CS / warehouse) can't read erp_courier_settings
  // directly under RLS. When the direct read is blocked or empty, fall back to the
  // role-gated security-definer RPC so booking/geo lookups still work for them.
  if (error || list.length === 0) {
    const { data: rpcRows, error: rpcError } = await supabase.rpc("get_courier_creds", {
      _provider: "pathao",
      _brand_id: brandId ?? null,
    });
    if (Array.isArray(rpcRows) && rpcRows.length > 0) {
      list = rpcRows;
    } else if (error && rpcError) {
      throw error;
    }
  }
  const isComplete = (r: any) =>
    r && r.client_id && r.client_secret && r.username && r.password && r.store_id;

  const brandRow = brandId ? list.find((r) => r.brand_id === brandId) : null;
  const fallback =
    list.find((r) => isComplete(r) && (!brandId || r.brand_id !== brandId)) ||
    list.find(isComplete);

  // 1) Brand row has full creds → use it.
  if (brandRow && isComplete(brandRow)) {
    return {
      base_url: brandRow.base_url || "https://api-hermes.pathao.com",
      client_id: brandRow.client_id,
      client_secret: brandRow.client_secret,
      username: brandRow.username,
      password: brandRow.password,
      store_id: Number(brandRow.store_id),
    };
  }
  // 2) Brand row has only store_id (partial) → borrow creds from fallback, use brand's store_id.
  if (brandRow && brandRow.store_id && fallback) {
    return {
      base_url: brandRow.base_url || fallback.base_url || "https://api-hermes.pathao.com",
      client_id: fallback.client_id,
      client_secret: fallback.client_secret,
      username: fallback.username,
      password: fallback.password,
      store_id: Number(brandRow.store_id),
    };
  }
  // 3) No brand row → use any active complete row as-is.
  if (fallback) {
    return {
      base_url: fallback.base_url || "https://api-hermes.pathao.com",
      client_id: fallback.client_id,
      client_secret: fallback.client_secret,
      username: fallback.username,
      password: fallback.password,
      store_id: Number(fallback.store_id),
    };
  }
  const env = envCreds();
  if (env) return env;
  throw new Error("Pathao credentials are not configured. Add them in Courier → Settings.");
}