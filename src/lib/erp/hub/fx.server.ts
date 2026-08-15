/** Currency → BDT conversion for the Synq capture extension (server only). */

/** Static fallback rates (1 unit of currency → BDT). Used when live FX fails. */
const FALLBACK: Record<string, number> = {
  BDT: 1,
  USD: 122,
  PKR: 0.44,
  INR: 1.42,
  CNY: 17,
  EUR: 133,
  GBP: 156,
  AED: 33.2,
  SAR: 32.5,
  MYR: 27.5,
  THB: 3.5,
  SGD: 92,
  AUD: 80,
  CAD: 88,
  TRY: 3.1,
  IDR: 0.0075,
  VND: 0.0048,
  JPY: 0.8,
  KRW: 0.09,
  NPR: 0.9,
  LKR: 0.41,
};

export const SUPPORTED_CURRENCIES = Object.keys(FALLBACK);

/** Normalise loose currency text/symbols into an ISO code. */
export function normalizeCurrency(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase();
  if (FALLBACK[s]) return s;
  if (/৳|TK|TAKA|BDT/.test(s)) return "BDT";
  if (/RS\.?|PKR|RUPEE|₨/.test(s)) return "PKR";
  if (/₹|INR/.test(s)) return "INR";
  if (/¥|CNY|RMB|元/.test(s)) return "CNY";
  if (/\$|USD/.test(s)) return "USD";
  if (/€|EUR/.test(s)) return "EUR";
  if (/£|GBP/.test(s)) return "GBP";
  if (/AED|DIRHAM/.test(s)) return "AED";
  if (/RM|MYR/.test(s)) return "MYR";
  return null;
}

type Cache = { at: number; rates: Record<string, number> };
let cache: Cache | null = null;
const TTL = 6 * 60 * 60 * 1000; // 6h

/** All rates as "1 <ccy> = N BDT". Live source with static fallback. */
export async function bdtRates(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.at < TTL) return cache.rates;
  const rates: Record<string, number> = { ...FALLBACK };
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/BDT", {
      signal: AbortSignal.timeout(4000),
    });
    const j = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (j?.result === "success" && j.rates) {
      for (const code of Object.keys(FALLBACK)) {
        const perBdt = Number(j.rates[code]);
        if (Number.isFinite(perBdt) && perBdt > 0) rates[code] = 1 / perBdt;
      }
      rates["BDT"] = 1;
    }
  } catch {
    /* keep fallback */
  }
  cache = { at: Date.now(), rates };
  return rates;
}

export async function toBdt(price: number | null, currency: string | null) {
  const ccy = normalizeCurrency(currency) ?? "BDT";
  if (price == null || !Number.isFinite(price) || price <= 0) {
    return { bdt: null as number | null, rate: null as number | null, currency: ccy };
  }
  const rates = await bdtRates();
  const rate = rates[ccy] ?? FALLBACK[ccy] ?? 1;
  return { bdt: Math.round(price * rate * 100) / 100, rate, currency: ccy };
}
