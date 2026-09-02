import { createFileRoute } from "@tanstack/react-router";
import { RivalsPage } from "@/components/erp/growth/pages/rivals";

export const Route = createFileRoute("/_authenticated/erp/growth/market")({
  component: MarketIntelligencePage,
});

function MarketIntelligencePage() {
  return <RivalsPage />;
}
