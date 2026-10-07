import { dhakaToday } from "@/lib/erp/finance";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Play, Pause, Trash2, RefreshCw } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { fmtBdt } from "@/lib/erp/finance";

type Rule = {
  id: string; name: string; description: string | null; frequency: string; interval_n: number;
  start_date: string; next_run_date: string; end_date: string | null;
  amount: number; lines: Array<{ account_id: string; debit: number; credit: number; description?: string }>;
  auto_post: boolean; is_active: boolean; last_run_at: string | null;
};
type COA = { id: string; code: string; name: string; account_type: string };

export function RecurringPage() {
  const { brandId, effectiveBrand, picker } = useBrandPicker();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const rulesQ = useQuery({
    queryKey: ["recurring_rules", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_recurring_rules" as never)
        .select("*").eq("brand_id", brandId!).order("next_run_date").limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Rule[];
    },
  });

  const coaQ = useQuery({
    queryKey: ["coa_active_rec", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_chart_accounts")
        .select("id, code, name, account_type").eq("brand_id", brandId!)
        .eq("is_archived", false).order("code");
      if (error) throw error;
      return (data ?? []) as COA[];
    },
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("erp_recurring_rules" as never).update({ is_active } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring_rules"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_recurring_rules" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Rule deleted"); qc.invalidateQueries({ queryKey: ["recurring_rules"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const runNowMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("run_recurring_rules", { _brand_id: brandId! } as never);
      if (error) throw error;
      return data as { posted: number; failed: number };
    },
    onSuccess: (r) => { toast.success(`Posted ${r.posted}, failed ${r.failed}`); qc.invalidateQueries({ queryKey: ["recurring_rules"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const today = dhakaToday();

  return (
    <div className="p-4 md:p-6 space-y-4">
      {picker && <div className="flex justify-end -mb-1">{picker}</div>}
      <header className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Recurring Entries</h1>
          <p className="text-sm text-muted-foreground">Rent, salary, subscriptions — auto-posted on schedule.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => runNowMut.mutate()} disabled={runNowMut.isPending}>
            <RefreshCw className={`h-4 w-4 mr-1 ${runNowMut.isPending ? "animate-spin" : ""}`} />Run Due Now
          </Button>
          <Button onClick={() => setOpen(true)} disabled={!coaQ.data?.length}>
            <Plus className="h-4 w-4 mr-1" />New Rule
          </Button>
        </div>
      </header>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Next Run</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rulesQ.isLoading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
            {!rulesQ.isLoading && (rulesQ.data ?? []).length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No recurring rules yet.</TableCell></TableRow>
            )}
            {(rulesQ.data ?? []).map((r) => (
              <TableRow key={r.id} className={!r.is_active ? "opacity-50" : ""}>
                <TableCell>
                  <div className="font-medium">{r.name}</div>
                  {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                </TableCell>
                <TableCell className="text-xs">Every {r.interval_n} {r.frequency}</TableCell>
                <TableCell>
                  <span className={r.next_run_date <= today && r.is_active ? "text-amber-600 font-semibold" : ""}>{r.next_run_date}</span>
                </TableCell>
                <TableCell className="text-right font-mono">{fmtBdt(r.amount)}</TableCell>
                <TableCell>
                  <Badge variant={r.is_active ? "default" : "secondary"} className="text-xs">{r.is_active ? "Active" : "Paused"}</Badge>
                  {r.auto_post && <Badge variant="outline" className="text-xs ml-1">auto</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleMut.mutate({ id: r.id, is_active: !r.is_active })}>
                    {r.is_active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (confirm("Delete this rule?")) delMut.mutate(r.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {open && <NewRuleDialog brandId={brandId} coa={coaQ.data ?? []} onClose={() => setOpen(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["recurring_rules"] })} />}
    </div>
  );
}

function NewRuleDialog({ brandId, coa, onClose, onSaved }: { brandId: string; coa: COA[]; onClose: () => void; onSaved: () => void; }) {
  const today = dhakaToday();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [interval, setInterval] = useState("1");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState("");
  const [amount, setAmount] = useState("");
  const [debitAcct, setDebitAcct] = useState("");
  const [creditAcct, setCreditAcct] = useState("");
  const [autoPost, setAutoPost] = useState(true);

  const mut = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!name.trim()) throw new Error("Name required");
      if (!(amt > 0)) throw new Error("Amount must be > 0");
      if (!debitAcct || !creditAcct) throw new Error("Pick both accounts");
      if (debitAcct === creditAcct) throw new Error("Debit and credit accounts must differ");
      const lines = [
        { account_id: debitAcct, debit: amt, credit: 0, description: name },
        { account_id: creditAcct, debit: 0, credit: amt, description: name },
      ];
      const row: Record<string, unknown> = {
        brand_id: brandId, name, description: desc || null, frequency, interval_n: Number(interval) || 1,
        start_date: start, next_run_date: start, amount: amt, lines, auto_post: autoPost, is_active: true,
      };
      if (end) row.end_date = end;
      const { error } = await supabase.from("erp_recurring_rules" as never).insert(row as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Rule created"); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New Recurring Rule</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label className="text-xs">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Office Rent" /></div>
            <div className="col-span-2"><Label className="text-xs">Description</Label><Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
            <div>
              <Label className="text-xs">Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Every N</Label><Input type="number" min="1" value={interval} onChange={(e) => setInterval(e.target.value)} /></div>
            <div><Label className="text-xs">Start / Next Run</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><Label className="text-xs">End Date (optional)</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
            <div><Label className="text-xs">Amount</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="flex items-end gap-2">
              <Switch checked={autoPost} onCheckedChange={setAutoPost} />
              <Label className="text-xs mb-2">Auto-post when due</Label>
            </div>
            <div>
              <Label className="text-xs">Debit account (expense / asset)</Label>
              <Select value={debitAcct} onValueChange={setDebitAcct}>
                <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>{coa.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Credit account (cash / liability)</Label>
              <Select value={creditAcct} onValueChange={setCreditAcct}>
                <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>{coa.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Create Rule"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}