import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ScanSearch,
  RefreshCcw,
  Search,
  Download,
  ChevronDown,
  ChevronRight,
  MousePointerClick,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import {
  DateRangePicker,
  buildPreset,
  type MktRangeValue,
} from "@/components/erp/marketing/date-range-picker";
import {
  getAttributionAudit,
  type AttributionAuditRow,
} from "@/lib/erp/marketing/campaigns.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/audit")({
  head: () => ({
    meta: [
      { title: "Attribution Audit — Marketing ERP" },
      {
        name: "description",
        content:
          "Order-by-order proof of which campaign an order came from: UTM and pixel signals, click path and final delivery outcome.",
      },
      { property: "og:title", content: "Attribution Audit — Marketing ERP" },
      {
        property: "og:description",
        content: "Trace every attributed order from first click to delivered, returned or cancelled.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AttributionAuditPage,
});

const bdt = (n: number) => "৳" + Math.round(n).toLocaleString("en-IN");
const dt = (s: string | null) =>
  s
    ? new Date(s).toLocaleString("en-GB", {
        timeZone: "Asia/Dhaka",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const OUTCOME_TONE: Record<string, string> = {
  delivered: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  returned: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  cancelled: "bg-muted text-muted-foreground border-border",
  in_progress: "bg-sky-500/10 text-sky-600 border-sky-500/20",
};
const OUTCOME_LABEL: Record<string, string> = {
  delivered: "Delivered",
  returned: "Returned",
  cancelled: "Cancelled",
  in_progress: "In progress",
};

function AttributionAuditPage() {
  const { brands } = useBrand();
  const [brandKey, setBrandKey] = useState("all");
  const [range, setRange] = useState<MktRangeValue>(() => buildPreset("30d"));
  const [outcome, setOutcome] = useState<
    "all" | "delivered" | "returned" | "cancelled" | "in_progress"
  >("all");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const brandIds = useMemo(() => {
    if (brandKey === "all") return brands.map((b) => b.id);
    const b = brands.find((x) => x.slug === brandKey || x.id === brandKey);
    return b ? [b.id] : brands.map((x) => x.id);
  }, [brandKey, brands]);

  const fetchAudit = useServerFn(getAttributionAudit);
  const audit = useQuery({
    queryKey: [
      "mkt-attr-audit",
      brandIds.slice().sort().join(","),
      range.from,
      range.to,
      outcome,
      applied,
    ],
    queryFn: () =>
      fetchAudit({
        data: {
          brandIds,
          from: range.from,
          to: range.to,
          outcome,
          search: applied || null,
          limit: 300,
        },
      }),
    enabled: brandIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const rows = audit.data ?? [];

  const summary = useMemo(() => {
    const s = {
      total: rows.length,
      delivered: 0,
      returned: 0,
      cancelled: 0,
      in_progress: 0,
      revenue: 0,
      withPath: 0,
    };
    for (const r of rows) {
      (s as any)[r.outcome] += 1;
      if (r.outcome === "delivered") s.revenue += r.total;
      if (r.step_count > 0) s.withPath += 1;
    }
    return s;
  }, [rows]);

  const exportCsv = () => {
    const head = [
      "Invoice",
      "Date",
      "Outcome",
      "Order status",
      "Campaign",
      "Ad set",
      "Ad",
      "Match rule",
      "Signal",
      "Confidence",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "fbclid",
      "Click steps",
      "Total",
    ];
    const csv = [
      head,
      ...rows.map((r) => [
        r.invoice_no ?? "",
        r.created_at,
        OUTCOME_LABEL[r.outcome],
        r.status,
        r.campaign_name ?? "",
        r.adset_name ?? "",
        r.ad_name ?? "",
        r.match_rule,
        r.attr_source,
        r.confidence,
        r.utm_source ?? "",
        r.utm_medium ?? "",
        r.utm_campaign ?? "",
        r.utm_content ?? "",
        r.fbclid ?? "",
        r.step_count,
        r.total,
      ]),
    ]
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `attribution-audit-${range.from}-to-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ScanSearch className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold tracking-tight">Attribution Audit</h1>
            <p className="text-xs text-muted-foreground">
              {range.label} · kon order kon campaign theke, kon signal-e match holo, ar sesh porjonto
              ki holo
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
            onClick={() => audit.refetch()}
            disabled={audit.isFetching}
          >
            <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${audit.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <Kpi label="Attributed orders" value={summary.total.toLocaleString()} />
        <Kpi label="Delivered" value={summary.delivered.toLocaleString()} />
        <Kpi label="Returned" value={summary.returned.toLocaleString()} />
        <Kpi label="Cancelled" value={summary.cancelled.toLocaleString()} />
        <Kpi label="Delivered revenue" value={bdt(summary.revenue)} />
        <Kpi
          label="With click path"
          value={`${summary.withPath}/${summary.total || 0}`}
          hint="pixel/UTM events found"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 pb-2 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-sm font-semibold">
            Order-level audit{" "}
            <span className="text-xs font-normal text-muted-foreground">({rows.length})</span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={outcome} onValueChange={(v) => setOutcome(v as typeof outcome)}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  All outcomes
                </SelectItem>
                <SelectItem value="delivered" className="text-xs">
                  Delivered
                </SelectItem>
                <SelectItem value="returned" className="text-xs">
                  Returned
                </SelectItem>
                <SelectItem value="cancelled" className="text-xs">
                  Cancelled
                </SelectItem>
                <SelectItem value="in_progress" className="text-xs">
                  In progress
                </SelectItem>
              </SelectContent>
            </Select>
            <form
              className="relative w-60"
              onSubmit={(e) => {
                e.preventDefault();
                setApplied(search.trim());
              }}
            >
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Invoice / phone / campaign / UTM"
                className="h-8 pl-7 text-xs"
              />
            </form>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {audit.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Ei filter-e kono attributed order nei.
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((r) => (
                <AuditRow
                  key={r.order_id}
                  row={r}
                  open={!!open[r.order_id]}
                  onToggle={() => setOpen((p) => ({ ...p, [r.order_id]: !p[r.order_id] }))}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {audit.error && (
        <Card className="border-destructive/40">
          <CardContent className="py-3 text-sm text-destructive">
            Load fail: {(audit.error as Error).message}
          </CardContent>
        </Card>
      )}
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

function AuditRow({
  row,
  open,
  onToggle,
}: {
  row: AttributionAuditRow;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="text-xs">
      <button
        onClick={onToggle}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-muted/30"
      >
        {open ? (
          <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium">{row.invoice_no ?? row.order_id.slice(0, 8)}</span>
            <Badge variant="outline" className={`h-4 px-1.5 font-normal ${OUTCOME_TONE[row.outcome]}`}>
              {OUTCOME_LABEL[row.outcome]}
            </Badge>
            <span className="text-[10px] text-muted-foreground">{row.status}</span>
            <span className="text-[10px] text-muted-foreground">· {dt(row.created_at)}</span>
            <span className="text-[10px] text-muted-foreground">· {bdt(row.total)}</span>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {row.campaign_name ?? "(no campaign)"}
            {row.adset_name ? ` › ${row.adset_name}` : ""}
            {row.ad_name ? ` › ${row.ad_name}` : ""}
          </div>
        </div>
        <div className="hidden shrink-0 flex-col items-end gap-0.5 sm:flex">
          <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal">
            {row.attr_source}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            conf {Math.round(row.confidence * 100)}% · {row.step_count} steps
          </span>
        </div>
      </button>

      {open && (
        <div className="space-y-3 bg-muted/20 px-9 pb-4 pt-1">
          <div className="rounded-md border bg-background p-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Keno ei campaign-e credit holo
            </div>
            <div className="mt-0.5 text-[11px]">{row.match_rule}</div>
            {row.note && (
              <div className="mt-0.5 text-[10px] text-muted-foreground">Note: {row.note}</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1 md:grid-cols-5">
            <Field label="utm_source" v={row.utm_source} />
            <Field label="utm_medium" v={row.utm_medium} />
            <Field label="utm_campaign" v={row.utm_campaign} />
            <Field label="utm_content" v={row.utm_content} />
            <Field label="fbclid" v={row.fbclid} />
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1 md:grid-cols-4">
            <Field label="Order source" v={row.order_source} />
            <Field label="Confirmation" v={row.confirmation_status} />
            <Field label="Web status" v={row.web_status} />
            <Field label="Customer" v={row.customer_name ?? row.phone} />
          </div>

          {row.products.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Products
              </div>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {row.products.map((p, i) => (
                  <Badge key={i} variant="outline" className="h-5 font-normal">
                    {p.title} × {p.qty}
                    {p.sku ? ` · ${p.sku}` : ""}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <MousePointerClick className="h-3 w-3" />
              Click → purchase path
            </div>
            {row.path.length === 0 ? (
              <p className="mt-1 rounded-md border border-dashed p-2 text-[11px] text-muted-foreground">
                Ei order-er kono pixel/tracking event pawa jayni — attribution UTM ba manual signal
                theke hoyeche.
              </p>
            ) : (
              <ol className="mt-1 space-y-1 border-l pl-3">
                {row.path.map((s, i) => (
                  <li key={i} className="relative text-[11px]">
                    <span className="absolute -left-[15px] top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                    <span className="font-medium">{s.event_type}</span>{" "}
                    <span className="text-muted-foreground">{dt(s.at)}</span>
                    {s.utm_campaign && (
                      <span className="text-muted-foreground"> · {s.utm_campaign}</span>
                    )}
                    {s.url && (
                      <div className="truncate text-[10px] text-muted-foreground">{s.url}</div>
                    )}
                  </li>
                ))}
                <li className="relative text-[11px]">
                  <span className="absolute -left-[15px] top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span className="font-medium">order placed</span>{" "}
                  <span className="text-muted-foreground">{dt(row.created_at)}</span>
                </li>
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, v }: { label: string; v: string | null }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-[11px]">{v || "—"}</div>
    </div>
  );
}
