import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { DateRangePicker, buildPreset, type MktRangeValue } from "@/components/erp/marketing/date-range-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fmtBdt } from "@/lib/erp/finance";
import { classifyDelivered, type DeliveredRow } from "@/lib/erp/finance-integrity";

export const Route = createFileRoute("/_authenticated/erp/finance/integrity")({
  head: () => ({ meta: [{ title: "Finance Integrity — ERP" }, { name: "description", content: "Read-only finance data integrity checks." }] }),
  component: IntegrityPage,
});

type Wallet = { id: string; name: string; brand: string; opening: number; stored: number; derived: number; drift: number; txn_count: number };
type Orphan = { id: string; reference_type: string; reference_id: string; amount: number; txn_type: string; transaction_date: string; description: string | null; brand: string | null; account: string | null };
type Dup = { kind: string; reference_type?: string; reference_id?: string; date?: string; type?: string; description?: string; amount: number; count: number; ids: string[]; brand: string | null };
type Report = {
  generated_at: string; wallets: Wallet[]; orphans: Orphan[]; duplicates: Dup[]; possible_duplicates: Dup[];
  delivered: DeliveredRow[]; journals_unbalanced: number; txn_brand_mismatch: number;
};

const short = (id: string) => id.slice(0, 8);

function IntegrityPage() {
  const { brandId, effectiveBrand, picker } = useBrandPicker();
  const [range, setRange] = useState<MktRangeValue>(() => buildPreset("lifetime"));
  const lifetime = range.presetKey === "lifetime";

  const q = useQuery({
    queryKey: ["fin-integrity", brandId ?? "all", lifetime ? null : range.from, lifetime ? null : range.to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fin_integrity_report" as never, {
        _brand: brandId ?? null, _from: lifetime ? null : range.from, _to: lifetime ? null : range.to,
      } as never);
      if (error) throw error;
      return data as unknown as Report;
    },
  });

  const r = q.data;
  const delivered = useMemo(() => (r?.delivered ?? []).map((d) => ({ ...d, c: classifyDelivered(d) })), [r]);
  const exceptions = delivered.filter((d) => d.c.severity !== "info");
  const drifting = (r?.wallets ?? []).filter((w) => Math.abs(w.drift) > 0.01);

  const tests = r ? [
    { name: "Every wallet: stored balance = opening + transactions", pass: drifting.length === 0, detail: `${drifting.length} wallet(s) drift` },
    { name: "No transaction points to a deleted source", pass: r.orphans.length === 0, detail: `${r.orphans.length} orphan(s)` },
    { name: "No duplicate posting for the same reference", pass: r.duplicates.length === 0, detail: `${r.duplicates.length} group(s)` },
    { name: "Every journal is balanced (debit = credit)", pass: r.journals_unbalanced === 0, detail: `${r.journals_unbalanced} unbalanced` },
    { name: "Transaction brand matches wallet brand", pass: r.txn_brand_mismatch === 0, detail: `${r.txn_brand_mismatch} mismatch(es)` },
    { name: "Every delivered order with COD due has a finance posting", pass: !exceptions.some((d) => d.c.kind === "unposted" || d.c.kind === "recon_only"), detail: `${exceptions.filter((d) => d.c.kind === "unposted" || d.c.kind === "recon_only").length} order(s)` },
    { name: "No advance counted twice", pass: !exceptions.some((d) => d.c.kind === "advance_double"), detail: `${exceptions.filter((d) => d.c.kind === "advance_double").length} order(s)` },
    { name: "Partial deliveries posted with the collected amount", pass: !exceptions.some((d) => d.c.kind === "partial_mismatch"), detail: `${exceptions.filter((d) => d.c.kind === "partial_mismatch").length} order(s)` },
  ] : [];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" />Finance Integrity</h1>
          <p className="text-sm text-muted-foreground">Read-only checks · {effectiveBrand?.name ?? "All brands"} (shared wallets included) · nothing here changes data</p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">{picker}<DateRangePicker value={range} onChange={setRange} /></div>
      </header>

      {q.isLoading && <p className="text-sm text-muted-foreground">Running checks…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message === "Forbidden" ? "Only owner, admin or accountant can view this page." : (q.error as Error).message}</p>}

      {r && (
        <>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Reconciliation tests</CardTitle></CardHeader>
            <CardContent className="grid gap-1.5">
              {tests.map((t) => (
                <div key={t.name} className="flex items-center justify-between text-sm border-b border-border/50 py-1">
                  <span className="flex items-center gap-2">{t.pass ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}{t.name}</span>
                  <Badge variant={t.pass ? "secondary" : "destructive"}>{t.pass ? "PASS" : `FAIL · ${t.detail}`}</Badge>
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-1">Wallet drift is checked against all-time history (balances are cumulative); the other checks follow the selected period.</p>
            </CardContent>
          </Card>

          <Section title="Wallet balance drift" count={drifting.length}>
            <Table><TableHeader><TableRow><TableHead>Wallet</TableHead><TableHead>Brand</TableHead><TableHead className="text-right">Stored</TableHead><TableHead className="text-right">Opening + txns</TableHead><TableHead className="text-right">Drift</TableHead><TableHead>Root cause / suggested correction</TableHead></TableRow></TableHeader>
              <TableBody>{drifting.map((w) => {
                const orphanSum = r.orphans.filter((o) => o.account === w.name).reduce((s, o) => s + Number(o.amount), 0);
                const explained = Math.abs(orphanSum - Math.abs(w.drift)) < 0.5;
                return (
                  <TableRow key={w.id}><TableCell className="font-medium">{w.name}</TableCell><TableCell>{w.brand}</TableCell>
                    <TableCell className="text-right">{fmtBdt(w.stored)}</TableCell><TableCell className="text-right">{fmtBdt(w.derived)}</TableCell>
                    <TableCell className="text-right text-destructive font-semibold">{fmtBdt(w.drift)}</TableCell>
                    <TableCell className="text-xs max-w-md">{explained
                      ? `Exactly explained by ${fmtBdt(orphanSum)} of orphan expense rows below. Stored balance is correct; transaction-based reports overstate spend. Suggested: owner-approved void of the orphan rows (no balance change).`
                      : "Not explained by orphan rows — needs manual investigation before any correction."}</TableCell></TableRow>
                );
              })}</TableBody></Table>
          </Section>

          <Section title="Orphan transactions (source record deleted)" count={r.orphans.length}>
            <Table><TableHeader><TableRow><TableHead>Txn ID</TableHead><TableHead>Date</TableHead><TableHead>Brand</TableHead><TableHead>Wallet</TableHead><TableHead>Source</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Root cause / correction</TableHead></TableRow></TableHeader>
              <TableBody>{r.orphans.map((o) => (
                <TableRow key={o.id}><TableCell className="font-mono text-xs" title={o.id}>{short(o.id)}</TableCell><TableCell>{o.transaction_date}</TableCell><TableCell>{o.brand}</TableCell><TableCell>{o.account}</TableCell>
                  <TableCell className="text-xs">{o.reference_type} <span className="font-mono">{short(o.reference_id)}</span><div className="text-muted-foreground">{o.description}</div></TableCell>
                  <TableCell className="text-right font-semibold">{fmtBdt(o.amount)}</TableCell>
                  <TableCell className="text-xs max-w-sm">Source payment and its journal were deleted, but this {o.txn_type} row stayed. Counted in Income/Expense, P&amp;L "other expense" and import cost; not in the stored wallet balance or the Balance Sheet. Suggested: owner-approved void.</TableCell></TableRow>
              ))}</TableBody></Table>
          </Section>

          <Section title="Delivered-order posting exceptions" count={exceptions.length}>
            <Table><TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Brand</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Advance</TableHead><TableHead className="text-right">Posted</TableHead><TableHead>Other records</TableHead><TableHead>Root cause / correction</TableHead></TableRow></TableHeader>
              <TableBody>{exceptions.map((d) => (
                <TableRow key={d.id}><TableCell className="font-mono text-xs">{d.invoice_no}</TableCell><TableCell>{d.brand}</TableCell><TableCell>{d.status}</TableCell>
                  <TableCell className="text-right">{fmtBdt(d.total)}</TableCell><TableCell className="text-right">{fmtBdt(d.advance)}</TableCell><TableCell className="text-right">{d.posted == null ? "—" : fmtBdt(d.posted)}</TableCell>
                  <TableCell className="text-xs">{d.refs ?? "none"}{d.recon_rows ? ` · ${d.recon_rows} recon row(s)` : ""}</TableCell>
                  <TableCell className="text-xs max-w-sm"><Badge variant={d.c.severity === "error" ? "destructive" : "outline"} className="mr-1">{d.c.label}</Badge>{d.c.fix}</TableCell></TableRow>
              ))}</TableBody></Table>
          </Section>

          <Section title="Not an exception: delivered with nothing to collect" count={delivered.length - exceptions.length} info>
            <p className="text-sm text-muted-foreground">These delivered orders have no delivery posting because their order total minus advance is ৳0. The advance (if any) is already posted separately. No correction needed.</p>
            <p className="text-xs mt-1 font-mono">{delivered.filter((d) => d.c.severity === "info").map((d) => d.invoice_no).join(", ")}</p>
          </Section>

          <Section title="Duplicate postings" count={r.duplicates.length + r.possible_duplicates.length}>
            <Table><TableHeader><TableRow><TableHead>Kind</TableHead><TableHead>Brand</TableHead><TableHead>Detail</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Count</TableHead><TableHead>Txn IDs</TableHead><TableHead>Suggested</TableHead></TableRow></TableHeader>
              <TableBody>{[...r.duplicates, ...r.possible_duplicates].map((d, i) => (
                <TableRow key={i}><TableCell>{d.kind === "same_reference" ? "Same source" : "Possible (manual, same day)"}</TableCell><TableCell>{d.brand}</TableCell>
                  <TableCell className="text-xs">{d.reference_type ?? `${d.date} · ${d.type} · ${d.description}`}</TableCell><TableCell className="text-right">{fmtBdt(d.amount)}</TableCell><TableCell>{d.count}</TableCell>
                  <TableCell className="font-mono text-xs">{d.ids.map(short).join(", ")}</TableCell>
                  <TableCell className="text-xs">{d.kind === "same_reference" ? "Confirmed duplicate — void extra rows after owner approval." : "Review: may be two real entries."}</TableCell></TableRow>
              ))}</TableBody></Table>
          </Section>

          <Section title="Phase 4 correction preview (read-only — nothing is posted)" count={r.orphans.length + exceptions.filter((d) => d.c.kind === "advance_double").length} info>
            <p className="text-sm text-muted-foreground mb-2">Exact entries a future correction would need. Every one requires owner authorization; this preview never writes.</p>
            <Table><TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>Brand</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Expected accounting impact</TableHead><TableHead>Duplicate risk</TableHead></TableRow></TableHeader>
              <TableBody>
                {r.orphans.map((o) => (
                  <TableRow key={o.id}><TableCell className="font-mono text-xs" title={o.id}>txn {short(o.id)} → {o.reference_type} {short(o.reference_id)}</TableCell><TableCell>{o.brand}</TableCell>
                    <TableCell className="text-right">{fmtBdt(o.amount)}</TableCell>
                    <TableCell className="text-xs">Void the orphan expense row: Income/Expense, P&amp;L other expense and import cost drop by {fmtBdt(o.amount)}; stored wallet balance and Balance Sheet unchanged.</TableCell>
                    <TableCell className="text-xs">Low — no matching payment or journal exists anymore.</TableCell></TableRow>
                ))}
                {exceptions.filter((d) => d.c.kind === "advance_double").map((d) => (
                  <TableRow key={d.id}><TableCell className="font-mono text-xs">{d.invoice_no}</TableCell><TableCell>{d.brand}</TableCell>
                    <TableCell className="text-right">{fmtBdt((d.posted ?? 0) + (d.advance_posted ?? 0) - d.total)}</TableCell>
                    <TableCell className="text-xs">Correcting entry for the excess income of {fmtBdt((d.posted ?? 0) + (d.advance_posted ?? 0) - d.total)} (delivery {fmtBdt(d.posted ?? 0)} + advance {fmtBdt(d.advance_posted ?? 0)} &gt; total {fmtBdt(d.total)}).</TableCell>
                    <TableCell className="text-xs">Check the courier payout first — if the courier actually remitted the excess, record it as other income instead.</TableCell></TableRow>
                ))}
              </TableBody></Table>
          </Section>

          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Acceptance checklist (Phase 1)</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              {["Page is read-only: no buttons change data", "Every exception shows ID, brand, amount, root cause and suggestion", "Wallet drift explained or flagged for manual review", "Delivered orders checked against settlement, advance, courier and reconciliation records before being called unposted", "Brand filter scopes orders and transactions; shared wallets always shown", "Period filter applies to transaction date and delivered date", "Only owner/admin/accountant can open it"].map((x) => <div key={x} className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-success shrink-0" />{x}</div>)}
              <p className="text-xs text-muted-foreground pt-1">Generated {new Date(r.generated_at).toLocaleString()}</p>
            </CardContent></Card>
        </>
      )}
    </div>
  );
}

function Section({ title, count, info, children }: { title: string; count: number; info?: boolean; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2">{info ? <Info className="h-4 w-4 text-muted-foreground" /> : count ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-success" />}{title}<Badge variant="secondary">{count}</Badge></CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">{count ? children : <p className="text-sm text-muted-foreground">Nothing found.</p>}</CardContent>
    </Card>
  );
}
