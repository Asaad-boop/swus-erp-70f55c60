import { createFileRoute, Outlet } from "@tanstack/react-router";
import { HrSubnav } from "@/components/erp/hr/hr-shell";

export const Route = createFileRoute("/_authenticated/erp/hr")({
  component: HrLayout,
});

function HrLayout() {
  return (
    <div className="min-h-full">
      <HrSubnav />
      <Outlet />
    </div>
  );
}