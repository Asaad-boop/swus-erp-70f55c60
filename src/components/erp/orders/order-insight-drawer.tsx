import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ExternalLink, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { customerName, customerPhone, invoiceDisplay, type OrderRow } from "@/lib/erp/orders";
import { CallStatusChip } from "@/components/erp/orders/call-status-chip";

type TabKey = "timeline" | "attribution" | "notes" | "payment";

const TABS: { key: TabKey; label: string }[] = [
  { key: "timeline", label: "Timeline" },
  { key: "attribution", label: "Attribution" },
  { key: "notes", label: "Notes" },
  { key: "payment", label: "Payment" },
];

/** The five pipeline stamps we visualise, in order. */
const STEPS: { field: keyof OrderRow | string; label: string; statuses: string[] }[] = [
  { field: "verified_at", label: "Verified", statuses: ["confirmed", "verified"] },
  { field: "packaged_at", label: "Packaged", statuses: ["packed", "ready_to_pack"] },
  { field: "shipped_at", label: "Shipped", statuses: ["shipped", "ready_to_ship"] },
  { field: "in_transit_at", label: "In transit", statuses: ["in_transit"] },
  { field: "delivered_at", label: "Delivered", statuses: ["delivered", "completed"] },
];

const money = (n: number | null | undefined) =>
  `৳${Number(n ?? 0).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;

type Props = {
  order: OrderRow | null;
  onClose: () => void;
  /** Opens the full order editor. */
  onOpenFull?: (id: string) => void;
};

/** 420px right-hand context drawer: read-only insight, no editing. */
export function OrderInsightDrawer({ order, onClose, onOpenFull }: Props) {
  const [tab, setTab] = useState<TabKey>("timeline");
  const orderId = order?.id ?? null;

  const historyQ = useQuery({
    queryKey: ["order-insight-history", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_status_history")
        .select("id,to_status,created_at,note")
        .eq("order_id", orderId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const notesQ = useQuery({
    queryKey: ["order-insight-notes", orderId],
    enabled: !!orderId && tab === "notes",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_notes")
        .select("id,body,is_internal,created_at")
        .eq("order_id", orderId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!order) return null;
  const o = order as OrderRow & Record<string, unknown>;

  const stampFor = (field: string, statuses: string[]): string | null => {
    const direct = o[field];
    if (typeof direct === "string" && direct) return direct;
    const hit = (historyQ.data ?? []).find((h) => statuses.includes(h.to_status));
    return hit?.created_at ?? null;
  };

  const hasAttribution =
    !!o.utm_source || !!o.utm_medium || !!o.utm_campaign || !!o.fb_campaign_id || !!o.attribution_landing_page;

  return (
    <aside
      className="v2-drawer-in sticky top-0 flex h-[calc(100vh-2rem)] w-[420px] shrink-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-card"
      aria-label="Order details"
    >
      <header className="flex items-start justify-between gap-2 border-b border-[var(--border-soft)] px-4 py-3">
        <div className="min-w-0">
          <div className="num text-[13px] font-semibold">{invoiceDisplay(order)}</div>
          <div className="truncate text-[12px] text-muted-foreground">
            {customerName(order)} · <span className="num">{customerPhone(order)}</span>
          </div>
          <div className="mt-1.5">
            <CallStatusChip status={order.call_status} attempts={order.call_attempt_count} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onOpenFull && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={() => onOpenFull(order.id)}>
              <ExternalLink className="h-3 w-3" /> Open
            </Button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="focus-ring grid h-7 w-7 place-items-center rounded-[var(--radius-chip)] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <nav className="flex gap-1 border-b border-[var(--border-soft)] px-2 py-1.5" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "focus-ring rounded-[var(--radius-chip)] px-2.5 py-1 text-[12px] font-medium transition-colors",
              tab === t.key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
        {tab === "timeline" && (
          <ol className="relative space-y-4 pl-5">
            <span aria-hidden className="absolute left-[5px] top-1 bottom-1 w-px bg-[var(--border)]" />
            {STEPS.map((s) => {
              const at = stampFor(String(s.field), s.statuses);
              return (
                <li key={s.label} className="relative">
                  <span
                    aria-hidden
                    className={cn(
                      "absolute -left-5 top-1 h-2.5 w-2.5 rounded-full border-2",
                      at
                        ? "border-[var(--success-solid)] bg-[var(--success-solid)]"
                        : "border-[var(--neutral-border)] bg-card",
                    )}
                  />
                  <div className={cn("text-[12.5px] font-medium", at ? "text-foreground" : "text-muted-foreground")}>
                    {s.label}
                  </div>
                  <div className="num text-[11px] text-muted-foreground">
                    {at ? format(new Date(at), "dd MMM yyyy, h:mm a") : "Pending"}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {tab === "attribution" &&
          (hasAttribution ? (
            <div className="space-y-1.5 rounded-[var(--radius-card)] border border-[var(--border-soft)] bg-[var(--surface-alt)] p-3">
              <KV label="utm_source" value={o.utm_source as string} />
              <KV label="utm_medium" value={o.utm_medium as string} />
              <KV label="utm_campaign" value={o.utm_campaign as string} />
              <KV label="fb_campaign_id" value={o.fb_campaign_id as string} />
              <KV label="fb_adset_id" value={o.fb_adset_id as string} />
              <KV label="fb_ad_id" value={o.fb_ad_id as string} />
              <KV label="landing_page" value={o.attribution_landing_page as string} />
            </div>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">এই order-এ কোনো attribution data নেই।</p>
          ))}

        {tab === "notes" && (
          <div className="space-y-2">
            {(notesQ.data ?? []).length === 0 && !notesQ.isLoading && (
              <p className="text-[12.5px] text-muted-foreground">কোনো note নেই।</p>
            )}
            {(notesQ.data ?? []).map((n) => (
              <div
                key={n.id}
                className={cn(
                  "rounded-[var(--radius-card)] border p-2.5 text-[12.5px]",
                  n.is_internal
                    ? "border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning-text)]"
                    : "border-[var(--border-soft)] bg-[var(--surface-alt)] text-foreground",
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] opacity-70">
                    {n.is_internal ? "Internal" : "Customer"}
                  </span>
                  <span className="num text-[10.5px] opacity-70">
                    {format(new Date(n.created_at), "dd MMM, h:mm a")}
                  </span>
                </div>
                <p className="whitespace-pre-wrap leading-snug">{n.body}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "payment" && (
          <div className="grid grid-cols-2 gap-2">
            <Cell label="Payment status" value={(o.payment_status as string) ?? "—"} />
            <Cell label="Reconciliation" value={order.reconciliation_status ?? "—"} />
            <Cell label="Order total" value={money(order.total)} />
            <Cell label="Net collected" value={money(order.net_collected)} />
            <Cell label="Courier fee" value={money(o.courier_fee as number)} />
            <Cell label="Refunded" value={money(o.refund_amount as number)} />
          </div>
        )}
      </div>
    </aside>
  );
}

function KV({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[12px]">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
      <span className="num max-w-[60%] truncate text-right text-foreground" title={value ?? "—"}>
        {value || "—"}
      </span>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border-soft)] bg-[var(--surface-alt)] px-2.5 py-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="num mt-0.5 text-[13px] font-semibold capitalize text-foreground">{value}</div>
    </div>
  );
}
