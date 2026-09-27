import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HrEmpty, HrPageHeader, TableSkeleton, hrRow, statusTone } from "@/components/erp/hr/hr-shell";
import { PalmtreeIcon, Plus, Check, X, Trash2, AlertTriangle } from "lucide-react";
import { dhakaToday } from "@/lib/erp/hr/date";

export const Route = createFileRoute("/_authenticated/erp/hr/leaves")({
  component: LeavesPage,
  head: () => ({
    meta: [
      { title: "Leave Management — Synq ERP HRM" },
      { name: "description", content: "Create, approve and reject employee leave requests with leave types and day balances." },
      { property: "og:title", content: "Leave Management — Synq ERP HRM" },
      { property: "og:description", content: "Approve or reject staff leave requests in one queue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const daysBetween = (a: string, b: string) => {
  if (!a || !b) return 0;
  const d = (new Date(b).getTime() - new Date(a).getTime()) / 86400000 + 1;
  return d > 0 ? d : 0;
};

/** Every YYYY-MM-DD between two dates, inclusive (max 366 to stay safe). */
const dateRange = (a: string, b: string) => {
  const out: string[] = [];
  const start = new Date(`${a}T00:00:00Z`);
  const end = new Date(`${b}T00:00:00Z`);
  for (let d = start; d <= end && out.length < 366; d = new Date(d.getTime() + 86400000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
};

function LeavesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("pending");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: "", leave_type_id: "", start_date: "", end_date: "", reason: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["hr-leaves"],
    queryFn: async () => {
      const [leaves, emps, types] = await Promise.all([
        supabase.from("hr_leaves").select("*").order("start_date", { ascending: false }),
        supabase.from("hr_employees").select("id, full_name").order("full_name"),
        supabase.from("hr_leave_types").select("*").order("name"),
      ]);
      if (leaves.error) throw new Error(leaves.error.message);
      return { leaves: leaves.data ?? [], employees: emps.data ?? [], types: types.data ?? [] };
    },
  });

  const empName = (id: string) => data?.employees.find((e) => e.id === id)?.full_name ?? "—";
  const typeName = (id: string | null) => data?.types.find((t) => t.id === id)?.name ?? "—";

  /** Leave days used this (Dhaka) year for an employee + type; approved and pending counted separately. */
  const year = dhakaToday().slice(0, 4);
  const usage = (empId: string, typeId: string, excludeId?: string) => {
    let approved = 0;
    let pending = 0;
    for (const l of data?.leaves ?? []) {
      if (l.id === excludeId || l.employee_id !== empId || l.leave_type_id !== typeId) continue;
      if (String(l.start_date).slice(0, 4) !== year) continue;
      if (l.status === "approved") approved += Number(l.days) || 0;
      else if (l.status === "pending") pending += Number(l.days) || 0;
    }
    return { approved, pending };
  };
  const allowance = (typeId: string) => Number(data?.types.find((t) => t.id === typeId)?.days_per_year ?? 0);
  const formDays = daysBetween(form.start_date, form.end_date);
  const formBal =
    form.employee_id && form.leave_type_id && allowance(form.leave_type_id) > 0
      ? (() => {
          const u = usage(form.employee_id, form.leave_type_id);
          const total = allowance(form.leave_type_id);
          return { total, ...u, left: total - u.approved, over: u.approved + u.pending + formDays > total };
        })()
      : null;

  const create = useMutation({
    mutationFn: async () => {
      if (!form.employee_id) throw new Error("Employee select korun");
      if (!form.start_date || !form.end_date) throw new Error("Date select korun");
      const { error } = await supabase.from("hr_leaves").insert({
        employee_id: form.employee_id,
        leave_type_id: form.leave_type_id || null,
        start_date: form.start_date,
        end_date: form.end_date,
        days: daysBetween(form.start_date, form.end_date),
        reason: form.reason.trim() || null,
        status: "pending",
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Leave request created");
      setOpen(false);
      setForm({ employee_id: "", leave_type_id: "", start_date: "", end_date: "", reason: "" });
      void qc.invalidateQueries({ queryKey: ["hr-leaves"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const leave = (data?.leaves ?? []).find((l) => l.id === id);
      const { error } = await supabase
        .from("hr_leaves")
        .update({ status, decided_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
      if (!leave) return;

      const dates = dateRange(String(leave.start_date), String(leave.end_date));
      if (!dates.length) return;

      if (status === "approved") {
        // Attendance register must show these days as leave, otherwise payroll counts them absent.
        const { data: emp } = await supabase
          .from("hr_employees")
          .select("week_offs")
          .eq("id", leave.employee_id)
          .maybeSingle();
        const offs = new Set<number>((emp?.week_offs ?? []).map(Number));
        const workDays = dates.filter((d) => !offs.has(new Date(`${d}T00:00:00Z`).getUTCDay()));
        if (!workDays.length) return;
        const { data: existing } = await supabase
          .from("hr_attendance")
          .select("id, work_date")
          .eq("employee_id", leave.employee_id)
          .in("work_date", workDays);
        const have = new Set((existing ?? []).map((r) => String(r.work_date)));
        const insertRows = workDays
          .filter((d) => !have.has(d))
          .map((d) => ({ employee_id: leave.employee_id, work_date: d, status: "leave" }));
        if (insertRows.length) await supabase.from("hr_attendance").insert(insertRows as never);
        if (existing?.length) {
          await supabase
            .from("hr_attendance")
            .update({ status: "leave" } as never)
            .in("id", existing.map((r) => r.id));
        }
      } else {
        // Withdrawn approval → clear the auto-marked leave days.
        await supabase
          .from("hr_attendance")
          .delete()
          .eq("employee_id", leave.employee_id)
          .eq("status", "leave")
          .in("work_date", dates);
      }
    },
    onSuccess: (_r, v) => {
      toast.success(v.status === "approved" ? "Approve kora hoyeche — attendance e leave mark hoyeche" : "Update kora hoyeche");
      void qc.invalidateQueries({ queryKey: ["hr-leaves"] });
      void qc.invalidateQueries({ queryKey: ["hr-attendance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_leaves").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr-leaves"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const addType = useMutation({
    mutationFn: async ({ name, days }: { name: string; days: number }) => {
      const { error } = await supabase.from("hr_leave_types").insert({ name, days_per_year: days });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr-leaves"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const setTypeDays = useMutation({
    mutationFn: async ({ id, days }: { id: string; days: number }) => {
      const { error } = await supabase.from("hr_leave_types").update({ days_per_year: days }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Yearly days update hoyeche"); void qc.invalidateQueries({ queryKey: ["hr-leaves"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (data?.leaves ?? []).filter((l) => (tab === "all" ? true : l.status === tab));

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      <HrPageHeader
        icon={PalmtreeIcon}
        title="Leave & Holidays"
        subtitle="Chhuti request approve/reject korun"
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const name = window.prompt("Leave type name? (e.g. Casual, Sick)");
                if (!name?.trim()) return;
                const days = Number(window.prompt("Bochore koto din? (0 = limit nei)", "10") ?? 0) || 0;
                addType.mutate({ name: name.trim(), days });
              }}
            >
              + Leave type
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New request
            </Button>
          </>
        }
      />

      {(data?.types ?? []).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Yearly allowance ({year}):</span>
          {(data?.types ?? []).map((t) => (
            <button
              key={t.id}
              title="Click kore bochore koto din set korun"
              onClick={() => {
                const v = window.prompt(`${t.name} — bochore koto din? (0 = limit nei)`, String(Number(t.days_per_year ?? 0)));
                if (v !== null) setTypeDays.mutate({ id: t.id, days: Number(v) || 0 });
              }}
              className="rounded-md border border-border/70 px-2 py-1 transition-colors hover:bg-muted"
            >
              {t.name}: <span className="font-semibold tabular-nums">{Number(t.days_per_year ?? 0) || "∞"}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {["pending", "approved", "rejected", "cancelled", "all"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-all duration-200 active:scale-[0.97] ${
              tab === t ? "border-primary/30 bg-primary/10 text-primary" : "border-transparent text-muted-foreground hover:bg-muted"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border/70 bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-2.5 text-left">Employee</th>
                  <th className="p-2.5 text-left">Type</th>
                  <th className="p-2.5 text-left">Period</th>
                  <th className="p-2.5 text-right">Days</th>
                  <th className="p-2.5 text-left">Reason</th>
                  <th className="p-2.5 text-left">Status</th>
                  <th className="p-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <TableSkeleton cols={7} rows={5} />
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <HrEmpty icon={PalmtreeIcon} title="Kono request nei" hint="Ei filter e kono chhuti request paoa jayni." />
                    </td>
                  </tr>
                ) : (
                  rows.map((l) => (
                    <tr key={l.id} className={`border-b border-border/50 last:border-0 ${hrRow}`}>
                      <td className="p-2.5 font-medium">{empName(l.employee_id)}</td>
                      <td className="p-2.5">{typeName(l.leave_type_id)}</td>
                      <td className="p-2.5 text-[12px]">{l.start_date} → {l.end_date}</td>
                      <td className="p-2.5 text-right tabular-nums">
                        {Number(l.days)}
                        {l.leave_type_id && allowance(l.leave_type_id) > 0 && (
                          <div className="text-[10px] text-muted-foreground">
                            {Math.max(0, allowance(l.leave_type_id) - usage(l.employee_id, l.leave_type_id).approved)} left
                          </div>
                        )}
                      </td>
                      <td className="p-2.5 max-w-[240px] truncate text-muted-foreground">{l.reason ?? "—"}</td>
                      <td className="p-2.5"><Badge variant="outline" className={statusTone[l.status] ?? ""}>{l.status}</Badge></td>
                      <td className="p-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {l.status === "pending" && (
                            <>
                              <Button size="sm" variant="outline" className="h-7" onClick={() => decide.mutate({ id: l.id, status: "approved" })}>
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="outline" className="h-7" onClick={() => decide.mutate({ id: l.id, status: "rejected" })}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-destructive"
                            onClick={() => { if (window.confirm("Delete korbo?")) remove.mutate(l.id); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New leave request</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Employee</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {(data?.employees ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Leave type</Label>
              <Select value={form.leave_type_id || "none"} onValueChange={(v) => setForm({ ...form, leave_type_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {(data?.types ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Start</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">End</Label>
                <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Total: {formDays} day(s)</p>
            {formBal && (
              <div className={`rounded-md border px-3 py-2 text-xs ${formBal.over ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border/70 bg-muted/40"}`}>
                <div className="flex flex-wrap gap-x-3 tabular-nums">
                  <span>Bochore: <b>{formBal.total}</b></span>
                  <span>Niyeche: <b>{formBal.approved}</b></span>
                  {formBal.pending > 0 && <span>Pending: <b>{formBal.pending}</b></span>}
                  <span>Baki: <b>{Math.max(0, formBal.left)}</b></span>
                </div>
                {formBal.over && (
                  <div className="mt-1 flex items-center gap-1 font-medium">
                    <AlertTriangle className="h-3.5 w-3.5" /> Ei request dile limit er beshi hoye jabe
                  </div>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Reason</Label>
              <Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </div>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Create request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}