import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, ListOrdered, BarChart3, Settings as SettingsIcon, Container, Truck, PackageSearch } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/imports")({
  head: () => ({ meta: [{ title: "Imports & Procurement — ERP" }] }),
  component: ImportsLayout,
});

const tabs = [
  { to: "/erp/imports", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/erp/imports/orders", label: "Purchase Orders", icon: ListOrdered },
  { to: "/erp/imports/incoming", label: "Incoming & QC", icon: PackageSearch },
  { to: "/erp/imports/agents", label: "Cargo Agents", icon: Truck },
  { to: "/erp/imports/reports", label: "Reports", icon: BarChart3 },
  { to: "/erp/imports/settings", label: "Settings", icon: SettingsIcon },
];


function ImportsLayout() {
  const location = useLocation();
  return (
    <div className="flex flex-col min-h-full">
      <div className="border-b border-border bg-card">
        <div className="px-4 md:px-6 pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Container className="h-4 w-4" />
            <span>Imports & Procurement</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">China Imports</h1>
          <p className="text-sm text-muted-foreground mt-1">Source → Pay → Ship → Receive → QC → Inventory.</p>
        </div>
        <nav className="flex gap-1 px-4 md:px-6 mt-4 overflow-x-auto">
          {tabs.map(({ to, label, icon: Icon, exact }) => {
            const active = exact ? location.pathname === to : location.pathname.startsWith(to) && (to !== "/erp/imports" || location.pathname === to);
            return (
              <Link
                key={to}
                to={to as never}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}