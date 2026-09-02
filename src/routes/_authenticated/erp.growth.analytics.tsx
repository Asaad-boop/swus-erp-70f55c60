import { createFileRoute } from "@tanstack/react-router";
import { ReportShell } from "@/components/erp/growth/pages/report";

export const Route = createFileRoute("/_authenticated/erp/growth/analytics")({
  component: GrowthAnalyticsPage,
});

function GrowthAnalyticsPage() {
  return <ReportShell />;
}
