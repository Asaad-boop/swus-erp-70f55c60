import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CalendarDays } from "lucide-react";
import { statusTone } from "@/components/erp/hr/hr-shell";

const dhakaToday = () => new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);

/** Count requested days excluding the employee's weekly off days. */
export function leaveWorkDays(start: string, end: string, weekOffs: number[]): number {
  if (!start || !end || end < start) return 0;
  const offs = new Set(weekOffs);
  let n = 0;
  for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    if (!offs.has(d.getUTCDay())) n++;
  }
  return n;
}

/** Employee self-service: apply for leave, see yearly balance, cancel own pending requests. */
export function MyLeaveCard() {
  const qc = useQueryClient();
  const year = dhakaToday().slice(0, 4);
  const [form, setForm] = useState({ type: "", start: dhakaToday(), end: dhakaToday(), reason: "" });

  const { data } = useQuery({
    queryKey: ["hr-my-leaves"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return null;
      const { data: emp } = await supabase.from("hr_employees").select("id, week_offs").eq("user_id", uid).maybeSingle();
      if (!emp) return null;
      const [{ data: types }, { data: leaves }] = await Promise.all([
        supabase.from("hr_leave_types").select("id, name, days_per_year").order("name"),
        supabase.from("hr_leaves").select("*").eq("employee_id", emp.id).order("start_date", { ascending: false }).limit(50),
      ]);
      return { emp, types: types ?? [], leaves: leaves ?? [] };
    },
  });

  const used = (typeId: string) =>
    (data?.leaves ?? [])
      .filter((l) => l.leave_type_id === typeId && String(l.start_date).startsWith(year) && ["approved", "pending"].includes(String(l.status)))
      .reduce((s, l) => s + Number(l.days || 0), 0);

  const fullDays = leaveWorkDays(form.start, form.end, ((data?.emp.week_offs as number[] | null) ?? []).map(Number));
  const days = form.half ? (fullDays > 0 ? 0.5 : 0) : fullDays;
  const typ = data?.types.find((t) => t.id === form.type);
  const left = typ ? Number(typ.days_per_year || 0) - used(typ.id) : 0;

  const apply = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error("Employee profile link nei");
      if (!form.type) throw new Error("Leave type select korun");
      if (days <= 0) throw new Error("Date thik korun");
      if (typ && Number(typ.days_per_year || 0) > 0 && days > left) throw new Error(`Balance e ${left} din baki`);
      // Server recalculates days (holidays, weekly offs) and re-checks balance + overlap.
      const { error } = await supabase.from("hr_leaves").insert({
        employee_id: data.emp.id, leave_type_id: form.type, start_date: form.start,
        end_date: form.half ? form.start : form.end,
        days, reason: form.reason || null, status: "pending",
        half_day: form.half, half_day_part: form.half ? form.part : null,
      } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Leave request pathano hoyeche — manager approve korbe");
      setForm((f) => ({ ...f, reason: "" }));
      void qc.invalidateQueries({ queryKey: ["hr-my-leaves"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("hr_cancel_my_leave" as never, { _leave_id: id } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Cancel hoyeche"); void qc.invalidateQueries({ queryKey: ["hr-my-leaves"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data) return null;
  const typeName = (id: string) => data.types.find((t) => t.id === id)?.name ?? "Leave";

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4" /> My Leave</div>

        {data.types.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {data.types.map((t) => {
              const rem = Number(t.days_per_year || 0) - used(t.id);
              return (
                <div key={t.id} className="rounded-md border border-border/70 p-2.5">
                  <p className="text-[11px] text-muted-foreground">{t.name}</p>
                  <p className="font-display text-lg font-bold">{rem}<span className="text-xs font-normal text-muted-foreground"> / {t.days_per_year} baki</span></p>
                </div>
              );
            })}
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-5">
          <select className="h-9 rounded-md border border-input bg-background px-2 text-sm sm:col-span-1"
            value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="">Type…</option>
            {data.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <Input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value, end: e.target.value > form.end ? e.target.value : form.end })} />
          <Input type="date" value={form.end} min={form.start} onChange={(e) => setForm({ ...form, end: e.target.value })} />
          <Input placeholder="Karon (optional)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          <Button size="lg" className="h-9" disabled={apply.isPending} onClick={() => apply.mutate()}>
            Apply {days > 0 ? `· ${days} din` : ""}
          </Button>
        </div>

        {data.leaves.length > 0 && (
          <ul className="divide-y divide-border/50 rounded-md border border-border/70">
            {data.leaves.slice(0, 8).map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>{typeName(String(l.leave_type_id))} · {String(l.start_date)} → {String(l.end_date)} · {Number(l.days)} din</span>
                <span className="flex items-center gap-2">
                  <Badge variant="outline" className={statusTone[String(l.status)] ?? ""}>{String(l.status)}</Badge>
                  {l.status === "pending" && (
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => cancel.mutate(l.id)}>Cancel</Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
