import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HrPageHeader, money, statusTone } from "@/components/erp/hr/hr-shell";
import { Users, CalendarCheck, Banknote, PalmtreeIcon, LayoutDashboard } from "lucide-react";

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

const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);

function HrOverview() {
  const { data, isLoading } = useQuery({
    queryKey: ["hr-overview", today()],
    queryFn: async () => {
      const [emps, att, leaves, run] = await Promise.all([
        supabase.from("hr_employees").select("id, full_name, status, monthly_salary, join_date, department_id"),
        supabase.from("hr_attendance").select("employee_id, status").eq("work_date", today()),
        supabase
          .from("hr_leaves")
          .select("id, employee_id, start_date, end_date, days, status, hr_employees(full_name)")
          .eq("status", "pending")
          .order("start_date"),
        supabase.from("hr_payroll_runs").select("*").eq("period_month", `${thisMonth()}-01`).maybeSingle(),
      ]);
      return {
        employees: emps.data ?? [],
        attendance: att.data ?? [],
        pendingLeaves: leaves.data ?? [],
        run: run.data,
      };
    },
  });

  const emps = data?.employees ?? [];
  const active = emps.filter((e) => e.status === "active" || e.status === "probation");
  const salaryCost = active.reduce((s, e) => s + Number(e.monthly_salary ?? 0), 0);
  const att = data?.attendance ?? [];
  const present = att.filter((a) => a.status === "present" || a.status === "late").length;
  const absent = att.filter((a) => a.status === "absent").length;

  const kpis = [
    { label: "Active employees", value: String(active.length), sub: `${emps.length} total records`, icon: Users, to: "/erp/hr/employees" },
    { label: "Present today", value: `${present}`, sub: `${absent} absent • ${att.length} marked`, icon: CalendarCheck, to: "/erp/hr/attendance" },
    { label: "Pending leave", value: String(data?.pendingLeaves.length ?? 0), sub: "approval waiting", icon: PalmtreeIcon, to: "/erp/hr/leaves" },
    { label: "Monthly salary cost", value: money(salaryCost), sub: data?.run ? `Payroll ${data.run.status}` : "Payroll not generated", icon: Banknote, to: "/erp/hr/payroll" },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
      <HrPageHeader
        icon={LayoutDashboard}
        title="HR Overview"
        subtitle="Team, attendance, chhuti ar payroll — ek jaygay"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.label} to={k.to} className="group">
            <Card className="h-full transition-colors group-hover:border-primary/40">
              <CardContent className="space-y-1 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
                  <k.icon className="h-4 w-4 text-primary" />
                </div>
                <p className="font-display text-2xl font-bold tracking-tight">{isLoading ? "—" : k.value}</p>
                <p className="text-[11px] text-muted-foreground">{k.sub}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pending leave requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.pendingLeaves ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Kono pending request nei.</p>
            ) : (
              (data?.pendingLeaves ?? []).slice(0, 6).map((l: any) => (
                <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2">
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
              <p className="text-sm text-muted-foreground">Ekhono kono employee add kora hoyni.</p>
            ) : (
              [...emps]
                .filter((e) => e.join_date)
                .sort((a, b) => String(b.join_date).localeCompare(String(a.join_date)))
                .slice(0, 6)
                .map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2">
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
      </div>
    </div>
  );
}