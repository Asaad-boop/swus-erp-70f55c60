import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useEffect } from "react";
import { AlertCircle, Copy, Check, X, Clock, Package } from "lucide-react";
import { toast } from "sonner";
import { useBrand } from "@/contexts/brand-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { BrandBadge } from "@/components/erp/brand-badge";
import { fmtBdt } from "@/lib/erp/finance";
import { cn } from "@/lib/utils";
import {
  getOutstandingCod, waiveOrders,
} from "@/lib/erp/reconciliation-queue.functions";

export const Route = createFileRoute("/_authenticated/erp/reconciliation/outstanding")({
  head: () => ({ meta: [{ title: "Outstanding COD — Reconciliation" }] }),
  component: OutstandingPage,
});

function OutstandingPage() {
  const { brandIds, isLoading: brandLoading } = useBrand();
  const qc = useQueryClient();
  const fn = useServerFn(getOutstandingCod);
  const waiveFn = useServerFn(waiveOrders);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const queries = useQueries({
    queries: brandIds.map((bid) => ({
      queryKey: ["outstanding-cod", bid],
      queryFn: () => fn({ data: { brandId: bid, thresholdDays: 14 } }),
      enabled: !!bid,
    })),
  });
  const isLoading = queries.some((q) => q.isLoading);
  const rows = useMemo(() => {
    const all: Array<Record<string, unknown>> = [];
    for (const q of queries) if (q.data?.orders) all.push(...q.data.orders);
    all.sort((a, b) => Number(b.days_overdue ?? 0) - Number(a.days_overdue ?? 0));
    return all;
  }, [queries]);

  const totals = useMemo(() => {
    let amount = 0, critical = 0;
    for (const o of rows) {
      amount += Number(o.total ?? 0);
      if (Number(o.days_since_delivery ?? 0) >= 30) critical += 1;
    }
    return { amount, count: rows.length, critical };
  }, [rows]);

  // Drop selections that are no longer in the list (post-refetch) so bulk
  // actions can never hit a stale order id.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(rows.map((o) => String(o.id)));
      const next = new Set(Array.from(prev).filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const selectedAmount = useMemo(
    () => rows.filter((o) => selected.has(String(o.id))).reduce((s, o) => s + Number(o.total ?? 0), 0),
    [rows, selected],
  );

  const waive = useMutation({
    mutationFn: () => waiveFn({ data: { orderIds: Array.from(selected), brandIds } }),
    onSuccess: (res) => {
      toast.success(`${res.count} ta order waive kora hoyeche`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["outstanding-cod"] });
      qc.invalidateQueries({ queryKey: ["pending-cod"] });
      qc.invalidateQueries({ queryKey: ["reconciliation-dashboard"] });
      qc.invalidateQueries({ queryKey: ["reconciliation-stats"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const copyConsignments = () => {
    const ids = rows
      .filter((o) => selected.has(String(o.id)))
      .map((o) => String(o.tracking_number ?? "").trim())
      .filter(Boolean);
    if (!ids.length) return toast.error("Selected orders e consignment ID nei");
    navigator.clipboard.writeText(ids.join("\n"));
    toast.success(`${ids.length} ta consignment ID copy hoyeche`);
  };

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((o) => String(o.id))));
  };

  const showBrand = brandIds.length > 1;
  const colSpan = showBrand ? 7 : 6;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl animate-in fade-in duration-300">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Outstanding COD (14+ days)</h1>
        <p className="text-sm text-muted-foreground">
          Pathao theke COD ekhono ase nai, delivered 14 dinerou beshi hoye geche.
        </p>
      </header>

      {brandIds.length === 0 && !brandLoading && (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No active brands.</CardContent></Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi title="Outstanding amount" value={fmtBdt(totals.amount)} icon={<AlertCircle className="h-4 w-4" />} loading={isLoading} tone="bad" />
        <Kpi title="Outstanding orders" value={String(totals.count)} icon={<Package className="h-4 w-4" />} loading={isLoading} tone="bad" />
        <Kpi title="Critical (30d+ delivered)" value={String(totals.critical)} sub="orders" icon={<Clock className="h-4 w-4" />} loading={isLoading} tone={totals.critical > 0 ? "bad" : undefined} />
        <Kpi title="Selected" value={String(selected.size)} sub="ready to action" icon={<Check className="h-4 w-4" />} />
      </div>

      {selected.size > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 p-3 bg-card/95 backdrop-blur rounded-lg border shadow-sm animate-in slide-in-from-top-2 duration-200">
          <span className="text-sm font-medium">
            {selected.size} selected · <span className="tabular-nums">{fmtBdt(selectedAmount)}</span>
          </span>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={copyConsignments}>
              <Copy className="h-4 w-4 mr-1" /> Copy Consignment IDs
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" disabled={waive.isPending}>
                  <X className="h-4 w-4 mr-1" /> Mark as Waived
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Waive {selected.size} order?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {fmtBdt(selectedAmount)} COD write-off hishebe mark hobe ar pending queue theke sore jabe.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => waive.mutate()}>Waive</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="max-h-[65vh] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_0_hsl(0_0%_0%/0.06)]">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">
                  <Checkbox
                    checked={rows.length > 0 && selected.size === rows.length}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Order</TableHead>
                {showBrand && <TableHead>Brand</TableHead>}
                <TableHead>Delivered</TableHead>
                <TableHead className="text-right">Days Overdue</TableHead>
                <TableHead className="text-right">COD Amount</TableHead>
                <TableHead>Consignment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {Array.from({ length: colSpan }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={colSpan} className="text-center text-muted-foreground py-12"><Check className="h-5 w-5 inline mr-1 text-emerald-600" /> Kono outstanding nei — shob COD collect hoye geche.</TableCell></TableRow>
              )}
              {rows.map((o) => {
                const id = String(o.id);
                const days = Number(o.days_overdue ?? 0);
                const sinceDelivery = Number(o.days_since_delivery ?? 0);
                const critical = sinceDelivery >= 30;
                const isSel = selected.has(id);
                return (
                  <TableRow
                    key={id}
                    className={cn(
                      "transition-colors",
                      critical && "bg-red-500/5",
                      isSel && "bg-primary/5",
                    )}
                  >
                    <TableCell>
                      <Checkbox
                        checked={isSel}
                        aria-label="Select order"
                        onCheckedChange={(c) => {
                          const next = new Set(selected);
                          if (c) next.add(id); else next.delete(id);
                          setSelected(next);
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <Link
                        to="/erp/orders/$orderId"
                        params={{ orderId: id }}
                        className="text-primary hover:underline"
                      >
                        {id.slice(0, 8)}
                      </Link>
                    </TableCell>
                    {showBrand && (
                      <TableCell><BrandBadge brandId={String(o.brand_id ?? "")} variant="compact" /></TableCell>
                    )}
                    <TableCell className="text-xs text-muted-foreground">
                      {o.delivered_at ? new Date(String(o.delivered_at)).toLocaleDateString() : "—"}
                      <div className="text-[10px]">{sinceDelivery}d ago</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={critical ? "destructive" : "secondary"} className="tabular-nums">+{days}d</Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmtBdt(Number(o.total ?? 0))}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{String(o.tracking_number ?? "—")}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  title, value, sub, icon, loading, tone,
}: {
  title: string; value: string; sub?: string; icon: React.ReactNode; loading?: boolean;
  tone?: "good" | "warn" | "bad";
}) {
  const toneCard = tone === "warn" ? "border-amber-500/40 bg-amber-500/5"
    : tone === "good" ? "border-emerald-500/30"
    : tone === "bad" ? "border-red-500/40 bg-red-500/5"
    : "";
  const toneText = tone === "warn" ? "text-amber-700 dark:text-amber-300"
    : tone === "good" ? "text-emerald-700 dark:text-emerald-300"
    : tone === "bad" ? "text-red-700 dark:text-red-300"
    : "";
  return (
    <Card className={toneCard}>
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{title}</div>
          <span className={cn("text-muted-foreground", toneText)}>{icon}</span>
        </div>
        <div className={cn("text-xl font-bold tabular-nums", toneText)}>{loading ? "…" : value}</div>
        {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}