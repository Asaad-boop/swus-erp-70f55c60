import { createFileRoute, Outlet } from "@tanstack/react-router";
import { GrowthSubnav } from "@/components/erp/growth/growth-shell";

export const Route = createFileRoute("/_authenticated/erp/growth")({
  component: GrowthLayout,
});

function GrowthLayout() {
  return (
    <div className="min-h-full">
      <GrowthSubnav />
      <Outlet />
    </div>
  );
}
