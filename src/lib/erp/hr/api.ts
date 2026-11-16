/**
 * HRM data layer. Every write goes through a SECURITY DEFINER RPC that checks
 * the caller's role server-side; the client only ever SELECTs hr_* tables.
 * The generated Supabase types predate these objects, so calls go through an
 * untyped client and are typed here instead.
 */
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

// ─────────────────────────── types ───────────────────────────
export type EmployeeStatus = "active" | "probation" | "resigned" | "terminated";
export type EmploymentType = "full_time" | "part_time" | "contract" | "intern";
export type PaymentMethod = "cash" | "bkash" | "nagad" | "rocket" | "bank";

export type Employee = {
  id: string;
  user_id: string | null;
  brand_id: string | null;
  employee_code: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  photo_url: string | null;
  designation: string | null;
  department: string | null;
  employment_type: EmploymentType;
  status: EmployeeStatus;
  join_date: string;
  end_date: string | null;
  shift_start: string; // HH:MM:SS
  shift_end: string;
  break_start: string | null;
  break_end: string | null;
  break_minutes: number;
  work_days: number[];
  late_grace_min: number;
  ot_min_minutes: number;
  notes: string | null;
};

export type EmployeePay = {
  employee_id: string;
  monthly_salary: number;
  ot_enabled: boolean;
  ot_rate_per_hour: number | null;
  ot_multiplier: number;
  absent_deduction: boolean;
  payment_method: PaymentMethod;
  payment_account: string | null;
};

export type StaffLogin = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  roles: string[];
  employee_id: string | null;
};

export type PunchAction = "check_in" | "break_start" | "break_end" | "check_out";

export type MyStatus =
  | { linked: false; server_now: string }
  | {
      linked: true;
      server_now: string;
      employee: {
        id: string;
        full_name: string;
        employee_code: string;
        designation: string | null;
        status: EmployeeStatus;
        shift_start: string;
        shift_end: string;
        break_start: string | null;
        break_end: string | null;
        break_minutes: number;
        work_days: number[];
        sched_minutes: number;
      };
      today: {
        date: string;
        is_workday: boolean;
        holiday: string | null;
        on_leave: boolean;
        shift_start_at: string;
        shift_end_at: string;
      };
      state: "off" | "working" | "on_break";
      open_session_id: string | null;
      sessions: {
        id: string;
        work_date: string;
        check_in: string;
        check_out: string | null;
        auto_closed: boolean;
        breaks: { start: string; end: string | null }[];
      }[];
      worked_seconds: number;
      break_seconds: number;
    };

export type DayStatus =
  | "present"
  | "late"
  | "working"
  | "on_break"
  | "absent"
  | "off"
  | "holiday"
  | "leave"
  | "not_yet"
  | "upcoming"
  | "not_employed";

export type DayType =
  "workday" | "weekly_off" | "holiday" | "leave_paid" | "leave_unpaid" | "not_employed";

export type AttendanceDay = {
  employee_id: string;
  employee_name: string;
  employee_code: string;
  designation: string | null;
  brand_id: string | null;
  work_date: string;
  day_type: DayType;
  status: DayStatus;
  first_in: string | null;
  last_out: string | null;
  is_open: boolean;
  on_break: boolean;
  session_count: number;
  worked_min: number;
  break_min: number;
  sched_min: number;
  late_min: number;
  early_min: number;
  ot_min: number;
  auto_closed: boolean;
  holiday_title: string | null;
};

export type Session = {
  id: string;
  employee_id: string;
  work_date: string;
  check_in: string;
  check_out: string | null;
  auto_closed: boolean;
  source: "self" | "admin";
  note: string | null;
  edited_at: string | null;
  hr_breaks: { id: string; break_start: string; break_end: string | null }[];
};

export type Leave = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  paid: boolean;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

export type Holiday = { id: string; holiday_date: string; title: string };

export type PayrollRun = {
  id: string;
  period_month: string;
  period_from: string;
  period_to: string;
  brand_id: string | null;
  title: string | null;
  status: "draft" | "finalized" | "paid";
  employee_count: number;
  total_net: number;
  payout_account_id: string | null;
  paid_on: string | null;
  created_at: string;
  finalized_at: string | null;
  paid_at: string | null;
};

export type Payslip = {
  id: string;
  run_id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  brand_id: string | null;
  designation: string | null;
  monthly_salary: number;
  month_workdays: number;
  per_day_rate: number;
  ot_rate: number;
  period_workdays: number;
  present_days: number;
  late_days: number;
  absent_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  holiday_days: number;
  worked_minutes: number;
  ot_minutes: number;
  earned_basic: number;
  absent_amount: number;
  ot_amount: number;
  bonus: number;
  allowance: number;
  deduction: number;
  advance: number;
  previously_paid: number;
  net_pay: number;
  payment_method: string | null;
  payment_account: string | null;
  note: string | null;
};

export type StaffPerformance = {
  user_id: string | null;
  employee_id: string | null;
  name: string;
  designation: string | null;
  present_days: number;
  late_days: number;
  absent_days: number;
  worked_min: number;
  ot_min: number;
  confirmed: number;
  cancelled: number;
  packing: number;
  packed: number;
  ready_to_ship: number;
  shipped: number;
  returned: number;
  scans: number;
  total_actions: number;
  actions_per_hour: number | null;
  first_action: string | null;
  last_action: string | null;
};

export type ActivityItem = {
  at: string;
  user_id: string;
  name: string;
  order_id: string;
  invoice_no: string | null;
  from_status: string | null;
  to_status: string;
  via: "scan" | "manual";
  brand_id: string | null;
};

// ─────────────────────────── self-service ───────────────────────────
export const getMyStatus = () => rpc<MyStatus>("hr_my_status");
export const punch = (action: PunchAction) => rpc<MyStatus>("hr_punch", { _action: action });

export async function getMySessions(from: string, to: string): Promise<Session[]> {
  const { data, error } = await db
    .from("hr_sessions")
    .select(
      "id, employee_id, work_date, check_in, check_out, auto_closed, source, note, edited_at, hr_breaks(id, break_start, break_end)",
    )
    .gte("work_date", from)
    .lte("work_date", to)
    .order("check_in", { ascending: true });
  if (error) throw new Error(error.message);
  return data as Session[];
}

export const requestLeave = (start: string, end: string, paid: boolean, reason: string) =>
  rpc<string>("hr_request_leave", { _start: start, _end: end, _paid: paid, _reason: reason });
export const cancelMyLeave = (id: string) => rpc<void>("hr_cancel_my_leave", { _id: id });

// ─────────────────────────── attendance ───────────────────────────
export const getAttendanceDays = (from: string, to: string, employeeId?: string | null) =>
  rpc<AttendanceDay[]>("hr_attendance_days", {
    _from: from,
    _to: to,
    _employee_id: employeeId ?? null,
  });

export async function getSessions(
  employeeId: string,
  from: string,
  to: string,
): Promise<Session[]> {
  const { data, error } = await db
    .from("hr_sessions")
    .select(
      "id, employee_id, work_date, check_in, check_out, auto_closed, source, note, edited_at, hr_breaks(id, break_start, break_end)",
    )
    .eq("employee_id", employeeId)
    .gte("work_date", from)
    .lte("work_date", to)
    .order("check_in", { ascending: true });
  if (error) throw new Error(error.message);
  return data as Session[];
}

export const saveSession = (args: {
  id: string | null;
  employeeId: string;
  checkIn: string;
  checkOut: string | null;
  breaks: { start: string; end: string | null }[];
  note?: string | null;
}) =>
  rpc<string>("hr_admin_save_session", {
    _id: args.id,
    _employee_id: args.employeeId,
    _check_in: args.checkIn,
    _check_out: args.checkOut,
    _breaks: args.breaks,
    _note: args.note ?? null,
  });

export const deleteSession = (id: string) => rpc<void>("hr_admin_delete_session", { _id: id });

// ─────────────────────────── employees ───────────────────────────
export async function listEmployees(): Promise<Employee[]> {
  const { data, error } = await db.from("hr_employees").select("*").order("full_name");
  if (error) throw new Error(error.message);
  return data as Employee[];
}

export async function listPay(): Promise<EmployeePay[]> {
  const { data, error } = await db.from("hr_employee_pay").select("*");
  if (error) throw new Error(error.message);
  return (data as EmployeePay[]).map((p) => ({
    ...p,
    monthly_salary: Number(p.monthly_salary),
    ot_rate_per_hour: p.ot_rate_per_hour == null ? null : Number(p.ot_rate_per_hour),
    ot_multiplier: Number(p.ot_multiplier),
  }));
}

export const listStaffLogins = () => rpc<StaffLogin[]>("hr_list_staff_logins");

export const saveEmployee = (
  id: string | null,
  data: Record<string, unknown>,
  pay: Record<string, unknown> | null,
) => rpc<string>("hr_save_employee", { _id: id, _data: data, _pay: pay });

// ─────────────────────────── leaves & holidays ───────────────────────────
export async function listLeaves(from?: string): Promise<Leave[]> {
  let q = db.from("hr_leaves").select("*").order("start_date", { ascending: false }).limit(300);
  if (from) q = q.gte("end_date", from);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as Leave[];
}

export const saveLeave = (args: {
  id: string | null;
  employeeId: string;
  start: string;
  end: string;
  paid: boolean;
  reason: string;
}) =>
  rpc<string>("hr_save_leave", {
    _id: args.id,
    _employee_id: args.employeeId,
    _start: args.start,
    _end: args.end,
    _paid: args.paid,
    _reason: args.reason,
  });
export const decideLeave = (id: string, approve: boolean, paid?: boolean, note?: string) =>
  rpc<void>("hr_decide_leave", {
    _id: id,
    _approve: approve,
    _paid: paid ?? null,
    _note: note ?? null,
  });
export const deleteLeave = (id: string) => rpc<void>("hr_delete_leave", { _id: id });

export async function listHolidays(): Promise<Holiday[]> {
  const { data, error } = await db
    .from("hr_holidays")
    .select("id, holiday_date, title")
    .order("holiday_date");
  if (error) throw new Error(error.message);
  return data as Holiday[];
}
export async function addHoliday(date: string, title: string) {
  const { error } = await db.from("hr_holidays").insert({ holiday_date: date, title });
  if (error)
    throw new Error(
      error.message.includes("duplicate") ? "That date is already a holiday" : error.message,
    );
}
export async function removeHoliday(id: string) {
  const { error } = await db.from("hr_holidays").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─────────────────────────── payroll ───────────────────────────
const num = <T extends Record<string, unknown>>(row: T, keys: (keyof T)[]): T => {
  const out = { ...row };
  for (const k of keys) if (out[k] != null) (out[k] as unknown) = Number(out[k]);
  return out;
};

export async function listRuns(): Promise<PayrollRun[]> {
  const { data, error } = await db
    .from("hr_payroll_runs")
    .select("*")
    .order("period_month", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);
  return (data as PayrollRun[]).map((r) => num(r, ["total_net"]));
}

const SLIP_NUMS: (keyof Payslip)[] = [
  "monthly_salary",
  "per_day_rate",
  "ot_rate",
  "earned_basic",
  "absent_amount",
  "ot_amount",
  "bonus",
  "allowance",
  "deduction",
  "advance",
  "previously_paid",
  "net_pay",
];

export async function listPayslips(runId: string): Promise<Payslip[]> {
  const { data, error } = await db
    .from("hr_payslips")
    .select("*")
    .eq("run_id", runId)
    .order("employee_name");
  if (error) throw new Error(error.message);
  return (data as Payslip[]).map((p) => num(p, SLIP_NUMS));
}

export async function listMyPayslips(): Promise<
  (Payslip & {
    run: Pick<PayrollRun, "title" | "status" | "period_from" | "period_to" | "paid_on"> | null;
  })[]
> {
  const { data, error } = await db
    .from("hr_payslips")
    .select("*, run:hr_payroll_runs(title, status, period_from, period_to, paid_on)")
    .order("created_at", { ascending: false })
    .limit(24);
  if (error) throw new Error(error.message);
  return (data as (Payslip & { run: null })[]).map((p) => num(p, SLIP_NUMS));
}

export const generatePayroll = (
  month: string,
  asOf: string | null,
  brandId: string | null,
  title: string | null,
) =>
  rpc<string>("hr_payroll_generate", {
    _month: month,
    _as_of: asOf,
    _brand_id: brandId,
    _title: title,
  });
export const recalcPayroll = (runId: string, asOf?: string | null) =>
  rpc<void>("hr_payroll_recalculate", { _run_id: runId, _as_of: asOf ?? null });
export const updatePayslip = (
  id: string,
  v: { bonus: number; allowance: number; deduction: number; advance: number; note: string },
) =>
  rpc<void>("hr_payslip_update", {
    _id: id,
    _bonus: v.bonus,
    _allowance: v.allowance,
    _deduction: v.deduction,
    _advance: v.advance,
    _note: v.note,
  });
export const setPayrollStatus = (runId: string, status: "draft" | "finalized") =>
  rpc<void>("hr_payroll_set_status", { _run_id: runId, _status: status });
export const payPayroll = (
  runId: string,
  accountId: string | null,
  paidOn: string,
  postToFinance: boolean,
) =>
  rpc<{ posted: number; total: number }>("hr_payroll_pay", {
    _run_id: runId,
    _account_id: accountId,
    _paid_on: paidOn,
    _post_to_finance: postToFinance,
  });
export const deletePayroll = (runId: string) => rpc<void>("hr_payroll_delete", { _run_id: runId });

export async function listPayoutAccounts(): Promise<
  { id: string; name: string; brand_id: string | null; current_balance: number }[]
> {
  const { data, error } = await db
    .from("erp_accounts")
    .select("id, name, brand_id, current_balance")
    .eq("is_active", true)
    .order("name");
  if (error) return [];
  return (data ?? []).map(
    (a: { id: string; name: string; brand_id: string | null; current_balance: number }) => ({
      ...a,
      current_balance: Number(a.current_balance),
    }),
  );
}

// ─────────────────────────── performance ───────────────────────────
export const getPerformance = (from: string, to: string) =>
  rpc<StaffPerformance[]>("hr_staff_performance", { _from: from, _to: to });
export const getActivity = (fromIso: string, toIso: string, userId?: string | null, limit = 200) =>
  rpc<ActivityItem[]>("hr_activity_feed", {
    _from: fromIso,
    _to: toIso,
    _user_id: userId ?? null,
    _limit: limit,
  });
