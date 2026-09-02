import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { GrowthTabs, useGrowthRange } from "@/components/erp/growth/growth-filters";
import { FunnelPanel } from "@/components/erp/growth/pages/funnel";
import { ReportShell } from "@/components/erp/growth/pages/report";

const Search = z.object({ tab: z.enum(["reports", "funnel"]).catch("reports") });

export const Route = createFileRoute("/_authenticated/erp/growth/analytics")({
  validateSearch: Search,
  component: GrowthAnalyticsPage,
});

const TABS = [
  { key: "reports", label: "Reports" },
  { key: "funnel", label: "Funnel" },
];

function GrowthAnalyticsPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const { range } = useGrowthRange();
  return (
    <div>
      <GrowthTabs
        tabs={TABS}
        value={tab}
        onChange={(k) => navigate({ to: "/erp/growth/analytics", search: { tab: k as "reports" } })}
      />
      {tab === "reports" && <ReportShell />}
      {tab === "funnel" && <FunnelPanel range={range} />}
    </div>
  );
}
