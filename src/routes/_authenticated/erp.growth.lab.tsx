import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { GrowthTabs } from "@/components/erp/growth/growth-filters";
import { ExperimentsPanel } from "@/components/erp/growth/pages/experiments";
import { LearningsPanel } from "@/components/erp/growth/pages/learnings";
import { RetentionPage } from "@/components/erp/growth/pages/retention";

const Search = z.object({ tab: z.enum(["experiments", "learnings", "retention"]).catch("experiments") });

export const Route = createFileRoute("/_authenticated/erp/growth/lab")({
  validateSearch: Search,
  component: GrowthLabPage,
});

const TABS = [
  { key: "experiments", label: "Experiments" },
  { key: "learnings", label: "Learning Database" },
  { key: "retention", label: "Retention & Upsell" },
];

function GrowthLabPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <div>
      <GrowthTabs
        tabs={TABS}
        value={tab}
        onChange={(k) => navigate({ to: "/erp/growth/lab", search: { tab: k as "experiments" } })}
      />
      {tab === "experiments" && <ExperimentsPanel />}
      {tab === "learnings" && <LearningsPanel />}
      {tab === "retention" && <RetentionPage />}
    </div>
  );
}
