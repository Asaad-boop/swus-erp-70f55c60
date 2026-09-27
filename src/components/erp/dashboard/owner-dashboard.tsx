import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Activity, CircleDollarSign, Radar } from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import {
  DashboardShell, useDashboardShellState, SectionLabel, OwnerTabs, KpiStrip,
  BrandComparison, TopCustomers, SystemFooter, type OwnerTab,
} from "@/components/erp/dashboard/shared";
import {
  NetProfitCard, CodRemittancePipelineCard, RoasComparisonCard,
  AdWalletBalanceCard, ReturnRateByProductCard,
} from "@/components/erp/dashboard/widgets";
import { ProductDangerZone } from "@/components/erp/dashboard-command-center";
import { TeamCostCard } from "@/components/erp/dashboard/team-cost-card";
import { MonthPaceCard } from "@/components/erp/dashboard/month-pace-card";
import {
  ExecutiveKpi, NeedsYourAttention, PerformanceTrend, TargetForecast,
  MarketingPerformance, OrderHealth, InventoryIntelligence, ProductPerformance,
  CashAndFinance, ExpenseOverview, TeamOpsSummary, BusinessHealthScore, RecentActivity,
} from "@/components/erp/dashboard/owner-suite";

/**
 * OWNER DASHBOARD — "Business Truth".
 * Only rendered for the `owner` role (or an owner using the view switcher).
 * This is the ONLY dashboard allowed to query profit / cash / payroll data.
 */
export function OwnerDashboard({ actions }: { actions?: React.ReactNode }) {
  const { brandIds, isAllBrands, brands } = useBrand();
  const navigate = useNavigate();
  const enabled = brandIds.length > 0;
  const { mktRange, setMktRange, range, lastSync, refreshAll } = useDashboardShellState();
  const [tab, setTab] = useState<OwnerTab>("overview");

  return (
    <DashboardShell
      badge="Owner"
      badgeTone="owner"
      title="Executive Operating View"
      subtitle="Live business performance, profitability and operating risk"
      className="owner-command-center"
      lastSync={lastSync}
      mktRange={mktRange}
      onRange={setMktRange}
      onRefresh={refreshAll}
      actions={actions}
    >
      <OwnerTabs value={tab} onChange={setTab} />

      {tab === "overview" && (
        <>
          <div className="owner-briefing">
            <div>
              <span className="owner-eyebrow"><Radar className="size-3.5" /> Business briefing</span>
              <h2>Today’s business, at a glance</h2>
              <p>{mktRange.label} performance compared with the previous period.</p>
            </div>
            <div className="owner-live"><span /> Live operating view</div>
          </div>

          <SectionLabel title="Financial pulse" hint={`${mktRange.label} · vs previous period`} />
          <ExecutiveKpi brandIds={brandIds} enabled={enabled} range={range} compareLabel="vs prev" />

          <SectionLabel title="Performance & profit" hint="Click Net Profit for the full cost trail" />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
            <div className="xl:col-span-3">
              <PerformanceTrend brandIds={brandIds} enabled={enabled} range={range} />
            </div>
            <div className="xl:col-span-2">
              <NetProfitCard brandIds={brandIds} enabled={enabled} range={range} />
            </div>
          </div>

          <SectionLabel title="Needs your attention" hint="Priority signals across the business" />
          <NeedsYourAttention brandIds={brandIds} enabled={enabled} range={range} />

          <div className="owner-section-heading">
            <div className="owner-section-icon owner-section-icon-blue"><Activity className="size-4" /></div>
            <div><h3>Operations pulse</h3><p>Momentum, collections and the month-end outlook</p></div>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <TargetForecast brandIds={brandIds} enabled={enabled} />
            </div>
            <MonthPaceCard brandIds={brandIds} enabled={enabled} />
          </div>

          <div className="owner-section-heading">
            <div className="owner-section-icon owner-section-icon-green"><CircleDollarSign className="size-4" /></div>
            <div><h3>Cash collection</h3><p>Courier remittance movement for the selected period</p></div>
          </div>
          <CodRemittancePipelineCard brandIds={brandIds} enabled={enabled} range={range} />
        </>
      )}

      {tab === "marketing" && (
        <>
          <SectionLabel title="Marketing performance" hint={mktRange.label} />
          <MarketingPerformance brandIds={brandIds} enabled={enabled} range={range} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <RoasComparisonCard brandIds={brandIds} enabled={enabled} range={range} />
            <AdWalletBalanceCard brandIds={brandIds} enabled={enabled} />
          </div>
        </>
      )}

      {tab === "sales" && (
        <>
          <SectionLabel title="Order & sales health" hint={mktRange.label} />
          <OrderHealth brandIds={brandIds} enabled={enabled} range={range} />
          <KpiStrip variant="owner" brandIds={brandIds} enabled={enabled} range={range} onNav={(to) => navigate({ to: to as never })} />
          <SectionLabel title="Inventory intelligence" />
          <InventoryIntelligence brandIds={brandIds} enabled={enabled} range={range} />
        </>
      )}

      {tab === "products" && (
        <>
          <SectionLabel title="Product performance" hint={mktRange.label} />
          <ProductPerformance brandIds={brandIds} enabled={enabled} range={range} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ReturnRateByProductCard brandIds={brandIds} enabled={enabled} range={range} />
            <ProductDangerZone brandIds={brandIds} enabled={enabled} range={range} />
          </div>
          {isAllBrands && brands.length > 1 && (
            <>
              <SectionLabel title="Brand comparison" />
              <BrandComparison brands={brands} range={range} />
            </>
          )}
        </>
      )}

      {tab === "finance" && (
        <>
          <SectionLabel title="Cash & finance" hint={mktRange.label} />
          <CashAndFinance brandIds={brandIds} enabled={enabled} range={range} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <NetProfitCard brandIds={brandIds} enabled={enabled} range={range} />
            <CodRemittancePipelineCard brandIds={brandIds} enabled={enabled} range={range} />
          </div>
          <SectionLabel title="Expenses" />
          <ExpenseOverview brandIds={brandIds} enabled={enabled} />
        </>
      )}

      {tab === "team" && (
        <>
          <SectionLabel title="Team & operations" />
          <TeamOpsSummary brandIds={brandIds} enabled={enabled} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <TeamCostCard brandIds={brandIds} enabled={enabled} />
            <TopCustomers brandIds={brandIds} enabled={enabled} range={range} />
          </div>
          <SectionLabel title="Business health score" />
          <BusinessHealthScore brandIds={brandIds} enabled={enabled} range={range} />
          <SectionLabel title="Recent activity" />
          <RecentActivity brandIds={brandIds} enabled={enabled} />
        </>
      )}

      <SystemFooter lastSync={lastSync} />
    </DashboardShell>
  );
}
