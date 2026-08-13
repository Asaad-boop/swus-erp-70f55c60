import { createFileRoute, Outlet } from "@tanstack/react-router";
import { MarketingSubnav } from "@/components/erp/marketing/marketing-shell";

export const Route = createFileRoute("/_authenticated/erp/marketing")({
  component: MarketingLayout,
});

function MarketingLayout() {
  return (
    <div className="min-h-full">
      <MarketingSubnav />
      <Outlet />
    </div>
  );
}
