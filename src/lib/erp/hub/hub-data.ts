import { supabase } from "@/integrations/supabase/client";

export type HubGoal = {
  id: string;
  brand_id: string | null;
  parent_id: string | null;
  kind: string;
  title: string;
  description: string | null;
  period_start: string;
  period_end: string;
  metric_key: string | null;
  target_value: number;
  current_value: number;
  unit: string;
  owner: string | null;
  status: string;
  sort_order: number;
  created_at: string;
};

export type HubTask = {
  id: string;
  brand_id: string | null;
  goal_id: string | null;
  title: string;
  details: string | null;
  assignee_id: string | null;
  due_date: string | null;
  priority: string;
  status: string;
  link_type: string | null;
  link_id: string | null;
  link_label: string | null;
  recurrence: string;
  checklist: { text: string; done: boolean }[];
  tags: string[];
  position: number;
  completed_at: string | null;
  created_at: string;
};

export const METRIC_OPTIONS = [
  { key: "manual", label: "Manual (নিজে update করব)", unit: "number" },
  { key: "delivered_revenue", label: "Delivered revenue", unit: "bdt" },
  { key: "orders", label: "Total orders", unit: "number" },
  { key: "delivered_orders", label: "Delivered orders", unit: "number" },
  { key: "ad_spend", label: "Ad spend", unit: "bdt" },
] as const;

export const TASK_STATUSES = [
  { key: "backlog", label: "Backlog" },
  { key: "todo", label: "To do" },
  { key: "doing", label: "In progress" },
  { key: "blocked", label: "Blocked" },
  { key: "done", label: "Done" },
] as const;

export const TASK_PRIORITIES = [
  { key: "low", label: "Low" },
  { key: "normal", label: "Normal" },
  { key: "high", label: "High" },
  { key: "urgent", label: "Urgent" },
] as const;

export function fmtValue(value: number, unit: string) {
  if (unit === "bdt") return `৳${Math.round(value).toLocaleString("en-BD")}`;
  if (unit === "percent") return `${value.toFixed(1)}%`;
  return Math.round(value).toLocaleString("en-BD");
}

export async function fetchGoals(brandIds: string[]) {
  let q = supabase.from("hub_goals").select("*").order("sort_order").order("created_at");
  if (brandIds.length === 1) q = q.or(`brand_id.is.null,brand_id.eq.${brandIds[0]}`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as HubGoal[];
}

export async function fetchGoalActuals(brandIds: string[]) {
  const { data, error } = await supabase.rpc("hub_goal_actuals" as never, {
    _brand_ids: brandIds,
  } as never);
  if (error) throw error;
  const map = new Map<string, number>();
  for (const row of (data ?? []) as { goal_id: string; actual: number }[]) {
    map.set(row.goal_id, Number(row.actual ?? 0));
  }
  return map;
}

export async function fetchTasks(brandIds: string[]) {
  let q = supabase.from("hub_tasks").select("*").order("position").order("created_at");
  if (brandIds.length === 1) q = q.or(`brand_id.is.null,brand_id.eq.${brandIds[0]}`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((t) => ({
    ...(t as unknown as HubTask),
    checklist: Array.isArray((t as { checklist?: unknown }).checklist)
      ? ((t as unknown as { checklist: HubTask["checklist"] }).checklist ?? [])
      : [],
    tags: ((t as unknown as { tags?: string[] }).tags ?? []) as string[],
  })) as HubTask[];
}

export type HubIdea = {
  id: string;
  brand_id: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  images: string[];
  source_url: string | null;
  video_url?: string | null;
  supplier_name: string | null;
  supplier_url: string | null;
  category: string | null;
  est_unit_cost: number;
  est_sell_price: number;
  moq: number | null;
  status: string;
  tags: string[];
  notes: string | null;
  target_price_min: number | null;
  target_price_max: number | null;
  approved_by: string | null;
  approved_at: string | null;
  decision_note: string | null;
  selected_quote_id: string | null;
  ordered_at: string | null;
  order_qty: number | null;
  order_unit_price: number | null;
  imp_po_id?: string | null;
  sourcing_owner?: string | null;
  next_action_at?: string | null;
  next_action_note?: string | null;
  priority?: string | null;
  created_by: string | null;
  created_at: string;
};

export type HubIdeaForecast = {
  idea_id: string;
  monthly_units: number;
  sell_price: number;
  unit_cost: number;
  ad_cost_per_order: number;
  courier_cost: number;
  packaging_cost: number;
  return_rate: number;
  notes: string | null;
};

export type HubIdeaSummary = {
  idea_id: string;
  up_votes: number;
  down_votes: number;
  score: number;
  voters: number;
  avg_rating: number | null;
  rating_count: number;
  quote_count: number;
  best_landed_cost: number | null;
  monthly_profit: number | null;
  breakeven_roas: number | null;
};

export type HubVote = {
  id: string;
  idea_id: string;
  user_id: string;
  vote: number;
  rating: number | null;
  comment: string | null;
};

export type HubSourcingQuote = {
  id: string;
  idea_id: string;
  supplier_name: string;
  supplier_url: string | null;
  contact: string | null;
  platform: string;
  unit_price_cny: number;
  cny_rate: number;
  moq: number | null;
  lead_time_days: number | null;
  shipping_mode: string;
  shipping_cost_per_unit: number;
  sample_status: string;
  sample_cost?: number;
  sample_tracking?: string | null;
  sample_received_at?: string | null;
  quality_rating: number | null;
  status: string;
  notes: string | null;
  created_at: string;
};

/** Landed per-unit cost in BDT for a supplier quote. */
export function quoteLandedCost(q: {
  unit_price_cny: number;
  cny_rate: number;
  shipping_cost_per_unit: number;
}) {
  return Number(q.unit_price_cny || 0) * Number(q.cny_rate || 0) + Number(q.shipping_cost_per_unit || 0);
}

export async function fetchSourcingQuotes(ideaIds: string[]) {
  const map = new Map<string, HubSourcingQuote[]>();
  if (ideaIds.length === 0) return map;
  const { data, error } = await supabase
    .from("hub_sourcing_quotes")
    .select("*")
    .in("idea_id", ideaIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  for (const raw of (data ?? []) as unknown as HubSourcingQuote[]) {
    const q: HubSourcingQuote = {
      ...raw,
      unit_price_cny: Number(raw.unit_price_cny ?? 0),
      cny_rate: Number(raw.cny_rate ?? 0),
      shipping_cost_per_unit: Number(raw.shipping_cost_per_unit ?? 0),
      sample_cost: Number(raw.sample_cost ?? 0),
    };
    const arr = map.get(q.idea_id) ?? [];
    arr.push(q);
    map.set(q.idea_id, arr);
  }
  return map;
}

export const IDEA_STATUSES = [
  { key: "idea", label: "Idea" },
  { key: "voting", label: "Voting" },
  { key: "approved", label: "Approved" },
  { key: "sourcing", label: "Sourcing" },
  { key: "ordered", label: "Ordered" },
  { key: "launched", label: "Launched" },
  { key: "rejected", label: "Rejected" },
] as const;

/** Funnel display order: voting first, all-status chip goes last in UI. */
export const IDEA_FUNNEL_ORDER = [
  "voting",
  "idea",
  "approved",
  "sourcing",
  "ordered",
  "launched",
  "rejected",
] as const;

export type HubIdeaVoter = {
  user_id: string;
  name: string;
  vote: number;
  rating: number | null;
  comment: string | null;
};

export type HubIdeaPeople = {
  idea_id: string;
  created_by: string | null;
  created_by_name: string | null;
  voters: HubIdeaVoter[];
};

export async function fetchIdeaPeople(ideaIds: string[]) {
  const map = new Map<string, HubIdeaPeople>();
  if (ideaIds.length === 0) return map;
  const { data, error } = await supabase.rpc("hub_idea_people" as never, {
    _idea_ids: ideaIds,
  } as never);
  if (error) throw error;
  for (const row of (data ?? []) as HubIdeaPeople[]) {
    map.set(row.idea_id, { ...row, voters: (row.voters ?? []) as HubIdeaVoter[] });
  }
  return map;
}

export async function fetchIdeas(brandIds: string[]) {
  let q = supabase
    .from("hub_product_ideas")
    .select("*")
    .order("created_at", { ascending: false });
  if (brandIds.length === 1) q = q.or(`brand_id.is.null,brand_id.eq.${brandIds[0]}`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...(r as unknown as HubIdea),
    tags: ((r as unknown as { tags?: string[] }).tags ?? []) as string[],
    images: ((r as unknown as { images?: string[] }).images ?? []) as string[],
  })) as HubIdea[];
}

export async function fetchIdeaSummaries(brandIds: string[]) {
  const { data, error } = await supabase.rpc("hub_idea_summary" as never, {
    _brand_ids: brandIds,
  } as never);
  if (error) throw error;
  const map = new Map<string, HubIdeaSummary>();
  for (const row of (data ?? []) as HubIdeaSummary[]) {
    map.set(row.idea_id, {
      ...row,
      avg_rating: row.avg_rating == null ? null : Number(row.avg_rating),
      best_landed_cost: row.best_landed_cost == null ? null : Number(row.best_landed_cost),
      monthly_profit: row.monthly_profit == null ? null : Number(row.monthly_profit),
      breakeven_roas: row.breakeven_roas == null ? null : Number(row.breakeven_roas),
    });
  }
  return map;
}

export async function fetchMyVotes() {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return new Map<string, HubVote>();
  const { data, error } = await supabase.from("hub_idea_votes").select("*").eq("user_id", uid);
  if (error) throw error;
  const map = new Map<string, HubVote>();
  for (const v of (data ?? []) as unknown as HubVote[]) map.set(v.idea_id, v);
  return map;
}

export async function fetchForecasts(ideaIds: string[]) {
  if (ideaIds.length === 0) return new Map<string, HubIdeaForecast>();
  const { data, error } = await supabase
    .from("hub_idea_forecast")
    .select("*")
    .in("idea_id", ideaIds);
  if (error) throw error;
  const map = new Map<string, HubIdeaForecast>();
  for (const f of (data ?? []) as unknown as HubIdeaForecast[]) map.set(f.idea_id, f);
  return map;
}

/* ---------------- Phase 3: Content Journey ---------------- */

export type HubCreator = {
  id: string;
  brand_id: string | null;
  name: string;
  handle: string | null;
  platform: string;
  followers: number | null;
  niche: string | null;
  rate: number;
  contact: string | null;
  profile_url: string | null;
  performance_note: string | null;
  status: string;
  created_at: string;
};

export type HubContentPlan = {
  id: string;
  brand_id: string | null;
  product_id: string | null;
  idea_id: string | null;
  title: string;
  angle: string | null;
  platform: string;
  asset_type: string;
  owner_id: string | null;
  budget: number;
  launch_date: string | null;
  deadline: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

export type HubContentAssignment = {
  id: string;
  plan_id: string;
  creator_id: string | null;
  deliverable: string | null;
  agreed_budget: number;
  actual_cost: number;
  deadline: string | null;
  status: string;
  result_url: string | null;
  notes: string | null;
  created_at: string;
};

export const CONTENT_STATUSES = [
  { key: "planned", label: "Planned" },
  { key: "briefing", label: "Briefing" },
  { key: "shooting", label: "Shooting" },
  { key: "editing", label: "Editing" },
  { key: "scheduled", label: "Scheduled" },
  { key: "live", label: "Live" },
  { key: "cancelled", label: "Cancelled" },
] as const;

export const ASSIGNMENT_STATUSES = [
  { key: "briefed", label: "Briefed" },
  { key: "shooting", label: "Shooting" },
  { key: "delivered", label: "Delivered" },
  { key: "posted", label: "Posted" },
  { key: "cancelled", label: "Cancelled" },
] as const;

export const CONTENT_PLATFORMS = [
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube" },
  { key: "website", label: "Website" },
] as const;

export const ASSET_TYPES = [
  { key: "photoshoot", label: "Photoshoot" },
  { key: "ugc", label: "UGC" },
  { key: "reel", label: "Reel / Short" },
  { key: "review", label: "Influencer review" },
  { key: "unboxing", label: "Unboxing" },
  { key: "static", label: "Static creative" },
] as const;

export async function fetchContentPlans(brandIds: string[]) {
  let q = supabase
    .from("hub_content_plans")
    .select("*")
    .order("created_at", { ascending: false });
  if (brandIds.length === 1) q = q.or(`brand_id.is.null,brand_id.eq.${brandIds[0]}`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as HubContentPlan[];
}

export async function fetchCreators(brandIds: string[]) {
  let q = supabase.from("hub_creators").select("*").order("name");
  if (brandIds.length === 1) q = q.or(`brand_id.is.null,brand_id.eq.${brandIds[0]}`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as HubCreator[];
}

export async function fetchAssignments(planIds: string[]) {
  if (planIds.length === 0) return [] as HubContentAssignment[];
  const { data, error } = await supabase
    .from("hub_content_assignments")
    .select("*")
    .in("plan_id", planIds)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as unknown as HubContentAssignment[];
}

export async function fetchProductOptions(brandIds: string[]) {
  let q = supabase.from("products").select("id,title").order("title").limit(500);
  if (brandIds.length === 1) q = q.eq("brand_id", brandIds[0]);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as { id: string; title: string }[]).map((p) => ({
    id: p.id,
    name: p.title,
  }));
}

/* ---------------- Phase 5: Monthly Planning ---------------- */

export type HubPlanProductRow = {
  product_id: string;
  title: string;
  sku: string | null;
  image: string | null;
  stock: number;
  hist_units: number;
  hist_revenue: number;
  hist_profit: number;
  mtd_units: number;
  mtd_revenue: number;
  mtd_profit: number;
  run_rate_units: number;
  planned_units: number | null;
  planned_price: number | null;
  planned_unit_cost: number | null;
  note: string | null;
  proj_units: number;
  proj_price: number;
  proj_cost: number;
  proj_revenue: number;
  proj_profit: number;
  days_of_stock: number | null;
};

export type HubProjection = {
  month: string;
  days_total: number;
  days_done: number;
  products: HubPlanProductRow[];
  sourcing: { po_count: number; units: number; value: number };
  new_products: number;
};

export type HubMonthPlan = {
  id: string;
  brand_id: string | null;
  month: string;
  target_revenue: number;
  target_profit: number;
  target_new_products: number;
  target_order_qty: number;
  target_order_value: number;
  notes: string | null;
};

export function monthStart(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, (m ?? 1) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function fetchProjection(brandIds: string[], month: string) {
  const { data, error } = await supabase.rpc("hub_month_projection" as never, {
    _brand_ids: brandIds,
    _month: month,
  } as never);
  if (error) throw error;
  const raw = (data ?? {}) as Partial<HubProjection>;
  return {
    month,
    days_total: Number(raw.days_total ?? 30),
    days_done: Number(raw.days_done ?? 1),
    products: (raw.products ?? []).map((p) => ({
      ...p,
      hist_units: Number(p.hist_units ?? 0),
      hist_revenue: Number(p.hist_revenue ?? 0),
      hist_profit: Number(p.hist_profit ?? 0),
      mtd_units: Number(p.mtd_units ?? 0),
      mtd_revenue: Number(p.mtd_revenue ?? 0),
      mtd_profit: Number(p.mtd_profit ?? 0),
      run_rate_units: Number(p.run_rate_units ?? 0),
      proj_units: Number(p.proj_units ?? 0),
      proj_price: Number(p.proj_price ?? 0),
      proj_cost: Number(p.proj_cost ?? 0),
      proj_revenue: Number(p.proj_revenue ?? 0),
      proj_profit: Number(p.proj_profit ?? 0),
      stock: Number(p.stock ?? 0),
      days_of_stock: p.days_of_stock == null ? null : Number(p.days_of_stock),
    })) as HubPlanProductRow[],
    sourcing: {
      po_count: Number(raw.sourcing?.po_count ?? 0),
      units: Number(raw.sourcing?.units ?? 0),
      value: Number(raw.sourcing?.value ?? 0),
    },
    new_products: Number(raw.new_products ?? 0),
  } satisfies HubProjection;
}

export async function fetchMonthPlan(brandId: string | null, month: string) {
  let q = supabase.from("hub_month_plans").select("*").eq("month", month);
  q = brandId ? q.eq("brand_id", brandId) : q.is("brand_id", null);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as HubMonthPlan | null;
}

export async function saveMonthPlan(
  brandId: string | null,
  month: string,
  patch: Partial<HubMonthPlan>,
) {
  const { error } = await supabase
    .from("hub_month_plans")
    .upsert({ brand_id: brandId, month, ...patch } as never, {
      onConflict: "brand_id,month",
    });
  if (error) throw error;
}

export async function savePlanOverride(
  brandId: string | null,
  month: string,
  productId: string,
  patch: { planned_units?: number | null; planned_price?: number | null; planned_unit_cost?: number | null },
) {
  const { error } = await supabase
    .from("hub_plan_products")
    .upsert({ brand_id: brandId, month, product_id: productId, ...patch } as never, {
      onConflict: "brand_id,month,product_id",
    });
  if (error) throw error;
}

export async function clearPlanOverride(brandId: string | null, month: string, productId: string) {
  let q = supabase.from("hub_plan_products").delete().eq("month", month).eq("product_id", productId);
  q = brandId ? q.eq("brand_id", brandId) : q.is("brand_id", null);
  const { error } = await q;
  if (error) throw error;
}
