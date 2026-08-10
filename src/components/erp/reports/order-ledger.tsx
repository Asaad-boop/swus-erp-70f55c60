import { Fragment, useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FileSpreadsheet, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtBdt } from "@/lib/erp/finance";
import { exportAoaXlsx } from "@/lib/erp/utils/excel";
import { Panel, KpiStrip, EmptyState, type Kpi } from "@/components/erp/reports/report-kit";

type RpcArgs = { _brand_ids: string[]; _from: string; _to: string; _basis: string };

export type LedgerItem = {
  product_name: string; variant_label: string | null; sku: string | null;
  quantity: number; net_revenue: number; unit_cost: number; line_cogs: number; line_profit: number;
};

export type LedgerRow = {
  order_id: string; invoice_no: string | null; day: string; created_at: string; status: string;
  is_delivered: boolean; is_returned: boolean; is_cancelled: boolean;
  customer_name: string; customer_phone: string | null; city: string | null;
  source: string; payment_method: string; courier_name: string; tracking_number: string | null;
  units: number; items: LedgerItem[];
  gross_sales: number; discounts: number; net_revenue: number;
  shipping_fee: number; order_total: number; advance_amount: number;
  cod_expected: number; courier_collected: number; courier_charge: number;
  collection_diff: number; reconciliation_status: string;
  cogs: number; gross_profit: number; net_profit: number; cost_missing_units: number;
  total_count: number;
};

type LedgerSummary = {
  orders: number; delivered_orders: number; returned_orders: number; units: number;
  order_value: number; net_revenue: number; advance_total: number; cod_expected: number;
  courier_collected: number; courier_charge: number; collection_diff: number;
  cogs: number; gross_profit: number; net_profit: number; reconciled_orders: number;
  cost_missing_units: number;
};

const PAGE_SIZE = 100;

const STATUSES = [
  "all", "delivered", "completed", "partial_delivered", "paid", "exchanged",
  "shipped", "in_transit", "returned", "cancelled",
];

export function OrderLedgerPanel({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");
  const [courier, setCourier] = useState("all");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const filters = { _search: term || null, _status: status, _courier: courier };
  const fkey = JSON.stringify({ ...args, ...filters });

  const rowsQ = useQuery({
    queryKey: ["rpt-order-ledger", fkey, page],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_order_ledger", {
        ...args, ...filters, _limit: PAGE_SIZE, _offset: page * PAGE_SIZE,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as LedgerRow[];
    },
  });

  const sumQ = useQuery({
    queryKey: ["rpt-order-ledger-summary", fkey],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_order_ledger_summary", { ...args, ...filters } as never);
      if (error) throw error;
      return data as unknown as LedgerSummary;
    },
  });

  const rows = rowsQ.data ?? [];
  const total = Number(rows[0]?.total_count ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const s = sumQ.data;

  const courierOptions = useMemo(() => {
    const set = new Set<string>(rows.map((r) => r.courier_name).filter(Boolean));
    return ["all", ...Array.from(set).sort()];
  }, [rows]);

  const kpis: Kpi[] = s
    ? [
        { label: "Orders", value: Number(s.orders), kind: "number", hint: `${Number(s.units).toLocaleString()} units` },
        { label: "Order value", value: Number(s.order_value), hint: "invoice total incl. delivery" },
        { label: "Advance received", value: Number(s.advance_total), hint: "bKash / Nagad etc." },
        { label: "COD expected", value: Number(s.cod_expected), hint: "total − advance" },
        {
          label: "Received from courier",
          value: Number(s.courier_collected),
          tone: "good",
          hint: `${Number(s.reconciled_orders).toLocaleString()} orders reconciled — original payout`,
        },
        { label: "Courier charge", value: Number(s.courier_charge), tone: "bad", hint: "actual invoice charge" },
        { label: "Product cost (COGS)", value: Number(s.cogs) },
        {
          label: "Net profit",
          value: Number(s.net_profit),
          tone: Number(s.net_profit) >= 0 ? "good" : "bad",
          hint: "net revenue − COGS − courier",
        },
      ]
    : [];

  const exportOrders = () => {
    exportAoaXlsx(
      [
        ["Date", "Invoice", "Customer", "Phone", "City", "Courier", "Tracking", "Status", "Channel",
          "Units", "Products", "Gross", "Discount", "Net revenue", "Delivery charge", "Order total",
          "Advance", "COD expected", "Received from courier", "Courier charge", "Diff", "Recon",
          "COGS", "Gross profit", "Net profit"],
        ...rows.map((r) => [
          r.day, r.invoice_no ?? "", r.customer_name, r.customer_phone ?? "", r.city ?? "",
          r.courier_name, r.tracking_number ?? "", r.status, r.source,
          Number(r.units),
          (r.items ?? []).map((i) => `${i.product_name}${i.variant_label ? ` (${i.variant_label})` : ""} ×${Number(i.quantity)}`).join(" | "),
          Number(r.gross_sales), Number(r.discounts), Number(r.net_revenue), Number(r.shipping_fee),
          Number(r.order_total), Number(r.advance_amount), Number(r.cod_expected),
          Number(r.courier_collected), Number(r.courier_charge), Number(r.collection_diff),
          r.reconciliation_status, Number(r.cogs), Number(r.gross_profit), Number(r.net_profit),
        ]),
      ],
      "Orders", "all-orders",
    );
  };

  const exportLines = () => {
    exportAoaXlsx(
      [
        ["Date", "Invoice", "Customer", "Courier", "Status", "Product", "Variant", "SKU",
          "Qty", "Net revenue", "Unit cost", "Line COGS", "Line profit", "Received from courier (order)"],
        ...rows.flatMap((r) =>
          (r.items ?? []).map((i) => [
            r.day, r.invoice_no ?? "", r.customer_name, r.courier_name, r.status,
            i.product_name, i.variant_label ?? "", i.sku ?? "",
            Number(i.quantity), Number(i.net_revenue), Number(i.unit_cost),
            Number(i.line_cogs), Number(i.line_profit), Number(r.courier_collected),
          ]),
        ),
      ],
      "Order lines", "all-orders-productwise",
    );
  };

  return (
    <>
      <KpiStrip items={kpis} loading={sumQ.isLoading} />

      <Panel
        title="All orders — line by line"
        subtitle="Product-wise detail with the actual amount received from the courier"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { setTerm(search.trim()); setPage(0); } }}
                onBlur={() => { setTerm(search.trim()); setPage(0); }}
                placeholder="Invoice, phone, product…"
                className="h-8 w-[200px] pl-7 text-xs"
              />
            </div>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((v) => <SelectItem key={v} value={v}>{v === "all" ? "All statuses" : v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={courier} onValueChange={(v) => { setCourier(v); setPage(0); }}>
              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {courierOptions.map((v) => <SelectItem key={v} value={v}>{v === "all" ? "All couriers" : v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportOrders}>
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />Orders
            </Button>
            <Button variant="outline" size="sm" onClick={exportLines}>
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />Product-wise
            </Button>
          </div>
        }
      >
        {rowsQ.isLoading ? (
          <Skeleton className="h-[360px] rounded-lg" />
        ) : rows.length === 0 ? (
          <EmptyState text="No orders match this range and filter." />
        ) : (
          <>
            <div className="max-h-[620px] overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Courier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Order total</TableHead>
                    <TableHead className="text-right">Advance</TableHead>
                    <TableHead className="text-right">COD expected</TableHead>
                    <TableHead className="text-right">Received (courier)</TableHead>
                    <TableHead className="text-right">Courier charge</TableHead>
                    <TableHead className="text-right">COGS</TableHead>
                    <TableHead className="text-right">Net profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const isOpen = !!open[r.order_id];
                    const collected = Number(r.courier_collected);
                    return (
                      <Fragment key={r.order_id}>
                        <TableRow className="cursor-pointer" onClick={() => setOpen((o) => ({ ...o, [r.order_id]: !isOpen }))}>
                          <TableCell className="w-8 text-muted-foreground">
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{r.day}</TableCell>
                          <TableCell className="font-medium">{r.invoice_no ?? "—"}</TableCell>
                          <TableCell className="max-w-[170px] truncate">
                            {r.customer_name}
                            <span className="block text-[11px] text-muted-foreground">{r.customer_phone ?? ""}</span>
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.courier_name}
                            {r.tracking_number && <span className="block text-[11px] text-muted-foreground">{r.tracking_number}</span>}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] font-normal">{r.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{Number(r.units)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtBdt(r.order_total)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{fmtBdt(r.advance_amount)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{fmtBdt(r.cod_expected)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {collected > 0 ? (
                              <span className="text-emerald-600 dark:text-emerald-400">{fmtBdt(collected)}</span>
                            ) : (
                              <span className="text-muted-foreground">not reconciled</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-rose-600 dark:text-rose-400">{fmtBdt(r.courier_charge)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{fmtBdt(r.cogs)}</TableCell>
                          <TableCell className={`text-right tabular-nums font-semibold ${Number(r.net_profit) < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>
                            {fmtBdt(r.net_profit)}
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow className="bg-muted/20 hover:bg-muted/20">
                            <TableCell />
                            <TableCell colSpan={13} className="py-2">
                              <div className="rounded-md border bg-background">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="text-xs">Product</TableHead>
                                      <TableHead className="text-xs">Variant</TableHead>
                                      <TableHead className="text-xs">SKU</TableHead>
                                      <TableHead className="text-right text-xs">Qty</TableHead>
                                      <TableHead className="text-right text-xs">Net revenue</TableHead>
                                      <TableHead className="text-right text-xs">Unit cost</TableHead>
                                      <TableHead className="text-right text-xs">Line COGS</TableHead>
                                      <TableHead className="text-right text-xs">Line profit</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {(r.items ?? []).map((i, idx) => (
                                      <TableRow key={`${r.order_id}-${idx}`}>
                                        <TableCell className="text-xs font-medium">{i.product_name}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{i.variant_label ?? "—"}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{i.sku ?? "—"}</TableCell>
                                        <TableCell className="text-right text-xs tabular-nums">{Number(i.quantity)}</TableCell>
                                        <TableCell className="text-right text-xs tabular-nums">{fmtBdt(i.net_revenue)}</TableCell>
                                        <TableCell className="text-right text-xs tabular-nums">{fmtBdt(i.unit_cost)}</TableCell>
                                        <TableCell className="text-right text-xs tabular-nums text-muted-foreground">{fmtBdt(i.line_cogs)}</TableCell>
                                        <TableCell className="text-right text-xs tabular-nums font-medium">{fmtBdt(i.line_profit)}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                                <div className="flex flex-wrap gap-x-5 gap-y-1 border-t px-3 py-2 text-[11px] text-muted-foreground">
                                  <span>Channel: <b className="text-foreground">{r.source}</b></span>
                                  <span>Payment: <b className="text-foreground">{r.payment_method}</b></span>
                                  <span>City: <b className="text-foreground">{r.city ?? "—"}</b></span>
                                  <span>Delivery charge: <b className="text-foreground">{fmtBdt(r.shipping_fee)}</b></span>
                                  <span>Discount: <b className="text-foreground">{fmtBdt(r.discounts)}</b></span>
                                  <span>Recon: <b className="text-foreground">{r.reconciliation_status}</b></span>
                                  <span>
                                    Collection diff:{" "}
                                    <b className={Number(r.collection_diff) < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"}>
                                      {fmtBdt(r.collection_diff)}
                                    </b>
                                  </span>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {total.toLocaleString()} orders
                {s ? ` · received from courier ${fmtBdt(Number(s.courier_collected))} · courier charge ${fmtBdt(Number(s.courier_charge))}` : ""}
              </span>
              <div className="flex items-center gap-2">
                <span>Page {page + 1} / {pages}</span>
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          </>
        )}
      </Panel>
    </>
  );
}