import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CardSkeleton,
  HrEmpty,
  HrPageHeader,
  hrCardHover,
  hrFadeIn,
  money,
  statusTone,
} from "@/components/erp/hr/hr-shell";
import { dhakaMonth, dhakaToday } from "@/lib/erp/hr/date";
import {
  Users,
  CalendarCheck,
  Banknote,
  PalmtreeIcon,
  LayoutDashboard,
  UserPlus,
  Radio,
  Clock,
  Cake,
  PartyPopper,
  Building2,
  TimerReset,
  AlertTriangle,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, Cell } from "recharts";

export const Route = createFileRoute("/_authenticated/erp/hr/")({
  component: HrOverview,
  head: () => ({
    meta: [
      { title: "HR Overview — Synq ERP HRM" },
      { name: "description", content: "Employee headcount, today's attendance, pending leave requests and monthly payroll cost at a glance." },
      { property: "og:title", content: "HR Overview — Synq ERP HRM" },
      { property: "og:description", content: "Headcount, attendance, leave and payroll snapshot for your team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const today = () => dhakaToday();
const thisMonth = () => dhakaMonth();

const shiftDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", day: "numeric", month: "short" });

const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : null);

function HrOverview() {
  const day = today();
  const from14 = shiftDays(day, -13);

  const { data, isLoading } = useQuery({
    queryKey: ["hr-overview", day],
    queryFn: async () => {
      const [emps, depts, att, trend, leaves, onLeave, holidays, run] = await Promise.all([
        supabase
          .from("hr_employees")
          .select(
            "id, full_name, status, monthly_salary, join_date, department_id, date_of_birth, shift_start, shift_end, week_offs",
          ),
        supabase.from("hr_departments").select("id, name"),
        supabase.from("hr_attendance").select("employee_id, status, late_minutes, overtime_minutes, check_in").eq("work_date", day),
        supabase.from("hr_attendance").select("work_date, status").gte("work_date", from14).lte("work_date", day),
        supabase
          .from("hr_leaves")
          .select("id, employee_id, start_date, end_date, days, status, hr_employees(full_name)")
          .eq("status", "pending")
          .order("start_date"),
        supabase
          .from("hr_leaves")
          .select("id, employee_id, end_date, hr_employees(full_name)")
          .eq("status", "approved")
          .lte("start_date", day)
          .gte("end_date", day),
        supabase
          .from("hr_holidays")
          .select("id, holiday_date, title")
          .gte("holiday_date", day)
          .order("holiday_date")
          .limit(5),
        supabase
          .from("hr_payroll_runs")
          .select("*")
          .eq("period_month", `${thisMonth()}-01`)
          .order("created_at", { ascending: false })
          .limit(1),
      ]);
      return {
        employees: emps.data ?? [],
        departments: depts.data ?? [],
        attendance: att.data ?? [],
        trend: trend.data ?? [],
        pendingLeaves: leaves.data ?? [],
        onLeave: onLeave.data ?? [],
        holidays: holidays.data ?? [],
        run: (run.data ?? [])[0] ?? null,
      };
    },
  });

  const emps = data?.employees ?? [];
  const active = emps.filter((e) => e.status === "active" || e.status === "probation");
  const salaryCost = active.reduce((s, e) => s + Number(e.monthly_salary ?? 0), 0);
  const att = data?.attendance ?? [];
  const present = att.filter((a) => a.status === "present" || a.status === "late").length;
  const absent = att.filter((a) => a.status === "absent").length;
  const lateRows = att.filter((a) => Number(a.late_minutes ?? 0) > 0);
  const otMinutes = att.reduce((s, a) => s + Number(a.overtime_minutes ?? 0), 0);
  const onLeaveToday = data?.onLeave ?? [];

  // Weekday (Dhaka) index for today, used for weekly-off exclusion.
  const dow = new Date(`${day}T06:00:00Z`).getUTCDay();
  const expected = active.filter((e) => !((e.week_offs as number[] | null) ?? []).includes(dow));
  const markedIds = new Set(att.map((a) => a.employee_id));
  const leaveIds = new Set(onLeaveToday.map((l) => l.employee_id));
  const notMarked = expected.filter((e) => !markedIds.has(e.id) && !leaveIds.has(e.id));
  const coverage = expected.length ? Math.round((present / expected.length) * 100) : 0;


  // 14-day present trend
  const trendMap = new Map<string, number>();
  for (let i = 13; i >= 0; i--) trendMap.set(shiftDays(day, -i), 0);
  for (const r of data?.trend ?? []) {
    if (r.status !== "present" && r.status !== "late") continue;
    const k = String(r.work_date).slice(0, 10);
    if (trendMap.has(k)) trendMap.set(k, (trendMap.get(k) ?? 0) + 1);
  }
  const trendData = Array.from(trendMap, ([d, v]) => ({ day: dayLabel(d), value: v, isToday: d === day }));
  const hasTrend = trendData.some((t) => t.value > 0);

  // Department headcount
  const deptName = new Map((data?.departments ?? []).map((d) => [d.id, d.name]));
  const deptCount = new Map<string, number>();
  for (const e of active) {
    const k = e.department_id ? (deptName.get(e.department_id) ?? "Unknown") : "Unassigned";
    deptCount.set(k, (deptCount.get(k) ?? 0) + 1);
  }
  const depts = [...deptCount.entries()].sort((a, b) => b[1] - a[1]);

  // Birthdays + work anniversaries this month
  const mm = thisMonth().slice(5, 7);
  const birthdays = active
    .filter((e) => e.date_of_birth && String(e.date_of_birth).slice(5, 7) === mm)
    .sort((a, b) => String(a.date_of_birth).slice(8).localeCompare(String(b.date_of_birth).slice(8)));
  const anniversaries = active
    .filter((e) => e.join_date && String(e.join_date).slice(5, 7) === mm && String(e.join_date).slice(0, 4) < day.slice(0, 4))
    .sort((a, b) => String(a.join_date).slice(8).localeCompare(String(b.join_date).slice(8)));

  const kpis = [
    { label: "Active employees", value: String(active.length), sub: `${emps.length} total records`, icon: Users, to: "/erp/hr/employees" },
    { label: "Present today", value: `${present}`, sub: `${absent} absent • ${expected.length} expected`, icon: CalendarCheck, to: "/erp/hr/attendance" },
    { label: "Late today", value: String(lateRows.length), sub: lateRows.length ? `${Math.round(lateRows.reduce((s, a) => s + Number(a.late_minutes ?? 0), 0))} min total` : "shobai on time", icon: Clock, to: "/erp/hr/team" },
    { label: "On leave today", value: String(onLeaveToday.length), sub: `${data?.pendingLeaves.length ?? 0} pending approval`, icon: PalmtreeIcon, to: "/erp/hr/leave-approvals" },
    { label: "Overtime today", value: `${Math.floor(otMinutes / 60)}h ${otMinutes % 60}m`, sub: "approved attendance theke", icon: TimerReset, to: "/erp/hr/attendance" },
    { label: "Monthly salary cost", value: money(salaryCost), sub: data?.run ? `Payroll ${data.run.status}` : "Payroll not generated", icon: Banknote, to: "/erp/hr/payroll" },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
      <HrPageHeader
        icon={LayoutDashboard}
        title="HR Overview"
        subtitle="Team, attendance, chhuti ar payroll — ek jaygay"
        actions={
          <>
            <Link
              to="/erp/hr/team"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Radio className="h-3.5 w-3.5" /> Live board
            </Link>
            <Link
              to="/erp/hr/attendance"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <CalendarCheck className="h-3.5 w-3.5" /> Daily register
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {isLoading && <CardSkeleton count={6} />}
        {!isLoading && kpis.map((k, i) => (
          <Link key={k.label} to={k.to} className={`group ${hrFadeIn}`} style={{ animationDelay: `${i * 50}ms` }}>
            <Card className={`h-full ${hrCardHover}`}>
              <CardContent className="space-y-1 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
                  <k.icon className="h-4 w-4 text-primary transition-transform duration-200 group-hover:scale-110" />
                </div>
                <p className="font-display text-2xl font-bold tracking-tight">{k.value}</p>
                <p className="text-[11px] text-muted-foreground">{k.sub}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {!isLoading && expected.length > 0 && (
        <Card className={hrFadeIn}>
          <CardContent className="grid gap-4 p-4 md:grid-cols-[minmax(0,260px)_1fr] md:items-center">
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <p className="text-xs font-medium text-muted-foreground">Today's coverage</p>
                <p className="font-display text-xl font-bold">{coverage}%</p>
              </div>
              <Progress value={coverage} className="h-2" />
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <Badge variant="outline" className={statusTone.present}>{present} present</Badge>
                {absent > 0 && <Badge variant="outline" className={statusTone.absent}>{absent} absent</Badge>}
                {onLeaveToday.length > 0 && <Badge variant="outline" className={statusTone.leave}>{onLeaveToday.length} leave</Badge>}
                {notMarked.length > 0 && (
                  <Badge variant="outline" className={statusTone.pending}>{notMarked.length} not marked</Badge>
                )}
              </div>
            </div>
            {hasTrend && (
              <div className="h-[120px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
                    <XAxis dataKey="day" tickLine={false} axisLine={false} interval={2} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                    <Tooltip
                      cursor={{ fill: "color-mix(in oklab, var(--muted) 40%, transparent)" }}
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        fontSize: 12,
                      }}
                      formatter={(v: number) => [`${v} present`, ""]}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {trendData.map((d, i) => (
                        <Cell key={i} fill={d.isToday ? "var(--primary)" : "color-mix(in oklab, var(--primary) 28%, transparent)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!isLoading && notMarked.length > 0 && (
        <Card className={`border-amber-500/30 ${hrFadeIn}`}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Aajke attendance mark hoyni ({notMarked.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {notMarked.slice(0, 20).map((e) => (
              <Link
                key={e.id}
                to="/erp/hr/attendance"
                className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] transition-colors hover:border-primary/40 hover:text-primary"
              >
                {e.full_name}
                {hhmm(e.shift_start) && <span className="ml-1 text-muted-foreground">{hhmm(e.shift_start)}</span>}
              </Link>
            ))}
            {notMarked.length > 20 && (
              <span className="px-1 text-[11px] text-muted-foreground">+{notMarked.length - 20} more</span>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pending leave requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.pendingLeaves ?? []).length === 0 ? (
              <HrEmpty icon={PalmtreeIcon} title="Kono pending request nei" hint="Notun chhuti request ele ekhane dekhabe." />
            ) : (
              (data?.pendingLeaves ?? []).slice(0, 6).map((l: any) => (
                <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2 transition-colors hover:border-primary/30 hover:bg-muted/40">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{l.hr_employees?.full_name ?? "—"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {l.start_date} → {l.end_date} • {Number(l.days)} day(s)
                    </p>
                  </div>
                  <Badge variant="outline" className={statusTone.pending}>pending</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent joiners</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {emps.length === 0 ? (
              <HrEmpty icon={UserPlus} title="Ekhono kono employee add kora hoyni" hint="Employees page theke prothom staff add korun." />
            ) : (
              [...emps]
                .filter((e) => e.join_date)
                .sort((a, b) => String(b.join_date).localeCompare(String(a.join_date)))
                .slice(0, 6)
                .map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2 transition-colors hover:border-primary/30 hover:bg-muted/40">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{e.full_name}</p>
                      <p className="text-[11px] text-muted-foreground">Joined {e.join_date}</p>
                    </div>
                    <Badge variant="outline" className={statusTone[e.status] ?? ""}>{e.status}</Badge>
                  </div>
                ))
            )}
          </CardContent>
        </Card>

        {onLeaveToday.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Aajke chhutite</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {onLeaveToday.slice(0, 6).map((l: any) => (
                <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2">
                  <p className="truncate text-sm font-medium">{l.hr_employees?.full_name ?? "—"}</p>
                  <span className="text-[11px] text-muted-foreground">till {l.end_date}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {depts.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-primary" /> Department headcount
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {depts.map(([name, count]) => (
                <div key={name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate font-medium">{name}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </div>
                  <Progress value={active.length ? (count / active.length) * 100 : 0} className="h-1.5" />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {(data?.holidays ?? []).length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Upcoming holidays</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data?.holidays ?? []).map((h: any) => (
                <div key={h.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2">
                  <p className="truncate text-sm font-medium">{h.title}</p>
                  <Badge variant="outline" className={statusTone.holiday}>{dayLabel(String(h.holiday_date))}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {(birthdays.length > 0 || anniversaries.length > 0) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Ei mash-er celebration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {birthdays.map((e) => (
                <div key={`b-${e.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2">
                  <p className="flex min-w-0 items-center gap-2 truncate text-sm font-medium">
                    <Cake className="h-3.5 w-3.5 shrink-0 text-pink-500" /> {e.full_name}
                  </p>
                  <span className="text-[11px] text-muted-foreground">{dayLabel(String(e.date_of_birth))}</span>
                </div>
              ))}
              {anniversaries.map((e) => (
                <div key={`a-${e.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2">
                  <p className="flex min-w-0 items-center gap-2 truncate text-sm font-medium">
                    <PartyPopper className="h-3.5 w-3.5 shrink-0 text-amber-500" /> {e.full_name}
                  </p>
                  <span className="text-[11px] text-muted-foreground">
                    {Number(day.slice(0, 4)) - Number(String(e.join_date).slice(0, 4))} yr • {dayLabel(String(e.join_date))}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}