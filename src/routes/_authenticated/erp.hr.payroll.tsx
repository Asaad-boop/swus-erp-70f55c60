import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Banknote,
  CheckCircle2,
  FileText,
  Lock,
  Pencil,
  Printer,
  RefreshCw,
  Trash2,
  Unlock,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataPanel, EmptyState, StatCard } from "@/components/erp/ui";
import { HrPage, NoAccess, useHrRole } from "@/components/erp/hr/hr-shell";
import { printPayslip, printPayslips } from "@/components/erp/hr/payslip-print";
import { useBrand } from "@/contexts/brand-context";
import { cn } from "@/lib/utils";
import {
  deletePayroll,
  generatePayroll,
  listPayoutAccounts,
  listPayslips,
  listRuns,
  payPayroll,
  recalcPayroll,
  setPayrollStatus,
  updatePayslip,
  type PayrollRun,
  type Payslip,
} from "@/lib/erp/hr/api";
import { dhakaToday, errorText, hm, money, monthEnd, monthLabel } from "@/lib/erp/hr/format";

export const Route = createFileRoute("/_authenticated/erp/hr/payroll")({
  head: () => ({ meta: [{ title: "Payroll — HRM" }] }),
  component: PayrollPage,
});

const STATUS: Record<PayrollRun["status"], { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-amber-500/10 text-amber-700" },
  finalized: { label: "Finalized", cls: "bg-sky-500/10 text-sky-700" },
  paid: { label: "Paid", cls: "bg-emerald-500/10 text-emerald-700" },
};

function PayrollPage() {
  const { canPay, isLoading } = useHrRole();
  const [runId, setRunId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const runs = useQuery({ queryKey: ["hr", "runs"], enabled: canPay, queryFn: listRuns });

  useEffect(() => {
    if (!runId && runs.data?.length) setRunId(runs.data[0].id);
  }, [runs.data, runId]);

  if (isLoading)
    return (
      <div className="p-6">
        <Skeleton className="h-40" />
      </div>
    );
  if (!canPay) return <NoAccess what="payroll" />;

  const run = runs.data?.find((r) => r.id === runId) ?? null;

  return (
    <HrPage
      title="Payroll"
      subtitle="মাসের যেকোনো দিন পর্যন্ত বেতন বের করুন — attendance, leave, holiday আর overtime থেকে স্বয়ংক্রিয় হিসাব।"
      actions={
        <Button size="sm" onClick={() => setNewOpen(true)} className="gap-1.5">
          <Banknote className="size-4" /> Run payroll
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <DataPanel title="Payroll runs" flush>
          {runs.isLoading ? (
            <div className="p-4">
              <Skeleton className="h-24" />
            </div>
          ) : !(runs.data ?? []).length ? (
            <EmptyState
              compact
              title="No payroll yet"
              action={
                <Button size="sm" onClick={() => setNewOpen(true)}>
                  Run payroll
                </Button>
              }
            />
          ) : (
            <ul className="divide-y text-sm">
              {runs.data!.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setRunId(r.id)}
                    className={cn(
                      "w-full px-4 py-3 text-left hover:bg-muted/40",
                      r.id === runId && "bg-muted/60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{r.title}</span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          STATUS[r.status].cls,
                        )}
                      >
                        {STATUS[r.status].label}
                      </span>
                    </div>
                    <div className="mt-0.5 flex justify-between text-xs text-muted-foreground">
                      <span>{r.employee_count} staff</span>
                      <span className="tabular-nums">{money(r.total_net)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DataPanel>

        {run ? (
          <RunDetail run={run} onDeleted={() => setRunId(null)} />
        ) : (
          <DataPanel>
            <EmptyState
              icon={<FileText className="size-5" />}
              title="Run your first payroll"
              description="Pick a month and the date to pay until. Mid-month runs pay only what has been earned so far; the month-end run subtracts what was already paid."
            />
          </DataPanel>
        )}
      </div>

      <NewRunDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(id) => {
          setRunId(id);
          setNewOpen(false);
        }}
      />
    </HrPage>
  );
}

function NewRunDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { brands } = useBrand();
  const today = dhakaToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [asOf, setAsOf] = useState(today);
  const [brand, setBrand] = useState("all");
  useEffect(() => {
    const s = `${month}-01`;
    const e = monthEnd(s);
    setAsOf(today >= s && today <= e ? today : e);
  }, [month, today]);

  const m = useMutation({
    mutationFn: () => generatePayroll(`${month}-01`, asOf, brand === "all" ? null : brand, null),
    onSuccess: (id) => {
      toast.success("Payroll calculated");
      void qc.invalidateQueries({ queryKey: ["hr", "runs"] });
      onCreated(id);
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const s = `${month}-01`;
  const full = asOf === monthEnd(s);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Run payroll</DialogTitle>
          <DialogDescription>
            Salary is pro-rated by working days up to the date you choose.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Month</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Pay until</Label>
            <Input
              type="date"
              min={s}
              max={monthEnd(s)}
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {full
                ? `Full month — ${monthLabel(s)}.`
                : `Only days up to ${asOf} are paid. Days after today count as present.`}
            </p>
          </div>
          <div>
            <Label className="text-xs">Employees</Label>
            <Select value={brand} onValueChange={setBrand}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                {brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} staff only
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? "Calculating…" : "Calculate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RunDetail({ run, onDeleted }: { run: PayrollRun; onDeleted: () => void }) {
  const qc = useQueryClient();
  const slips = useQuery({
    queryKey: ["hr", "slips", run.id],
    queryFn: () => listPayslips(run.id),
  });
  const [edit, setEdit] = useState<Payslip | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [asOf, setAsOf] = useState(run.period_to);
  useEffect(() => setAsOf(run.period_to), [run.period_to]);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["hr"] });
  const draft = run.status === "draft";

  const recalc = useMutation({
    mutationFn: () => recalcPayroll(run.id, asOf),
    onSuccess: () => {
      toast.success("Recalculated from latest attendance");
      refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const status = useMutation({
    mutationFn: (s: "draft" | "finalized") => setPayrollStatus(run.id, s),
    onSuccess: refresh,
    onError: (e) => toast.error(errorText(e)),
  });
  const del = useMutation({
    mutationFn: () => deletePayroll(run.id),
    onSuccess: () => {
      toast.success("Deleted");
      refresh();
      onDeleted();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const t = useMemo(() => {
    const s = slips.data ?? [];
    const sum = (k: keyof Payslip) => s.reduce((a, p) => a + Number(p[k] ?? 0), 0);
    return {
      earned: sum("earned_basic"),
      ot: sum("ot_amount"),
      extras: sum("bonus") + sum("allowance"),
      cuts: sum("deduction") + sum("advance") + sum("previously_paid"),
      net: sum("net_pay"),
      absent: sum("absent_amount"),
    };
  }, [slips.data]);

  return (
    <div className="space-y-4">
      <DataPanel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{run.title}</h2>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  STATUS[run.status].cls,
                )}
              >
                {STATUS[run.status].label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {run.period_from} → {run.period_to}
              {run.paid_on ? ` · paid on ${run.paid_on}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {draft && (
              <>
                <Input
                  type="date"
                  className="h-8 w-[150px]"
                  min={run.period_month}
                  max={monthEnd(run.period_month)}
                  value={asOf}
                  onChange={(e) => setAsOf(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={recalc.isPending}
                  onClick={() => recalc.mutate()}
                  className="gap-1.5"
                >
                  <RefreshCw className={cn("size-3.5", recalc.isPending && "animate-spin")} />{" "}
                  Recalculate
                </Button>
                <Button
                  size="sm"
                  disabled={status.isPending}
                  onClick={() => status.mutate("finalized")}
                  className="gap-1.5"
                >
                  <Lock className="size-3.5" /> Finalize
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-rose-600"
                  onClick={() => {
                    if (confirm("Delete this draft payroll?")) del.mutate();
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </>
            )}
            {run.status === "finalized" && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => status.mutate("draft")}
                  className="gap-1.5"
                >
                  <Unlock className="size-3.5" /> Reopen
                </Button>
                <Button
                  size="sm"
                  onClick={() => setPayOpen(true)}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                >
                  <Wallet className="size-3.5" /> Mark as paid
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={!slips.data?.length}
              onClick={() => printPayslips(slips.data ?? [], run)}
              className="gap-1.5"
            >
              <Printer className="size-3.5" /> Print all
            </Button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatCard
            label="Basic earned"
            value={money(t.earned)}
            hint={t.absent ? `${money(t.absent)} cut for absence` : undefined}
          />
          <StatCard label="Overtime" value={money(t.ot)} />
          <StatCard label="Bonus + allowance" value={money(t.extras)} />
          <StatCard label="Deductions" value={money(t.cuts)} hint="incl. advance & already paid" />
          <StatCard label="Net payable" value={money(t.net)} className="border-emerald-500/30" />
        </div>
      </DataPanel>

      <DataPanel flush>
        {slips.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-40" />
          </div>
        ) : !(slips.data ?? []).length ? (
          <EmptyState
            compact
            title="No employees in this payroll"
            description="Add employees with a salary first."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Employee</th>
                  <th className="px-3 py-2.5 text-right">Salary</th>
                  <th className="px-3 py-2.5 text-right">Paid days</th>
                  <th className="px-3 py-2.5 text-right">Absent</th>
                  <th className="px-3 py-2.5 text-right">Late</th>
                  <th className="px-3 py-2.5 text-right">OT</th>
                  <th className="px-3 py-2.5 text-right">Basic</th>
                  <th className="px-3 py-2.5 text-right">OT ৳</th>
                  <th className="px-3 py-2.5 text-right">+ / −</th>
                  <th className="px-3 py-2.5 text-right">Net</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {slips.data!.map((p) => {
                  const paidDays =
                    p.monthly_salary > 0
                      ? Math.round((p.earned_basic / p.monthly_salary) * p.month_workdays)
                      : p.period_workdays - p.unpaid_leave_days - p.absent_days;
                  const plus = p.bonus + p.allowance;
                  const minus = p.deduction + p.advance + p.previously_paid;
                  return (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{p.employee_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.employee_code}
                          {p.payment_method ? ` · ${p.payment_method}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {money(p.monthly_salary)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {Math.max(0, paidDays)}
                        <span className="text-xs text-muted-foreground">/{p.month_workdays}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {p.absent_days || p.unpaid_leave_days ? (
                          <span className="text-rose-700">
                            {p.absent_days}
                            {p.unpaid_leave_days ? ` +${p.unpaid_leave_days}u` : ""}
                          </span>
                        ) : (
                          0
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{p.late_days || ""}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {p.ot_minutes ? hm(p.ot_minutes) : ""}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {money(p.earned_basic)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {p.ot_amount ? money(p.ot_amount) : ""}
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs tabular-nums">
                        {plus > 0 && <div className="text-emerald-700">+{money(plus)}</div>}
                        {minus > 0 && <div className="text-rose-700">−{money(minus)}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                        {money(p.net_pay)}
                      </td>
                      <td className="px-2 py-2.5 text-right whitespace-nowrap">
                        {draft && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={() => setEdit(p)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() => printPayslip(p, run)}
                        >
                          <Printer className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DataPanel>

      {edit && <EditSlip slip={edit} onClose={() => setEdit(null)} />}
      {payOpen && <PayDialog run={run} onClose={() => setPayOpen(false)} />}
    </div>
  );
}

function EditSlip({ slip, onClose }: { slip: Payslip; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({
    bonus: slip.bonus,
    allowance: slip.allowance,
    deduction: slip.deduction,
    advance: slip.advance,
    note: slip.note ?? "",
  });
  const net = Math.round(
    slip.earned_basic +
      slip.ot_amount +
      v.bonus +
      v.allowance -
      v.deduction -
      v.advance -
      slip.previously_paid,
  );
  const m = useMutation({
    mutationFn: () => updatePayslip(slip.id, v),
    onSuccess: () => {
      toast.success("Saved");
      void qc.invalidateQueries({ queryKey: ["hr"] });
      onClose();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const n = (k: "bonus" | "allowance" | "deduction" | "advance") => (
    <div>
      <Label className="text-xs capitalize">{k === "advance" ? "Advance to adjust" : k}</Label>
      <Input
        type="number"
        min={0}
        value={v[k]}
        onChange={(e) => setV({ ...v, [k]: Number(e.target.value) || 0 })}
      />
    </div>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{slip.employee_name}</DialogTitle>
          <DialogDescription>
            Basic {money(slip.earned_basic)} + OT {money(slip.ot_amount)}
            {slip.previously_paid ? ` − already paid ${money(slip.previously_paid)}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {n("bonus")}
          {n("allowance")}
          {n("deduction")}
          {n("advance")}
        </div>
        <div>
          <Label className="text-xs">Note (shows on payslip)</Label>
          <Input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
        </div>
        <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <span>Net pay</span>
          <span className="text-lg font-bold tabular-nums">{money(net)}</span>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={m.isPending} onClick={() => m.mutate()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({ run, onClose }: { run: PayrollRun; onClose: () => void }) {
  const qc = useQueryClient();
  const accounts = useQuery({ queryKey: ["hr", "payout-accounts"], queryFn: listPayoutAccounts });
  const [account, setAccount] = useState("");
  const [date, setDate] = useState(dhakaToday());
  const [post, setPost] = useState(true);
  const acc = accounts.data?.find((a) => a.id === account);
  const m = useMutation({
    mutationFn: () => payPayroll(run.id, account || null, date, post),
    onSuccess: (r) => {
      toast.success(
        post ? `Paid · ${r.posted} salary expense posted to Finance` : "Marked as paid",
      );
      void qc.invalidateQueries({ queryKey: ["hr"] });
      void qc.invalidateQueries({ queryKey: ["erp_transactions"] });
      void qc.invalidateQueries({ queryKey: ["erp_accounts"] });
      onClose();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pay {money(run.total_net)}</DialogTitle>
          <DialogDescription>
            {run.title} · {run.employee_count} staff
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex items-center justify-between rounded-lg border p-3 text-sm font-medium">
            Record salary expense in Finance <Switch checked={post} onCheckedChange={setPost} />
          </label>
          {post && (
            <div>
              <Label className="text-xs">Paid from account</Label>
              <Select value={account} onValueChange={setAccount}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      accounts.data?.length === 0 ? "No finance access" : "Choose account"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(accounts.data ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} · {money(a.current_balance)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {acc && acc.current_balance < run.total_net && (
                <p className="mt-1 text-xs text-amber-700">
                  Balance is lower than the payroll total.
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                One expense per brand under “Salary”, linked to this payroll.
              </p>
            </div>
          )}
          <div>
            <Label className="text-xs">Payment date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={m.isPending || (post && !account)}
            onClick={() => m.mutate()}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
          >
            <CheckCircle2 className="size-4" /> Confirm paid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
