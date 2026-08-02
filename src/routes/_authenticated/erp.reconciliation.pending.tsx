import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useEffect } from "react";
import { Clock, Truck, Phone, Package, AlertCircle, Search, X } from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { BrandBadge } from "@/components/erp/brand-badge";
import { fmtBdt } from "@/lib/erp/finance";
import { cn } from "@/lib/utils";
import { getPendingCodQueue } from "@/lib/erp/reconciliation-queue.functions";

export const Route = createFileRoute("/_authenticated/erp/reconciliation/pending")({
  head: () => ({ meta: [{ title: "Pending COD — Reconciliation" }] }),
  component: PendingPage,
});

function PendingPage() {
  const { brandIds, brands, isLoading: brandLoading } = useBrand();
  const [courier, setCourier] = useState<string>("");
  const [debouncedCourier, setDebouncedCourier] = useState<string>("");
  const [q, setQ] = useState("");
  const fn = useServerFn(getPendingCodQueue);

  // Debounce the courier filter so every keystroke doesn't fire a server call.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedCourier(courier.trim()), 350);
    return () => clearTimeout(t);
  }, [courier]);

  const queries = useQueries({
    queries: brandIds.map((bid) => ({
      queryKey: ["pending-cod", bid, debouncedCourier],
      queryFn: () => fn({ data: { brandId: bid, courier: debouncedCourier || null } }),
      enabled: !!bid,
      placeholderData: (prev: unknown) => prev,
    })),
  });
  const isLoading = queries.some((q) => q.isLoading);
  const truncated = queries.some((q) => (q.data as { truncated?: boolean } | undefined)?.truncated);

  const allRows = useMemo(() => {
    const all: Array<Record<string, unknown>> = [];
    for (const q of queries) if (q.data?.orders) all.push(...q.data.orders);
    all.sort((a, b) => Number(b.days_pending ?? 0) - Number(a.days_pending ?? 0));
    return all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries.map((x) => x.dataUpdatedAt).join(",")]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return allRows;
    return allRows.filter((o) =>
      [o.shipping_name, o.shipping_phone, o.tracking_number, o.id]
        .map((v) => String(v ?? "").toLowerCase())
        .some((v) => v.includes(term)),
    );
  }, [allRows, q]);

  const totals = useMemo(() => {
    let count = 0, amount = 0, aged = 0;
    for (const o of rows) {
      count += 1;
      amount += Number(o.total ?? 0);
      if (Number(o.days_pending ?? 0) > 7) aged += 1;
    }
    return { count, amount, aged };
  }, [rows]);

  const showBrand = brandIds.length > 1;
  const colSpan = showBrand ? 8 : 7;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl animate-in fade-in duration-300">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pending COD Collection</h1>
          <p className="text-sm text-muted-foreground">
            Delivered orders jegula ekhono reconcile hoy nai. Oldest first.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <div className="relative w-full sm:w-56">
            <Truck className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Courier (e.g. pathao)"
              value={courier}
              onChange={(e) => setCourier(e.target.value)}
              className="h-9 pl-8"
            />
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Name, phone, consignment…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 pl-8 pr-8"
            />
            {q && (
              <Button
                variant="ghost" size="icon"
                className="absolute right-0.5 top-1/2 h-7 w-7 -translate-y-1/2"
                onClick={() => setQ("")}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {brandIds.length === 0 && !brandLoading && (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No active brands.</CardContent></Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi title="Pending orders" value={String(totals.count)} icon={<Clock className="h-4 w-4" />} loading={isLoading} tone="warn" />
        <Kpi title="Pending amount" value={fmtBdt(totals.amount)} icon={<Package className="h-4 w-4" />} loading={isLoading} tone="warn" />
        <Kpi title="Aged (>7d)" value={String(totals.aged)} sub="orders" icon={<AlertCircle className="h-4 w-4" />} loading={isLoading} tone={totals.aged > 0 ? "bad" : undefined} />
        <Kpi title="Brands" value={String(brandIds.length)} sub={brandIds.length === brands.length ? "all" : "scoped"} icon={<Truck className="h-4 w-4" />} />
      </div>

      {truncated && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Prothom 500 ta order dekhano hoyeche — courier ba search diye filter korun.
        </div>
      )}

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="max-h-[65vh] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow className="hover:bg-transparent">
                <TableHead>Order</TableHead>
                {showBrand && <TableHead>Brand</TableHead>}
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Delivered</TableHead>
                <TableHead className="text-right">COD</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead>Courier</TableHead>
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
                <TableRow><TableCell colSpan={colSpan} className="text-center text-muted-foreground py-12">
                  {q || courier ? "Ei filter e kono order nei." : "No pending orders 🎉"}
                </TableCell></TableRow>
              )}
              {rows.map((o) => {
                const days = Number(o.days_pending ?? 0);
                const aged = days > 7;
                return (
                  <TableRow key={String(o.id)} className={cn("transition-colors", aged && "bg-amber-500/5")}>
                    <TableCell className="font-mono text-xs">
                      <Link
                        to="/erp/orders/$orderId"
                        params={{ orderId: String(o.id) }}
                        className="text-primary hover:underline"
                      >
                        {String(o.id).slice(0, 8)}
                      </Link>
                    </TableCell>
                    {showBrand && (
                      <TableCell><BrandBadge brandId={String(o.brand_id ?? "")} variant="compact" /></TableCell>
                    )}
                    <TableCell>{String(o.shipping_name ?? "—")}</TableCell>
                    <TableCell className="text-xs">
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {String(o.shipping_phone ?? "—")}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {o.delivered_at ? new Date(String(o.delivered_at)).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmtBdt(Number(o.total ?? 0))}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={aged ? "destructive" : "secondary"}
                        className="tabular-nums"
                      >
                        {days}d
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="inline-flex items-center gap-1">
                        <Truck className="h-3 w-3" /> {String(o.courier_name ?? "—")}
                      </span>
                    </TableCell>
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