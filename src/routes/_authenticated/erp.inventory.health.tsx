import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useBrand } from "@/contexts/brand-context";
import { getStockHealth, takeStockSnapshot } from "@/lib/erp/inventory/health.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Activity, AlertTriangle, ArrowLeft, Camera, CheckCircle2, Layers,
  PackageSearch, Scale, ShieldAlert, Wallet,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/erp/inventory/health")({
  head: () => ({
    meta: [
      { title: "Stock Health — Inventory" },
      { name: "description", content: "Inventory integrity dashboard — reservation, ledger, cost drift ও low stock এক জায়গায়।" },
      { property: "og:title", content: "Stock Health — Inventory" },
      { property: "og:description", content: "Inventory integrity dashboard — drift checks, low stock, snapshots।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StockHealthPage,
});

const fmtNum = (n: number) => new Intl.NumberFormat("en-BD").format(n);
const fmtMoney = (n: number) =>
  `৳${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(n)}`;

function StockHealthPage() {
  const { activeBrand, isAllBrands } = useBrand();
  const brandId = isAllBrands ? undefined : activeBrand?.id;
  const qc = useQueryClient();
  const fetchHealth = useServerFn(getStockHealth);
  const snapFn = useServerFn(takeStockSnapshot);

  const q = useQuery({
    queryKey: ["stock-health", brandId ?? "all"],
    queryFn: () => fetchHealth({ data: { brandId } } as any),
  });

  const snap = useMutation({
    mutationFn: () => snapFn({ data: {} } as any),
    onSuccess: () => {
      toast.success("Snapshot নেওয়া হয়েছে");
      qc.invalidateQueries({ queryKey: ["stock-health"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Snapshot ব্যর্থ"),
  });

  const d = q.data;
  const counts = {
    reservation: d?.reservationDrift.length ?? 0,
    ledger: d?.ledgerDrift.length ?? 0,
    cost: d?.costDrift.length ?? 0,
    missingCost: d?.missingCost.length ?? 0,
    lowStock: d?.lowStock.length ?? 0,
    oversold: d?.oversold.length ?? 0,
  };
  const healthy = counts.reservation + counts.ledger + counts.cost === 0;
  const latestSnap = d?.snapshots?.[0];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link to="/erp/inventory" className="inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> Inventory
            </Link>
            <span>/</span><span>Stock Health</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" /> Stock Health
          </h1>
          <p className="text-sm text-muted-foreground">
            Ledger = source of truth · Stock = projection · Reserved = calculated — সব drift check এক জায়গায়।
          </p>
        </div>
        <div className="flex items-center gap-2">
          {latestSnap && (
            <span className="text-xs text-muted-foreground">
              Last snapshot: {new Date(latestSnap.created_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}
              {latestSnap.row_count != null && ` · ${latestSnap.row_count} rows`}
            </span>
          )}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => snap.mutate()} disabled={snap.isPending}>
            <Camera className="h-4 w-4" /> {snap.isPending ? "Snapshot হচ্ছে…" : "Take Snapshot"}
          </Button>
        </div>
      </header>

      {/* Status banner */}
      {!q.isLoading && (
        <div className={`rounded-xl border px-4 py-3 text-sm flex items-center gap-2 ${
          healthy
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        }`}>
          {healthy ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {healthy
            ? "সব integrity check pass — reservation, ledger ও cost drift শূন্য।"
            : "কিছু drift পাওয়া গেছে — নিচের সেকশনগুলো দেখুন।"}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi icon={<Scale className="h-4 w-4" />} label="Reservation Drift" value={counts.reservation} danger={counts.reservation > 0} loading={q.isLoading} />
        <Kpi icon={<Layers className="h-4 w-4" />} label="Ledger Drift" value={counts.ledger} danger={counts.ledger > 0} loading={q.isLoading} />
        <Kpi icon={<Wallet className="h-4 w-4" />} label="Cost Drift" value={counts.cost} danger={counts.cost > 0} loading={q.isLoading} />
        <Kpi icon={<PackageSearch className="h-4 w-4" />} label="Missing Cost" value={counts.missingCost} danger={counts.missingCost > 0} loading={q.isLoading} />
        <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="Low Stock" value={counts.lowStock} danger={false} loading={q.isLoading} />
        <Kpi icon={<ShieldAlert className="h-4 w-4" />} label="Oversold" value={counts.oversold} danger={counts.oversold > 0} loading={q.isLoading} />
      </div>

      {/* Drift sections */}
      <DriftCard
        title="Reservation Drift"
        desc="Stored reserved_stock ≠ calculated (open orders + QC hold)"
        rows={d?.reservationDrift ?? []}
        empty="Reservation সব জায়গায় calculated value-র সাথে মিলে গেছে"
        head={["SKU", "Product", "Stored", "Expected", "Drift"]}
        render={(r: any) => [
          r.sku ?? "—",
          r.title ?? "—",
          fmtNum(r.stored_reserved),
          fmtNum(r.expected_reserved),
          <DriftBadge n={r.drift} />,
        ]}
      />
      <DriftCard
        title="Ledger Drift"
        desc="Stored stock ≠ stock_movements ledger sum"
        rows={d?.ledgerDrift ?? []}
        empty="Stock সব SKU-তে ledger-এর সাথে মিলে গেছে"
        head={["Level", "SKU", "Name", "Stock", "Ledger", "Drift"]}
        render={(r: any) => [
          r.entity ?? "—",
          r.sku ?? "—",
          r.label ?? "—",
          fmtNum(r.stock),
          fmtNum(Number(r.ledger_qty)),
          <DriftBadge n={Number(r.drift)} />,
        ]}
      />
      <DriftCard
        title="Cost Drift"
        desc="Stored WAC ≠ ledger-calculated WAC"
        rows={d?.costDrift ?? []}
        empty="WAC সব জায়গায় ledger-এর সাথে মিলে গেছে"
        head={["SKU", "Product", "Stored WAC", "Calculated", "Diff"]}
        render={(r: any) => [
          r.sku ?? "—",
          r.title ?? "—",
          fmtMoney(Number(r.stored)),
          fmtMoney(Number(r.calculated)),
          <DriftBadge n={Number(r.diff)} money />,
        ]}
      />
      <DriftCard
        title="Missing Cost"
        desc="Cost basis নেই — profit report ভুল আসবে। Inventory → Edit থেকে cost বসান।"
        rows={d?.missingCost ?? []}
        empty="সব stock-থাকা item-এ cost আছে"
        head={["SKU", "Product", "Variant", "Stock", "WAC"]}
        render={(r: any) => [
          r.sku ?? "—",
          r.title ?? "—",
          r.variant_label ?? "—",
          fmtNum(r.stock),
          fmtMoney(Number(r.wac ?? 0)),
        ]}
      />
      <DriftCard
        title="Oversold"
        desc="available_stock < 0 — reserved বেশি, physical stock কম"
        rows={d?.oversold ?? []}
        empty="কোনো product oversold নয়"
        head={["SKU", "Product", "Stock", "Reserved", "Available"]}
        render={(r: any) => [
          r.sku ?? "—",
          r.title ?? "—",
          fmtNum(r.stock),
          fmtNum(r.reserved_stock ?? 0),
          <span className="text-destructive font-semibold">{fmtNum(r.available_stock)}</span>,
        ]}
      />
      <DriftCard
        title="Low Stock"
        desc="available_stock ≤ reorder point (canonical rule)"
        rows={d?.lowStock ?? []}
        empty="সব product reorder point-এর উপরে"
        head={["SKU", "Product", "Variant", "Available", "Threshold"]}
        render={(r: any) => [
          r.sku ?? "—",
          r.product_name ?? "—",
          r.variant_name ?? "—",
          fmtNum(r.available_stock),
          fmtNum(r.effective_threshold),
        ]}
      />
    </div>
  );
}

function Kpi({ icon, label, value, danger, loading }: {
  icon: React.ReactNode; label: string; value: number; danger: boolean; loading: boolean;
}) {
  return (
    <Card className={danger && !loading ? "border-destructive/40" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          {icon}{label}
        </div>
        <div className={`mt-1.5 text-2xl font-semibold tabular-nums ${danger && !loading ? "text-destructive" : ""}`}>
          {loading ? "…" : fmtNum(value)}
        </div>
      </CardContent>
    </Card>
  );
}

function DriftBadge({ n, money }: { n: number; money?: boolean }) {
  const v = money ? fmtMoney(Math.abs(n)) : fmtNum(Math.abs(n));
  if (n === 0) return <Badge variant="outline">0</Badge>;
  return (
    <Badge variant="destructive" className="tabular-nums">
      {n > 0 ? "+" : "−"}{v}
    </Badge>
  );
}

function DriftCard({ title, desc, rows, empty, head, render }: {
  title: string;
  desc: string;
  rows: any[];
  empty: string;
  head: string[];
  render: (r: any) => React.ReactNode[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {title}
          {rows.length > 0
            ? <Badge variant="destructive">{rows.length}</Badge>
            : <Badge variant="outline" className="text-emerald-600 border-emerald-500/40">OK</Badge>}
        </CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> {empty}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>{head.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 50).map((r, i) => (
                  <TableRow key={r.product_id ?? r.id ?? i}>
                    {render(r).map((c, j) => <TableCell key={j} className="text-sm">{c}</TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length > 50 && (
              <p className="text-xs text-muted-foreground mt-2">+{rows.length - 50} more rows</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
