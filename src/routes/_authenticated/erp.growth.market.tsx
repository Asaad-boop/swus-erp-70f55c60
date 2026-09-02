import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { GrowthTabs, useGrowthRange } from "@/components/erp/growth/growth-filters";
import { OpportunityPanel } from "@/components/erp/growth/pages/opportunity";
import { RivalsPage } from "@/components/erp/growth/pages/rivals";

const Search = z.object({ tab: z.enum(["rivals", "opportunity"]).catch("rivals") });

export const Route = createFileRoute("/_authenticated/erp/growth/market")({
  validateSearch: Search,
  component: MarketIntelligencePage,
});

const TABS = [
  { key: "rivals", label: "Competitor Watch" },
  { key: "opportunity", label: "Product Opportunity" },
];

function MarketIntelligencePage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const { range } = useGrowthRange();
  return (
    <div>
      <GrowthTabs
        tabs={TABS}
        value={tab}
        onChange={(k) => navigate({ to: "/erp/growth/market", search: { tab: k as "rivals" } })}
      />
      {tab === "rivals" && <RivalsPage />}
      {tab === "opportunity" && <OpportunityPanel range={range} />}
    </div>
  );
}
