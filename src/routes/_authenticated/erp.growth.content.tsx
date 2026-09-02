import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { GrowthTabs } from "@/components/erp/growth/growth-filters";
import { PipelinePage } from "@/components/erp/growth/pages/pipeline";
import { IntakePage } from "@/components/erp/growth/pages/intake";
import { PeopleShell } from "@/components/erp/growth/pages/creators";

const Search = z.object({ tab: z.enum(["pipeline", "requests", "creators"]).catch("pipeline") });

export const Route = createFileRoute("/_authenticated/erp/growth/content")({
  validateSearch: Search,
  component: ContentEnginePage,
});

const TABS = [
  { key: "pipeline", label: "Pipeline" },
  { key: "requests", label: "Requests & Intake" },
  { key: "creators", label: "Creators & Agencies" },
];

function ContentEnginePage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <div>
      <GrowthTabs
        tabs={TABS}
        value={tab}
        onChange={(k) => navigate({ to: "/erp/growth/content", search: { tab: k as "pipeline" } })}
      />
      {tab === "pipeline" && <PipelinePage />}
      {tab === "requests" && <IntakePage />}
      {tab === "creators" && <PeopleShell />}
    </div>
  );
}
