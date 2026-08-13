import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Phase 7 — Marketing Intelligence (alert engine). */

export type MktAlert = {
  id: string;
  brand_id: string | null;
  rule: string;
  severity: "high" | "medium" | "low";
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  title: string;
  message: string;
  metrics: Record<string, any>;
  recommendation: string | null;
  status: "open" | "ack" | "resolved";
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
};

const BrandIds = z.object({
  brandIds: z.array(z.string().uuid()).min(1),
  status: z.enum(["open", "ack", "resolved", "all"]).default("open"),
});

export const getAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BrandIds.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("mkt_alerts")
      .select("*")
      .in("brand_id", data.brandIds)
      .order("severity", { ascending: true })
      .order("last_seen_at", { ascending: false })
      .limit(300);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []) as unknown as MktAlert[];
  });

export const evaluateAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        brandIds: z.array(z.string().uuid()).min(1),
        lookback: z.number().int().min(1).max(90).default(7),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("mkt_evaluate_alerts", {
      _brand_ids: data.brandIds,
      _lookback: data.lookback,
    } as never);
    if (error) throw error;
    return res as { ok: boolean; triggered: number; resolved: number };
  });

export const setAlertStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1),
        status: z.enum(["open", "ack", "resolved"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status: data.status, updated_at: now };
    if (data.status === "ack") {
      patch.acked_at = now;
      patch.acked_by = context.userId;
    }
    if (data.status === "resolved") patch.resolved_at = now;
    if (data.status === "open") patch.resolved_at = null;
    const { error } = await context.supabase
      .from("mkt_alerts")
      .update(patch as never)
      .in("id", data.ids);
    if (error) throw error;
    return { ok: true };
  });
