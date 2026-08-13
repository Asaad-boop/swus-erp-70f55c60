import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  LayoutDashboard,
  RefreshCcw,
  Search,
  Grid2X2,
  Rows3,
  Trophy,
  BatteryLow,
  Pencil,
  Download, Image as PageIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBrand } from "@/contexts/brand-context";
import { BrandTabs } from "@/components/erp/marketing/marketing-shell";
import {
  DateRangePicker,
  buildPreset,
  type MktRangeValue,
} from "@/components/erp/marketing/date-range-picker";
import {
  getCreatives,
  saveCreativeMeta,
  type MktCreativeRow,
} from "@/lib/erp/marketing/creatives.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/creatives")({
  head: () => ({
    meta: [
      { title: "Creative Library — Marketing ERP" },
      {
        name: "description",
        content:
          "Ad creative performance library with CTR, CPC, ROAS, frequency and winning / fatigued detection.",
      },
      { property: "og:title", content: "Creative Library — Marketing ERP" },
      {
        property: "og:description",
        content: "Every ad creative ranked by spend, delivered revenue and fatigue signals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CreativeLibrary,
});

const bdt = (n: number) => "৳" + Math.round(n).toLocaleString("en-IN");
type Filter = "all" | "winning" | "fatigued" | "active";
type SortKey = "spend" | "roas" | "ctr" | "orders" | "revenue" | "frequency";

function CreativeLibrary() {
  const { brands, isLoading: brandsLoading } = useBrand();
  const [brandKey, setBrandKey] = useState("all");
  const [range, setRange] = useState<MktRangeValue>(() => buildPreset("30d"));
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortKey>("spend");
  const [editing, setEditing] = useState<MktCreativeRow | null>(null);

  const brandIds = useMemo(() => {
    if (brandKey === "all") return brands.map((b) => b.id);
    const b = brands.find((x) => x.slug === brandKey || x.id === brandKey);
    return b ? [b.id] : brands.map((x) => x.id);
  }, [brandKey, brands]);

  const fetch = useServerFn(getCreatives);
  const query = useQuery({
    queryKey: ["mkt-creatives", brandIds.slice().sort().join(","), range.from, range.to],
    queryFn: () => fetch({ data: { brandIds, from: range.from, to: range.to } }),
    enabled: brandIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const rows = useMemo(() => {
    let list = query.data ?? [];
    const needle = q.trim().toLowerCase();
    if (needle)
      list = list.filter((r) =>
        `${r.name} ${r.hook ?? ""} ${r.angle ?? ""} ${r.creator ?? ""} ${r.body}`
          .toLowerCase()
          .includes(needle),
      );
    if (filter === "winning") list = list.filter((r) => r.winning);
    if (filter === "fatigued") list = list.filter((r) => r.fatigued);
    if (filter === "active") list = list.filter((r) => r.active);
    return [...list].sort((a, b) => (b[sort] as number) - (a[sort] as number));
  }, [query.data, q, filter, sort]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => {
          a.spend += r.spend;
          a.revenue += r.revenue;
          a.orders += r.orders;
          return a;
        },
        { spend: 0, revenue: 0, orders: 0 },
      ),
    [rows],
  );

  function exportCsv() {
    const head = [
      "Creative","Hook","Angle","Creator","Type","Ads","Spend","Impressions","Clicks","CTR %","CPC","CPM","Frequency","Orders","Delivered","Delivered revenue","ROAS","CPA","Status",
    ];
    const lines = [head, ...rows.map((r) => [
      r.name, r.hook ?? "", r.angle ?? "", r.creator ?? "", r.creative_type ?? "", r.ad_count,
      r.spend, r.impressions, r.clicks, r.ctr, r.cpc, r.cpm, r.frequency,
      r.orders, r.delivered_orders, r.revenue, r.roas, r.cpa,
      r.winning ? "Winning" : r.fatigued ? "Fatigued" : r.active ? "Active" : "Off",
    ])];
    const csv = "\uFEFF" + lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `creatives-${range.from}-to-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <PageIcon className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold tracking-tight">Creative Library</h1>
          <p className="text-xs text-muted-foreground">
            {range.label} · {rows.length} creatives · spend {bdt(totals.spend)} · delivered rev{" "}
            {bdt(totals.revenue)} · ROAS{" "}
            {totals.spend > 0 ? (totals.revenue / totals.spend).toFixed(2) : "—"}x
          </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrandTabs value={brandKey} onChange={setBrandKey} />
          <DateRangePicker value={range} onChange={setRange} />
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCcw className={`h-3.5 w-3.5 mr-1.5 ${query.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-md border bg-background p-0.5">
              {(["all", "winning", "fatigued", "active"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 h-7 text-xs font-medium rounded capitalize transition ${
                    filter === f
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-7 rounded-md border bg-background px-2 text-xs"
            >
              <option value="spend">Sort: Spend</option>
              <option value="roas">Sort: ROAS</option>
              <option value="ctr">Sort: CTR</option>
              <option value="orders">Sort: Orders</option>
              <option value="revenue">Sort: Delivered revenue</option>
              <option value="frequency">Sort: Frequency</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-56">
              <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search creative / hook / copy"
                className="h-8 pl-7 text-xs"
              />
            </div>
            <div className="inline-flex items-center rounded-md border bg-background p-0.5">
              <button
                onClick={() => setView("grid")}
                className={`h-7 px-2 rounded ${view === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                <Grid2X2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setView("table")}
                className={`h-7 px-2 rounded ${view === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                <Rows3 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className={view === "table" ? "p-0" : undefined}>
          {query.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 p-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-64 w-full rounded-lg" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Ei range-e kono creative data nei.
            </div>
          ) : view === "grid" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {rows.map((r) => (
                <CreativeCard key={r.creative_key} row={r} onEdit={() => setEditing(r)} />
              ))}
            </div>
          ) : (
            <CreativeTable rows={rows} onEdit={setEditing} />
          )}
        </CardContent>
      </Card>

      {query.error && (
        <Card className="border-destructive/40">
          <CardContent className="py-3 text-sm text-destructive">
            Load fail: {(query.error as Error).message}
          </CardContent>
        </Card>
      )}

      <MetaDialog row={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function StatusBadges({ row }: { row: MktCreativeRow }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {row.winning && (
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-normal">
          <Trophy className="h-3 w-3 mr-1" /> Winning
        </Badge>
      )}
      {row.fatigued && (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 font-normal">
          <BatteryLow className="h-3 w-3 mr-1" /> Fatigued
        </Badge>
      )}
      {row.active && (
        <Badge variant="outline" className="font-normal">
          Active
        </Badge>
      )}
      {row.creative_type && (
        <Badge variant="secondary" className="font-normal">
          {row.creative_type}
        </Badge>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md bg-muted/40 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xs font-medium tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function CreativeCard({ row, onEdit }: { row: MktCreativeRow; onEdit: () => void }) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden flex flex-col">
      <div className="relative aspect-[4/3] bg-muted">
        {row.thumbnail ? (
          <img src={row.thumbnail} alt={row.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
            No thumbnail
          </div>
        )}
        <button
          onClick={onEdit}
          className="absolute top-2 right-2 rounded-md bg-background/80 backdrop-blur p-1.5 border hover:bg-background"
          aria-label="Edit creative tags"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="p-3 space-y-2 flex-1 flex flex-col">
        <div>
          <div className="text-sm font-medium leading-tight line-clamp-2">{row.name}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {row.ad_count} ad{row.ad_count > 1 ? "s" : ""}
            {row.hook ? ` · ${row.hook}` : ""}
            {row.creator ? ` · ${row.creator}` : ""}
          </div>
        </div>
        <StatusBadges row={row} />
        <div className="grid grid-cols-3 gap-1.5">
          <Stat label="Spend" value={bdt(row.spend)} />
          <Stat
            label="ROAS"
            value={row.roas > 0 ? `${row.roas.toFixed(2)}x` : "—"}
            tone={row.roas >= 1 ? "text-emerald-600" : "text-rose-600"}
          />
          <Stat label="CTR" value={`${row.ctr.toFixed(2)}%`} />
          <Stat label="CPC" value={bdt(row.cpc)} />
          <Stat label="Orders" value={String(row.orders)} />
          <Stat label="Freq." value={row.frequency.toFixed(2)} />
        </div>
        {row.body && (
          <p className="text-[11px] text-muted-foreground line-clamp-3 whitespace-pre-line">{row.body}</p>
        )}
      </div>
    </div>
  );
}

function CreativeTable({
  rows,
  onEdit,
}: {
  rows: MktCreativeRow[];
  onEdit: (r: MktCreativeRow) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left">
            <th className="min-w-[280px]">Creative</th>
            <th>Ads</th>
            <th>Spend</th>
            <th>Impr.</th>
            <th>CTR</th>
            <th>CPC</th>
            <th>Freq.</th>
            <th>Orders</th>
            <th>Delivered</th>
            <th>Delivered rev</th>
            <th>ROAS</th>
            <th>CPA</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.creative_key} className="border-t hover:bg-muted/30">
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  {r.thumbnail && (
                    <img
                      src={r.thumbnail}
                      alt={r.name}
                      loading="lazy"
                      className="h-8 w-8 rounded object-cover border"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium truncate max-w-[260px]">{r.name}</div>
                    <div className="mt-0.5">
                      <StatusBadges row={r} />
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.ad_count}</td>
              <td className="px-3 py-2 text-right tabular-nums font-medium">{bdt(r.spend)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.impressions.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.ctr.toFixed(2)}%</td>
              <td className="px-3 py-2 text-right tabular-nums">{bdt(r.cpc)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.frequency.toFixed(2)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.orders}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.delivered_orders}</td>
              <td className="px-3 py-2 text-right tabular-nums">{bdt(r.revenue)}</td>
              <td
                className={`px-3 py-2 text-right tabular-nums font-medium ${r.roas >= 1 ? "text-emerald-600" : "text-rose-600"}`}
              >
                {r.roas > 0 ? `${r.roas.toFixed(2)}x` : "—"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.cpa > 0 ? bdt(r.cpa) : "—"}</td>
              <td className="px-3 py-2 text-right">
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onEdit(r)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetaDialog({ row, onClose }: { row: MktCreativeRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(saveCreativeMeta);
  const [form, setForm] = useState({ type: "", hook: "", angle: "", creator: "", notes: "" });
  const [key, setKey] = useState<string | null>(null);

  if (row && key !== row.creative_key) {
    setKey(row.creative_key);
    setForm({
      type: row.creative_type ?? "",
      hook: row.hook ?? "",
      angle: row.angle ?? "",
      creator: row.creator ?? "",
      notes: row.notes ?? "",
    });
  }

  const m = useMutation({
    mutationFn: () =>
      save({
        data: {
          creativeKey: row!.creative_key,
          brandId: row!.brand_id!,
          creativeType: form.type.trim() || null,
          hook: form.hook.trim() || null,
          angle: form.angle.trim() || null,
          creator: form.creator.trim() || null,
          status: "active",
          notes: form.notes.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Creative tags saved");
      qc.invalidateQueries({ queryKey: ["mkt-creatives"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">Creative tags — {row?.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Input
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              placeholder="Video / Image / Carousel"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Creator</Label>
            <Input
              value={form.creator}
              onChange={(e) => setForm({ ...form, creator: e.target.value })}
              placeholder="Designer / editor"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hook</Label>
            <Input
              value={form.hook}
              onChange={(e) => setForm({ ...form, hook: e.target.value })}
              placeholder="Opening hook"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Angle</Label>
            <Input
              value={form.angle}
              onChange={(e) => setForm({ ...form, angle: e.target.value })}
              placeholder="Offer / problem / UGC"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => m.mutate()}
            disabled={m.isPending || !row?.brand_id}
          >
            {m.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}