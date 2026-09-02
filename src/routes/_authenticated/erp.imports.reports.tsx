import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listPurchaseOrders, getImportCostAnalysis } from "@/lib/erp/imports/imports.functions";
import { fmtBdt, PO_STATUS_LABEL, type ImpPoStatus } from "@/lib/erp/imports/types";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/erp/imports/reports")({
  head: () => ({ meta: [{ title: "Imports Reports — ERP" }] }),
  component: ImportsReports,
});

function ImportsReports() {
  const { brandId, effectiveBrand, picker } = useBrandPicker();
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const fn = useServerFn(listPurchaseOrders);
  const { data: pos = [] } = useQuery({
    queryKey: ["imp-rep", brandId, from, to],
    enabled: !!brandId,
    queryFn: () => fn({ data: { brandId: brandId!, from, to } }),
  });

  const totals = useMemo(() => {
    const list = pos as any[];
    return {
      count: list.length,
      spend: list.reduce((s, p) => s + Number(p.grand_total_bdt || 0), 0),
      paid: list.reduce((s, p) => s + Number(p.paid_bdt || 0), 0),
      due: list.reduce((s, p) => s + Number(p.due_bdt || 0), 0),
      shipping: list.reduce((s, p) => s + Number(p.shipping_total_bdt || 0), 0),
      product: list.reduce((s, p) => s + Number(p.product_subtotal_bdt || 0), 0),
    };
  }, [pos]);

  const bySupplier = useMemo(() => {
    const m: Record<string, { name: string; spend: number; count: number; due: number }> = {};
    (pos as any[]).forEach((p) => {
      const key = p.supplier?.id ?? "unknown";
      if (!m[key]) m[key] = { name: p.supplier?.name ?? "Unknown", spend: 0, count: 0, due: 0 };
      m[key].spend += Number(p.grand_total_bdt || 0);
      m[key].due += Number(p.due_bdt || 0);
      m[key].count += 1;
    });
    return Object.values(m).sort((a, b) => b.spend - a.spend);
  }, [pos]);

  const byStatus = useMemo(() => {
    const m: Record<string, number> = {};
    (pos as any[]).forEach((p) => { m[p.status] = (m[p.status] || 0) + Number(p.grand_total_bdt || 0); });
    return Object.entries(m).map(([k, v]) => ({ status: k as ImpPoStatus, total: v }));
  }, [pos]);

  const exportCsv = () => {
    const rows = [["PO Number", "Date", "Supplier", "Agent", "Status", "Subtotal", "Shipping", "Total", "Paid", "Due"]];
    (pos as any[]).forEach((p) => {
      rows.push([
        p.po_number, p.order_date, p.supplier?.name ?? "", p.agent?.name ?? "",
        p.status, p.product_subtotal_bdt, p.shipping_total_bdt, p.grand_total_bdt, p.paid_bdt, p.due_bdt,
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `imports-${from}-to-${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 space-y-5 print:p-0 print:space-y-3" id="imports-report-print">
      {picker && <div className="flex justify-end -mb-1">{picker}</div>}
      <style>{`@media print { @page { size: A4; margin: 12mm; } .no-print { display:none !important; } body { background: white; } #imports-report-print { color: #000; } .print-title { display:block !important; } }`}</style>
      <div className="hidden print-title print:block">
        <h1 className="text-xl font-bold">{effectiveBrand?.name ?? ""} — Imports Report</h1>
        <div className="text-sm text-muted-foreground">{from} to {to}</div>
      </div>
      <Card className="p-4 no-print">
        <div className="flex flex-wrap items-end gap-3">
          <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print / PDF</Button>
            <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1" />Export CSV</Button>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="overview" className="no-print">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="cost">Cost Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-5 mt-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total POs</div><div className="text-2xl font-bold">{totals.count}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total Spend</div><div className="text-2xl font-bold tabular-nums">{fmtBdt(totals.spend)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Paid</div><div className="text-2xl font-bold text-emerald-600 tabular-nums">{fmtBdt(totals.paid)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Outstanding</div><div className="text-2xl font-bold text-orange-600 tabular-nums">{fmtBdt(totals.due)}</div></Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Spend by Status</h3>
          {byStatus.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No data.</div> : (
            <div className="space-y-2">
              {byStatus.sort((a, b) => b.total - a.total).map((s) => {
                const pct = (s.total / totals.spend) * 100;
                return (
                  <div key={s.status}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span>{PO_STATUS_LABEL[s.status]?.label ?? s.status}</span>
                      <span className="tabular-nums font-medium">{fmtBdt(s.total)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-3">Cost Breakdown</h3>
          <div className="space-y-2 text-sm">
            <Row label="Product" value={totals.product} />
            <Row label="Shipping" value={totals.shipping} />
            <Row label="Other" value={totals.spend - totals.product - totals.shipping} />
            <div className="border-t border-border pt-2 mt-2 flex justify-between font-bold"><span>Total</span><span className="tabular-nums">{fmtBdt(totals.spend)}</span></div>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border"><h3 className="font-semibold">Top Suppliers</h3></div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">POs</TableHead>
              <TableHead className="text-right">Total Spend</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bySupplier.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">No data</TableCell></TableRow> :
              bySupplier.map((s) => (
                <TableRow key={s.name}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmtBdt(s.spend)}</TableCell>
                  <TableCell className="text-right tabular-nums text-orange-600">{fmtBdt(s.due)}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
        </TabsContent>

        <TabsContent value="cost" className="mt-4">
          <CostAnalysisTab brandId={brandId} from={from} to={to} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="tabular-nums font-medium">{fmtBdt(value)}</span></div>;
}

function CostAnalysisTab({ brandId, from, to }: { brandId?: string; from: string; to: string }) {
  const fn = useServerFn(getImportCostAnalysis);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["imp-cost-analysis", brandId, from, to],
    enabled: !!brandId,
    queryFn: () => fn({ data: { brandId: brandId!, dateFrom: from, dateTo: to } }),
  });

  const list = rows as any[];

  const summary = useMemo(() => {
    const withSell = list.filter((r) => r.avg_sell_price > 0);
    const totalSpend = list.reduce((s, r) => s + r.total_landed_cost_bdt, 0);
    const totalUnits = list.reduce((s, r) => s + r.total_units, 0);
    const avgLanded = totalUnits > 0 ? totalSpend / totalUnits : 0;
    const avgMargin = withSell.length > 0
      ? withSell.reduce((s, r) => s + r.margin_pct, 0) / withSell.length : 0;
    const sorted = [...withSell].sort((a, b) => b.margin_pct - a.margin_pct);
    return {
      totalSpend,
      avgLanded,
      avgMargin,
      best: sorted[0],
      worst: sorted[sorted.length - 1],
    };
  }, [list]);

  const sortedTable = useMemo(
    () => [...list].sort((a, b) => a.margin_pct - b.margin_pct),
    [list],
  );

  const trend = useMemo(
    () => [...list]
      .filter((r) => r.landed_cost_per_unit_bdt > 0)
      .sort((a, b) => (a.order_date || "").localeCompare(b.order_date || ""))
      .map((r) => ({ date: r.order_date, cost: r.landed_cost_per_unit_bdt, po: r.po_number })),
    [list],
  );

  const exportXlsx = () => {
    const rows2 = [["PO #", "Date", "Supplier", "Units", "Cost CNY", "FX", "Cost BDT", "Freight", "Customs", "Other", "Total Landed", "Landed/Unit", "Sell Price", "Margin %"]];
    sortedTable.forEach((r) => rows2.push([
      r.po_number, r.order_date, r.supplier_name, r.total_units, r.product_cost_cny, r.fx_rate_cny_bdt,
      r.product_cost_bdt, r.freight_cost_bdt, r.customs_duty_bdt, r.other_charges_bdt,
      r.total_landed_cost_bdt, r.landed_cost_per_unit_bdt, r.avg_sell_price, r.margin_pct,
    ]));
    const csv = rows2.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `cost-analysis-${from}-to-${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const marginColor = (m: number) =>
    m >= 40 ? "text-emerald-600" : m >= 20 ? "text-amber-600" : "text-red-600";

  if (isLoading) return <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>;
  if (list.length === 0) return <Card className="p-8 text-center text-sm text-muted-foreground">No PO data in this range.</Card>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total Import Spend</div><div className="text-xl font-bold tabular-nums">{fmtBdt(summary.totalSpend)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Avg Landed/Unit</div><div className="text-xl font-bold tabular-nums">{fmtBdt(summary.avgLanded)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Avg Margin</div><div className={`text-xl font-bold tabular-nums ${marginColor(summary.avgMargin)}`}>{summary.avgMargin.toFixed(1)}%</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Best Margin</div><div className="text-sm font-semibold truncate">{summary.best?.po_number ?? "—"}</div><div className="text-xs text-emerald-600">{summary.best ? `${summary.best.margin_pct.toFixed(1)}%` : ""}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Worst Margin</div><div className="text-sm font-semibold truncate">{summary.worst?.po_number ?? "—"}</div><div className="text-xs text-red-600">{summary.worst ? `${summary.worst.margin_pct.toFixed(1)}%` : ""}</div></Card>
      </div>

      {trend.length > 1 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3 text-sm">Landed Cost Per Unit Trend</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Line type="monotone" dataKey="cost" stroke="var(--primary)" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold">PO Cost Breakdown <span className="text-xs text-muted-foreground font-normal">(sorted by worst margin)</span></h3>
          <Button size="sm" variant="outline" onClick={exportXlsx}><Download className="h-3.5 w-3.5 mr-1" />Export</Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>PO #</TableHead><TableHead>Date</TableHead>
              <TableHead className="text-right">Units</TableHead>
              <TableHead className="text-right">Cost (CNY)</TableHead>
              <TableHead className="text-right">FX</TableHead>
              <TableHead className="text-right">Cost (BDT)</TableHead>
              <TableHead className="text-right">Freight</TableHead>
              <TableHead className="text-right">Customs</TableHead>
              <TableHead className="text-right">Landed/Unit</TableHead>
              <TableHead className="text-right">Sell Price</TableHead>
              <TableHead className="text-right">Margin %</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {sortedTable.map((r) => (
                <TableRow key={r.po_id}>
                  <TableCell className="font-medium">{r.po_number}</TableCell>
                  <TableCell className="text-xs">{r.order_date}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.total_units}</TableCell>
                  <TableCell className="text-right tabular-nums">¥{r.product_cost_cny.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.fx_rate_cny_bdt || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBdt(r.product_cost_bdt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBdt(r.freight_cost_bdt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBdt(r.customs_duty_bdt)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmtBdt(r.landed_cost_per_unit_bdt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.avg_sell_price > 0 ? fmtBdt(r.avg_sell_price) : "—"}</TableCell>
                  <TableCell className={`text-right tabular-nums font-semibold ${marginColor(r.margin_pct)}`}>{r.avg_sell_price > 0 ? `${r.margin_pct.toFixed(1)}%` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}