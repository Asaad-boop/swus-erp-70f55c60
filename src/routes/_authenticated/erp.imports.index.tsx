import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Package, Truck, Plane, Warehouse, CheckCircle2, AlertTriangle,
  Plus, ArrowRight, Wallet, TrendingUp, Container, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getImportsDashboardStats, listPurchaseOrders } from "@/lib/erp/imports/imports.functions";
import { PO_STATUS_LABEL, fmtBdt, type ImpPoStatus, type ImpCartonStatus } from "@/lib/erp/imports/types";
import { DateRangePicker, buildPreset, type MktRangeValue } from "@/components/erp/marketing/date-range-picker";

export const Route = createFileRoute("/_authenticated/erp/imports/")({
  head: () => ({ meta: [{ title: "Imports Dashboard — ERP" }] }),
  component: ImportsDashboard,
});

function diffDaysInclusive(from: string, to: string) {
  const a = new Date(from + "T00:00:00");
  const b = new Date(to + "T00:00:00");
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
}
function shiftIso(iso: string, deltaDays: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function ImportsDashboard() {
  const { brandIds } = useBrand();
  const brandKey = brandIds.join(",");
  const [range, setRange] = useState<MktRangeValue>(() => buildPreset("30d"));

  const statsFn = useServerFn(getImportsDashboardStats);
  const listFn = useServerFn(listPurchaseOrders);

  const prevRange = useMemo(() => {
    const span = diffDaysInclusive(range.from, range.to);
    return { from: shiftIso(range.from, -span), to: shiftIso(range.from, -1) };
  }, [range.from, range.to]);

  const { data, isLoading } = useQuery({
    queryKey: ["imp-dashboard", brandKey, range.from, range.to],
    enabled: brandIds.length > 0,
    queryFn: () => statsFn({ data: { brandIds, from: range.from, to: range.to } }),
  });

  const { data: prevData } = useQuery({
    queryKey: ["imp-dashboard-prev", brandKey, prevRange.from, prevRange.to],
    enabled: brandIds.length > 0,
    queryFn: () => statsFn({ data: { brandIds, from: prevRange.from, to: prevRange.to } }),
  });

  const { data: recent = [] } = useQuery({
    queryKey: ["imp-recent-pos", brandKey],
    enabled: brandIds.length > 0,
    queryFn: () => listFn({ data: { brandIds } }),
    select: (rows: any[]) => rows.slice(0, 6),
  });

  const pos = (data?.pos ?? []) as any[];
  const cartons = (data?.cartons ?? []) as any[];
  const prevPos = (prevData?.pos ?? []) as any[];

  const kpis = useMemo(() => {
    const totalSpend = pos.reduce((s, p) => s + Number(p.grand_total_bdt || 0), 0);
    const totalPaid = pos.reduce((s, p) => s + Number(p.paid_bdt || 0), 0);
    const totalDue = pos.reduce((s, p) => s + Number(p.due_bdt || 0), 0);
    const inFlight = pos.filter((p) => ["ordered", "at_china_warehouse", "in_transit", "arrived_bd", "partially_received"].includes(p.status)).length;
    return { totalSpend, totalPaid, totalDue, inFlight, poCount: pos.length };
  }, [pos]);

  const prevKpis = useMemo(() => {
    const totalSpend = prevPos.reduce((s, p) => s + Number(p.grand_total_bdt || 0), 0);
    const totalPaid = prevPos.reduce((s, p) => s + Number(p.paid_bdt || 0), 0);
    const totalDue = prevPos.reduce((s, p) => s + Number(p.due_bdt || 0), 0);
    return { totalSpend, totalPaid, totalDue, poCount: prevPos.length };
  }, [prevPos]);

  const pctDelta = (cur: number, prev: number) => {
    if (!prev) return null;
    return ((cur - prev) / prev) * 100;
  };

  const pipeline = useMemo(() => {
    const stages: { key: ImpCartonStatus; label: string; icon: any; tone: string }[] = [
      { key: "ordered", label: "Ordered", icon: Package, tone: "from-slate-500 to-slate-600" },
      { key: "at_china_warehouse", label: "At China WH", icon: Warehouse, tone: "from-amber-500 to-amber-600" },
      { key: "in_transit", label: "In Transit", icon: Plane, tone: "from-blue-500 to-blue-600" },
      { key: "arrived_bd", label: "Arrived BD", icon: Truck, tone: "from-violet-500 to-violet-600" },
      { key: "released", label: "Released", icon: ArrowRight, tone: "from-cyan-500 to-cyan-600" },
      { key: "in_stock", label: "In Stock", icon: CheckCircle2, tone: "from-emerald-500 to-emerald-600" },
    ];
    return stages.map((s) => {
      const stageCartons = cartons.filter((c) => c.status === s.key);
      return {
        ...s,
        count: stageCartons.length,
        pieces: stageCartons.reduce((sum, c) => sum + Number(c.expected_quantity || 0), 0),
      };
    });
  }, [cartons]);

  const statusBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    pos.forEach((p) => { counts[p.status] = (counts[p.status] || 0) + 1; });
    return Object.entries(counts).map(([k, v]) => ({ status: k as ImpPoStatus, count: v }));
  }, [pos]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangePicker value={range} onChange={setRange} />
        <div className="flex items-center gap-2">
          <Link to="/erp/imports/orders/new">
            <Button><Plus className="h-4 w-4 mr-1" />New Purchase Order</Button>
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="Total Spend" value={fmtBdt(kpis.totalSpend)} icon={TrendingUp} tone="text-blue-600" delta={pctDelta(kpis.totalSpend, prevKpis.totalSpend)} />
        <KpiCard label="Paid" value={fmtBdt(kpis.totalPaid)} icon={Wallet} tone="text-emerald-600" delta={pctDelta(kpis.totalPaid, prevKpis.totalPaid)} />
        <KpiCard label="Outstanding Due" value={fmtBdt(kpis.totalDue)} icon={AlertTriangle} tone="text-orange-600" delta={pctDelta(kpis.totalDue, prevKpis.totalDue)} deltaInverse />
        <KpiCard label="Active POs" value={String(kpis.inFlight)} icon={Container} tone="text-violet-600" />
        <KpiCard label="Total POs" value={String(kpis.poCount)} icon={Package} tone="text-slate-600" delta={pctDelta(kpis.poCount, prevKpis.poCount)} />
      </div>

      {/* Pipeline */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Cargo Pipeline</h2>
            <p className="text-xs text-muted-foreground">Carton flow across stages</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {pipeline.map((s) => (
            <div key={s.key} className="relative overflow-hidden rounded-lg border border-border bg-card p-4">
              <div className={`absolute -top-6 -right-6 h-20 w-20 rounded-full bg-gradient-to-br ${s.tone} opacity-10`} />
              <s.icon className="h-5 w-5 text-muted-foreground mb-2" />
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-2xl font-bold tabular-nums mt-1">{s.count}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{s.pieces.toLocaleString()} pcs</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Recent POs */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Recent Purchase Orders</h2>
            <Link to="/erp/imports/orders" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          {recent.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No purchase orders yet.</div>
          ) : (
            <div className="space-y-2">
              {recent.map((p: any) => (
                <Link
                  key={p.id}
                  to="/erp/imports/orders/$orderId"
                  params={{ orderId: p.id }}
                  className="flex items-center justify-between gap-3 rounded-md border border-border hover:border-primary/40 hover:bg-accent/50 px-3 py-2.5 transition"
                >
                  <ProductThumbStack items={p.items ?? []} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold">{p.po_number}</span>
                      {p.brand?.name && <Badge variant="outline" className="text-[10px]">{p.brand.name}</Badge>}
                      <Badge variant="secondary" className={PO_STATUS_LABEL[p.status as ImpPoStatus]?.tone}>
                        {PO_STATUS_LABEL[p.status as ImpPoStatus]?.label ?? p.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {(p.items ?? []).length > 0
                        ? `${(p.items ?? []).length} item${(p.items ?? []).length > 1 ? "s" : ""} · ${(p.items ?? []).reduce((s: number, i: any) => s + Number(i.quantity || 0), 0)} pcs`
                        : (p.agent?.name ?? "No agent")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums">{fmtBdt(p.grand_total_bdt)}</div>
                    <div className="text-[11px] text-muted-foreground">Due {fmtBdt(p.due_bdt)}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Status breakdown */}
        <Card className="p-5">
          <h2 className="text-lg font-semibold mb-3">Status Breakdown</h2>
          {statusBreakdown.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">{isLoading ? "Loading…" : "No data."}</div>
          ) : (
            <div className="space-y-2">
              {statusBreakdown.sort((a, b) => b.count - a.count).map((s) => {
                const meta = PO_STATUS_LABEL[s.status];
                const pct = (s.count / kpis.poCount) * 100;
                return (
                  <div key={s.status}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium">{meta?.label ?? s.status}</span>
                      <span className="tabular-nums text-muted-foreground">{s.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, tone, delta, deltaInverse }: { label: string; value: string; icon: any; tone: string; delta?: number | null; deltaInverse?: boolean }) {
  const hasDelta = delta !== undefined && delta !== null && isFinite(delta);
  const isUp = hasDelta && delta! > 0;
  const isFlat = hasDelta && Math.abs(delta!) < 0.05;
  // For "due", a decrease is good; flip color signal
  const good = deltaInverse ? !isUp : isUp;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${tone}`} />
      </div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      {hasDelta && !isFlat && (
        <div className={`mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium ${good ? "text-emerald-600" : "text-red-600"}`}>
          {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(delta!).toFixed(1)}% vs prev
        </div>
      )}
    </Card>
  );
}

export type PoThumbItem = {
  image_snapshot?: string | null;
  name_snapshot?: string | null;
  quantity?: number | null;
  /** Live catalog row — snapshot purono hoye gele ekhan theke fresh image/title newa hoy */
  product?: { title?: string | null; image?: string | null } | null;
};

/** Product-er current image/title ke priority dey, na thakle PO-er snapshot. */
export function poItemImage(it: PoThumbItem): string | null {
  return it.product?.image || it.image_snapshot || null;
}
export function poItemName(it: PoThumbItem): string {
  return it.product?.title || it.name_snapshot || "Unnamed item";
}

export function ProductThumbStack({ items, max = 4, size = "md" }: { items: PoThumbItem[]; max?: number; size?: "sm" | "md" }) {
  if (!items || items.length === 0) {
    return (
      <div className={`${size === "sm" ? "h-8 w-8" : "h-10 w-10"} rounded-md bg-muted border border-dashed border-border flex items-center justify-center flex-shrink-0`}>
        <Package className={size === "sm" ? "h-3.5 w-3.5 text-muted-foreground/60" : "h-4 w-4 text-muted-foreground/60"} />
      </div>
    );
  }
  const shown = items.slice(0, max);
  const extra = items.length - shown.length;
  const dim = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const offset = size === "sm" ? "-ml-2.5" : "-ml-3";
  return (
    <div className="flex items-center flex-shrink-0">
      {shown.map((it, idx) => (
        <div
          key={idx}
          className={`${dim} ${idx === 0 ? "" : offset} rounded-md border-2 border-background bg-muted overflow-hidden ring-1 ring-border`}
          title={`${poItemName(it)}${it.quantity ? ` × ${it.quantity}` : ""}`}
          style={{ zIndex: shown.length - idx }}
        >
          {poItemImage(it) ? (
            <img src={poItemImage(it)!} alt={poItemName(it)} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <Package className={size === "sm" ? "h-3.5 w-3.5 text-muted-foreground/60" : "h-4 w-4 text-muted-foreground/60"} />
            </div>
          )}
        </div>
      ))}
      {extra > 0 && (
        <div
          className={`${dim} ${offset} rounded-md border-2 border-background bg-muted ring-1 ring-border flex items-center justify-center text-[10px] font-semibold text-muted-foreground`}
          title={`+${extra} more`}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}