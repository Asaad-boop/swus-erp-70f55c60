import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Clock, User, ShoppingBag, Activity, StickyNote, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { statusBadge } from "@/lib/erp/orders";

type FeedItem = {
  id: string;
  at: string;
  kind: "created" | "status" | "log";
  title: string;
  from?: string | null;
  to?: string | null;
  actor: string;
  note?: string | null;
};

function humanAction(action: string): string {
  const map: Record<string, string> = {
    ORDER_CREATED: "Order created",
    STATUS_CHANGED: "Status changed",
    WEB_STATUS_CHANGED: "Web status changed",
    ORDER_VIEWED: "Viewed order",
    NOTE_ADDED: "Note added",
    NOTE_DELETED: "Note deleted",
    ORDER_ASSIGNED: "Staff assigned",
    ORDER_UPDATED: "Order updated",
    ORDER_CONFIRMED: "Order confirmed",
    ORDER_CANCELLED: "Order cancelled",
    CALL_LOGGED: "Call logged",
    SHIPMENT_BOOKED: "Shipment booked",
  };
  return map[action] ?? action.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function iconFor(item: FeedItem) {
  if (item.kind === "created") return <ShoppingBag className="h-3 w-3" />;
  if (item.kind === "status") return <Activity className="h-3 w-3" />;
  if (/CANCEL|DELETE/i.test(item.title)) return <XCircle className="h-3 w-3" />;
  if (/CONFIRM|COMPLETE|BOOK/i.test(item.title)) return <CheckCircle2 className="h-3 w-3" />;
  if (/NOTE/i.test(item.title)) return <StickyNote className="h-3 w-3" />;
  return <Clock className="h-3 w-3" />;
}

/** Unified, staff-attributed activity feed: order placed + status changes + audit log. */
export function OrderActivityFeed({
  orderId,
  createdAt,
  source,
}: {
  orderId: string;
  createdAt?: string | null;
  source?: string | null;
}) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["order-activity-feed", orderId],
    staleTime: 15_000,
    queryFn: async () => {
      const [histRes, logRes] = await Promise.all([
        supabase
          .from("order_status_history")
          .select("id,from_status,to_status,changed_by,note,reason,created_at")
          .eq("order_id", orderId)
          .order("created_at", { ascending: false }),
        supabase
          .from("activity_log")
          .select("id,action,details,performed_by,performed_at")
          .eq("entity_type", "order")
          .eq("entity_id", orderId)
          .order("performed_at", { ascending: false })
          .limit(100),
      ]);
      const hist = (histRes.data ?? []) as Array<{
        id: string; from_status: string | null; to_status: string | null;
        changed_by: string | null; note: string | null; reason: string | null; created_at: string;
      }>;
      const logs = (logRes.data ?? []) as Array<{
        id: string; action: string; details: Record<string, unknown> | null;
        performed_by: string | null; performed_at: string;
      }>;

      const ids = Array.from(
        new Set([...hist.map((h) => h.changed_by), ...logs.map((l) => l.performed_by)].filter(Boolean)),
      ) as string[];
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids);
        (profs ?? []).forEach((p) => names.set(p.id, p.display_name ?? "Staff"));
      }
      return { hist, logs, names };
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`order-feed-${orderId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_log", filter: `entity_id=eq.${orderId}` },
        () => qc.invalidateQueries({ queryKey: ["order-activity-feed", orderId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "order_status_history", filter: `order_id=eq.${orderId}` },
        () => qc.invalidateQueries({ queryKey: ["order-activity-feed", orderId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orderId, qc]);

  const items = useMemo<FeedItem[]>(() => {
    const names = data?.names ?? new Map<string, string>();
    const out: FeedItem[] = [];

    (data?.hist ?? []).forEach((h) => {
      out.push({
        id: `h-${h.id}`,
        at: h.created_at,
        kind: "status",
        title: "Status changed",
        from: h.from_status,
        to: h.to_status,
        actor: h.changed_by ? (names.get(h.changed_by) ?? "Staff") : "System",
        note: h.note ?? h.reason ?? null,
      });
    });

    (data?.logs ?? []).forEach((l) => {
      const d = (l.details ?? {}) as { from?: string; to?: string; note?: string };
      if (/STATUS/.test(l.action) && d.from && d.to) {
        // Already covered by order_status_history within the same second.
        const dup = out.some(
          (o) => o.kind === "status" && o.to === d.to &&
            Math.abs(new Date(o.at).getTime() - new Date(l.performed_at).getTime()) < 5000,
        );
        if (dup) return;
      }
      out.push({
        id: `l-${l.id}`,
        at: l.performed_at,
        kind: "log",
        title: humanAction(l.action),
        from: d.from ?? null,
        to: d.to ?? null,
        actor: l.performed_by ? (names.get(l.performed_by) ?? "Staff") : "System",
        note: d.note ?? null,
      });
    });

    if (createdAt) {
      out.push({
        id: "created",
        at: createdAt,
        kind: "created",
        title: "Order placed",
        actor: source ? `via ${source}` : "Customer",
      });
    }

    return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [data, createdAt, source]);

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> Activity & Timeline
        </h3>
        <span className="ml-auto inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-600">
          <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-500" /> Live
        </span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">Kono activity nei.</p>
      ) : (
        <ol className="relative space-y-3 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-border">
          {items.map((it) => (
            <li key={it.id} className="relative flex items-start gap-3">
              <span
                className={cn(
                  "z-10 mt-0.5 grid h-3 w-3 shrink-0 place-items-center rounded-full ring-4 ring-background",
                  it.kind === "created" ? "bg-emerald-500" : it.kind === "status" ? "bg-primary" : "bg-muted-foreground/60",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                  <span className="inline-flex items-center gap-1 font-semibold">
                    {iconFor(it)} {it.title}
                  </span>
                  {it.from && it.to && (
                    <span className="flex items-center gap-1">
                      <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold", statusBadge(it.from).className)}>
                        {statusBadge(it.from).label}
                      </span>
                      <span className="text-muted-foreground/60">→</span>
                      <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold", statusBadge(it.to).className)}>
                        {statusBadge(it.to).label}
                      </span>
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <User className="h-3 w-3" />
                  <span className="font-medium text-foreground">{it.actor}</span>
                  <span>·</span>
                  <span className="tabular-nums" title={formatDistanceToNow(new Date(it.at), { addSuffix: true })}>
                    {format(new Date(it.at), "dd MMM yyyy, hh:mm a")}
                  </span>
                </div>
                {it.note && (
                  <p className="mt-1 whitespace-pre-wrap rounded border bg-background/60 px-2 py-1 text-[11px]">{it.note}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
