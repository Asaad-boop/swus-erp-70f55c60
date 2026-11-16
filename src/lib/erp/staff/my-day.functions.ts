import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  brandIds: z.array(z.string().uuid()).default([]),
});

/** Dhaka-local YYYY-MM-DD */
function dhakaDate(d: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
/** ISO instant for the start of a Dhaka calendar day (UTC+6, no DST). */
function dhakaStartIso(day: string) {
  return new Date(`${day}T00:00:00+06:00`).toISOString();
}
function shiftDay(day: string, deltaDays: number) {
  const d = new Date(`${day}T00:00:00+06:00`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return dhakaDate(d);
}

export type MyDayAction = {
  id: string;
  orderId: string;
  invoiceNo: string | null;
  customer: string | null;
  fromStatus: string | null;
  toStatus: string;
  at: string;
};

/**
 * "What did I do today" for the signed-in staff member, plus today's
 * booking counters for the brands they can see.
 * Reads through the admin client but every row is hard-scoped to the
 * caller's own user id (order_status_history.changed_by).
 */
export const getMyDaySummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    const today = dhakaDate();
    const todayStart = dhakaStartIso(today);
    const weekStart = dhakaStartIso(shiftDay(today, -6));

    // --- my status changes over the last 7 Dhaka days ---
    const { data: histRows, error: hErr } = await supabaseAdmin
      .from("order_status_history")
      .select("id, order_id, from_status, to_status, created_at")
      .eq("changed_by", userId)
      .gte("created_at", weekStart)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (hErr) throw new Error(hErr.message);

    const hist = histRows ?? [];
    const todayHist = hist.filter((r) => String(r.created_at) >= todayStart);

    const byStatus = new Map<string, number>();
    for (const r of todayHist) {
      const k = String(r.to_status ?? "");
      byStatus.set(k, (byStatus.get(k) ?? 0) + 1);
    }

    const trend = Array.from({ length: 7 }, (_, i) => {
      const day = shiftDay(today, i - 6);
      const start = dhakaStartIso(day);
      const end = dhakaStartIso(shiftDay(day, 1));
      return {
        day,
        count: hist.filter((r) => String(r.created_at) >= start && String(r.created_at) < end).length,
      };
    });

    // --- recent actions with order labels ---
    const recentRaw = todayHist.slice(0, 12);
    const orderIds = [...new Set(recentRaw.map((r) => r.order_id as string).filter(Boolean))];
    const labels = new Map<string, { invoice: string | null; customer: string | null }>();
    if (orderIds.length) {
      const { data: orders } = await supabaseAdmin
        .from("orders")
        .select("id, invoice_no, shipping_name, guest_name")
        .in("id", orderIds);
      for (const o of orders ?? []) {
        labels.set(o.id as string, {
          invoice: (o.invoice_no as string) ?? null,
          customer: ((o.shipping_name as string) || (o.guest_name as string)) ?? null,
        });
      }
    }
    const recent: MyDayAction[] = recentRaw.map((r) => ({
      id: r.id as string,
      orderId: r.order_id as string,
      invoiceNo: labels.get(r.order_id as string)?.invoice ?? null,
      customer: labels.get(r.order_id as string)?.customer ?? null,
      fromStatus: (r.from_status as string) ?? null,
      toStatus: String(r.to_status ?? ""),
      at: String(r.created_at),
    }));

    // --- today's bookings for the brands in scope (counts only) ---
    const scope = (q: any) => (data.brandIds.length ? q.in("brand_id", data.brandIds) : q);
    const [placed, confirmed, shipped, delivered] = await Promise.all([
      scope(supabaseAdmin.from("orders").select("id", { count: "exact", head: true })).gte("created_at", todayStart),
      scope(supabaseAdmin.from("orders").select("id", { count: "exact", head: true }))
        .eq("confirmation_status", "confirmed")
        .gte("updated_at", todayStart),
      scope(supabaseAdmin.from("orders").select("id", { count: "exact", head: true }))
        .in("status", ["shipped", "in_transit"])
        .gte("updated_at", todayStart),
      scope(supabaseAdmin.from("orders").select("id", { count: "exact", head: true }))
        .eq("status", "delivered")
        .gte("updated_at", todayStart),
    ]);

    return {
      today,
      serverNow: new Date().toISOString(),
      myActionsToday: todayHist.length,
      myActionsWeek: hist.length,
      byStatus: Object.fromEntries(byStatus),
      trend,
      recent,
      bookings: {
        placed: placed.count ?? 0,
        confirmed: confirmed.count ?? 0,
        shipped: shipped.count ?? 0,
        delivered: delivered.count ?? 0,
      },
    };
  });
