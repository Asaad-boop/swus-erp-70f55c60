import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Phase 6 — Budgets, Calendar & Experiments. */

export type MktBudgetRow = {
  id: string;
  brand_id: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  name: string;
  period_start: string;
  period_end: string;
  planned_spend: number;
  target_revenue: number;
  target_roas: number | null;
  scaling_status: string;
  notes: string | null;
  actual_spend: number;
  actual_revenue: number;
  delivered_orders: number;
  utilization: number;
  remaining: number;
  actual_roas: number;
};

export type MktCalendarEvent = {
  id: string;
  brand_id: string | null;
  title: string;
  event_type: string;
  start_date: string;
  end_date: string | null;
  owner: string | null;
  status: string;
  color: string | null;
  notes: string | null;
};

export type MktExperiment = {
  id: string;
  brand_id: string | null;
  name: string;
  test_type: string;
  hypothesis: string | null;
  variant_a: string | null;
  variant_b: string | null;
  metric: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  result_a: number | null;
  result_b: number | null;
  winner: string | null;
  learning: string | null;
  decision: string | null;
};

const Range = z.object({
  brandIds: z.array(z.string().uuid()).min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const getBudgets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Range.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("mkt_budget_status", {
      _brand_ids: data.brandIds,
      _from: data.from,
      _to: data.to,
    } as never);
    if (error) throw error;
    return (Array.isArray(rows) ? rows : []) as MktBudgetRow[];
  });

const BudgetInput = z.object({
  id: z.string().uuid().optional(),
  brandId: z.string().uuid().nullable(),
  campaignId: z.string().uuid().nullable(),
  name: z.string().min(1).max(200),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  plannedSpend: z.number().min(0),
  targetRevenue: z.number().min(0),
  targetRoas: z.number().min(0).max(1000).nullable(),
  scalingStatus: z.enum(["scale", "hold", "kill"]),
  notes: z.string().max(2000).nullable(),
});

export const saveBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BudgetInput.parse(d))
  .handler(async ({ data, context }) => {
    const row = {
      brand_id: data.brandId,
      campaign_id: data.campaignId,
      name: data.name,
      period_start: data.periodStart,
      period_end: data.periodEnd,
      planned_spend: data.plannedSpend,
      target_revenue: data.targetRevenue,
      target_roas: data.targetRoas,
      scaling_status: data.scalingStatus,
      notes: data.notes,
      updated_at: new Date().toISOString(),
    };
    const sb = context.supabase;
    const { error } = data.id
      ? await sb.from("mkt_budgets").update(row as never).eq("id", data.id)
      : await sb.from("mkt_budgets").insert(row as never);
    if (error) throw error;
    return { ok: true };
  });

export const getCalendarEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Range.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("mkt_calendar_events")
      .select("*")
      .in("brand_id", data.brandIds)
      .lte("start_date", data.to)
      .or(`end_date.gte.${data.from},end_date.is.null`)
      .order("start_date", { ascending: true })
      .limit(500);
    if (error) throw error;
    return (rows ?? []) as unknown as MktCalendarEvent[];
  });

const EventInput = z.object({
  id: z.string().uuid().optional(),
  brandId: z.string().uuid().nullable(),
  title: z.string().min(1).max(200),
  eventType: z.string().min(1).max(50),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  owner: z.string().max(120).nullable(),
  status: z.enum(["planned", "in_progress", "done", "cancelled"]),
  notes: z.string().max(2000).nullable(),
});

export const saveCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => EventInput.parse(d))
  .handler(async ({ data, context }) => {
    const row = {
      brand_id: data.brandId,
      title: data.title,
      event_type: data.eventType,
      start_date: data.startDate,
      end_date: data.endDate,
      owner: data.owner,
      status: data.status,
      notes: data.notes,
      updated_at: new Date().toISOString(),
    };
    const sb = context.supabase;
    const { error } = data.id
      ? await sb.from("mkt_calendar_events").update(row as never).eq("id", data.id)
      : await sb.from("mkt_calendar_events").insert(row as never);
    if (error) throw error;
    return { ok: true };
  });

export const getExperiments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ brandIds: z.array(z.string().uuid()).min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("mkt_experiments")
      .select("*")
      .in("brand_id", data.brandIds)
      .order("start_date", { ascending: false, nullsFirst: false })
      .limit(300);
    if (error) throw error;
    return (rows ?? []) as unknown as MktExperiment[];
  });

const ExperimentInput = z.object({
  id: z.string().uuid().optional(),
  brandId: z.string().uuid().nullable(),
  name: z.string().min(1).max(200),
  testType: z.string().min(1).max(50),
  hypothesis: z.string().max(2000).nullable(),
  variantA: z.string().max(500).nullable(),
  variantB: z.string().max(500).nullable(),
  metric: z.string().min(1).max(50),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  status: z.enum(["planned", "running", "completed", "abandoned"]),
  resultA: z.number().nullable(),
  resultB: z.number().nullable(),
  winner: z.string().max(20).nullable(),
  learning: z.string().max(2000).nullable(),
  decision: z.string().max(2000).nullable(),
});

export const saveExperiment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ExperimentInput.parse(d))
  .handler(async ({ data, context }) => {
    const row = {
      brand_id: data.brandId,
      name: data.name,
      test_type: data.testType,
      hypothesis: data.hypothesis,
      variant_a: data.variantA,
      variant_b: data.variantB,
      metric: data.metric,
      start_date: data.startDate,
      end_date: data.endDate,
      status: data.status,
      result_a: data.resultA,
      result_b: data.resultB,
      winner: data.winner,
      learning: data.learning,
      decision: data.decision,
      updated_at: new Date().toISOString(),
    };
    const sb = context.supabase;
    const { error } = data.id
      ? await sb.from("mkt_experiments").update(row as never).eq("id", data.id)
      : await sb.from("mkt_experiments").insert(row as never);
    if (error) throw error;
    return { ok: true };
  });

export const deletePlanningRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        table: z.enum(["mkt_budgets", "mkt_calendar_events", "mkt_experiments"]),
        id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from(data.table).delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });