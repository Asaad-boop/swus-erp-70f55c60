import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Compass,
  Target,
  ListChecks,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  Clapperboard,
  Repeat,
  Swords,
  Check,
  Inbox,
  ArrowRight,
} from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentRole } from "@/hooks/use-current-role";
import { HubPageHeader } from "@/components/erp/hub/hub-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchContentPlans,
  fetchGoalActuals,
  fetchGoals,
  fetchIdeas,
  fetchMyVotes,
  fetchTasks,
  fmtValue,
} from "@/lib/erp/hub/hub-data";
import { fetchCompetitorAssets, fetchRoutines, routineHitsDate } from "@/lib/erp/hub/hub-research";

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
  const qc = useQueryClient();
  const { userId } = useCurrentRole();
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
  const ideasQ = useQuery({
    queryKey: ["hub-ideas", brandIds],
    queryFn: () => fetchIdeas(brandIds),
    enabled: brandIds.length > 0,
  });
  const myVotesQ = useQuery({ queryKey: ["hub-my-votes"], queryFn: fetchMyVotes });
  const plansQ = useQuery({
    queryKey: ["hub-content-plans", brandIds],
    queryFn: () => fetchContentPlans(brandIds),
    enabled: brandIds.length > 0,
  });
  const routinesQ = useQuery({
    queryKey: ["hub-routines", brandIds],
    queryFn: () => fetchRoutines(brandIds),
    enabled: brandIds.length > 0,
  });
  const assetsQ = useQuery({
    queryKey: ["hub-competitor-assets", brandIds],
    queryFn: () => fetchCompetitorAssets(brandIds),
    enabled: brandIds.length > 0,
  });

  const completeTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("hub_tasks")
        .update({ status: "done", completed_at: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Task done ✅");
      qc.invalidateQueries({ queryKey: ["hub-tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
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

  /* ---- Needs my action ---- */
  const myTasks = useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            t.status !== "done" &&
            userId &&
            t.assignee_id === userId &&
            (!t.due_date || t.due_date <= today),
        )
        .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")),
    [tasks, userId, today],
  );

  const ideasToVote = useMemo(() => {
    const votes = myVotesQ.data;
    return (ideasQ.data ?? []).filter(
      (i) => (i.status === "voting" || i.status === "idea") && !votes?.get(i.id),
    );
  }, [ideasQ.data, myVotesQ.data]);

  const contentLate = useMemo(
    () =>
      (plansQ.data ?? []).filter(
        (p) =>
          !["live", "cancelled"].includes(p.status) && p.deadline && p.deadline <= today,
      ),
    [plansQ.data, today],
  );

  const routinesToday = useMemo(() => {
    const now = new Date();
    return (routinesQ.data ?? []).filter(
      (r) => routineHitsDate(r, now) && r.last_spawned_on !== today,
    );
  }, [routinesQ.data, today]);

  const actionCount =
    myTasks.length + ideasToVote.length + contentLate.length + routinesToday.length;

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

      {/* Needs my action */}
      <Card className="border-primary/25 bg-primary/[0.03]">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="inline-flex items-center gap-1.5 font-display text-sm font-semibold">
              <Inbox className="h-4 w-4 text-primary" /> আমার অ্যাকশন দরকার
              {actionCount > 0 && (
                <Badge className="ml-1 h-5 px-1.5 text-[10px]">{actionCount}</Badge>
              )}
            </h2>
          </div>

          {actionCount === 0 ? (
            <p className="inline-flex items-center gap-1.5 py-3 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> সব clear — তোমার জন্য কিছু বাকি
              নেই।
            </p>
          ) : (
            <div className="grid gap-2 lg:grid-cols-2">
              {myTasks.slice(0, 5).map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{t.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t.due_date ? `Due ${t.due_date}` : "No due date"} · {t.priority}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 px-2"
                    disabled={completeTask.isPending}
                    onClick={() => completeTask.mutate(t.id)}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}

              {ideasToVote.length > 0 && (
                <ActionLink
                  to="/erp/hub/products"
                  icon={Lightbulb}
                  label={`${ideasToVote.length}টা product idea তোমার vote-এর অপেক্ষায়`}
                />
              )}
              {contentLate.length > 0 && (
                <ActionLink
                  to="/erp/hub/content"
                  icon={Clapperboard}
                  label={`${contentLate.length}টা content plan deadline পার করেছে`}
                  tone="destructive"
                />
              )}
              {routinesToday.length > 0 && (
                <ActionLink
                  to="/erp/hub/routines"
                  icon={Repeat}
                  label={`আজকের ${routinesToday.length}টা routine এখনো task হয়নি`}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

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

      {/* Module pulse */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PulseCard
          to="/erp/hub/products"
          icon={Lightbulb}
          title="Product pipeline"
          value={(ideasQ.data ?? []).filter((i) => i.status !== "rejected").length}
          hint="active ideas"
        />
        <PulseCard
          to="/erp/hub/content"
          icon={Clapperboard}
          title="Content journey"
          value={(plansQ.data ?? []).filter((p) => !["live", "cancelled"].includes(p.status)).length}
          hint="in production"
        />
        <PulseCard
          to="/erp/hub/routines"
          icon={Repeat}
          title="Routines"
          value={(routinesQ.data ?? []).filter((r) => r.active).length}
          hint="active routines"
        />
        <PulseCard
          to="/erp/hub/rivals"
          icon={Swords}
          title="Rival pages"
          value={(assetsQ.data ?? []).length}
          hint="swipe file items"
        />
      </div>
    </div>
  );
}

function ActionLink({
  to,
  icon: Icon,
  label,
  tone,
}: {
  to: string;
  icon: typeof Lightbulb;
  label: string;
  tone?: "destructive";
}) {
  return (
    <Link
      to={to}
      className={`flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm transition-colors hover:bg-muted ${
        tone === "destructive" ? "border-destructive/40 text-destructive" : ""
      }`}
    >
      <span className="inline-flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
    </Link>
  );
}

function PulseCard({
  to,
  icon: Icon,
  title,
  value,
  hint,
}: {
  to: string;
  icon: typeof Lightbulb;
  title: string;
  value: number;
  hint: string;
}) {
  return (
    <Link to={to}>
      <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/40">
        <CardContent className="flex items-center gap-3 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{title}</p>
            <p className="font-display text-lg font-bold leading-tight">
              {value}{" "}
              <span className="text-[11px] font-normal text-muted-foreground">{hint}</span>
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
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
