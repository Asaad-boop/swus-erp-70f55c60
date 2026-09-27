import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { History } from "lucide-react";

const LABELS: Record<string, string> = {
  bonus: "Bonus", overtime_amount: "Overtime", allowance: "Allowance", deduction: "Deduction",
  advance_deduction: "Advance", net_pay: "Net", base_salary: "Base", present_days: "Present",
  absent_days: "Absent", status: "Status", total_gross: "Gross", total_deduction: "Total deduction",
  total_net: "Total net", paid_at: "Paid at", account_id: "Account", txn_id: "Txn", note: "Note",
};

type Row = { id: string; table_name: string; row_id: string; action: string; changes: Record<string, any>; changed_by: string | null; changed_at: string };

/** Who changed what on a payroll run and its payslips (old → new). Hidden when empty/no access. */
export function PayrollHistory({ runId, slipEmployee, empName }: { runId: string; slipEmployee: Map<string, string>; empName: (id: string) => string }) {
  const { data } = useQuery({
    queryKey: ["hr-payroll-audit", runId],
    queryFn: async () => {
      const { data: rows, error } = await (supabase as any)
        .from("hr_payroll_audit").select("*").eq("run_id", runId)
        .order("changed_at", { ascending: false }).limit(200);
      if (error) return { rows: [] as Row[], names: new Map<string, string>() };
      const ids = [...new Set((rows as Row[]).map((r) => r.changed_by).filter(Boolean))] as string[];
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id, display_name, username, email").in("id", ids);
        for (const p of ps ?? []) names.set(p.id, p.display_name || p.username || p.email || "User");
      }
      return { rows: rows as Row[], names };
    },
  });
  const rows = (data?.rows ?? []).filter((r) => r.action !== "update" || Object.keys(r.changes ?? {}).length);
  if (!rows.length) return null;

  const fmt = (v: any) => (v === null || v === undefined ? "—" : typeof v === "number" ? v.toLocaleString("en-BD") : String(v).slice(0, 24));
  const when = (s: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(s));

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" /> Payroll history</div>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {rows.map((r) => {
            const who = r.changed_by ? data?.names.get(r.changed_by) ?? "User" : "System";
            const target = r.table_name === "hr_payslips" ? empName(slipEmployee.get(r.row_id) ?? r.changes?.employee_id ?? "") : "Run";
            return (
              <div key={r.id} className="rounded-md border border-border/60 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
                  <span className="font-semibold text-foreground">{who}</span>
                  <span>{r.action === "create" ? "created" : r.action === "delete" ? "deleted" : "changed"}</span>
                  <span className="font-medium text-foreground">{target}</span>
                  <span className="ml-auto tabular-nums">{when(r.changed_at)}</span>
                </div>
                {r.action === "update" && (
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {Object.entries(r.changes).map(([k, v]: [string, any]) => (
                      <span key={k} className="tabular-nums">
                        {LABELS[k] ?? k}: <span className="text-muted-foreground line-through">{fmt(v?.old)}</span> → <span className="font-medium">{fmt(v?.new)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
