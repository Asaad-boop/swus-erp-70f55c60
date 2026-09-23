import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { History, Repeat2, ShieldAlert, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { statusBadge } from "@/lib/erp/orders";

type PastOrder = {
  id: string;
  invoice_no: string | number | null;
  status: string | null;
  web_status: string | null;
  total: number | null;
  created_at: string;
};

export function useCustomerPastOrders(phone: string | null, currentId: string | null) {
  const digits = String(phone ?? "").replace(/\D/g, "").slice(-11);
  return useQuery({
    queryKey: ["order-customer-history", digits, currentId],
    enabled: digits.length === 11,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,invoice_no,status,web_status,total,created_at")
        .or(`shipping_phone.ilike.%${digits}%,guest_phone.ilike.%${digits}%`)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return ((data ?? []) as PastOrder[]).filter((r) => r.id !== currentId);
    },
  });
}

const isDelivered = (s: string | null) => s === "delivered" || s === "completed" || s === "paid" || s === "partial_delivered";
const isBad = (s: string | null) =>
  !!s && (s === "cancelled" || s === "fake" || s.includes("return"));

export function CustomerHistoryCard({
  phone,
  currentOrderId,
  onOpenOrder,
}: {
  phone: string | null;
  currentOrderId: string | null;
  onOpenOrder?: (id: string) => void;
}) {
  const { data: rows = [], isLoading } = useCustomerPastOrders(phone, currentOrderId);

  if (!phone) return null;
  if (isLoading) {
    return (
      <section className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Customer history load hocche…
        </div>
      </section>
    );
  }
  if (rows.length === 0) {
    return (
      <section className="rounded-xl border bg-card p-4">
        <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <History className="h-3.5 w-3.5" /> Customer History
        </h3>
        <p className="text-xs text-muted-foreground">
          New customer — ei phone number e ager kono order nei.
        </p>
      </section>
    );
  }

  const delivered = rows.filter((r) => isDelivered(r.status)).length;
  const bad = rows.filter((r) => isBad(r.status)).length;
  const spend = rows.filter((r) => isDelivered(r.status)).reduce((s, r) => s + Number(r.total ?? 0), 0);
  const risky = rows.length >= 2 && bad / rows.length >= 0.5;

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <History className="h-3.5 w-3.5" /> Customer History ({rows.length})
        </h3>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
            risky
              ? "bg-rose-500/10 text-rose-700 ring-rose-500/30 dark:text-rose-300"
              : "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300",
          )}
        >
          {risky ? <ShieldAlert className="h-3 w-3" /> : <Repeat2 className="h-3 w-3" />}
          {risky ? "Risky repeat customer" : "Returning customer"}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          {delivered} delivered · {bad} return/cancel · ৳{spend.toLocaleString()} lifetime
        </span>
      </div>

      <div className="divide-y divide-border/60 overflow-hidden rounded-lg border">
        {rows.slice(0, 12).map((r) => {
          const b = statusBadge(String(r.status ?? ""));
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onOpenOrder?.(r.id)}
              className="flex w-full items-center gap-3 bg-card px-3 py-2 text-left text-xs transition-colors hover:bg-muted/40"
            >
              <span className="font-mono text-[11px] font-semibold">
                #{r.invoice_no ?? String(r.id).slice(0, 6).toUpperCase()}
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {format(new Date(r.created_at), "dd MMM yyyy")}
              </span>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", b.className)}>{b.label}</span>
              {r.web_status && (
                <span className="hidden rounded-full border px-2 py-0.5 text-[10px] capitalize text-muted-foreground sm:inline">
                  {String(r.web_status).replace(/_/g, " ")}
                </span>
              )}
              <span className="ml-auto font-semibold tabular-nums">৳{Number(r.total ?? 0).toLocaleString()}</span>
            </button>
          );
        })}
      </div>
      {rows.length > 12 && (
        <p className="mt-2 text-[11px] text-muted-foreground">+{rows.length - 12} aro purono order</p>
      )}
    </section>
  );
}
