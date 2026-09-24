import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { History, Repeat2, ShieldAlert, Loader2, Package } from "lucide-react";
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
  payment_status: string | null;
  courier_name: string | null;
  tracking_number: string | null;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    variant_label: string | null;
    unit_price: number | null;
    price: number;
    line_total: number | null;
    is_combo_child: boolean;
  }>;
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
        .select("id,invoice_no,status,web_status,total,created_at,payment_status,courier_name,tracking_number,items:order_items(id,name,quantity,variant_label,unit_price,price,line_total,is_combo_child)")
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
          const items = (r.items ?? []).filter((item) => !item.is_combo_child);
          const pieces = items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onOpenOrder?.(r.id)}
              className="w-full bg-card px-3 py-2.5 text-left text-xs transition-colors duration-200 hover:bg-muted/40"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 font-mono text-[11px] font-semibold">
                  #{r.invoice_no ?? String(r.id).slice(0, 6).toUpperCase()}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                  {format(new Date(r.created_at), "dd MMM yyyy")}
                </span>
                <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold", b.className)}>{b.label}</span>
                <span className="ml-auto shrink-0 text-[12px] font-bold tabular-nums">৳{Number(r.total ?? 0).toLocaleString()}</span>
              </div>

              {items.length > 0 && (
                <div className="mt-2 space-y-1 border-l-2 border-border/70 pl-2.5">
                  {items.slice(0, 3).map((item) => (
                    <div key={item.id} className="flex min-w-0 items-center gap-1.5 text-[11px]">
                      <Package className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 truncate font-medium">{item.name}</span>
                      {item.variant_label && <span className="max-w-24 truncate text-[10px] text-muted-foreground">· {item.variant_label}</span>}
                      <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 font-semibold tabular-nums">×{item.quantity}</span>
                      <span className="w-16 shrink-0 text-right text-muted-foreground tabular-nums">
                        ৳{Number(item.line_total ?? Number(item.unit_price ?? item.price) * item.quantity).toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {items.length > 3 && <div className="text-[10px] text-muted-foreground">+{items.length - 3} more product</div>}
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                <span>{items.length} product · {pieces} pcs</span>
                {r.payment_status && <span className="capitalize">Payment: {r.payment_status.replace(/_/g, " ")}</span>}
                {r.courier_name && <span className="capitalize">Courier: {r.courier_name}</span>}
                {r.tracking_number && <span className="font-mono">#{r.tracking_number}</span>}
              </div>
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
