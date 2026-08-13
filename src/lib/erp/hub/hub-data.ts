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
