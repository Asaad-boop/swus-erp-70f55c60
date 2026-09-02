import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Target, Plus, Trash2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { GrowthPageHeader } from "@/components/erp/growth/growth-shell";
import { VisionBoard } from "@/components/erp/growth/vision-board";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  METRIC_OPTIONS,
  fetchGoalActuals,
  fetchGoals,
  fmtValue,
  type HubGoal,
} from "@/lib/erp/hub/hub-data";

const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  .toISOString()
  .slice(0, 10);
const monthEnd = () => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
  .toISOString()
  .slice(0, 10);

type Draft = {
  id?: string;
  title: string;
  description: string;
  kind: string;
  metric_key: string;
  target_value: string;
  current_value: string;
  unit: string;
  owner: string;
  period_start: string;
  period_end: string;
};

const emptyDraft = (): Draft => ({
  title: "",
  description: "",
  kind: "objective",
  metric_key: "manual",
  target_value: "",
  current_value: "0",
  unit: "number",
  owner: "",
  period_start: monthStart(),
  period_end: monthEnd(),
});

export function GoalsPage() {
  const { brandIds, activeBrand, isLoading: brandLoading } = useBrand();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());

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

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const row = {
        brand_id: activeBrand?.id ?? null,
        title: d.title.trim(),
        description: d.description.trim() || null,
        kind: d.kind,
        metric_key: d.metric_key === "manual" ? null : d.metric_key,
        target_value: Number(d.target_value || 0),
        current_value: Number(d.current_value || 0),
        unit: d.unit,
        owner: d.owner.trim() || null,
        period_start: d.period_start,
        period_end: d.period_end,
      };
      const { error } = d.id
        ? await supabase.from("hub_goals").update(row as never).eq("id", d.id)
        : await supabase.from("hub_goals").insert(row as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Goal saved");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["hub-goals"] });
      qc.invalidateQueries({ queryKey: ["hub-goal-actuals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hub_goals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Goal deleted");
      qc.invalidateQueries({ queryKey: ["hub-goals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const goals = goalsQ.data ?? [];
  const actuals = actualsQ.data;

  const summary = useMemo(() => {
    if (goals.length === 0) return null;
    const pcts = goals.map((g) => progressPct(g, actuals?.get(g.id) ?? g.current_value));
    return {
      count: goals.length,
      onTrack: pcts.filter((p) => p >= 70).length,
      avg: Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length),
    };
  }, [goals, actuals]);

  const openNew = () => {
    setDraft(emptyDraft());
    setOpen(true);
  };
  const openEdit = (g: HubGoal) => {
    setDraft({
      id: g.id,
      title: g.title,
      description: g.description ?? "",
      kind: g.kind,
      metric_key: g.metric_key ?? "manual",
      target_value: String(g.target_value),
      current_value: String(g.current_value),
      unit: g.unit,
      owner: g.owner ?? "",
      period_start: g.period_start,
      period_end: g.period_end,
    });
    setOpen(true);
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-3 md:p-6">
      <GrowthPageHeader
        icon={Target}
        title="Vision & Targets"
        subtitle={
          activeBrand
            ? `${activeBrand.name} — this month's objectives`
            : "All brands — objectives and key results"
        }
        actions={
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-1.5 h-4 w-4" /> New goal
          </Button>
        }
      />

      <VisionBoard />

      {summary && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Goals" value={String(summary.count)} />
          <StatCard label="On track (70%+)" value={String(summary.onTrack)} />
          <StatCard label="Average progress" value={`${summary.avg}%`} />
        </div>
      )}

      {(goalsQ.isLoading || brandLoading) && <Skeleton className="h-40 w-full rounded-xl" />}

      {!goalsQ.isLoading && goals.length === 0 && (
        <Card className="shadow-none">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            এখনো কোনো goal নেই। মাসের target (revenue, order, নতুন product) যোগ করে শুরু করো।
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {goals.map((g) => {
          const actual = actuals?.get(g.id) ?? g.current_value;
          const pct = progressPct(g, actual);
          return (
            <Card key={g.id} className="overflow-hidden shadow-none">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="truncate font-semibold">{g.title}</h3>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {g.kind}
                      </Badge>
                      {g.metric_key && (
                        <Badge variant="secondary" className="text-[10px]">
                          auto
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {g.period_start} → {g.period_end}
                      {g.owner ? ` · ${g.owner}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(g)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => remove.mutate(g.id)}
                      disabled={remove.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {g.description && (
                  <p className="text-xs text-muted-foreground">{g.description}</p>
                )}
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-semibold">{fmtValue(actual, g.unit)}</span>
                    <span className="text-xs text-muted-foreground">
                      target {fmtValue(g.target_value, g.unit)}
                    </span>
                  </div>
                  <Progress value={Math.min(100, pct)} />
                  <p className="text-[11px] text-muted-foreground">{pct}% complete</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit goal" : "New goal"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Title</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="এই মাসে ৮টা নতুন product আনতে হবে"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Type</Label>
                <Select
                  value={draft.kind}
                  onValueChange={(v) => setDraft({ ...draft, kind: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vision">Vision</SelectItem>
                    <SelectItem value="objective">Objective</SelectItem>
                    <SelectItem value="key_result">Key result</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Tracked metric</Label>
                <Select
                  value={draft.metric_key}
                  onValueChange={(v) => {
                    const m = METRIC_OPTIONS.find((x) => x.key === v);
                    setDraft({ ...draft, metric_key: v, unit: m?.unit ?? draft.unit });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METRIC_OPTIONS.map((m) => (
                      <SelectItem key={m.key} value={m.key}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Target</Label>
                <Input
                  type="number"
                  value={draft.target_value}
                  onChange={(e) => setDraft({ ...draft, target_value: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>
                  {draft.metric_key === "manual" ? "Current value" : "Fallback value"}
                </Label>
                <Input
                  type="number"
                  value={draft.current_value}
                  onChange={(e) => setDraft({ ...draft, current_value: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>From</Label>
                <Input
                  type="date"
                  value={draft.period_start}
                  onChange={(e) => setDraft({ ...draft, period_start: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>To</Label>
                <Input
                  type="date"
                  value={draft.period_end}
                  onChange={(e) => setDraft({ ...draft, period_end: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Owner</Label>
              <Input
                value={draft.owner}
                onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
                placeholder="কে responsible"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate(draft)}
              disabled={!draft.title.trim() || save.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function progressPct(g: HubGoal, actual: number) {
  if (!g.target_value) return 0;
  return Math.max(0, Math.round((actual / g.target_value) * 100));
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-display text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
