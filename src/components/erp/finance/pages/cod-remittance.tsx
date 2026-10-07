import { dhakaToday } from "@/lib/erp/finance";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Truck, Plus, CheckCircle2, Clock, ShieldCheck, FileDown, Trash2, Pencil, Banknote, Upload, ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtBdt } from "@/lib/erp/finance";
import { exportToXlsx } from "@/lib/erp/utils/excel";
import { RemittanceForm, type RemittanceRow } from "@/components/erp/finance/remittance-form";
import { CodCollectionDialog } from "@/components/erp/finance/cod-collection-dialog";
import { SettlementUploadDialog } from "@/components/erp/finance/settlement-upload-dialog";
import { SettlementLinesDialog } from "@/components/erp/finance/settlement-lines-dialog";
import { cn } from "@/lib/utils";

type Wallet = { id: string; name: string; account_subtype: string | null; account_type: string | null; brand_id: string; current_balance: number };

const STATUS_META: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending:    { label: "Pending",    color: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",      icon: Clock },
  received:   { label: "Received",   color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", icon: CheckCircle2 },
  reconciled: { label: "Reconciled", color: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",            icon: ShieldCheck },
};

export function CodRemittancePage() {
  const { activeBrand, brandIds, isAllBrands } = useBrand();
  const brandId = activeBrand?.id ?? null;
  const qc = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RemittanceRow | null>(null);
  const [collectOpen, setCollectOpen] = useState(false);
  const [receiveFor, setReceiveFor] = useState<RemittanceRow | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [linesFor, setLinesFor] = useState<RemittanceRow | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "received" | "reconciled">("all");
  const [courierFilter, setCourierFilter] = useState<string>("all");

  const listQ = useQuery({
    queryKey: ["cod_remittances", brandIds.join(",")],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      const { data, error } = await applyBrandScope(
        supabase.from("erp_cod_remittances").select("*"),
        brandIds,
      ).order("remittance_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RemittanceRow[];
    },
  });

  const walletsQ = useQuery({
    queryKey: ["cod_remit_wallets", brandIds.join(",")],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      const { data, error } = await applyBrandScope(
        supabase.from("erp_accounts").select("id,name,account_subtype,account_type,brand_id,current_balance"),
        brandIds,
      ).eq("is_active", true).order("name");
      if (error) throw error;
      return (data ?? []) as Wallet[];
    },
  });

  const rows = listQ.data ?? [];
  const wallets = walletsQ.data ?? [];
  const walletMap = useMemo(() => new Map(wallets.map((w) => [w.id, w])), [wallets]);

  const couriers = useMemo(() => Array.from(new Set(rows.map((r) => r.courier))).sort(), [rows]);
  const filtered = useMemo(
    () => rows.filter((r) => (filter === "all" || r.status === filter) && (courierFilter === "all" || r.courier === courierFilter)),
    [rows, filter, courierFilter],
  );

  const totals = useMemo(() => {
    const t = { pending: 0, received: 0, reconciled: 0, count: rows.length };
    for (const r of rows) {
      if (r.status === "pending") t.pending += Number(r.amount || 0);
      else if (r.status === "received") t.received += Number(r.amount || 0);
      else if (r.status === "reconciled") t.reconciled += Number(r.amount || 0);
    }
    return t;
  }, [rows]);

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      // Reverse any wallet credit posted when the remittance was marked received.
      const { error: txErr } = await supabase
        .from("erp_transactions")
        .delete()
        .eq("reference_type", "cod_remittance")
        .eq("reference_id", id);
      if (txErr) throw txErr;
      const { error } = await supabase.from("erp_cod_remittances").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["cod_remittances"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["bd_wallets_widget"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reconcileMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_cod_remittances").update({ status: "reconciled" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked reconciled");
      qc.invalidateQueries({ queryKey: ["cod_remittances"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportXlsx() {
    const data = filtered.map((r) => ({
      Date: r.remittance_date,
      Courier: r.courier,
      Amount: Number(r.amount || 0),
      Expected: Number(r.expected_amount || 0),
      Variance: Number(r.amount || 0) - Number(r.expected_amount || 0),
      Reference: r.reference_no ?? "",
      Status: r.status,
      ReceivedDate: r.received_date ?? "",
      ReceivedTo: r.received_to ? (walletMap.get(r.received_to)?.name ?? "") : "",
      Notes: r.notes ?? "",
    }));
    exportToXlsx(data, "COD Remittances", `cod-remittances-${dhakaToday()}`);
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Truck className="h-6 w-6 text-orange-600" /> COD Remittance
          </h1>
          <p className="text-sm text-muted-foreground">
            Track courier COD payouts: pending → received → reconciled.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportXlsx} disabled={!filtered.length}>
            <FileDown className="h-4 w-4 mr-1.5" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCollectOpen(true)}>
            <Banknote className="h-4 w-4 mr-1.5" /> Record Collection
          </Button>
          <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-1.5" /> Upload Settlement CSV
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> New Remittance
          </Button>
        </div>
      </header>

      {/* Pipeline tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <PipelineTile label="Pending" value={totals.pending} color="text-amber-600" icon={Clock} />
        <PipelineTile label="Received" value={totals.received} color="text-emerald-600" icon={CheckCircle2} />
        <PipelineTile label="Reconciled" value={totals.reconciled} color="text-blue-600" icon={ShieldCheck} />
        <PipelineTile label="Records" value={totals.count} color="text-muted-foreground" icon={Truck} count />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1">
          {(["all", "pending", "received", "reconciled"] as const).map((f) => (
            <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)} className="capitalize">{f}</Button>
          ))}
        </div>
        <Select value={courierFilter} onValueChange={setCourierFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All couriers</SelectItem>
            {couriers.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {brandIds.length === 0 && <p className="text-sm text-muted-foreground">No brands available.</p>}
      {listQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!listQ.isLoading && filtered.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <Truck className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No remittances recorded yet.</p>
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4 mr-1.5" /> Add first remittance
            </Button>
          </CardContent>
        </Card>
      )}

      {filtered.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Courier</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Received to</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const meta = STATUS_META[r.status] ?? STATUS_META.pending;
                const Icon = meta.icon;
                const variance = Number(r.amount || 0) - Number(r.expected_amount || 0);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">{r.remittance_date}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{r.courier}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{fmtBdt(r.amount)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.expected_amount ? fmtBdt(r.expected_amount) : "—"}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", r.expected_amount == null ? "text-muted-foreground" : variance === 0 ? "text-muted-foreground" : variance > 0 ? "text-emerald-600" : "text-amber-600")}>
                      {r.expected_amount == null ? "—" : `${variance >= 0 ? "+" : ""}${fmtBdt(variance)}`}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{r.reference_no ?? "—"}</TableCell>
                    <TableCell>
                      <Badge className={cn("gap-1", meta.color)}><Icon className="h-3 w-3" />{meta.label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.received_to ? walletMap.get(r.received_to)?.name ?? "—" : "—"}
                      {r.received_date && <div className="text-muted-foreground">{r.received_date}</div>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setLinesFor(r)} title="View reconciliation lines">
                          <ListChecks className="h-3 w-3" />
                        </Button>
                        {r.status === "pending" && (
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setReceiveFor(r)}>
                            Mark received
                          </Button>
                        )}
                        {r.status === "received" && (
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => reconcileMut.mutate(r.id)}>
                            Reconcile
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditing(r); setFormOpen(true); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => { if (confirm("Delete this remittance?")) delMut.mutate(r.id); }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <RemittanceForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        brandId={isAllBrands ? null : brandId}
        brandIds={brandIds}
        editing={editing}
      />
      <CodCollectionDialog
        open={collectOpen}
        onClose={() => setCollectOpen(false)}
        brandId={isAllBrands ? null : brandId}
        brandIds={brandIds}
      />
      <ReceiveRemittanceDialog
        row={receiveFor}
        wallets={wallets}
        onClose={() => setReceiveFor(null)}
      />
      <SettlementUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        brandId={isAllBrands ? null : brandId}
        brandIds={brandIds}
      />
      <SettlementLinesDialog
        remittance={linesFor}
        onClose={() => setLinesFor(null)}
      />
    </div>
  );
}

function PipelineTile({ label, value, color, icon: Icon, count }: { label: string; value: number; color: string; icon: typeof Clock; count?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
          <Icon className={cn("h-4 w-4", color)} />
        </div>
        <div className={cn("text-xl font-bold tabular-nums mt-1", color)}>
          {count ? value : fmtBdt(value)}
        </div>
      </CardContent>
    </Card>
  );
}

function ReceiveRemittanceDialog({ row, wallets, onClose }: { row: RemittanceRow | null; wallets: Wallet[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [walletId, setWalletId] = useState<string>("");
  const [date, setDate] = useState<string>(() => dhakaToday());

  const brandWallets = wallets.filter((w) => !row || w.brand_id === row.brand_id);
  useEffect(() => {
    if (row && brandWallets.length) {
      const preferred = brandWallets.find((w) => (w.account_subtype ?? w.account_type) === "bank")
        ?? brandWallets.find((w) => (w.account_subtype ?? w.account_type) === "bkash")
        ?? brandWallets[0];
      setWalletId(preferred?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!row) return;
      if (!walletId) throw new Error("Choose wallet");
      // 1) Record income on wallet (this updates current_balance via existing trigger / app logic).
      const { error: txErr } = await supabase.from("erp_transactions").insert({
        brand_id: row.brand_id,
        txn_type: "income",
        account_id: walletId,
        amount: Number(row.amount),
        transaction_date: date,
        description: `COD remittance · ${row.courier}${row.reference_no ? ` · ${row.reference_no}` : ""}`,
        reference_type: "cod_remittance",
        reference_id: row.id,
      });
      if (txErr) throw txErr;
      // 2) Update remittance row
      const { error } = await supabase
        .from("erp_cod_remittances")
        .update({ status: "received", received_date: date, received_to: walletId })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Remittance received");
      qc.invalidateQueries({ queryKey: ["cod_remittances"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["bd_wallets_widget"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mark Remittance Received</DialogTitle>
        </DialogHeader>
        {row && (
          <div className="space-y-3 text-sm">
            <div className="rounded border p-3 bg-muted/40 text-xs space-y-0.5">
              <div><span className="text-muted-foreground">Courier:</span> <span className="capitalize font-medium">{row.courier}</span></div>
              <div><span className="text-muted-foreground">Date:</span> {row.remittance_date}</div>
              <div><span className="text-muted-foreground">Amount:</span> <span className="font-semibold">{fmtBdt(row.amount)}</span></div>
              {row.reference_no && <div><span className="text-muted-foreground">Ref:</span> <span className="font-mono">{row.reference_no}</span></div>}
            </div>
            <div>
              <Label>Received to wallet</Label>
              <Select value={walletId} onValueChange={setWalletId}>
                <SelectTrigger><SelectValue placeholder="Choose wallet" /></SelectTrigger>
                <SelectContent>
                  {brandWallets.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name} · {fmtBdt(w.current_balance)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Received date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !walletId}>
            {mut.isPending ? "Saving…" : "Confirm Received"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}