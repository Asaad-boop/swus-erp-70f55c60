import { createFileRoute, Outlet } from "@tanstack/react-router";
import { HubSubnav } from "@/components/erp/hub/hub-shell";

export const Route = createFileRoute("/_authenticated/erp/growth")({
  component: HubLayout,
});

function HubLayout() {
  return (
    <div className="min-h-full">
      <HubSubnav />
      <Outlet />
    </div>
  );
}
