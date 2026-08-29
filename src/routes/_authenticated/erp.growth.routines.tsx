import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Repeat,
  Plus,
  Trash2,
  Play,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Circle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { GrowthPageHeader } from "@/components/erp/growth/growth-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { fetchTasks } from "@/lib/erp/hub/hub-data";
import {
  CADENCES,
  WEEKDAYS,
  fetchRoutines,
  routineHitsDate,
  spawnDueRoutines,
  type HubRoutine,
} from "@/lib/erp/hub/hub-research";

export const Route = createFileRoute("/_authenticated/erp/growth/routines")({
  beforeLoad: () => {
    throw redirect({ href: "/erp/growth/tasks?tab=routines" });
  },
  head: () => ({
    meta: [
      { title: "Routines & Calendar — Growth Studio" },
      {
        name: "description",
        content:
          "Recurring team routines that auto-create tasks, plus a month calendar of every due task and routine.",
      },
      { property: "og:title", content: "Routines & Calendar — Growth Studio" },
      {
        property: "og:description",
        content: "Daily, weekly and monthly operating rhythm for the team in one calendar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RoutinesPage,
});

type Draft = {
  id?: string;
  title: string;
  details: string;
  cadence: string;
  weekday: string;
  day_of_month: string;
  time_of_day: string;
  active: boolean;
};

const emptyDraft = (): Draft => ({
  title: "",
  details: "",
  cadence: "daily",
  weekday: "1",
  day_of_month: "1",
  time_of_day: "",
  active: true,
});

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function RoutinesPage() {
  const { brandIds, activeBrand } = useBrand();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [cursor, setCursor] = useState(() => new Date());

  const routinesQ = useQuery({
    queryKey: ["hub-routines", brandIds],
    queryFn: () => fetchRoutines(brandIds),
  });
  const tasksQ = useQuery({
    queryKey: ["hub-tasks", brandIds],
    queryFn: () => fetchTasks(brandIds),
  });

  const routines = routinesQ.data ?? [];

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const row = {
        brand_id: activeBrand?.id ?? null,
        title: d.title.trim(),
        details: d.details.trim() || null,
        cadence: d.cadence,
        weekday: d.cadence === "weekly" ? Number(d.weekday) : null,
        day_of_month: d.cadence === "monthly" ? Number(d.day_of_month) : null,
        time_of_day: d.time_of_day || null,
        active: d.active,
      };
      if (!row.title) throw new Error("Title লাগবে");
      if (d.id) {
        const { error } = await supabase.from("hub_routines").update(row as never).eq("id", d.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hub_routines").insert(row as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Routine সেভ হয়েছে");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["hub-routines"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (r: HubRoutine) => {
      const { error } = await supabase
        .from("hub_routines")
        .update({ active: !r.active } as never)
        .eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hub-routines"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hub_routines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("মুছে ফেলা হয়েছে");
      qc.invalidateQueries({ queryKey: ["hub-routines"] });
    },
  });

  const spawn = useMutation({
    mutationFn: () => spawnDueRoutines(brandIds),
    onSuccess: (n) => {
      toast.success(n ? `${n} টা routine task তৈরি হয়েছে` : "আজকের সব routine task আগেই তৈরি");
      qc.invalidateQueries({ queryKey: ["hub-tasks"] });
      qc.invalidateQueries({ queryKey: ["hub-routines"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cadenceLabel = (r: HubRoutine) => {
    if (r.cadence === "weekly")
      return `প্রতি ${WEEKDAYS.find((w) => w.key === r.weekday)?.label ?? "?"}বার`;
    if (r.cadence === "monthly") return `প্রতি মাসের ${r.day_of_month} তারিখ`;
    return "প্রতিদিন";
  };

  /* ------------------------------- calendar ------------------------------ */
  const monthCells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const tasks = tasksQ.data ?? [];
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = iso(d);
      return {
        date: d,
        key,
        inMonth: d.getMonth() === cursor.getMonth(),
        tasks: tasks.filter((t) => t.due_date === key && t.status !== "done"),
        routines: routines.filter((r) => routineHitsDate(r, d)),
      };
    });
  }, [cursor, tasksQ.data, routines]);

  const today = iso(new Date());

  return (
    <div className="space-y-5">
      <GrowthPageHeader
        icon={Repeat}
        title="Routines & Calendar"
        subtitle={
          activeBrand
            ? `${activeBrand.name} — টিমের নিয়মিত rhythm`
            : "সব ব্র্যান্ড — টিমের নিয়মিত rhythm"
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => spawn.mutate()}
              disabled={spawn.isPending}
            >
              <Play className="mr-1.5 h-3.5 w-3.5" />
              আজকের task বানাও
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setDraft(emptyDraft());
                setOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              নতুন Routine
            </Button>
          </>
        }
      />

      <Tabs defaultValue="routines">
        <TabsList>
          <TabsTrigger value="routines">
            <Repeat className="mr-1.5 h-3.5 w-3.5" /> Routines
          </TabsTrigger>
          <TabsTrigger value="calendar">
            <CalendarDays className="mr-1.5 h-3.5 w-3.5" /> Calendar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="routines" className="mt-4">
          {routinesQ.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : routines.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                কোনো routine নেই। যেমন — "সকালে courier status sync", "রাতে ad spend চেক",
                "প্রতি রবিবার stock reorder review"।
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {routines.map((r) => (
                <Card key={r.id} className={r.active ? "" : "opacity-60"}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        className="min-w-0 text-left"
                        onClick={() => {
                          setDraft({
                            id: r.id,
                            title: r.title,
                            details: r.details ?? "",
                            cadence: r.cadence,
                            weekday: String(r.weekday ?? 1),
                            day_of_month: String(r.day_of_month ?? 1),
                            time_of_day: r.time_of_day ?? "",
                            active: r.active,
                          });
                          setOpen(true);
                        }}
                      >
                        <p className="truncate text-sm font-semibold">{r.title}</p>
                        {r.details && (
                          <p className="line-clamp-2 text-xs text-muted-foreground">{r.details}</p>
                        )}
                      </button>
                      <Switch
                        checked={r.active}
                        onCheckedChange={() => toggleActive.mutate(r)}
                        aria-label="Active"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="text-[11px]">
                        {cadenceLabel(r)}
                      </Badge>
                      {r.time_of_day && (
                        <Badge variant="outline" className="text-[11px]">
                          {r.time_of_day}
                        </Badge>
                      )}
                      {r.last_spawned_on && (
                        <span className="text-[11px] text-muted-foreground">
                          শেষ: {r.last_spawned_on}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => remove.mutate(r.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <Card>
            <CardContent className="p-3 md:p-4">
              <div className="mb-3 flex items-center justify-between">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <p className="text-sm font-semibold">
                  {cursor.toLocaleString("en-US", { month: "long", year: "numeric" })}
                </p>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
                {WEEKDAYS.map((w) => (
                  <div key={w.key} className="py-1">
                    {w.label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthCells.map((c) => (
                  <div
                    key={c.key}
                    className={`min-h-[86px] rounded-lg border p-1.5 text-left ${
                      c.inMonth ? "bg-card" : "bg-muted/40 opacity-60"
                    } ${c.key === today ? "border-primary/60 ring-1 ring-primary/30" : "border-border/60"}`}
                  >
                    <p
                      className={`mb-1 text-[11px] ${c.key === today ? "font-bold text-primary" : "text-muted-foreground"}`}
                    >
                      {c.date.getDate()}
                    </p>
                    <div className="space-y-0.5">
                      {c.tasks.slice(0, 3).map((t) => (
                        <p
                          key={t.id}
                          className="truncate rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary"
                          title={t.title}
                        >
                          {t.title}
                        </p>
                      ))}
                      {c.routines.slice(0, 2).map((r) => (
                        <p
                          key={r.id}
                          className="flex items-center gap-1 truncate text-[10px] text-muted-foreground"
                          title={r.title}
                        >
                          <Circle className="h-2 w-2 shrink-0 fill-current" />
                          <span className="truncate">{r.title}</span>
                        </p>
                      ))}
                      {c.tasks.length > 3 && (
                        <p className="text-[10px] text-muted-foreground">
                          +{c.tasks.length - 3} more
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Routine edit" : "নতুন Routine"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="যেমন: সকালে courier status sync"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Details</Label>
              <Textarea
                rows={2}
                value={draft.details}
                onChange={(e) => setDraft({ ...draft, details: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>কত ঘন ঘন</Label>
                <Select
                  value={draft.cadence}
                  onValueChange={(v) => setDraft({ ...draft, cadence: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CADENCES.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {draft.cadence === "weekly" && (
                <div className="space-y-1.5">
                  <Label>কোন বার</Label>
                  <Select
                    value={draft.weekday}
                    onValueChange={(v) => setDraft({ ...draft, weekday: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((w) => (
                        <SelectItem key={w.key} value={String(w.key)}>
                          {w.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {draft.cadence === "monthly" && (
                <div className="space-y-1.5">
                  <Label>তারিখ (১–২৮)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={28}
                    value={draft.day_of_month}
                    onChange={(e) => setDraft({ ...draft, day_of_month: e.target.value })}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>সময় (optional)</Label>
                <Input
                  type="time"
                  value={draft.time_of_day}
                  onChange={(e) => setDraft({ ...draft, time_of_day: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={draft.active}
                onCheckedChange={(v) => setDraft({ ...draft, active: v })}
              />
              <Label className="text-sm font-normal">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate(draft)} disabled={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
