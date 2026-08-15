import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ATTENDANCE_STATUSES, HrPageHeader, statusTone } from "@/components/erp/hr/hr-shell";
import { CalendarCheck, CheckCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/erp/hr/attendance")({
  component: AttendancePage,
  head: () => ({
    meta: [
      { title: "Attendance — Synq ERP HRM" },
      { name: "description", content: "Mark daily attendance, check-in/out times, late minutes and overtime for every employee." },
      { property: "og:title", content: "Attendance — Synq ERP HRM" },
      { property: "og:description", content: "Daily attendance register with late and overtime tracking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AttendancePage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const { data, isLoading } = useQuery({
    queryKey: ["hr-attendance", date],
    queryFn: async () => {
      const [emps, att] = await Promise.all([
        supabase
          .from("hr_employees")
          .select("id, full_name, employee_code, status")
          .in("status", ["active", "probation", "on_leave"])
          .order("full_name"),
        supabase.from("hr_attendance").select("*").eq("work_date", date),
      ]);
      if (emps.error) throw new Error(emps.error.message);
      return { employees: emps.data ?? [], attendance: att.data ?? [] };
    },
  });

  const byEmp = useMemo(() => {
    const m = new Map<string, any>();
    for (const a of data?.attendance ?? []) m.set(a.employee_id as string, a);
    return m;
  }, [data]);

  const upsert = useMutation({
    mutationFn: async (row: { employee_id: string; patch: Record<string, unknown> }) => {
      const existing = byEmp.get(row.employee_id);
      if (existing) {
        const { error } = await supabase.from("hr_attendance").update(row.patch as any).eq("id", existing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("hr_attendance")
          .insert({ employee_id: row.employee_id, work_date: date, status: "present", ...row.patch } as any);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr-attendance", date] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const missing = (data?.employees ?? []).filter((e) => !byEmp.has(e.id));
      if (missing.length === 0) return 0;
      const { error } = await supabase.from("hr_attendance").insert(
        missing.map((e) => ({ employee_id: e.id, work_date: date, status: "present" })) as any,
      );
      if (error) throw new Error(error.message);
      return missing.length;
    },
    onSuccess: (n) => {
      toast.success(n ? `${n} jon present mark kora hoyeche` : "Sob already marked");
      void qc.invalidateQueries({ queryKey: ["hr-attendance", date] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data?.employees ?? [];
  const counts = ATTENDANCE_STATUSES.map((s) => ({
    s,
    n: (data?.attendance ?? []).filter((a) => a.status === s).length,
  })).filter((c) => c.n > 0);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      <HrPageHeader
        icon={CalendarCheck}
        title="Attendance"
        subtitle="Dinner haziri, late minute ar overtime"
        actions={
          <>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-[150px]" />
            <Button size="sm" variant="outline" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" /> Mark all present
            </Button>
          </>
        }
      />

      {counts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {counts.map((c) => (
            <Badge key={c.s} variant="outline" className={statusTone[c.s] ?? ""}>
              {c.s}: {c.n}
            </Badge>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border/70 bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-2.5 text-left">Employee</th>
                  <th className="p-2.5 text-left">Status</th>
                  <th className="p-2.5 text-left">In</th>
                  <th className="p-2.5 text-left">Out</th>
                  <th className="p-2.5 text-right">Late (min)</th>
                  <th className="p-2.5 text-right">OT (min)</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Active employee nei.</td></tr>
                ) : (
                  rows.map((e) => {
                    const a = byEmp.get(e.id);
                    return (
                      <tr key={e.id} className="border-b border-border/50 last:border-0">
                        <td className="p-2.5">
                          <p className="font-medium">{e.full_name}</p>
                          <p className="text-[11px] text-muted-foreground">{e.employee_code ? `#${e.employee_code}` : "—"}</p>
                        </td>
                        <td className="p-2.5">
                          <div className="flex flex-wrap gap-1">
                            {ATTENDANCE_STATUSES.map((s) => (
                              <button
                                key={s}
                                onClick={() => upsert.mutate({ employee_id: e.id, patch: { status: s } })}
                                className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                                  a?.status === s ? statusTone[s] : "border-border text-muted-foreground hover:bg-muted"
                                }`}
                              >
                                {s.replace("_", " ")}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="p-2.5">
                          <Input
                            type="time"
                            defaultValue={a?.check_in ? String(a.check_in).slice(11, 16) : ""}
                            onBlur={(ev) =>
                              upsert.mutate({
                                employee_id: e.id,
                                patch: { check_in: ev.target.value ? `${date}T${ev.target.value}:00` : null },
                              })
                            }
                            className="h-8 w-[120px]"
                          />
                        </td>
                        <td className="p-2.5">
                          <Input
                            type="time"
                            defaultValue={a?.check_out ? String(a.check_out).slice(11, 16) : ""}
                            onBlur={(ev) =>
                              upsert.mutate({
                                employee_id: e.id,
                                patch: { check_out: ev.target.value ? `${date}T${ev.target.value}:00` : null },
                              })
                            }
                            className="h-8 w-[120px]"
                          />
                        </td>
                        <td className="p-2.5 text-right">
                          <Input
                            type="number"
                            defaultValue={a?.late_minutes ?? 0}
                            onBlur={(ev) => upsert.mutate({ employee_id: e.id, patch: { late_minutes: Number(ev.target.value) || 0 } })}
                            className="h-8 w-[80px] text-right"
                          />
                        </td>
                        <td className="p-2.5 text-right">
                          <Input
                            type="number"
                            defaultValue={a?.overtime_minutes ?? 0}
                            onBlur={(ev) => upsert.mutate({ employee_id: e.id, patch: { overtime_minutes: Number(ev.target.value) || 0 } })}
                            className="h-8 w-[80px] text-right"
                          />
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
    </div>
  );
}