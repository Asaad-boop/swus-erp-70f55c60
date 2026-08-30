import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  ArrowLeft, BarChart3, Boxes, AlertTriangle, History, RefreshCw, Download,
  TrendingUp, TrendingDown, Wallet, Package, Check, X as XIcon, Search, Filter,
} from "lucide-react";
import { toast } from "sonner";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { exportToXlsx } from "@/lib/erp/utils/excel";
import { DateRangePicker, buildPreset, type MktRangeValue } from "@/components/erp/marketing/date-range-picker";
import {
  getStockValuationReport,
  getStockMovementReport,
  getLowStockReport,
  getReorderSuggestions,
  updateReorderSuggestion,
} from "@/lib/erp/inventory/reports.functions";

export const Route = createFileRoute("/_authenticated/erp/inventory-reports")({
  head: () => ({ meta: [{ title: "Inventory Reports — ERP" }] }),
  component: InventoryReportsPage,
});

const fmtBdt = (n: number) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(n || 0);

function InventoryReportsPage() {
  const { brandId, effectiveBrand, picker } = useBrandPicker();

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/5 via-background to-background p-5 md:p-6">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <Link to="/erp/inventory">
              <Button variant="ghost" size="sm" className="rounded-full"><ArrowLeft className="h-4 w-4 mr-1" />Inventory</Button>
            </Link>
            <div className="hidden md:block h-8 w-px bg-border" />
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight leading-tight">Inventory Reports</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {effectiveBrand?.name ?? "—"} · valuation, movements & reorder intelligence
                  {" · "}
                  <a href="/erp/reports?tab=inventory" className="underline underline-offset-2">
                    Reports Hub
                  </a>
                </p>
              </div>
            </div>
          </div>
          {picker}
        </div>
      </div>

      {!brandId ? (
        <Card className="p-12 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <Package className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="text-sm font-medium">Select a brand to view reports</div>
          <div className="text-xs text-muted-foreground mt-1">Use the brand picker above to load data.</div>
        </Card>
      ) : (
        <Tabs defaultValue="valuation" className="space-y-5">
          <TabsList className="h-11 p-1 bg-muted/60 backdrop-blur rounded-xl grid grid-cols-4 w-full max-w-2xl">
            <TabsTrigger value="valuation" className="rounded-lg data-[state=active]:shadow-sm"><Wallet className="h-3.5 w-3.5 mr-1.5" />Valuation</TabsTrigger>
            <TabsTrigger value="movement" className="rounded-lg data-[state=active]:shadow-sm"><History className="h-3.5 w-3.5 mr-1.5" />Movement</TabsTrigger>
            <TabsTrigger value="low-stock" className="rounded-lg data-[state=active]:shadow-sm"><AlertTriangle className="h-3.5 w-3.5 mr-1.5" />Low Stock</TabsTrigger>
            <TabsTrigger value="reorder" className="rounded-lg data-[state=active]:shadow-sm"><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Reorder</TabsTrigger>
          </TabsList>

          <TabsContent value="valuation"><ValuationTab brandId={brandId} /></TabsContent>
          <TabsContent value="movement"><MovementTab brandId={brandId} /></TabsContent>
          <TabsContent value="low-stock"><LowStockTab brandId={brandId} /></TabsContent>
          <TabsContent value="reorder"><ReorderTab brandId={brandId} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/* ============================================================
   VALUATION
   ============================================================ */
function ValuationTab({ brandId }: { brandId: string }) {
  const fn = useServerFn(getStockValuationReport);
  const [includeZero, setIncludeZero] = useState(false);
  const [q, setQ] = useState("");
  const { data = [], isLoading } = useQuery({
    queryKey: ["report-valuation", brandId, includeZero],
    queryFn: () => fn({ data: { brandId, includeZero } }),
  });

  const rows = data as any[];
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return rows;
    return rows.filter((r) => r.title?.toLowerCase().includes(n) || r.sku?.toLowerCase().includes(n));
  }, [rows, q]);

  const totals = useMemo(() => {
    const units = rows.reduce((s, r) => s + (r.stock || 0), 0);
    const value = rows.reduce((s, r) => s + Number(r.total_cost_value || 0), 0);
    const skus = rows.length;
    return { units, value, skus };
  }, [rows]);

  const handleExport = () => {
    const out = filtered.map((r) => ({
      Title: r.title,
      SKU: r.sku ?? "",
      Stock: r.stock,
      Reserved: r.reserved_stock,
      Available: r.available_stock,
      "WAC (BDT)": Number(r.weighted_avg_cost || 0).toFixed(2),
      "Total Value (BDT)": Number(r.total_cost_value || 0).toFixed(2),
      "Reorder Point": r.reorder_point,
    }));
    exportToXlsx(out, "Stock Valuation", `stock-valuation-${new Date().toISOString().slice(0, 10)}`);
    toast.success("Export downloaded");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiTile label="Total SKUs" value={String(totals.skus)} icon={Package} accent="slate" />
        <KpiTile label="Total Units" value={totals.units.toLocaleString()} icon={Boxes} accent="blue" />
        <KpiTile label="Inventory Value (WAC)" value={fmtBdt(totals.value)} icon={TrendingUp} accent="emerald" hero />
      </div>

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or SKU…" className="pl-9" />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none px-3 h-9 rounded-md border bg-background hover:bg-muted/50 transition">
          <input type="checkbox" checked={includeZero} onChange={(e) => setIncludeZero(e.target.checked)} className="accent-primary" />
          Include zero-stock
        </label>
        <Button size="sm" variant="outline" onClick={handleExport} disabled={filtered.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1" />Export
        </Button>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Reserved</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead className="text-right">WAC</TableHead>
              <TableHead className="text-right">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <SkeletonRows cols={6} />
            ) : filtered.length === 0 ? (
              <EmptyRow cols={6} icon={Package} text="No products match your filters" />
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id} className="group">
                  <TableCell>
                    <div className="text-sm font-medium leading-tight">{r.title}</div>
                    {r.sku && <div className="text-[11px] font-mono text-muted-foreground/70 mt-0.5">{r.sku}</div>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.stock}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", r.reserved_stock > 0 && "text-amber-600")}>{r.reserved_stock}</TableCell>
                  <TableCell className={cn("text-right tabular-nums font-medium", r.available_stock <= 0 && "text-red-600")}>{r.available_stock}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBdt(Number(r.weighted_avg_cost))}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{fmtBdt(Number(r.total_cost_value))}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

/* ============================================================
   MOVEMENT
   ============================================================ */
const SOURCE_OPTIONS = [
  { v: "all", l: "All sources" },
  { v: "manual", l: "Manual" },
  { v: "order", l: "Order" },
  { v: "return", l: "Return" },
  { v: "import", l: "Import (China)" },
  { v: "local_po", l: "Local PO" },
  { v: "opening", l: "Opening Stock" },
];

function MovementTab({ brandId }: { brandId: string }) {
  const fn = useServerFn(getStockMovementReport);
  const [range, setRange] = useState<MktRangeValue>(() => buildPreset("30d"));
  const [source, setSource] = useState("all");
  const from = range.from;
  const to = range.to;

  const { data = [], isLoading } = useQuery({
    queryKey: ["report-movement", brandId, from, to, source],
    queryFn: () => fn({ data: { brandId, from, to, source } }),
  });

  const rows = data as any[];
  const totals = useMemo(() => {
    const inQty = rows.filter((r) => r.delta > 0).reduce((s, r) => s + r.delta, 0);
    const outQty = rows.filter((r) => r.delta < 0).reduce((s, r) => s + Math.abs(r.delta), 0);
    const value = rows.reduce((s, r) => s + Number(r.total_cost_bdt || 0), 0);
    return { inQty, outQty, value, count: rows.length };
  }, [rows]);

  const handleExport = () => {
    const out = rows.map((r) => ({
      Date: r.created_at?.slice(0, 19).replace("T", " "),
      Product: r.product?.title ?? "",
      SKU: r.variant?.sku ?? r.product?.sku ?? "",
      Source: r.movement_source,
      Reason: r.reason,
      Delta: r.delta,
      "Stock After": r.stock_after,
      "Unit Cost": r.unit_cost_bdt ?? "",
      "Total Cost": r.total_cost_bdt ?? "",
      Note: r.note ?? "",
    }));
    exportToXlsx(out, "Stock Movement", `stock-movement-${from}_to_${to}`);
    toast.success("Export downloaded");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Movements" value={String(totals.count)} icon={History} accent="slate" />
        <KpiTile label="Stock In" value={`+${totals.inQty.toLocaleString()}`} icon={TrendingUp} accent="emerald" />
        <KpiTile label="Stock Out" value={`-${totals.outQty.toLocaleString()}`} icon={TrendingDown} accent="red" />
        <KpiTile label="Cost Value" value={fmtBdt(totals.value)} icon={Wallet} accent="blue" hero />
      </div>

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <DateRangePicker value={range} onChange={setRange} />
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-[180px]">
            <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={handleExport} disabled={rows.length === 0} className="ml-auto">
          <Download className="h-3.5 w-3.5 mr-1" />Export
        </Button>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead>Date</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">Delta</TableHead>
              <TableHead className="text-right">After</TableHead>
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <SkeletonRows cols={7} />
            ) : rows.length === 0 ? (
              <EmptyRow cols={7} icon={History} text="No movements in this period" />
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{r.created_at?.slice(0, 16).replace("T", " ")}</TableCell>
                  <TableCell>
                    <div className="text-sm font-medium leading-tight">{r.product?.title ?? "—"}</div>
                    {(r.variant?.sku || r.product?.sku) && (
                      <div className="text-[10px] font-mono text-muted-foreground/70 mt-0.5">{r.variant?.sku ?? r.product?.sku}</div>
                    )}
                  </TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px] capitalize font-normal">{r.movement_source ?? "manual"}</Badge></TableCell>
                  <TableCell className="text-xs">{r.reason}</TableCell>
                  <TableCell className={cn("text-right tabular-nums font-semibold", r.delta > 0 ? "text-emerald-600" : "text-red-600")}>
                    {r.delta > 0 ? "+" : ""}{r.delta}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.stock_after}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">{r.total_cost_bdt ? fmtBdt(Number(r.total_cost_bdt)) : "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

/* ============================================================
   LOW STOCK
   ============================================================ */
function LowStockTab({ brandId }: { brandId: string }) {
  const fn = useServerFn(getLowStockReport);
  const { data = [], isLoading } = useQuery({
    queryKey: ["report-low-stock", brandId],
    queryFn: () => fn({ data: { brandId } }),
  });
  const rows = data as any[];

  const handleExport = () => {
    const out = rows.map((r) => ({
      Title: r.title,
      SKU: r.sku ?? "",
      Stock: r.stock,
      Available: r.available_stock,
      "Reorder Point": r.reorder_point,
      "Suggested Qty": r.reorder_qty || Math.max(r.reorder_point * 2 - r.stock, 1),
      "WAC (BDT)": Number(r.weighted_avg_cost || 0).toFixed(2),
    }));
    exportToXlsx(out, "Low Stock", `low-stock-${new Date().toISOString().slice(0, 10)}`);
    toast.success("Export downloaded");
  };

  return (
    <div className="space-y-4">
      <Card className={cn(
        "p-4 flex items-center justify-between flex-wrap gap-2 border-l-4",
        rows.length === 0 ? "border-l-emerald-500" : "border-l-amber-500",
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-9 w-9 rounded-lg flex items-center justify-center",
            rows.length === 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600",
          )}>
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">{rows.length} product{rows.length === 1 ? "" : "s"} at or below reorder point</div>
            <div className="text-xs text-muted-foreground">Suggested quantities are based on 2× the reorder point.</div>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={handleExport} disabled={rows.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1" />Export
        </Button>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead className="text-right">Reorder Point</TableHead>
              <TableHead className="text-right">Suggested Qty</TableHead>
              <TableHead>Severity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <SkeletonRows cols={6} />
            ) : rows.length === 0 ? (
              <EmptyRow cols={6} icon={Check} text="All products are above reorder point" tone="emerald" />
            ) : (
              rows.map((r) => {
                const avail = Number(r.available_stock ?? r.stock ?? 0);
                const severity = avail <= 0 ? "out" : avail <= r.reorder_point / 2 ? "critical" : "low";
                const suggested = r.reorder_qty || Math.max(r.reorder_point * 2 - avail, 1);
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="text-sm font-medium leading-tight">{r.title}</div>
                      {r.sku && <div className="text-[11px] font-mono text-muted-foreground/70 mt-0.5">{r.sku}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.stock}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", r.available_stock <= 0 && "text-red-600 font-semibold")}>{r.available_stock}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.reorder_point}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{suggested}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn(
                        "font-medium",
                        severity === "out" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" :
                        severity === "critical" ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" :
                        "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
                      )}>
                        {severity === "out" ? "Out of stock" : severity === "critical" ? "Critical" : "Low"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

/* ============================================================
   REORDER SUGGESTIONS QUEUE
   ============================================================ */
function ReorderTab({ brandId }: { brandId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(getReorderSuggestions);
  const updateFn = useServerFn(updateReorderSuggestion);
  const [status, setStatus] = useState("pending");

  const { data = [], isLoading } = useQuery({
    queryKey: ["reorder-suggestions", brandId, status],
    queryFn: () => fn({ data: { brandId, status } }),
  });
  const rows = data as any[];

  const mut = useMutation({
    mutationFn: (args: { id: string; status: "processed" | "dismissed" }) =>
      updateFn({ data: args }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reorder-suggestions"] });
      toast.success("Updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-4">
      <Card className="p-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5" />
          Daily cron-generated suggestions based on reorder points.
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px]">
            <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processed">Processed</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead>Generated</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Current Stock</TableHead>
              <TableHead className="text-right">Reorder Point</TableHead>
              <TableHead className="text-right">Suggested Qty</TableHead>
              <TableHead className="text-right">Est. Cost</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <SkeletonRows cols={8} />
            ) : rows.length === 0 ? (
              <EmptyRow cols={8} icon={RefreshCw} text={`No ${status === "all" ? "" : status} suggestions`} />
            ) : (
              rows.map((r) => {
                const wac = Number(r.product?.weighted_avg_cost || 0);
                const estCost = wac * (r.suggested_qty || 0);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {r.created_at?.slice(0, 10)}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium leading-tight">{r.product?.title ?? "—"}</div>
                      {(r.variant?.sku || r.product?.sku) && (
                        <div className="text-[11px] font-mono text-muted-foreground/70 mt-0.5">{r.variant?.sku ?? r.product?.sku}</div>
                      )}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", r.current_stock <= 0 && "text-red-600 font-semibold")}>{r.current_stock}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.reorder_point}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{r.suggested_qty}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{estCost > 0 ? fmtBdt(estCost) : "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn(
                        "font-medium capitalize",
                        r.status === "pending" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" :
                        r.status === "processed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" :
                        "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                      )}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status === "pending" && (
                        <div className="inline-flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950" title="Mark processed"
                            onClick={() => mut.mutate({ id: r.id, status: "processed" })} disabled={mut.isPending}>
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-muted" title="Dismiss"
                            onClick={() => mut.mutate({ id: r.id, status: "dismissed" })} disabled={mut.isPending}>
                            <XIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

/* ============================================================
   shared
   ============================================================ */
const ACCENTS: Record<string, { text: string; bg: string; ring: string; grad: string }> = {
  slate:   { text: "text-slate-600",   bg: "bg-slate-500/10",   ring: "ring-slate-500/20",   grad: "from-slate-500/5" },
  blue:    { text: "text-blue-600",    bg: "bg-blue-500/10",    ring: "ring-blue-500/20",    grad: "from-blue-500/5" },
  emerald: { text: "text-emerald-600", bg: "bg-emerald-500/10", ring: "ring-emerald-500/20", grad: "from-emerald-500/10" },
  red:     { text: "text-red-600",     bg: "bg-red-500/10",     ring: "ring-red-500/20",     grad: "from-red-500/5" },
};

function KpiTile({ label, value, icon: Icon, accent = "slate", hero = false }: { label: string; value: string; icon: any; accent?: keyof typeof ACCENTS; hero?: boolean }) {
  const a = ACCENTS[accent] ?? ACCENTS.slate;
  return (
    <Card className={cn(
      "relative overflow-hidden p-4 transition hover:shadow-md",
      hero && `bg-gradient-to-br ${a.grad} to-background`,
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center ring-1", a.bg, a.ring)}>
          <Icon className={cn("h-3.5 w-3.5", a.text)} />
        </div>
      </div>
      <div className={cn("text-2xl font-bold tabular-nums tracking-tight", hero && a.text)}>{value}</div>
    </Card>
  );
}

function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((__, j) => (
            <TableCell key={j}><div className="h-3 bg-muted/60 rounded animate-pulse" style={{ width: `${40 + ((i + j) * 13) % 50}%` }} /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function EmptyRow({ cols, icon: Icon, text, tone = "muted" }: { cols: number; icon: any; text: string; tone?: "muted" | "emerald" }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={cols} className="py-12">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className={cn(
            "h-10 w-10 rounded-full flex items-center justify-center",
            tone === "emerald" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground",
          )}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="text-sm text-muted-foreground">{text}</div>
        </div>
      </TableCell>
    </TableRow>
  );
}