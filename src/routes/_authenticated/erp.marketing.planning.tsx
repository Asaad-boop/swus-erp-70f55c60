import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CalendarClock,
  RefreshCcw,
  Search,
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
  Pencil,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { useBrand } from "@/contexts/brand-context";
import { BrandTabs } from "@/components/erp/marketing/marketing-shell";
import {
  DateRangePicker,
  buildPreset,
  type MktRangeValue,
} from "@/components/erp/marketing/date-range-picker";
import {
  getBudgetPacing,
  upsertCampaignBudget,
  type BudgetPacingRow,
} from "@/lib/erp/marketing/campaigns.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/planning")({
  head: () => ({
    meta: [
      { title: "Budget Pacing — Marketing ERP" },
      {
        name: "description",
        content:
          "Campaign spend versus expected daily trajectory, projected end-of-period spend and pacing status.",
      },
      { property: "og:title", content: "Budget Pacing — Marketing ERP" },
      {
        property: "og:description",
        content: "Track planned versus actual ad spend pacing for every campaign.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BudgetPacingPage,
});

const bdt = (n: number) => "৳" + Math.round(n).toLocaleString("en-IN");

const PACE_TONE: Record<string, string> = {
  over: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  under: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  on_track: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  no_plan: "bg-muted text-muted-foreground border-border",
};
const PACE_LABEL: Record<string, string> = {
  over: "Overspending",
  under: "Underspending",
  on_track: "On track",
  no_plan: "No plan set",
};

function BudgetPacingPage() {
  const { brands } = useBrand();
  const [brandKey, setBrandKey] = useState("all");
  const [range, setRange] = useState<MktRangeValue>(() => buildPreset("30d"));
  const [q, setQ] = useState("");
  const [state, setState] = useState("all");
  const [editing, setEditing] = useState<BudgetPacingRow | null>(null);

  const brandIds = useMemo(() => {
    if (brandKey === "all") return brands.map((b) => b.id);
    const b = brands.find((x) => x.slug === brandKey || x.id === brandKey);
    return b ? [b.id] : brands.map((x) => x.id);
  }, [brandKey, brands]);

  const fetchPacing = useServerFn(getBudgetPacing);
  const pacing = useQuery({
    queryKey: ["mkt-pacing", brandIds.slice().sort().join(","), range.from, range.to],
    queryFn: () => fetchPacing({ data: { brandIds, from: range.from, to: range.to } }),
    enabled: brandIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const rows = useMemo(() => {
    let list = pacing.data ?? [];
    const needle = q.trim().toLowerCase();
    if (needle) list = list.filter((r) => r.name.toLowerCase().includes(needle));
    if (state !== "all") list = list.filter((r) => r.pace_state === state);
    return list;
  }, [pacing.data, q, state]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => {
          a.planned += r.planned;
          a.spend += r.spend;
          a.expected += r.expected_to_date;
          a.projected += r.projected_spend;
          a.revenue += r.revenue;
          return a;
        },
        { planned: 0, spend: 0, expected: 0, projected: 0, revenue: 0 },
      ),
    [rows],
  );

  const exportCsv = () => {
    const head = [
      "Campaign",
      "Status",
      "Planned",
      "Spend",
      "Expected to date",
      "Pace %",
      "Pace state",
      "Avg daily",
      "Required daily",
      "Projected",
      "Revenue",
      "ROAS",
    ];
    const csv = [
      head,
      ...rows.map((r) => [
        r.name,
        r.status,
        r.planned,
        r.spend,
        r.expected_to_date,
        r.pace_pct ?? "",
        PACE_LABEL[r.pace_state],
        r.avg_daily_spend,
        r.required_daily,
        r.projected_spend,
        r.revenue,
        r.roas,
      ]),
    ]
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `budget-pacing-${range.from}-to-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CalendarClock className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold tracking-tight">Budget Pacing</h1>
            <p className="text-xs text-muted-foreground">
              {range.label} · plan vs actual trajectory · FIFO BDT spend
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrandTabs value={brandKey} onChange={setBrandKey} />
          <DateRangePicker value={range} onChange={setRange} />
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => pacing.refetch()}
            disabled={pacing.isFetching}
          >
            <RefreshCcw
              className={`mr-1.5 h-3.5 w-3.5 ${pacing.isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Kpi label="Planned" value={bdt(totals.planned)} />
        <Kpi label="Spend so far" value={bdt(totals.spend)} />
        <Kpi
          label="Expected to date"
          value={bdt(totals.expected)}
          hint={
            totals.expected > 0
              ? `${((totals.spend / totals.expected) * 100).toFixed(0)}% of pace`
              : undefined
          }
        />
        <Kpi label="Projected end" value={bdt(totals.projected)} />
        <Kpi
          label="Delivered rev"
          value={bdt(totals.revenue)}
          hint={totals.spend > 0 ? `ROAS ${(totals.revenue / totals.spend).toFixed(2)}x` : undefined}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 pb-2 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-sm font-semibold">
            Campaign pacing{" "}
            <span className="text-xs font-normal text-muted-foreground">({rows.length})</span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={state} onValueChange={setState}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  All pacing
                </SelectItem>
                <SelectItem value="over" className="text-xs">
                  Overspending
                </SelectItem>
                <SelectItem value="under" className="text-xs">
                  Underspending
                </SelectItem>
                <SelectItem value="on_track" className="text-xs">
                  On track
                </SelectItem>
                <SelectItem value="no_plan" className="text-xs">
                  No plan set
                </SelectItem>
              </SelectContent>
            </Select>
            <div className="relative w-56">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search campaign"
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {pacing.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Ei range-e kono spend ba budget plan nei.
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((r) => (
                <PacingRow key={r.campaign_id} row={r} onEdit={() => setEditing(r)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {pacing.error && (
        <Card className="border-destructive/40">
          <CardContent className="py-3 text-sm text-destructive">
            Load fail: {(pacing.error as Error).message}
          </CardContent>
        </Card>
      )}

      <BudgetDialog
        row={editing}
        from={range.from}
        to={range.to}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function PacingRow({ row, onEdit }: { row: BudgetPacingRow; onEdit: () => void }) {
  const planned = row.planned || 0;
  const spendPct = planned > 0 ? Math.min((row.spend / planned) * 100, 100) : 0;
  const expectedPct = planned > 0 ? Math.min((row.expected_to_date / planned) * 100, 100) : 0;
  const Icon =
    row.pace_state === "over" ? TrendingUp : row.pace_state === "under" ? TrendingDown : Minus;

  return (
    <div className="p-3 hover:bg-muted/30">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-medium">{row.name}</span>
            <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal">
              {row.status}
            </Badge>
            {!row.has_budget_row && (
              <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal">
                from daily budget
              </Badge>
            )}
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            Day {Math.round(row.days_elapsed)}/{Math.round(row.total_days)} · avg{" "}
            {bdt(row.avg_daily_spend)}/day · need {bdt(row.required_daily)}/day to hit plan
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`font-normal ${PACE_TONE[row.pace_state]}`}>
            <Icon className="mr-1 h-3 w-3" />
            {PACE_LABEL[row.pace_state]}
            {row.pace_pct != null ? ` · ${row.pace_pct}%` : ""}
          </Badge>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${row.pace_state === "over" ? "bg-rose-500" : row.pace_state === "under" ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${spendPct}%` }}
        />
        {planned > 0 && (
          <div
            className="absolute top-0 h-full w-0.5 bg-foreground/70"
            style={{ left: `${expectedPct}%` }}
            title={`Expected to date ${bdt(row.expected_to_date)}`}
          />
        )}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] md:grid-cols-6">
        <Cell label="Planned" v={bdt(planned)} />
        <Cell label="Spend" v={bdt(row.spend)} />
        <Cell label="Expected" v={bdt(row.expected_to_date)} />
        <Cell label="Projected" v={bdt(row.projected_spend)} />
        <Cell label="Delivered rev" v={bdt(row.revenue)} />
        <Cell
          label="ROAS"
          v={row.roas > 0 ? `${row.roas.toFixed(2)}x` : "—"}
          tone={
            row.target_roas != null
              ? row.roas >= row.target_roas
                ? "good"
                : "bad"
              : undefined
          }
        />
      </div>
    </div>
  );
}

function Cell({ label, v, tone }: { label: string; v: string; tone?: "good" | "bad" }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={`tabular-nums ${tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-rose-600" : ""}`}
      >
        {v}
      </div>
    </div>
  );
}

function BudgetDialog({
  row,
  from,
  to,
  onClose,
}: {
  row: BudgetPacingRow | null;
  from: string;
  to: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const save = useServerFn(upsertCampaignBudget);
  const [planned, setPlanned] = useState("");
  const [targetRoas, setTargetRoas] = useState("");
  const [seeded, setSeeded] = useState<string | null>(null);

  if (row && seeded !== row.campaign_id) {
    setSeeded(row.campaign_id);
    setPlanned(row.planned ? String(Math.round(row.planned)) : "");
    setTargetRoas(row.target_roas == null ? "" : String(row.target_roas));
  }

  const m = useMutation({
    mutationFn: () =>
      save({
        data: {
          campaignId: row!.campaign_id,
          periodStart: from,
          periodEnd: to,
          plannedSpend: Number(planned || 0),
          targetRoas: targetRoas.trim() === "" ? null : Number(targetRoas),
        },
      }),
    onSuccess: () => {
      toast.success("Budget plan save holo");
      qc.invalidateQueries({ queryKey: ["mkt-pacing"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Save fail"),
  });

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Budget plan — {row?.name}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Period: {from} → {to}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Planned spend (৳)</Label>
            <Input
              value={planned}
              onChange={(e) => setPlanned(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 50000"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Target ROAS (x)</Label>
            <Input
              value={targetRoas}
              onChange={(e) => setTargetRoas(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 3"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
