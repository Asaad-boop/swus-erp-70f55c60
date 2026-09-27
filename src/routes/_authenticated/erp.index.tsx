import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentRole } from "@/hooks/use-current-role";
import { hasAnyBackoffice } from "@/lib/erp/access";
import { OwnerDashboard } from "@/components/erp/dashboard/owner-dashboard";
import { AdminDashboard } from "@/components/erp/dashboard/admin-dashboard";
import { StaffDashboard } from "@/components/erp/dashboard/staff-dashboard";

export const Route = createFileRoute("/_authenticated/erp/")({
  head: () => ({ meta: [
    { title: "Owner Dashboard — SynqWithUs ERP" },
    { name: "description", content: "Live owner view of revenue, profit, orders, marketing, cash collection and operating risks." },
    { property: "og:title", content: "Owner Dashboard — SynqWithUs ERP" },
    { property: "og:description", content: "Live business performance, profitability and operating risk in one executive view." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: DashboardPage,
});

type DashView = "owner" | "admin" | "staff";

/**
 * Dashboard resolver.
 *   owner → Owner Dashboard   (Business Truth)
 *   admin → Admin Dashboard   (Operations Control)
 *   else  → Staff Dashboard   (My Work)
 *
 * Custom page-grant users are NOT admins: they land on the Staff dashboard
 * and their quick links follow their existing page grants.
 */
function DashboardPage() {
  const { roles, isOwner, isLoading } = useCurrentRole();
  const [view, setView] = useState<DashView>("owner");

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-muted/30">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!hasAnyBackoffice(roles)) {
    return (
      <div className="min-h-screen grid place-items-center bg-muted/30">
        <div className="max-w-md text-center space-y-2 p-6">
          <h2 className="text-lg font-semibold">Restricted</h2>
          <p className="text-sm text-muted-foreground">
            Your account doesn't have dashboard access. Contact an admin if this is unexpected.
          </p>
        </div>
      </div>
    );
  }

  if (isOwner) {
    // View switcher is presentation-only — roles/permissions are untouched.
    const switcher = <ViewSwitcher value={view} onChange={setView} />;
    if (view === "admin") return <AdminDashboard actions={switcher} />;
    if (view === "staff") return <StaffDashboard actions={switcher} />;
    return <OwnerDashboard actions={switcher} />;
  }

  if (roles.includes("admin")) return <AdminDashboard />;
  return <StaffDashboard />;
}

function ViewSwitcher({ value, onChange }: { value: DashView; onChange: (v: DashView) => void }) {
  const opts: { key: DashView; label: string }[] = [
    { key: "owner", label: "Owner" },
    { key: "admin", label: "Admin" },
    { key: "staff", label: "Staff" },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      <Eye className="size-3.5 ml-1.5 text-slate-400" />
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
            value === o.key
              ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
              : "text-slate-500 hover:text-slate-800",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
