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
import { shiftLabel, toSchedule, weekOffLabel, isWeekOff } from "@/lib/erp/hr/schedule";
import { CalendarCheck, CheckCheck, Search, Eraser, Download } from "lucide-react";

/** Dhaka-local YYYY-MM-DD (avoids UTC rolling the date over at night). */
const dhakaToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** ISO timestamp → "HH:MM" in Dhaka time. */
const dhakaTimeInput = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso))
    : "";

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
  const [date, setDate] = useState(dhakaToday);
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["hr-attendance", date],
    queryFn: async () => {
      const [emps, att] = await Promise.all([
        supabase
          .from("hr_employees")
          .select("id, full_name, employee_code, status, shift_start, shift_end, week_offs, overtime_enabled, overtime_rate, overtime_holiday_multiplier, overtime_min_minutes, late_grace_min")
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
        missing.map((e) => ({
          employee_id: e.id,
          work_date: date,
          status: isWeekOff(toSchedule(e), date) ? "week_off" : "present",
        })) as any,
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

  const clearRow = useMutation({
    mutationFn: async (employeeId: string) => {
      const existing = byEmp.get(employeeId);
      if (!existing) return;
      const { error } = await supabase.from("hr_attendance").delete().eq("id", existing.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Row clear kora hoyeche");
      void qc.invalidateQueries({ queryKey: ["hr-attendance", date] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.employees ?? []).filter((e) =>
      !term ? true : [e.full_name, e.employee_code].some((v) => String(v ?? "").toLowerCase().includes(term)),
    );
  }, [data, q]);

  const exportCsv = () => {
    const head = ["Employee", "Code", "Status", "In", "Out", "Late (min)", "OT (min)"];
    const lines = rows.map((e) => {
      const a = byEmp.get(e.id);
      return [e.full_name, e.employee_code ?? "", a?.status ?? "", dhakaTimeInput(a?.check_in), dhakaTimeInput(a?.check_out), a?.late_minutes ?? 0, a?.overtime_minutes ?? 0]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",");
    });
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attendance-${date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

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
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
            </Button>
          </>
        }
      />

      <div className="relative max-w-[280px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Employee khujun…" className="h-9 pl-8" />
      </div>

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
                  <th className="p-2.5 text-left">Duty</th>
                  <th className="p-2.5 text-left">Status</th>
                  <th className="p-2.5 text-left">In</th>
                  <th className="p-2.5 text-left">Out</th>
                  <th className="p-2.5 text-right">Late (min)</th>
                  <th className="p-2.5 text-right">Break (min)</th>
                  <th className="p-2.5 text-right">OT (min)</th>
                  <th className="p-2.5 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Active employee nei.</td></tr>
                ) : (
                  rows.map((e) => {
                    const a = byEmp.get(e.id);
                    const sched = toSchedule(e);
                    const off = isWeekOff(sched, date);
                    return (
                      <tr key={e.id} className={`border-b border-border/50 last:border-0 ${off ? "bg-violet-500/5" : ""}`}>
                        <td className="p-2.5">
                          <p className="font-medium">{e.full_name}</p>
                          <p className="text-[11px] text-muted-foreground">{e.employee_code ? `#${e.employee_code}` : "—"}</p>
                        </td>
                        <td className="p-2.5 whitespace-nowrap text-[12px]">
                          {shiftLabel(sched)}
                          <p className="text-[11px] text-muted-foreground">
                            {off ? "Weekly off" : `Off: ${weekOffLabel(sched)}`}
                          </p>
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
                            key={`in-${e.id}-${date}-${a?.updated_at ?? ""}`}
                            type="time"
                            defaultValue={dhakaTimeInput(a?.check_in)}
                            onBlur={(ev) =>
                              upsert.mutate({
                                employee_id: e.id,
                                patch: { check_in: ev.target.value ? `${date}T${ev.target.value}:00+06:00` : null },
                              })
                            }
                            className="h-8 w-[120px]"
                          />
                        </td>
                        <td className="p-2.5">
                          <Input
                            key={`out-${e.id}-${date}-${a?.updated_at ?? ""}`}
                            type="time"
                            defaultValue={dhakaTimeInput(a?.check_out)}
                            onBlur={(ev) =>
                              upsert.mutate({
                                employee_id: e.id,
                                patch: { check_out: ev.target.value ? `${date}T${ev.target.value}:00+06:00` : null },
                              })
                            }
                            className="h-8 w-[120px]"
                          />
                        </td>
                        <td className="p-2.5 text-right">
                          <Input
                            key={`late-${e.id}-${date}-${a?.updated_at ?? ""}`}
                            type="number"
                            defaultValue={a?.late_minutes ?? 0}
                            onBlur={(ev) => upsert.mutate({ employee_id: e.id, patch: { late_minutes: Number(ev.target.value) || 0 } })}
                            className="h-8 w-[80px] text-right"
                          />
                        </td>
                        <td className="p-2.5 text-right">
                          <Input
                            key={`ot-${e.id}-${date}-${a?.updated_at ?? ""}`}
                            type="number"
                            defaultValue={a?.overtime_minutes ?? 0}
                            onBlur={(ev) => upsert.mutate({ employee_id: e.id, patch: { overtime_minutes: Number(ev.target.value) || 0 } })}
                            className="h-8 w-[80px] text-right"
                          />
                          {a?.overtime_minutes && sched.overtime_enabled ? (
                            <p className="text-[10px] text-emerald-600">
                              ৳{Math.round((Number(a.overtime_minutes) / 60) * (Number(sched.overtime_rate) || 0) * (off ? Number(sched.overtime_holiday_multiplier) || 1 : 1))}
                            </p>
                          ) : null}
                        </td>
                        <td className="p-2.5 text-right">
                          {a && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-muted-foreground hover:text-destructive"
                              title="Clear this day"
                              onClick={() => { if (window.confirm(`${e.full_name} er ei diner attendance muche felbo?`)) clearRow.mutate(e.id); }}
                            >
                              <Eraser className="h-3.5 w-3.5" />
                            </Button>
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
    </div>
  );
}