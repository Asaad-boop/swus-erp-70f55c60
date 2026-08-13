import { supabase } from "@/integrations/supabase/client";

/* ------------------------------- Routines ------------------------------- */

export type HubRoutine = {
  id: string;
  brand_id: string | null;
  title: string;
  details: string | null;
  cadence: string; // daily | weekly | monthly
  weekday: number | null;
  day_of_month: number | null;
  time_of_day: string | null;
  owner_id: string | null;
  checklist: { text: string; done: boolean }[];
  tags: string[];
  active: boolean;
  last_spawned_on: string | null;
  created_at: string;
};

export const CADENCES = [
  { key: "daily", label: "প্রতিদিন" },
  { key: "weekly", label: "সপ্তাহে একদিন" },
  { key: "monthly", label: "মাসে একদিন" },
] as const;

export const WEEKDAYS = [
  { key: 0, label: "রবি" },
  { key: 1, label: "সোম" },
  { key: 2, label: "মঙ্গল" },
  { key: 3, label: "বুধ" },
  { key: 4, label: "বৃহঃ" },
  { key: 5, label: "শুক্র" },
  { key: 6, label: "শনি" },
] as const;

function brandFilter<T extends { or: (s: string) => T }>(q: T, brandIds: string[]) {
  return brandIds.length === 1 ? q.or(`brand_id.is.null,brand_id.eq.${brandIds[0]}`) : q;
}

export async function fetchRoutines(brandIds: string[]) {
  const q = supabase.from("hub_routines").select("*").order("created_at");
  const { data, error } = await brandFilter(q as never, brandIds);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...(r as unknown as HubRoutine),
    checklist: Array.isArray(r.checklist) ? (r.checklist as HubRoutine["checklist"]) : [],
    tags: (r.tags ?? []) as string[],
  })) as HubRoutine[];
}

/** Does this routine fall on the given date? */
export function routineHitsDate(r: HubRoutine, d: Date) {
  if (!r.active) return false;
  if (r.cadence === "daily") return true;
  if (r.cadence === "weekly") return r.weekday === d.getDay();
  if (r.cadence === "monthly") return r.day_of_month === d.getDate();
  return false;
}

export async function spawnDueRoutines(brandIds: string[]) {
  const { data, error } = await supabase.rpc("hub_spawn_due_routines" as never, {
    _brand_ids: brandIds.length ? brandIds : null,
  } as never);
  if (error) throw error;
  return Number(data ?? 0);
}

/* ------------------------------ Competitors ----------------------------- */

export type HubCompetitor = {
  id: string;
  brand_id: string | null;
  name: string;
  website_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  favicon_url: string | null;
  logo_url: string | null;
  country: string | null;
  price_range: string | null;
  note: string | null;
  tags: string[];
  threat_level: string;
  is_active: boolean;
  last_checked_at: string | null;
  created_at: string;
};

export type HubCompetitorAsset = {
  id: string;
  brand_id: string | null;
  competitor_id: string | null;
  asset_type: string;
  platform: string | null;
  title: string | null;
  url: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  price: number | null;
  offer: string | null;
  hook: string | null;
  note: string | null;
  tags: string[];
  rating: number | null;
  is_favorite: boolean;
  captured_at: string;
};

export const ASSET_TYPES = [
  { key: "ad", label: "Ad" },
  { key: "landing", label: "Landing page" },
  { key: "product", label: "Product page" },
  { key: "organic", label: "Organic post" },
  { key: "creative", label: "Creative" },
] as const;

export const THREAT_LEVELS = [
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
] as const;

export function faviconFor(url: string | null | undefined) {
  if (!url) return null;
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    return `https://www.google.com/s2/favicons?sz=64&domain=${host}`;
  } catch {
    return null;
  }
}

export function hostOf(url: string | null | undefined) {
  if (!url) return "";
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export async function fetchCompetitors(brandIds: string[]) {
  const q = supabase.from("hub_competitors").select("*").order("created_at", { ascending: false });
  const { data, error } = await brandFilter(q as never, brandIds);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...(r as unknown as HubCompetitor),
    tags: (r.tags ?? []) as string[],
  })) as HubCompetitor[];
}

export async function fetchCompetitorAssets(brandIds: string[]) {
  const q = supabase
    .from("hub_competitor_assets")
    .select("*")
    .order("captured_at", { ascending: false })
    .limit(400);
  const { data, error } = await brandFilter(q as never, brandIds);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...(r as unknown as HubCompetitorAsset),
    tags: (r.tags ?? []) as string[],
    price: r.price == null ? null : Number(r.price),
  })) as HubCompetitorAsset[];
}

/* ---------------------------- Capture tokens ---------------------------- */

export type HubCaptureToken = {
  id: string;
  label: string;
  token_hint: string;
  default_brand_id: string | null;
  is_active: boolean;
  last_used_at: string | null;
  use_count: number;
  created_at: string;
};

export async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function fetchCaptureTokens() {
  const { data, error } = await supabase
    .from("hub_capture_tokens")
    .select("id,label,token_hint,default_brand_id,is_active,last_used_at,use_count,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as HubCaptureToken[];
}

export async function createCaptureToken(label: string, brandId: string | null) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");
  const token = randomToken();
  const token_hash = await sha256Hex(token);
  const { error } = await supabase.from("hub_capture_tokens").insert({
    user_id: uid,
    label,
    token_hash,
    token_hint: `${token.slice(0, 4)}…${token.slice(-4)}`,
    default_brand_id: brandId,
  } as never);
  if (error) throw error;
  return token;
}
