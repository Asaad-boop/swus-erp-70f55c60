import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lightweight write helpers used by the orders list / web orders UI.
 * They only touch existing columns on `orders` — no new backend surface.
 */

function invalidateOrders(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["orders"] });
  qc.invalidateQueries({ queryKey: ["web-orders"] });
  qc.invalidateQueries({ queryKey: ["order-status-counts"] });
}

export type CallLogInput = {
  orderId: string;
  /** Current attempt count, so the next value is deterministic. */
  attempts: number;
  currentStatus: string | null;
};

/** Logs one call attempt: bumps the counter and stamps who called when. */
export function useLogCallAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, attempts, currentStatus }: CallLogInput) => {
      const { data: auth } = await supabase.auth.getUser();
      const next = (attempts ?? 0) + 1;
      const keepStatus =
        currentStatus === "customer_confirmed" ||
        currentStatus === "customer_cancelled" ||
        currentStatus === "reached";
      const { error } = await supabase
        .from("orders")
        .update({
          call_attempt_count: next,
          last_call_at: new Date().toISOString(),
          last_called_by: auth.user?.id ?? null,
          ...(keepStatus ? {} : { call_status: "attempting" as const }),
        })
        .eq("id", orderId);
      if (error) throw error;
      return { orderId, attempts: next };
    },
    onSuccess: () => {
      toast.success("Call logged");
      invalidateOrders(qc);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Call log failed"),
  });
}

/** Assigns (or clears) the agent responsible for one or many orders. */
export function useAssignOrders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderIds, userId }: { orderIds: string[]; userId: string | null }) => {
      const { error } = await supabase.from("orders").update({ assigned_to: userId }).in("id", orderIds);
      if (error) throw error;
      return orderIds.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} order assign হয়েছে`);
      invalidateOrders(qc);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Assign failed"),
  });
}

export type BulkCallPatch = {
  orderIds: string[];
  call_status?: string;
  confirmation_status?: string;
  web_status?: string;
  label: string;
};

/** One batched update across every selected order id. */
export function useBulkOrderPatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderIds, label: _label, ...patch }: BulkCallPatch) => {
      const { error } = await supabase
        .from("orders")
        .update(patch as never)
        .in("id", orderIds);
      if (error) throw error;
      return orderIds.length;
    },
    onSuccess: (n, vars) => {
      toast.success(`${n} order → ${vars.label}`);
      invalidateOrders(qc);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Bulk update failed"),
  });
}
