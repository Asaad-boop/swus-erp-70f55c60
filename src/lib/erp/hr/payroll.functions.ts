import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { toSchedule, isWeekOff } from "@/lib/erp/hr/schedule";

/** First day (YYYY-MM-01) of a `YYYY-MM` string. */
function monthStart(month: string) {
  return `${month}-01`;
}
function monthEnd(month: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

/** Dhaka-local YYYY-MM-DD (payout dates must not roll over at UTC midnight). */
function dhakaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Creates (or refreshes) the payroll run for a month and drafts one payslip
 * per active employee, pre-filling attendance-derived present/absent days.
 */
export const generatePayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { month: string; brandId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const period = monthStart(data.month);

    const { data: runRows } = await supabase
      .from("hr_payroll_runs")
      .select("*")
      .eq("period_month", period)
      .order("created_at", { ascending: false })
      .limit(1);
    let run = (runRows ?? [])[0] ?? null;

    if (!run) {
      const { data: created, error } = await supabase
        .from("hr_payroll_runs")
        .insert({ period_month: period, brand_id: data.brandId ?? null, status: "draft" })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      run = created;
    }
    if (run.status === "paid") return { runId: run.id, created: 0, skipped: true };

    const { data: employees, error: eErr } = await supabase
      .from("hr_employees")
      .select("id, monthly_salary, shift_start, shift_end, week_offs, late_grace_min, overtime_enabled, overtime_rate, overtime_holiday_multiplier, overtime_min_minutes")
      .in("status", ["active", "probation", "on_leave"]);
    if (eErr) throw new Error(eErr.message);

    const { data: att } = await supabase
      .from("hr_attendance")
      .select("employee_id, status, work_date, overtime_minutes")
      .gte("work_date", period)
      .lte("work_date", monthEnd(data.month));

    const present = new Map<string, number>();
    const absent = new Map<string, number>();
    const otPay = new Map<string, number>();
    const schedules = new Map(
      (employees ?? []).map((e: any) => [e.id as string, toSchedule(e)]),
    );
    for (const a of att ?? []) {
      const key = a.employee_id as string;
      // Approved leave is paid time, so it counts toward present days — not absent.
      const paid = a.status === "present" || a.status === "late" || a.status === "half_day" || a.status === "leave";
      if (a.status === "absent") {
        absent.set(key, (absent.get(key) ?? 0) + 1);
      } else if (paid) {
        present.set(key, (present.get(key) ?? 0) + (a.status === "half_day" ? 0.5 : 1));
      }
      const sched = schedules.get(key);
      const mins = Number(a.overtime_minutes ?? 0);
      if (sched?.overtime_enabled && mins > 0) {
        const mult = isWeekOff(sched, String(a.work_date).slice(0, 10)) ? Number(sched.overtime_holiday_multiplier) || 1 : 1;
        otPay.set(key, (otPay.get(key) ?? 0) + (mins / 60) * (Number(sched.overtime_rate) || 0) * mult);
      }
    }

    const { data: existing } = await supabase
      .from("hr_payslips")
      .select("employee_id")
      .eq("run_id", run.id);
    const have = new Set((existing ?? []).map((r) => r.employee_id as string));

    const rows = (employees ?? [])
      .filter((e) => !have.has(e.id))
      .map((e) => {
        const ot = Math.round((otPay.get(e.id) ?? 0) * 100) / 100;
        return {
          run_id: run!.id,
          employee_id: e.id,
          base_salary: Number(e.monthly_salary ?? 0),
          present_days: present.get(e.id) ?? 0,
          absent_days: absent.get(e.id) ?? 0,
          overtime_amount: ot,
          net_pay: Number(e.monthly_salary ?? 0) + ot,
        };
      });

    if (rows.length) {
      const { error } = await supabase.from("hr_payslips").insert(rows);
      if (error) throw new Error(error.message);
    }

    // Refresh attendance + overtime on payslips that already exist (re-generate).
    for (const e of employees ?? []) {
      if (!have.has(e.id)) continue;
      const ot = Math.round((otPay.get(e.id) ?? 0) * 100) / 100;
      await supabase
        .from("hr_payslips")
        .update({
          present_days: present.get(e.id) ?? 0,
          absent_days: absent.get(e.id) ?? 0,
          overtime_amount: ot,
        })
        .eq("run_id", run!.id)
        .eq("employee_id", e.id)
        .neq("status", "paid");
    }
    await recalcNetPay(supabase, run!.id);

    await recalcTotals(supabase, run.id);
    return { runId: run.id, created: rows.length, skipped: false };
  });

/** net = base + bonus + overtime + allowance − deduction − advance. */
async function recalcNetPay(supabase: any, runId: string) {
  const { data: slips } = await supabase
    .from("hr_payslips")
    .select("id, base_salary, bonus, overtime_amount, allowance, deduction, advance_deduction, status")
    .eq("run_id", runId);
  for (const s of slips ?? []) {
    if (s.status === "paid") continue;
    const net =
      Number(s.base_salary) + Number(s.bonus) + Number(s.overtime_amount) + Number(s.allowance) -
      Number(s.deduction) - Number(s.advance_deduction);
    await supabase.from("hr_payslips").update({ net_pay: Math.round(net * 100) / 100 }).eq("id", s.id);
  }
}

/** Edits one payslip amount and re-derives its net pay + run totals. */
export const updatePayslip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { payslipId: string; patch: Record<string, number> }) => d)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const allowed = ["bonus", "overtime_amount", "allowance", "deduction", "advance_deduction"];
    const patch: Record<string, number> = {};
    for (const [k, v] of Object.entries(data.patch)) if (allowed.includes(k)) patch[k] = Number(v) || 0;
    if (!Object.keys(patch).length) throw new Error("Kichu change nei");

    const { data: slip, error } = await supabase
      .from("hr_payslips")
      .update(patch as never)
      .eq("id", data.payslipId)
      .neq("status", "paid")
      .select("run_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!slip) throw new Error("Paid payslip edit kora jabe na");

    await recalcNetPay(supabase, slip.run_id);
    return recalcTotals(supabase, slip.run_id);
  });

/** Removes an unpaid payroll run with its draft payslips. */
export const deletePayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { runId: string }) => d)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: run, error } = await supabase
      .from("hr_payroll_runs")
      .select("id, status")
      .eq("id", data.runId)
      .single();
    if (error) throw new Error(error.message);
    if (run.status === "paid") throw new Error("Paid payroll delete kora jabe na");
    await supabase.from("hr_payslips").delete().eq("run_id", run.id);
    const { error: dErr } = await supabase.from("hr_payroll_runs").delete().eq("id", run.id);
    if (dErr) throw new Error(dErr.message);
    return { deleted: true };
  });

async function recalcTotals(supabase: any, runId: string) {
  const { data: slips } = await supabase
    .from("hr_payslips")
    .select("base_salary, bonus, overtime_amount, allowance, deduction, advance_deduction, net_pay")
    .eq("run_id", runId);
  let gross = 0;
  let ded = 0;
  let net = 0;
  for (const s of slips ?? []) {
    gross += Number(s.base_salary) + Number(s.bonus) + Number(s.overtime_amount) + Number(s.allowance);
    ded += Number(s.deduction) + Number(s.advance_deduction);
    net += Number(s.net_pay);
  }
  await supabase
    .from("hr_payroll_runs")
    .update({ total_gross: gross, total_deduction: ded, total_net: net })
    .eq("id", runId);
  return { gross, ded, net };
}

/** Recomputes run totals after payslip edits. */
export const refreshPayrollTotals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { runId: string }) => d)
  .handler(async ({ data, context }) => recalcTotals(context.supabase, data.runId));

/**
 * Pays out a payroll run: books a real expense transaction and deducts the
 * chosen account balance, then marks every draft payslip as paid.
 */
export const payPayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { runId: string; accountId: string }) => d)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    const { data: run, error: rErr } = await supabase
      .from("hr_payroll_runs")
      .select("*")
      .eq("id", data.runId)
      .single();
    if (rErr) throw new Error(rErr.message);
    if (run.status === "paid") return { alreadyPaid: true, amount: Number(run.total_net) };

    const totals = await recalcTotals(supabase, data.runId);
    if (totals.net <= 0) throw new Error("Payroll net amount 0 — payslip add korun.");

    const { data: account, error: aErr } = await supabase
      .from("erp_accounts")
      .select("id, current_balance, brand_id")
      .eq("id", data.accountId)
      .single();
    if (aErr) throw new Error(aErr.message);

    const brandId = run.brand_id ?? account.brand_id;
    if (!brandId) throw new Error("Payroll run e brand set nei — account/run e brand select korun.");

    const { data: txn, error: tErr } = await supabase
      .from("erp_transactions")
      .insert({
        brand_id: brandId,
        txn_type: "expense",
        account_id: account.id,
        amount: totals.net,
        reference_type: "hr_payroll",
        reference_id: run.id,
        description: `Payroll ${String(run.period_month).slice(0, 7)} — salary payout`,
        transaction_date: dhakaToday(),
      })
      .select("id")
      .single();
    if (tErr) throw new Error(tErr.message);

    await supabase
      .from("erp_accounts")
      .update({ current_balance: Number(account.current_balance ?? 0) - totals.net })
      .eq("id", account.id);

    const paidAt = new Date().toISOString();
    await supabase
      .from("hr_payslips")
      .update({ status: "paid", paid_at: paidAt, txn_id: txn.id })
      .eq("run_id", run.id)
      .neq("status", "paid");

    await supabase
      .from("hr_payroll_runs")
      .update({ status: "paid", paid_at: paidAt, account_id: account.id })
      .eq("id", run.id);

    return { alreadyPaid: false, amount: totals.net, txnId: txn.id };
  });