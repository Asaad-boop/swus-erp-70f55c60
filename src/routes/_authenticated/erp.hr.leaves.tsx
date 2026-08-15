import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HrEmpty, HrPageHeader, TableSkeleton, hrRow, statusTone } from "@/components/erp/hr/hr-shell";
import { PalmtreeIcon, Plus, Check, X, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/erp/hr/leaves")({
  component: LeavesPage,
  head: () => ({
    meta: [
      { title: "Leave Management — Synq ERP HRM" },
      { name: "description", content: "Create, approve and reject employee leave requests with leave types and day balances." },
      { property: "og:title", content: "Leave Management — Synq ERP HRM" },
      { property: "og:description", content: "Approve or reject staff leave requests in one queue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const daysBetween = (a: string, b: string) => {
  if (!a || !b) return 0;
  const d = (new Date(b).getTime() - new Date(a).getTime()) / 86400000 + 1;
  return d > 0 ? d : 0;
};

function LeavesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("pending");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: "", leave_type_id: "", start_date: "", end_date: "", reason: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["hr-leaves"],
    queryFn: async () => {
      const [leaves, emps, types] = await Promise.all([
        supabase.from("hr_leaves").select("*").order("start_date", { ascending: false }),
        supabase.from("hr_employees").select("id, full_name").order("full_name"),
        supabase.from("hr_leave_types").select("*").order("name"),
      ]);
      if (leaves.error) throw new Error(leaves.error.message);
      return { leaves: leaves.data ?? [], employees: emps.data ?? [], types: types.data ?? [] };
    },
  });

  const empName = (id: string) => data?.employees.find((e) => e.id === id)?.full_name ?? "—";
  const typeName = (id: string | null) => data?.types.find((t) => t.id === id)?.name ?? "—";

  const create = useMutation({
    mutationFn: async () => {
      if (!form.employee_id) throw new Error("Employee select korun");
      if (!form.start_date || !form.end_date) throw new Error("Date select korun");
      const { error } = await supabase.from("hr_leaves").insert({
        employee_id: form.employee_id,
        leave_type_id: form.leave_type_id || null,
        start_date: form.start_date,
        end_date: form.end_date,
        days: daysBetween(form.start_date, form.end_date),
        reason: form.reason.trim() || null,
        status: "pending",
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Leave request created");
      setOpen(false);
      setForm({ employee_id: "", leave_type_id: "", start_date: "", end_date: "", reason: "" });
      void qc.invalidateQueries({ queryKey: ["hr-leaves"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("hr_leaves")
        .update({ status, decided_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr-leaves"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_leaves").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr-leaves"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const addType = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("hr_leave_types").insert({ name });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr-leaves"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (data?.leaves ?? []).filter((l) => (tab === "all" ? true : l.status === tab));

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      <HrPageHeader
        icon={PalmtreeIcon}
        title="Leave & Holidays"
        subtitle="Chhuti request approve/reject korun"
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const name = window.prompt("Leave type name? (e.g. Casual, Sick)");
                if (name?.trim()) addType.mutate(name.trim());
              }}
            >
              + Leave type
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New request
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {["pending", "approved", "rejected", "cancelled", "all"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-all duration-200 active:scale-[0.97] ${
              tab === t ? "border-primary/30 bg-primary/10 text-primary" : "border-transparent text-muted-foreground hover:bg-muted"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border/70 bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-2.5 text-left">Employee</th>
                  <th className="p-2.5 text-left">Type</th>
                  <th className="p-2.5 text-left">Period</th>
                  <th className="p-2.5 text-right">Days</th>
                  <th className="p-2.5 text-left">Reason</th>
                  <th className="p-2.5 text-left">Status</th>
                  <th className="p-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <TableSkeleton cols={7} rows={5} />
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <HrEmpty icon={PalmtreeIcon} title="Kono request nei" hint="Ei filter e kono chhuti request paoa jayni." />
                    </td>
                  </tr>
                ) : (
                  rows.map((l) => (
                    <tr key={l.id} className={`border-b border-border/50 last:border-0 ${hrRow}`}>
                      <td className="p-2.5 font-medium">{empName(l.employee_id)}</td>
                      <td className="p-2.5">{typeName(l.leave_type_id)}</td>
                      <td className="p-2.5 text-[12px]">{l.start_date} → {l.end_date}</td>
                      <td className="p-2.5 text-right tabular-nums">{Number(l.days)}</td>
                      <td className="p-2.5 max-w-[240px] truncate text-muted-foreground">{l.reason ?? "—"}</td>
                      <td className="p-2.5"><Badge variant="outline" className={statusTone[l.status] ?? ""}>{l.status}</Badge></td>
                      <td className="p-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {l.status === "pending" && (
                            <>
                              <Button size="sm" variant="outline" className="h-7" onClick={() => decide.mutate({ id: l.id, status: "approved" })}>
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="outline" className="h-7" onClick={() => decide.mutate({ id: l.id, status: "rejected" })}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-destructive"
                            onClick={() => { if (window.confirm("Delete korbo?")) remove.mutate(l.id); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New leave request</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Employee</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {(data?.employees ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Leave type</Label>
              <Select value={form.leave_type_id || "none"} onValueChange={(v) => setForm({ ...form, leave_type_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {(data?.types ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Start</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">End</Label>
                <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Total: {daysBetween(form.start_date, form.end_date)} day(s)</p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Reason</Label>
              <Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </div>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Create request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}