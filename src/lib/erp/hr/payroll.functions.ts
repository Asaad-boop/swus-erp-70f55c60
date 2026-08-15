import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** First day (YYYY-MM-01) of a `YYYY-MM` string. */
function monthStart(month: string) {
  return `${month}-01`;
}
function monthEnd(month: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
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

    let { data: run } = await supabase
      .from("hr_payroll_runs")
      .select("*")
      .eq("period_month", period)
      .maybeSingle();

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
      .select("id, monthly_salary")
      .in("status", ["active", "probation", "on_leave"]);
    if (eErr) throw new Error(eErr.message);

    const { data: att } = await supabase
      .from("hr_attendance")
      .select("employee_id, status")
      .gte("work_date", period)
      .lte("work_date", monthEnd(data.month));

    const present = new Map<string, number>();
    const absent = new Map<string, number>();
    for (const a of att ?? []) {
      const bucket = a.status === "absent" ? absent : present;
      const key = a.employee_id as string;
      if (a.status === "absent" || a.status === "present" || a.status === "late" || a.status === "half_day") {
        bucket.set(key, (bucket.get(key) ?? 0) + (a.status === "half_day" ? 0.5 : 1));
      }
    }

    const { data: existing } = await supabase
      .from("hr_payslips")
      .select("employee_id")
      .eq("run_id", run.id);
    const have = new Set((existing ?? []).map((r) => r.employee_id as string));

    const rows = (employees ?? [])
      .filter((e) => !have.has(e.id))
      .map((e) => ({
        run_id: run!.id,
        employee_id: e.id,
        base_salary: Number(e.monthly_salary ?? 0),
        present_days: present.get(e.id) ?? 0,
        absent_days: absent.get(e.id) ?? 0,
        net_pay: Number(e.monthly_salary ?? 0),
      }));

    if (rows.length) {
      const { error } = await supabase.from("hr_payslips").insert(rows);
      if (error) throw new Error(error.message);
    }

    await recalcTotals(supabase, run.id);
    return { runId: run.id, created: rows.length, skipped: false };
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
        transaction_date: new Date().toISOString().slice(0, 10),
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