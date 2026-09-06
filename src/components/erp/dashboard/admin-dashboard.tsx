import { useMemo } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Users, Wallet2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { useBrand } from "@/contexts/brand-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DashboardShell, useDashboardShellState, SectionLabel, KpiStrip, TrendChart,
  CourierCard, CodOutstandingCard, ReturnsCard, ImportsCard, InventoryHealth,
  LowStockList, MarketingCard, TopProducts, NeedsAttention, LiveOrdersFeed,
  TodayAnalytics, HourlyOrdersComparison, SystemFooter,
} from "@/components/erp/dashboard/shared";
import {
  StuckOrdersCard, CourierPerformanceCard, AbandonedCartRecoveryCard, NewVsReturningCard,
} from "@/components/erp/dashboard/widgets";
import { WebsiteOrdersOverview } from "@/components/erp/dashboard/website-orders-overview";
import { TeamTodayCard } from "@/components/erp/dashboard/admin/team-today-card";
import {
  OrderFlowTodayCard,
  CourierReturnTodayCard,
} from "@/components/erp/dashboard/admin/today-ops-cards";
import { TodayCommandPanel, LiveVisitors } from "@/components/erp/dashboard-command-center";

/**
 * ADMIN DASHBOARD — "Operations Control".
 * Operational controller view. Deliberately does NOT mount any owner-only
 * widget (net profit, cash position, payroll, profit RPCs), so that data is
 * never fetched here — not merely hidden.
 */
export function AdminDashboard({ actions }: { actions?: React.ReactNode }) {
  const { brandIds, brands, isAllBrands } = useBrand();
  const navigate = useNavigate();
  const enabled = brandIds.length > 0;
  const { mktRange, setMktRange, range, lastSync, refreshAll } = useDashboardShellState();

  return (
    <DashboardShell
      badge="Admin"
      badgeTone="admin"
      lastSync={lastSync}
      mktRange={mktRange}
      onRange={setMktRange}
      onRefresh={refreshAll}
      actions={actions}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TodayCommandPanel brandIds={brandIds} enabled={enabled} />
        <LiveVisitors />
      </div>

      <SectionLabel title="Team today" hint="Attendance live" />
      <TeamTodayCard />

      <SectionLabel title="Today's operations" hint="Order · courier · return" />
      <div className="grid grid-cols-1 gap-3">
        <OrderFlowTodayCard brandIds={brandIds} enabled={enabled} />
        <CourierReturnTodayCard brandIds={brandIds} enabled={enabled} />
      </div>

      <SectionLabel title="Order flow" hint={mktRange.label} />
      <KpiStrip brandIds={brandIds} enabled={enabled} range={range} onNav={(to) => navigate({ to: to as never })} />
      <WebsiteOrdersOverview brandIds={brandIds} enabled={enabled} range={range} rangeLabel={mktRange.label} />


      <SectionLabel title="Needs action" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <StuckOrdersCard brandIds={brandIds} enabled={enabled} />
        <CourierPerformanceCard brandIds={brandIds} enabled={enabled} range={range} />
      </div>
      <NeedsAttention brandIds={brandIds} enabled={enabled} />

      <SectionLabel title="Team & reconciliation" hint="Today" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TeamActivityCard brandIds={brandIds} enabled={enabled} />
        <ReconciliationPendingCard brandIds={brandIds} enabled={enabled} />
      </div>

      <SectionLabel title="Inventory" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <InventoryHealth brandIds={brandIds} enabled={enabled} />
        <div className="lg:col-span-2">
          <LowStockList brandIds={brandIds} enabled={enabled} />
        </div>
      </div>

      <SectionLabel title="Activity" />
      <TrendChart brandIds={brandIds} enabled={enabled} range={range} brands={brands} isAllBrands={isAllBrands} />
      <TodayAnalytics brandIds={brandIds} enabled={enabled} range={range} rangeLabel={mktRange.label} />
      <HourlyOrdersComparison brandIds={brandIds} enabled={enabled} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <NewVsReturningCard brandIds={brandIds} enabled={enabled} range={range} />
        <AbandonedCartRecoveryCard brandIds={brandIds} enabled={enabled} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <CourierCard brandIds={brandIds} enabled={enabled} range={range} />
        <CodOutstandingCard brandIds={brandIds} enabled={enabled} range={range} />
        <ReturnsCard brandIds={brandIds} enabled={enabled} range={range} />
        <ImportsCard brandIds={brandIds} enabled={enabled} range={range} />
      </div>
      <MarketingCard brandIds={brandIds} enabled={enabled} range={range} />
      <TopProducts brandIds={brandIds} enabled={enabled} range={range} />
      <LiveOrdersFeed brandIds={brandIds} enabled={enabled} />

      <SystemFooter lastSync={lastSync} />
    </DashboardShell>
  );
}

/** Who moved orders forward today + who is present. No payroll data. */
function TeamActivityCard({ brandIds, enabled }: { brandIds: string[]; enabled: boolean }) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);
  const ymd = new Date().toLocaleDateString("en-CA");

  const q = useQuery({
    queryKey: ["dash-team-activity", brandIds.join(","), today],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const [hist, present, profiles] = await Promise.all([
        supabase
          .from("order_status_history")
          .select("to_status, changed_by")
          .gte("created_at", today)
          .limit(2000),
        supabase
          .from("hr_attendance")
          .select("id, status")
          .eq("work_date", ymd),
        supabase.from("profiles").select("id, display_name").limit(500),
      ]);
      const nameOf = new Map<string, string>();
      for (const p of profiles.data ?? []) nameOf.set((p as any).id, (p as any).display_name ?? "—");

      const per = new Map<string, { confirmed: number; packed: number }>();
      for (const r of (hist.data ?? []) as any[]) {
        const by = r.changed_by as string | null;
        if (!by) continue;
        const row = per.get(by) ?? { confirmed: 0, packed: 0 };
        if (r.to_status === "confirmed") row.confirmed += 1;
        if (r.to_status === "packed" || r.to_status === "packaging") row.packed += 1;
        per.set(by, row);
      }
      const rows = [...per.entries()]
        .map(([id, v]) => ({ id, name: nameOf.get(id) ?? "Staff", ...v }))
        .filter((r) => r.confirmed + r.packed > 0)
        .sort((a, b) => b.confirmed + b.packed - (a.confirmed + a.packed))
        .slice(0, 8);

      const presentCount = (present.data ?? []).filter(
        (a: any) => a.status && a.status !== "absent",
      ).length;
      return { rows, presentCount };
    },
  });

  return (
    <Card className="border-slate-200 shadow-none">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-[13px] font-semibold flex items-center gap-1.5">
          <Users className="size-3.5 text-indigo-600" /> Team activity
        </CardTitle>
        <span className="text-[11px] text-slate-500">
          {q.data ? `${q.data.presentCount} present` : ""}
        </span>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {q.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : !q.data?.rows.length ? (
          <p className="text-[12px] text-slate-500">আজ এখনো কোনো order movement নেই।</p>
        ) : (
          q.data.rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-[12px] py-1 border-b border-slate-100 last:border-0">
              <span className="truncate text-slate-700">{r.name}</span>
              <span className="flex items-center gap-3 shrink-0 tabular-nums">
                <span className="text-emerald-600 inline-flex items-center gap-1">
                  <CheckCircle2 className="size-3" />{r.confirmed}
                </span>
                <span className="text-indigo-600">{r.packed} packed</span>
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/** Unmatched courier settlement rows + how much money is stuck. */
function ReconciliationPendingCard({ brandIds, enabled }: { brandIds: string[]; enabled: boolean }) {
  const q = useQuery({
    queryKey: ["dash-recon-pending", brandIds.join(",")],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      let base = supabase
        .from("erp_reconciliation_rows")
        .select("match_status, payout, amount_diff")
        .limit(5000);
      base = applyBrandScope(base as any, brandIds) as any;
      const { data, error } = await base;
      if (error) throw error;
      let unmatched = 0, mismatch = 0, stuck = 0;
      for (const r of (data ?? []) as any[]) {
        const st = String(r.match_status ?? "");
        if (st === "matched") {
          if (Math.abs(Number(r.amount_diff ?? 0)) > 1) mismatch += 1;
          continue;
        }
        unmatched += 1;
        stuck += Number(r.payout ?? 0);
      }
      return { unmatched, mismatch, stuck };
    },
  });

  return (
    <Card className="border-slate-200 shadow-none">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-[13px] font-semibold flex items-center gap-1.5">
          <Wallet2 className="size-3.5 text-amber-600" /> Reconciliation pending
        </CardTitle>
        <Link to="/erp/reconciliation/pending" className="text-[11px] text-indigo-600 hover:underline">
          Open
        </Link>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Unmatched" value={String(q.data?.unmatched ?? 0)} />
            <Metric label="Amount mismatch" value={String(q.data?.mismatch ?? 0)} tone="amber" />
            <Metric label="Stuck payout" value={"৳" + Math.round(q.data?.stuck ?? 0).toLocaleString("en-IN")} />
          </div>
        )}
        {(q.data?.unmatched ?? 0) > 0 && (
          <p className="mt-2 text-[11px] text-amber-600 flex items-center gap-1">
            <AlertTriangle className="size-3" /> এগুলো settle না হলে COD hisab মিলবে না।
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "amber" }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={"text-[16px] font-semibold tabular-nums " + (tone === "amber" ? "text-amber-600" : "text-slate-900")}>
        {value}
      </div>
    </div>
  );
}
