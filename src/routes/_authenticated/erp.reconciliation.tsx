import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, FileSpreadsheet, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/reconciliation")({
  head: () => ({ meta: [{ title: "Reconciliation — ERP" }] }),
  component: ReconciliationLayout,
});

const tabs = [
  { to: "/erp/reconciliation", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/erp/reconciliation/pending", label: "Pending COD", icon: Clock, exact: false },
  { to: "/erp/reconciliation/outstanding", label: "Outstanding", icon: AlertCircle, exact: false },
  { to: "/erp/reconciliation/invoice", label: "Invoice Upload", icon: FileSpreadsheet, exact: false },
] as const;

function ReconciliationLayout() {
  const { pathname } = useLocation();
  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur px-4 md:px-6">
        <div className="flex items-center gap-1 overflow-x-auto">
          {tabs.map(({ to, label, icon: Icon, exact }) => {
            const active = exact ? pathname === to : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to as never}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-all duration-200 whitespace-nowrap rounded-t-md",
                  active
                    ? "border-primary text-foreground bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}