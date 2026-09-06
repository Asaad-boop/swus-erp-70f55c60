import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

const BDT = (n: number) => "৳" + Math.round(n).toLocaleString("en-IN");

/** Own profile + own salary only. Reads a single hr_employees row (RLS: user_id = me). */
export function MyProfileSalary({ employeeId }: { employeeId?: string }) {
  const q = useQuery({
    queryKey: ["staff-profile-salary", employeeId],
    enabled: Boolean(employeeId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [{ data: emp }, { data: slips }] = await Promise.all([
        supabase
          .from("hr_employees")
          .select(
            "full_name, employee_code, join_date, employment_type, monthly_salary, department:hr_departments(name), designation:hr_designations(name)",
          )
          .eq("id", employeeId!)
          .maybeSingle(),
        supabase
          .from("hr_payslips")
          .select("net_pay, status, paid_at, created_at, present_days")
          .eq("employee_id", employeeId!)
          .order("created_at", { ascending: false })
          .limit(1),
      ]);
      return { emp: emp as any, slip: (slips ?? [])[0] as any };
    },
  });

  if (!employeeId) return null;

  const emp = q.data?.emp;
  const slip = q.data?.slip;

  return (
    <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <BadgeCheck className="size-3.5" /> My profile
        </div>
        {q.isLoading ? (
          <Skeleton className="mt-3 h-16 w-full" />
        ) : (
          <div className="mt-3 space-y-1 text-sm">
            <div className="text-base font-semibold">{emp?.full_name ?? "—"}</div>
            <div className="text-muted-foreground">
              {[emp?.designation?.name, emp?.department?.name].filter(Boolean).join(" · ") || "—"}
            </div>
            <div className="text-[12px] text-muted-foreground">
              {emp?.employee_code ? `ID ${emp.employee_code}` : ""}
              {emp?.join_date
                ? ` · Joined ${new Date(emp.join_date).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`
                : ""}
              {emp?.employment_type ? ` · ${String(emp.employment_type).replace(/_/g, " ")}` : ""}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Wallet className="size-3.5" /> My salary
          </div>
          <Link to="/erp/hr/my-attendance" className="text-[11px] text-indigo-600 hover:underline">
            Attendance
          </Link>
        </div>
        {q.isLoading ? (
          <Skeleton className="mt-3 h-16 w-full" />
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Fixed salary
              </div>
              <div className="text-2xl font-bold tabular-nums">
                {BDT(Number(emp?.monthly_salary ?? 0))}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Last payslip
              </div>
              {slip ? (
                <>
                  <div className="text-2xl font-bold tabular-nums">{BDT(Number(slip.net_pay ?? 0))}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {slip.paid_at
                      ? `Paid ${new Date(slip.paid_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                      : String(slip.status ?? "pending")}
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">এখনো কোনো payslip নেই</div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
