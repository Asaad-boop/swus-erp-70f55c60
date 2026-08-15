import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  HrPageHeader,
  money,
  statusTone,
} from "@/components/erp/hr/hr-shell";
import { Users, Plus, Search, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_SCHEDULE,
  WEEK_DAYS,
  hhmm,
  shiftLabel,
  toSchedule,
  weekOffLabel,
} from "@/lib/erp/hr/schedule";

export const Route = createFileRoute("/_authenticated/erp/hr/employees")({
  component: EmployeesPage,
  head: () => ({
    meta: [
      { title: "Employee Directory — Synq ERP HRM" },
      { name: "description", content: "Staff directory with department, designation, salary, contact details and ERP login mapping." },
      { property: "og:title", content: "Employee Directory — Synq ERP HRM" },
      { property: "og:description", content: "Manage employee profiles, departments, designations and salary records." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Employee = any;

const empty = {
  full_name: "",
  employee_code: "",
  phone: "",
  email: "",
  department_id: "",
  designation_id: "",
  join_date: "",
  employment_type: "full_time",
  status: "active",
  monthly_salary: "0",
  payment_method: "",
  payment_number: "",
  nid: "",
  date_of_birth: "",
  blood_group: "",
  address: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  user_id: "",
  notes: "",
  shift_start: DEFAULT_SCHEDULE.shift_start,
  shift_end: DEFAULT_SCHEDULE.shift_end,
  late_grace_min: "",
  overtime_rate: "0",
  overtime_holiday_multiplier: "2",
  overtime_min_minutes: "30",
};

function EmployeesPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [weekOffs, setWeekOffs] = useState<number[]>([...DEFAULT_SCHEDULE.week_offs]);
  const [otEnabled, setOtEnabled] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["hr-employees"],
    queryFn: async () => {
      const [emps, depts, desigs, profiles] = await Promise.all([
        supabase.from("hr_employees").select("*").order("full_name"),
        supabase.from("hr_departments").select("*").order("name"),
        supabase.from("hr_designations").select("*").order("title"),
        supabase.from("profiles").select("id, full_name, email").limit(500),
      ]);
      if (emps.error) throw new Error(emps.error.message);
      return {
        employees: emps.data ?? [],
        departments: depts.data ?? [],
        designations: desigs.data ?? [],
        profiles: (profiles.data ?? []) as any[],
      };
    },
  });

  const departments = data?.departments ?? [];
  const designations = data?.designations ?? [];

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.employees ?? []).filter((e: Employee) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (deptFilter !== "all" && e.department_id !== deptFilter) return false;
      if (!term) return true;
      return [e.full_name, e.employee_code, e.phone, e.email].some((v) =>
        String(v ?? "").toLowerCase().includes(term),
      );
    });
  }, [data, q, statusFilter, deptFilter]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim()) throw new Error("Naam dorkar");
      const payload: any = {
        full_name: form.full_name.trim(),
        employee_code: form.employee_code.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        department_id: form.department_id || null,
        designation_id: form.designation_id || null,
        join_date: form.join_date || null,
        employment_type: form.employment_type,
        status: form.status,
        monthly_salary: Number(form.monthly_salary) || 0,
        payment_method: form.payment_method.trim() || null,
        payment_number: form.payment_number.trim() || null,
        nid: form.nid.trim() || null,
        date_of_birth: form.date_of_birth || null,
        blood_group: form.blood_group.trim() || null,
        address: form.address.trim() || null,
        emergency_contact_name: form.emergency_contact_name.trim() || null,
        emergency_contact_phone: form.emergency_contact_phone.trim() || null,
        user_id: form.user_id || null,
        notes: form.notes.trim() || null,
        shift_start: hhmm(form.shift_start || DEFAULT_SCHEDULE.shift_start),
        shift_end: hhmm(form.shift_end || DEFAULT_SCHEDULE.shift_end),
        week_offs: weekOffs,
        late_grace_min: form.late_grace_min === "" ? null : Number(form.late_grace_min) || 0,
        overtime_enabled: otEnabled,
        overtime_rate: Number(form.overtime_rate) || 0,
        overtime_holiday_multiplier: Number(form.overtime_holiday_multiplier) || 1,
        overtime_min_minutes: Number(form.overtime_min_minutes) || 0,
      };
      if (editing) {
        const { error } = await supabase.from("hr_employees").update(payload).eq("id", editing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("hr_employees").insert(payload);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      toast.success("Employee saved");
      setOpen(false);
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["hr-employees"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_employees").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Employee deleted");
      setOpen(false);
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["hr-employees"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addDept = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("hr_departments").insert({ name });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr-employees"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ ...empty });
    setWeekOffs([...DEFAULT_SCHEDULE.week_offs]);
    setOtEnabled(false);
    setOpen(true);
  };
  const openEdit = (e: Employee) => {
    setEditing(e);
    setForm({
      ...empty,
      ...Object.fromEntries(
        Object.keys(empty).map((k) => [k, e[k] == null ? (k === "monthly_salary" ? "0" : "") : String(e[k])]),
      ),
      shift_start: hhmm(e.shift_start ?? DEFAULT_SCHEDULE.shift_start),
      shift_end: hhmm(e.shift_end ?? DEFAULT_SCHEDULE.shift_end),
      late_grace_min: e.late_grace_min == null ? "" : String(e.late_grace_min),
      overtime_rate: String(e.overtime_rate ?? 0),
      overtime_holiday_multiplier: String(e.overtime_holiday_multiplier ?? 2),
      overtime_min_minutes: String(e.overtime_min_minutes ?? 30),
    } as typeof empty);
    setWeekOffs(Array.isArray(e.week_offs) ? e.week_offs.map(Number) : [...DEFAULT_SCHEDULE.week_offs]);
    setOtEnabled(!!e.overtime_enabled);
    setOpen(true);
  };

  const nameOf = (list: any[], id: string | null, key: string) =>
    list.find((x) => x.id === id)?.[key] ?? "—";

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      <HrPageHeader
        icon={Users}
        title="Employees"
        subtitle={`${rows.length} record dekhano hocche`}
        actions={
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add employee
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Naam, code, phone…" className="h-9 pl-8" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            {EMPLOYEE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const name = window.prompt("Notun department name?");
            if (name?.trim()) addDept.mutate(name.trim());
          }}
        >
          + Department
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border/70 bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-2.5 text-left">Employee</th>
                  <th className="p-2.5 text-left">Department</th>
                  <th className="p-2.5 text-left">Designation</th>
                  <th className="p-2.5 text-left">Duty time</th>
                  <th className="p-2.5 text-left">Weekly off</th>
                  <th className="p-2.5 text-left">OT / hr</th>
                  <th className="p-2.5 text-right">Salary</th>
                  <th className="p-2.5 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Kono employee nei.</td></tr>
                ) : (
                  rows.map((e: Employee) => {
                    const sched = toSchedule(e);
                    return (
                    <tr
                      key={e.id}
                      onClick={() => openEdit(e)}
                      className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-muted/40"
                    >
                      <td className="p-2.5">
                        <p className="font-medium">{e.full_name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {e.employee_code ? `#${e.employee_code} • ` : ""}{e.phone ?? "no phone"}
                        </p>
                      </td>
                      <td className="p-2.5">{nameOf(departments, e.department_id, "name")}</td>
                      <td className="p-2.5">{nameOf(designations, e.designation_id, "title")}</td>
                      <td className="p-2.5 whitespace-nowrap text-[12px]">{shiftLabel(sched)}</td>
                      <td className="p-2.5 text-[12px]">{weekOffLabel(sched)}</td>
                      <td className="p-2.5 text-[12px]">
                        {e.overtime_enabled ? money(e.overtime_rate) : <span className="text-muted-foreground">Off</span>}
                      </td>
                      <td className="p-2.5 text-right tabular-nums">{money(e.monthly_salary)}</td>
                      <td className="p-2.5">
                        <Badge variant="outline" className={statusTone[e.status] ?? ""}>{e.status}</Badge>
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

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit employee" : "Add employee"}</SheetTitle>
          </SheetHeader>
          <div className="grid gap-3 py-4">
            <Field label="Full name">
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Employee code"><Input value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} /></Field>
              <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
              <Field label="Email"><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Join date"><Input type="date" value={form.join_date} onChange={(e) => setForm({ ...form, join_date: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Department">
                <Select value={form.department_id || "none"} onValueChange={(v) => setForm({ ...form, department_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Designation">
                <Select value={form.designation_id || "none"} onValueChange={(v) => setForm({ ...form, designation_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {designations.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Employment type">
                <Select value={form.employment_type} onValueChange={(v) => setForm({ ...form, employment_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EMPLOYEE_STATUSES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monthly salary"><Input type="number" value={form.monthly_salary} onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })} /></Field>
              <Field label="Pay method (bKash/Cash)"><Input value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} /></Field>
              <Field label="Pay number"><Input value={form.payment_number} onChange={(e) => setForm({ ...form, payment_number: e.target.value })} /></Field>
              <Field label="NID"><Input value={form.nid} onChange={(e) => setForm({ ...form, nid: e.target.value })} /></Field>
              <Field label="Date of birth"><Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></Field>
              <Field label="Blood group"><Input value={form.blood_group} onChange={(e) => setForm({ ...form, blood_group: e.target.value })} /></Field>
            </div>
            <Field label="ERP login account">
              <Select value={form.user_id || "none"} onValueChange={(v) => setForm({ ...form, user_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Link staff account" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked</SelectItem>
                  {(data?.profiles ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || p.email || p.id.slice(0, 8)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Emergency contact"><Input value={form.emergency_contact_name} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} /></Field>
              <Field label="Emergency phone"><Input value={form.emergency_contact_phone} onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })} /></Field>
            </div>
            <Field label="Address"><Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>

            <div className="rounded-xl border border-border/70 bg-muted/25 p-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Duty time & overtime</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Duty start">
                  <Input type="time" value={form.shift_start} onChange={(e) => setForm({ ...form, shift_start: e.target.value })} />
                </Field>
                <Field label="Duty end">
                  <Input type="time" value={form.shift_end} onChange={(e) => setForm({ ...form, shift_end: e.target.value })} />
                </Field>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Weekly off days</Label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEK_DAYS.map((d) => {
                    const on = weekOffs.includes(d.value);
                    return (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() =>
                          setWeekOffs(on ? weekOffs.filter((x) => x !== d.value) : [...weekOffs, d.value].sort((a, b) => a - b))
                        }
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          on ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {d.short}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Field label="Late grace minutes (khali rakhle company policy)">
                <Input
                  type="number"
                  min={0}
                  placeholder="Company policy"
                  value={form.late_grace_min}
                  onChange={(e) => setForm({ ...form, late_grace_min: e.target.value })}
                />
              </Field>
              <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Overtime</p>
                  <p className="text-[11px] text-muted-foreground">Duty shesh houar por extra hour count hobe</p>
                </div>
                <Switch checked={otEnabled} onCheckedChange={setOtEnabled} />
              </div>
              {otEnabled && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="OT rate (৳ / hour)">
                    <Input type="number" min={0} value={form.overtime_rate} onChange={(e) => setForm({ ...form, overtime_rate: e.target.value })} />
                  </Field>
                  <Field label="Off-day multiplier (x)">
                    <Input
                      type="number"
                      min={1}
                      step="0.25"
                      value={form.overtime_holiday_multiplier}
                      onChange={(e) => setForm({ ...form, overtime_holiday_multiplier: e.target.value })}
                    />
                  </Field>
                  <Field label="Minimum extra minutes">
                    <Input
                      type="number"
                      min={0}
                      value={form.overtime_min_minutes}
                      onChange={(e) => setForm({ ...form, overtime_min_minutes: e.target.value })}
                    />
                  </Field>
                </div>
              )}
            </div>
          </div>
          <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border/70 bg-background py-3">
            {editing ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => {
                  if (window.confirm("Ei employee delete korbo?")) remove.mutate(editing.id);
                }}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
              </Button>
            ) : <span />}
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}