import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarClock, FlaskConical, Plus, Trash2, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useBrand } from "@/contexts/brand-context";
import { BrandTabs, MarketingPageHeader } from "@/components/erp/marketing/marketing-shell";
import {
  DateRangePicker,
  buildPreset,
  type MktRangeValue,
} from "@/components/erp/marketing/date-range-picker";
import {
  getCalendarEvents,
  saveCalendarEvent,
  getExperiments,
  saveExperiment,
  deletePlanningRow,
  type MktCalendarEvent,
  type MktExperiment,
} from "@/lib/erp/marketing/planning.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/calendar")({
  head: () => ({
    meta: [
      { title: "Marketing Calendar & Experiments — Marketing ERP" },
      {
        name: "description",
        content:
          "Plan launches, offers, photoshoots and deadlines, and keep an A/B experiment log with results and learnings.",
      },
      { property: "og:title", content: "Marketing Calendar & Experiments — Marketing ERP" },
      {
        property: "og:description",
        content: "Marketing calendar and A/B test log for every brand.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalendarExperimentsPage,
});

const EVENT_TYPES = ["launch", "offer", "photoshoot", "deadline", "campaign", "other"];
const EVENT_STATUS = ["planned", "in_progress", "done", "cancelled"] as const;
const TEST_TYPES = ["creative", "audience", "offer", "landing", "budget", "other"];
const EXP_STATUS = ["planned", "running", "completed", "abandoned"] as const;

const STATUS_TONE: Record<string, string> = {
  planned: "bg-muted text-muted-foreground border-border",
  in_progress: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  running: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  done: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  completed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  cancelled: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  abandoned: "bg-rose-500/10 text-rose-600 border-rose-500/20",
};

type EventDraft = {
  id?: string;
  brandId: string | null;
  title: string;
  eventType: string;
  startDate: string;
  endDate: string;
  owner: string;
  status: (typeof EVENT_STATUS)[number];
  notes: string;
};

type ExpDraft = {
  id?: string;
  brandId: string | null;
  name: string;
  testType: string;
  hypothesis: string;
  variantA: string;
  variantB: string;
  metric: string;
  startDate: string;
  endDate: string;
  status: (typeof EXP_STATUS)[number];
  resultA: string;
  resultB: string;
  winner: string;
  learning: string;
  decision: string;
};

function CalendarExperimentsPage() {
  const { brands } = useBrand();
  const qc = useQueryClient();
  const [brandKey, setBrandKey] = useState("all");
  const [range, setRange] = useState<MktRangeValue>(() => buildPreset("30d"));

  const brandIds = useMemo(() => {
    if (brandKey === "all") return brands.map((b) => b.id);
    const b = brands.find((x) => x.slug === brandKey || x.id === brandKey);
    return b ? [b.id] : brands.map((x) => x.id);
  }, [brandKey, brands]);

  const defaultBrandId = brandIds[0] ?? null;

  const fetchEvents = useServerFn(getCalendarEvents);
  const fetchExps = useServerFn(getExperiments);
  const saveEvent = useServerFn(saveCalendarEvent);
  const saveExp = useServerFn(saveExperiment);
  const removeRow = useServerFn(deletePlanningRow);

  const eventsQ = useQuery({
    queryKey: ["mkt-calendar", brandIds.slice().sort().join(","), range.from, range.to],
    queryFn: () => fetchEvents({ data: { brandIds, from: range.from, to: range.to } }),
    enabled: brandIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const expsQ = useQuery({
    queryKey: ["mkt-experiments", brandIds.slice().sort().join(",")],
    queryFn: () => fetchExps({ data: { brandIds } }),
    enabled: brandIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const [eventDraft, setEventDraft] = useState<EventDraft | null>(null);
  const [expDraft, setExpDraft] = useState<ExpDraft | null>(null);

  const eventMut = useMutation({
    mutationFn: (d: EventDraft) =>
      saveEvent({
        data: {
          id: d.id,
          brandId: d.brandId,
          title: d.title.trim(),
          eventType: d.eventType,
          startDate: d.startDate,
          endDate: d.endDate || null,
          owner: d.owner.trim() || null,
          status: d.status,
          notes: d.notes.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Event saved");
      setEventDraft(null);
      qc.invalidateQueries({ queryKey: ["mkt-calendar"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const expMut = useMutation({
    mutationFn: (d: ExpDraft) =>
      saveExp({
        data: {
          id: d.id,
          brandId: d.brandId,
          name: d.name.trim(),
          testType: d.testType,
          hypothesis: d.hypothesis.trim() || null,
          variantA: d.variantA.trim() || null,
          variantB: d.variantB.trim() || null,
          metric: d.metric,
          startDate: d.startDate || null,
          endDate: d.endDate || null,
          status: d.status,
          resultA: d.resultA === "" ? null : Number(d.resultA),
          resultB: d.resultB === "" ? null : Number(d.resultB),
          winner: d.winner || null,
          learning: d.learning.trim() || null,
          decision: d.decision.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Experiment saved");
      setExpDraft(null);
      qc.invalidateQueries({ queryKey: ["mkt-experiments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (v: { table: "mkt_calendar_events" | "mkt_experiments"; id: string }) =>
      removeRow({ data: v }),
    onSuccess: (_r, v) => {
      toast.success("Deleted");
      qc.invalidateQueries({
        queryKey: [v.table === "mkt_calendar_events" ? "mkt-calendar" : "mkt-experiments"],
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const brandName = (id: string | null) => brands.find((b) => b.id === id)?.name ?? "—";

  const newEvent = (): EventDraft => ({
    brandId: defaultBrandId,
    title: "",
    eventType: "launch",
    startDate: range.from,
    endDate: "",
    owner: "",
    status: "planned",
    notes: "",
  });

  const newExp = (): ExpDraft => ({
    brandId: defaultBrandId,
    name: "",
    testType: "creative",
    hypothesis: "",
    variantA: "",
    variantB: "",
    metric: "roas",
    startDate: range.from,
    endDate: "",
    status: "planned",
    resultA: "",
    resultB: "",
    winner: "",
    learning: "",
    decision: "",
  });

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 px-3 py-4 md:px-6">
      <MarketingPageHeader
        icon={CalendarClock}
        title="Calendar & Experiments"
        subtitle="Launches, offers, photoshoots and deadlines — plus the A/B test log."
        actions={<BrandTabs value={brandKey} onChange={setBrandKey} />}
      />

      <Tabs defaultValue="calendar" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="calendar">
              <CalendarClock className="mr-1.5 h-3.5 w-3.5" /> Calendar
            </TabsTrigger>
            <TabsTrigger value="experiments">
              <FlaskConical className="mr-1.5 h-3.5 w-3.5" /> Experiments
            </TabsTrigger>
          </TabsList>
          <DateRangePicker value={range} onChange={setRange} />
        </div>

        <TabsContent value="calendar" className="space-y-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-sm">
                Events{" "}
                <Badge variant="outline" className="ml-1 text-[11px]">
                  {eventsQ.data?.length ?? 0}
                </Badge>
              </CardTitle>
              <Button size="sm" onClick={() => setEventDraft(newEvent())}>
                <Plus className="mr-1 h-4 w-4" /> New event
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {eventsQ.isLoading ? (
                <div className="space-y-2 p-4">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (eventsQ.data?.length ?? 0) === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No events in this range.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Title</th>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-left">Dates</th>
                        <th className="px-3 py-2 text-left">Owner</th>
                        <th className="px-3 py-2 text-left">Brand</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {(eventsQ.data ?? []).map((e: MktCalendarEvent) => (
                        <tr key={e.id} className="border-b last:border-0">
                          <td className="px-3 py-2 font-medium">{e.title}</td>
                          <td className="px-3 py-2 capitalize">{e.event_type}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {e.start_date}
                            {e.end_date ? ` → ${e.end_date}` : ""}
                          </td>
                          <td className="px-3 py-2">{e.owner ?? "—"}</td>
                          <td className="px-3 py-2">{brandName(e.brand_id)}</td>
                          <td className="px-3 py-2">
                            <Badge
                              variant="outline"
                              className={`text-[11px] ${STATUS_TONE[e.status] ?? ""}`}
                            >
                              {e.status.replace("_", " ")}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() =>
                                setEventDraft({
                                  id: e.id,
                                  brandId: e.brand_id,
                                  title: e.title,
                                  eventType: e.event_type,
                                  startDate: e.start_date,
                                  endDate: e.end_date ?? "",
                                  owner: e.owner ?? "",
                                  status: (EVENT_STATUS as readonly string[]).includes(e.status)
                                    ? (e.status as (typeof EVENT_STATUS)[number])
                                    : "planned",
                                  notes: e.notes ?? "",
                                })
                              }
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() =>
                                delMut.mutate({ table: "mkt_calendar_events", id: e.id })
                              }
                            >
                              <Trash2 className="h-4 w-4 text-rose-500" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="experiments" className="space-y-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-sm">
                A/B experiments{" "}
                <Badge variant="outline" className="ml-1 text-[11px]">
                  {expsQ.data?.length ?? 0}
                </Badge>
              </CardTitle>
              <Button size="sm" onClick={() => setExpDraft(newExp())}>
                <Plus className="mr-1 h-4 w-4" /> New experiment
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {expsQ.isLoading ? (
                <div className="space-y-2 p-4">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (expsQ.data?.length ?? 0) === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No experiments logged yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Name</th>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-left">Metric</th>
                        <th className="px-3 py-2 text-right">A</th>
                        <th className="px-3 py-2 text-right">B</th>
                        <th className="px-3 py-2 text-left">Winner</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {(expsQ.data ?? []).map((x: MktExperiment) => (
                        <tr key={x.id} className="border-b last:border-0">
                          <td className="px-3 py-2 font-medium">{x.name}</td>
                          <td className="px-3 py-2 capitalize">{x.test_type}</td>
                          <td className="px-3 py-2 uppercase">{x.metric}</td>
                          <td className="px-3 py-2 text-right">{x.result_a ?? "—"}</td>
                          <td className="px-3 py-2 text-right">{x.result_b ?? "—"}</td>
                          <td className="px-3 py-2">{x.winner ?? "—"}</td>
                          <td className="px-3 py-2">
                            <Badge
                              variant="outline"
                              className={`text-[11px] ${STATUS_TONE[x.status] ?? ""}`}
                            >
                              {x.status}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() =>
                                setExpDraft({
                                  id: x.id,
                                  brandId: x.brand_id,
                                  name: x.name,
                                  testType: x.test_type,
                                  hypothesis: x.hypothesis ?? "",
                                  variantA: x.variant_a ?? "",
                                  variantB: x.variant_b ?? "",
                                  metric: x.metric,
                                  startDate: x.start_date ?? "",
                                  endDate: x.end_date ?? "",
                                  status: (EXP_STATUS as readonly string[]).includes(x.status)
                                    ? (x.status as (typeof EXP_STATUS)[number])
                                    : "planned",
                                  resultA: x.result_a == null ? "" : String(x.result_a),
                                  resultB: x.result_b == null ? "" : String(x.result_b),
                                  winner: x.winner ?? "",
                                  learning: x.learning ?? "",
                                  decision: x.decision ?? "",
                                })
                              }
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => delMut.mutate({ table: "mkt_experiments", id: x.id })}
                            >
                              <Trash2 className="h-4 w-4 text-rose-500" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Event dialog */}
      <Dialog open={!!eventDraft} onOpenChange={(o) => !o && setEventDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{eventDraft?.id ? "Edit event" : "New event"}</DialogTitle>
          </DialogHeader>
          {eventDraft && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>Title</Label>
                <Input
                  value={eventDraft.title}
                  onChange={(ev) => setEventDraft({ ...eventDraft, title: ev.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Type</Label>
                  <Select
                    value={eventDraft.eventType}
                    onValueChange={(v) => setEventDraft({ ...eventDraft, eventType: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_TYPES.map((t) => (
                        <SelectItem key={t} value={t} className="capitalize">
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Status</Label>
                  <Select
                    value={eventDraft.status}
                    onValueChange={(v) =>
                      setEventDraft({
                        ...eventDraft,
                        status: v as (typeof EVENT_STATUS)[number],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_STATUS.map((t) => (
                        <SelectItem key={t} value={t} className="capitalize">
                          {t.replace("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Start date</Label>
                  <Input
                    type="date"
                    value={eventDraft.startDate}
                    onChange={(ev) => setEventDraft({ ...eventDraft, startDate: ev.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>End date</Label>
                  <Input
                    type="date"
                    value={eventDraft.endDate}
                    onChange={(ev) => setEventDraft({ ...eventDraft, endDate: ev.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Owner</Label>
                  <Input
                    value={eventDraft.owner}
                    onChange={(ev) => setEventDraft({ ...eventDraft, owner: ev.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Brand</Label>
                  <Select
                    value={eventDraft.brandId ?? ""}
                    onValueChange={(v) => setEventDraft({ ...eventDraft, brandId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select brand" />
                    </SelectTrigger>
                    <SelectContent>
                      {brands.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Notes</Label>
                <Textarea
                  rows={3}
                  value={eventDraft.notes}
                  onChange={(ev) => setEventDraft({ ...eventDraft, notes: ev.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEventDraft(null)}>
              Cancel
            </Button>
            <Button
              disabled={!eventDraft?.title.trim() || eventMut.isPending}
              onClick={() => eventDraft && eventMut.mutate(eventDraft)}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Experiment dialog */}
      <Dialog open={!!expDraft} onOpenChange={(o) => !o && setExpDraft(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{expDraft?.id ? "Edit experiment" : "New experiment"}</DialogTitle>
          </DialogHeader>
          {expDraft && (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Name</Label>
                  <Input
                    value={expDraft.name}
                    onChange={(ev) => setExpDraft({ ...expDraft, name: ev.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Brand</Label>
                  <Select
                    value={expDraft.brandId ?? ""}
                    onValueChange={(v) => setExpDraft({ ...expDraft, brandId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select brand" />
                    </SelectTrigger>
                    <SelectContent>
                      {brands.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Test type</Label>
                  <Select
                    value={expDraft.testType}
                    onValueChange={(v) => setExpDraft({ ...expDraft, testType: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEST_TYPES.map((t) => (
                        <SelectItem key={t} value={t} className="capitalize">
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Metric</Label>
                  <Select
                    value={expDraft.metric}
                    onValueChange={(v) => setExpDraft({ ...expDraft, metric: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["roas", "cpa", "ctr", "cvr", "revenue", "profit"].map((t) => (
                        <SelectItem key={t} value={t} className="uppercase">
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Variant A</Label>
                  <Input
                    value={expDraft.variantA}
                    onChange={(ev) => setExpDraft({ ...expDraft, variantA: ev.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Variant B</Label>
                  <Input
                    value={expDraft.variantB}
                    onChange={(ev) => setExpDraft({ ...expDraft, variantB: ev.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Result A</Label>
                  <Input
                    type="number"
                    value={expDraft.resultA}
                    onChange={(ev) => setExpDraft({ ...expDraft, resultA: ev.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Result B</Label>
                  <Input
                    type="number"
                    value={expDraft.resultB}
                    onChange={(ev) => setExpDraft({ ...expDraft, resultB: ev.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Start date</Label>
                  <Input
                    type="date"
                    value={expDraft.startDate}
                    onChange={(ev) => setExpDraft({ ...expDraft, startDate: ev.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>End date</Label>
                  <Input
                    type="date"
                    value={expDraft.endDate}
                    onChange={(ev) => setExpDraft({ ...expDraft, endDate: ev.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Status</Label>
                  <Select
                    value={expDraft.status}
                    onValueChange={(v) =>
                      setExpDraft({ ...expDraft, status: v as (typeof EXP_STATUS)[number] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXP_STATUS.map((t) => (
                        <SelectItem key={t} value={t} className="capitalize">
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Winner</Label>
                  <Select
                    value={expDraft.winner || "none"}
                    onValueChange={(v) =>
                      setExpDraft({ ...expDraft, winner: v === "none" ? "" : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Undecided</SelectItem>
                      <SelectItem value="A">A</SelectItem>
                      <SelectItem value="B">B</SelectItem>
                      <SelectItem value="tie">Tie</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Hypothesis</Label>
                <Textarea
                  rows={2}
                  value={expDraft.hypothesis}
                  onChange={(ev) => setExpDraft({ ...expDraft, hypothesis: ev.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Learning</Label>
                <Textarea
                  rows={2}
                  value={expDraft.learning}
                  onChange={(ev) => setExpDraft({ ...expDraft, learning: ev.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Decision</Label>
                <Textarea
                  rows={2}
                  value={expDraft.decision}
                  onChange={(ev) => setExpDraft({ ...expDraft, decision: ev.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExpDraft(null)}>
              Cancel
            </Button>
            <Button
              disabled={!expDraft?.name.trim() || expMut.isPending}
              onClick={() => expDraft && expMut.mutate(expDraft)}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
