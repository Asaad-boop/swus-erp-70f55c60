import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { toSchedule, holidayOn, type EmployeeSchedule } from "@/lib/erp/hr/schedule";

async function loadHoliday(supabase: any, workDate: string) {
  const { data } = await supabase.from("hr_holidays").select("holiday_date, title, is_recurring");
  return holidayOn((data ?? []) as any[], workDate);
}

const SCHEDULE_COLS =
  "shift_start, shift_end, week_offs, late_grace_min, overtime_enabled, overtime_rate, overtime_holiday_multiplier, overtime_min_minutes, break_allowance_min, unpaid_break, break_start, break_end";

/** Dhaka-local YYYY-MM-DD for a timestamp (defaults to now). */
function dhakaDate(d: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export type BreakRow = { id: string; break_start: string; break_end: string | null; kind: string };
export type EntryRow = {
  id: string;
  employee_id: string;
  work_date: string;
  check_in: string;
  check_out: string | null;
  breaks: BreakRow[];
};

async function resolveEmployee(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("hr_employees")
    .select(`id, full_name, employee_code, status, photo_url, ${SCHEDULE_COLS}`)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { ...data, schedule: toSchedule(data) } as {
    id: string;
    full_name: string;
    employee_code: string | null;
    status: string;
    photo_url: string | null;
    schedule: EmployeeSchedule;
  };
}

async function loadDay(supabase: any, employeeId: string, workDate: string) {
  const { data: entries, error } = await supabase
    .from("hr_time_entries")
    .select("id, employee_id, work_date, check_in, check_out")
    .eq("employee_id", employeeId)
    .eq("work_date", workDate)
    .order("check_in");
  if (error) throw new Error(error.message);
  const ids = (entries ?? []).map((e: any) => e.id);
  let breaks: any[] = [];
  if (ids.length) {
    const { data: b } = await supabase
      .from("hr_breaks")
      .select("id, time_entry_id, break_start, break_end, kind")
      .in("time_entry_id", ids)
      .order("break_start");
    breaks = b ?? [];
  }
  return (entries ?? []).map((e: any) => ({
    ...e,
    breaks: breaks
      .filter((b) => b.time_entry_id === e.id)
      .map((b) => ({ id: b.id, break_start: b.break_start, break_end: b.break_end, kind: b.kind ?? "other" })),
  })) as EntryRow[];
}

/** Current user's own attendance state for today. */
export const getMyAttendanceToday = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const employee = await resolveEmployee(context.supabase, context.userId);
    const workDate = dhakaDate();
    if (!employee) return { employee: null, workDate, holiday: null as string | null, entries: [] as EntryRow[], serverNow: new Date().toISOString() };
    return {
      employee,
      workDate,
      holiday: await loadHoliday(context.supabase, workDate),
      entries: await loadDay(context.supabase, employee.id, workDate),
      serverNow: new Date().toISOString(),
    };
  });

/** Starts a new work session (check in). */
export const punchIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    const employee = await resolveEmployee(supabase, context.userId);
    if (!employee) throw new Error("Tomar ERP account kono employee profile er sathe link kora nei. HR ke bolo.");
    const workDate = dhakaDate();
    // Close any session left open from a previous day (missed checkout) before starting today's.
    const { data: stale } = await supabase
      .from("hr_time_entries")
      .select("id")
      .eq("employee_id", employee.id)
      .is("check_out", null)
      .lt("work_date", workDate)
      .limit(1);
    if (stale?.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (supabaseAdmin as any).rpc("hr_auto_close_stale_sessions");
    }
    const open = (await loadDay(supabase, employee.id, workDate)).find((e) => !e.check_out);
    if (open) return { entryId: open.id, alreadyOpen: true };
    const { data, error } = await supabase
      .from("hr_time_entries")
      .insert({ employee_id: employee.id, work_date: workDate, check_in: new Date().toISOString() })
      .select("id")
      .single();
    if (error) {
      // Double tap race: the unique open-session index rejected a second insert.
      if (error.code === "23505") {
        const again = (await loadDay(supabase, employee.id, workDate)).find((e) => !e.check_out);
        if (again) return { entryId: again.id, alreadyOpen: true };
      }
      throw new Error(error.message);
    }
    return { entryId: data.id as string, alreadyOpen: false };
  });

/** Closes the open session (auto-ends a running break first). */
export const punchOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    const employee = await resolveEmployee(supabase, context.userId);
    if (!employee) throw new Error("Employee profile link kora nei.");
    const workDate = dhakaDate();
    const open = (await loadDay(supabase, employee.id, workDate)).find((e) => !e.check_out);
    if (!open) return { closed: false };
    const now = new Date().toISOString();
    const running = open.breaks.find((b) => !b.break_end);
    if (running) await supabase.from("hr_breaks").update({ break_end: now }).eq("id", running.id);
    const { error } = await supabase.from("hr_time_entries").update({ check_out: now }).eq("id", open.id);
    if (error) throw new Error(error.message);
    return { closed: true };
  });

/** Starts a break on the currently open session. */
export const startBreak = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { kind?: string } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const employee = await resolveEmployee(supabase, context.userId);
    if (!employee) throw new Error("Employee profile link kora nei.");
    const open = (await loadDay(supabase, employee.id, dhakaDate())).find((e) => !e.check_out);
    if (!open) throw new Error("Age check in koro.");
    if (open.breaks.some((b) => !b.break_end)) return { started: false };
    const kind = ["lunch", "prayer", "tea", "personal", "other"].includes(String(data.kind))
      ? String(data.kind)
      : "other";
    const { error } = await supabase
      .from("hr_breaks")
      .insert({ time_entry_id: open.id, employee_id: employee.id, break_start: new Date().toISOString(), kind });
    if (error) throw new Error(error.message);
    return { started: true };
  });

/** Ends the running break. */
export const endBreak = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    const employee = await resolveEmployee(supabase, context.userId);
    if (!employee) throw new Error("Employee profile link kora nei.");
    const open = (await loadDay(supabase, employee.id, dhakaDate())).find((e) => !e.check_out);
    const running = open?.breaks.find((b) => !b.break_end);
    if (!running) return { ended: false };
    const { error } = await supabase.from("hr_breaks").update({ break_end: new Date().toISOString() }).eq("id", running.id);
    if (error) throw new Error(error.message);
    return { ended: true };
  });

export type LiveEmployee = {
  id: string;
  full_name: string;
  employee_code: string | null;
  photo_url: string | null;
  department: string | null;
  schedule: EmployeeSchedule;
  entries: EntryRow[];
  state: "present" | "on_break" | "left" | "not_in";
  firstIn: string | null;
  lastOut: string | null;
  workMs: number;
  breakMs: number;
};

/** Whole-team live board for a given date (defaults to today). */
export const getLiveBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { date?: string } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const workDate = data.date || dhakaDate();
    const nowIso = new Date().toISOString();

    const [{ data: emps, error: eErr }, { data: entries }, { data: depts }] = await Promise.all([
      supabase
        .from("hr_employees")
        .select(`id, full_name, employee_code, photo_url, department_id, status, ${SCHEDULE_COLS}`)
        .in("status", ["active", "probation", "on_leave"])
        .order("full_name"),
      supabase
        .from("hr_time_entries")
        .select("id, employee_id, work_date, check_in, check_out")
        .eq("work_date", workDate)
        .order("check_in"),
      supabase.from("hr_departments").select("id, name"),
    ]);
    if (eErr) throw new Error(eErr.message);

    const entryIds = (entries ?? []).map((e: any) => e.id);
    let breaks: any[] = [];
    if (entryIds.length) {
      const { data: b } = await supabase
        .from("hr_breaks")
        .select("id, time_entry_id, employee_id, break_start, break_end, kind")
        .in("time_entry_id", entryIds)
        .order("break_start");
      breaks = b ?? [];
    }
    const deptName = new Map((depts ?? []).map((d: any) => [d.id, d.name as string]));

    const rows: LiveEmployee[] = (emps ?? []).map((e: any) => {
      const mine = (entries ?? [])
        .filter((x: any) => x.employee_id === e.id)
        .map((x: any) => ({
          ...x,
          breaks: breaks
            .filter((b) => b.time_entry_id === x.id)
            .map((b) => ({ id: b.id, break_start: b.break_start, break_end: b.break_end, kind: b.kind ?? "other" })),
        })) as EntryRow[];

      let workMs = 0;
      let breakMs = 0;
      for (const en of mine) {
        workMs += (en.check_out ? Date.parse(en.check_out) : Date.parse(nowIso)) - Date.parse(en.check_in);
        for (const b of en.breaks) {
          breakMs += (b.break_end ? Date.parse(b.break_end) : Date.parse(nowIso)) - Date.parse(b.break_start);
        }
      }
      const open = mine.find((x) => !x.check_out);
      const onBreak = !!open?.breaks.some((b) => !b.break_end);
      const state: LiveEmployee["state"] = open ? (onBreak ? "on_break" : "present") : mine.length ? "left" : "not_in";

      return {
        id: e.id,
        full_name: e.full_name,
        employee_code: e.employee_code,
        photo_url: e.photo_url,
        department: e.department_id ? deptName.get(e.department_id) ?? null : null,
        schedule: toSchedule(e),
        entries: mine,
        state,
        firstIn: mine[0]?.check_in ?? null,
        lastOut: mine.length && mine.every((x) => x.check_out) ? mine[mine.length - 1]!.check_out : null,
        workMs: Math.max(0, workMs - breakMs),
        breakMs,
      };
    });

    return { workDate, serverNow: nowIso, rows };
  });