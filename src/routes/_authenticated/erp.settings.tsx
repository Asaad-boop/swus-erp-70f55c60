import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Building, Building2, FileText, Truck, Wallet, Bell, Plug, Users, Database, AlertTriangle, ContactRound, BarChart3, Facebook, MessageSquare,
} from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { BusinessSettings } from "@/components/erp/settings/business-settings";
import { BrandsSection } from "@/components/erp/settings/sections/brands-section";
import { InvoiceOrdersSection } from "@/components/erp/settings/sections/invoice-orders-section";
import { CourierSection } from "@/components/erp/settings/sections/courier-section";
import { FinanceSection } from "@/components/erp/settings/sections/finance-section";
import { NotificationsSection } from "@/components/erp/settings/sections/notifications-section";
import { IntegrationsSection } from "@/components/erp/settings/sections/integrations-section";
import { UsersSection } from "@/components/erp/settings/sections/users-section";
import { DataSystemSection } from "@/components/erp/settings/sections/data-system-section";
import { DangerZoneSection } from "@/components/erp/settings/sections/danger-zone-section";
import { CrmCustomFieldsSection } from "@/components/erp/settings/sections/crm-section";
import { AnalyticsSection } from "@/components/erp/settings/sections/analytics-section";
import { TrackingSection } from "@/components/erp/settings/sections/tracking-section";
import { SmsSection } from "@/components/erp/settings/sections/sms-section";
import { cn } from "@/lib/utils";
import { useCurrentRole } from "@/hooks/use-current-role";

export const Route = createFileRoute("/_authenticated/erp/settings")({
  head: () => ({ meta: [{ title: "Settings — ERP" }] }),
  component: SettingsPage,
});

type SectionId =
  | "business" | "brands" | "invoice" | "courier" | "finance"
  | "notifications" | "sms" | "integrations" | "analytics" | "tracking" | "crm" | "users" | "data" | "danger";

type SectionDef = {
  id: SectionId;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  perBrand: boolean;
  adminOnly?: boolean;
};

const SECTIONS: SectionDef[] = [
  { id: "business",      label: "Business Profile", description: "Identity, contact, legal & defaults", icon: Building,       perBrand: true  },
  { id: "brands",        label: "Brands",           description: "Add, edit, default brand",            icon: Building2,      perBrand: false },
  { id: "invoice",       label: "Invoice & Orders", description: "Template, numbering, workflow",       icon: FileText,       perBrand: true  },
  { id: "courier",       label: "Courier",          description: "Pathao, Steadfast, status mapping",   icon: Truck,          perBrand: true  },
  { id: "finance",       label: "Finance",          description: "Accounting, FX, tax defaults",        icon: Wallet,         perBrand: true  },
  { id: "notifications", label: "Notifications",    description: "Alerts, daily summaries",             icon: Bell,           perBrand: true  },
  { id: "sms",           label: "SMS (BulkSMSBD)",  description: "Order, pre-order & custom SMS",       icon: MessageSquare,  perBrand: true  },
  { id: "integrations",  label: "Integrations",     description: "Meta, Gemini, webhooks",              icon: Plug,           perBrand: true  },
  { id: "analytics",     label: "Analytics & Tracking", description: "GA4, Clarity, Pixel, retention", icon: BarChart3,      perBrand: true  },
  { id: "tracking",      label: "Meta Pixel & CAPI",    description: "Per-brand Pixel, CAPI, UTM, status", icon: Facebook,    perBrand: false },
  { id: "crm",           label: "CRM Custom Fields", description: "Per-customer custom data fields",    icon: ContactRound,   perBrand: true,  adminOnly: true },
  { id: "users",         label: "Users",            description: "Roles & brand access",                icon: Users,          perBrand: false, adminOnly: true },
  { id: "data",          label: "Data & System",    description: "Exports, activity, info",             icon: Database,       perBrand: true  },
  { id: "danger",        label: "Danger Zone",      description: "Destructive actions",                 icon: AlertTriangle,  perBrand: true,  adminOnly: true },
];

function SettingsPage() {
  const { brands, activeBrand } = useBrand();
  const { isAdmin } = useCurrentRole();
  const [section, setSection] = useState<SectionId>("business");
  const [brandId, setBrandId] = useState<string>(() => activeBrand?.id ?? brands[0]?.id ?? "");

  useEffect(() => {
    if (brands.length === 0) return;
    if (!brandId || !brands.some((b) => b.id === brandId)) {
      setBrandId(activeBrand?.id ?? brands[0].id);
    }
  }, [brands, activeBrand?.id, brandId]);

  const visibleSections = useMemo(
    () => SECTIONS.filter((s) => !s.adminOnly || isAdmin),
    [isAdmin],
  );
  const currentDef = SECTIONS.find((s) => s.id === section)!;

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-card">
        <div className="px-4 md:px-6 py-4">
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configure brands, finance, integrations and team.</p>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row gap-0 min-h-[calc(100vh-90px)]">
        {/* LEFT NAV */}
        <aside className="lg:w-64 lg:shrink-0 border-r bg-card lg:min-h-[calc(100vh-90px)]">
          <nav className="p-2 space-y-0.5">
            {visibleSections.map((s) => {
              const Icon = s.icon;
              const active = s.id === section;
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={cn(
                    "w-full flex items-start gap-3 px-3 py-2.5 rounded-md text-left transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-accent text-foreground/80",
                  )}
                >
                  <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", s.id === "danger" && "text-destructive")} />
                  <span className="flex-1 min-w-0">
                    <span className={cn("block text-sm font-medium", s.id === "danger" && "text-destructive")}>{s.label}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">{s.description}</span>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* RIGHT CONTENT */}
        <main className="flex-1 p-4 md:p-6 space-y-4 min-w-0">
          {/* Per-brand picker — only when section is per-brand */}
          {currentDef.perBrand && brands.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-card px-3 py-2 shadow-sm">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Editing brand:</span>
              <div className="flex flex-wrap gap-1">
                {brands.map((b) => {
                  const a = b.id === brandId;
                  return (
                    <button
                      key={b.id}
                      onClick={() => setBrandId(b.id)}
                      className={cn(
                        "px-3 py-1 rounded-md text-xs font-semibold transition-colors",
                        a ? "bg-primary text-primary-foreground" : "bg-background border hover:bg-accent",
                      )}
                    >
                      {b.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {currentDef.perBrand && !brandId ? (
            <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">No brand available — create one in the Brands section.</div>
          ) : (
            <SectionRouter section={section} brandId={brandId} />
          )}
        </main>
      </div>
    </div>
  );
}

function SectionRouter({ section, brandId }: { section: SectionId; brandId: string }) {
  switch (section) {
    case "business":      return <BusinessSettings key={brandId} brandIdOverride={brandId} />;
    case "brands":        return <BrandsSection />;
    case "invoice":       return <InvoiceOrdersSection key={brandId} brandId={brandId} />;
    case "courier":       return <CourierSection key={brandId} brandId={brandId} />;
    case "finance":       return <FinanceSection key={brandId} brandId={brandId} />;
    case "notifications": return <NotificationsSection key={brandId} brandId={brandId} />;
    case "sms":           return <SmsSection key={brandId} brandId={brandId} />;
    case "integrations":  return <IntegrationsSection key={brandId} brandId={brandId} />;
    case "analytics":     return <AnalyticsSection key={brandId} brandId={brandId} />;
    case "tracking":      return <TrackingSection />;
    case "crm":           return <CrmCustomFieldsSection key={brandId} brandId={brandId} />;
    case "users":         return <UsersSection />;
    case "data":          return <DataSystemSection key={brandId} brandId={brandId} />;
    case "danger":        return <DangerZoneSection key={brandId} brandId={brandId} />;
    default:              return null;
  }
}