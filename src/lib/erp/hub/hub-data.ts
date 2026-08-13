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
  source_url: string | null;
  supplier_name: string | null;
  supplier_url: string | null;
  category: string | null;
  est_unit_cost: number;
  est_sell_price: number;
  moq: number | null;
  status: string;
  tags: string[];
  notes: string | null;
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
  monthly_profit: number | null;
  breakeven_roas: number | null;
};

export type HubVote = {
  id: string;
  idea_id: string;
  user_id: string;
  vote: number;
  comment: string | null;
};

export const IDEA_STATUSES = [
  { key: "idea", label: "Idea" },
  { key: "voting", label: "Voting" },
  { key: "approved", label: "Approved" },
  { key: "sourcing", label: "Sourcing" },
  { key: "ordered", label: "Ordered" },
  { key: "launched", label: "Launched" },
  { key: "rejected", label: "Rejected" },
] as const;

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
