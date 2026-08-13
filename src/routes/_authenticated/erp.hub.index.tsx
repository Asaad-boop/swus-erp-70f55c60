import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Compass, Target, ListChecks, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { HubPageHeader } from "@/components/erp/hub/hub-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchGoalActuals, fetchGoals, fetchTasks, fmtValue } from "@/lib/erp/hub/hub-data";

export const Route = createFileRoute("/_authenticated/erp/hub/")({
  head: () => ({
    meta: [
      { title: "Growth Hub — Command Center" },
      {
        name: "description",
        content:
          "One place for monthly goals, today's tasks and overdue work across every brand — the team's growth command center.",
      },
      { property: "og:title", content: "Growth Hub — Command Center" },
      {
        property: "og:description",
        content: "Track vision, goals and daily execution against live ERP data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HubHome,
});

function HubHome() {
  const { brandIds, activeBrand } = useBrand();
  const today = new Date().toISOString().slice(0, 10);

  const goalsQ = useQuery({
    queryKey: ["hub-goals", brandIds],
    queryFn: () => fetchGoals(brandIds),
    enabled: brandIds.length > 0,
  });
  const actualsQ = useQuery({
    queryKey: ["hub-goal-actuals", brandIds],
    queryFn: () => fetchGoalActuals(brandIds),
    enabled: brandIds.length > 0,
  });
  const tasksQ = useQuery({
    queryKey: ["hub-tasks", brandIds],
    queryFn: () => fetchTasks(brandIds),
    enabled: brandIds.length > 0,
  });

  const goals = goalsQ.data ?? [];
  const tasks = tasksQ.data ?? [];

  const activeGoals = useMemo(
    () => goals.filter((g) => g.status === "active" && g.period_end >= today),
    [goals, today],
  );

  const dueToday = tasks.filter((t) => t.status !== "done" && t.due_date === today);
  const overdue = tasks.filter((t) => t.status !== "done" && t.due_date && t.due_date < today);
  const doing = tasks.filter((t) => t.status === "doing");
  const doneThisWeek = tasks.filter(
    (t) =>
      t.status === "done" &&
      t.completed_at &&
      new Date(t.completed_at).getTime() > Date.now() - 7 * 864e5,
  );

  const loading = goalsQ.isLoading || tasksQ.isLoading;

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-3 md:p-6">
      <HubPageHeader
        icon={Compass}
        title="Growth Hub"
        subtitle={
          activeBrand
            ? `${activeBrand.name} — goals, tasks এবং আজকের কাজ`
            : "All brands — goals, tasks এবং আজকের কাজ"
        }
        actions={
          <>
            <Button asChild size="sm" variant="outline">
              <Link to="/erp/hub/goals">
                <Target className="mr-1.5 h-4 w-4" /> Goals
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/erp/hub/tasks">
                <ListChecks className="mr-1.5 h-4 w-4" /> Task board
              </Link>
            </Button>
          </>
        }
      />

      {loading && <Skeleton className="h-40 w-full rounded-xl" />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Due today" value={dueToday.length} tone="primary" />
        <Stat label="Overdue" value={overdue.length} tone="destructive" />
        <Stat label="In progress" value={doing.length} />
        <Stat label="Done (7 days)" value={doneThisWeek.length} tone="success" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold">Active goals</h2>
              <Link to="/erp/hub/goals" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>
            {activeGoals.length === 0 && !loading && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                এই period-এ কোনো active goal নেই।
              </p>
            )}
            {activeGoals.slice(0, 6).map((g) => {
              const actual = actualsQ.data?.get(g.id) ?? g.current_value;
              const pct = g.target_value
                ? Math.max(0, Math.round((actual / g.target_value) * 100))
                : 0;
              return (
                <div key={g.id} className="space-y-1.5 rounded-lg border p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{g.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {fmtValue(actual, g.unit)} / {fmtValue(g.target_value, g.unit)}
                    </span>
                  </div>
                  <Progress value={Math.min(100, pct)} />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold">আজকের কাজ</h2>
              <Link to="/erp/hub/tasks" className="text-xs text-primary hover:underline">
                Open board
              </Link>
            </div>
            {overdue.length > 0 && (
              <div className="space-y-1.5">
                <p className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" /> Overdue
                </p>
                {overdue.slice(0, 5).map((t) => (
                  <TaskRow key={t.id} title={t.title} meta={t.due_date ?? ""} tone="destructive" />
                ))}
              </div>
            )}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Due today</p>
              {dueToday.length === 0 ? (
                <p className="inline-flex items-center gap-1 py-3 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" /> আজকের জন্য কিছু বাকি নেই।
                </p>
              ) : (
                dueToday.map((t) => (
                  <TaskRow key={t.id} title={t.title} meta={t.priority} />
                ))
              )}
            </div>
            {doing.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">In progress</p>
                {doing.slice(0, 5).map((t) => (
                  <TaskRow key={t.id} title={t.title} meta={t.due_date ?? "no due date"} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "primary" | "destructive" | "success";
}) {
  const color =
    tone === "destructive"
      ? "text-destructive"
      : tone === "success"
        ? "text-emerald-600 dark:text-emerald-400"
        : tone === "primary"
          ? "text-primary"
          : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`font-display text-2xl font-bold ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function TaskRow({
  title,
  meta,
  tone,
}: {
  title: string;
  meta: string;
  tone?: "destructive";
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
      <span className="truncate text-sm">{title}</span>
      <Badge
        variant={tone === "destructive" ? "destructive" : "secondary"}
        className="shrink-0 text-[10px] capitalize"
      >
        {meta}
      </Badge>
    </div>
  );
}
