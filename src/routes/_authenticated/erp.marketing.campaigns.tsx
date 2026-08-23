import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ChevronRight,
  ChevronDown,
  RefreshCcw,
  Search,
  AlertTriangle,
  Download,
  Package,
  ArrowUpDown,
  Target as PageIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBrand } from "@/contexts/brand-context";
import { BrandTabs } from "@/components/erp/marketing/marketing-shell";
import { CampaignDetailSheet } from "@/components/erp/marketing/campaign-detail-sheet";
import {
  DateRangePicker,
  buildPreset,
  type MktRangeValue,
} from "@/components/erp/marketing/date-range-picker";
import {
  getMktLevel,
  listUnassignedCampaigns,
  assignCampaignsToBrand,
  getCampaignProductCounts,
  type MktNodeRow,
} from "@/lib/erp/marketing/campaigns.functions";


export const Route = createFileRoute("/_authenticated/erp/marketing/campaigns")({
  head: () => ({
    meta: [
      { title: "Campaign Workspace — Marketing ERP" },
      {
        name: "description",
        content:
          "Campaign, ad set and ad level performance with spend, delivered revenue, ROAS and target tracking.",
      },
      { property: "og:title", content: "Campaign Workspace — Marketing ERP" },
      {
        property: "og:description",
        content: "Three-level ad drilldown with canonical delivered revenue and ROAS targets.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampaignWorkspace,
});

const bdt = (n: number) => "৳" + Math.round(n).toLocaleString("en-IN");
const pct = (n: number) => `${n.toFixed(2)}%`;

function statusTone(s: string) {
  const v = (s ?? "").toUpperCase();
  if (v === "ACTIVE") return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
  if (v.includes("PAUSED")) return "bg-amber-500/10 text-amber-600 border-amber-500/20";
  return "bg-muted text-muted-foreground border-border";
}

type SortKey =
  | "spend"
  | "revenue"
  | "roas"
  | "orders"
  | "delivered_orders"
  | "cac"
  | "ctr"
  | "name";

function CampaignWorkspace() {
  const { brands } = useBrand();
  const [brandKey, setBrandKey] = useState("all");
  const [range, setRange] = useState<MktRangeValue>(() => buildPreset("30d"));
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [linkFilter, setLinkFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<MktNodeRow | null>(null);

  const brandIds = useMemo(() => {
    if (brandKey === "all") return brands.map((b) => b.id);
    const b = brands.find((x) => x.slug === brandKey || x.id === brandKey);
    return b ? [b.id] : brands.map((x) => x.id);
  }, [brandKey, brands]);

  const fetchLevel = useServerFn(getMktLevel);
  const campaigns = useQuery({
    queryKey: ["mkt-level", "campaign", brandIds.slice().sort().join(","), range.from, range.to],
    queryFn: () =>
      fetchLevel({ data: { brandIds, from: range.from, to: range.to, level: "campaign" } }),
    enabled: brandIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const fetchCounts = useServerFn(getCampaignProductCounts);
  const campaignIds = useMemo(
    () => (campaigns.data ?? []).map((r) => r.id),
    [campaigns.data],
  );
  const counts = useQuery({
    queryKey: ["mkt-camp-product-counts", campaignIds.join(",")],
    queryFn: () => fetchCounts({ data: { campaignIds } }),
    enabled: campaignIds.length > 0,
    staleTime: 60_000,
  });
  const countMap = counts.data ?? {};

  const rows = useMemo(() => {
    let list = campaigns.data ?? [];
    const needle = q.trim().toLowerCase();
    if (needle) list = list.filter((r) => r.name.toLowerCase().includes(needle));
    if (statusFilter !== "all") {
      list = list.filter((r) => {
        const s = (r.status ?? "").toUpperCase();
        return statusFilter === "active" ? s === "ACTIVE" : s !== "ACTIVE";
      });
    }
    if (linkFilter !== "all") {
      list = list.filter((r) =>
        linkFilter === "linked" ? (countMap[r.id] ?? 0) > 0 : (countMap[r.id] ?? 0) === 0,
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) =>
      sortKey === "name"
        ? a.name.localeCompare(b.name) * dir
        : ((a[sortKey] as number) - (b[sortKey] as number)) * dir,
    );
  }, [campaigns.data, q, statusFilter, linkFilter, countMap, sortKey, sortDir]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.spend += r.spend;
        acc.revenue += r.revenue;
        acc.orders += r.orders;
        acc.delivered += r.delivered_orders;
        acc.clicks += r.clicks;
        return acc;
      },
      { spend: 0, revenue: 0, orders: 0, delivered: 0, clicks: 0 },
    );
  }, [rows]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "name" ? "asc" : "desc");
    }
  };

  const exportCsv = () => {
    const head = [
      "Campaign",
      "Status",
      "Objective",
      "Linked products",
      "Spend",
      "Impressions",
      "Clicks",
      "CTR %",
      "CPC",
      "Orders",
      "Delivered",
      "Delivered revenue",
      "ROAS",
      "CAC",
      "Target ROAS",
      "Target CPA",
    ];
    const body = rows.map((r) => [
      r.name,
      r.status,
      r.objective ?? "",
      countMap[r.id] ?? 0,
      r.spend,
      r.impressions,
      r.clicks,
      r.ctr,
      r.cpc,
      r.orders,
      r.delivered_orders,
      r.revenue,
      r.roas,
      r.cac,
      r.target_roas ?? "",
      r.target_cpa ?? "",
    ]);
    const csv = [head, ...body]
      .map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaigns-${range.from}-to-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <PageIcon className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold tracking-tight">Campaign Workspace</h1>
            <p className="text-xs text-muted-foreground">
              {range.label} · Campaign → Ad set → Ad · FIFO spend, canonical delivered revenue
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
            onClick={() => campaigns.refetch()}
            disabled={campaigns.isFetching}
          >
            <RefreshCcw
              className={`h-3.5 w-3.5 mr-1.5 ${campaigns.isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <Kpi label="Spend" value={bdt(totals.spend)} />
        <Kpi label="Delivered rev" value={bdt(totals.revenue)} />
        <Kpi
          label="ROAS"
          value={totals.spend > 0 ? `${(totals.revenue / totals.spend).toFixed(2)}x` : "—"}
          tone={totals.revenue >= totals.spend ? "good" : "bad"}
        />
        <Kpi label="Orders" value={totals.orders.toLocaleString()} />
        <Kpi label="Delivered orders" value={totals.delivered.toLocaleString()} />
        <Kpi
          label="CAC"
          value={totals.delivered > 0 ? bdt(totals.spend / totals.delivered) : "—"}
        />
      </div>

      <UnassignedPanel brands={brands} />

      <Card>
        <CardHeader className="pb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-sm font-semibold">
            Campaigns <span className="text-xs font-normal text-muted-foreground">({rows.length})</span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All status</SelectItem>
                <SelectItem value="active" className="text-xs">Active only</SelectItem>
                <SelectItem value="inactive" className="text-xs">Not active</SelectItem>
              </SelectContent>
            </Select>
            <Select value={linkFilter} onValueChange={setLinkFilter}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All products</SelectItem>
                <SelectItem value="linked" className="text-xs">Product linked</SelectItem>
                <SelectItem value="unlinked" className="text-xs">No product link</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative w-56">
              <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
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
          {campaigns.isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Ei range-e kono campaign data nei.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left">
                    <SortTh
                      k="name"
                      label="Name"
                      sortKey={sortKey}
                      onSort={toggleSort}
                      className="min-w-[300px] text-left"
                    />
                    <th>Status</th>
                    <SortTh k="spend" label="Spend" sortKey={sortKey} onSort={toggleSort} />
                    <th>Impr.</th>
                    <SortTh k="ctr" label="CTR" sortKey={sortKey} onSort={toggleSort} />
                    <th>CPC</th>
                    <SortTh k="orders" label="Orders" sortKey={sortKey} onSort={toggleSort} />
                    <SortTh
                      k="delivered_orders"
                      label="Delivered"
                      sortKey={sortKey}
                      onSort={toggleSort}
                    />
                    <SortTh k="revenue" label="Delivered rev" sortKey={sortKey} onSort={toggleSort} />
                    <SortTh k="roas" label="ROAS" sortKey={sortKey} onSort={toggleSort} />
                    <SortTh k="cac" label="CAC" sortKey={sortKey} onSort={toggleSort} />
                    <th>Target</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <CampaignRow
                      key={r.id}
                      row={r}
                      brandIds={brandIds}
                      range={range}
                      productCount={countMap[r.id] ?? 0}
                      open={!!expanded[r.id]}
                      onToggle={() => setExpanded((p) => ({ ...p, [r.id]: !p[r.id] }))}
                      onEdit={() => setDetail(r)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {campaigns.error && (
        <Card className="border-destructive/40">
          <CardContent className="py-3 text-sm text-destructive">
            Load fail: {(campaigns.error as Error).message}
          </CardContent>
        </Card>
      )}

      <CampaignDetailSheet
        row={detail}
        from={range.from}
        to={range.to}
        onClose={() => setDetail(null)}
      />
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={`text-sm font-semibold tabular-nums ${
          tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-rose-600" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function SortTh({
  k,
  label,
  sortKey,
  onSort,
  className = "",
}: {
  k: SortKey;
  label: string;
  sortKey: SortKey;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  return (
    <th className={className}>
      <button
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${sortKey === k ? "text-foreground font-medium" : ""}`}
      >
        {label}
        <ArrowUpDown className="h-3 w-3 opacity-60" />
      </button>
    </th>
  );
}


function Num({ v, className = "" }: { v: string | number; className?: string }) {
  return <td className={`px-3 py-2 text-right tabular-nums ${className}`}>{v}</td>;
}

function TargetBadge({ row }: { row: MktNodeRow }) {
  if (row.target_roas == null && row.target_cpa == null)
    return <span className="text-muted-foreground">—</span>;
  const roasOk = row.target_roas == null ? null : row.roas >= row.target_roas;
  const cpaOk = row.target_cpa == null ? null : row.cac > 0 && row.cac <= row.target_cpa;
  const ok = [roasOk, cpaOk].filter((x) => x !== null).every(Boolean);
  return (
    <Badge
      variant="outline"
      className={
        ok
          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-normal"
          : "bg-rose-500/10 text-rose-600 border-rose-500/20 font-normal"
      }
    >
      {row.target_roas != null && `${row.target_roas}x`}
      {row.target_roas != null && row.target_cpa != null && " · "}
      {row.target_cpa != null && bdt(row.target_cpa)}
    </Badge>
  );
}

function CampaignRow({
  row,
  brandIds,
  range,
  open,
  onToggle,
  onEdit,
}: {
  row: MktNodeRow;
  brandIds: string[];
  range: MktRangeValue;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  return (
    <>
      <tr className="border-t hover:bg-muted/30">
        <td className="px-3 py-2">
          <button onClick={onToggle} className="flex items-center gap-1.5 text-left">
            {open ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="font-medium truncate max-w-[280px]">{row.name}</span>
          </button>
          {row.objective && (
            <div className="text-[10px] text-muted-foreground pl-5">{row.objective}</div>
          )}
        </td>
        <td className="px-3 py-2 text-right">
          <Badge variant="outline" className={`font-normal ${statusTone(row.status)}`}>
            {row.status}
          </Badge>
        </td>
        <Num v={bdt(row.spend)} className="font-medium" />
        <Num v={row.impressions.toLocaleString()} />
        <Num v={pct(row.ctr)} />
        <Num v={bdt(row.cpc)} />
        <Num v={row.orders} />
        <Num v={row.delivered_orders} />
        <Num v={bdt(row.revenue)} />
        <Num
          v={row.roas > 0 ? `${row.roas.toFixed(2)}x` : "—"}
          className={row.roas >= 1 ? "text-emerald-600 font-medium" : "text-rose-600"}
        />
        <Num v={row.cac > 0 ? bdt(row.cac) : "—"} />
        <td className="px-3 py-2 text-right">
          <TargetBadge row={row} />
        </td>
        <td className="px-3 py-2 text-right">
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onEdit}>
            <Target className="h-3.5 w-3.5" />
          </Button>
        </td>
      </tr>
      {open && (
        <ChildRows level="adset" parentId={row.id} brandIds={brandIds} range={range} depth={1} />
      )}
    </>
  );
}

function ChildRows({
  level,
  parentId,
  brandIds,
  range,
  depth,
}: {
  level: "adset" | "ad";
  parentId: string;
  brandIds: string[];
  range: MktRangeValue;
  depth: number;
}) {
  const fetchLevel = useServerFn(getMktLevel);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const q = useQuery({
    queryKey: [
      "mkt-level",
      level,
      parentId,
      range.from,
      range.to,
      brandIds.slice().sort().join(","),
    ],
    queryFn: () =>
      fetchLevel({ data: { brandIds, from: range.from, to: range.to, level, parentId } }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (q.isLoading)
    return (
      <tr className="bg-muted/20">
        <td colSpan={13} className="px-3 py-2">
          <Skeleton className="h-6 w-64" />
        </td>
      </tr>
    );

  const rows = q.data ?? [];
  if (rows.length === 0)
    return (
      <tr className="bg-muted/20">
        <td colSpan={13} className="px-3 py-2 text-[11px] text-muted-foreground">
          <span style={{ paddingLeft: depth * 18 }}>
            {level === "adset" ? "Kono ad set data nei" : "Kono ad data nei"}
          </span>
        </td>
      </tr>
    );

  return (
    <>
      {rows.map((r) => (
        <ChildRow
          key={r.id}
          row={r}
          level={level}
          depth={depth}
          brandIds={brandIds}
          range={range}
          open={!!expanded[r.id]}
          onToggle={() => setExpanded((p) => ({ ...p, [r.id]: !p[r.id] }))}
        />
      ))}
    </>
  );
}

function ChildRow({
  row,
  level,
  depth,
  brandIds,
  range,
  open,
  onToggle,
}: {
  row: MktNodeRow;
  level: "adset" | "ad";
  depth: number;
  brandIds: string[];
  range: MktRangeValue;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-t bg-muted/20 hover:bg-muted/40">
        <td className="px-3 py-1.5">
          <div className="flex items-center gap-1.5" style={{ paddingLeft: depth * 18 }}>
            {level === "adset" ? (
              <button onClick={onToggle} className="shrink-0">
                {open ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <span className="w-3.5" />
            )}
            {row.thumbnail && (
              <img
                src={row.thumbnail}
                alt={row.name}
                loading="lazy"
                className="h-6 w-6 rounded object-cover border"
              />
            )}
            <span className="truncate max-w-[260px]">{row.name}</span>
            <Badge variant="outline" className="text-[9px] font-normal px-1 py-0">
              {level === "adset" ? "AD SET" : "AD"}
            </Badge>
          </div>
          {row.targeting && (
            <div
              className="text-[10px] text-muted-foreground truncate max-w-[300px]"
              style={{ paddingLeft: depth * 18 + 20 }}
            >
              {row.targeting}
            </div>
          )}
        </td>
        <td className="px-3 py-1.5 text-right">
          <Badge variant="outline" className={`font-normal ${statusTone(row.status)}`}>
            {row.status}
          </Badge>
        </td>
        <Num v={bdt(row.spend)} />
        <Num v={row.impressions.toLocaleString()} />
        <Num v={pct(row.ctr)} />
        <Num v={bdt(row.cpc)} />
        <Num v={row.orders} />
        <Num v={row.delivered_orders} />
        <Num v={bdt(row.revenue)} />
        <Num
          v={row.roas > 0 ? `${row.roas.toFixed(2)}x` : "—"}
          className={row.roas >= 1 ? "text-emerald-600" : "text-rose-600"}
        />
        <Num v={row.cac > 0 ? bdt(row.cac) : "—"} />
        <td />
        <td />
      </tr>
      {open && level === "adset" && (
        <ChildRows
          level="ad"
          parentId={row.id}
          brandIds={brandIds}
          range={range}
          depth={depth + 1}
        />
      )}
    </>
  );
}

function TargetDialog({ row, onClose }: { row: MktNodeRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(setCampaignTargets);
  const [roas, setRoas] = useState("");
  const [cpa, setCpa] = useState("");
  const [seeded, setSeeded] = useState<string | null>(null);

  if (row && seeded !== row.id) {
    setSeeded(row.id);
    setRoas(row.target_roas == null ? "" : String(row.target_roas));
    setCpa(row.target_cpa == null ? "" : String(row.target_cpa));
  }

  const m = useMutation({
    mutationFn: () =>
      save({
        data: {
          campaignId: row!.id,
          targetRoas: roas.trim() === "" ? null : Number(roas),
          targetCpa: cpa.trim() === "" ? null : Number(cpa),
        },
      }),
    onSuccess: () => {
      toast.success("Target save holo");
      qc.invalidateQueries({ queryKey: ["mkt-level"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Save fail"),
  });

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Target — {row?.name}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Target ROAS (x)</Label>
            <Input
              value={roas}
              onChange={(e) => setRoas(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 3"
            />
            <p className="text-[10px] text-muted-foreground">
              Actual: {row && row.roas > 0 ? `${row.roas.toFixed(2)}x` : "—"}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Target CPA (৳)</Label>
            <Input
              value={cpa}
              onChange={(e) => setCpa(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 350"
            />
            <p className="text-[10px] text-muted-foreground">
              Actual CAC: {row && row.cac > 0 ? bdt(row.cac) : "—"}
            </p>
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

function UnassignedPanel({ brands }: { brands: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const list = useServerFn(listUnassignedCampaigns);
  const assign = useServerFn(assignCampaignsToBrand);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [brandId, setBrandId] = useState<string>("");

  const q = useQuery({
    queryKey: ["mkt-unassigned-campaigns"],
    queryFn: () => list({ data: undefined as never }),
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });

  const m = useMutation({
    mutationFn: () =>
      assign({
        data: { campaignIds: Object.keys(sel).filter((k) => sel[k]), brandId },
      }),
    onSuccess: (r: any) => {
      toast.success(`${r.count} campaign assign holo`);
      setSel({});
      qc.invalidateQueries({ queryKey: ["mkt-unassigned-campaigns"] });
      qc.invalidateQueries({ queryKey: ["mkt-level"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Assign fail"),
  });

  const rows = q.data ?? [];
  if (q.isLoading || rows.length === 0) return null;
  const selected = Object.keys(sel).filter((k) => sel[k]);

  return (
    <Card className="border-amber-500/30">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-600">
          <AlertTriangle className="h-4 w-4" />
          Unassigned campaigns ({rows.length})
        </CardTitle>
        <div className="flex items-center gap-2">
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Brand select korun" />
            </SelectTrigger>
            <SelectContent>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.id} className="text-xs">
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!brandId || selected.length === 0 || m.isPending}
            onClick={() => m.mutate()}
          >
            Assign {selected.length > 0 ? `(${selected.length})` : ""}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="max-h-56 overflow-y-auto space-y-1">
        {rows.map((r) => (
          <label
            key={r.id}
            className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-muted/40 cursor-pointer"
          >
            <Checkbox
              checked={!!sel[r.id]}
              onCheckedChange={(v) => setSel((p) => ({ ...p, [r.id]: !!v }))}
            />
            <span className="truncate flex-1">{r.name ?? "(unnamed)"}</span>
            <span className="text-[10px] text-muted-foreground">{r.objective ?? "—"}</span>
            <Badge
              variant="outline"
              className={`font-normal ${statusTone(r.effective_status ?? r.status ?? "")}`}
            >
              {r.effective_status ?? r.status ?? "—"}
            </Badge>
          </label>
        ))}
      </CardContent>
    </Card>
  );
}
