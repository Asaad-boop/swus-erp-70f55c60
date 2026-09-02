/**
 * Growth Lab data layer — experiments + learning database.
 * Pure CRUD over hub_experiments / hub_learnings (staff-scoped RLS).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Experiment = {
  id: string;
  brand_id: string | null;
  title: string;
  hypothesis: string | null;
  product_id: string | null;
  variable: string | null;
  variant_a: string | null;
  variant_b: string | null;
  budget: number;
  start_date: string | null;
  end_date: string | null;
  status: string;
  result: string | null;
  winner: string | null;
  learning: string | null;
  created_at: string;
};

export type Learning = {
  id: string;
  brand_id: string | null;
  experiment_id: string | null;
  insight: string;
  category: string | null;
  tags: string[];
  confidence: string;
  created_at: string;
};

const EXP_COLS =
  "id,brand_id,title,hypothesis,product_id,variable,variant_a,variant_b,budget,start_date,end_date,status,result,winner,learning,created_at";

export const listExperiments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandIds: string[] }) => d)
  .handler(async ({ data, context }): Promise<Experiment[]> => {
    const { data: rows, error } = await context.supabase
      .from("hub_experiments")
      .select(EXP_COLS)
      .in("brand_id", data.brandIds)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return ((rows as any[]) ?? []).map((r) => ({ ...r, budget: Number(r.budget) || 0 })) as Experiment[];
  });

export const saveExperiment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; brandId: string; patch: Record<string, unknown> }) => d)
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { error } = await context.supabase
        .from("hub_experiments")
        .update({ ...data.patch, updated_at: new Date().toISOString() } as never)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("hub_experiments")
      .insert({ ...data.patch, brand_id: data.brandId, created_by: context.userId } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (row as { id: string }).id };
  });

export const deleteExperiment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("hub_experiments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listLearnings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandIds: string[] }) => d)
  .handler(async ({ data, context }): Promise<Learning[]> => {
    const { data: rows, error } = await context.supabase
      .from("hub_learnings")
      .select("id,brand_id,experiment_id,insight,category,tags,confidence,created_at")
      .in("brand_id", data.brandIds)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return ((rows as any[]) ?? []).map((r) => ({ ...r, tags: r.tags ?? [] })) as Learning[];
  });

export const saveLearning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      brandId: string;
      insight: string;
      category?: string | null;
      tags?: string[];
      confidence?: string;
      experimentId?: string | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("hub_learnings").insert({
      brand_id: data.brandId,
      insight: data.insight,
      category: data.category ?? null,
      tags: data.tags ?? [],
      confidence: data.confidence ?? "medium",
      experiment_id: data.experimentId ?? null,
      created_by: context.userId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteLearning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("hub_learnings").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
