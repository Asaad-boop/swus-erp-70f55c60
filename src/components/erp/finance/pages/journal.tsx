import { dhakaToday } from "@/lib/erp/finance";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Ban, FileText, Search } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { fmtBdt } from "@/lib/erp/finance";

type Entry = {
  id: string; entry_no: string; entry_date: string; description: string | null;
  status: "draft" | "posted" | "void"; source_type: string | null;
  lines: Array<{ id: string; debit: number; credit: number; account_id: string; description: string | null }>;
  total_debit: number;
};

type COA = { id: string; code: string; name: string; account_type: string };

export function JournalPage() {
  const { brandId, effectiveBrand, picker } = useBrandPicker();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "posted" | "void" | "draft">("all");
  const [search, setSearch] = useState("");

  const coaQ = useQuery({
    queryKey: ["coa_active", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_chart_accounts").select("id, code, name, account_type")
        .eq("brand_id", brandId!).eq("is_archived", false).order("code");
      if (error) throw error;
      return (data ?? []) as COA[];
    },
  });

  const entriesQ = useQuery({
    queryKey: ["journal_entries", brandId, statusFilter],
    enabled: !!brandId,
    queryFn: async () => {
      let qb = supabase.from("erp_journal_entries")
        .select("id, entry_no, entry_date, description, status, source_type, erp_journal_lines(id, debit, credit, account_id, description)")
        .eq("brand_id", brandId!).is("deleted_at", null).order("entry_date", { ascending: false }).limit(200);
      if (statusFilter !== "all") qb = qb.eq("status", statusFilter);
      const { data, error } = await qb;
      if (error) throw error;
      return (data ?? []).map((e) => ({
        ...e,
        lines: e.erp_journal_lines ?? [],
        total_debit: (e.erp_journal_lines ?? []).reduce((s: number, l) => s + Number(l.debit || 0), 0),
      })) as Entry[];
    },
  });

  const filteredEntries = useMemo(() => {
    const rows = entriesQ.data ?? [];
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter((e) => e.entry_no.toLowerCase().includes(s) || (e.description ?? "").toLowerCase().includes(s));
  }, [entriesQ.data, search]);

  const voidMut = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc("void_journal_entry", { _entry_id: id, _reason: reason });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Entry voided"); qc.invalidateQueries({ queryKey: ["journal_entries"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      {picker && <div className="flex justify-end -mb-1">{picker}</div>}
      <header className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Journal</h1>
          <p className="text-sm text-muted-foreground">Double-entry accounting · {filteredEntries.length} entries</p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={!coaQ.data?.length}>
          <Plus className="h-4 w-4 mr-1" />New Entry
        </Button>
      </header>

      {(coaQ.data ?? []).length === 0 && !coaQ.isLoading && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 px-3 py-2 text-sm">
          No chart of accounts yet. <a href="/erp/finance/accounts" className="underline font-medium">Seed your COA first</a>.
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-end">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Entry no or description…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="min-w-[140px]">
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="posted">Posted</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="void">Void</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Entry No</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entriesQ.isLoading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
            {!entriesQ.isLoading && filteredEntries.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No journal entries yet.</TableCell></TableRow>
            )}
            {filteredEntries.map((e) => (
              <TableRow key={e.id} className={e.status === "void" ? "opacity-50" : ""}>
                <TableCell className="text-xs whitespace-nowrap">{e.entry_date}</TableCell>
                <TableCell className="font-mono text-xs">{e.entry_no}</TableCell>
                <TableCell className="text-sm max-w-[400px] truncate">
                  {e.description ?? <span className="text-muted-foreground">—</span>}
                  {e.source_type === "payroll_run" ? (
                    <Badge variant="secondary" className="ml-2 text-xs bg-indigo-50 text-indigo-700 border-indigo-200">📋 Payroll</Badge>
                  ) : e.source_type === "payslip_payment" ? (
                    <Badge variant="secondary" className="ml-2 text-xs bg-emerald-50 text-emerald-700 border-emerald-200">💸 Salary Paid</Badge>
                  ) : e.source_type ? (
                    <Badge variant="outline" className="ml-2 text-xs">{e.source_type}</Badge>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge variant={e.status === "posted" ? "default" : e.status === "void" ? "destructive" : "secondary"} className="text-xs">{e.status}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono">{fmtBdt(e.total_debit)}</TableCell>
                <TableCell className="text-right">
                  {e.status !== "void" && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                      const reason = window.prompt("Void reason:");
                      if (reason) voidMut.mutate({ id: e.id, reason });
                    }}><Ban className="h-3.5 w-3.5" /></Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <JournalEntryDialog
        open={open}
        onClose={() => setOpen(false)}
        brandId={brandId}
        coa={coaQ.data ?? []}
        onSaved={() => qc.invalidateQueries({ queryKey: ["journal_entries"] })}
      />
    </div>
  );
}

type LineDraft = { account_id: string; debit: string; credit: string; description: string };

function JournalEntryDialog({ open, onClose, brandId, coa, onSaved }: {
  open: boolean; onClose: () => void; brandId: string; coa: COA[]; onSaved: () => void;
}) {
  const today = dhakaToday();
  const [date, setDate] = useState(today);
  const [desc, setDesc] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([
    { account_id: "", debit: "", credit: "", description: "" },
    { account_id: "", debit: "", credit: "", description: "" },
  ]);

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const reset = () => {
    setDate(today); setDesc("");
    setLines([{ account_id: "", debit: "", credit: "", description: "" }, { account_id: "", debit: "", credit: "", description: "" }]);
  };

  const mut = useMutation({
    mutationFn: async () => {
      if (!balanced) throw new Error("Entry must be balanced and non-zero");
      const cleanLines = lines
        .filter((l) => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0))
        .map((l) => ({
          account_id: l.account_id,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          description: l.description || "",
        }));
      if (cleanLines.length < 2) throw new Error("At least 2 lines required");
      const { error } = await supabase.rpc("create_journal_entry", {
        _brand_id: brandId, _entry_date: date, _description: desc || "", _lines: cleanLines,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Entry posted"); reset(); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />New Journal Entry</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div><Label className="text-xs">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="col-span-2"><Label className="text-xs">Description</Label><Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What is this entry for?" /></div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[35%]">Account</TableHead>
                  <TableHead className="text-right w-[130px]">Debit</TableHead>
                  <TableHead className="text-right w-[130px]">Credit</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell className="p-1">
                      <Select value={l.account_id} onValueChange={(v) => {
                        const next = [...lines]; next[i] = { ...next[i], account_id: v }; setLines(next);
                      }}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose…" /></SelectTrigger>
                        <SelectContent>
                          {coa.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="p-1">
                      <Input type="number" step="0.01" className="h-8 text-right font-mono" value={l.debit}
                        onChange={(e) => { const n = [...lines]; n[i] = { ...n[i], debit: e.target.value, credit: e.target.value ? "" : n[i].credit }; setLines(n); }} />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input type="number" step="0.01" className="h-8 text-right font-mono" value={l.credit}
                        onChange={(e) => { const n = [...lines]; n[i] = { ...n[i], credit: e.target.value, debit: e.target.value ? "" : n[i].debit }; setLines(n); }} />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input className="h-8 text-xs" value={l.description}
                        onChange={(e) => { const n = [...lines]; n[i] = { ...n[i], description: e.target.value }; setLines(n); }} />
                    </TableCell>
                    <TableCell className="p-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={lines.length <= 2}
                        onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-between items-center">
            <Button variant="outline" size="sm" onClick={() => setLines([...lines, { account_id: "", debit: "", credit: "", description: "" }])}>
              <Plus className="h-4 w-4 mr-1" />Add line
            </Button>
            <div className="flex gap-4 text-sm">
              <span>Debit: <span className="font-mono font-semibold">{fmtBdt(totalDebit)}</span></span>
              <span>Credit: <span className="font-mono font-semibold">{fmtBdt(totalCredit)}</span></span>
              <span className={balanced ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>
                {balanced ? "✓ Balanced" : `Diff: ${fmtBdt(Math.abs(totalDebit - totalCredit))}`}
              </span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={!balanced || mut.isPending}>
            {mut.isPending ? "Posting…" : "Post Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}