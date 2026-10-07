import { dhakaToday } from "@/lib/erp/finance";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Download, Package, Search, TrendingUp, TrendingDown,
  PackageCheck, RotateCcw, Repeat2, Truck, Megaphone, FileText,
} from "lucide-react";
import { CalendarIcon, Wallet, Receipt, BarChart3, Filter, Box } from "lucide-react";
import { format } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRangePicker, type MktRangeValue } from "@/components/erp/marketing/date-range-picker";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { fmtBdt } from "@/lib/erp/finance";
import { cn } from "@/lib/utils";
import { ReturnCaseDialog } from "@/components/erp/finance/return-case-dialog";
import { ExchangeCaseDialog } from "@/components/erp/finance/exchange-case-dialog";
import { Plus, RefreshCcw } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type ProductRow = { id: string; title: string; sku: string | null; image: string | null; brand_id: string | null; stock: number | null };

type Report = {
  product: { id: string; name: string; sku: string | null; image: string | null; brand_id: string; cost_price: number | null; stock: number | null };
  stock: { current: number; delivered_in_range: number; returned_in_range: number };
  quantities: { website_orders: number; manual_orders: number; confirmed: number; delivered: number; shipped: number; cancelled: number; returned: number; exchanged: number; damaged: number };
  sources: Array<{ source: string; created: number; confirmed: number; shipped: number; delivered: number; returned: number; revenue: number; delivery_collected: number; net_payable: number; delivery_rate: number }>;
  revenue: { gross: number; delivery_collected: number; discount: number; refund: number; net_payable: number };
  cost: { cogs: number; courier_out: number; courier_return: number; packaging: number; return_loss: number; exchange_loss: number; damage_loss: number; refund_loss: number; meta_ads: number; marketing_content: number };
  profit: { gross: number; contribution: number; net: number; per_delivered_unit: number; per_confirmed_unit: number; return_rate: number; exchange_rate: number; damage_rate: number; delivery_success_rate: number };
  items: Array<{ order_id: string; item_id: string; date: string; status: string; source: string; qty: number; unit_price: number; line_total: number; unit_cost: number | null; discount_alloc: number | null; delivery_alloc: number | null; courier_cost: number | null }>;
  returns: Array<{ id: string; order_id: string; return_type: string; condition: string; qty: number; refund: number; cost_loss: number; status: string; created_at: string }>;
  exchanges: Array<{ id: string; original_order_id: string; exchange_type: string; old_condition: string; replacement_product_id: string | null; qty: number; loss: number; status: string; created_at: string }>;
 marketing: Array<{ expense_type: string; amount: number; note: string | null; created_at: string; kind?: "allocation" | "manual"; allocation_date?: string | null }>;
  warnings: string[];
};

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

function todayIso() { return dhakaToday(); }
function daysAgoIso(d: number) { const x = new Date(); x.setDate(x.getDate() - d); return x.toISOString().slice(0, 10); }
function isoToDate(s: string) { const [y,m,d] = s.split("-").map(Number); return new Date(y, (m||1)-1, d||1); }
function dateToIso(d: Date) { return format(d, "yyyy-MM-dd"); }

function csvEscape(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function ProductProfitabilityPage() {
  const { brandId, effectiveBrand, picker } = useBrandPicker();

  const [productId, setProductId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string>(daysAgoIso(30));
  const [dateTo, setDateTo] = useState<string>(todayIso());
  const [dateBasis, setDateBasis] = useState<"created" | "confirmed" | "delivered">("created");
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  // Expense allocation removed — COGS now sourced from products.cost_price.
  const qc = useQueryClient();
  const backfillMut = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("No brand");
      const { data, error } = await supabase.rpc("backfill_order_profit_snapshots" as any, { p_brand_id: brandId });
      if (error) throw error;
      return data as unknown as number;
    },
    onSuccess: (n) => {
      toast.success(`Re-snapshotted ${n} orders`);
      qc.invalidateQueries({ queryKey: ["pp-report"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // product list (search)
  const productsQ = useQuery({
    queryKey: ["pp-products", brandId, search],
    enabled: !!brandId && pickerOpen,
    queryFn: async () => {
      let q = supabase.from("products").select("id,title,sku,image,brand_id,stock").eq("brand_id", brandId!).order("title").limit(50);
      if (search.trim()) q = q.or(`title.ilike.%${search}%,sku.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ProductRow[];
    },
  });

  const reportQ = useQuery({
    queryKey: ["pp-report", brandId, productId, dateFrom, dateTo, dateBasis],
    enabled: !!brandId && !!productId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_product_profitability_report", {
        p_brand_id: brandId!,
        p_product_id: productId!,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_date_basis: dateBasis,
      });
      if (error) throw error;
      return data as unknown as Report;
    },
  });

  const r = reportQ.data;

  const funnelData = useMemo(() => {
    if (!r) return [];
    const q = r.quantities;
    return [
      { stage: "Confirmed", qty: q.confirmed },
      { stage: "Shipped", qty: q.shipped },
      { stage: "Delivered", qty: q.delivered },
      { stage: "Returned", qty: q.returned },
      { stage: "Exchanged", qty: q.exchanged },
      { stage: "Damaged", qty: q.damaged },
    ];
  }, [r]);

  const costPie = useMemo(() => {
    if (!r) return [];
    const c = r.cost;
    return [
      { name: "COGS", value: c.cogs },
      { name: "Courier Out", value: c.courier_out },
      { name: "Packaging", value: c.packaging },
      { name: "Return Loss", value: c.return_loss },
      { name: "Exchange Loss", value: c.exchange_loss },
      { name: "Damage Loss", value: c.damage_loss },
      { name: "Meta Ads", value: c.meta_ads },
      { name: "Content/Other", value: c.marketing_content },
    ].filter((x) => Number(x.value) > 0);
  }, [r]);

  function exportItemsCsv() {
    if (!r) return;
    downloadCsv(`product-${r.product.sku ?? r.product.id}-items.csv`, [
      ["Date", "Order", "Status", "Source", "Qty", "Unit Price", "Line Total", "Unit Cost", "Discount Alloc", "Delivery Alloc", "Courier Cost"],
      ...r.items.map((i) => [i.date, i.order_id, i.status, i.source, i.qty, i.unit_price, i.line_total, i.unit_cost ?? "", i.discount_alloc ?? "", i.delivery_alloc ?? "", i.courier_cost ?? ""]),
    ]);
  }
  function exportSourcesCsv() {
    if (!r) return;
    downloadCsv(`product-${r.product.sku ?? r.product.id}-sources.csv`, [
      ["Source", "Created", "Confirmed", "Shipped", "Delivered", "Returned", "Revenue", "Delivery Collected", "Net Payable", "Delivery Rate %"],
      ...r.sources.map((s) => [s.source, s.created, s.confirmed, s.shipped, s.delivered, s.returned, s.revenue, s.delivery_collected, s.net_payable, s.delivery_rate]),
    ]);
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1600px] mx-auto">
      {picker && <div className="flex justify-end -mb-1">{picker}</div>}
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-primary/10 via-background to-emerald-500/5 p-5 md:p-6">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-12 -bottom-12 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Product Profitability</h1>
              <p className="text-sm text-muted-foreground">True unit economics — orders, COGS, courier, returns, exchanges, ads.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {brandId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => backfillMut.mutate()}
                disabled={backfillMut.isPending}
                title="Re-snapshot all brand orders (admin only)"
              >
                <RefreshCcw className={cn("h-3 w-3 mr-1", backfillMut.isPending && "animate-spin")} />
                {backfillMut.isPending ? "Re-snapshotting…" : "Re-snapshot"}
              </Button>
            )}
          {r && (
            <div className="flex items-center gap-2 rounded-lg border bg-card/80 backdrop-blur px-3 py-2">
              {r.product.image ? (
                <img src={r.product.image} alt="" className="h-10 w-10 rounded-md object-cover" />
              ) : (
                <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center"><Package className="h-4 w-4 text-muted-foreground" /></div>
              )}
              <div className="min-w-0">
                <div className="text-sm font-medium truncate max-w-[260px]">{r.product.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <span>{r.product.sku ?? "—"}</span>
                  <span>·</span>
                  <span>Stock {r.stock.current}</span>
                  {r.product.cost_price != null && <><span>·</span><span>Cost {fmtBdt(r.product.cost_price)}</span></>}
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <div className="border-b bg-muted/30 px-4 py-2 flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Filters</span>
          {productId && (
            <Badge variant="secondary" className="ml-auto text-[10px] font-normal">
              {dateFrom} → {dateTo} · by {dateBasis}
            </Badge>
          )}
        </div>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-5">
              <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <Box className="h-3 w-3" /> PRODUCT
              </Label>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal h-10">
                    <Package className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="truncate">{r?.product?.name ?? (productId ? "Loading…" : "Select product")}</span>
                    {r?.product?.sku && <span className="text-muted-foreground ml-2 text-xs">· {r.product.sku}</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[420px] p-0" align="start">
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input autoFocus placeholder="Search by name or SKU…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
                    </div>
                  </div>
                  <div className="max-h-80 overflow-auto">
                    {productsQ.isLoading && <div className="p-3 text-sm text-muted-foreground">Loading…</div>}
                    {!productsQ.isLoading && (productsQ.data ?? []).length === 0 && (
                      <div className="p-3 text-sm text-muted-foreground">No products found.</div>
                    )}
                    {(productsQ.data ?? []).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { setProductId(p.id); setPickerOpen(false); }}
                        className={cn(
                          "w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2 border-b last:border-0",
                          productId === p.id && "bg-muted",
                        )}
                      >
                        {p.image ? (
                          <img src={p.image} alt="" className="h-8 w-8 rounded object-cover" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center"><Package className="h-4 w-4 text-muted-foreground" /></div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm truncate">{p.title}</div>
                          <div className="text-xs text-muted-foreground">{p.sku ?? "—"} · stock {p.stock ?? 0}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="md:col-span-4">
              <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <CalendarIcon className="h-3 w-3" /> DATE RANGE
              </Label>
              <DateRangePicker
                className="w-full h-10 justify-start"
                value={{ presetKey: "custom", label: "Custom", from: dateFrom, to: dateTo } as MktRangeValue}
                onChange={(v) => { setDateFrom(v.from); setDateTo(v.to); }}
              />
            </div>
            <div className="md:col-span-3">
              <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <BarChart3 className="h-3 w-3" /> DATE BASIS
              </Label>
              <Select value={dateBasis} onValueChange={(v) => setDateBasis(v as typeof dateBasis)}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="created">Order created</SelectItem>
                  <SelectItem value="confirmed">Confirmed at</SelectItem>
                  <SelectItem value="delivered">Delivered at</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {!productId && (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <Package className="h-6 w-6 text-primary" />
            </div>
            <div className="font-medium">Select a product</div>
            <div className="text-sm text-muted-foreground mt-1">Pick a product above to view its full profitability report.</div>
          </CardContent>
        </Card>
      )}

      {productId && reportQ.isLoading && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl border bg-muted/40 animate-pulse" />
            ))}
          </div>
          <div className="h-64 rounded-xl border bg-muted/30 animate-pulse" />
        </div>
      )}

      {productId && reportQ.error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Report failed</AlertTitle>
          <AlertDescription>{(reportQ.error as Error).message}</AlertDescription>
        </Alert>
      )}

      {r && (
        <>
          {/* Warnings */}
          {r.warnings && r.warnings.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Data quality warnings</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5 mt-1 space-y-0.5 text-sm">
                  {r.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
                <div className="mt-2">
                  <Button size="sm" variant="outline" onClick={() => backfillMut.mutate()} disabled={backfillMut.isPending}>
                    <RefreshCcw className={cn("h-3 w-3 mr-1", backfillMut.isPending && "animate-spin")} />
                    {backfillMut.isPending ? "Backfilling…" : "Re-snapshot brand orders (admin)"}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Profit KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard title="Gross Profit" value={r.profit.gross} hint="Net payable − COGS" tone="emerald" icon={TrendingUp} />
            <KpiCard title="Contribution Profit" value={r.profit.contribution} hint="After courier, returns & ads" tone="blue" icon={Truck} />
            <KpiCard title="Net Profit" value={r.profit.net} hint="After all expenses" tone={r.profit.net >= 0 ? "emerald" : "red"} bold icon={r.profit.net >= 0 ? TrendingUp : TrendingDown} />
            <KpiCard title="Profit / Delivered Unit" value={r.profit.per_delivered_unit} hint={`${r.quantities.delivered} delivered`} tone="amber" icon={PackageCheck} />
          </div>

          {/* Stock + Rates */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SmallStat label="Current Stock" value={r.stock.current} icon={Package} />
            <SmallStat label="Delivery Success" value={`${r.profit.delivery_success_rate}%`} icon={PackageCheck} />
            <SmallStat label="Return Rate" value={`${r.profit.return_rate}%`} icon={RotateCcw} />
            <SmallStat label="Exchange Rate" value={`${r.profit.exchange_rate}%`} icon={Repeat2} />
          </div>

          {/* Funnel + Cost pie */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><PackageCheck className="h-4 w-4 text-blue-600" /> Quantity Funnel</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={funnelData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="stage" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.3 }} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)" }} />
                    <Bar dataKey="qty" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-600" /> Cost Breakdown</CardTitle></CardHeader>
              <CardContent>
                {costPie.length === 0 ? (
                  <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">No costs in range</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={costPie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={95} paddingAngle={2} label={(e) => fmtBdt(e.value as number)}>
                        {costPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmtBdt(v)} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)" }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* P&L Statement */}
          <PnLStatement r={r} />

          {/* Tabs: Sources / Items / Returns / Exchanges / Marketing */}
          <Card className="border-border/60 shadow-sm">
            <CardContent className="pt-4">
              <Tabs defaultValue="sources">
                <TabsList className="bg-muted/60 h-auto p-1 flex-wrap">
                  <TabsTrigger value="sources" className="gap-1.5"><Truck className="h-3.5 w-3.5" /> Sources <span className="ml-1 text-xs opacity-70">{r.sources.length}</span></TabsTrigger>
                  <TabsTrigger value="items" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Items <span className="ml-1 text-xs opacity-70">{r.items.length}</span></TabsTrigger>
                  <TabsTrigger value="returns" className="gap-1.5"><RotateCcw className="h-3.5 w-3.5" /> Returns <span className="ml-1 text-xs opacity-70">{r.returns.length}</span></TabsTrigger>
                  <TabsTrigger value="exchanges" className="gap-1.5"><Repeat2 className="h-3.5 w-3.5" /> Exchanges <span className="ml-1 text-xs opacity-70">{r.exchanges.length}</span></TabsTrigger>
                  <TabsTrigger value="marketing" className="gap-1.5"><Megaphone className="h-3.5 w-3.5" /> Marketing <span className="ml-1 text-xs opacity-70">{r.marketing.length}</span></TabsTrigger>
                </TabsList>

                <TabsContent value="sources" className="mt-3">
                  <div className="flex justify-end mb-2">
                    <Button size="sm" variant="outline" onClick={exportSourcesCsv}><Download className="h-4 w-4 mr-1" /> CSV</Button>
                  </div>
                  <div className="rounded border overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Source</TableHead><TableHead className="text-right">Created</TableHead><TableHead className="text-right">Confirmed</TableHead>
                        <TableHead className="text-right">Delivered</TableHead><TableHead className="text-right">Returned</TableHead>
                        <TableHead className="text-right">Delivery %</TableHead><TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Net Payable</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {r.sources.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No source data</TableCell></TableRow>}
                        {r.sources.map((s) => (
                          <TableRow key={s.source}>
                            <TableCell><Badge variant="outline">{s.source}</Badge></TableCell>
                            <TableCell className="text-right">{s.created}</TableCell>
                            <TableCell className="text-right">{s.confirmed}</TableCell>
                            <TableCell className="text-right">{s.delivered}</TableCell>
                            <TableCell className="text-right">{s.returned}</TableCell>
                            <TableCell className="text-right">{s.delivery_rate}%</TableCell>
                            <TableCell className="text-right">{fmtBdt(s.revenue)}</TableCell>
                            <TableCell className="text-right font-medium">{fmtBdt(s.net_payable)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="items" className="mt-3">
                  <div className="flex justify-end mb-2">
                    <Button size="sm" variant="outline" onClick={exportItemsCsv}><Download className="h-4 w-4 mr-1" /> CSV</Button>
                  </div>
                  <div className="rounded border overflow-x-auto max-h-[500px]">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Date</TableHead><TableHead>Order</TableHead><TableHead>Status</TableHead><TableHead>Source</TableHead>
                        <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Line</TableHead><TableHead className="text-right">Unit Cost</TableHead>
                        <TableHead className="text-right">Courier</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {r.items.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">No items</TableCell></TableRow>}
                        {r.items.map((i) => (
                          <TableRow key={i.item_id}>
                            <TableCell className="whitespace-nowrap">{i.date}</TableCell>
                            <TableCell className="font-mono text-xs">{i.order_id.slice(0, 8)}</TableCell>
                            <TableCell><Badge variant="outline" className="capitalize">{i.status}</Badge></TableCell>
                            <TableCell className="text-xs">{i.source}</TableCell>
                            <TableCell className="text-right">{i.qty}</TableCell>
                            <TableCell className="text-right">{fmtBdt(i.unit_price)}</TableCell>
                            <TableCell className="text-right">{fmtBdt(i.line_total)}</TableCell>
                            <TableCell className="text-right">{i.unit_cost == null ? <span className="text-muted-foreground italic">N/A</span> : fmtBdt(i.unit_cost)}</TableCell>
                            <TableCell className="text-right">{fmtBdt(i.courier_cost ?? 0)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="returns" className="mt-3">
                  <div className="flex justify-end mb-2">
                    <Button size="sm" variant="outline" onClick={() => setReturnOpen(true)} disabled={!brandId || !productId}>
                      <Plus className="h-3 w-3 mr-1" /> New Return Case
                    </Button>
                  </div>
                  <div className="rounded border overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Date</TableHead><TableHead>Order</TableHead><TableHead>Type</TableHead><TableHead>Condition</TableHead>
                        <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Refund</TableHead>
                        <TableHead className="text-right">Cost Loss</TableHead><TableHead>Status</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {r.returns.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No return cases <RotateCcw className="inline h-3 w-3 ml-1" /></TableCell></TableRow>}
                        {r.returns.map((x) => (
                          <TableRow key={x.id}>
                            <TableCell className="whitespace-nowrap text-xs">{x.created_at?.slice(0, 10)}</TableCell>
                            <TableCell className="font-mono text-xs">{x.order_id.slice(0, 8)}</TableCell>
                            <TableCell><Badge variant="outline">{x.return_type}</Badge></TableCell>
                            <TableCell className="capitalize">{x.condition}</TableCell>
                            <TableCell className="text-right">{x.qty}</TableCell>
                            <TableCell className="text-right">{fmtBdt(x.refund)}</TableCell>
                            <TableCell className="text-right text-red-600">{fmtBdt(x.cost_loss)}</TableCell>
                            <TableCell><Badge>{x.status}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="exchanges" className="mt-3">
                  <div className="flex justify-end mb-2">
                    <Button size="sm" variant="outline" onClick={() => setExchangeOpen(true)} disabled={!brandId || !productId}>
                      <Plus className="h-3 w-3 mr-1" /> New Exchange Case
                    </Button>
                  </div>
                  <div className="rounded border overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Date</TableHead><TableHead>Original Order</TableHead><TableHead>Type</TableHead><TableHead>Old Condition</TableHead>
                        <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Net Loss</TableHead><TableHead>Status</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {r.exchanges.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No exchange cases</TableCell></TableRow>}
                        {r.exchanges.map((x) => (
                          <TableRow key={x.id}>
                            <TableCell className="whitespace-nowrap text-xs">{x.created_at?.slice(0, 10)}</TableCell>
                            <TableCell className="font-mono text-xs">{x.original_order_id.slice(0, 8)}</TableCell>
                            <TableCell><Badge variant="outline">{x.exchange_type}</Badge></TableCell>
                            <TableCell className="capitalize">{x.old_condition}</TableCell>
                            <TableCell className="text-right">{x.qty}</TableCell>
                            <TableCell className="text-right text-red-600">{fmtBdt(x.loss)}</TableCell>
                            <TableCell><Badge>{x.status}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="marketing" className="mt-3">
                  <MarketingTab marketing={r.marketing} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}
      {brandId && productId && r && (
        <>
          <ReturnCaseDialog open={returnOpen} onClose={() => setReturnOpen(false)} brandId={brandId} productId={productId} productName={r.product.name} />
          <ExchangeCaseDialog open={exchangeOpen} onClose={() => setExchangeOpen(false)} brandId={brandId} productId={productId} productName={r.product.name} />
        </>
      )}
    </div>
  );
}

function KpiCard({ title, value, hint, tone, bold, icon: Icon }: { title: string; value: number; hint?: string; tone: "emerald" | "blue" | "red" | "amber"; bold?: boolean; icon?: typeof Package }) {
  const toneMap = {
    emerald: { text: "text-emerald-600", bg: "bg-emerald-500/10", ring: "from-emerald-500/10 to-transparent" },
    blue:    { text: "text-blue-600",    bg: "bg-blue-500/10",    ring: "from-blue-500/10 to-transparent" },
    red:     { text: "text-red-600",     bg: "bg-red-500/10",     ring: "from-red-500/10 to-transparent" },
    amber:   { text: "text-amber-600",   bg: "bg-amber-500/10",   ring: "from-amber-500/10 to-transparent" },
  }[tone];
  return (
    <Card className="relative overflow-hidden border-border/60 shadow-sm hover:shadow-md transition-shadow">
      <div className={cn("absolute inset-0 bg-gradient-to-br pointer-events-none opacity-60", toneMap.ring)} />
      <CardContent className="pt-4 relative">
        <div className="flex items-start justify-between">
          <div className="text-xs text-muted-foreground font-medium">{title}</div>
          {Icon && (
            <div className={cn("h-7 w-7 rounded-md flex items-center justify-center", toneMap.bg)}>
              <Icon className={cn("h-3.5 w-3.5", toneMap.text)} />
            </div>
          )}
        </div>
        <div className={cn("text-2xl mt-1.5 tabular-nums tracking-tight", toneMap.text, bold ? "font-bold" : "font-semibold")}>{fmtBdt(value)}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function SmallStat({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Package }) {
  return (
    <Card className="border-border/60 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="pt-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Icon className="h-4.5 w-4.5" /></div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, v, bold }: { label: string; v: number; bold?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between py-1 border-b last:border-0", bold && "font-semibold pt-2")}>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", v < 0 && "text-red-600")}>{fmtBdt(v)}</span>
    </div>
  );
}

function PnLStatement({ r }: { r: Report }) {
  const rev = r.revenue;
  const c = r.cost;
  const totalRevenue = rev.gross + rev.delivery_collected;
  const totalCosts = c.cogs + c.courier_out + c.courier_return + c.packaging + c.return_loss + c.exchange_loss + c.damage_loss + c.meta_ads + c.marketing_content + rev.discount + rev.refund;
  const netMargin = totalRevenue > 0 ? (r.profit.net / totalRevenue) * 100 : 0;

  const expenseGroups: Array<{ key: string; label: string; color: string; items: Array<{ label: string; v: number }> }> = [
    {
      key: "product", label: "Product Costs", color: "bg-blue-500",
      items: [
        { label: "COGS (unit cost × delivered)", v: c.cogs },
        { label: "Packaging", v: c.packaging },
      ],
    },
    {
      key: "logistics", label: "Logistics", color: "bg-amber-500",
      items: [
        { label: "Courier — outbound", v: c.courier_out },
        { label: "Courier — return", v: c.courier_return },
      ],
    },
    {
      key: "losses", label: "Losses & Refunds", color: "bg-red-500",
      items: [
        { label: "Refund (delivered)", v: rev.refund },
        { label: "Return loss", v: c.return_loss },
        { label: "Exchange loss", v: c.exchange_loss },
        { label: "Damage loss", v: c.damage_loss },
      ],
    },
    {
      key: "marketing", label: "Marketing", color: "bg-violet-500",
      items: [
        { label: "Meta ads (allocated)", v: c.meta_ads },
        { label: "Content / other", v: c.marketing_content },
      ],
    },
    {
      key: "discounts", label: "Discounts", color: "bg-pink-500",
      items: [
        { label: "Discount given", v: rev.discount },
      ],
    },
  ];

  const groupsWithTotals = expenseGroups
    .map((g) => ({ ...g, total: g.items.reduce((s, i) => s + (i.v || 0), 0) }))
    .filter((g) => g.total > 0 || g.items.some((i) => i.v > 0));
  const maxGroup = Math.max(1, ...groupsWithTotals.map((g) => g.total));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
      {/* Revenue card */}
      <Card className="lg:col-span-2 border-emerald-500/20 overflow-hidden">
        <div className="bg-gradient-to-br from-emerald-500/10 to-transparent px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
                <Wallet className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total Revenue</div>
                <div className="text-xl font-bold text-emerald-600 tabular-nums">{fmtBdt(totalRevenue)}</div>
              </div>
            </div>
            <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 border-emerald-500/20">INCOME</Badge>
          </div>
        </div>
        <CardContent className="pt-3 text-sm space-y-0">
          <Row label="Gross product revenue" v={rev.gross} />
          <Row label="Delivery collected" v={rev.delivery_collected} />
          <Separator className="my-2" />
          <Row label="Net payable (after discount & refund)" v={rev.net_payable} bold />
        </CardContent>
      </Card>

      {/* Expenses grouped */}
      <Card className="lg:col-span-3 border-red-500/20 overflow-hidden">
        <div className="bg-gradient-to-br from-red-500/10 to-transparent px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-red-500/15 text-red-600 flex items-center justify-center">
                <Receipt className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total Expenses</div>
                <div className="text-xl font-bold text-red-600 tabular-nums">{fmtBdt(totalCosts)}</div>
              </div>
            </div>
            <Badge className="bg-red-500/15 text-red-700 hover:bg-red-500/15 border-red-500/20">EXPENSE</Badge>
          </div>
        </div>
        <CardContent className="pt-3 space-y-3">
          {groupsWithTotals.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">No expenses in range</div>
          )}
          {groupsWithTotals.map((g) => {
            const pctOfTotal = totalCosts > 0 ? (g.total / totalCosts) * 100 : 0;
            const barPct = (g.total / maxGroup) * 100;
            return (
              <div key={g.key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("h-2 w-2 rounded-full", g.color)} />
                    <span className="text-sm font-medium">{g.label}</span>
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{pctOfTotal.toFixed(1)}%</span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{fmtBdt(g.total)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", g.color)} style={{ width: `${barPct}%` }} />
                </div>
                <div className="pl-4 space-y-0.5 text-xs">
                  {g.items.filter((i) => i.v > 0).map((i, idx) => (
                    <div key={idx} className="flex items-center justify-between text-muted-foreground py-0.5">
                      <span>{i.label}</span>
                      <span className="tabular-nums">{fmtBdt(i.v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Bottom-line summary */}
      <Card className={cn("lg:col-span-5 overflow-hidden border-2", r.profit.net >= 0 ? "border-emerald-500/30" : "border-red-500/30")}>
        <div className={cn("px-5 py-4 grid grid-cols-2 md:grid-cols-5 gap-4 bg-gradient-to-r", r.profit.net >= 0 ? "from-emerald-500/10 via-background to-blue-500/5" : "from-red-500/10 via-background to-amber-500/5")}>
          <PnLPill label="Revenue" value={fmtBdt(totalRevenue)} tone="emerald" icon={Wallet} />
          <PnLOp op="−" />
          <PnLPill label="Expenses" value={fmtBdt(totalCosts)} tone="red" icon={Receipt} />
          <PnLOp op="=" />
          <PnLPill
            label={r.profit.net >= 0 ? "Net Profit" : "Net Loss"}
            value={fmtBdt(Math.abs(r.profit.net))}
            sub={`Margin ${netMargin.toFixed(1)}%`}
            tone={r.profit.net >= 0 ? "emerald" : "red"}
            icon={r.profit.net >= 0 ? TrendingUp : TrendingDown}
            big
          />
        </div>
      </Card>
    </div>
  );
}

function PnLOp({ op }: { op: string }) {
  return <div className="hidden md:flex items-center justify-center text-2xl font-light text-muted-foreground">{op}</div>;
}

function PnLPill({ label, value, sub, tone, icon: Icon, big }: { label: string; value: string; sub?: string; tone: "emerald" | "red"; icon: typeof Package; big?: boolean }) {
  const text = tone === "emerald" ? "text-emerald-600" : "text-red-600";
  const bg = tone === "emerald" ? "bg-emerald-500/15" : "bg-red-500/15";
  return (
    <div className="flex items-center gap-3">
      <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", bg, text)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">{label}</div>
        <div className={cn("tabular-nums tracking-tight", big ? "text-2xl font-bold" : "text-lg font-semibold", text)}>{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function MarketingTab({ marketing }: { marketing: Report["marketing"] }) {
  const total = marketing.reduce((s, m) => s + (Number(m.amount) || 0), 0);
  const allocTotal = marketing.filter((m) => m.kind === "allocation").reduce((s, m) => s + (Number(m.amount) || 0), 0);
  const manualTotal = marketing.filter((m) => m.kind === "manual").reduce((s, m) => s + (Number(m.amount) || 0), 0);
  const manualByType = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of marketing) {
      if (x.kind !== "manual") continue;
      const t = x.expense_type || "other";
      m.set(t, (m.get(t) || 0) + (Number(x.amount) || 0));
    }
    return Array.from(m.entries()).map(([type, total]) => ({ type, total })).sort((a, b) => b.total - a.total);
  }, [marketing]);
  const byType = useMemo(() => {
    const m = new Map<string, { total: number; count: number }>();
    for (const x of marketing) {
      const t = x.expense_type || "other";
      const cur = m.get(t) || { total: 0, count: 0 };
      cur.total += Number(x.amount) || 0;
      cur.count += 1;
      m.set(t, cur);
    }
    return Array.from(m.entries()).map(([type, v]) => ({ type, ...v })).sort((a, b) => b.total - a.total);
  }, [marketing]);

  const sorted = useMemo(
    () => [...marketing].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")),
    [marketing],
  );

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-muted/20 p-3 grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Campaign Allocations</div>
          <div className="font-semibold tabular-nums">{fmtBdt(allocTotal)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Manual Expenses</div>
          <div className="font-semibold tabular-nums">{fmtBdt(manualTotal)}</div>
          {manualByType.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {manualByType.map((g) => (
                <Badge key={g.type} variant="outline" className="font-normal text-[10px] gap-1">
                  <span className="capitalize">{g.type}</span>
                  <span className="tabular-nums">{fmtBdt(g.total)}</span>
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Marketing</div>
          <div className="font-bold tabular-nums text-violet-600 dark:text-violet-400">{fmtBdt(total)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="font-normal">Total: <span className="font-semibold ml-1 tabular-nums">{fmtBdt(total)}</span></Badge>
          {byType.map((g) => (
            <Badge key={g.type} variant="outline" className="font-normal gap-1.5">
              <span className="capitalize">{g.type}</span>
              <span className="text-muted-foreground">·</span>
              <span className="tabular-nums">{fmtBdt(g.total)}</span>
              <span className="text-[10px] text-muted-foreground">({g.count})</span>
            </Badge>
          ))}
        </div>
        {/* Allocate Expense removed — expense allocation table dropped in Phase 1. */}
      </div>

      {byType.length > 0 && (
        <div className="rounded-lg border p-3 space-y-2 bg-muted/20">
          {byType.map((g) => {
            const pct = total > 0 ? (g.total / total) * 100 : 0;
            return (
              <div key={g.type} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="capitalize font-medium flex items-center gap-1.5"><Megaphone className="h-3 w-3 text-violet-500" /> {g.type}</span>
                  <span className="tabular-nums text-muted-foreground">{fmtBdt(g.total)} <span className="ml-1 text-[10px]">({pct.toFixed(0)}%)</span></span>
                </div>
                <Progress value={pct} className="h-1.5" />
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded border overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-28">Date</TableHead>
            <TableHead className="w-24">Source</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Note</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {sorted.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No marketing expenses <Megaphone className="inline h-3 w-3 ml-1" /></TableCell></TableRow>}
            {sorted.map((m, i) => (
              <TableRow key={i}>
                <TableCell className="whitespace-nowrap text-xs tabular-nums">{(m.allocation_date ?? m.created_at)?.slice(0, 10)}</TableCell>
                <TableCell>
                  <Badge variant={m.kind === "manual" ? "secondary" : "outline"} className="text-[10px] capitalize">
                    {m.kind === "manual" ? "Manual" : "Allocation"}
                  </Badge>
                </TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{m.expense_type}</Badge></TableCell>
                <TableCell className="text-right tabular-nums font-medium">{fmtBdt(m.amount)}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-md truncate">{m.note ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}