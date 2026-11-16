import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, Link2, Pencil, Plus, Search, UserPlus, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DataPanel, EmptyState } from "@/components/erp/ui";
import { HrPage, NoAccess, useHrRole } from "@/components/erp/hr/hr-shell";
import { useBrand } from "@/contexts/brand-context";
import { cn } from "@/lib/utils";
import {
  listEmployees,
  listPay,
  listStaffLogins,
  saveEmployee,
  type Employee,
  type EmployeePay,
  type EmployeeStatus,
  type EmploymentType,
  type PaymentMethod,
} from "@/lib/erp/hr/api";
import { WEEKDAYS, dhakaToday, errorText, hm, money, time12 } from "@/lib/erp/hr/format";

export const Route = createFileRoute("/_authenticated/erp/hr/employees")({
  head: () => ({ meta: [{ title: "Employees — HRM" }] }),
  component: EmployeesPage,
});

const STATUS_STYLE: Record<EmployeeStatus, string> = {
  active: "bg-emerald-500/10 text-emerald-700",
  probation: "bg-amber-500/10 text-amber-700",
  resigned: "bg-muted text-muted-foreground",
  terminated: "bg-rose-500/10 text-rose-700",
};

function EmployeesPage() {
  const { isManager, canPay, isLoading } = useHrRole();
  const { brands } = useBrand();
  const [q, setQ] = useState("");
  const [showFormer, setShowFormer] = useState(false);
  const [editing, setEditing] = useState<Employee | "new" | null>(null);

  const emps = useQuery({
    queryKey: ["hr", "employees"],
    enabled: isManager,
    queryFn: listEmployees,
  });
  const pay = useQuery({ queryKey: ["hr", "pay"], enabled: canPay, queryFn: listPay });
  const logins = useQuery({
    queryKey: ["hr", "logins"],
    enabled: isManager,
    queryFn: listStaffLogins,
  });

  const payBy = useMemo(() => new Map((pay.data ?? []).map((p) => [p.employee_id, p])), [pay.data]);
  const loginBy = useMemo(
    () => new Map((logins.data ?? []).map((l) => [l.user_id, l])),
    [logins.data],
  );
  const brandName = (id: string | null) =>
    id ? (brands.find((b) => b.id === id)?.name ?? "—") : "Shared";

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (emps.data ?? [])
      .filter((e) => showFormer || e.status === "active" || e.status === "probation")
      .filter(
        (e) =>
          !term ||
          `${e.full_name} ${e.employee_code} ${e.designation ?? ""} ${e.phone ?? ""}`
            .toLowerCase()
            .includes(term),
      );
  }, [emps.data, q, showFormer]);

  const activeCount = (emps.data ?? []).filter(
    (e) => e.status === "active" || e.status === "probation",
  ).length;
  const payroll = canPay
    ? (emps.data ?? [])
        .filter((e) => e.status === "active" || e.status === "probation")
        .reduce((s, e) => s + (payBy.get(e.id)?.monthly_salary ?? 0), 0)
    : null;
  const unlinked = (emps.data ?? []).filter(
    (e) => (e.status === "active" || e.status === "probation") && !e.user_id,
  ).length;

  if (isLoading)
    return (
      <div className="p-6">
        <Skeleton className="h-40" />
      </div>
    );
  if (!isManager) return <NoAccess what="employees" />;

  return (
    <HrPage
      title="Employees"
      subtitle={`${activeCount} active${payroll != null ? ` · Monthly salary ${money(payroll)}` : ""}${unlinked ? ` · ${unlinked} without login` : ""}`}
      actions={
        <Button size="sm" onClick={() => setEditing("new")} className="gap-1.5">
          <UserPlus className="size-4" /> Add employee
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search name, code, phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={showFormer} onCheckedChange={setShowFormer} /> Show former staff
        </label>
      </div>

      <DataPanel flush>
        {emps.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-40" />
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Users className="size-5" />}
            title="No employees yet"
            description="Add each staff member with their duty time, break, working days and salary."
            action={
              <Button size="sm" onClick={() => setEditing("new")}>
                <Plus className="size-4" /> Add employee
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Employee</th>
                  <th className="px-3 py-2.5">Duty</th>
                  <th className="px-3 py-2.5">Working days</th>
                  <th className="px-3 py-2.5">Brand</th>
                  {canPay && <th className="px-3 py-2.5 text-right">Salary</th>}
                  <th className="px-3 py-2.5">Login</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.map((e) => {
                  const p = payBy.get(e.id);
                  const login = e.user_id ? loginBy.get(e.user_id) : null;
                  return (
                    <tr
                      key={e.id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => setEditing(e)}
                    >
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{e.full_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {e.employee_code}
                          {e.designation ? ` · ${e.designation}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div>
                          {time12(e.shift_start)} – {time12(e.shift_end)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Break{" "}
                          {e.break_start && e.break_end
                            ? `${time12(e.break_start)}–${time12(e.break_end)}`
                            : `${e.break_minutes}m`}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-0.5">
                          {WEEKDAYS.map((d) => (
                            <span
                              key={d.v}
                              className={cn(
                                "grid size-6 place-items-center rounded text-[10px] font-medium",
                                e.work_days.includes(d.v)
                                  ? "bg-primary/10 text-primary"
                                  : "bg-muted text-muted-foreground/60 line-through",
                              )}
                            >
                              {d.short[0]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{brandName(e.brand_id)}</td>
                      {canPay && (
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                          {p ? money(p.monthly_salary) : "—"}
                        </td>
                      )}
                      <td className="px-3 py-2.5">
                        {login ? (
                          <span className="inline-flex items-center gap-1 text-xs">
                            <Link2 className="size-3 text-emerald-600" />
                            {login.display_name ?? login.email}
                          </span>
                        ) : (
                          <span className="text-xs text-amber-700">Not linked</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
                            STATUS_STYLE[e.status],
                          )}
                        >
                          {e.status}
                        </span>
                      </td>
                      <td className="px-2">
                        <Pencil className="size-3.5 text-muted-foreground" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DataPanel>

      <EmployeeSheet
        open={editing != null}
        employee={editing === "new" ? null : editing}
        pay={editing && editing !== "new" ? (payBy.get(editing.id) ?? null) : null}
        canPay={canPay}
        logins={logins.data ?? []}
        onClose={() => setEditing(null)}
      />
    </HrPage>
  );
}

type Form = {
  full_name: string;
  phone: string;
  email: string;
  designation: string;
  department: string;
  brand_id: string;
  employment_type: EmploymentType;
  status: EmployeeStatus;
  join_date: string;
  end_date: string;
  user_id: string;
  shift_start: string;
  shift_end: string;
  break_start: string;
  break_end: string;
  break_minutes: number;
  work_days: number[];
  late_grace_min: number;
  ot_min_minutes: number;
  notes: string;
  monthly_salary: string;
  ot_enabled: boolean;
  ot_mode: "auto" | "fixed";
  ot_rate_per_hour: string;
  ot_multiplier: string;
  absent_deduction: boolean;
  payment_method: PaymentMethod;
  payment_account: string;
};

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");
const mins = (a: string, b: string) => {
  if (!a || !b) return 0;
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  let d = bh * 60 + bm - (ah * 60 + am);
  if (d <= 0) d += 24 * 60;
  return d;
};

function toForm(e: Employee | null, p: EmployeePay | null): Form {
  return {
    full_name: e?.full_name ?? "",
    phone: e?.phone ?? "",
    email: e?.email ?? "",
    designation: e?.designation ?? "",
    department: e?.department ?? "",
    brand_id: e?.brand_id ?? "",
    employment_type: e?.employment_type ?? "full_time",
    status: e?.status ?? "active",
    join_date: e?.join_date ?? dhakaToday(),
    end_date: e?.end_date ?? "",
    user_id: e?.user_id ?? "",
    shift_start: hhmm(e?.shift_start) || "10:00",
    shift_end: hhmm(e?.shift_end) || "19:00",
    break_start: e ? hhmm(e.break_start) : "14:00",
    break_end: e ? hhmm(e.break_end) : "15:00",
    break_minutes: e?.break_minutes ?? 60,
    work_days: e?.work_days ?? [6, 0, 1, 2, 3, 4],
    late_grace_min: e?.late_grace_min ?? 10,
    ot_min_minutes: e?.ot_min_minutes ?? 30,
    notes: e?.notes ?? "",
    monthly_salary: p ? String(p.monthly_salary) : "",
    ot_enabled: p?.ot_enabled ?? true,
    ot_mode: p?.ot_rate_per_hour != null ? "fixed" : "auto",
    ot_rate_per_hour: p?.ot_rate_per_hour != null ? String(p.ot_rate_per_hour) : "",
    ot_multiplier: String(p?.ot_multiplier ?? 1),
    absent_deduction: p?.absent_deduction ?? true,
    payment_method: p?.payment_method ?? "cash",
    payment_account: p?.payment_account ?? "",
  };
}

function EmployeeSheet({
  open,
  employee,
  pay,
  canPay,
  logins,
  onClose,
}: {
  open: boolean;
  employee: Employee | null;
  pay: EmployeePay | null;
  canPay: boolean;
  logins: {
    user_id: string;
    display_name: string | null;
    email: string | null;
    employee_id: string | null;
    roles: string[];
  }[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { brands } = useBrand();
  const [f, setF] = useState<Form>(() => toForm(employee, pay));
  useEffect(() => {
    if (open) setF(toForm(employee, pay));
  }, [open, employee, pay]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));

  // Break window drives the break allowance unless the window is cleared.
  const windowMin = f.break_start && f.break_end ? mins(f.break_start, f.break_end) : 0;
  useEffect(() => {
    if (windowMin > 0 && windowMin < 600) setF((s) => ({ ...s, break_minutes: windowMin }));
  }, [windowMin]);

  const shiftMin = mins(f.shift_start, f.shift_end);
  const netMin = Math.max(0, shiftMin - f.break_minutes);
  const salary = Number(f.monthly_salary) || 0;
  const workdaysPerMonth = Math.round((f.work_days.length * 30) / 7);
  const perDay = workdaysPerMonth ? salary / workdaysPerMonth : 0;
  const hourly = netMin ? perDay / (netMin / 60) : 0;
  const otRate =
    f.ot_mode === "fixed"
      ? Number(f.ot_rate_per_hour) || 0
      : hourly * (Number(f.ot_multiplier) || 1);

  const save = useMutation({
    mutationFn: () => {
      if (!f.full_name.trim()) throw new Error("নাম দিন");
      if (f.work_days.length === 0) throw new Error("অন্তত একটা working day বাছাই করুন");
      const data = {
        full_name: f.full_name,
        phone: f.phone,
        email: f.email,
        designation: f.designation,
        department: f.department,
        brand_id: f.brand_id,
        employment_type: f.employment_type,
        status: f.status,
        join_date: f.join_date,
        end_date:
          f.status === "resigned" || f.status === "terminated"
            ? f.end_date || dhakaToday()
            : f.end_date,
        user_id: f.user_id,
        shift_start: f.shift_start,
        shift_end: f.shift_end,
        break_start: f.break_start,
        break_end: f.break_end,
        break_minutes: f.break_minutes,
        work_days: f.work_days,
        late_grace_min: f.late_grace_min,
        ot_min_minutes: f.ot_min_minutes,
        notes: f.notes,
      };
      const payload = canPay
        ? {
            monthly_salary: f.monthly_salary || "0",
            ot_enabled: f.ot_enabled,
            ot_rate_per_hour: f.ot_mode === "fixed" ? f.ot_rate_per_hour : "",
            ot_multiplier: f.ot_multiplier,
            absent_deduction: f.absent_deduction,
            payment_method: f.payment_method,
            payment_account: f.payment_account,
          }
        : null;
      return saveEmployee(employee?.id ?? null, data, payload);
    },
    onSuccess: () => {
      toast.success(employee ? "Saved" : "Employee added");
      void qc.invalidateQueries({ queryKey: ["hr"] });
      onClose();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const availableLogins = logins.filter((l) => !l.employee_id || l.employee_id === employee?.id);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{employee ? `Edit ${employee.full_name}` : "Add employee"}</SheetTitle>
        </SheetHeader>

        <div className="mt-5 space-y-6 pb-24">
          <Section title="Basic info" icon={<Users className="size-4" />}>
            <Grid>
              <Field label="Full name *" span>
                <Input value={f.full_name} onChange={(e) => set("full_name", e.target.value)} />
              </Field>
              <Field label="Phone">
                <Input value={f.phone} onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field label="Email">
                <Input value={f.email} onChange={(e) => set("email", e.target.value)} />
              </Field>
              <Field label="Designation">
                <Input
                  placeholder="Packer, Moderator…"
                  value={f.designation}
                  onChange={(e) => set("designation", e.target.value)}
                />
              </Field>
              <Field label="Department">
                <Input
                  placeholder="Logistics, Sales…"
                  value={f.department}
                  onChange={(e) => set("department", e.target.value)}
                />
              </Field>
              <Field label="Cost brand">
                <Select
                  value={f.brand_id || "shared"}
                  onValueChange={(v) => set("brand_id", v === "shared" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shared">Shared (all brands)</SelectItem>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Type">
                <Select
                  value={f.employment_type}
                  onValueChange={(v) => set("employment_type", v as EmploymentType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">Full time</SelectItem>
                    <SelectItem value="part_time">Part time</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="intern">Intern</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={f.status} onValueChange={(v) => set("status", v as EmployeeStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="probation">Probation</SelectItem>
                    <SelectItem value="resigned">Resigned</SelectItem>
                    <SelectItem value="terminated">Terminated</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Join date">
                <Input
                  type="date"
                  value={f.join_date}
                  onChange={(e) => set("join_date", e.target.value)}
                />
              </Field>
              {(f.status === "resigned" || f.status === "terminated" || f.end_date) && (
                <Field label="Last working day">
                  <Input
                    type="date"
                    value={f.end_date}
                    onChange={(e) => set("end_date", e.target.value)}
                  />
                </Field>
              )}
            </Grid>
            <Field label="ERP login (for check-in)">
              <Select
                value={f.user_id || "none"}
                onValueChange={(v) => set("user_id", v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No login yet</SelectItem>
                  {availableLogins.map((l) => (
                    <SelectItem key={l.user_id} value={l.user_id}>
                      {l.display_name ?? l.email} · {l.roles.join(", ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Login না থাকলে আগে{" "}
                <Link to={"/erp/access" as never} className="text-primary underline">
                  Users &amp; Access
                </Link>{" "}
                থেকে বানিয়ে নিন।
              </p>
            </Field>
          </Section>

          <Section title="Duty schedule" icon={<Clock className="size-4" />}>
            <Grid>
              <Field label="Duty starts">
                <Input
                  type="time"
                  value={f.shift_start}
                  onChange={(e) => set("shift_start", e.target.value)}
                />
              </Field>
              <Field label="Duty ends">
                <Input
                  type="time"
                  value={f.shift_end}
                  onChange={(e) => set("shift_end", e.target.value)}
                />
              </Field>
              <Field label="Break from">
                <Input
                  type="time"
                  value={f.break_start}
                  onChange={(e) => set("break_start", e.target.value)}
                />
              </Field>
              <Field label="Break to">
                <Input
                  type="time"
                  value={f.break_end}
                  onChange={(e) => set("break_end", e.target.value)}
                />
              </Field>
              <Field label="Break allowance (min)">
                <Input
                  type="number"
                  min={0}
                  value={f.break_minutes}
                  onChange={(e) => set("break_minutes", Number(e.target.value))}
                />
              </Field>
              <Field label="Late after (grace, min)">
                <Input
                  type="number"
                  min={0}
                  value={f.late_grace_min}
                  onChange={(e) => set("late_grace_min", Number(e.target.value))}
                />
              </Field>
            </Grid>
            <div>
              <Label className="text-xs">Working days (বাকি দিন weekly off)</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => {
                  const on = f.work_days.includes(d.v);
                  return (
                    <button
                      key={d.v}
                      type="button"
                      onClick={() =>
                        set(
                          "work_days",
                          on ? f.work_days.filter((x) => x !== d.v) : [...f.work_days, d.v],
                        )
                      }
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "bg-card text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {d.short}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Daily duty {hm(shiftMin)} − break {hm(f.break_minutes)} ={" "}
              <b className="text-foreground">{hm(netMin)} work</b> · {f.work_days.length} days/week
            </p>
          </Section>

          {canPay && (
            <Section title="Salary & overtime" icon={<Wallet className="size-4" />}>
              <Grid>
                <Field label="Monthly salary (৳)">
                  <Input
                    type="number"
                    min={0}
                    value={f.monthly_salary}
                    onChange={(e) => set("monthly_salary", e.target.value)}
                  />
                </Field>
                <Field label="Payment method">
                  <Select
                    value={f.payment_method}
                    onValueChange={(v) => set("payment_method", v as PaymentMethod)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bkash">bKash</SelectItem>
                      <SelectItem value="nagad">Nagad</SelectItem>
                      <SelectItem value="rocket">Rocket</SelectItem>
                      <SelectItem value="bank">Bank</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Account / number" span>
                  <Input
                    value={f.payment_account}
                    onChange={(e) => set("payment_account", e.target.value)}
                  />
                </Field>
              </Grid>
              <div className="space-y-3 rounded-lg border p-3">
                <label className="flex items-center justify-between text-sm font-medium">
                  Overtime paid{" "}
                  <Switch checked={f.ot_enabled} onCheckedChange={(v) => set("ot_enabled", v)} />
                </label>
                {f.ot_enabled && (
                  <Grid>
                    <Field label="OT rate">
                      <Select
                        value={f.ot_mode}
                        onValueChange={(v) => set("ot_mode", v as "auto" | "fixed")}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto (hourly salary × multiplier)</SelectItem>
                          <SelectItem value="fixed">Fixed ৳ per hour</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    {f.ot_mode === "auto" ? (
                      <Field label="Multiplier">
                        <Input
                          type="number"
                          step="0.25"
                          min={0.25}
                          value={f.ot_multiplier}
                          onChange={(e) => set("ot_multiplier", e.target.value)}
                        />
                      </Field>
                    ) : (
                      <Field label="৳ per OT hour">
                        <Input
                          type="number"
                          min={0}
                          value={f.ot_rate_per_hour}
                          onChange={(e) => set("ot_rate_per_hour", e.target.value)}
                        />
                      </Field>
                    )}
                    <Field label="Count OT after (min extra)">
                      <Input
                        type="number"
                        min={0}
                        value={f.ot_min_minutes}
                        onChange={(e) => set("ot_min_minutes", Number(e.target.value))}
                      />
                    </Field>
                  </Grid>
                )}
                <label className="flex items-center justify-between text-sm font-medium">
                  Cut salary for absent days{" "}
                  <Switch
                    checked={f.absent_deduction}
                    onCheckedChange={(v) => set("absent_deduction", v)}
                  />
                </label>
              </div>
              {salary > 0 && (
                <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  ≈ {money(perDay)}/day · {money(hourly)}/hour
                  {f.ot_enabled ? ` · OT ${money(otRate)}/hour` : ""}
                  <span className="block opacity-70">
                    Exact per-day rate is worked out each month from that month's working days and
                    holidays.
                  </span>
                </p>
              )}
            </Section>
          )}

          <Field label="Notes">
            <Textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>

        <div className="sticky bottom-0 -mx-6 flex justify-end gap-2 border-t bg-background px-6 py-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {employee ? "Save changes" : "Add employee"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}
function Field({
  label,
  children,
  span,
}: {
  label: string;
  children: React.ReactNode;
  span?: boolean;
}) {
  return (
    <div className={cn("space-y-1", span && "sm:col-span-2")}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
