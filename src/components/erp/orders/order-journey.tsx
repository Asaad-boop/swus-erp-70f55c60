/**
 * Order journey — who created the order, who confirmed it, who packed it, who
 * sent it to the courier, and every status change after that, with the staff
 * member's name and role. Data comes from the `order_journey` RPC, which
 * resolves names server-side (most staff cannot read other profiles).
 */
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  ShoppingBag,
  BadgeCheck,
  PackageOpen,
  Package,
  Truck,
  Send,
  CircleCheckBig,
  Undo2,
  XCircle,
  Phone,
  Globe,
  StickyNote,
  ScanLine,
  Bot,
  Loader2,
  History,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { statusBadge } from "@/lib/erp/orders";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type StaffRef = { id: string; name: string; role: string | null } | null;

type JourneyEvent =
  | {
      id: string;
      kind: "status";
      at: string;
      from: string | null;
      to: string;
      reason: string | null;
      note: string | null;
      by: StaffRef;
    }
  | {
      id: string;
      kind: "courier";
      at: string;
      provider: string;
      consignment: string | null;
      by: StaffRef;
    }
  | {
      id: string;
      kind: "log";
      at: string;
      action: string;
      details: Record<string, unknown> | null;
      by: StaffRef;
    };

type Journey = {
  created: { at: string; source: string | null; guest: boolean | null; by: StaffRef };
  confirmed_by: StaffRef;
  confirmed_at: string | null;
  events: JourneyEvent[];
};

export function useOrderJourney(orderId: string | null | undefined) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["order-journey", orderId],
    enabled: !!orderId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("order_journey", { _order_id: orderId });
      if (error) throw new Error(error.message);
      return data as Journey;
    },
  });

  useEffect(() => {
    if (!orderId) return;
    const refresh = () => qc.invalidateQueries({ queryKey: ["order-journey", orderId] });
    const ch = supabase
      .channel(`order-journey-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_status_history",
          filter: `order_id=eq.${orderId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "courier_shipments",
          filter: `order_id=eq.${orderId}`,
        },
        refresh,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [orderId, qc]);

  return q;
}

// ───────────────────────── helpers ─────────────────────────

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  operations: "Operations",
  customer_service: "Customer service",
  moderator: "Moderator",
  warehouse_staff: "Warehouse",
  packer: "Packer",
  accountant: "Accounts",
  marketing_manager: "Marketing",
  hr_admin: "HR",
  hr_manager: "HR",
};

const SOURCE_LABEL: Record<string, string> = {
  website: "Website",
  pixel: "Website",
  utm: "Website",
  manual: "Manual",
  incomplete: "Incomplete checkout",
  shopify: "Shopify",
};

function systemLabel(reason: string | null): string {
  if (!reason) return "System";
  if (reason.includes("pathao")) return "Pathao";
  if (reason.includes("steadfast")) return "Steadfast";
  if (reason.includes("cron") || reason.includes("sync")) return "Auto sync";
  return "System";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

// A stable soft colour per person so the same staff member is easy to spot.
const AVATAR_TONES = [
  "bg-sky-100 text-sky-800",
  "bg-emerald-100 text-emerald-800",
  "bg-violet-100 text-violet-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-teal-100 text-teal-800",
  "bg-indigo-100 text-indigo-800",
  "bg-fuchsia-100 text-fuchsia-800",
];
function toneFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

function Avatar({
  who,
  system,
  size = "md",
}: {
  who: StaffRef;
  system?: string;
  size?: "sm" | "md";
}) {
  const cls = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-[11px]";
  if (!who) {
    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-muted text-muted-foreground",
          cls,
        )}
      >
        {system === "Customer" || system === "Website" ? (
          <Globe className="h-3.5 w-3.5" />
        ) : (
          <Bot className="h-3.5 w-3.5" />
        )}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-bold",
        toneFor(who.id),
        cls,
      )}
    >
      {initials(who.name)}
    </span>
  );
}

function Who({ who, fallback }: { who: StaffRef; fallback: string }) {
  if (!who) return <span className="font-medium text-muted-foreground">{fallback}</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate font-semibold text-foreground">{who.name}</span>
      {who.role && (
        <span className="shrink-0 rounded bg-muted px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          {ROLE_LABEL[who.role] ?? who.role}
        </span>
      )}
    </span>
  );
}

function Chip({ status }: { status: string }) {
  const b = statusBadge(status);
  return (
    <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold", b.className)}>
      {b.label}
    </span>
  );
}

function when(at: string) {
  return format(new Date(at), "dd MMM, hh:mm a");
}

// ───────────────────────── milestones ─────────────────────────

type Milestone = {
  key: string;
  label: string;
  icon: React.ReactNode;
  at: string | null;
  by: StaffRef;
  fallback: string;
  tone: string;
};

const PRE_CONFIRM = new Set([
  "new",
  "pending",
  "on_hold",
  "incomplete",
  "pre_order",
  null as unknown as string,
]);

function lastStatus(
  events: JourneyEvent[],
  to: string[],
  pred?: (e: JourneyEvent & { kind: "status" }) => boolean,
) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === "status" && to.includes(e.to) && (!pred || pred(e))) return e;
  }
  return null;
}

function buildMilestones(j: Journey): Milestone[] {
  const ev = j.events;
  const src = j.created.source ?? "";
  const isWeb = ["website", "pixel", "utm", "incomplete"].includes(src);

  const confirmEv = lastStatus(ev, ["confirmed"], (e) => PRE_CONFIRM.has(e.from as string));
  const packingEv = lastStatus(ev, ["packaging", "ready_to_pack"]);
  const packedEv = lastStatus(ev, ["packed"]);
  let courierEv: JourneyEvent | null = null;
  for (let i = ev.length - 1; i >= 0; i--)
    if (ev[i].kind === "courier") {
      courierEv = ev[i];
      break;
    }
  const rtsEv = lastStatus(ev, ["ready_to_ship"]);
  const shippedEv = lastStatus(ev, ["shipped", "in_transit"]);
  const endEv = lastStatus(ev, [
    "delivered",
    "partial_delivered",
    "returned",
    "partial_return",
    "pending_return",
    "cancelled",
    "exchange",
    "exchanged",
  ]);

  const out: Milestone[] = [
    {
      key: "created",
      label: "Created",
      icon: <ShoppingBag className="h-3.5 w-3.5" />,
      at: j.created.at,
      by: j.created.by,
      fallback: isWeb ? "Customer · Website" : (SOURCE_LABEL[src] ?? "—"),
      tone: "text-emerald-600",
    },
    {
      key: "confirmed",
      label: "Confirmed",
      icon: <BadgeCheck className="h-3.5 w-3.5" />,
      at: confirmEv?.at ?? j.confirmed_at,
      by: confirmEv?.by ?? j.confirmed_by,
      fallback: confirmEv || j.confirmed_at ? "System" : "",
      tone: "text-blue-600",
    },
    {
      key: "packing",
      label: "Packing",
      icon: <PackageOpen className="h-3.5 w-3.5" />,
      at: packingEv?.at ?? null,
      by: packingEv?.by ?? null,
      fallback: packingEv ? systemLabel(packingEv.reason) : "",
      tone: "text-fuchsia-600",
    },
    {
      key: "packed",
      label: "Packed",
      icon: <Package className="h-3.5 w-3.5" />,
      at: packedEv?.at ?? null,
      by: packedEv?.by ?? null,
      fallback: packedEv ? systemLabel(packedEv.reason) : "",
      tone: "text-purple-600",
    },
    courierEv && courierEv.kind === "courier"
      ? {
          key: "courier",
          label: `Courier · ${courierEv.provider === "steadfast" ? "Steadfast" : courierEv.provider === "pathao" ? "Pathao" : courierEv.provider}`,
          icon: <Send className="h-3.5 w-3.5" />,
          at: courierEv.at,
          by: courierEv.by,
          fallback: "System",
          tone: "text-cyan-600",
        }
      : {
          key: "courier",
          label: "Courier / RTS",
          icon: <Send className="h-3.5 w-3.5" />,
          at: rtsEv?.at ?? null,
          by: rtsEv?.by ?? null,
          fallback: rtsEv ? systemLabel(rtsEv.reason) : "",
          tone: "text-cyan-600",
        },
    {
      key: "shipped",
      label: "Shipped",
      icon: <Truck className="h-3.5 w-3.5" />,
      at: shippedEv?.at ?? null,
      by: shippedEv?.by ?? null,
      fallback: shippedEv ? systemLabel(shippedEv.reason) : "",
      tone: "text-amber-600",
    },
  ];

  if (endEv) {
    const bad = /return|cancel/.test(endEv.to);
    out.push({
      key: "end",
      label: statusBadge(endEv.to).label,
      icon: /cancel/.test(endEv.to) ? (
        <XCircle className="h-3.5 w-3.5" />
      ) : bad ? (
        <Undo2 className="h-3.5 w-3.5" />
      ) : (
        <CircleCheckBig className="h-3.5 w-3.5" />
      ),
      at: endEv.at,
      by: endEv.by,
      fallback: systemLabel(endEv.reason),
      tone: bad ? "text-rose-600" : "text-emerald-600",
    });
  } else {
    out.push({
      key: "end",
      label: "Delivered",
      icon: <CircleCheckBig className="h-3.5 w-3.5" />,
      at: null,
      by: null,
      fallback: "",
      tone: "text-emerald-600",
    });
  }
  return out;
}

function MilestoneStrip({ j }: { j: Journey }) {
  const ms = useMemo(() => buildMilestones(j), [j]);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
      {ms.map((m) => {
        const done = !!m.at;
        return (
          <div
            key={m.key}
            className={cn(
              "min-w-0 rounded-xl border p-2.5",
              done ? "bg-card" : "border-dashed bg-muted/30 opacity-60",
            )}
          >
            <div
              className={cn(
                "flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider",
                done ? m.tone : "text-muted-foreground",
              )}
            >
              {m.icon}
              <span className="truncate">{m.label}</span>
            </div>
            {done ? (
              <>
                <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                  <Avatar
                    who={m.by}
                    size="sm"
                    system={m.fallback.startsWith("Customer") ? "Customer" : undefined}
                  />
                  <span className="min-w-0 truncate text-[12px] font-semibold">
                    {m.by?.name ?? m.fallback}
                  </span>
                </div>
                <div className="mt-1 text-[10px] tabular-nums text-muted-foreground">
                  {when(m.at!)}
                </div>
              </>
            ) : (
              <div className="mt-1.5 text-[11px] text-muted-foreground">এখনো হয়নি</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────── timeline ─────────────────────────

const LOG_TITLE: Record<string, string> = {
  CALL_LOGGED: "Call করেছে",
  CONFIRMATION_CHANGED: "Confirmation বদলেছে",
  WEB_STATUS_CHANGED: "Web status বদলেছে",
  NOTE_ADDED: "Note যোগ করেছে",
  ORDER_ASSIGNED: "Staff assign করেছে",
};

function EventRow({ e }: { e: JourneyEvent }) {
  let title: React.ReactNode;
  let icon: React.ReactNode;
  let tag: string | null = null;
  let note: string | null = null;
  let fallback = "System";

  if (e.kind === "status") {
    icon = <History className="h-3 w-3" />;
    title = (
      <span className="flex flex-wrap items-center gap-1">
        {e.from && <Chip status={e.from} />}
        {e.from && <span className="text-muted-foreground/60">→</span>}
        <Chip status={e.to} />
      </span>
    );
    if (e.reason === "scan") {
      tag = e.note === "packing station" ? "Packing Station scan" : "Scan";
      icon = <ScanLine className="h-3 w-3" />;
    } else if (e.reason) {
      fallback = systemLabel(e.reason);
      if (!e.by) tag = fallback;
    }
    if (
      e.note &&
      e.note !== "packing station" &&
      !(e.reason && e.note.startsWith(`${fallback.toLowerCase()}:`))
    ) {
      note = e.note;
    }
  } else if (e.kind === "courier") {
    icon = <Send className="h-3 w-3" />;
    const p =
      e.provider === "pathao" ? "Pathao" : e.provider === "steadfast" ? "Steadfast" : e.provider;
    title = <span className="font-semibold">{p}-এ পাঠিয়েছে</span>;
    tag = e.consignment ? `#${e.consignment}` : null;
  } else {
    const d = (e.details ?? {}) as {
      from?: string;
      to?: string;
      status?: string;
      attempt?: number;
      note?: string;
    };
    icon =
      e.action === "CALL_LOGGED" ? (
        <Phone className="h-3 w-3" />
      ) : e.action === "NOTE_ADDED" ? (
        <StickyNote className="h-3 w-3" />
      ) : e.action === "WEB_STATUS_CHANGED" ? (
        <Globe className="h-3 w-3" />
      ) : (
        <BadgeCheck className="h-3 w-3" />
      );
    title = (
      <span className="flex flex-wrap items-center gap-1">
        <span className="font-semibold">
          {LOG_TITLE[e.action] ?? e.action.replace(/_/g, " ").toLowerCase()}
        </span>
        {d.from && d.to && (
          <span className="text-[11px] text-muted-foreground">
            {d.from.replace(/_/g, " ")} → {d.to.replace(/_/g, " ")}
          </span>
        )}
        {e.action === "CALL_LOGGED" && d.status && (
          <span className="text-[11px] text-muted-foreground">
            {d.status.replace(/_/g, " ")}
            {d.attempt ? ` · attempt ${d.attempt}` : ""}
          </span>
        )}
      </span>
    );
    note = d.note ?? null;
  }

  return (
    <li className="relative flex gap-3 pb-3 last:pb-0">
      <Avatar who={e.by} system={fallback} />
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
          <Who who={e.by} fallback={fallback} />
          <span
            className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground"
            title={formatDistanceToNow(new Date(e.at), { addSuffix: true })}
          >
            {format(new Date(e.at), "dd MMM yyyy, hh:mm a")}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className="text-muted-foreground">{icon}</span>
          {title}
          {tag && (
            <span className="rounded-md bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
              {tag}
            </span>
          )}
        </div>
        {note && (
          <p className="mt-1 whitespace-pre-wrap rounded-md border bg-background/60 px-2 py-1 text-[11px]">
            {note}
          </p>
        )}
      </div>
    </li>
  );
}

/** Full journey: milestone strip + staff-attributed timeline (newest first). */
export function OrderJourney({ orderId, className }: { orderId: string; className?: string }) {
  const { data, isLoading, error } = useOrderJourney(orderId);

  const events = useMemo(() => {
    if (!data) return [];
    const created: JourneyEvent = {
      id: "created",
      kind: "log",
      at: data.created.at,
      action: "__CREATED__",
      details: null,
      by: data.created.by,
    };
    return [...data.events, created].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
  }, [data]);

  return (
    <section className={cn("rounded-2xl border bg-card shadow-sm", className)}>
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <History className="h-4 w-4 text-indigo-600" />
        <h3 className="text-[13px] font-semibold">Order Journey — কে কী করেছে</h3>
        <span className="ml-auto inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-600">
          <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-500" /> Live
        </span>
      </header>
      <div className="space-y-4 p-4">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-xs text-muted-foreground">{(error as Error).message}</p>
        ) : data ? (
          <>
            <MilestoneStrip j={data} />
            <ol className="relative before:absolute before:bottom-4 before:left-4 before:top-4 before:w-px before:bg-border">
              {events.map((e) =>
                e.kind === "log" && e.action === "__CREATED__" ? (
                  <CreatedRow key={e.id} j={data} />
                ) : (
                  <EventRow key={e.id} e={e} />
                ),
              )}
            </ol>
          </>
        ) : null}
      </div>
    </section>
  );
}

function CreatedRow({ j }: { j: Journey }) {
  const src = j.created.source ?? "";
  const isWeb = ["website", "pixel", "utm", "incomplete"].includes(src);
  const fallback = isWeb ? (j.created.guest ? "Customer (guest)" : "Customer") : "Staff";
  return (
    <li className="relative flex gap-3">
      <Avatar who={j.created.by} system={isWeb ? "Customer" : undefined} />
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
          <Who who={j.created.by} fallback={fallback} />
          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {format(new Date(j.created.at), "dd MMM yyyy, hh:mm a")}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px]">
          <ShoppingBag className="h-3 w-3 text-emerald-600" />
          <span className="font-semibold">Order তৈরি করেছে</span>
          {src && (
            <span className="rounded-md bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
              {SOURCE_LABEL[src] ?? src}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
