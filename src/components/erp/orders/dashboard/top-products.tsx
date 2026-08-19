import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ImageIcon, LayoutGrid, List, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrderDashboardSummary } from "@/lib/erp/orders-dashboard.functions";
import { money } from "./dashboard-kpis";

type Row = OrderDashboardSummary["products"][number];

const MEDALS = ["from-amber-400/90 to-yellow-600/90", "from-slate-300/90 to-slate-500/90", "from-orange-400/90 to-amber-700/90"];

function Thumb({ src, name, className }: { src?: string | null; name?: string | null; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return (
      <img
        src={src}
        alt={name ?? "product"}
        loading="lazy"
        onError={() => setBroken(true)}
        className={cn("h-full w-full object-cover transition-transform duration-500 group-hover:scale-110", className)}
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/40 text-muted-foreground">
      <ImageIcon className="h-5 w-5" />
    </div>
  );
}

export function TopProducts({ products }: { products: Row[] }) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const rows = useMemo(() => products.slice().sort((a, b) => b.qty - a.qty), [products]);
  if (!rows.length) return null;

  const maxQty = Math.max(...rows.map((r) => r.qty || 0), 1);
  const totalValue = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);

  return (
    <Card className="lg:col-span-2 overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4 text-primary" />
            Top products
          </CardTitle>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {rows.length} products · {money(totalValue)} মোট বিক্রি
          </p>
        </div>
        <div className="flex items-center rounded-lg border bg-muted/40 p-0.5">
          <Button
            size="sm"
            variant={view === "grid" ? "secondary" : "ghost"}
            className="h-7 w-7 p-0"
            onClick={() => setView("grid")}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant={view === "list" ? "secondary" : "ghost"}
            className="h-7 w-7 p-0"
            onClick={() => setView("list")}
            aria-label="List view"
          >
            <List className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {view === "grid" ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((p, i) => {
              const dr = p.qty ? ((p.delivered_qty ?? 0) / p.qty) * 100 : 0;
              return (
                <div
                  key={`${p.name}-${i}`}
                  className="group relative flex gap-3 overflow-hidden rounded-xl border bg-card p-2.5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
                >
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-muted">
                    <Thumb src={p.image} name={p.name} />
                    <span
                      className={cn(
                        "absolute left-1 top-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm",
                        i < 3 ? `bg-gradient-to-br ${MEDALS[i]}` : "bg-foreground/70",
                      )}
                    >
                      #{i + 1}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13px] font-medium leading-snug" title={p.name ?? ""}>
                      {p.name ?? "—"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <Badge variant="secondary" className="h-5 px-1.5 font-semibold tabular-nums">
                        {p.qty} pcs
                      </Badge>
                      {p.orders != null && (
                        <span className="text-muted-foreground tabular-nums">{p.orders} orders</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-semibold tabular-nums">{money(p.value)}</p>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-primary/50"
                        style={{ width: `${Math.max(4, (p.qty / maxQty) * 100)}%` }}
                      />
                    </div>
                    {p.delivered_qty != null && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Delivered{" "}
                        <span className="font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {dr.toFixed(0)}%
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="max-h-[320px] overflow-auto">
            <table className="w-full text-sm">
              <tbody>
                {rows.map((p, i) => {
                  const dr = p.qty ? ((p.delivered_qty ?? 0) / p.qty) * 100 : 0;
                  return (
                    <tr key={`${p.name}-${i}`} className="group border-b last:border-0">
                      <td className="w-8 py-2 text-[11px] font-semibold text-muted-foreground tabular-nums">#{i + 1}</td>
                      <td className="w-12 py-2">
                        <div className="h-10 w-10 overflow-hidden rounded-md border bg-muted">
                          <Thumb src={p.image} name={p.name} />
                        </div>
                      </td>
                      <td className="max-w-[260px] py-2 pr-2">
                        <p className="truncate text-[13px] font-medium" title={p.name ?? ""}>
                          {p.name ?? "—"}
                        </p>
                        <div className="mt-1 h-1 w-full max-w-[180px] overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary/70"
                            style={{ width: `${Math.max(4, (p.qty / maxQty) * 100)}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-2 text-right text-[12px] tabular-nums">{p.qty} pcs</td>
                      <td className="py-2 text-right text-[12px] tabular-nums text-emerald-600 dark:text-emerald-400">
                        {p.delivered_qty != null ? `${dr.toFixed(0)}%` : "—"}
                      </td>
                      <td className="py-2 text-right text-[12px] font-medium tabular-nums">{money(p.value)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
