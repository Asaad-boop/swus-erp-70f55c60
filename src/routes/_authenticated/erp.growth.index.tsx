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
  Users,
  Building2,
  
  PackageOpen,
  CalendarDays,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentRole } from "@/hooks/use-current-role";
import { GrowthPageHeader } from "@/components/erp/growth/growth-shell";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  bdt,
  fetchAgencies,
  fetchCreators,
  fetchIntake,
  fetchItems,
  fetchMediaPlans,
  mediaPlanEconomics,
  PIPELINE_STAGES,
} from "@/lib/erp/content/content-data";
import {
  fetchGoalActuals,
  fetchGoals,
  fetchIdeas,
  fetchMyVotes,
  fetchTasks,
  fmtValue,
} from "@/lib/erp/hub/hub-data";
import { fetchCompetitorAssets, fetchRoutines, routineHitsDate } from "@/lib/erp/hub/hub-research";

export const Route = createFileRoute("/_authenticated/erp/growth/")({
  head: () => ({
    meta: [
      { title: "Growth Studio — Command Center" },
      {
        name: "description",
        content:
          "Live overview of goals, tasks, content pipeline, media budgets and creator network across every brand.",
      },
      { property: "og:title", content: "Growth Studio — Command Center" },
      {
        property: "og:description",
        content: "Goals, execution, content output and media spend in one growth dashboard.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GrowthCommandCenter,
});

const DAY = 86_400_000;

function GrowthCommandCenter() {
  const { brandIds, activeBrand } = useBrand();
  const qc = useQueryClient();
  const { userId } = useCurrentRole();
  const today = new Date().toISOString().slice(0, 10);
  const enabled = brandIds.length > 0;

  const goalsQ = useQuery({ queryKey: ["hub-goals", brandIds], queryFn: () => fetchGoals(brandIds), enabled });
  const actualsQ = useQuery({ queryKey: ["hub-goal-actuals", brandIds], queryFn: () => fetchGoalActuals(brandIds), enabled });
  const tasksQ = useQuery({ queryKey: ["hub-tasks", brandIds], queryFn: () => fetchTasks(brandIds), enabled });
  const ideasQ = useQuery({ queryKey: ["hub-ideas", brandIds], queryFn: () => fetchIdeas(brandIds), enabled });
  const myVotesQ = useQuery({ queryKey: ["hub-my-votes"], queryFn: fetchMyVotes });
  const itemsQ = useQuery({ queryKey: ["content-items", brandIds], queryFn: () => fetchItems(brandIds), enabled });
  const mediaQ = useQuery({ queryKey: ["content-media-plans", brandIds], queryFn: () => fetchMediaPlans(brandIds), enabled });
  const creatorsQ = useQuery({ queryKey: ["content-creators", brandIds], queryFn: () => fetchCreators(brandIds), enabled });
  const agenciesQ = useQuery({ queryKey: ["content-agencies", brandIds], queryFn: () => fetchAgencies(brandIds), enabled });
  const intakeQ = useQuery({ queryKey: ["content-intake", brandIds], queryFn: () => fetchIntake(brandIds), enabled });
  const routinesQ = useQuery({ queryKey: ["hub-routines", brandIds], queryFn: () => fetchRoutines(brandIds), enabled });
  const assetsQ = useQuery({ queryKey: ["hub-competitor-assets", brandIds], queryFn: () => fetchCompetitorAssets(brandIds), enabled });

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
  const items = itemsQ.data ?? [];
  const mediaPlans = mediaQ.data ?? [];
  const creators = creatorsQ.data ?? [];
  const agencies = agenciesQ.data ?? [];
  const intake = intakeQ.data ?? [];
  const loading = goalsQ.isLoading || tasksQ.isLoading || itemsQ.isLoading;

  /* ---------------- Goals + pace ---------------- */
  const activeGoals = useMemo(
    () => goals.filter((g) => g.status === "active" && g.period_end >= today),
    [goals, today],
  );

  const goalRows = useMemo(
    () =>
      activeGoals.map((g) => {
        const actual = actualsQ.data?.get(g.id) ?? g.current_value;
        const pct = g.target_value > 0 ? (actual / g.target_value) * 100 : 0;
        const start = new Date(g.period_start).getTime();
        const end = new Date(g.period_end).getTime();
        const elapsed =
          end > start ? Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100)) : 0;
        const daysLeft = Math.max(0, Math.ceil((end - Date.now()) / DAY));
        return { goal: g, actual, pct, elapsed, daysLeft, onTrack: pct + 5 >= elapsed };
      }),
    [activeGoals, actualsQ.data],
  );
  const onTrackCount = goalRows.filter((r) => r.onTrack).length;

  /* ---------------- Tasks ---------------- */
  const openTasks = tasks.filter((t) => t.status !== "done");
  const dueToday = openTasks.filter((t) => t.due_date === today);
  const overdue = openTasks.filter((t) => t.due_date && t.due_date < today);
  const doing = tasks.filter((t) => t.status === "doing");
  const doneThisWeek = tasks.filter(
    (t) => t.status === "done" && t.completed_at && new Date(t.completed_at).getTime() > Date.now() - 7 * DAY,
  );

  /* ---------------- Content ---------------- */
  const inProduction = items.filter((i) => !["published", "rejected"].includes(i.status));
  const published30 = items.filter(
    (i) => i.published_at && new Date(i.published_at).getTime() > Date.now() - 30 * DAY,
  );
  const contentLate = inProduction.filter((i) => i.due_date && i.due_date <= today);
  const awaitingReview = items.filter((i) => i.status === "in_review" || i.status === "submitted");
  const stageCounts = useMemo(
    () =>
      PIPELINE_STAGES.map((s) => ({
        ...s,
        count: items.filter((i) => i.stage === s.key).length,
      })),
    [items],
  );
  const maxStage = Math.max(1, ...stageCounts.map((s) => s.count));
  const contentSpend30 = published30.reduce((s, i) => s + (i.cost || 0), 0);
  const views30 = published30.reduce((s, i) => s + (i.views || 0), 0);
  const attributed30 = published30.reduce((s, i) => s + (i.attributed_orders || 0), 0);

  /* ---------------- Media plans ---------------- */
  const liveMedia = mediaPlans.filter((p) => p.status === "active" || p.status === "running");
  const mediaRows = useMemo(
    () => (liveMedia.length ? liveMedia : mediaPlans.slice(0, 4)).slice(0, 5).map((p) => ({ plan: p, econ: mediaPlanEconomics(p) })),
    [liveMedia, mediaPlans],
  );

  /* ---------------- People & market ---------------- */
  const activeCreators = creators.filter((c) => c.status === "active" || c.negotiation_status === "working");
  const creatorLeads = creators.filter((c) => ["new", "contacted", "negotiating"].includes(c.negotiation_status));
  const intakeNeedsContent = intake.filter((r) => r.content_count === 0);

  /* ---------------- Team workload ---------------- */
  const assigneeIds = useMemo(
    () => Array.from(new Set(tasks.map((t) => t.assignee_id).filter(Boolean) as string[])),
    [tasks],
  );
  const namesQ = useQuery({
    queryKey: ["growth-assignee-names", assigneeIds],
    enabled: assigneeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", assigneeIds);
      if (error) throw error;
      const m = new Map<string, string>();
      for (const p of data ?? []) m.set(p.id, p.display_name ?? "—");
      return m;
    },
  });

  const teamRows = useMemo(() => {
    const map = new Map<string, { id: string; open: number; overdue: number; doing: number; done7: number }>();
    for (const t of tasks) {
      const id = t.assignee_id;
      if (!id) continue;
      const cur = map.get(id) ?? { id, open: 0, overdue: 0, doing: 0, done7: 0 };
      if (t.status === "done") {
        if (t.completed_at && new Date(t.completed_at).getTime() > Date.now() - 7 * DAY) cur.done7 += 1;
      } else {
        cur.open += 1;
        if (t.status === "doing") cur.doing += 1;
        if (t.due_date && t.due_date < today) cur.overdue += 1;
      }
      map.set(id, cur);
    }
    return Array.from(map.values())
      .filter((r) => r.open > 0 || r.done7 > 0)
      .sort((a, b) => b.open - a.open || b.overdue - a.overdue);
  }, [tasks, today]);

  /* ---------------- Needs my action ---------------- */
  const myTasks = useMemo(
    () =>
      openTasks
        .filter((t) => userId && t.assignee_id === userId && (!t.due_date || t.due_date <= today))
        .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")),
    [openTasks, userId, today],
  );

  const ideasToVote = useMemo(() => {
    const votes = myVotesQ.data;
    return (ideasQ.data ?? []).filter(
      (i) => (i.status === "voting" || i.status === "idea") && !votes?.get(i.id),
    );
  }, [ideasQ.data, myVotesQ.data]);

  const routinesToday = useMemo(() => {
    const now = new Date();
    return (routinesQ.data ?? []).filter((r) => routineHitsDate(r, now) && r.last_spawned_on !== today);
  }, [routinesQ.data, today]);

  const actionCount =
    myTasks.length + ideasToVote.length + contentLate.length + routinesToday.length + awaitingReview.length;

  /* ---------------- Next 7 days ---------------- */
  const upcoming = useMemo(() => {
    const limit = new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10);
    const rows: { date: string; label: string; kind: "task" | "content" | "media" }[] = [];
    for (const t of openTasks)
      if (t.due_date && t.due_date >= today && t.due_date <= limit)
        rows.push({ date: t.due_date, label: t.title, kind: "task" });
    for (const i of inProduction)
      if (i.due_date && i.due_date >= today && i.due_date <= limit)
        rows.push({ date: i.due_date, label: i.title || i.code, kind: "content" });
    for (const p of mediaPlans)
      if (p.end_date && p.end_date >= today && p.end_date <= limit)
        rows.push({ date: p.end_date, label: `${p.title} — plan ends`, kind: "media" });
    return rows.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 10);
  }, [openTasks, inProduction, mediaPlans, today]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-3 md:p-6">
      <GrowthPageHeader
        icon={Compass}
        title="Growth Studio"
        subtitle={
          activeBrand
            ? `${activeBrand.name} — goals, execution, content ও media এক জায়গায়`
            : "All brands — goals, execution, content ও media এক জায়গায়"
        }
        actions={
          <>
            <Button asChild size="sm" variant="outline">
              <Link to="/erp/growth/goals">
                <Target className="mr-1.5 h-4 w-4" /> Goals
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/erp/growth/pipeline">
                <Clapperboard className="mr-1.5 h-4 w-4" /> Pipeline
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/erp/growth/tasks">
                <ListChecks className="mr-1.5 h-4 w-4" /> Task board
              </Link>
            </Button>
          </>
        }
      />

      {loading && <Skeleton className="h-28 w-full rounded-xl" />}

      {/* Pulse strip — growth execution only (no sales/ads numbers) */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <Stat
          label="Goals on track"
          value={goalRows.length ? `${onTrackCount}/${goalRows.length}` : "—"}
          hint={goalRows.length ? `${goalRows.length - onTrackCount} behind pace` : "no active goal"}
          tone={goalRows.length && onTrackCount === goalRows.length ? "success" : goalRows.length ? "warning" : "muted"}
          icon={Target}
        />
        <Stat label="Due today" value={dueToday.length} hint={`${doing.length} in progress`} tone="primary" icon={ListChecks} />
        <Stat label="Overdue" value={overdue.length} hint={`${doneThisWeek.length} done · 7d`} tone={overdue.length ? "destructive" : "muted"} icon={AlertTriangle} />
        <Stat label="Content in production" value={inProduction.length} hint={`${contentLate.length} past due`} tone={contentLate.length ? "warning" : "default"} icon={Clapperboard} />
        <Stat label="Published · 30d" value={published30.length} hint={views30 ? `${views30.toLocaleString()} views` : "no view data"} tone="success" icon={TrendingUp} />
        <Stat
          label="Team on task"
          value={teamRows.length}
          hint={teamRows.length ? `${teamRows.reduce((s, r) => s + r.open, 0)} open task` : "কেউ assigned নেই"}
          tone={teamRows.length ? "primary" : "muted"}
          icon={Users}
        />
      </div>

      {/* Needs my action */}
      <Card className="border-primary/25 bg-primary/[0.03]">
        <CardContent className="space-y-3 p-4">
          <h2 className="inline-flex items-center gap-1.5 font-display text-sm font-semibold">
            <Inbox className="h-4 w-4 text-primary" /> আমার অ্যাকশন দরকার
            {actionCount > 0 && <Badge className="ml-1 h-5 px-1.5 text-[10px]">{actionCount}</Badge>}
          </h2>

          {actionCount === 0 ? (
            <p className="inline-flex items-center gap-1.5 py-3 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> সব clear — তোমার জন্য কিছু বাকি নেই।
            </p>
          ) : (
            <div className="grid gap-2 lg:grid-cols-2">
              {myTasks.slice(0, 5).map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2">
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

              {awaitingReview.length > 0 && (
                <ActionLink
                  to="/erp/growth/pipeline"
                  icon={Sparkles}
                  label={`${awaitingReview.length}টা content review-এর অপেক্ষায়`}
                />
              )}
              {contentLate.length > 0 && (
                <ActionLink
                  to="/erp/growth/pipeline"
                  icon={Clapperboard}
                  label={`${contentLate.length}টা content deadline পার করেছে`}
                  tone="destructive"
                />
              )}
              {ideasToVote.length > 0 && (
                <ActionLink to="/erp/growth/products" icon={Lightbulb} label={`${ideasToVote.length}টা product idea তোমার vote-এর অপেক্ষায়`} />
              )}
              {routinesToday.length > 0 && (
                <ActionLink to="/erp/growth/routines" icon={Repeat} label={`আজকের ${routinesToday.length}টা routine এখনো task হয়নি`} />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Goals with pace */}
        <Card className="lg:col-span-2">
          <CardContent className="space-y-3 p-4">
            <SectionHead title="Goal pace" to="/erp/growth/goals" cta="View all" />
            {goalRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">এই period-এ কোনো active goal নেই।</p>
            ) : (
              goalRows.slice(0, 6).map(({ goal: g, actual, pct, elapsed, daysLeft, onTrack }) => (
                <div key={g.id} className="space-y-1.5 rounded-lg border p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{g.title}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {fmtValue(actual, g.unit)} / {fmtValue(g.target_value, g.unit)}
                    </span>
                  </div>
                  <div className="relative">
                    <Progress value={Math.min(100, Math.max(0, pct))} />
                    <span
                      className="absolute -top-0.5 h-3 w-px bg-foreground/50"
                      style={{ left: `${Math.min(100, elapsed)}%` }}
                      title={`Time elapsed ${elapsed.toFixed(0)}%`}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className={onTrack ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                      {onTrack ? "On track" : `Behind by ${Math.max(0, elapsed - pct).toFixed(0)}%`}
                    </span>
                    <span className="text-muted-foreground">
                      {pct.toFixed(0)}% done · {daysLeft}d left
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Today / execution */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <SectionHead title="আজকের কাজ" to="/erp/growth/tasks" cta="Open board" />
            {overdue.length > 0 && (
              <div className="space-y-1.5">
                <p className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" /> Overdue
                </p>
                {overdue.slice(0, 4).map((t) => (
                  <TaskRow key={t.id} title={t.title} meta={t.due_date ?? ""} tone="destructive" />
                ))}
              </div>
            )}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Due today</p>
              {dueToday.length === 0 ? (
                <p className="inline-flex items-center gap-1 py-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" /> আজকের জন্য কিছু বাকি নেই।
                </p>
              ) : (
                dueToday.slice(0, 6).map((t) => <TaskRow key={t.id} title={t.title} meta={t.priority} />)
              )}
            </div>
            {doing.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">In progress</p>
                {doing.slice(0, 4).map((t) => (
                  <TaskRow key={t.id} title={t.title} meta={t.due_date ?? "no due date"} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Content funnel */}
        {items.length > 0 && (
          <Card>
            <CardContent className="space-y-3 p-4">
              <SectionHead title="Content pipeline" to="/erp/growth/pipeline" cta="Open" />
              <div className="space-y-2">
                {stageCounts.map((s) => (
                  <div key={s.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{s.label}</span>
                      <span className="font-semibold tabular-nums">{s.count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary/70" style={{ width: `${(s.count / maxStage) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 border-t pt-3 text-center">
                <Mini label="Cost · 30d" value={bdt(contentSpend30)} />
                <Mini label="Orders · 30d" value={attributed30.toLocaleString()} />
                <Mini label="In review" value={awaitingReview.length.toString()} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Media plans */}
        {mediaRows.length > 0 && (
          <Card>
            <CardContent className="space-y-3 p-4">
              <SectionHead title="Media plans" to="/erp/growth/media-plans" cta="Open" />
              <div className="space-y-2">
                {mediaRows.map(({ plan, econ }) => (
                  <div key={plan.id} className="rounded-lg border p-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{plan.title}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px] capitalize">
                        {plan.status}
                      </Badge>
                    </div>
                    <div className="mt-1 grid grid-cols-3 gap-1 text-[11px] text-muted-foreground">
                      <span>Budget {bdt(econ.totalBudget)}</span>
                      <span>Target {bdt(econ.revenue)}</span>
                      <span>BE ROAS {econ.breakEvenRoas.toFixed(2)}x</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Next 7 days */}
        {upcoming.length > 0 && (
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-primary" />
                <h2 className="font-display text-sm font-semibold">সামনের ৭ দিন</h2>
              </div>
              <div className="space-y-1.5">
                {upcoming.map((u, i) => (
                  <div key={`${u.kind}-${i}`} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
                    <span className="w-14 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {u.date.slice(5)}
                    </span>
                    <span className="truncate text-sm">{u.label}</span>
                    <Badge variant="secondary" className="ml-auto shrink-0 text-[10px] capitalize">
                      {u.kind}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Team workload */}
      {teamRows.length > 0 && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <SectionHead title="Team workload" to="/erp/growth/tasks" cta="Task board" />
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {teamRows.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {namesQ.data?.get(r.id) ?? "Team member"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.open} open · {r.doing} doing · {r.done7} done · 7d
                    </p>
                  </div>
                  {r.overdue > 0 ? (
                    <Badge variant="destructive" className="shrink-0 text-[10px]">
                      {r.overdue} overdue
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      on track
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Module pulse */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <PulseCard to="/erp/growth/intake" icon={PackageOpen} title="Intake" value={intakeNeedsContent.length} hint="need content" />
        <PulseCard to="/erp/growth/products" icon={Lightbulb} title="Product ideas" value={(ideasQ.data ?? []).filter((i) => i.status !== "rejected").length} hint="in pipeline" />
        <PulseCard to="/erp/growth/creators" icon={Users} title="Creators" value={activeCreators.length} hint={`${creatorLeads.length} in talks`} />
        <PulseCard to="/erp/growth/agencies" icon={Building2} title="Agencies" value={agencies.filter((a) => a.status === "active").length} hint="active partners" />
        <PulseCard to="/erp/growth/routines" icon={Repeat} title="Routines" value={(routinesQ.data ?? []).filter((r) => r.active).length} hint="active routines" />
        <PulseCard to="/erp/growth/rivals" icon={Swords} title="Rival swipes" value={(assetsQ.data ?? []).length} hint="saved assets" />
      </div>
    </div>
  );
}

/* ---------------- Small pieces ---------------- */

function SectionHead({ title, to, cta }: { title: string; to: string; cta: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-display text-sm font-semibold">{title}</h2>
      <Link to={to} className="text-xs text-primary hover:underline">
        {cta}
      </Link>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
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
            <p className="font-display text-lg font-bold leading-tight">{value}</p>
            <p className="truncate text-[10px] text-muted-foreground">{hint}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "primary" | "destructive" | "success" | "warning" | "muted" | "default";
  icon: typeof Lightbulb;
}) {
  const color =
    tone === "destructive"
      ? "text-destructive"
      : tone === "success"
        ? "text-emerald-600 dark:text-emerald-400"
        : tone === "warning"
          ? "text-amber-600 dark:text-amber-400"
          : tone === "primary"
            ? "text-primary"
            : tone === "muted"
              ? "text-muted-foreground"
              : "text-foreground";
  return (
    <Card>
      <CardContent className="p-3.5">
        <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </p>
        <p className={cn("mt-1 font-display text-xl font-bold tabular-nums leading-none", color)}>{value}</p>
        {hint && <p className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function TaskRow({ title, meta, tone }: { title: string; meta: string; tone?: "destructive" }) {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-sm ${
        tone === "destructive" ? "border-destructive/40" : ""
      }`}
    >
      <span className="truncate">{title}</span>
      <span className="shrink-0 text-[11px] text-muted-foreground">{meta}</span>
    </div>
  );
}
