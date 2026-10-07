import { dhakaToday } from "@/lib/erp/finance";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Wallet, AlertCircle, Download, FileSpreadsheet, Printer } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { fmtBdt } from "@/lib/erp/finance";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { exportAgedExcel, exportAgedPdf } from "@/lib/erp/finance-aged-export";

type APRow = {
  bill_id: string; supplier_id: string; supplier_name: string;
  bill_no: string; bill_date: string; due_date: string | null;
  amount: number; paid_amount: number; outstanding: number;
  status: string; age_days: number;
};

type Supplier = { id: string; name: string };
type COA = { id: string; code: string; name: string; account_type: string };

const BUCKETS = [
  { label: "Not due / 0–7d", min: 0, max: 7 },
  { label: "8–15 days", min: 8, max: 15 },
  { label: "16–30 days", min: 16, max: 30 },
  { label: "30+ days", min: 31, max: Infinity },
] as const;

export function PayablesPage() {
  const { brandId, effectiveBrand, picker } = useBrandPicker();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [bucket, setBucket] = useState<string>("all");
  const [newBillOpen, setNewBillOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<APRow | null>(null);

  const apQ = useQuery({
    queryKey: ["ap_outstanding", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_ap_outstanding" as never)
        .select("*")
        .eq("brand_id", brandId!)
        .order("age_days", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as APRow[];
    },
  });

  const suppliersQ = useQuery({
    queryKey: ["suppliers", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_suppliers")
        .select("id, name").eq("brand_id", brandId!).eq("is_active", true).order("name");
      if (error) throw error;
      return (data ?? []) as Supplier[];
    },
  });

  const coaQ = useQuery({
    queryKey: ["coa_active_ap", brandId],
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
    let r = apQ.data ?? [];
    if (bucket !== "all") {
      const idx = Number(bucket);
      const b = BUCKETS[idx];
      r = r.filter((x) => x.age_days >= b.min && x.age_days <= b.max);
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      r = r.filter((x) => x.supplier_name.toLowerCase().includes(s) || x.bill_no.toLowerCase().includes(s));
    }
    return r;
  }, [apQ.data, bucket, search]);

  const bucketTotals = useMemo(() => {
    const t = BUCKETS.map(() => ({ count: 0, amount: 0 }));
    (apQ.data ?? []).forEach((r) => {
      const i = BUCKETS.findIndex((b) => r.age_days >= b.min && r.age_days <= b.max);
      if (i >= 0) { t[i].count++; t[i].amount += Number(r.outstanding); }
    });
    return t;
  }, [apQ.data]);

  const totalOutstanding = (apQ.data ?? []).reduce((s, r) => s + Number(r.outstanding), 0);

  const today = dhakaToday();
  const supplierContactMap = new Map((suppliersQ.data ?? []).map((s) => [s.id, ""]));
  const exportRowsForAging = () =>
    (apQ.data ?? []).map((r) => ({
      name: r.supplier_name,
      contact: supplierContactMap.get(r.supplier_id) ?? "",
      docNo: r.bill_no,
      docDate: r.bill_date,
      dueDate: r.due_date ?? "",
      age: r.age_days,
      outstanding: Number(r.outstanding),
    }));

  return (
    <div className="p-4 md:p-6 space-y-4">
      {picker && <div className="flex justify-end -mb-1">{picker}</div>}
      <header className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Accounts Payable</h1>
          <p className="text-sm text-muted-foreground">
            Total outstanding: <span className="font-mono font-semibold text-foreground">{fmtBdt(totalOutstanding)}</span>
            {" · "}{rows.length} of {apQ.data?.length ?? 0} bills
          </p>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={!(apQ.data?.length)}>
                <Download className="h-4 w-4 mr-1" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportAgedExcel({ rows: exportRowsForAging(), kind: "payables", asOfDate: today })}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Export Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportAgedPdf({ rows: exportRowsForAging(), kind: "payables", asOfDate: today, companyName: effectiveBrand?.name })}>
                <Printer className="h-4 w-4 mr-2" /> Export PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => setNewBillOpen(true)} disabled={!suppliersQ.data?.length || !coaQ.data?.length}>
            <Plus className="h-4 w-4 mr-1" />New Bill
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {BUCKETS.map((b, i) => (
          <Card key={b.label} className={bucket === String(i) ? "border-primary" : ""}>
            <CardContent className="p-4">
              <button className="w-full text-left" onClick={() => setBucket(bucket === String(i) ? "all" : String(i))}>
                <div className="text-xs text-muted-foreground">{b.label}</div>
                <div className="text-xl font-bold font-mono mt-1">{fmtBdt(bucketTotals[i].amount)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{bucketTotals[i].count} bills</div>
              </button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Supplier or bill no…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
              <TableHead>Bill Date</TableHead>
              <TableHead>Bill No</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead className="text-right">Age</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apQ.isLoading && <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
            {!apQ.isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No outstanding bills.</TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.bill_id}>
                <TableCell className="text-xs whitespace-nowrap">{r.bill_date}</TableCell>
                <TableCell className="font-mono text-xs">{r.bill_no}</TableCell>
                <TableCell className="text-sm">{r.supplier_name}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{r.due_date ?? "—"}</TableCell>
                <TableCell><Badge variant={r.status === "partial" ? "secondary" : "outline"} className="text-xs">{r.status}</Badge></TableCell>
                <TableCell className="text-right font-mono text-sm">{fmtBdt(r.amount)}</TableCell>
                <TableCell className="text-right font-mono text-sm">{fmtBdt(r.paid_amount)}</TableCell>
                <TableCell className="text-right font-mono font-semibold">{fmtBdt(r.outstanding)}</TableCell>
                <TableCell className="text-right">
                  <span className={r.age_days > 30 ? "text-red-600 font-semibold" : r.age_days > 15 ? "text-amber-600" : "text-muted-foreground"}>{r.age_days}d</span>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" className="h-7" onClick={() => setPayTarget(r)}>
                    <Wallet className="h-3.5 w-3.5 mr-1" />Pay
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {newBillOpen && (
        <NewBillDialog
          brandId={brandId}
          suppliers={suppliersQ.data ?? []}
          coa={coaQ.data ?? []}
          onClose={() => setNewBillOpen(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["ap_outstanding"] })}
        />
      )}

      {payTarget && (
        <PayBillDialog
          row={payTarget}
          coa={coaQ.data ?? []}
          onClose={() => setPayTarget(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["ap_outstanding"] })}
        />
      )}
    </div>
  );
}

function NewBillDialog({ brandId, suppliers, coa, onClose, onSaved }: {
  brandId: string; suppliers: Supplier[]; coa: COA[]; onClose: () => void; onSaved: () => void;
}) {
  const today = dhakaToday();
  const [supplierId, setSupplierId] = useState("");
  const [billNo, setBillNo] = useState("");
  const [billDate, setBillDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");
  const [expAcct, setExpAcct] = useState("");
  const [apAcct, setApAcct] = useState("");
  const [desc, setDesc] = useState("");

  const expenseAccts = coa.filter((a) => a.account_type === "expense");
  const liabAccts = coa.filter((a) => a.account_type === "liability");
  const apDefault = liabAccts.find((a) => /payable/i.test(a.name));

  const mut = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!supplierId) throw new Error("Pick a supplier");
      if (!billNo.trim()) throw new Error("Bill no required");
      if (!(amt > 0)) throw new Error("Amount must be > 0");
      if (!expAcct) throw new Error("Pick expense account");
      const ap = apAcct || apDefault?.id;
      if (!ap) throw new Error("Pick an A/P liability account");
      const args: Record<string, unknown> = {
        _brand_id: brandId, _supplier_id: supplierId, _bill_no: billNo, _bill_date: billDate,
        _amount: amt, _expense_account_id: expAcct, _ap_account_id: ap,
      };
      if (dueDate) args._due_date = dueDate;
      if (desc) args._description = desc;
      const { error } = await supabase.rpc("create_bill", args as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Bill created"); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New Supplier Bill</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="Pick supplier…" /></SelectTrigger>
                <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Bill No / Invoice #</Label><Input value={billNo} onChange={(e) => setBillNo(e.target.value)} /></div>
            <div><Label className="text-xs">Bill Date</Label><Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} /></div>
            <div><Label className="text-xs">Due Date</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
            <div><Label className="text-xs">Amount</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div>
              <Label className="text-xs">Expense / Asset Account (debit)</Label>
              <Select value={expAcct} onValueChange={setExpAcct}>
                <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>{expenseAccts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">A/P Account (credit)</Label>
              <Select value={apAcct || apDefault?.id || ""} onValueChange={setApAcct}>
                <SelectTrigger><SelectValue placeholder="Liability account…" /></SelectTrigger>
                <SelectContent>{liabAccts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent>
              </Select>
              {!liabAccts.length && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />No liability accounts yet. Create one in Chart of Accounts.
                </p>
              )}
            </div>
          </div>
          <div><Label className="text-xs">Description</Label><Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Create Bill"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayBillDialog({ row, coa, onClose, onSaved }: {
  row: APRow; coa: COA[]; onClose: () => void; onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String(row.outstanding.toFixed(2)));
  const [cashAcct, setCashAcct] = useState("");
  const [date, setDate] = useState(dhakaToday());
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const cashAccounts = coa.filter((a) => a.account_type === "asset");

  const mut = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!cashAcct) throw new Error("Pick a cash/bank account");
      if (!(amt > 0)) throw new Error("Amount must be > 0");
      if (amt > row.outstanding + 0.01) throw new Error("Exceeds outstanding");
      const args: Record<string, unknown> = {
        _bill_id: row.bill_id, _amount: amt, _cash_account_id: cashAcct, _payment_date: date,
      };
      if (ref) args._reference_no = ref;
      if (notes) args._notes = notes;
      const { error } = await supabase.rpc("record_bill_payment", args as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Payment recorded"); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Pay Bill — {row.supplier_name} ({row.bill_no})</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            Bill outstanding: <span className="font-mono font-semibold">{fmtBdt(row.outstanding)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Amount</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div><Label className="text-xs">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <div>
            <Label className="text-xs">Pay from (cash/bank/MFS)</Label>
            <Select value={cashAcct} onValueChange={setCashAcct}>
              <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>{cashAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent>
            </Select>
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