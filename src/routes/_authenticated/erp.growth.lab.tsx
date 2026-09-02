import { createFileRoute } from "@tanstack/react-router";
import { RetentionPage } from "@/components/erp/growth/pages/retention";

export const Route = createFileRoute("/_authenticated/erp/growth/lab")({
  component: GrowthLabPage,
});

function GrowthLabPage() {
  return <RetentionPage />;
}
