import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, LayoutGrid, Loader2, RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBrand } from "@/contexts/brand-context";
import { buildPreset } from "@/components/erp/marketing/date-range-picker";
import { downloadCsv } from "@/lib/erp/orders";
import {
  exportOrderDashboardCsv,
  getOrderDashboardSummary,
  listOrderDashboardRows,
  type OrderDashboardFilter,
} from "@/lib/erp/orders-dashboard.functions";
import {
  DashboardFilterBar,
  type DashboardFilterState,
} from "@/components/erp/orders/dashboard/dashboard-filter-bar";
import { DashboardKpiStrip, money } from "@/components/erp/orders/dashboard/dashboard-kpis";
import { DashboardCharts } from "@/components/erp/orders/dashboard/dashboard-charts";
import {
  ALL_COLUMNS,
  DEFAULT_COLUMNS,
  DashboardTable,
  type SortKey,
} from "@/components/erp/orders/dashboard/dashboard-table";

export const Route = createFileRoute("/_authenticated/erp/orders/dashboard")({
  head: () => ({ meta: [{ title: "Order Dashboard — ERP" }] }),
  component: OrderDashboardPage,
});

const initialState = (): DashboardFilterState => ({
  range: buildPreset("30d"),
  statuses: [],
  paymentStatus: "",
  source: "",
  courier: "",
  confirmedBy: "",
  search: "",
  tags: [],
  minAmount: "",
  maxAmount: "",
  city: "",
});

function OrderDashboardPage() {
  const { activeBrand, brandIds, isAllBrands } = useBrand();
  const [state, setState] = useState<DashboardFilterState>(initialState);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [sort, setSort] = useState<SortKey>("created_at");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [columns, setColumns] = useState<string[]>(DEFAULT_COLUMNS);
  const [showCharts, setShowCharts] = useState(true);
  const [exporting, setExporting] = useState(false);

  const scopedBrandIds = useMemo(
    () => (isAllBrands ? brandIds : activeBrand ? [activeBrand.id] : []),
    [isAllBrands, brandIds, activeBrand],
  );

  const filter: OrderDashboardFilter = useMemo(
    () => ({
      brandIds: scopedBrandIds,
      from: state.range.from || null,
      to: state.range.to || null,
      statuses: state.statuses,
      paymentStatus: state.paymentStatus || null,
      source: state.source || null,
      courier: state.courier || null,
      confirmedBy: state.confirmedBy || null,
      search: state.search,
      tags: state.tags,
      minAmount: state.minAmount ? Number(state.minAmount) : null,
      maxAmount: state.maxAmount ? Number(state.maxAmount) : null,
      city: state.city || null,
    }),
    [scopedBrandIds, state],
  );

  const fetchSummary = useServerFn(getOrderDashboardSummary);
  const fetchRows = useServerFn(listOrderDashboardRows);
  const fetchCsv = useServerFn(exportOrderDashboardCsv);

  const summaryQ = useQuery({
    queryKey: ["order-dashboard-summary", filter],
    queryFn: () => fetchSummary({ data: filter }),
    enabled: scopedBrandIds.length > 0,
    placeholderData: keepPreviousData,
  });

  const rowsQ = useQuery({
    queryKey: ["order-dashboard-rows", filter, sort, dir, page, pageSize],
    queryFn: () => fetchRows({ data: { ...filter, sort, dir, page, pageSize } }),
    enabled: scopedBrandIds.length > 0,
    placeholderData: keepPreviousData,
  });

  const patch = (p: Partial<DashboardFilterState>) => {
    setState((s) => ({ ...s, ...p }));
    setPage(0);
  };

  const onSort = (k: SortKey) => {
    if (k === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(k);
      setDir("desc");
    }
    setPage(0);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetchCsv({ data: filter });
      downloadCsv(`order-dashboard-${state.range.from}_${state.range.to}.csv`, res.csv);
      toast.success(`${res.count} order export হয়েছে`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const summary = summaryQ.data;
  const rows = rowsQ.data?.rows ?? [];
  const total = rowsQ.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <LayoutGrid className="h-5 w-5 text-primary" /> Order Dashboard
          </h1>
          <p className="text-xs text-muted-foreground">
            {activeBrand?.name ?? "All brands"} · {total.toLocaleString()} orders
            {rowsQ.data ? ` · ${money(rowsQ.data.sum_total)} filtered value` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowCharts((v) => !v)}>
            {showCharts ? "Hide charts" : "Show charts"}
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Settings2 className="h-3.5 w-3.5" /> Columns
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 p-2">
              {ALL_COLUMNS.map((c) => (
                <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={columns.includes(c.key)}
                    disabled={c.always}
                    onChange={(e) =>
                      setColumns((cols) =>
                        e.target.checked ? [...cols, c.key] : cols.filter((x) => x !== c.key),
                      )
                    }
                  />
                  {c.label}
                </label>
              ))}
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              summaryQ.refetch();
              rowsQ.refetch();
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${summaryQ.isFetching || rowsQ.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export CSV
          </Button>
        </div>
      </div>

      <DashboardFilterBar
        state={state}
        onChange={patch}
        onReset={() => {
          setState(initialState());
          setPage(0);
        }}
        confirmers={summary?.confirmers ?? []}
      />

      {summaryQ.isLoading ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : summary ? (
        <DashboardKpiStrip
          kpis={summary.kpis}
          activeStatuses={state.statuses}
          onPickStatuses={(s) => patch({ statuses: s })}
        />
      ) : null}

      {showCharts && summary ? <DashboardCharts summary={summary} /> : null}

      <DashboardTable
        rows={rows}
        loading={rowsQ.isLoading}
        columns={columns}
        sort={sort}
        dir={dir}
        onSort={onSort}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Rows</span>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
            <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[25, 50, 100, 200].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
          {rowsQ.isFetching && <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> updating</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Page {page + 1} / {pages}</span>
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}