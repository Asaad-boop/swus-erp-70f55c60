import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Filter, Package, Wallet, AlertTriangle, TrendingUp, X, ArrowUpDown, Boxes, Trash2, Download, CheckSquare, Loader2 } from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { listPurchaseOrders, deleteImportPo } from "@/lib/erp/imports/imports.functions";
import { PO_STATUS_LABEL, fmtBdt, netDue, type ImpPoStatus } from "@/lib/erp/imports/types";
import { ProductThumbStack } from "./erp.imports.index";

export const Route = createFileRoute("/_authenticated/erp/imports/orders/")({
  head: () => ({ meta: [{ title: "Purchase Orders — Imports" }] }),
  component: PoListPage,
});

type SortKey = "date" | "total" | "due" | "status";

function PoListPage() {
  const { brandIds } = useBrand();
  const brandKey = brandIds.join(",");
  const [status, setStatus] = useState<string>("all");
  const [q, setQ] = useState("");
  const [payState, setPayState] = useState<"all" | "paid" | "partial" | "unpaid">("all");
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const qc = useQueryClient();
  const deleteFn = useServerFn(deleteImportPo);
  const bulkDeleteMut = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await deleteFn({ data: { poId: id, confirm: "DELETE" } });
      }
    },
    onSuccess: () => {
      toast.success(`Deleted ${selected.size} POs; transactions reversed`);
      qc.invalidateQueries({ queryKey: ["imp-pos"] });
      setSelected(new Set());
      setDeleteOpen(false);
      setDeleteConfirm("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Brand switch korle purono selection carry kora ucit na
  useEffect(() => { setSelected(new Set()); }, [brandKey]);

  const listFn = useServerFn(listPurchaseOrders);
  const { data = [], isLoading } = useQuery({
    queryKey: ["imp-pos", brandKey, status],
    enabled: brandIds.length > 0,
    queryFn: () => listFn({ data: { brandIds, status } }),
  });

  const rows = data as any[];

  // KPIs on the unfiltered list (so users always see the full picture)
  const kpis = useMemo(() => {
    const totalSpend = rows.reduce((s, p) => s + Number(p.grand_total_bdt || 0), 0);
    const totalPaid = rows.reduce((s, p) => s + Number(p.paid_bdt || 0), 0);
    const totalDue = rows.reduce((s, p) => s + netDue(p.due_bdt), 0);
    const active = rows.filter((p) => !["completed", "cancelled"].includes(p.status)).length;
    const overdue = rows.filter((p) => Number(p.due_bdt || 0) > 0 && p.status === "completed").length;
    return { totalSpend, totalPaid, totalDue, active, overdue, count: rows.length };
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter((p) => {
      if (needle && !(
        p.po_number?.toLowerCase().includes(needle) ||
        p.supplier?.name?.toLowerCase().includes(needle) ||
        p.agent?.name?.toLowerCase().includes(needle)
      )) return false;
      const total = Number(p.grand_total_bdt || 0);
      const paid = Number(p.paid_bdt || 0);
      if (payState === "paid" && (total === 0 || netDue(total - paid) > 0)) return false;
      if (payState === "partial" && (paid === 0 || paid >= total)) return false;
      if (payState === "unpaid" && paid > 0) return false;
      return true;
    });

    out = [...out].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortBy) {
        case "total": return dir * (Number(a.grand_total_bdt || 0) - Number(b.grand_total_bdt || 0));
        case "due":   return dir * (netDue(a.due_bdt) - netDue(b.due_bdt));
        case "status":return dir * String(a.status).localeCompare(String(b.status));
        default:      return dir * String(a.order_date || "").localeCompare(String(b.order_date || ""));
      }
    });
    return out;
  }, [rows, q, payState, sortBy, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortBy === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(k); setSortDir("desc"); }
  };

  const clearFilters = () => { setQ(""); setStatus("all"); setPayState("all"); };
  const hasFilters = q.trim() || status !== "all" || payState !== "all";

  const toggleRow = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleAll = () => {
    setSelected((s) => {
      if (allSelected) {
        const n = new Set(s);
        filtered.forEach((r) => n.delete(r.id));
        return n;
      }
      const n = new Set(s);
      filtered.forEach((r) => n.add(r.id));
      return n;
    });
  };

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const selectedTotals = selectedRows.reduce(
    (a, r) => ({
      total: a.total + Number(r.grand_total_bdt || 0),
      paid: a.paid + Number(r.paid_bdt || 0),
      due: a.due + netDue(r.due_bdt),
    }),
    { total: 0, paid: 0, due: 0 },
  );

  const exportSelected = () => {
    const header = ["PO Number", "Date", "Brand", "Supplier", "Agent", "Status", "Total", "Paid", "Due"];
    const lines = [header.join(",")];
    for (const r of selectedRows) {
      lines.push([
        r.po_number,
        r.order_date ?? "",
        r.brand?.name ?? "",
        (r.supplier?.name ?? "").replace(/,/g, " "),
        (r.agent?.name ?? "").replace(/,/g, " "),
        r.status,
        r.grand_total_bdt ?? 0,
        r.paid_bdt ?? 0,
        r.due_bdt ?? 0,
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchase-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Package className="h-5 w-5 text-primary" />Purchase Orders</h2>
          <p className="text-sm text-muted-foreground">
            All brands · {filtered.length} of {(data as any[]).length} POs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/erp/imports/orders/new"><Button><Plus className="h-4 w-4 mr-1" />New PO</Button></Link>
        </div>
      </div>

      {/* KPI strip */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiTile label="Total Spend" value={fmtBdt(kpis.totalSpend)} icon={TrendingUp} tone="text-blue-600" />
          <KpiTile label="Paid" value={fmtBdt(kpis.totalPaid)} icon={Wallet} tone="text-emerald-600" />
          <KpiTile label="Outstanding" value={fmtBdt(kpis.totalDue)} icon={AlertTriangle} tone="text-orange-600" />
          <KpiTile label="Active POs" value={String(kpis.active)} icon={Boxes} tone="text-violet-600" />
          <KpiTile label="Total POs" value={String(kpis.count)} icon={Package} tone="text-slate-600" />
        </div>
      )}

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search PO number, supplier, agent…" className="pl-8" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[200px]"><Filter className="h-4 w-4 mr-1" /><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(PO_STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={payState} onValueChange={(v) => setPayState(v as any)}>
            <SelectTrigger className="w-[160px]"><Wallet className="h-4 w-4 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All payments</SelectItem>
              <SelectItem value="paid">Fully paid</SelectItem>
              <SelectItem value="partial">Partially paid</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-3.5 w-3.5 mr-1" />Clear
            </Button>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                  disabled={filtered.length === 0}
                />
              </TableHead>
              <TableHead>PO Number</TableHead>
              <TableHead>Products</TableHead>
              <TableHead>Brand</TableHead>
              <SortableHead label="Date" k="date" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
              <TableHead>Supplier / Agent</TableHead>
              <SortableHead label="Status" k="status" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
              <SortableHead label="Total" k="total" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} align="right" />
              <TableHead className="text-right min-w-[200px]">Payment</TableHead>
              <SortableHead label="Due" k="due" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} align="right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="py-16">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center"><Package className="h-6 w-6 text-muted-foreground" /></div>
                  <div>
                    <div className="font-semibold text-sm">{hasFilters ? "No POs match your filters" : "No purchase orders yet"}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{hasFilters ? "Try clearing filters" : "Create your first PO to get started"}</div>
                  </div>
                  {hasFilters ? (
                    <Button size="sm" variant="outline" onClick={clearFilters}><X className="h-3.5 w-3.5 mr-1" />Clear filters</Button>
                  ) : (
                    <Link to="/erp/imports/orders/new"><Button size="sm"><Plus className="h-3.5 w-3.5 mr-1" />New PO</Button></Link>
                  )}
                </div>
              </TableCell></TableRow>
            ) : (
              filtered.map((p: any) => {
                const total = Number(p.grand_total_bdt || 0);
                const paid = Number(p.paid_bdt || 0);
                const due = netDue(p.due_bdt);
                const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
                const supplier = p.supplier?.name ?? "—";
                const agentName = p.agent?.name ?? "No agent";
                const initials = (p.agent?.name ?? supplier).split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase() || "?";
                const isSel = selected.has(p.id);
                return (
                  <TableRow key={p.id} className={cn("hover:bg-accent/40", isSel && "bg-primary/5")}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={isSel} onCheckedChange={() => toggleRow(p.id)} aria-label={`Select ${p.po_number}`} />
                    </TableCell>
                    <TableCell>
                      <Link to="/erp/imports/orders/$orderId" params={{ orderId: p.id }} className="font-mono text-sm font-semibold text-primary hover:underline">
                        {p.po_number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-0">
                        <ProductThumbStack items={p.items ?? []} max={3} size="sm" />
                        <div className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                          {(p.items ?? []).length > 0
                            ? `${(p.items ?? []).length} · ${(p.items ?? []).reduce((s: number, i: any) => s + Number(i.quantity || 0), 0)}pcs`
                            : "—"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {p.brand?.name ? (
                        <Badge variant="outline" className="whitespace-nowrap">{p.brand.name}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{p.order_date}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-7 w-7 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center flex-shrink-0">{initials}</div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{agentName}</div>
                          <div className="text-[11px] text-muted-foreground truncate">{supplier}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={PO_STATUS_LABEL[p.status as ImpPoStatus]?.tone}>
                        {PO_STATUS_LABEL[p.status as ImpPoStatus]?.label ?? p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold whitespace-nowrap">{fmtBdt(total)}</TableCell>
                    <TableCell className="min-w-[200px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className={cn(
                            "h-full transition-all",
                            pct >= 100 ? "bg-emerald-500" : pct > 0 ? "bg-blue-500" : "bg-muted-foreground/20",
                          )} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={cn("text-xs tabular-nums w-10 text-right font-medium", pct >= 100 ? "text-emerald-600" : "text-muted-foreground")}>{pct}%</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">{fmtBdt(paid)} / {fmtBdt(total)}</div>
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums font-medium whitespace-nowrap", due > 0 ? "text-orange-600" : "text-muted-foreground")}>
                      {fmtBdt(due)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Floating bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-1 rounded-full border border-border bg-card shadow-2xl shadow-black/20 px-3 py-2 backdrop-blur">
            <div className="inline-flex items-center gap-2 pl-1 pr-3 text-xs font-semibold">
              <CheckSquare className="h-4 w-4 text-primary" />
              <span className="tabular-nums">{selected.size}</span> selected
              <span className="text-muted-foreground font-normal ml-1">
                · {fmtBdt(selectedTotals.total)} total · <span className="text-orange-600">{fmtBdt(selectedTotals.due)} due</span>
              </span>
            </div>
            <span className="h-5 w-px bg-border" />
            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={exportSelected}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
            <span className="h-5 w-px bg-border" />
            <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-muted-foreground" onClick={() => setSelected(new Set())}>
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        </div>
      )}

      <Dialog open={deleteOpen} onOpenChange={(v) => { setDeleteOpen(v); if (!v) setDeleteConfirm(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete {selected.size} Purchase Orders?</DialogTitle>
            <DialogDescription>
              This permanently deletes <b>{selected.size}</b> POs, all their cartons & items,
              reverses every recorded payment (wallet balances restored, journal entries removed),
              and rolls back any stock that was posted to inventory. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Type <code className="font-mono font-bold text-foreground">DELETE</code> to confirm</label>
            <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="DELETE" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteConfirm !== "DELETE" || bulkDeleteMut.isPending}
              onClick={() => bulkDeleteMut.mutate(Array.from(selected))}
            >
              {bulkDeleteMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete {selected.size} forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiTile({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone: string }) {
  return (
    <Card className="p-3.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <Icon className={cn("h-3.5 w-3.5", tone)} />
      </div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </Card>
  );
}

function SortableHead({ label, k, sortBy, sortDir, onClick, align }: {
  label: string; k: SortKey; sortBy: SortKey; sortDir: "asc" | "desc"; onClick: (k: SortKey) => void; align?: "right";
}) {
  const active = sortBy === k;
  return (
    <TableHead className={cn(align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => onClick(k)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground transition-colors",
          active ? "text-foreground font-semibold" : "text-muted-foreground",
        )}
      >
        {label}
        <ArrowUpDown className={cn("h-3 w-3", active && "text-primary")} />
        {active && <span className="text-[10px] text-primary">{sortDir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </TableHead>
  );
}