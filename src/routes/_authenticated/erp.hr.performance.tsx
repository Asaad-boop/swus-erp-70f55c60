import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpDown,
  CheckCircle2,
  Package,
  ScanLine,
  Trophy,
  Truck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DataPanel, EmptyState, StatCard } from "@/components/erp/ui";
import { HrPage, NoAccess, useHrRole } from "@/components/erp/hr/hr-shell";
import { cn } from "@/lib/utils";
import { getActivity, getPerformance, type StaffPerformance } from "@/lib/erp/hr/api";
import {
  addDays,
  clock,
  dayLabel,
  dhakaToIso,
  dhakaToday,
  hm,
  monthStart,
} from "@/lib/erp/hr/format";
import { statusBadge } from "@/lib/erp/orders";

export const Route = createFileRoute("/_authenticated/erp/hr/performance")({
  head: () => ({ meta: [{ title: "Performance — HRM" }] }),
  component: PerformancePage,
});

type SortKey =
  | "total_actions"
  | "confirmed"
  | "packed"
  | "shipped"
  | "scans"
  | "worked_min"
  | "actions_per_hour";

function PerformancePage() {
  const { isManager, isLoading } = useHrRole();
  const today = dhakaToday();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [sort, setSort] = useState<SortKey>("total_actions");
  const [person, setPerson] = useState<StaffPerformance | null>(null);

  const perf = useQuery({
    queryKey: ["hr", "perf", from, to],
    enabled: isManager && to >= from,
    queryFn: () => getPerformance(from, to),
    refetchInterval: from === today ? 60_000 : false,
  });

  const rows = useMemo(
    () => [...(perf.data ?? [])].sort((a, b) => Number(b[sort] ?? 0) - Number(a[sort] ?? 0)),
    [perf.data, sort],
  );
  const tot = useMemo(() => {
    const r = perf.data ?? [];
    const s = (k: keyof StaffPerformance) => r.reduce((a, x) => a + Number(x[k] ?? 0), 0);
    const top = (k: keyof StaffPerformance) =>
      [...r].sort((a, b) => Number(b[k] ?? 0) - Number(a[k] ?? 0))[0];
    return {
      confirmed: s("confirmed"),
      packed: s("packed") + s("packing"),
      shipped: s("shipped"),
      scans: s("scans"),
      topConfirm: top("confirmed"),
      topPack: top("packed"),
    };
  }, [perf.data]);

  if (isLoading)
    return (
      <div className="p-6">
        <Skeleton className="h-40" />
      </div>
    );
  if (!isManager) return <NoAccess what="performance" />;

  const Th = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th className="px-3 py-2.5 text-right">
      <button
        onClick={() => setSort(k)}
        className={cn("inline-flex items-center gap-1 uppercase", sort === k && "text-foreground")}
      >
        {children}
        <ArrowUpDown className="size-3 opacity-50" />
      </button>
    </th>
  );

  return (
    <HrPage
      title="Performance"
      subtitle="কে কয়টা order confirm, scan, pack, ship করেছে — order status history থেকে, প্রতিটা কাজ কার হাতে হয়েছে তা দেখা যায়।"
    >
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-xs">From</Label>
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={to}
            min={from}
            max={addDays(from, 92)}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        {[
          ["Today", today, today],
          ["Yesterday", addDays(today, -1), addDays(today, -1)],
          ["Last 7 days", addDays(today, -6), today],
          ["This month", monthStart(today), today],
        ].map(([l, f, t]) => (
          <Button
            key={l}
            size="sm"
            variant={from === f && to === t ? "secondary" : "ghost"}
            onClick={() => {
              setFrom(f);
              setTo(t);
            }}
          >
            {l}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={<CheckCircle2 className="size-3.5" />}
          label="Confirmed"
          value={tot.confirmed}
          hint={
            tot.topConfirm?.confirmed ? (
              <span className="inline-flex items-center gap-1">
                <Trophy className="size-3 text-amber-500" />
                {tot.topConfirm.name} · {tot.topConfirm.confirmed}
              </span>
            ) : undefined
          }
        />
        <StatCard
          icon={<Package className="size-3.5" />}
          label="Packed"
          value={tot.packed}
          hint={
            tot.topPack?.packed ? (
              <span className="inline-flex items-center gap-1">
                <Trophy className="size-3 text-amber-500" />
                {tot.topPack.name} · {tot.topPack.packed}
              </span>
            ) : undefined
          }
        />
        <StatCard icon={<Truck className="size-3.5" />} label="Shipped" value={tot.shipped} />
        <StatCard
          icon={<ScanLine className="size-3.5" />}
          label="Scans"
          value={tot.scans}
          hint="from the order scan module"
        />
      </div>

      <DataPanel flush>
        {perf.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-40" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="No staff activity in this range" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Staff</th>
                  <th className="px-3 py-2.5 text-right">Days</th>
                  <Th k="worked_min">Worked</Th>
                  <Th k="confirmed">Confirm</Th>
                  <th className="px-3 py-2.5 text-right">Cancel</th>
                  <Th k="packed">Pack</Th>
                  <th className="px-3 py-2.5 text-right">Ready</th>
                  <Th k="shipped">Ship</Th>
                  <Th k="scans">Scans</Th>
                  <Th k="total_actions">Total</Th>
                  <Th k="actions_per_hour">Per hour</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r, i) => (
                  <tr
                    key={r.user_id ?? r.employee_id ?? i}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => r.user_id && setPerson(r)}
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.designation ?? (r.employee_id ? "" : "no employee profile")}
                        {r.last_action && <> · last {clock(r.last_action)}</>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.present_days}
                      {r.late_days > 0 && (
                        <span className="ml-1 text-xs text-amber-700">({r.late_days} late)</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.worked_min ? hm(r.worked_min) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-emerald-700">
                      {r.confirmed || ""}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {r.cancelled || ""}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.packed + r.packing || ""}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.ready_to_ship || ""}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.shipped || ""}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.scans ? (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <ScanLine className="size-3" />
                          {r.scans}
                        </span>
                      ) : (
                        ""
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                      {r.total_actions || ""}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {r.actions_per_hour ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataPanel>

      {person && <PersonFeed person={person} from={from} to={to} onClose={() => setPerson(null)} />}
    </HrPage>
  );
}

function PersonFeed({
  person,
  from,
  to,
  onClose,
}: {
  person: StaffPerformance;
  from: string;
  to: string;
  onClose: () => void;
}) {
  const feed = useQuery({
    queryKey: ["hr", "feed", person.user_id, from, to],
    queryFn: () =>
      getActivity(
        dhakaToIso(from, "00:00"),
        dhakaToIso(addDays(to, 1), "00:00"),
        person.user_id,
        500,
      ),
  });
  let lastDay = "";
  return (
    <DataPanel
      title={`${person.name} — what they did`}
      icon={<Activity className="size-4" />}
      flush
      actions={
        <Button size="icon" variant="ghost" className="size-7" onClick={onClose}>
          <X className="size-4" />
        </Button>
      }
    >
      {feed.isLoading ? (
        <div className="p-4">
          <Skeleton className="h-32" />
        </div>
      ) : !(feed.data ?? []).length ? (
        <EmptyState compact title="No order actions" />
      ) : (
        <ul className="max-h-[520px] overflow-y-auto text-sm">
          {feed.data!.map((a, i) => {
            const day = new Date(a.at).toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
            const header = day !== lastDay;
            lastDay = day;
            return (
              <li key={`${a.order_id}-${a.at}-${i}`}>
                {header && (
                  <div className="sticky top-0 bg-muted/60 px-4 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {dayLabel(day)}
                  </div>
                )}
                <div className="flex items-center gap-3 border-b px-4 py-2">
                  <span className="w-16 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {clock(a.at)}
                  </span>
                  <span className="font-mono text-xs">
                    {a.invoice_no ?? a.order_id.slice(0, 8)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {a.from_status ? `${statusBadge(a.from_status as never).label} → ` : ""}
                    <span className="text-foreground">
                      {statusBadge(a.to_status as never).label}
                    </span>
                  </span>
                  {a.via === "scan" && (
                    <span className="ml-auto inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 text-[11px] text-primary">
                      <ScanLine className="size-3" /> scan
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </DataPanel>
  );
}
