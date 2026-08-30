import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ============================================================
   Stock Health — P5 dashboard server functions
   Ledger = source of truth, Stock = projection, Reserved = calculated.
   Ei dashboard 4 drift check + low stock + snapshot status ek jaygay dekhay.
   ============================================================ */

async function assertStaff(supabase: any, userId: string) {
  const roles = ["admin", "accountant", "operations", "warehouse_staff", "owner"] as const;
  const results = await Promise.all(
    roles.map((r) => supabase.rpc("has_role", { _user_id: userId, _role: r })),
  );
  if (!results.some((r: any) => r.data === true)) throw new Error("Not authorized");
}

export const getStockHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => (d ?? {}) as { brandId?: string })
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const brandId = (data as any)?.brandId as string | undefined;

    const [resDrift, ledDrift, costDrift, missingCost, lowStock, oversold, snapshots] =
      await Promise.all([
        context.supabase.rpc("inv_reservation_drift"),
        context.supabase.rpc("inv_ledger_drift"),
        context.supabase.rpc("inv_cost_drift"),
        context.supabase.from("inv_missing_cost").select("*"),
        context.supabase.from("inv_low_stock").select("*"),
        // Oversold: available < 0 (product + variant level)
        context.supabase
          .from("products")
          .select("id, title, sku, stock, reserved_stock, available_stock, brand_id")
          .eq("is_active", true)
          .lt("available_stock", 0),
        context.supabase
          .from("inv_snapshot_runs")
          .select("id, created_at, label, note, row_count")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

    for (const r of [resDrift, ledDrift, costDrift, missingCost, lowStock, oversold, snapshots]) {
      if (r.error) throw r.error;
    }

    const byBrand = (rows: any[]) =>
      brandId ? rows.filter((r) => !r.brand_id || r.brand_id === brandId) : rows;

    return {
      reservationDrift: resDrift.data ?? [],
      ledgerDrift: ledDrift.data ?? [],
      costDrift: costDrift.data ?? [],
      missingCost: byBrand(missingCost.data ?? []),
      lowStock: byBrand(lowStock.data ?? []),
      oversold: byBrand(oversold.data ?? []),
      snapshots: snapshots.data ?? [],
    };
  });

export const takeStockSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => (d ?? {}) as Record<string, never>)
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data: id, error } = await context.supabase.rpc("inv_take_snapshot" as any);
    if (error) throw error;
    return { id };
  });
