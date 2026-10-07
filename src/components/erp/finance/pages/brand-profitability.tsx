import { dhakaToday } from "@/lib/erp/finance";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Layers3, TrendingDown, TrendingUp, AlertCircle, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtBdt } from "@/lib/erp/finance";
import { cn } from "@/lib/utils";

type Row = {
  product_id: string; name: string; sku: string | null; image: string | null; current_stock: number;
  confirmed_qty: number; delivered_qty: number; returned_qty: number;
  revenue: number; cogs: number; courier_cost: number;
  return_loss: number; exchange_loss: number; meta_ads: number; marketing_content: number;
  gross_profit: number; net_profit: number; profit_per_unit: number; roi_percent: number;
  brand_id?: string; brand_name?: string;
};

function today() { return dhakaToday(); }
function daysAgo(d: number) { const x = new Date(); x.setDate(x.getDate() - d); return x.toISOString().slice(0, 10); }

function csvEscape(v: unknown) { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function downloadCsv(name: string, rows: (string | number | null)[][]) {
  const blob = new Blob([rows.map((r) => r.map(csvEscape).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
}

type SortKey = "net_profit" | "revenue" | "delivered_qty" | "roi_percent" | "return_loss";

export function BrandProfitabilityPage() {
  const { activeBrand, brands, brandIds, isAllBrands } = useBrand();
  const [dateFrom, setDateFrom] = useState(daysAgo(30));
  const [dateTo, setDateTo] = useState(today());
  const [dateBasis, setDateBasis] = useState<"created" | "confirmed" | "delivered">("delivered");
  const [sortKey, setSortKey] = useState<SortKey>("net_profit");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["brand-profitability", brandIds.join(","), dateFrom, dateTo, dateBasis],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      const brandMap = new Map(brands.map((b) => [b.id, b.name]));
      const results = await Promise.all(brandIds.map(async (bid) => {
        const { data, error } = await supabase.rpc("get_brand_profitability_rollup" as any, {
          p_brand_id: bid, p_date_from: dateFrom, p_date_to: dateTo, p_date_basis: dateBasis,
        });
        if (error) throw error;
        return ((data ?? []) as unknown as Row[]).map((r) => ({ ...r, brand_id: bid, brand_name: brandMap.get(bid) ?? "" }));
      }));
      return results.flat();
    },
  });

  const rows = q.data ?? [];
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    let r = s ? rows.filter((x) => x.name?.toLowerCase().includes(s) || x.sku?.toLowerCase().includes(s)) : rows;
    r = [...r].sort((a, b) => {
      const av = Number(a[sortKey] ?? 0); const bv = Number(b[sortKey] ?? 0);
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return r;
  }, [rows, search, sortKey, sortDir]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    revenue: acc.revenue + Number(r.revenue || 0),
    cogs: acc.cogs + Number(r.cogs || 0),
    courier: acc.courier + Number(r.courier_cost || 0),
    return_loss: acc.return_loss + Number(r.return_loss || 0),
    exchange_loss: acc.exchange_loss + Number(r.exchange_loss || 0),
    ads: acc.ads + Number(r.meta_ads || 0) + Number(r.marketing_content || 0),
    net: acc.net + Number(r.net_profit || 0),
    delivered: acc.delivered + Number(r.delivered_qty || 0),
  }), { revenue: 0, cogs: 0, courier: 0, return_loss: 0, exchange_loss: 0, ads: 0, net: 0, delivered: 0 }), [rows]);

  const topWinners = useMemo(() => [...rows].sort((a, b) => Number(b.net_profit) - Number(a.net_profit)).slice(0, 5), [rows]);
  const topLosers = useMemo(() => [...rows].filter((r) => Number(r.net_profit) < 0).sort((a, b) => Number(a.net_profit) - Number(b.net_profit)).slice(0, 5), [rows]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(k); setSortDir("desc"); }
  }

  function exportCsv() {
    downloadCsv(`brand-pl-${dateFrom}_${dateTo}.csv`, [
      ["Product", "SKU", "Stock", "Confirmed", "Delivered", "Returned", "Revenue", "COGS", "Courier", "Return Loss", "Exchange Loss", "Ads/Content", "Gross Profit", "Net Profit", "Profit/Unit", "ROI %"],
      ...rows.map((r) => [r.name, r.sku, r.current_stock, r.confirmed_qty, r.delivered_qty, r.returned_qty, r.revenue, r.cogs, r.courier_cost, r.return_loss, r.exchange_loss, Number(r.meta_ads) + Number(r.marketing_content), r.gross_profit, r.net_profit, r.profit_per_unit, r.roi_percent]),
    ]);
  }

  if (brandIds.length === 0) return <div className="p-6 text-sm text-muted-foreground">Loading brands…</div>;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Layers3 className="h-6 w-6" /> Brand Profitability</h1>
          <p className="text-sm text-muted-foreground">All-product P&L rollup for {isAllBrands ? `all brands (${brands.length})` : activeBrand?.name}.</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-3"><Label className="text-xs">From</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
            <div className="md:col-span-3"><Label className="text-xs">To</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
            <div className="md:col-span-3">
              <Label className="text-xs">Date basis</Label>
              <Select value={dateBasis} onValueChange={(v: any) => setDateBasis(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="created">Order created</SelectItem>
                  <SelectItem value="confirmed">Confirmed at</SelectItem>
                  <SelectItem value="delivered">Delivered at</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-3 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setDateFrom(daysAgo(7)); setDateTo(today()); }}>7d</Button>
              <Button variant="outline" className="flex-1" onClick={() => { setDateFrom(daysAgo(30)); setDateTo(today()); }}>30d</Button>
              <Button variant="outline" className="flex-1" onClick={() => { setDateFrom(daysAgo(90)); setDateTo(today()); }}>90d</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {q.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {q.error && <div className="text-sm text-destructive">{(q.error as Error).message}</div>}

      {!q.isLoading && rows.length === 0 && (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No product activity in this range.</CardContent></Card>
      )}

      {rows.length > 0 && (
        <>
          {/* KPI Totals */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi title="Revenue (delivered)" value={totals.revenue} tone="blue" />
            <Kpi title="Total COGS + Courier" value={totals.cogs + totals.courier} tone="amber" />
            <Kpi title="Return + Exchange Loss" value={totals.return_loss + totals.exchange_loss} tone="red" />
            <Kpi title="Net Profit" value={totals.net} tone={totals.net >= 0 ? "emerald" : "red"} bold />
          </div>

          {/* Winners / Losers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" /> Top Performers</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableBody>
                    {topWinners.map((r) => (
                      <TableRow key={`${r.brand_id ?? ""}-${r.product_id}`}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{r.delivered_qty} sold</TableCell>
                        <TableCell className="text-right text-emerald-600 font-semibold">{fmtBdt(r.net_profit)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-600" /> Loss-Making Products</CardTitle></CardHeader>
              <CardContent className="p-0">
                {topLosers.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground text-center">No loss-making products 🎉</div>
                ) : (
                  <Table>
                    <TableBody>
                      {topLosers.map((r) => (
                        <TableRow key={`${r.brand_id ?? ""}-${r.product_id}`}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">{r.delivered_qty} sold</TableCell>
                          <TableCell className="text-right text-red-600 font-semibold">{fmtBdt(r.net_profit)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* All products table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-base">All Products ({rows.length})</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 w-56" />
                </div>
                <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-3 w-3 mr-1" /> CSV</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    {isAllBrands && <TableHead>Brand</TableHead>}
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right cursor-pointer hover:text-foreground" onClick={() => toggleSort("delivered_qty")}>Delivered{sortKey === "delivered_qty" && (sortDir === "desc" ? " ↓" : " ↑")}</TableHead>
                    <TableHead className="text-right">Returned</TableHead>
                    <TableHead className="text-right cursor-pointer hover:text-foreground" onClick={() => toggleSort("revenue")}>Revenue{sortKey === "revenue" && (sortDir === "desc" ? " ↓" : " ↑")}</TableHead>
                    <TableHead className="text-right">COGS</TableHead>
                    <TableHead className="text-right">Courier</TableHead>
                    <TableHead className="text-right cursor-pointer hover:text-foreground" onClick={() => toggleSort("return_loss")}>Loss{sortKey === "return_loss" && (sortDir === "desc" ? " ↓" : " ↑")}</TableHead>
                    <TableHead className="text-right">Ads</TableHead>
                    <TableHead className="text-right cursor-pointer hover:text-foreground" onClick={() => toggleSort("net_profit")}>Net Profit{sortKey === "net_profit" && (sortDir === "desc" ? " ↓" : " ↑")}</TableHead>
                    <TableHead className="text-right cursor-pointer hover:text-foreground" onClick={() => toggleSort("roi_percent")}>ROI %{sortKey === "roi_percent" && (sortDir === "desc" ? " ↓" : " ↑")}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const net = Number(r.net_profit);
                    return (
                      <TableRow key={`${r.brand_id ?? ""}-${r.product_id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[200px]">
                            {r.image ? <img src={r.image} alt="" className="h-9 w-9 rounded object-cover" /> : <div className="h-9 w-9 rounded bg-muted" />}
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate max-w-[260px]">{r.name}</div>
                              {r.sku && <div className="text-xs text-muted-foreground">{r.sku}</div>}
                            </div>
                          </div>
                        </TableCell>
                        {isAllBrands && <TableCell><Badge variant="outline" className="text-xs">{r.brand_name}</Badge></TableCell>}
                        <TableCell className="text-right text-xs">{r.current_stock ?? 0}</TableCell>
                        <TableCell className="text-right">{r.delivered_qty}</TableCell>
                        <TableCell className="text-right">{r.returned_qty > 0 ? <span className="text-amber-600">{r.returned_qty}</span> : 0}</TableCell>
                        <TableCell className="text-right">{fmtBdt(r.revenue)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{fmtBdt(r.cogs)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{fmtBdt(r.courier_cost)}</TableCell>
                        <TableCell className="text-right text-red-600">{fmtBdt(Number(r.return_loss) + Number(r.exchange_loss))}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{fmtBdt(Number(r.meta_ads) + Number(r.marketing_content))}</TableCell>
                        <TableCell className={cn("text-right font-semibold tabular-nums", net >= 0 ? "text-emerald-600" : "text-red-600")}>{fmtBdt(net)}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={Number(r.roi_percent) >= 0 ? "outline" : "destructive"}>{Number(r.roi_percent).toFixed(1)}%</Badge>
                        </TableCell>
                        <TableCell>
                          <Link to="/erp/finance/product-profitability" className="text-xs text-primary hover:underline">Open →</Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={isAllBrands ? 13 : 12} className="text-center text-muted-foreground py-6">No matches.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> Profit numbers depend on cost snapshots, courier-cost allocation, and ad-product links. Open Product P&L to inspect any product's full breakdown.
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ title, value, tone, bold }: { title: string; value: number; tone: "emerald" | "blue" | "red" | "amber"; bold?: boolean }) {
  const cls = { emerald: "text-emerald-600", blue: "text-blue-600", red: "text-red-600", amber: "text-amber-600" }[tone];
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className={cn("text-2xl mt-1 tabular-nums", cls, bold ? "font-bold" : "font-semibold")}>{fmtBdt(value)}</div>
      </CardContent>
    </Card>
  );
}