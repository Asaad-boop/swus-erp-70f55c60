import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Boxes, ClipboardList, Megaphone, PackageCheck, Ship, Wallet2, Headphones } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { Skeleton } from "@/components/ui/skeleton";

type Item = { label: string; value: number | string; to?: string; search?: Record<string, string> };

function Panel({
  title,
  icon: Icon,
  items,
  loading,
}: {
  title: string;
  icon: typeof Boxes;
  items: Item[];
  loading?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="flex items-center gap-2 border-b border-border/60 px-5 py-3">
        <Icon className="size-4 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </span>
      </div>
      {loading ? (
        <div className="p-5">
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {items.map((it) => {
            const body = (
              <>
                <span className="text-sm">{it.label}</span>
                <span className="flex items-center gap-2">
                  <span className="font-bold tabular-nums">{it.value}</span>
                  {it.to && <ArrowRight className="size-3.5 text-muted-foreground" />}
                </span>
              </>
            );
            return (
              <li key={it.label}>
                {it.to ? (
                  <Link
                    to={it.to as never}
                    search={it.search as never}
                    className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-muted/40"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center justify-between px-5 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const orderCount = async (brandIds: string[], build: (q: any) => any) => {
  const base = applyBrandScope(
    supabase.from("orders").select("id", { count: "exact", head: true }) as any,
    brandIds,
  );
  const { count } = await build(base);
  return count ?? 0;
};

/** Packing / warehouse work queue. */
function PackerPanel({ brandIds, userId }: { brandIds: string[]; userId: string | null }) {
  const q = useQuery({
    queryKey: ["staff-packer", brandIds.join(","), userId],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const [toPack, packed, readyShip, mine] = await Promise.all([
        orderCount(brandIds, (b: any) => b.in("status", ["confirmed", "ready_to_pack"])),
        orderCount(brandIds, (b: any) => b.in("status", ["packaging"])),
        orderCount(brandIds, (b: any) => b.in("status", ["packed", "ready_to_ship"])),
        userId
          ? supabase
              .from("order_status_history")
              .select("id", { count: "exact", head: true })
              .eq("changed_by", userId)
              .in("to_status", ["packed", "packaging"])
              .gte("created_at", start.toISOString())
          : Promise.resolve({ count: 0 } as any),
      ]);
      return { toPack, packed, readyShip, mine: (mine as any).count ?? 0 };
    },
  });
  return (
    <Panel
      title="Packing desk"
      icon={PackageCheck}
      loading={q.isLoading}
      items={[
        { label: "Ready to pack", value: q.data?.toPack ?? 0, to: "/erp/orders/list", search: { tab: "packing" } },
        { label: "Packing in progress", value: q.data?.packed ?? 0, to: "/erp/orders/list", search: { tab: "packing" } },
        { label: "Packed · waiting courier", value: q.data?.readyShip ?? 0, to: "/erp/courier" },
        { label: "আমি আজ pack করেছি", value: q.data?.mine ?? 0 },
      ]}
    />
  );
}

/** Content team queue. */
function ContentPanel({ brandIds }: { brandIds: string[] }) {
  const q = useQuery({
    queryKey: ["staff-content", brandIds.join(",")],
    staleTime: 60_000,
    queryFn: async () => {
      const count = async (statuses: string[]) => {
        const base = applyBrandScope(
          supabase.from("content_items").select("id", { count: "exact", head: true }) as any,
          brandIds,
        );
        const { count: c } = await base.in("status", statuses);
        return c ?? 0;
      };
      const [idea, production, review] = await Promise.all([
        count(["idea", "planned", "brief"]),
        count(["shooting", "editing", "in_progress"]),
        count(["review", "ready"]),
      ]);
      return { idea, production, review };
    },
  });
  return (
    <Panel
      title="Content queue"
      icon={ClipboardList}
      loading={q.isLoading}
      items={[
        { label: "Planned / brief", value: q.data?.idea ?? 0, to: "/erp/content" },
        { label: "In production", value: q.data?.production ?? 0, to: "/erp/content" },
        { label: "Review / ready", value: q.data?.review ?? 0, to: "/erp/content" },
      ]}
    />
  );
}

/** Cargo agent queue. */
function CargoPanel() {
  const q = useQuery({
    queryKey: ["staff-cargo"],
    staleTime: 60_000,
    queryFn: async () => {
      const count = async (statuses: string[]) => {
        const { count: c } = await supabase
          .from("imp_purchase_orders")
          .select("id", { count: "exact", head: true })
          .in("status", statuses as any);
        return c ?? 0;
      };
      const [ordered, transit, arrived] = await Promise.all([
        count(["ordered", "at_china_warehouse"]),
        count(["in_transit"]),
        count(["arrived_bd", "partially_received"]),
      ]);
      return { ordered, transit, arrived };
    },
  });
  return (
    <Panel
      title="Cargo & imports"
      icon={Ship}
      loading={q.isLoading}
      items={[
        { label: "Ordered / at warehouse", value: q.data?.ordered ?? 0, to: "/erp/imports/orders" },
        { label: "In transit", value: q.data?.transit ?? 0, to: "/erp/imports/incoming" },
        { label: "Arrived BD · receive baki", value: q.data?.arrived ?? 0, to: "/erp/imports/incoming" },
      ]}
    />
  );
}

/** Supply chain / inventory queue. */
function SupplyPanel({ brandIds }: { brandIds: string[] }) {
  const q = useQuery({
    queryKey: ["staff-supply", brandIds.join(",")],
    staleTime: 60_000,
    queryFn: async () => {
      const reorderBase = applyBrandScope(
        supabase.from("reorder_suggestions").select("id", { count: "exact", head: true }) as any,
        brandIds,
      );
      const alertBase = applyBrandScope(
        supabase.from("low_stock_alerts").select("id", { count: "exact", head: true }) as any,
        brandIds,
      );
      const [{ count: reorder }, { count: alerts }] = await Promise.all([
        reorderBase.eq("status", "pending"),
        alertBase,
      ]);
      return { reorder: reorder ?? 0, alerts: alerts ?? 0 };
    },
  });
  return (
    <Panel
      title="Supply chain"
      icon={Boxes}
      loading={q.isLoading}
      items={[
        { label: "Reorder suggestions", value: q.data?.reorder ?? 0, to: "/erp/reorder-queue" },
        { label: "Low stock alerts", value: q.data?.alerts ?? 0, to: "/erp/inventory/health" },
      ]}
    />
  );
}

/** Finance desk (no profit / cash position). */
function FinancePanel() {
  const q = useQuery({
    queryKey: ["staff-finance"],
    staleTime: 60_000,
    queryFn: async () => {
      const [{ count: bills }, { data: recon }] = await Promise.all([
        supabase
          .from("erp_bills")
          .select("id", { count: "exact", head: true })
          .neq("status", "paid"),
        supabase.from("erp_reconciliation_rows").select("match_status").limit(5000),
      ]);
      const unmatched = (recon ?? []).filter((r: any) => String(r.match_status) !== "matched").length;
      return { bills: bills ?? 0, unmatched };
    },
  });
  return (
    <Panel
      title="Finance desk"
      icon={Wallet2}
      loading={q.isLoading}
      items={[
        { label: "Unpaid bills", value: q.data?.bills ?? 0, to: "/erp/finance/receivables" },
        { label: "Reconciliation pending", value: q.data?.unmatched ?? 0, to: "/erp/reconciliation/pending" },
      ]}
    />
  );
}

/** Customer service queue. */
function ServicePanel({ brandIds }: { brandIds: string[] }) {
  const q = useQuery({
    queryKey: ["staff-cs", brandIds.join(",")],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const cartBase = applyBrandScope(
        supabase.from("abandoned_carts").select("id", { count: "exact", head: true }) as any,
        brandIds,
      );
      const [toConfirm, onHold, { count: carts }] = await Promise.all([
        orderCount(brandIds, (b: any) => b.in("status", ["new", "incomplete"])),
        orderCount(brandIds, (b: any) => b.in("status", ["on_hold"])),
        cartBase,
      ]);
      return { toConfirm, onHold, carts: carts ?? 0 };
    },
  });
  return (
    <Panel
      title="Customer service"
      icon={Headphones}
      loading={q.isLoading}
      items={[
        { label: "Confirm করা বাকি", value: q.data?.toConfirm ?? 0, to: "/erp/orders/list" },
        { label: "On hold", value: q.data?.onHold ?? 0, to: "/erp/orders/list" },
        { label: "Abandoned carts", value: q.data?.carts ?? 0, to: "/erp/crm" },
      ]}
    />
  );
}

/** Marketing queue. */
function MarketingPanel({ brandIds }: { brandIds: string[] }) {
  const q = useQuery({
    queryKey: ["staff-marketing", brandIds.join(",")],
    staleTime: 60_000,
    queryFn: async () => {
      const alertBase = applyBrandScope(
        supabase.from("mkt_alerts").select("id", { count: "exact", head: true }) as any,
        brandIds,
      );
      const { count: alerts } = await alertBase.neq("status", "resolved");
      return { alerts: alerts ?? 0 };
    },
  });
  return (
    <Panel
      title="Marketing"
      icon={Megaphone}
      loading={q.isLoading}
      items={[
        { label: "Open alerts", value: q.data?.alerts ?? 0, to: "/erp/marketing/alerts" },
        { label: "Campaign truth", value: "Open", to: "/erp/marketing/truth" },
      ]}
    />
  );
}

/**
 * Role-specific work panels for the staff dashboard.
 * A panel only mounts (and only queries) when the user actually holds the role.
 */
export function RolePanels({
  roles,
  brandIds,
  userId,
}: {
  roles: string[];
  brandIds: string[];
  userId: string | null;
}) {
  const has = (...rs: string[]) => rs.some((r) => roles.includes(r));
  const panels: React.ReactNode[] = [];

  if (has("packer", "warehouse_staff")) panels.push(<PackerPanel key="pack" brandIds={brandIds} userId={userId} />);
  if (has("marketing_manager", "moderator")) panels.push(<ContentPanel key="content" brandIds={brandIds} />);
  if (has("cargo_agent")) panels.push(<CargoPanel key="cargo" />);
  if (has("warehouse_staff", "operations")) panels.push(<SupplyPanel key="supply" brandIds={brandIds} />);
  if (has("accountant")) panels.push(<FinancePanel key="fin" />);
  if (has("customer_service", "operations")) panels.push(<ServicePanel key="cs" brandIds={brandIds} />);
  if (has("marketing_manager")) panels.push(<MarketingPanel key="mkt" brandIds={brandIds} />);

  if (panels.length === 0) return null;
  return <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{panels}</div>;
}
