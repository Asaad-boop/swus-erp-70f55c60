import { supabase } from "@/integrations/supabase/client";

/* ---------------- Types ---------------- */

export type IntakeRow = {
  product_id: string;
  title: string;
  sku: string | null;
  image: string | null;
  brand_id: string | null;
  price: number | null;
  stock: number;
  phase: "in_stock" | "in_transit";
  since: string;
  incoming_qty: number;
  po_numbers: string[];
  content_count: number;
  published_count: number;
  plan_id: string | null;
  plan_target: number | null;
};

export type ContentPlan = {
  id: string;
  brand_id: string | null;
  product_id: string | null;
  idea_id: string | null;
  title: string;
  target_count: number;
  target_date: string | null;
  budget: number;
  strategy: string | null;
  status: string;
  created_at: string;
};

export type ContentItem = {
  id: string;
  brand_id: string | null;
  plan_id: string | null;
  media_plan_id: string | null;
  product_id: string | null;
  creator_id: string | null;
  agency_id: string | null;
  code: string;
  title: string;
  content_type: string;
  platform: string;
  source: string;
  angle: string | null;
  hook: string | null;
  script: string | null;
  caption: string | null;
  cta: string | null;
  hashtags: string | null;
  reference_urls: string[];
  due_date: string | null;
  cost: number;
  stage: string;
  status: string;
  revision_note: string | null;
  video_url: string | null;
  published_url: string | null;
  published_at: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  attributed_orders: number;
  created_at: string;
};

export type MediaPlan = {
  id: string;
  brand_id: string | null;
  product_id: string | null;
  plan_id: string | null;
  title: string;
  target_qty: number;
  selling_price: number;
  ad_budget: number;
  content_budget: number;
  creator_budget: number;
  channels: string[];
  audience: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

export type ContentBrief = {
  id: string;
  brand_id: string | null;
  media_plan_id: string | null;
  item_id: string | null;
  creator_id: string | null;
  agency_id: string | null;
  deliverable_type: string;
  hook: string | null;
  script: string | null;
  cta: string | null;
  reference_url: string | null;
  due_date: string | null;
  cost: number;
  approval_status: string;
  revision_note: string | null;
  notes: string | null;
  created_at: string;
};

export type Agency = {
  id: string;
  brand_id: string | null;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  services: string[];
  retainer_fee: number;
  commission_pct: number;
  rating: number | null;
  status: string;
  notes: string | null;
  created_at: string;
};

export type Creator = {
  id: string;
  brand_id: string | null;
  name: string;
  handle: string | null;
  platform: string;
  followers: number | null;
  niche: string | null;
  rate: number;
  min_charge: number;
  max_charge: number;
  contact: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  agency_id: string | null;
  negotiation_status: string;
  profile_url: string | null;
  performance_note: string | null;
  rating: number | null;
  status: string;
  tags: string[] | null;
  created_at: string;
};

export type CreatorContact = {
  id: string;
  creator_id: string;
  brand_id: string | null;
  channel: string;
  direction: string;
  summary: string;
  outcome: string | null;
  quoted_amount: number | null;
  next_follow_up: string | null;
  created_at: string;
};

export type Shipment = {
  id: string;
  brand_id: string | null;
  creator_id: string;
  product_id: string | null;
  item_id: string | null;
  qty: number;
  courier: string | null;
  tracking_no: string | null;
  sent_date: string | null;
  delivered_date: string | null;
  status: string;
  cost: number;
  notes: string | null;
  created_at: string;
};

/* ---------------- Option lists ---------------- */

export const CONTENT_TYPES = [
  { key: "ugc", label: "UGC" },
  { key: "reel", label: "Reel / Short" },
  { key: "static", label: "Static creative" },
  { key: "unboxing", label: "Unboxing" },
  { key: "review", label: "Review" },
  { key: "photoshoot", label: "Photoshoot" },
] as const;

export const CONTENT_SOURCES = [
  { key: "in_house", label: "In-house" },
  { key: "creator", label: "Creator" },
  { key: "agency", label: "Agency" },
] as const;

export const PLATFORMS = [
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube" },
  { key: "website", label: "Website" },
] as const;

export const PIPELINE_STAGES = [
  { key: "ideation", label: "Ideation" },
  { key: "create", label: "Create / Shoot" },
  { key: "editing", label: "Editing" },
  { key: "published", label: "Published" },
  { key: "performance", label: "Performance" },
] as const;

export const ITEM_STATUSES = [
  { key: "briefed", label: "Briefed" },
  { key: "shooting", label: "Shooting" },
  { key: "editing", label: "Editing" },
  { key: "submitted", label: "Submitted" },
  { key: "in_review", label: "In review" },
  { key: "approved", label: "Approved" },
  { key: "published", label: "Published" },
  { key: "rejected", label: "Rejected" },
] as const;

export const APPROVAL_STATUSES = [
  { key: "pending", label: "Pending" },
  { key: "briefed", label: "Briefed" },
  { key: "in_review", label: "In review" },
  { key: "revision", label: "Revision" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
] as const;

export const NEGOTIATION_STATUSES = [
  { key: "new", label: "New lead" },
  { key: "contacted", label: "Contacted" },
  { key: "negotiating", label: "Negotiating" },
  { key: "agreed", label: "Agreed" },
  { key: "working", label: "Working" },
  { key: "declined", label: "Declined" },
] as const;

export const SHIPMENT_STATUSES = [
  { key: "pending", label: "Pending" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
  { key: "returned", label: "Returned" },
] as const;

/* ---------------- Helpers ---------------- */

export function bdt(n: number) {
  return `৳${Math.round(Number(n) || 0).toLocaleString("en-BD")}`;
}

export function labelOf(list: readonly { key: string; label: string }[], key: string) {
  return list.find((l) => l.key === key)?.label ?? key;
}

/** Elapsed time since a timestamp, in ms. */
export function elapsedMs(since: string | null | undefined, now = Date.now()) {
  if (!since) return 0;
  const t = new Date(since).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, now - t);
}

export function fmtElapsed(ms: number) {
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  const m = Math.floor(ms / 60_000);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

/** green < 24h, amber < 72h, red after. */
export function idleTone(ms: number, hasContent: boolean) {
  if (hasContent) return "ok";
  const h = ms / 3_600_000;
  if (h < 24) return "ok";
  if (h < 72) return "warn";
  return "bad";
}

export const IDLE_TONE_CLASS: Record<string, string> = {
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  bad: "border-destructive/30 bg-destructive/10 text-destructive",
};

function brandFilter<T extends { or: (s: string) => T; eq: (a: string, b: string) => T }>(
  q: T,
  brandIds: string[],
) {
  if (brandIds.length === 1) return q.or(`brand_id.is.null,brand_id.eq.${brandIds[0]}`);
  return q;
}

/* ---------------- Fetchers ---------------- */

export async function fetchIntake(brandIds: string[]) {
  const { data, error } = await supabase.rpc("content_intake_feed" as never, {
    _brand_ids: brandIds,
  } as never);
  if (error) throw error;
  return ((data ?? []) as IntakeRow[]).map((r) => ({
    ...r,
    price: r.price == null ? null : Number(r.price),
    stock: Number(r.stock ?? 0),
    incoming_qty: Number(r.incoming_qty ?? 0),
    content_count: Number(r.content_count ?? 0),
    published_count: Number(r.published_count ?? 0),
    po_numbers: r.po_numbers ?? [],
  }));
}

export async function fetchPlans(brandIds: string[]) {
  let q = supabase.from("content_plans").select("*").order("created_at", { ascending: false });
  q = brandFilter(q as never, brandIds) as never;
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as ContentPlan[];
}

export async function fetchItems(brandIds: string[]) {
  let q = supabase.from("content_items").select("*").order("created_at", { ascending: false });
  q = brandFilter(q as never, brandIds) as never;
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as ContentItem[]).map((i) => ({
    ...i,
    reference_urls: i.reference_urls ?? [],
    cost: Number(i.cost ?? 0),
  }));
}

export async function fetchMediaPlans(brandIds: string[]) {
  let q = supabase
    .from("content_media_plans")
    .select("*")
    .order("created_at", { ascending: false });
  q = brandFilter(q as never, brandIds) as never;
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as MediaPlan[]).map((p) => ({
    ...p,
    channels: p.channels ?? [],
    target_qty: Number(p.target_qty ?? 0),
    selling_price: Number(p.selling_price ?? 0),
    ad_budget: Number(p.ad_budget ?? 0),
    content_budget: Number(p.content_budget ?? 0),
    creator_budget: Number(p.creator_budget ?? 0),
  }));
}

export async function fetchBriefs(brandIds: string[]) {
  let q = supabase.from("content_briefs").select("*").order("created_at", { ascending: false });
  q = brandFilter(q as never, brandIds) as never;
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as ContentBrief[]).map((b) => ({
    ...b,
    cost: Number(b.cost ?? 0),
  }));
}

export async function fetchAgencies(brandIds: string[]) {
  let q = supabase.from("content_agencies").select("*").order("name");
  q = brandFilter(q as never, brandIds) as never;
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as Agency[]).map((a) => ({
    ...a,
    services: a.services ?? [],
    retainer_fee: Number(a.retainer_fee ?? 0),
    commission_pct: Number(a.commission_pct ?? 0),
  }));
}

export async function fetchCreators(brandIds: string[]) {
  let q = supabase.from("hub_creators").select("*").order("name");
  q = brandFilter(q as never, brandIds) as never;
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as Creator[]).map((c) => ({
    ...c,
    rate: Number(c.rate ?? 0),
    min_charge: Number(c.min_charge ?? 0),
    max_charge: Number(c.max_charge ?? 0),
  }));
}

export async function fetchCreatorContacts(creatorIds: string[]) {
  const map = new Map<string, CreatorContact[]>();
  if (creatorIds.length === 0) return map;
  const { data, error } = await supabase
    .from("content_creator_contacts")
    .select("*")
    .in("creator_id", creatorIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  for (const c of (data ?? []) as unknown as CreatorContact[]) {
    const arr = map.get(c.creator_id) ?? [];
    arr.push(c);
    map.set(c.creator_id, arr);
  }
  return map;
}

export async function fetchShipments(brandIds: string[]) {
  let q = supabase
    .from("content_creator_shipments")
    .select("*")
    .order("created_at", { ascending: false });
  q = brandFilter(q as never, brandIds) as never;
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as Shipment[]).map((s) => ({
    ...s,
    qty: Number(s.qty ?? 1),
    cost: Number(s.cost ?? 0),
  }));
}

export type ProductLite = {
  id: string;
  title: string;
  sku: string | null;
  image: string | null;
  price: number | null;
  stock: number;
};

export async function fetchProductsLite(brandIds: string[]) {
  let q = supabase.from("products").select("id,title,sku,image,price,stock").order("title").limit(600);
  if (brandIds.length === 1) q = q.eq("brand_id", brandIds[0]);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((p) => ({
    id: String(p.id),
    title: String(p.title ?? ""),
    sku: (p.sku as string) ?? null,
    image: (p.image as string) ?? null,
    price: p.price == null ? null : Number(p.price),
    stock: Number(p.stock ?? 0),
  })) as ProductLite[];
}

/** Inspiration references saved from Product Scraping (hub_product_ideas). */
export type Inspiration = {
  id: string;
  title: string;
  image_url: string | null;
  source_url: string | null;
  video_url: string | null;
};

export async function fetchInspirations(brandIds: string[]) {
  let q = supabase
    .from("hub_product_ideas")
    .select("id,title,image_url,source_url,video_url")
    .order("created_at", { ascending: false })
    .limit(60);
  q = brandFilter(q as never, brandIds) as never;
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as Inspiration[];
}
/* ---------------- Derived metrics (v2) ---------------- */

/**
 * Content risk score 0..100 — higher means the product urgently needs creative.
 * Blends idle time, stock value at risk and existing coverage.
 */
export function contentRiskScore(row: {
  since: string | null;
  stock: number;
  incoming_qty: number;
  price: number | null;
  content_count: number;
  published_count: number;
  plan_target: number | null;
}, now = Date.now()) {
  const days = elapsedMs(row.since, now) / 86_400_000;
  const idle = Math.min(45, days * 1.5); // up to 45 pts after ~30 days
  const value = (row.stock + row.incoming_qty) * (row.price ?? 0);
  const valuePts = Math.min(30, Math.log10(Math.max(1, value)) * 6); // up to 30 pts
  const target = Math.max(1, row.plan_target ?? 3);
  const coverage = Math.min(1, row.content_count / target);
  const gapPts = (1 - coverage) * 20;
  const publishedPenalty = row.published_count > 0 ? -8 : 0;
  return Math.max(0, Math.min(100, Math.round(idle + valuePts + gapPts + publishedPenalty)));
}

export function riskTone(score: number): "good" | "warn" | "bad" {
  if (score >= 70) return "bad";
  if (score >= 40) return "warn";
  return "good";
}

export type CoverageBucket = "none" | "under" | "covered";

export function coverageBucket(contentCount: number, target: number | null): CoverageBucket {
  const t = Math.max(1, target ?? 3);
  if (contentCount <= 0) return "none";
  if (contentCount < t) return "under";
  return "covered";
}

/** Engagement rate for a published item. */
export function engagementRate(i: { views: number; likes: number; comments: number; shares: number }) {
  const v = Number(i.views ?? 0);
  if (v <= 0) return 0;
  return (Number(i.likes ?? 0) + Number(i.comments ?? 0) + Number(i.shares ?? 0)) / v;
}

/** Cost per attributed order; null when there are no orders. */
export function costPerOrder(cost: number, orders: number) {
  const o = Number(orders ?? 0);
  if (o <= 0) return null;
  return Number(cost ?? 0) / o;
}

export function mediaPlanEconomics(p: {
  target_qty: number;
  selling_price: number;
  ad_budget: number;
  content_budget: number;
  creator_budget: number;
}) {
  const totalBudget = p.ad_budget + p.content_budget + p.creator_budget;
  const revenue = p.target_qty * p.selling_price;
  const breakEvenRoas = totalBudget > 0 ? revenue / totalBudget : 0;
  const cac = p.target_qty > 0 ? totalBudget / p.target_qty : 0;
  const grossProfit = revenue - totalBudget;
  const margin = revenue > 0 ? grossProfit / revenue : 0;
  return { totalBudget, revenue, breakEvenRoas, cac, grossProfit, margin };
}

export function daysUntil(date: string | null | undefined, now = Date.now()) {
  if (!date) return null;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now) / 86_400_000);
}

export function dueTone(days: number | null): "good" | "warn" | "bad" | "default" {
  if (days == null) return "default";
  if (days < 0) return "bad";
  if (days <= 2) return "warn";
  return "good";
}
