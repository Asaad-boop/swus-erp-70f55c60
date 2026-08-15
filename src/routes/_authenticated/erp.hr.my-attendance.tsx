import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HrPageHeader, clockTime, hoursMins } from "@/components/erp/hr/hr-shell";
import {
  getMyAttendanceToday,
  punchIn,
  punchOut,
  startBreak,
  endBreak,
} from "@/lib/erp/hr/attendance.functions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Fingerprint, LogIn, LogOut, Coffee, Play, Timer, Clock, Hourglass } from "lucide-react";
import {
  BREAK_KINDS,
  breakKindLabel,
  breakWindowLabel,
  dayMetrics,
  paidBreakMinutes,
  shiftLabel,
  unpaidBreakMinutes,
  weekOffLabel,
} from "@/lib/erp/hr/schedule";

export const Route = createFileRoute("/_authenticated/erp/hr/my-attendance")({
  component: MyAttendancePage,
  head: () => ({
    meta: [
      { title: "My Attendance — Synq ERP HRM" },
      { name: "description", content: "Check in, take breaks and check out — your own live attendance card with work hours and break log." },
      { property: "og:title", content: "My Attendance — Synq ERP HRM" },
      { property: "og:description", content: "Self-service punch card with live work hours and break tracking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function StatCard({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string; hint?: string }) {
  return (
    <Card className="border-border/70">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <p className="mt-1.5 font-display text-2xl font-bold tracking-tight">{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/** Punch action mutation with toast + cache refresh. */
function usePunch(fn: () => Promise<unknown>, msg: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(msg);
      void qc.invalidateQueries({ queryKey: ["hr-my-attendance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

function MyAttendancePage() {
  const fetchToday = useServerFn(getMyAttendanceToday);
  const qcRef = useQueryClient();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["hr-my-attendance"],
    queryFn: () => fetchToday(),
    refetchInterval: 60_000,
  });

  const inFn = useServerFn(punchIn);
  const outFn = useServerFn(punchOut);
  const bStart = useServerFn(startBreak);
  const bEnd = useServerFn(endBreak);

  const doIn = usePunch(() => inFn(), "Check in hoyeche");
  const doOut = usePunch(() => outFn(), "Check out hoyeche");
  const doBreakStart = useMutation({
    mutationFn: (kind: string) => bStart({ data: { kind } }),
    onSuccess: () => {
      toast.success("Break shuru");
      void qcRef.invalidateQueries({ queryKey: ["hr-my-attendance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const doBreakEnd = usePunch(() => bEnd(), "Break shesh");
  const busy = doIn.isPending || doOut.isPending || doBreakStart.isPending || doBreakEnd.isPending;

  const entries = data?.entries ?? [];
  const stats = useMemo(() => {
    void tick;
    const now = Date.now();
    let workMs = 0;
    let breakMs = 0;
    const breaks: { start: string; end: string | null; mins: number; kind: string }[] = [];
    for (const e of entries) {
      workMs += (e.check_out ? Date.parse(e.check_out) : now) - Date.parse(e.check_in);
      for (const b of e.breaks) {
        const ms = (b.break_end ? Date.parse(b.break_end) : now) - Date.parse(b.break_start);
        breakMs += ms;
        breaks.push({ start: b.break_start, end: b.break_end, mins: Math.round(ms / 60000), kind: b.kind ?? "other" });
      }
    }
    const open = entries.find((e) => !e.check_out);
    const onBreak = !!open?.breaks.some((b) => !b.break_end);
    return {
      workMs,
      breakMs,
      netMs: Math.max(0, workMs - breakMs),
      breaks,
      open,
      onBreak,
      firstIn: entries[0]?.check_in ?? null,
      lastOut: entries.length && entries.every((e) => e.check_out) ? entries[entries.length - 1]!.check_out : null,
    };
  }, [entries, tick]);

  const state = !data?.employee
    ? "unlinked"
    : stats.onBreak
      ? "On break"
      : stats.open
        ? "Working"
        : entries.length
          ? "Completed"
          : "Not started";

  const sched = data?.employee?.schedule ?? null;
  const breakMins = Math.round(stats.breakMs / 60000);
  const overBreak = sched ? unpaidBreakMinutes(sched, breakMins) : 0;
  const metrics =
    sched && data?.workDate
      ? dayMetrics({
          schedule: sched,
          workDate: data.workDate,
          netMs: Math.max(0, stats.workMs - overBreak * 60000),
          firstIn: stats.firstIn,
        })
      : null;

  const tone =
    state === "Working"
      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
      : state === "On break"
        ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
        : state === "Completed"
          ? "bg-sky-500/10 text-sky-600 border-sky-500/20"
          : "bg-muted text-muted-foreground border-border";

  return (
    <div className="mx-auto max-w-[1100px] space-y-4 p-4 md:p-6">
      <HrPageHeader
        icon={Fingerprint}
        title="My Attendance"
        subtitle={data?.employee ? `${data.employee.full_name} • ${data?.workDate ?? ""}` : "Nijer haziri"}
      />

      {!isLoading && !data?.employee && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 text-sm">
            Tomar login kono HR employee profile er sathe link kora nei. HR admin ke bolo Employees page theke link kore dite.
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden border-border/70">
        <div className="bg-gradient-to-br from-primary/12 via-primary/5 to-transparent p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Badge variant="outline" className={tone}>
                {state === "unlinked" ? "Not linked" : state}
              </Badge>
              <p className="mt-2 font-display text-4xl font-bold tracking-tight">{hoursMins(stats.netMs)}</p>
              <p className="text-xs text-muted-foreground">
                In {clockTime(stats.firstIn)} · Out {clockTime(stats.lastOut)}
              </p>
              {sched && (
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>Duty {shiftLabel(sched)}</span>
                  <span>· Off: {weekOffLabel(sched)}</span>
                  {metrics?.isOff && (
                    <Badge variant="outline" className="border-violet-500/20 bg-violet-500/10 text-[10px] text-violet-600">
                      Off day{sched.overtime_enabled ? ` · ${metrics.multiplier}x OT` : ""}
                    </Badge>
                  )}
                  {metrics?.isLate && (
                    <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 text-[10px] text-amber-600">
                      Late {metrics.lateMinutes}m
                    </Badge>
                  )}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {!stats.open ? (
                <Button onClick={() => doIn.mutate()} disabled={busy || !data?.employee}>
                  <LogIn className="mr-1.5 h-4 w-4" />
                  {entries.length ? "Check In Again" : "Check In"}
                </Button>
              ) : (
                <>
                  {stats.onBreak ? (
                    <Button variant="outline" onClick={() => doBreakEnd.mutate()} disabled={busy}>
                      <Play className="mr-1.5 h-4 w-4" /> End break
                    </Button>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" disabled={busy}>
                          <Coffee className="mr-1.5 h-4 w-4" /> Start break
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {BREAK_KINDS.map((k) => (
                          <DropdownMenuItem key={k.value} onSelect={() => doBreakStart.mutate(k.value)}>
                            <span className="mr-2">{k.emoji}</span> {k.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <Button variant="destructive" onClick={() => doOut.mutate()} disabled={busy}>
                    <LogOut className="mr-1.5 h-4 w-4" /> Check Out
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Clock} label="Check-in time" value={clockTime(stats.firstIn)} hint={`${entries.length} session`} />
        <StatCard icon={Timer} label="Total hours" value={hoursMins(stats.workMs)} />
        <StatCard
          icon={Coffee}
          label="Break time"
          value={hoursMins(stats.breakMs)}
          hint={
            sched
              ? `${stats.breaks.length} break · ${breakMins}/${paidBreakMinutes(sched)} min paid${
                  breakWindowLabel(sched) ? ` · ${breakWindowLabel(sched)}` : ""
                }${overBreak ? ` · ${overBreak}m unpaid` : ""}`
              : `${stats.breaks.length} break`
          }
        />
        <StatCard
          icon={Hourglass}
          label="Net work hours"
          value={hoursMins(stats.netMs)}
          hint={overBreak ? `${overBreak}m extra break baad geche` : undefined}
        />
      </div>

      {overBreak > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 text-sm text-amber-700">
            Aaj break {breakMins} min hoyeche — allowance {sched ? paidBreakMinutes(sched) : 0} min
            {sched && breakWindowLabel(sched) ? ` (${breakWindowLabel(sched)})` : ""}. Beshi <b>{overBreak} min</b> unpaid dhora hobe.
          </CardContent>
        </Card>
      )}

      {metrics && metrics.overtimeMinutes > 0 && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <span className="font-medium text-emerald-700">
              Overtime {hoursMins(metrics.overtimeMinutes * 60000)}
              {metrics.multiplier !== 1 ? ` · ${metrics.multiplier}x` : ""}
            </span>
            {metrics.overtimeAmount > 0 && (
              <span className="font-display text-lg font-bold text-emerald-700">৳{metrics.overtimeAmount.toLocaleString()}</span>
            )}
          </CardContent>
        </Card>
      )}

      {stats.breaks.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="border-b border-border/70 px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              Today's breaks
            </div>
            <ul className="divide-y divide-border/50">
              {stats.breaks.map((b, i) => (
                <li key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="flex items-center gap-2">
                    <Coffee className="h-3.5 w-3.5 text-amber-600" />
                    <span>
                      {clockTime(b.start)} → {b.end ? clockTime(b.end) : "running"}
                      <span className="ml-2 text-[11px] text-muted-foreground">{breakKindLabel(b.kind)}</span>
                    </span>
                  </span>
                  <span className="text-muted-foreground">{b.mins} min</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}