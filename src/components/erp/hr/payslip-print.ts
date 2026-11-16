import { getDocBranding } from "@/lib/erp/utils/doc-branding";
import type { Payslip, PayrollRun } from "@/lib/erp/hr/api";
import { hm, money } from "@/lib/erp/hr/format";

const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

function slipHtml(
  p: Payslip,
  run: Pick<PayrollRun, "title" | "period_from" | "period_to" | "status" | "paid_on">,
) {
  const b = getDocBranding();
  const row = (k: string, v: string, strong = false) =>
    `<tr><td>${esc(k)}</td><td class="r${strong ? " b" : ""}">${esc(v)}</td></tr>`;
  const earnings = [
    row(
      `Basic (${p.period_workdays - p.absent_days - p.unpaid_leave_days} of ${p.month_workdays} working days)`,
      money(p.earned_basic),
    ),
    p.ot_amount > 0
      ? row(`Overtime (${hm(p.ot_minutes)} × ${money(p.ot_rate)}/h)`, money(p.ot_amount))
      : "",
    p.bonus > 0 ? row("Bonus", money(p.bonus)) : "",
    p.allowance > 0 ? row("Allowance", money(p.allowance)) : "",
  ].join("");
  const deductions = [
    p.deduction > 0 ? row("Deduction", money(p.deduction)) : "",
    p.advance > 0 ? row("Advance adjusted", money(p.advance)) : "",
    p.previously_paid > 0 ? row("Already paid this month", money(p.previously_paid)) : "",
  ].join("");
  return `
  <section class="slip">
    <header>
      <div>${b.logoUrl ? `<img src="${esc(b.logoUrl)}" alt="" />` : ""}<h1>${esc(b.company)}</h1>
      <div class="muted">${esc([b.address, b.phone].filter(Boolean).join(" · "))}</div></div>
      <div class="r"><div class="tag">PAYSLIP</div><div class="b">${esc(run.title ?? "")}</div>
      <div class="muted">${esc(run.period_from)} → ${esc(run.period_to)}</div></div>
    </header>
    <div class="grid">
      <div><span class="muted">Employee</span><div class="b">${esc(p.employee_name)}</div><div class="muted">${esc(p.employee_code)}${p.designation ? " · " + esc(p.designation) : ""}</div></div>
      <div><span class="muted">Monthly salary</span><div class="b">${money(p.monthly_salary)}</div><div class="muted">Per day ${money(p.per_day_rate)}</div></div>
      <div><span class="muted">Attendance</span><div class="b">${p.present_days} present · ${p.absent_days} absent</div>
      <div class="muted">${p.late_days} late · ${p.paid_leave_days} paid leave · ${p.unpaid_leave_days} unpaid · ${p.holiday_days} holiday</div></div>
      <div><span class="muted">Worked</span><div class="b">${hm(p.worked_minutes)}</div><div class="muted">OT ${hm(p.ot_minutes)}</div></div>
    </div>
    <table><thead><tr><th>Earnings</th><th class="r">Amount</th></tr></thead><tbody>${earnings}</tbody></table>
    ${deductions ? `<table><thead><tr><th>Deductions</th><th class="r">Amount</th></tr></thead><tbody>${deductions}</tbody></table>` : ""}
    <div class="net"><span>Net pay</span><span>${money(p.net_pay)}</span></div>
    <div class="muted foot">${esc(p.payment_method ?? "")}${p.payment_account ? " · " + esc(p.payment_account) : ""}
      ${run.paid_on ? " · Paid on " + esc(run.paid_on) : ""}${p.note ? "<br/>Note: " + esc(p.note) : ""}<br/>${esc(b.footerNote ?? "")}</div>
  </section>`;
}

const CSS = `
  *{box-sizing:border-box} body{font-family:Inter,system-ui,sans-serif;color:#0f172a;margin:0;padding:24px;font-size:13px}
  .slip{max-width:720px;margin:0 auto 32px;border:1px solid #e2e8f0;border-radius:12px;padding:24px;page-break-after:always}
  header{display:flex;justify-content:space-between;gap:16px;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:16px}
  header img{height:36px;margin-bottom:6px} h1{font-size:18px;margin:0}
  .tag{display:inline-block;background:#0f172a;color:#fff;font-size:10px;letter-spacing:.15em;padding:2px 8px;border-radius:4px;margin-bottom:4px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
  .muted{color:#64748b;font-size:11px} .b{font-weight:600} .r{text-align:right}
  table{width:100%;border-collapse:collapse;margin-bottom:12px} th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;text-align:left;border-bottom:1px solid #e2e8f0;padding:6px 0}
  td{padding:6px 0;border-bottom:1px dashed #f1f5f9}
  .net{display:flex;justify-content:space-between;font-size:18px;font-weight:700;background:#f8fafc;border-radius:8px;padding:12px 14px;margin:8px 0}
  .foot{margin-top:12px} @media print{body{padding:0}.slip{border:none}}
`;

export function printPayslips(
  slips: Payslip[],
  run: Pick<PayrollRun, "title" | "period_from" | "period_to" | "status" | "paid_on">,
) {
  const w = window.open("", "_blank", "width=820,height=1000");
  if (!w) return;
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>Payslips — ${esc(run.title ?? "")}</title><style>${CSS}</style></head><body>${slips
      .map((s) => slipHtml(s, run))
      .join(
        "",
      )}<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`,
  );
  w.document.close();
}

export function printPayslip(
  slip: Payslip,
  run: Pick<PayrollRun, "title" | "period_from" | "period_to" | "status" | "paid_on">,
) {
  printPayslips([slip], run);
}
