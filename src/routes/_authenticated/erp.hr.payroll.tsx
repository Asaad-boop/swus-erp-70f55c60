import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HrEmpty, HrPageHeader, TableSkeleton, hrRow, money, statusTone } from "@/components/erp/hr/hr-shell";
import { dhakaMonth } from "@/lib/erp/hr/date";
import { mergeCompany } from "@/lib/erp/hr/company";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  exportPayslipPdf,
  payslipPreviewUrl,
  payslipStatusStyle,
  type PayslipData,
} from "@/lib/erp/hr/payslip-pdf";
import { getAppSetting } from "@/lib/erp/settings/app-settings.functions";
import {
  deletePayrollRun,
  generatePayrollRun,
  payPayrollRun,
  refreshPayrollTotals,
  updatePayslip,
} from "@/lib/erp/hr/payroll.functions";
import { Banknote, RefreshCw, Wand2, Wallet, Trash2, Download, FileText, Printer, Eye, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/erp/hr/payroll")({
  component: PayrollPage,
  head: () => ({
    meta: [
      { title: "Payroll — Synq ERP HRM" },
      { name: "description", content: "Generate monthly payslips from attendance, adjust bonus and deductions, then pay out from a wallet account." },
      { property: "og:title", content: "Payroll — Synq ERP HRM" },
      { property: "og:description", content: "Monthly salary runs with real wallet payouts and finance postings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const monthNow = () => dhakaMonth();

function PayrollPage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(monthNow());
  const [accountId, setAccountId] = useState("");

  const genFn = useServerFn(generatePayrollRun);
  const payFn = useServerFn(payPayrollRun);
  const refreshFn = useServerFn(refreshPayrollTotals);
  const updateSlipFn = useServerFn(updatePayslip);
  const deleteRunFn = useServerFn(deletePayrollRun);
  const loadSetting = useServerFn(getAppSetting);

  const { data: companyRaw } = useQuery({
    queryKey: ["hr-company"],
    queryFn: () => loadSetting({ data: { key: "hr_company" } }),
    staleTime: 5 * 60_000,
  });
  const company = mergeCompany(companyRaw?.value);

  const { data, isLoading } = useQuery({
    queryKey: ["hr-payroll", month],
    queryFn: async () => {
      const [runRes, empsRes, accRes] = await Promise.all([
        supabase
          .from("hr_payroll_runs")
          .select("*")
          .eq("period_month", `${month}-01`)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("hr_employees")
          .select(
            "id, full_name, employee_code, join_date, phone, email, employment_type, payment_method, payment_number, hr_departments(name), hr_designations(title)",
          ),
        supabase.from("erp_accounts").select("id, name, current_balance").order("name"),
      ]);
      const run = (runRes.data ?? [])[0] ?? null;
      let payslips: any[] = [];
      if (run) {
        const { data: ps } = await supabase.from("hr_payslips").select("*").eq("run_id", run.id);
        payslips = ps ?? [];
      }
      return { run, payslips, employees: empsRes.data ?? [], accounts: accRes.data ?? [] };
    },
  });

  const run = data?.run;
  const locked = run?.status === "paid";
  const empName = (id: string) => data?.employees.find((e) => e.id === id)?.full_name ?? "—";
  const empRow = (id: string) => data?.employees.find((e: any) => e.id === id) as any;

  const generate = useMutation({
    mutationFn: () => genFn({ data: { month } }),
    onSuccess: () => {
      toast.success("Payroll draft ready");
      void qc.invalidateQueries({ queryKey: ["hr-payroll", month] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const savePayslip = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, number> }) =>
      updateSlipFn({ data: { payslipId: id, patch } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr-payroll", month] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRun = useMutation({
    mutationFn: async () => {
      if (!run) throw new Error("Kono run nei");
      return deleteRunFn({ data: { runId: run.id } });
    },
    onSuccess: () => {
      toast.success("Draft payroll delete hoyeche");
      void qc.invalidateQueries({ queryKey: ["hr-payroll", month] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pay = useMutation({
    mutationFn: async () => {
      if (!run) throw new Error("Age payroll generate korun");
      if (!accountId) throw new Error("Account select korun");
      return payFn({ data: { runId: run.id, accountId } });
    },
    onSuccess: () => {
      toast.success("Payroll paid — wallet theke expense post hoyeche");
      void qc.invalidateQueries({ queryKey: ["hr-payroll", month] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const slips = data?.payslips ?? [];

  const exportCsv = () => {
    const head = ["Employee", "Base", "Present", "Absent", "Overtime", "Bonus", "Allowance", "Deduction", "Net"];
    const lines = slips.map((s) =>
      [
        empName(s.employee_id),
        s.base_salary,
        s.present_days,
        s.absent_days,
        s.overtime_amount,
        s.bonus,
        s.allowance,
        s.deduction,
        s.net_pay,
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `payroll-${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const toPayslip = (s: any): PayslipData => {
    const e = empRow(s.employee_id) ?? {};
    return {
      employee: {
        full_name: e.full_name ?? "—",
        employee_code: e.employee_code,
        designation: e.hr_designations?.title ?? null,
        department: e.hr_departments?.name ?? null,
        join_date: e.join_date,
        phone: e.phone,
        email: e.email,
        employment_type: e.employment_type,
        payment_method: e.payment_method,
        payment_number: e.payment_number,
      },
      month,
      runStatus: run?.status ?? "draft",
      paidAt: run?.paid_at ?? null,
      base_salary: Number(s.base_salary),
      present_days: Number(s.present_days),
      absent_days: Number(s.absent_days),
      overtime_amount: Number(s.overtime_amount),
      bonus: Number(s.bonus),
      allowance: Number(s.allowance),
      deduction: Number(s.deduction),
      advance_deduction: Number(s.advance_deduction),
      net_pay: Number(s.net_pay),
      note: s.note ?? null,
    };
  };

  const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "employee";

  const downloadPayslip = async (s: any) => {
    try {
      await exportPayslipPdf([toPayslip(s)], company, `payslip-${month}-${slug(empName(s.employee_id))}.pdf`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const downloadAllPayslips = async () => {
    try {
      const ordered = [...slips].sort((a, b) => empName(a.employee_id).localeCompare(empName(b.employee_id)));
      await exportPayslipPdf(ordered.map(toPayslip), company, `payslips-${month}.pdf`);
      toast.success(`${ordered.length} ta payslip PDF download hocche`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      <HrPageHeader
        icon={Banknote}
        title="Payroll"
        subtitle="Attendance theke payslip, tarpor wallet theke payout"
        actions={
          <>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 w-[150px]" />
            <Button size="sm" variant="outline" onClick={() => generate.mutate()} disabled={generate.isPending || locked}>
              <Wand2 className="mr-1.5 h-3.5 w-3.5" /> {run ? "Re-generate" : "Generate"}
            </Button>
            {run && !locked && (
              <Button size="sm" variant="ghost" onClick={() => refreshFn({ data: { runId: run.id } }).then(() => qc.invalidateQueries({ queryKey: ["hr-payroll", month] }))}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
            {slips.length > 0 && (
              <>
                <Button size="sm" variant="outline" onClick={exportCsv}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
                </Button>
                <Button size="sm" onClick={() => void downloadAllPayslips()}>
                  <FileText className="mr-1.5 h-3.5 w-3.5" /> All payslips PDF
                </Button>
              </>
            )}
            {run && !locked && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={removeRun.isPending}
                onClick={() => { if (window.confirm("Ei draft payroll run delete korbo?")) removeRun.mutate(); }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </>
        }
      />

      {run && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Kpi label="Gross" value={money(run.total_gross)} />
          <Kpi label="Deduction" value={money(run.total_deduction)} />
          <Kpi label="Net payable" value={money(run.total_net)} />
          <Card>
            <CardContent className="space-y-1 p-4">
              <p className="text-xs font-medium text-muted-foreground">Status</p>
              <Badge variant="outline" className={statusTone[run.status] ?? ""}>{run.status}</Badge>
              {run.paid_at && <p className="text-[11px] text-muted-foreground">Paid {String(run.paid_at).slice(0, 10)}</p>}
            </CardContent>
          </Card>
        </div>
      )}

      {run && !locked && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="min-w-[220px] flex-1 space-y-1.5">
              <p className="text-xs text-muted-foreground">Pay from account</p>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select wallet / cash account" /></SelectTrigger>
                <SelectContent>
                  {(data?.accounts ?? []).map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} — {money(a.current_balance)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => { if (window.confirm("Payroll pay korle wallet theke taka kete jabe. Confirm?")) pay.mutate(); }}
              disabled={pay.isPending}
            >
              <Wallet className="mr-1.5 h-3.5 w-3.5" /> {pay.isPending ? "Paying…" : `Pay ${money(run.total_net)}`}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border/70 bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-2.5 text-left">Employee</th>
                  <th className="p-2.5 text-right">Base</th>
                  <th className="p-2.5 text-right">Present</th>
                  <th className="p-2.5 text-right">Absent</th>
                  <th className="p-2.5 text-right">Overtime</th>
                  <th className="p-2.5 text-right">Bonus</th>
                  <th className="p-2.5 text-right">Allowance</th>
                  <th className="p-2.5 text-right">Deduction</th>
                  <th className="p-2.5 text-right">Advance</th>
                  <th className="p-2.5 text-right">Net</th>
                  <th className="p-2.5 text-right">Payslip</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <TableSkeleton cols={11} rows={5} />
                ) : slips.length === 0 ? (
                  <tr>
                    <td colSpan={11}>
                      <HrEmpty icon={Banknote} title="Ei mash er payroll generate kora hoyni" hint="Uporer Generate button e click korle attendance theke draft payslip toiri hobe." />
                    </td>
                  </tr>
                ) : (
                  slips.map((s) => (
                    <tr key={s.id} className={`border-b border-border/50 last:border-0 ${hrRow}`}>
                      <td className="p-2.5 font-medium">{empName(s.employee_id)}</td>
                      <td className="p-2.5 text-right tabular-nums">{money(s.base_salary)}</td>
                      <td className="p-2.5 text-right tabular-nums">{Number(s.present_days)}</td>
                      <td className="p-2.5 text-right tabular-nums">{Number(s.absent_days)}</td>
                      <td className="p-2.5 text-right">
                        <NumCell value={s.overtime_amount} disabled={locked} onSave={(v) => savePayslip.mutate({ id: s.id, patch: { overtime_amount: v } })} />
                      </td>
                      <td className="p-2.5 text-right">
                        <NumCell value={s.bonus} disabled={locked} onSave={(v) => savePayslip.mutate({ id: s.id, patch: { bonus: v } })} />
                      </td>
                      <td className="p-2.5 text-right">
                        <NumCell value={s.allowance} disabled={locked} onSave={(v) => savePayslip.mutate({ id: s.id, patch: { allowance: v } })} />
                      </td>
                      <td className="p-2.5 text-right">
                        <NumCell value={s.deduction} disabled={locked} onSave={(v) => savePayslip.mutate({ id: s.id, patch: { deduction: v } })} />
                      </td>
                      <td className="p-2.5 text-right">
                        <NumCell value={s.advance_deduction} disabled={locked} onSave={(v) => savePayslip.mutate({ id: s.id, patch: { advance_deduction: v } })} />
                      </td>
                      <td className="p-2.5 text-right font-semibold tabular-nums">{money(s.net_pay)}</td>
                      <td className="p-2.5 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-muted-foreground hover:text-foreground"
                          title={`${empName(s.employee_id)} — payslip PDF`}
                          onClick={() => void downloadPayslip(s)}
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="font-display text-xl font-bold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function NumCell({ value, disabled, onSave }: { value: number; disabled?: boolean; onSave: (v: number) => void }) {
  return (
    <Input
      key={Number(value)}
      type="number"
      disabled={disabled}
      defaultValue={Number(value)}
      onBlur={(e) => {
        const v = Number(e.target.value) || 0;
        if (v !== Number(value)) onSave(v);
      }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="h-8 w-[90px] text-right transition-colors focus-visible:border-primary/50"
    />
  );
}