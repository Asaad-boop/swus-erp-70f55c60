import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Plus,
  RefreshCcw,
  Trash2,
  Pencil,
  Wallet,
  CalendarDays,
  FlaskConical,
  ChevronLeft,
  ChevronRight,
  CalendarClock as PageIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBrand } from "@/contexts/brand-context";
import { BrandTabs } from "@/components/erp/marketing/marketing-shell";
import {
  DateRangePicker,
  buildPreset,
  type MktRangeValue,
} from "@/components/erp/marketing/date-range-picker";
import {
  getBudgets,
  saveBudget,
  getCalendarEvents,
  saveCalendarEvent,
  getExperiments,
  saveExperiment,
  deletePlanningRow,
  type MktBudgetRow,
  type MktCalendarEvent,
  type MktExperiment,
} from "@/lib/erp/marketing/planning.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/planning")({
  head: () => ({
    meta: [
      { title: "Budgets, Calendar & Experiments — Marketing ERP" },
      {
        name: "description",
        content:
          "Plan marketing spend, track budget utilisation and ROAS targets, schedule launches on a calendar and log A/B experiment learnings.",
      },
      { property: "og:title", content: "Marketing Planning — Marketing ERP" },
      {
        property: "og:description",
        content: "Budget utilisation, marketing calendar and experiment log in one workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlanningPage,
});

const bdt = (n: number) => "৳" + Math.round(Number(n) || 0).toLocaleString("en-IN");
const iso = (d: Date) => d.toISOString().slice(0, 10);

const EVENT_TYPES = [
  ["campaign_launch", "Campaign launch"],
  ["product_launch", "Product launch"],
  ["offer", "Offer / Discount"],
  ["photoshoot", "Photoshoot"],
  ["creative_deadline", "Creative deadline"],
  ["retargeting", "Retargeting push"],
  ["seasonal", "Seasonal / Festival"],
] as const;

const EVENT_COLOR: Record<string, string> = {
  campaign_launch: "bg-indigo-500/15 text-indigo-600 border-indigo-500/30",
  product_launch: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  offer: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  photoshoot: "bg-pink-500/15 text-pink-600 border-pink-500/30",
  creative_deadline: "bg-red-500/15 text-red-600 border-red-500/30",
  retargeting: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  seasonal: "bg-violet-500/15 text-violet-600 border-violet-500/30",
};

const TEST_TYPES = ["creative", "hook", "offer", "price", "audience", "landing_page", "product"];

function PlanningPage() {
  const { brands, isLoading: brandsLoading } = useBrand();
  const [brandKey, setBrandKey] = useState("all");
  const [range, setRange] = useState<MktRangeValue>(() => buildPreset("30d"));
  const qc = useQueryClient();

  const brandIds = useMemo(() => {
    if (brandKey === "all") return brands.map((b) => b.id);
    const b = brands.find((x) => x.slug === brandKey || x.id === brandKey);
    return b ? [b.id] : brands.map((x) => x.id);
  }, [brandKey, brands]);
  const defaultBrandId = brandIds.length === 1 ? brandIds[0]! : (brands[0]?.id ?? null);
  const key = brandIds.slice().sort().join(",");

  const fetchBudgets = useServerFn(getBudgets);
  const fetchEvents = useServerFn(getCalendarEvents);
  const fetchExperiments = useServerFn(getExperiments);
  const del = useServerFn(deletePlanningRow);

  const budgetsQ = useQuery({
    queryKey: ["mkt-budgets", key, range.from, range.to],
    queryFn: () => fetchBudgets({ data: { brandIds, from: range.from, to: range.to } }),
    enabled: brandIds.length > 0,
    staleTime: 30_000,
  });

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const monthFrom = iso(new Date(month.getFullYear(), month.getMonth(), 1));
  const monthTo = iso(new Date(month.getFullYear(), month.getMonth() + 1, 0));

  const eventsQ = useQuery({
    queryKey: ["mkt-calendar", key, monthFrom],
    queryFn: () => fetchEvents({ data: { brandIds, from: monthFrom, to: monthTo } }),
    enabled: brandIds.length > 0,
    staleTime: 30_000,
  });

  const expQ = useQuery({
    queryKey: ["mkt-experiments", key],
    queryFn: () => fetchExperiments({ data: { brandIds } }),
    enabled: brandIds.length > 0,
    staleTime: 30_000,
  });

  const delMut = useMutation({
    mutationFn: (v: {
      table: "mkt_budgets" | "mkt_calendar_events" | "mkt_experiments";
      id: string;
    }) => del({ data: v }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["mkt-budgets"] });
      qc.invalidateQueries({ queryKey: ["mkt-calendar"] });
      qc.invalidateQueries({ queryKey: ["mkt-experiments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [budgetForm, setBudgetForm] = useState<Partial<MktBudgetRow> | null>(null);
  const [eventForm, setEventForm] = useState<Partial<MktCalendarEvent> | null>(null);
  const [expForm, setExpForm] = useState<Partial<MktExperiment> | null>(null);

  const budgets = budgetsQ.data ?? [];
  const totals = budgets.reduce(
    (a, b) => {
      a.planned += Number(b.planned_spend);
      a.actual += Number(b.actual_spend);
      a.revenue += Number(b.actual_revenue);
      return a;
    },
    { planned: 0, actual: 0, revenue: 0 },
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <PageIcon className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold tracking-tight">
              Budgets, Calendar & Experiments
            </h1>
            <p className="text-xs text-muted-foreground">
              {range.label} · planned {bdt(totals.planned)} · actual {bdt(totals.actual)} ·
              delivered rev {bdt(totals.revenue)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrandTabs value={brandKey} onChange={setBrandKey} />
          <DateRangePicker value={range} onChange={setRange} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              budgetsQ.refetch();
              eventsQ.refetch();
              expQ.refetch();
            }}
          >
            <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="budgets">
        <TabsList>
          <TabsTrigger value="budgets">
            <Wallet className="h-3.5 w-3.5 mr-1.5" /> Budgets
          </TabsTrigger>
          <TabsTrigger value="calendar">
            <CalendarDays className="h-3.5 w-3.5 mr-1.5" /> Calendar
          </TabsTrigger>
          <TabsTrigger value="experiments">
            <FlaskConical className="h-3.5 w-3.5 mr-1.5" /> Experiments
          </TabsTrigger>
        </TabsList>

        {/* ---------------- Budgets ---------------- */}
        <TabsContent value="budgets" className="space-y-3">
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() =>
                setBudgetForm({
                  brand_id: defaultBrandId,
                  name: "",
                  period_start: range.from,
                  period_end: range.to,
                  planned_spend: 0,
                  target_revenue: 0,
                  target_roas: null,
                  scaling_status: "hold",
                  notes: "",
                })
              }
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New budget
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Budget</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Planned</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead>Utilisation</TableHead>
                    <TableHead className="text-right">Delivered rev</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                    <TableHead>Decision</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {budgetsQ.isLoading && (
                    <TableRow>
                      <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  )}
                  {!budgetsQ.isLoading && budgets.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={10}
                        className="py-10 text-center text-muted-foreground text-sm"
                      >
                        No budgets in this period yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {budgets.map((b) => {
                    const util = Number(b.utilization) || 0;
                    const over = util > 100;
                    const roasOk = b.target_roas
                      ? Number(b.actual_roas) >= Number(b.target_roas)
                      : null;
                    return (
                      <TableRow key={b.id}>
                        <TableCell>
                          <div className="font-medium text-sm">{b.name}</div>
                          {b.campaign_name && (
                            <div className="text-xs text-muted-foreground">{b.campaign_name}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {b.period_start} → {b.period_end}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {bdt(b.planned_spend)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {bdt(b.actual_spend)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {bdt(b.remaining)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full ${over ? "bg-red-500" : util > 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                                style={{ width: `${Math.min(100, util)}%` }}
                              />
                            </div>
                            <span
                              className={`text-xs font-mono ${over ? "text-red-600 font-semibold" : ""}`}
                            >
                              {util}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {bdt(b.actual_revenue)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          <span
                            className={
                              roasOk === false ? "text-red-600" : roasOk ? "text-emerald-600" : ""
                            }
                          >
                            {Number(b.actual_roas).toFixed(2)}x
                          </span>
                          {b.target_roas != null && (
                            <div className="text-[10px] text-muted-foreground">
                              target {Number(b.target_roas).toFixed(2)}x
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              b.scaling_status === "scale"
                                ? "border-emerald-500/40 text-emerald-600"
                                : b.scaling_status === "kill"
                                  ? "border-red-500/40 text-red-600"
                                  : "border-amber-500/40 text-amber-600"
                            }
                          >
                            {b.scaling_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button size="icon" variant="ghost" onClick={() => setBudgetForm(b)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => delMut.mutate({ table: "mkt_budgets", id: b.id })}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Calendar ---------------- */}
        <TabsContent value="calendar" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-sm font-medium w-40 text-center">
                {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </div>
              <Button
                size="icon"
                variant="outline"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button
              size="sm"
              onClick={() =>
                setEventForm({
                  brand_id: defaultBrandId,
                  title: "",
                  event_type: "campaign_launch",
                  start_date: iso(new Date()),
                  end_date: null,
                  owner: "",
                  status: "planned",
                  notes: "",
                })
              }
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New event
            </Button>
          </div>
          <MonthGrid
            month={month}
            events={eventsQ.data ?? []}
            onPick={(e) => setEventForm(e)}
            onCreate={(d) =>
              setEventForm({
                brand_id: defaultBrandId,
                title: "",
                event_type: "campaign_launch",
                start_date: d,
                end_date: null,
                owner: "",
                status: "planned",
                notes: "",
              })
            }
          />
        </TabsContent>

        {/* ---------------- Experiments ---------------- */}
        <TabsContent value="experiments" className="space-y-3">
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() =>
                setExpForm({
                  brand_id: defaultBrandId,
                  name: "",
                  test_type: "creative",
                  metric: "roas",
                  status: "running",
                  start_date: iso(new Date()),
                })
              }
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New experiment
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {expQ.isLoading && <Skeleton className="h-40 w-full" />}
            {!expQ.isLoading && (expQ.data ?? []).length === 0 && (
              <Card className="md:col-span-2 xl:col-span-3">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No experiments logged yet.
                </CardContent>
              </Card>
            )}
            {(expQ.data ?? []).map((x) => {
              const a = Number(x.result_a ?? 0);
              const b = Number(x.result_b ?? 0);
              const lift = a > 0 ? ((b - a) / a) * 100 : null;
              return (
                <Card key={x.id} className="overflow-hidden">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-sm">{x.name}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {x.test_type.replace("_", " ")} · {x.metric}
                        </div>
                      </div>
                      <Badge variant="outline" className="capitalize">
                        {x.status}
                      </Badge>
                    </div>
                    {x.hypothesis && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{x.hypothesis}</p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {(["a", "b"] as const).map((v) => {
                        const val = v === "a" ? x.result_a : x.result_b;
                        const label = v === "a" ? x.variant_a : x.variant_b;
                        const won = x.winner === v.toUpperCase() || x.winner === v;
                        return (
                          <div
                            key={v}
                            className={`rounded-md border p-2 ${won ? "border-emerald-500/50 bg-emerald-500/5" : ""}`}
                          >
                            <div className="text-[10px] uppercase text-muted-foreground">
                              Variant {v.toUpperCase()}
                            </div>
                            <div className="text-sm font-medium truncate">{label || "—"}</div>
                            <div className="font-mono text-sm">
                              {val == null ? "—" : Number(val)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {lift != null && (
                      <div className={`text-xs ${lift >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        B vs A: {lift >= 0 ? "+" : ""}
                        {lift.toFixed(1)}%
                      </div>
                    )}
                    {x.decision && (
                      <p className="text-xs">
                        <span className="text-muted-foreground">Decision: </span>
                        {x.decision}
                      </p>
                    )}
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setExpForm(x)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => delMut.mutate({ table: "mkt_experiments", id: x.id })}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      <BudgetDialog
        value={budgetForm}
        brands={brands}
        onClose={() => setBudgetForm(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["mkt-budgets"] })}
      />
      <EventDialog
        value={eventForm}
        brands={brands}
        onClose={() => setEventForm(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["mkt-calendar"] })}
      />
      <ExperimentDialog
        value={expForm}
        brands={brands}
        onClose={() => setExpForm(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["mkt-experiments"] })}
      />
    </div>
  );
}

function MonthGrid({
  month,
  events,
  onPick,
  onCreate,
}: {
  month: Date;
  events: MktCalendarEvent[];
  onPick: (e: MktCalendarEvent) => void;
  onCreate: (d: string) => void;
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const pad = first.getDay();
  const cells: (string | null)[] = [
    ...Array.from({ length: pad }, () => null),
    ...Array.from({ length: days }, (_, i) =>
      iso(new Date(month.getFullYear(), month.getMonth(), i + 1)),
    ),
  ];
  const byDay = new Map<string, MktCalendarEvent[]>();
  for (const e of events) {
    const start = e.start_date;
    const end = e.end_date ?? e.start_date;
    for (const c of cells) {
      if (!c) continue;
      if (c >= start && c <= end) byDay.set(c, [...(byDay.get(c) ?? []), e]);
    }
  }
  return (
    <Card>
      <CardContent className="p-2">
        <div className="grid grid-cols-7 gap-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-[11px] font-medium text-muted-foreground text-center py-1">
              {d}
            </div>
          ))}
          {cells.map((c, i) => (
            <div
              key={i}
              className={`min-h-[92px] rounded-md border p-1 ${c ? "bg-card hover:bg-accent/40 cursor-pointer" : "border-transparent"}`}
              onClick={() => c && onCreate(c)}
            >
              {c && (
                <>
                  <div className="text-[11px] text-muted-foreground mb-1">
                    {Number(c.slice(-2))}
                  </div>
                  <div className="space-y-1">
                    {(byDay.get(c) ?? []).slice(0, 3).map((e) => (
                      <button
                        key={e.id + c}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onPick(e);
                        }}
                        className={`w-full text-left text-[10px] px-1 py-0.5 rounded border truncate ${
                          EVENT_COLOR[e.event_type] ?? "bg-muted text-foreground border-border"
                        }`}
                      >
                        {e.title}
                      </button>
                    ))}
                    {(byDay.get(c)?.length ?? 0) > 3 && (
                      <div className="text-[10px] text-muted-foreground">
                        +{(byDay.get(c)?.length ?? 0) - 3} more
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

type BrandLite = { id: string; name: string };

function BrandSelect({
  brands,
  value,
  onChange,
}: {
  brands: BrandLite[];
  value: string | null | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs">Brand</Label>
      <Select value={value ?? undefined} onValueChange={onChange}>
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
  );
}

function BudgetDialog({
  value,
  brands,
  onClose,
  onSaved,
}: {
  value: Partial<MktBudgetRow> | null;
  brands: BrandLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<MktBudgetRow>>({});
  const [seed, setSeed] = useState<unknown>(null);
  if (value && value !== seed) {
    setSeed(value);
    setForm(value);
  }
  const save = useServerFn(saveBudget);
  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: form.id,
          brandId: form.brand_id ?? null,
          campaignId: form.campaign_id ?? null,
          name: (form.name ?? "").trim(),
          periodStart: form.period_start!,
          periodEnd: form.period_end!,
          plannedSpend: Number(form.planned_spend) || 0,
          targetRevenue: Number(form.target_revenue) || 0,
          targetRoas:
            form.target_roas == null || form.target_roas === ("" as never)
              ? null
              : Number(form.target_roas),
          scalingStatus: (form.scaling_status ?? "hold") as "scale" | "hold" | "kill",
          notes: form.notes ?? null,
        },
      }),
    onSuccess: () => {
      toast.success("Budget saved");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit budget" : "New budget"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              value={form.name ?? ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="August Meta budget"
            />
          </div>
          <BrandSelect
            brands={brands}
            value={form.brand_id}
            onChange={(v) => setForm({ ...form, brand_id: v })}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Period start</Label>
              <Input
                type="date"
                value={form.period_start ?? ""}
                onChange={(e) => setForm({ ...form, period_start: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Period end</Label>
              <Input
                type="date"
                value={form.period_end ?? ""}
                onChange={(e) => setForm({ ...form, period_end: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Planned spend</Label>
              <Input
                type="number"
                value={form.planned_spend ?? 0}
                onChange={(e) => setForm({ ...form, planned_spend: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label className="text-xs">Target revenue</Label>
              <Input
                type="number"
                value={form.target_revenue ?? 0}
                onChange={(e) => setForm({ ...form, target_revenue: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label className="text-xs">Target ROAS</Label>
              <Input
                type="number"
                step="0.1"
                value={form.target_roas ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    target_roas: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Scaling decision</Label>
            <Select
              value={form.scaling_status ?? "hold"}
              onValueChange={(v) => setForm({ ...form, scaling_status: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scale">Scale</SelectItem>
                <SelectItem value="hold">Hold</SelectItem>
                <SelectItem value="kill">Kill</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea
              rows={2}
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !(form.name ?? "").trim() || !form.brand_id}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EventDialog({
  value,
  brands,
  onClose,
  onSaved,
}: {
  value: Partial<MktCalendarEvent> | null;
  brands: BrandLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<MktCalendarEvent>>({});
  const [seed, setSeed] = useState<unknown>(null);
  if (value && value !== seed) {
    setSeed(value);
    setForm(value);
  }
  const save = useServerFn(saveCalendarEvent);
  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: form.id,
          brandId: form.brand_id ?? null,
          title: (form.title ?? "").trim(),
          eventType: form.event_type ?? "campaign_launch",
          startDate: form.start_date!,
          endDate: form.end_date || null,
          owner: form.owner || null,
          status: (form.status ?? "planned") as "planned" | "in_progress" | "done" | "cancelled",
          notes: form.notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Event saved");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit event" : "New event"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label className="text-xs">Title</Label>
            <Input
              value={form.title ?? ""}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <BrandSelect
            brands={brands}
            value={form.brand_id}
            onChange={(v) => setForm({ ...form, brand_id: v })}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Select
                value={form.event_type ?? "campaign_launch"}
                onValueChange={(v) => setForm({ ...form, event_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select
                value={form.status ?? "planned"}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Start</Label>
              <Input
                type="date"
                value={form.start_date ?? ""}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">End (optional)</Label>
              <Input
                type="date"
                value={form.end_date ?? ""}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Owner</Label>
            <Input
              value={form.owner ?? ""}
              onChange={(e) => setForm({ ...form, owner: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea
              rows={2}
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={
              mut.isPending || !(form.title ?? "").trim() || !form.brand_id || !form.start_date
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExperimentDialog({
  value,
  brands,
  onClose,
  onSaved,
}: {
  value: Partial<MktExperiment> | null;
  brands: BrandLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<MktExperiment>>({});
  const [seed, setSeed] = useState<unknown>(null);
  if (value && value !== seed) {
    setSeed(value);
    setForm(value);
  }
  const save = useServerFn(saveExperiment);
  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: form.id,
          brandId: form.brand_id ?? null,
          name: (form.name ?? "").trim(),
          testType: form.test_type ?? "creative",
          hypothesis: form.hypothesis || null,
          variantA: form.variant_a || null,
          variantB: form.variant_b || null,
          metric: form.metric ?? "roas",
          startDate: form.start_date || null,
          endDate: form.end_date || null,
          status: (form.status ?? "running") as "planned" | "running" | "completed" | "abandoned",
          resultA:
            form.result_a == null || (form.result_a as never) === "" ? null : Number(form.result_a),
          resultB:
            form.result_b == null || (form.result_b as never) === "" ? null : Number(form.result_b),
          winner: form.winner || null,
          learning: form.learning || null,
          decision: form.decision || null,
        },
      }),
    onSuccess: () => {
      toast.success("Experiment saved");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit experiment" : "New experiment"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              value={form.name ?? ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <BrandSelect
              brands={brands}
              value={form.brand_id}
              onChange={(v) => setForm({ ...form, brand_id: v })}
            />
            <div>
              <Label className="text-xs">Test type</Label>
              <Select
                value={form.test_type ?? "creative"}
                onValueChange={(v) => setForm({ ...form, test_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEST_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">
                      {t.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Hypothesis</Label>
            <Textarea
              rows={2}
              value={form.hypothesis ?? ""}
              onChange={(e) => setForm({ ...form, hypothesis: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Variant A</Label>
              <Input
                value={form.variant_a ?? ""}
                onChange={(e) => setForm({ ...form, variant_a: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Variant B</Label>
              <Input
                value={form.variant_b ?? ""}
                onChange={(e) => setForm({ ...form, variant_b: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Result A</Label>
              <Input
                type="number"
                step="0.01"
                value={form.result_a ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    result_a: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <Label className="text-xs">Result B</Label>
              <Input
                type="number"
                step="0.01"
                value={form.result_b ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    result_b: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Metric</Label>
              <Select
                value={form.metric ?? "roas"}
                onValueChange={(v) => setForm({ ...form, metric: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["roas", "cpa", "ctr", "cvr", "aov", "profit"].map((m) => (
                    <SelectItem key={m} value={m} className="uppercase">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Start</Label>
              <Input
                type="date"
                value={form.start_date ?? ""}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">End</Label>
              <Input
                type="date"
                value={form.end_date ?? ""}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Status</Label>
              <Select
                value={form.status ?? "running"}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="abandoned">Abandoned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Winner</Label>
              <Select
                value={form.winner ?? "none"}
                onValueChange={(v) => setForm({ ...form, winner: v === "none" ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Undecided</SelectItem>
                  <SelectItem value="A">Variant A</SelectItem>
                  <SelectItem value="B">Variant B</SelectItem>
                  <SelectItem value="tie">Tie</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Learning</Label>
            <Textarea
              rows={2}
              value={form.learning ?? ""}
              onChange={(e) => setForm({ ...form, learning: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Decision</Label>
            <Textarea
              rows={2}
              value={form.decision ?? ""}
              onChange={(e) => setForm({ ...form, decision: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !(form.name ?? "").trim() || !form.brand_id}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
