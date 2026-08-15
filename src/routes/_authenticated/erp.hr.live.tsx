import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { HrPageHeader, clockTime, hoursMins } from "@/components/erp/hr/hr-shell";
import { getLiveBoard, type LiveEmployee } from "@/lib/erp/hr/attendance.functions";
import { getAppSetting } from "@/lib/erp/settings/app-settings.functions";
import { DEFAULT_HR_POLICY, type HrPolicy } from "@/lib/erp/hr/policy";
import { breakWindowLabel, dayMetrics, shiftLabel, unpaidBreakMinutes } from "@/lib/erp/hr/schedule";
import { Radio, RefreshCw, Users, CheckCircle2, Coffee, LogOut, UserX, Table2, GanttChartSquare, Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/erp/hr/live")({
  component: LiveDashboardPage,
  head: () => ({
    meta: [
      { title: "Live Dashboard — Synq ERP HRM" },
      { name: "description", content: "Workforce command center: who is present, on break, not in or checked out — with a live hour-by-hour timeline." },
      { property: "og:title", content: "Live Dashboard — Synq ERP HRM" },
      { property: "og:description", content: "Real-time workforce presence, breaks and activity feed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATE_META: Record<LiveEmployee["state"], { label: string; dot: string; tone: string }> = {
  present: { label: "Present", dot: "bg-emerald-500", tone: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  on_break: { label: "On break", dot: "bg-amber-500", tone: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  left: { label: "Left", dot: "bg-sky-500", tone: "bg-sky-500/10 text-sky-600 border-sky-500/20" },
  not_in: { label: "Not in", dot: "bg-muted-foreground/40", tone: "bg-muted text-muted-foreground border-border" },
};

const DAY_START = 8; // 8 AM
const DAY_END = 22; // 10 PM

/** Dhaka-local fractional hour for an ISO timestamp. */
function dhakaHour(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  const [h, m] = parts.split(":").map(Number);
  return h + m / 60;
}

function pct(hour: number) {
  return ((Math.min(DAY_END, Math.max(DAY_START, hour)) - DAY_START) / (DAY_END - DAY_START)) * 100;
}

function Kpi({ icon: Icon, label, value, accent }: { icon: any; label: string; value: number; accent: string }) {
  return (
    <Card className="border-border/70">
      <CardContent className="flex items-center gap-3 p-3.5">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${accent}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="font-display text-xl font-bold leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LiveDashboardPage() {
  const fetchBoard = useServerFn(getLiveBoard);
  const [date, setDate] = useState(() =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()),
  );
  const [view, setView] = useState<"table" | "timeline" | "activity">("table");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { data, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["hr-live-board", date],
    queryFn: () => fetchBoard({ data: { date } }),
    refetchInterval: 60_000,
  });

  const loadSetting = useServerFn(getAppSetting);
  const { data: policy } = useQuery({
    queryKey: ["hr-policy"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await loadSetting({ data: { key: "hr_policy" } });
      return { ...DEFAULT_HR_POLICY, ...((res.value as Partial<HrPolicy>) ?? {}) } as HrPolicy;
    },
  });

  const rows = data?.rows ?? [];
  const workDate = data?.workDate ?? date;

  /** Per-employee verdict against their own duty time (falls back to company grace). */
  const metricsOf = (r: LiveEmployee) =>
    dayMetrics({
      schedule: r.schedule,
      workDate,
      // Only break time beyond the paid allowance reduces payable hours.
      netMs: r.workMs + r.breakMs - unpaidBreakMinutes(r.schedule, r.breakMs / 60000) * 60000,
      firstIn: r.firstIn,
      fallbackGraceMin: policy?.late_grace_min ?? DEFAULT_HR_POLICY.late_grace_min,
    });
  const kpi = useMemo(() => {
    const c = { total: rows.length, present: 0, on_break: 0, left: 0, not_in: 0 };
    for (const r of rows) c[r.state] += 1;
    return c;
  }, [rows]);
  const attendancePct = kpi.total ? Math.round(((kpi.total - kpi.not_in) / kpi.total) * 100) : 0;

  const activity = useMemo(() => {
    const events: { at: string; who: string; kind: string }[] = [];
    for (const r of rows) {
      for (const e of r.entries) {
        events.push({ at: e.check_in, who: r.full_name, kind: "Checked in" });
        if (e.check_out) events.push({ at: e.check_out, who: r.full_name, kind: "Checked out" });
        for (const b of e.breaks) {
          events.push({ at: b.break_start, who: r.full_name, kind: "Break started" });
          if (b.break_end) events.push({ at: b.break_end, who: r.full_name, kind: "Break ended" });
        }
      }
    }
    return events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }, [rows]);

  const hours = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);
  const nowPct = pct(dhakaHour(new Date(now).toISOString()));
  const isToday =
    date === new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      <HrPageHeader
        icon={Radio}
        title="Workforce Command Center"
        subtitle={`Attendance ${attendancePct}% • Updated ${clockTime(new Date(dataUpdatedAt || Date.now()).toISOString())}`}
        actions={
          <>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-[150px]" />
            <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </>
        }
      />

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        Live polling · every 60s
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi icon={Users} label="Total" value={kpi.total} accent="bg-primary/10 text-primary" />
        <Kpi icon={CheckCircle2} label="Present" value={kpi.present} accent="bg-emerald-500/10 text-emerald-600" />
        <Kpi icon={Coffee} label="On break" value={kpi.on_break} accent="bg-amber-500/10 text-amber-600" />
        <Kpi icon={UserX} label="Not in" value={kpi.not_in} accent="bg-muted text-muted-foreground" />
        <Kpi icon={LogOut} label="Left" value={kpi.left} accent="bg-sky-500/10 text-sky-600" />
      </div>

      <div className="flex flex-wrap gap-1 rounded-full border border-border/70 bg-muted/40 p-1 w-fit">
        {([
          { k: "table", label: "Table", icon: Table2 },
          { k: "timeline", label: "Timeline", icon: GanttChartSquare },
          { k: "activity", label: "Activity", icon: Activity },
        ] as const).map((t) => (
          <button
            key={t.k}
            onClick={() => setView(t.k)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              view === t.k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {view === "table" && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border/70 bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-2.5 text-left">Employee</th>
                    <th className="p-2.5 text-left">Duty</th>
                    <th className="p-2.5 text-left">Status</th>
                    <th className="p-2.5 text-left">In</th>
                    <th className="p-2.5 text-left">Out</th>
                    <th className="p-2.5 text-right">Break</th>
                    <th className="p-2.5 text-right">Net hours</th>
                    <th className="p-2.5 text-right">Overtime</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Kono employee nei.</td></tr>
                  ) : (
                    rows.map((r) => {
                      const m = metricsOf(r);
                      return (
                      <tr key={r.id} className="border-b border-border/50 last:border-0">
                        <td className="p-2.5">
                          <p className="font-medium">{r.full_name}</p>
                          <p className="text-[11px] text-muted-foreground">{r.department ?? (r.employee_code ? `#${r.employee_code}` : "—")}</p>
                        </td>
                        <td className="p-2.5 whitespace-nowrap text-[12px]">
                          {shiftLabel(r.schedule)}
                          {m.isOff && (
                            <Badge variant="outline" className="ml-1.5 border-violet-500/20 bg-violet-500/10 text-[10px] text-violet-600">Off day</Badge>
                          )}
                          {breakWindowLabel(r.schedule) && (
                            <p className="text-[10px] text-muted-foreground">Break {breakWindowLabel(r.schedule)}</p>
                          )}
                        </td>
                        <td className="p-2.5">
                          <Badge variant="outline" className={STATE_META[r.state].tone}>
                            <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${STATE_META[r.state].dot}`} />
                            {STATE_META[r.state].label}
                          </Badge>
                        </td>
                        <td className="p-2.5">
                          <span className="inline-flex items-center gap-1.5">
                            {clockTime(r.firstIn)}
                            {m.isLate && (
                              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">
                                Late {m.lateMinutes}m
                              </Badge>
                            )}
                          </span>
                        </td>
                        <td className="p-2.5">{clockTime(r.lastOut)}</td>
                        <td className="p-2.5 text-right">
                          {hoursMins(r.breakMs)}
                          {unpaidBreakMinutes(r.schedule, r.breakMs / 60000) > 0 && (
                            <p className="text-[10px] text-amber-600">
                              +{unpaidBreakMinutes(r.schedule, r.breakMs / 60000)}m unpaid
                            </p>
                          )}
                        </td>
                        <td className="p-2.5 text-right font-medium">{hoursMins(r.workMs)}</td>
                        <td className="p-2.5 text-right text-[12px]">
                          {m.overtimeMinutes > 0 ? (
                            <span className="font-medium text-emerald-600">
                              {hoursMins(m.overtimeMinutes * 60000)}
                              {m.overtimeAmount > 0 && ` · ৳${m.overtimeAmount.toLocaleString()}`}
                              {m.multiplier !== 1 && ` (${m.multiplier}x)`}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {view === "timeline" && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="relative ml-[160px] hidden justify-between text-[10px] text-muted-foreground sm:flex">
              {hours.map((h) => (
                <span key={h}>{h % 12 === 0 ? 12 : h % 12}{h < 12 ? "AM" : "PM"}</span>
              ))}
            </div>
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3">
                <div className="w-[150px] shrink-0 truncate text-xs">
                  <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${STATE_META[r.state].dot}`} />
                  {r.full_name}
                </div>
                <div className="relative h-6 flex-1 overflow-hidden rounded-full bg-muted/60">
                  {r.entries.map((e) => {
                    const s = pct(dhakaHour(e.check_in));
                    const en = pct(dhakaHour(e.check_out ?? new Date(now).toISOString()));
                    return (
                      <div key={e.id}>
                        <div className="absolute top-0 h-6 rounded-full bg-emerald-500/35" style={{ left: `${s}%`, width: `${Math.max(0.6, en - s)}%` }} />
                        {e.breaks.map((b) => {
                          const bs = pct(dhakaHour(b.break_start));
                          const be = pct(dhakaHour(b.break_end ?? new Date(now).toISOString()));
                          return (
                            <div key={b.id} className="absolute top-0 h-6 bg-amber-500/60" style={{ left: `${bs}%`, width: `${Math.max(0.4, be - bs)}%` }} />
                          );
                        })}
                      </div>
                    );
                  })}
                  {isToday && (
                    <div className="absolute top-0 h-6 w-px bg-primary" style={{ left: `${nowPct}%` }}>
                      <span className="absolute -top-0.5 left-1 text-[9px] font-semibold text-primary">NOW</span>
                    </div>
                  )}
                </div>
                <div className="w-[70px] shrink-0 text-right text-[11px] text-muted-foreground">{hoursMins(r.workMs)}</div>
              </div>
            ))}
            {rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Kono data nei.</p>}
          </CardContent>
        </Card>
      )}

      {view === "activity" && (
        <Card>
          <CardContent className="p-0">
            {activity.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Aaj kono punch hoyni.</p>
            ) : (
              <ul className="divide-y divide-border/50">
                {activity.map((a, i) => (
                  <li key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span>
                      <span className="font-medium">{a.who}</span>{" "}
                      <span className="text-muted-foreground">{a.kind.toLowerCase()}</span>
                    </span>
                    <span className="text-[11px] text-muted-foreground">{clockTime(a.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}