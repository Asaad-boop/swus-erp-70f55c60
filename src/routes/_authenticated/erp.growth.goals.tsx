import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { GrowthTabs } from "@/components/erp/growth/growth-filters";
import { GoalsPage } from "@/components/erp/growth/pages/goals";
import { PlanningPage } from "@/components/erp/growth/pages/planning";
import { TasksShell } from "@/components/erp/growth/pages/tasks";

const Search = z.object({ tab: z.enum(["goals", "projection", "tasks"]).catch("goals") });

export const Route = createFileRoute("/_authenticated/erp/growth/goals")({
  validateSearch: Search,
  component: GoalsAndPlanPage,
});

const TABS = [
  { key: "goals", label: "Goals & Forecast" },
  { key: "projection", label: "Monthly Projection" },
  { key: "tasks", label: "Task Board" },
];

function GoalsAndPlanPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <div>
      <GrowthTabs
        tabs={TABS}
        value={tab}
        onChange={(k) => navigate({ to: "/erp/growth/goals", search: { tab: k as "goals" } })}
      />
      {tab === "goals" && <GoalsPage />}
      {tab === "projection" && <PlanningPage />}
      {tab === "tasks" && <TasksShell />}
    </div>
  );
}
