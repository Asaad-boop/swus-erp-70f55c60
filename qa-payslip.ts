import { exportPayslipPdf } from "@/lib/erp/hr/payslip-pdf";
import { mergeCompany } from "@/lib/erp/hr/company";
import { writeFileSync } from "fs";
// jsPDF .save() needs a browser; stub it to write the buffer instead.
const company = mergeCompany({
  name: "Synq With Us", legal_name: "Synq Commerce Ltd.",
  address: "House 42, Road 7, Banani, Dhaka 1213, Bangladesh",
  phone: "+880 1700-000000", email: "hr@synqwithus.com", website: "synqwithus.com",
  bin: "004512345-0101", signatory_name: "Ahmed Saad", signatory_title: "Head of HR",
});
const mk = (name: string, o: any = {}) => ({
  employee: { full_name: name, employee_code: "EMP-014", designation: "Senior Customer Service Executive", department: "Customer Support", join_date: "2024-03-11", phone: "01711223344", employment_type: "Full-time", payment_method: "bKash", payment_number: "01711223344" },
  month: "2026-07", runStatus: "paid", paidAt: "2026-08-01",
  base_salary: 24000, present_days: 24, absent_days: 2, overtime_amount: 3150.5,
  bonus: 2000, allowance: 1500, deduction: 500, advance_deduction: 3000, net_pay: 27150.5,
  note: "Eid bonus included.", ...o,
});
const slips = [mk("Mohammad Rakibul Hasan Chowdhury"), mk("Fatema Akter", { net_pay: 1250000, base_salary: 1200000, note: null })];
// @ts-ignore
globalThis.window = undefined;
const jsPDFmod = await import("jspdf");
const orig = jsPDFmod.default.prototype.save;
jsPDFmod.default.prototype.save = function (fn: string) { writeFileSync("/tmp/qa/" + fn, Buffer.from(this.output("arraybuffer"))); return this; };
await exportPayslipPdf(slips as any, company, "payslip-qa.pdf");
console.log("written");
