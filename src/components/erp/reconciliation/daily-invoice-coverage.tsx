import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, CloudDownload, Loader2, TriangleAlert, CircleDashed, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { fmtBdt } from "@/lib/erp/finance";
import { cn } from "@/lib/utils";

export type PathaoInvoiceLite = {
  id: string;
  date: string | null;
  invoiceNo: string | null;
  collected: number | null;
  fee: number | null;
  payout: number | null;
  orders: number | null;
  status: string | null;
};

type DayGroup = {
  date: string;
  invoices: PathaoInvoiceLite[];
  processed: number;
  collected: number;
  fee: number;
  payout: number;
  state: "complete" | "partial" | "extra" | "missing";
};

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const cur = new Date(fy, (fm ?? 1) - 1, fd ?? 1);
  const end = new Date(ty, (tm ?? 1) - 1, td ?? 1);
  let guard = 0;
  while (cur <= end && guard++ < 400) {
    out.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`,
    );
    cur.setDate(cur.getDate() + 1);
  }
  return out.reverse();
}

const n = (v: number | null | undefined) => Number(v ?? 0);

export function DailyInvoiceCoverage({
  invoices,
  from,
  to,
  appliedInvoiceIds,
  activeInvoiceId,
  loadingInvoiceId,
  onLoad,
  onClose,
}: {
  invoices: PathaoInvoiceLite[];
  from: string;
  to: string;
  appliedInvoiceIds: Set<string>;
  activeInvoiceId: string | null;
  loadingInvoiceId: string | null;
  onLoad: (inv: PathaoInvoiceLite) => void;
  onClose: () => void;
}) {
  const [expectedPerDay, setExpectedPerDay] = useState(3);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const days = useMemo<DayGroup[]>(() => {
    const map = new Map<string, PathaoInvoiceLite[]>();
    for (const inv of invoices) {
      const d = inv.date ?? "unknown";
      const arr = map.get(d);
      if (arr) arr.push(inv);
      else map.set(d, [inv]);
    }
    const dayKeys = eachDay(from, to);
    for (const k of map.keys()) if (!dayKeys.includes(k)) dayKeys.push(k);
    return dayKeys.map((date) => {
      const list = map.get(date) ?? [];
      const processed = list.filter((i) => appliedInvoiceIds.has(i.id)).length;
      const state: DayGroup["state"] =
        list.length === 0
          ? "missing"
          : list.length > expectedPerDay
            ? "extra"
            : list.length < expectedPerDay
              ? "partial"
              : "complete";
      return {
        date,
        invoices: list,
        processed,
        collected: list.reduce((s, i) => s + n(i.collected), 0),
        fee: list.reduce((s, i) => s + n(i.fee), 0),
        payout: list.reduce((s, i) => s + n(i.payout), 0),
        state,
      };
    });
  }, [invoices, from, to, appliedInvoiceIds, expectedPerDay]);

  const filtered = useMemo(() => {
    let list = days;
    if (onlyIssues) list = list.filter((d) => d.state !== "complete" || d.processed < d.invoices.length);
    const s = q.trim().toLowerCase();
    if (s)
      list = list.filter(
        (d) => d.date.includes(s) || d.invoices.some((i) => `${i.invoiceNo ?? ""}${i.id}`.toLowerCase().includes(s)),
      );
    return list;
  }, [days, onlyIssues, q]);

  const totals = useMemo(() => {
    const inv = days.reduce((s, d) => s + d.invoices.length, 0);
    return {
      invoices: inv,
      processed: days.reduce((s, d) => s + d.processed, 0),
      collected: days.reduce((s, d) => s + d.collected, 0),
      fee: days.reduce((s, d) => s + d.fee, 0),
      payout: days.reduce((s, d) => s + d.payout, 0),
      completeDays: days.filter((d) => d.state === "complete").length,
      issueDays: days.filter((d) => d.state !== "complete").length,
      totalDays: days.length,
    };
  }, [days]);

  const pct = totals.invoices ? Math.round((totals.processed / totals.invoices) * 100) : 0;

  return (
    <div className="rounded-lg border bg-background overflow-hidden animate-in fade-in-50">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/40 px-3 py-2.5">
        <div className="text-xs font-semibold">
          Daily coverage — {from} → {to}
        </div>
        <Badge variant="secondary" className="text-[10px]">
          {totals.invoices} invoice / {totals.totalDays} din
        </Badge>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Expected per day
          <Input
            type="number"
            min={1}
            max={10}
            value={expectedPerDay}
            onChange={(e) => setExpectedPerDay(Math.max(1, Number(e.target.value) || 1))}
            className="h-7 w-14 text-xs"
          />
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="date / invoice"
            className="h-7 w-[150px] pl-7 text-xs"
          />
        </div>
        <Button
          size="sm"
          variant={onlyIssues ? "secondary" : "ghost"}
          className="h-7 text-xs"
          onClick={() => setOnlyIssues((v) => !v)}
        >
          Only issues {totals.issueDays > 0 && `(${totals.issueDays})`}
        </Button>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {totals.processed}/{totals.invoices} processed
            </span>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      {/* summary strip */}
      <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
        {[
          { label: "Collected", value: fmtBdt(totals.collected), tone: "" },
          { label: "Courier fee", value: fmtBdt(totals.fee), tone: "text-amber-700" },
          { label: "Net payout", value: fmtBdt(totals.payout), tone: "text-emerald-700" },
          {
            label: "Complete days",
            value: `${totals.completeDays}/${totals.totalDays}`,
            tone: totals.issueDays ? "text-amber-700" : "text-emerald-700",
          },
        ].map((s) => (
          <div key={s.label} className="bg-background px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
            <div className={cn("text-sm font-semibold tabular-nums", s.tone)}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* day list */}
      <div className="max-h-[460px] overflow-auto">
        {filtered.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">Kono din match korlo na</div>
        )}
        {filtered.map((d) => {
          const isOpen = open[d.date] ?? d.state !== "missing";
          const badge =
            d.state === "complete"
              ? { cls: "border-emerald-500/50 bg-emerald-500/10 text-emerald-700", icon: CheckCircle2, text: `${d.invoices.length}/${expectedPerDay} ok` }
              : d.state === "extra"
                ? { cls: "border-sky-500/50 bg-sky-500/10 text-sky-700", icon: TriangleAlert, text: `${d.invoices.length}/${expectedPerDay} extra` }
                : d.state === "partial"
                  ? { cls: "border-amber-500/50 bg-amber-500/10 text-amber-700", icon: TriangleAlert, text: `${d.invoices.length}/${expectedPerDay} kom` }
                  : { cls: "border-muted-foreground/30 bg-muted text-muted-foreground", icon: CircleDashed, text: "invoice nei" };
          const Icon = badge.icon;
          return (
            <div key={d.date} className="border-t first:border-t-0">
              <button
                onClick={() => setOpen((o) => ({ ...o, [d.date]: !isOpen }))}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/40"
              >
                <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", !isOpen && "-rotate-90")} />
                <span className="w-[92px] shrink-0 font-mono text-xs">{d.date}</span>
                <Badge variant="outline" className={cn("gap-1 text-[10px]", badge.cls)}>
                  <Icon className="h-3 w-3" /> {badge.text}
                </Badge>
                {d.invoices.length > 0 && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      d.processed === d.invoices.length
                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700"
                        : "border-amber-500/50 bg-amber-500/10 text-amber-700",
                    )}
                  >
                    {d.processed}/{d.invoices.length} processed
                  </Badge>
                )}
                <span className="ml-auto hidden gap-4 text-xs tabular-nums sm:flex">
                  <span className="text-muted-foreground">{fmtBdt(d.collected)}</span>
                  <span className="text-amber-700">−{fmtBdt(d.fee)}</span>
                  <span className="w-24 text-right font-medium text-emerald-700">{fmtBdt(d.payout)}</span>
                </span>
              </button>

              {isOpen && d.invoices.length > 0 && (
                <div className="bg-muted/20 px-3 pb-2">
                  <table className="w-full text-xs">
                    <tbody>
                      {d.invoices.map((inv) => {
                        const done = appliedInvoiceIds.has(inv.id);
                        return (
                          <tr
                            key={inv.id}
                            className={cn("border-t border-border/50", activeInvoiceId === inv.id && "bg-primary/5")}
                          >
                            <td className="py-1.5 pl-6 font-mono">{inv.invoiceNo ?? inv.id}</td>
                            <td className="py-1.5">
                              {done ? (
                                <Badge variant="outline" className="border-emerald-500/50 bg-emerald-500/10 text-[10px] text-emerald-700">
                                  Applied
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px]">
                                  Pending
                                </Badge>
                              )}
                            </td>
                            <td className="py-1.5 text-right tabular-nums text-muted-foreground">{inv.orders ?? "—"} ord</td>
                            <td className="py-1.5 text-right tabular-nums">{inv.collected != null ? fmtBdt(inv.collected) : "—"}</td>
                            <td className="py-1.5 text-right tabular-nums text-amber-700">{inv.fee != null ? fmtBdt(inv.fee) : "—"}</td>
                            <td className="py-1.5 text-right tabular-nums font-medium text-emerald-700">
                              {inv.payout != null ? fmtBdt(inv.payout) : "—"}
                            </td>
                            <td className="py-1.5 pl-3 text-right">
                              <Button
                                size="sm"
                                variant={activeInvoiceId === inv.id ? "default" : "outline"}
                                className="h-6 gap-1 text-[11px]"
                                disabled={loadingInvoiceId !== null}
                                onClick={() => onLoad(inv)}
                              >
                                {loadingInvoiceId === inv.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <CloudDownload className="h-3 w-3" />
                                )}
                                {done ? "Re-check" : "Load"}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
