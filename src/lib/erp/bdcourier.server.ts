// Server-only BDCourier (bdcourier.com) client.
// Gives courier-wise success/return history for NON-Pathao couriers
// (Steadfast, RedX, Paperfly, Sundarban, eCourier, Parcelll ...).
// Pathao data always comes from our own Pathao API — never from here.

const BDCOURIER_URL = "https://bdcourier.com/api/courier-check";
const TIMEOUT_MS = 15_000;
const DEFAULT_DAILY_LIMIT = 500;

export const USAGE_KEY_PREFIX = "bdcourier_usage:";
export const LIMIT_KEY = "bdcourier_daily_limit";

export type BdCourierStat = {
  name: string;
  label: string;
  total: number;
  success: number;
  cancelled: number;
  ok: boolean;
  error?: string;
};

const LABELS: Record<string, string> = {
  steadfast: "Steadfast",
  redx: "RedX",
  paperfly: "Paperfly",
  pathao: "Pathao",
  parcelll: "Parcelll",
  sundarban: "Sundarban",
  ecourier: "eCourier",
  rider: "Rider",
  bahok: "Bahok",
  molli: "Molli",
  banglaexpress: "Bangla Express",
};

function label(name: string) {
  return LABELS[name] ?? name.charAt(0).toUpperCase() + name.slice(1);
}

export function todayKey(): string {
  // BD timezone day boundary (UTC+6)
  const d = new Date(Date.now() + 6 * 3600_000);
  return USAGE_KEY_PREFIX + d.toISOString().slice(0, 10);
}

async function readSetting(supabase: any, key: string): Promise<any> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
  if (!data?.value) return null;
  try {
    return JSON.parse(data.value);
  } catch {
    return data.value;
  }
}

async function writeSetting(supabase: any, key: string, value: unknown) {
  await supabase
    .from("app_settings")
    .upsert({ key, value: JSON.stringify(value), updated_at: new Date().toISOString() }, { onConflict: "key" });
}

export async function getBdCourierQuota(supabase: any) {
  const [limitRaw, usedRaw] = await Promise.all([
    readSetting(supabase, LIMIT_KEY),
    readSetting(supabase, todayKey()),
  ]);
  const limit = Number(limitRaw) > 0 ? Number(limitRaw) : DEFAULT_DAILY_LIMIT;
  const used = Number(usedRaw) > 0 ? Number(usedRaw) : 0;
  return { limit, used, remaining: Math.max(0, limit - used), configured: !!process.env.BDCOURIER_API_KEY };
}

async function bumpUsage(supabase: any, by = 1) {
  const key = todayKey();
  const current = Number(await readSetting(supabase, key)) || 0;
  await writeSetting(supabase, key, current + by);
}

/**
 * One BDCourier lookup = 1 quota search, but returns every courier at once.
 * Returns non-Pathao providers only (Pathao comes from our own API).
 */
export async function fetchBdCourierHistory(supabase: any, phone: string): Promise<BdCourierStat[]> {
  const token = process.env.BDCOURIER_API_KEY;
  if (!token) {
    return [
      { name: "bdcourier", label: "Other couriers", ok: false, total: 0, success: 0, cancelled: 0, error: "BDCourier API key set kora nei" },
    ];
  }

  const quota = await getBdCourierQuota(supabase);
  if (quota.remaining <= 0) {
    return [
      {
        name: "bdcourier",
        label: "Other couriers",
        ok: false,
        total: 0,
        success: 0,
        cancelled: 0,
        error: `Ajker BDCourier limit shesh (${quota.used}/${quota.limit})`,
      },
    ];
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BDCOURIER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ phone }),
      signal: controller.signal,
    });
    const text = await res.text();
    await bumpUsage(supabase, 1);

    if (!res.ok) {
      let msg = `${res.status}`;
      try {
        const j = JSON.parse(text);
        msg = j?.message || j?.error || msg;
      } catch { /* ignore */ }
      if (res.status === 401 || res.status === 403) msg = "BDCourier API key invalid ba expired";
      if (res.status === 429) msg = "BDCourier limit/quota shesh";
      throw new Error(msg);
    }

    const j = JSON.parse(text);
    const courierData = j?.courierData ?? j?.data?.courierData ?? j?.data ?? j;
    const out: BdCourierStat[] = [];
    for (const [name, raw] of Object.entries(courierData ?? {})) {
      if (name === "summary" || name === "pathao") continue; // Pathao = own API
      const c = raw as any;
      if (!c || typeof c !== "object") continue;
      const total = Number(c.total_parcel ?? c.total ?? 0) || 0;
      const success = Number(c.success_parcel ?? c.success ?? c.delivered ?? 0) || 0;
      const cancelled = Number(c.cancelled_parcel ?? c.cancel ?? c.cancelled ?? Math.max(0, total - success)) || 0;
      out.push({ name, label: label(name), ok: true, total, success, cancelled });
    }
    return out;
  } catch (e) {
    const msg = (e as Error).name === "AbortError" ? "BDCourier request timed out" : (e as Error).message;
    return [{ name: "bdcourier", label: "Other couriers", ok: false, total: 0, success: 0, cancelled: 0, error: msg }];
  } finally {
    clearTimeout(timer);
  }
}
