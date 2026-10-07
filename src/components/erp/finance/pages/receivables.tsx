import { dhakaToday } from "@/lib/erp/finance";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Wallet, AlertCircle, Download, FileSpreadsheet, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { fmtBdt } from "@/lib/erp/finance";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { exportAgedExcel, exportAgedPdf } from "@/lib/erp/finance-aged-export";

type ARRow = {
  order_id: string; customer_name: string; customer_phone: string | null;
  invoice_date: string; invoice_amount: number; prepaid: number; paid: number;
  outstanding: number; age_days: number; order_status: string;
  payment_status: string | null; payment_method: string | null;
};

type COA = { id: string; code: string; name: string; account_type: string };

const BUCKETS = [
  { label: "Current (0–7d)", min: 0, max: 7 },
  { label: "8–15 days", min: 8, max: 15 },
  { label: "16–30 days", min: 16, max: 30 },
  { label: "30+ days", min: 31, max: Infinity },
] as const;

function bucketFor(age: number) {
  return BUCKETS.findIndex((b) => age >= b.min && age <= b.max);
}

export function ReceivablesPage() {
  const { brandId, effectiveBrand, picker } = useBrandPicker();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [bucket, setBucket] = useState<string>("all");
  const [payTarget, setPayTarget] = useState<ARRow | null>(null);

  const arQ = useQuery({
    queryKey: ["ar_outstanding", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_ar_outstanding" as never)
        .select("*")
        .eq("brand_id", brandId!)
        .order("age_days", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as ARRow[];
    },
  });

  const coaQ = useQuery({
    queryKey: ["coa_active_ar", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_chart_accounts")
        .select("id, code, name, account_type")
        .eq("brand_id", brandId!).eq("is_archived", false).order("code");
      if (error) throw error;
      return (data ?? []) as COA[];
    },
  });

  const rows = useMemo(() => {
    let r = arQ.data ?? [];
    if (bucket !== "all") {
      const idx = Number(bucket);
      const b = BUCKETS[idx];
      r = r.filter((x) => x.age_days >= b.min && x.age_days <= b.max);
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      r = r.filter((x) =>
        x.customer_name.toLowerCase().includes(s) ||
        (x.customer_phone ?? "").toLowerCase().includes(s) ||
        x.order_id.toLowerCase().includes(s));
    }
    return r;
  }, [arQ.data, bucket, search]);

  const bucketTotals = useMemo(() => {
    const totals = BUCKETS.map(() => ({ count: 0, amount: 0 }));
    (arQ.data ?? []).forEach((r) => {
      const i = bucketFor(r.age_days);
      if (i >= 0) { totals[i].count++; totals[i].amount += Number(r.outstanding); }
    });
    return totals;
  }, [arQ.data]);

  const totalOutstanding = (arQ.data ?? []).reduce((s, r) => s + Number(r.outstanding), 0);

  const today = dhakaToday();
  const exportRowsForAging = () =>
    (arQ.data ?? []).map((r) => ({
      name: r.customer_name,
      contact: r.customer_phone ?? "",
      docNo: r.order_id.slice(0, 8),
      docDate: r.invoice_date,
      dueDate: r.invoice_date,
      age: r.age_days,
      outstanding: Number(r.outstanding),
    }));

  return (
    <div className="p-4 md:p-6 space-y-4">
      {picker && <div className="flex justify-end -mb-1">{picker}</div>}
      <header className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Accounts Receivable</h1>
          <p className="text-sm text-muted-foreground">
            Total outstanding: <span className="font-mono font-semibold text-foreground">{fmtBdt(totalOutstanding)}</span>
            {" · "}{rows.length} of {arQ.data?.length ?? 0} orders
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={!(arQ.data?.length)}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => exportAgedExcel({ rows: exportRowsForAging(), kind: "receivables", asOfDate: today })}>
              <FileSpreadsheet className="h-4 w-4 mr-2" /> Export Excel
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportAgedPdf({ rows: exportRowsForAging(), kind: "receivables", asOfDate: today, companyName: effectiveBrand?.name })}>
              <Printer className="h-4 w-4 mr-2" /> Export PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {BUCKETS.map((b, i) => (
          <Card key={b.label} className={bucket === String(i) ? "border-primary" : ""}>
            <CardContent className="p-4">
              <button className="w-full text-left" onClick={() => setBucket(bucket === String(i) ? "all" : String(i))}>
                <div className="text-xs text-muted-foreground">{b.label}</div>
                <div className="text-xl font-bold font-mono mt-1">{fmtBdt(bucketTotals[i].amount)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{bucketTotals[i].count} orders</div>
              </button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Customer name, phone, or order id…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="min-w-[160px]">
          <Label className="text-xs">Aging bucket</Label>
          <Select value={bucket} onValueChange={setBucket}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {BUCKETS.map((b, i) => <SelectItem key={b.label} value={String(i)}>{b.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Invoice</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead className="text-right">Age</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {arQ.isLoading && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
            {!arQ.isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No outstanding receivables.</TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.order_id}>
                <TableCell className="text-xs whitespace-nowrap">{r.invoice_date}</TableCell>
                <TableCell>
                  <div className="text-sm">{r.customer_name}</div>
                  {r.customer_phone && <div className="text-xs text-muted-foreground font-mono">{r.customer_phone}</div>}
                </TableCell>
                <TableCell className="font-mono text-xs">{r.order_id.slice(0, 8)}</TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{r.order_status}</Badge></TableCell>
                <TableCell className="text-right font-mono text-sm">{fmtBdt(r.invoice_amount)}</TableCell>
                <TableCell className="text-right font-mono text-sm">{fmtBdt(Number(r.prepaid) + Number(r.paid))}</TableCell>
                <TableCell className="text-right font-mono font-semibold">{fmtBdt(r.outstanding)}</TableCell>
                <TableCell className="text-right">
                  <span className={r.age_days > 30 ? "text-red-600 font-semibold" : r.age_days > 15 ? "text-amber-600" : "text-muted-foreground"}>
                    {r.age_days}d
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" className="h-7" onClick={() => setPayTarget(r)}>
                    <Wallet className="h-3.5 w-3.5 mr-1" />Receive
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {payTarget && (
        <ReceivePaymentDialog
          row={payTarget}
          coa={coaQ.data ?? []}
          onClose={() => setPayTarget(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["ar_outstanding"] })}
        />
      )}
    </div>
  );
}

function ReceivePaymentDialog({ row, coa, onClose, onSaved }: {
  row: ARRow; coa: COA[]; onClose: () => void; onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String(row.outstanding.toFixed(2)));
  const [cashAcct, setCashAcct] = useState("");
  const [arAcct, setArAcct] = useState("");
  const [date, setDate] = useState(dhakaToday());
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");

  const cashAccounts = coa.filter((a) => a.account_type === "asset");
  const arAccounts = coa.filter((a) => a.account_type === "asset" && /receivable|cod/i.test(a.name));

  const mut = useMutation({
    mutationFn: async () => {
      if (!cashAcct) throw new Error("Pick a cash/bank account");
      if (!arAcct) throw new Error("Pick an A/R account");
      const amt = Number(amount);
      if (!(amt > 0)) throw new Error("Amount must be > 0");
      if (amt > row.outstanding + 0.01) throw new Error("Exceeds outstanding");
      const args: Record<string, unknown> = {
        _order_id: row.order_id, _amount: amt, _cash_account_id: cashAcct,
        _ar_account_id: arAcct, _payment_date: date,
      };
      if (ref) args._reference_no = ref;
      if (notes) args._notes = notes;
      const { error } = await supabase.rpc("record_ar_payment", args as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Payment recorded"); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Receive Payment — {row.customer_name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            Order outstanding: <span className="font-mono font-semibold">{fmtBdt(row.outstanding)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Amount</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div><Label className="text-xs">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <div>
            <Label className="text-xs">Deposit into (cash/bank/MFS)</Label>
            <Select value={cashAcct} onValueChange={setCashAcct}>
              <SelectTrigger><SelectValue placeholder="Choose account…" /></SelectTrigger>
              <SelectContent>{cashAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Clear from A/R account</Label>
            <Select value={arAcct} onValueChange={setArAcct}>
              <SelectTrigger><SelectValue placeholder="Receivable account…" /></SelectTrigger>
              <SelectContent>
                {(arAccounts.length ? arAccounts : cashAccounts).map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {!arAccounts.length && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />No "Receivable" named account; create one in Chart of Accounts.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Reference no</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} /></div>
            <div><Label className="text-xs">Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Record Payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}