import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  ArrowLeft, ClipboardCheck, Search, CheckCircle2, XCircle,
  Plus, Trash2, Download, AlertTriangle, Filter,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { exportToXlsx } from "@/lib/erp/utils/excel";
import { useBrand } from "@/contexts/brand-context";
import { ProductPicker, type PickedProduct } from "@/components/erp/imports/product-picker";
import { FinalizeChecklistDialog } from "@/components/erp/stocktake/finalize-checklist-dialog";
import {
  getStocktakeDetail,
  updateStocktakeCount,
  deleteStocktakeItem,
  finalizeStocktake,
  cancelStocktake,
  addStocktakeItem,
} from "@/lib/erp/stocktake/stocktake.functions";

export const Route = createFileRoute("/_authenticated/erp/stocktake/$sessionId")({
  head: () => ({ meta: [{ title: "Stocktake Sheet — ERP" }] }),
  component: StocktakeDetailPage,
});

const fmtBdt = (n: number) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(n || 0);

function StocktakeDetailPage() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { brands } = useBrand();

  const getFn = useServerFn(getStocktakeDetail);
  const updateFn = useServerFn(updateStocktakeCount);
  const deleteFn = useServerFn(deleteStocktakeItem);
  const finalizeFn = useServerFn(finalizeStocktake);
  const cancelFn = useServerFn(cancelStocktake);
  const addFn = useServerFn(addStocktakeItem);

  const { data, isLoading } = useQuery({
    queryKey: ["stocktake-detail", sessionId],
    queryFn: () => getFn({ data: { sessionId } }),
  });

  const session = (data as any)?.session;
  const items: any[] = (data as any)?.items ?? [];
  const isOpen = session?.status === "open";
  const brandName = brands.find((b) => b.id === session?.brand_id)?.name ?? "—";

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "uncounted" | "variance">("all");
  const [pendingCounts, setPendingCounts] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      if (needle) {
        const title = (it.product?.title ?? "").toLowerCase();
        const sku = (it.product?.sku ?? "").toLowerCase();
        const vsku = (it.variant?.sku ?? "").toLowerCase();
        if (!title.includes(needle) && !sku.includes(needle) && !vsku.includes(needle)) return false;
      }
      if (filter === "uncounted" && it.counted_qty != null) return false;
      if (filter === "variance" && (it.counted_qty == null || it.variance === 0)) return false;
      return true;
    });
  }, [items, q, filter]);

  const stats = useMemo(() => {
    const counted = items.filter((i) => i.counted_qty != null).length;
    const variance = items.filter((i) => i.counted_qty != null && i.variance !== 0).length;
    const totalVarVal = items.reduce(
      (s, i) => s + (i.counted_qty != null ? Number(i.variance_value || 0) : 0),
      0,
    );
    return { total: items.length, counted, variance, totalVarVal, pct: items.length ? Math.round((counted / items.length) * 100) : 0 };
  }, [items]);

  const saveCount = useMutation({
    mutationFn: async ({ id, qty }: { id: string; qty: number | null }) =>
      updateFn({ data: { item_id: id, counted_qty: qty } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stocktake-detail", sessionId] }),
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { item_id: id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stocktake-detail", sessionId] }),
  });

  const finalizeMut = useMutation({
    mutationFn: () => finalizeFn({ data: { session_id: sessionId } }),
    onSuccess: (r: any) => {
      toast.success(`Stocktake finalized · ${r.applied}/${r.total} adjusted`);
      if (r.skipped?.length) toast.warning(`${r.skipped.length} items skipped`);
      qc.invalidateQueries({ queryKey: ["stocktake-detail", sessionId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Finalize failed"),
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelFn({ data: { session_id: sessionId } }),
    onSuccess: () => {
      toast.success("Cancelled");
      qc.invalidateQueries({ queryKey: ["stocktake-detail", sessionId] });
    },
  });

  const handleCommit = (id: string, raw: string) => {
    const trimmed = raw.trim();
    const qty = trimmed === "" ? null : Number(trimmed);
    if (qty != null && (!Number.isFinite(qty) || qty < 0)) {
      toast.error("Invalid count");
      return;
    }
    setPendingCounts((p) => {
      const { [id]: _, ...rest } = p;
      return rest;
    });
    saveCount.mutate({ id, qty: qty == null ? null : Math.round(qty) });
  };

  const handleExport = () => {
    const rows = items.map((it) => ({
      Product: it.product?.title ?? "—",
      SKU: it.variant?.sku ?? it.product?.sku ?? "",
      Variant: it.variant?.title ?? "",
      "System Qty": it.system_qty,
      "Counted Qty": it.counted_qty ?? "",
      Variance: it.counted_qty != null ? it.variance : "",
      "Unit Cost": Number(it.unit_cost || 0),
      "Variance Value": it.counted_qty != null ? Number(it.variance_value || 0) : "",
      Notes: it.notes ?? "",
    }));
    exportToXlsx(rows, "Stocktake", `stocktake-${session?.name ?? sessionId}.xlsx`);
  };

  const [addPick, setAddPick] = useState<PickedProduct>({ id: null, title: "" });
  const addItemMut = useMutation({
    mutationFn: () =>
      addFn({ data: { session_id: sessionId, product_id: addPick.id! } }),
    onSuccess: () => {
      setAddPick({ id: null, title: "" });
      qc.invalidateQueries({ queryKey: ["stocktake-detail", sessionId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Add failed"),
  });

  if (isLoading) {
    return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  }
  if (!session) {
    return <div className="p-10 text-center text-muted-foreground">Session not found.</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <Link to="/erp/stocktake"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Back</Button></Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <ClipboardCheck className="h-6 w-6 text-primary" /> {session.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {brandName} · Started {new Date(session.started_at).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn(
            "border",
            session.status === "open" && "bg-amber-500/15 text-amber-700 border-amber-300",
            session.status === "completed" && "bg-emerald-500/15 text-emerald-700 border-emerald-300",
            session.status === "cancelled" && "bg-rose-500/15 text-rose-700 border-rose-300",
          )}>{session.status}</Badge>
          <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-1" />Export</Button>
          {isOpen && (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm"><XCircle className="h-4 w-4 mr-1" />Cancel</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel this stocktake?</AlertDialogTitle>
                    <AlertDialogDescription>No stock adjustments will be applied. This cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep open</AlertDialogCancel>
                    <AlertDialogAction onClick={() => cancelMut.mutate()}>Cancel session</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <FinalizeChecklistDialog
                items={items}
                stats={{ variance: stats.variance, totalVarVal: stats.totalVarVal }}
                isPending={finalizeMut.isPending}
                onFinalize={() => finalizeMut.mutate()}
              />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Items" value={String(stats.total)} />
        <Stat label="Counted" value={`${stats.counted} (${stats.pct}%)`} tone="text-primary" />
        <Stat label="Uncounted" value={String(stats.total - stats.counted)} tone="text-amber-600" />
        <Stat label="With Variance" value={String(stats.variance)} tone="text-rose-600" />
        <Stat label="Net Variance Value" value={fmtBdt(stats.totalVarVal)} tone={stats.totalVarVal < 0 ? "text-rose-600" : "text-emerald-600"} />
      </div>

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search by product or SKU…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
          <SelectTrigger className="w-44"><Filter className="h-3.5 w-3.5 mr-1" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Items</SelectItem>
            <SelectItem value="uncounted">Uncounted</SelectItem>
            <SelectItem value="variance">With Variance</SelectItem>
          </SelectContent>
        </Select>
        {isOpen && (
          <div className="flex items-center gap-2 ml-auto">
            <div className="w-72">
              <ProductPicker brandId={session.brand_id} value={addPick} onChange={setAddPick} />
            </div>
            <Button
              size="sm"
              disabled={!addPick.id || addItemMut.isPending}
              onClick={() => addItemMut.mutate()}
            >
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Variant</TableHead>
              <TableHead className="text-right">System</TableHead>
              <TableHead className="text-right w-32">Counted</TableHead>
              <TableHead className="text-right">Variance</TableHead>
              <TableHead className="text-right">Unit Cost</TableHead>
              <TableHead className="text-right">Variance Value</TableHead>
              {isOpen && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={isOpen ? 8 : 7} className="text-center py-10 text-muted-foreground">No items match.</TableCell></TableRow>
            ) : filtered.map((it) => {
              const pending = pendingCounts[it.id];
              const displayVal = pending ?? (it.counted_qty == null ? "" : String(it.counted_qty));
              const variance = it.counted_qty != null ? it.variance : null;
              const tone = variance == null ? "text-muted-foreground" : variance === 0 ? "text-emerald-600" : variance > 0 ? "text-emerald-700" : "text-rose-600";
              return (
                <TableRow key={it.id} className="hover:bg-muted/40">
                  <TableCell>
                    <div className="font-medium">{it.product?.title ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{it.product?.sku ?? ""}</div>
                  </TableCell>
                  <TableCell className="text-sm">{it.variant?.title ?? (it.variant?.sku ?? "—")}</TableCell>
                  <TableCell className="text-right tabular-nums">{it.system_qty}</TableCell>
                  <TableCell className="text-right">
                    {isOpen ? (
                      <Input
                        type="number"
                        className="h-8 w-24 text-right ml-auto"
                        value={displayVal}
                        onChange={(e) => setPendingCounts((p) => ({ ...p, [it.id]: e.target.value }))}
                        onBlur={(e) => {
                          if (pending !== undefined) handleCommit(it.id, e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                      />
                    ) : (
                      <span className="tabular-nums">{it.counted_qty ?? "—"}</span>
                    )}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums font-medium", tone)}>
                    {variance == null ? "—" : (variance > 0 ? `+${variance}` : variance)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{fmtBdt(Number(it.unit_cost || 0))}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", tone)}>
                    {variance == null ? "—" : fmtBdt(Number(it.variance_value || 0))}
                  </TableCell>
                  {isOpen && (
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => delMut.mutate(it.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {session.status === "completed" && (
        <Card className="p-4 flex items-center gap-3 text-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <div>
            Finalized on {session.completed_at ? new Date(session.completed_at).toLocaleString() : "—"} ·
            net variance <b className={stats.totalVarVal < 0 ? "text-rose-600" : "text-emerald-600"}>{fmtBdt(Number(session.total_variance_value || 0))}</b>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-bold tabular-nums mt-0.5", tone)}>{value}</div>
    </Card>
  );
}
