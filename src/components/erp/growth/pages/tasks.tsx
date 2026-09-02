import { GrowthPageTabs, useTabParam, type PageTab } from "@/components/erp/growth/page-tabs";
import { RoutinesPage } from "./routines";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ListChecks, Plus, Trash2, CalendarDays, Repeat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { GrowthPageHeader } from "@/components/erp/growth/growth-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  TASK_PRIORITIES,
  TASK_STATUSES,
  fetchGoals,
  fetchTasks,
  type HubTask,
} from "@/lib/erp/hub/hub-data";

const TASK_TABS: PageTab[] = [
  { key: "board", label: "Task Board", icon: ListChecks },
  { key: "routines", label: "Routines & Calendar", icon: Repeat },
];

export function TasksShell() {
  const tab = useTabParam(TASK_TABS);
  return (
    <div>
      <div className="border-b border-border/50 bg-card/30 px-4 py-2.5 sm:px-6">
        <GrowthPageTabs base="/erp/growth/tasks" tabs={TASK_TABS} active={tab} />
      </div>
      {tab === "routines" ? <RoutinesPage /> : <TasksPage />}
    </div>
  );
}

type Draft = {
  id?: string;
  title: string;
  details: string;
  status: string;
  priority: string;
  due_date: string;
  goal_id: string;
  recurrence: string;
  tags: string;
};

const emptyDraft = (status = "todo"): Draft => ({
  title: "",
  details: "",
  status,
  priority: "normal",
  due_date: "",
  goal_id: "none",
  recurrence: "none",
  tags: "",
});

const PRIORITY_STYLE: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-primary/10 text-primary",
  high: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  urgent: "bg-destructive/15 text-destructive",
};

function TasksPage() {
  const { brandIds, activeBrand } = useBrand();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);

  const tasksQ = useQuery({
    queryKey: ["hub-tasks", brandIds],
    queryFn: () => fetchTasks(brandIds),
    enabled: brandIds.length > 0,
  });
  const goalsQ = useQuery({
    queryKey: ["hub-goals", brandIds],
    queryFn: () => fetchGoals(brandIds),
    enabled: brandIds.length > 0,
  });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const row = {
        brand_id: activeBrand?.id ?? null,
        title: d.title.trim(),
        details: d.details.trim() || null,
        status: d.status,
        priority: d.priority,
        due_date: d.due_date || null,
        goal_id: d.goal_id === "none" ? null : d.goal_id,
        recurrence: d.recurrence,
        tags: d.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        completed_at: d.status === "done" ? new Date().toISOString() : null,
      };
      const { error } = d.id
        ? await supabase.from("hub_tasks").update(row as never).eq("id", d.id)
        : await supabase.from("hub_tasks").insert(row as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Task saved");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["hub-tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("hub_tasks")
        .update({
          status,
          completed_at: status === "done" ? new Date().toISOString() : null,
        } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hub-tasks"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hub_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Task deleted");
      qc.invalidateQueries({ queryKey: ["hub-tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tasks = tasksQ.data ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.details ?? "").toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [tasks, query]);

  const openEdit = (t: HubTask) => {
    setDraft({
      id: t.id,
      title: t.title,
      details: t.details ?? "",
      status: t.status,
      priority: t.priority,
      due_date: t.due_date ?? "",
      goal_id: t.goal_id ?? "none",
      recurrence: t.recurrence,
      tags: t.tags.join(", "),
    });
    setOpen(true);
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-3 md:p-6">
      <GrowthPageHeader
        icon={ListChecks}
        title="Task Board"
        subtitle={
          activeBrand ? `${activeBrand.name} — daily execution` : "All brands — daily execution"
        }
        actions={
          <>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks…"
              className="h-8 w-44"
            />
            <Button
              size="sm"
              onClick={() => {
                setDraft(emptyDraft());
                setOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" /> New task
            </Button>
          </>
        }
      />

      {tasksQ.isLoading && <Skeleton className="h-64 w-full rounded-xl" />}

      <div className="grid gap-3 lg:grid-cols-5">
        {TASK_STATUSES.map((col) => {
          const items = filtered.filter((t) => t.status === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragging) move.mutate({ id: dragging, status: col.key });
                setDragging(null);
              }}
              className="flex min-h-40 flex-col gap-2 rounded-xl border bg-muted/30 p-2"
            >
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold">{col.label}</span>
                <Badge variant="secondary" className="text-[10px]">
                  {items.length}
                </Badge>
              </div>
              {items.map((t) => (
                <Card
                  key={t.id}
                  draggable
                  onDragStart={() => setDragging(t.id)}
                  onDragEnd={() => setDragging(null)}
                  className="cursor-grab active:cursor-grabbing"
                >
                  <CardContent className="space-y-2 p-2.5">
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      className="block w-full text-left text-sm font-medium leading-snug hover:text-primary"
                    >
                      {t.title}
                    </button>
                    <div className="flex flex-wrap items-center gap-1">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${PRIORITY_STYLE[t.priority] ?? ""}`}
                      >
                        {t.priority}
                      </span>
                      {t.due_date && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <CalendarDays className="h-3 w-3" />
                          {t.due_date}
                        </span>
                      )}
                      {t.recurrence !== "none" && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Repeat className="h-3 w-3" />
                          {t.recurrence}
                        </span>
                      )}
                    </div>
                    {t.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {t.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-1">
                      <Select
                        value={t.status}
                        onValueChange={(v) => move.mutate({ id: t.id, status: v })}
                      >
                        <SelectTrigger className="h-7 text-[11px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_STATUSES.map((s) => (
                            <SelectItem key={s.key} value={s.key}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        onClick={() => remove.mutate(t.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Button
                size="sm"
                variant="ghost"
                className="justify-start text-xs text-muted-foreground"
                onClick={() => {
                  setDraft(emptyDraft(col.key));
                  setOpen(true);
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add
              </Button>
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit task" : "New task"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Title</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="৫টা নতুন product research করা"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Details</Label>
              <Textarea
                rows={3}
                value={draft.details}
                onChange={(e) => setDraft({ ...draft, details: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <Select
                  value={draft.status}
                  onValueChange={(v) => setDraft({ ...draft, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Priority</Label>
                <Select
                  value={draft.priority}
                  onValueChange={(v) => setDraft({ ...draft, priority: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITIES.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Due date</Label>
                <Input
                  type="date"
                  value={draft.due_date}
                  onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Repeat</Label>
                <Select
                  value={draft.recurrence}
                  onValueChange={(v) => setDraft({ ...draft, recurrence: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">One-off</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Linked goal</Label>
              <Select
                value={draft.goal_id}
                onValueChange={(v) => setDraft({ ...draft, goal_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No goal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No goal</SelectItem>
                  {(goalsQ.data ?? []).map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Tags (comma separated)</Label>
              <Input
                value={draft.tags}
                onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                placeholder="research, content, sourcing"
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
