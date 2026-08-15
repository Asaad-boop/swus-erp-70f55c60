import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getAppSetting, saveAppSetting } from "@/lib/erp/settings/app-settings.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HrPageHeader } from "@/components/erp/hr/hr-shell";
import { Settings2, Plus, Trash2, Save, Building2, BadgeCheck, PalmtreeIcon, CalendarDays, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/erp/hr/settings")({
  component: HrSettingsPage,
  head: () => ({
    meta: [
      { title: "HR Settings — Synq ERP HRM" },
      { name: "description", content: "Departments, designations, leave types, holiday calendar and attendance policy for the HR module." },
      { property: "og:title", content: "HR Settings — Synq ERP HRM" },
      { property: "og:description", content: "Configure HR master data and attendance rules in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

export type HrPolicy = {
  day_start: string;
  day_end: string;
  late_grace_min: number;
  half_day_hours: number;
  full_day_hours: number;
  week_offs: number[];
  monthly_working_days: number;
};

export const DEFAULT_HR_POLICY: HrPolicy = {
  day_start: "10:00",
  day_end: "19:00",
  late_grace_min: 15,
  half_day_hours: 4,
  full_day_hours: 8,
  week_offs: [5],
  monthly_working_days: 26,
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card/60 px-3 py-2">{children}</div>;
}

function HrSettingsPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["hr-settings-master"],
    queryFn: async () => {
      const [d, g, lt, h] = await Promise.all([
        supabase.from("hr_departments").select("*").order("name"),
        supabase.from("hr_designations").select("*").order("title"),
        supabase.from("hr_leave_types").select("*").order("name"),
        supabase.from("hr_holidays").select("*").order("holiday_date"),
      ]);
      if (d.error) throw new Error(d.error.message);
      return {
        departments: d.data ?? [],
        designations: g.data ?? [],
        leaveTypes: lt.data ?? [],
        holidays: h.data ?? [],
      };
    },
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ["hr-settings-master"] });
  const fail = (e: Error) => toast.error(e.message);

  /* ---------- departments ---------- */
  const [dept, setDept] = useState({ name: "", description: "" });
  const addDept = useMutation({
    mutationFn: async () => {
      if (!dept.name.trim()) throw new Error("Department name din");
      const { error } = await supabase.from("hr_departments").insert({ name: dept.name.trim(), description: dept.description.trim() || null });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setDept({ name: "", description: "" }); toast.success("Department added"); refresh(); },
    onError: fail,
  });
  const delDept = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_departments").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
    onError: fail,
  });

  /* ---------- designations ---------- */
  const [desig, setDesig] = useState({ title: "", department_id: "", base_salary: "" });
  const addDesig = useMutation({
    mutationFn: async () => {
      if (!desig.title.trim()) throw new Error("Designation title din");
      const { error } = await supabase.from("hr_designations").insert({
        title: desig.title.trim(),
        department_id: desig.department_id || null,
        base_salary: Number(desig.base_salary) || 0,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setDesig({ title: "", department_id: "", base_salary: "" }); toast.success("Designation added"); refresh(); },
    onError: fail,
  });
  const saveDesigSalary = useMutation({
    mutationFn: async ({ id, base_salary }: { id: string; base_salary: number }) => {
      const { error } = await supabase.from("hr_designations").update({ base_salary }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Saved"); refresh(); },
    onError: fail,
  });
  const delDesig = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_designations").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
    onError: fail,
  });

  /* ---------- leave types ---------- */
  const [lt, setLt] = useState({ name: "", days_per_year: "", is_paid: true });
  const addLt = useMutation({
    mutationFn: async () => {
      if (!lt.name.trim()) throw new Error("Leave type name din");
      const { error } = await supabase.from("hr_leave_types").insert({
        name: lt.name.trim(),
        days_per_year: Number(lt.days_per_year) || 0,
        is_paid: lt.is_paid,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setLt({ name: "", days_per_year: "", is_paid: true }); toast.success("Leave type added"); refresh(); },
    onError: fail,
  });
  const updateLt = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("hr_leave_types").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
    onError: fail,
  });
  const delLt = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_leave_types").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
    onError: fail,
  });

  /* ---------- holidays ---------- */
  const [hol, setHol] = useState({ holiday_date: "", title: "", is_recurring: false });
  const addHol = useMutation({
    mutationFn: async () => {
      if (!hol.holiday_date || !hol.title.trim()) throw new Error("Date o title din");
      const { error } = await supabase.from("hr_holidays").insert({
        holiday_date: hol.holiday_date,
        title: hol.title.trim(),
        is_recurring: hol.is_recurring,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setHol({ holiday_date: "", title: "", is_recurring: false }); toast.success("Holiday added"); refresh(); },
    onError: fail,
  });
  const delHol = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_holidays").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
    onError: fail,
  });

  /* ---------- policy ---------- */
  const loadSetting = useServerFn(getAppSetting);
  const persistSetting = useServerFn(saveAppSetting);
  const policyQ = useQuery({
    queryKey: ["hr-policy"],
    queryFn: async () => {
      const res = await loadSetting({ data: { key: "hr_policy" } });
      return { ...DEFAULT_HR_POLICY, ...((res.value as Partial<HrPolicy>) ?? {}) } as HrPolicy;
    },
  });
  const [policy, setPolicy] = useState<HrPolicy>(DEFAULT_HR_POLICY);
  useEffect(() => { if (policyQ.data) setPolicy(policyQ.data); }, [policyQ.data]);

  const savePolicy = useMutation({
    mutationFn: async () => { await persistSetting({ data: { key: "hr_policy", value: policy } }); },
    onSuccess: () => { toast.success("Policy saved"); void qc.invalidateQueries({ queryKey: ["hr-policy"] }); },
    onError: fail,
  });

  const toggleWeekOff = (idx: number) =>
    setPolicy((p) => ({
      ...p,
      week_offs: p.week_offs.includes(idx) ? p.week_offs.filter((x) => x !== idx) : [...p.week_offs, idx].sort(),
    }));

  const deptName = (id: string | null) => data?.departments.find((d: any) => d.id === id)?.name ?? "—";

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      <HrPageHeader
        icon={Settings2}
        title="HR Settings"
        subtitle="Department, designation, leave type, holiday calendar o attendance policy"
      />

      <Tabs defaultValue="policy">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="policy"><Clock className="mr-1.5 h-3.5 w-3.5" />Policy</TabsTrigger>
          <TabsTrigger value="departments"><Building2 className="mr-1.5 h-3.5 w-3.5" />Departments</TabsTrigger>
          <TabsTrigger value="designations"><BadgeCheck className="mr-1.5 h-3.5 w-3.5" />Designations</TabsTrigger>
          <TabsTrigger value="leave-types"><PalmtreeIcon className="mr-1.5 h-3.5 w-3.5" />Leave types</TabsTrigger>
          <TabsTrigger value="holidays"><CalendarDays className="mr-1.5 h-3.5 w-3.5" />Holidays</TabsTrigger>
        </TabsList>

        {/* ---------- POLICY ---------- */}
        <TabsContent value="policy" className="mt-4">
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Office start</Label>
                  <Input type="time" value={policy.day_start} onChange={(e) => setPolicy({ ...policy, day_start: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Office end</Label>
                  <Input type="time" value={policy.day_end} onChange={(e) => setPolicy({ ...policy, day_end: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Late grace (minutes)</Label>
                  <Input type="number" min={0} value={policy.late_grace_min}
                    onChange={(e) => setPolicy({ ...policy, late_grace_min: Number(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Full day hours</Label>
                  <Input type="number" min={1} step="0.5" value={policy.full_day_hours}
                    onChange={(e) => setPolicy({ ...policy, full_day_hours: Number(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Half day hours</Label>
                  <Input type="number" min={1} step="0.5" value={policy.half_day_hours}
                    onChange={(e) => setPolicy({ ...policy, half_day_hours: Number(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Monthly working days</Label>
                  <Input type="number" min={1} max={31} value={policy.monthly_working_days}
                    onChange={(e) => setPolicy({ ...policy, monthly_working_days: Number(e.target.value) || 0 })} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Weekly off days</Label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((d, i) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleWeekOff(i)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        policy.week_offs.includes(i)
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <Button onClick={() => savePolicy.mutate()} disabled={savePolicy.isPending}>
                <Save className="mr-1.5 h-4 w-4" /> Save policy
              </Button>
              <p className="text-xs text-muted-foreground">
                Late grace o office start diye Live Dashboard-e "Late" badge dekhano hoy. Monthly working days payroll per-day rate calculation-e use hobe.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- DEPARTMENTS ---------- */}
        <TabsContent value="departments" className="mt-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[180px] flex-1 space-y-1.5">
                  <Label>Name</Label>
                  <Input value={dept.name} onChange={(e) => setDept({ ...dept, name: e.target.value })} placeholder="Operations" />
                </div>
                <div className="min-w-[220px] flex-1 space-y-1.5">
                  <Label>Description</Label>
                  <Input value={dept.description} onChange={(e) => setDept({ ...dept, description: e.target.value })} placeholder="Optional" />
                </div>
                <Button onClick={() => addDept.mutate()} disabled={addDept.isPending}><Plus className="mr-1.5 h-4 w-4" />Add</Button>
              </div>
              <div className="space-y-2">
                {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
                {!isLoading && !data?.departments.length && <p className="text-sm text-muted-foreground">Kono department nei.</p>}
                {data?.departments.map((d: any) => (
                  <Row key={d.id}>
                    <span className="font-medium">{d.name}</span>
                    {d.description && <span className="text-xs text-muted-foreground">{d.description}</span>}
                    <Button variant="ghost" size="icon" className="ml-auto text-destructive" onClick={() => delDept.mutate(d.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </Row>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- DESIGNATIONS ---------- */}
        <TabsContent value="designations" className="mt-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[180px] flex-1 space-y-1.5">
                  <Label>Title</Label>
                  <Input value={desig.title} onChange={(e) => setDesig({ ...desig, title: e.target.value })} placeholder="Packer" />
                </div>
                <div className="min-w-[180px] space-y-1.5">
                  <Label>Department</Label>
                  <Select value={desig.department_id} onValueChange={(v) => setDesig({ ...desig, department_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {data?.departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-[150px] space-y-1.5">
                  <Label>Base salary</Label>
                  <Input type="number" min={0} value={desig.base_salary} onChange={(e) => setDesig({ ...desig, base_salary: e.target.value })} />
                </div>
                <Button onClick={() => addDesig.mutate()} disabled={addDesig.isPending}><Plus className="mr-1.5 h-4 w-4" />Add</Button>
              </div>
              <div className="space-y-2">
                {!isLoading && !data?.designations.length && <p className="text-sm text-muted-foreground">Kono designation nei.</p>}
                {data?.designations.map((g: any) => (
                  <Row key={g.id}>
                    <span className="font-medium">{g.title}</span>
                    <Badge variant="outline" className="text-[10px]">{deptName(g.department_id)}</Badge>
                    <div className="ml-auto flex items-center gap-2">
                      <Input
                        type="number"
                        defaultValue={g.base_salary}
                        className="h-8 w-28"
                        onBlur={(e) => {
                          const v = Number(e.target.value) || 0;
                          if (v !== Number(g.base_salary)) saveDesigSalary.mutate({ id: g.id, base_salary: v });
                        }}
                      />
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => delDesig.mutate(g.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Row>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- LEAVE TYPES ---------- */}
        <TabsContent value="leave-types" className="mt-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[180px] flex-1 space-y-1.5">
                  <Label>Name</Label>
                  <Input value={lt.name} onChange={(e) => setLt({ ...lt, name: e.target.value })} placeholder="Casual leave" />
                </div>
                <div className="w-[150px] space-y-1.5">
                  <Label>Days / year</Label>
                  <Input type="number" min={0} value={lt.days_per_year} onChange={(e) => setLt({ ...lt, days_per_year: e.target.value })} />
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <Switch checked={lt.is_paid} onCheckedChange={(v) => setLt({ ...lt, is_paid: v })} />
                  <Label className="text-xs">Paid</Label>
                </div>
                <Button onClick={() => addLt.mutate()} disabled={addLt.isPending}><Plus className="mr-1.5 h-4 w-4" />Add</Button>
              </div>
              <div className="space-y-2">
                {!isLoading && !data?.leaveTypes.length && <p className="text-sm text-muted-foreground">Kono leave type nei.</p>}
                {data?.leaveTypes.map((t: any) => (
                  <Row key={t.id}>
                    <span className="font-medium">{t.name}</span>
                    <div className="ml-auto flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-[11px] text-muted-foreground">Days</Label>
                        <Input
                          type="number"
                          defaultValue={t.days_per_year ?? 0}
                          className="h-8 w-20"
                          onBlur={(e) => {
                            const v = Number(e.target.value) || 0;
                            if (v !== Number(t.days_per_year)) updateLt.mutate({ id: t.id, patch: { days_per_year: v } });
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Switch checked={!!t.is_paid} onCheckedChange={(v) => updateLt.mutate({ id: t.id, patch: { is_paid: v } })} />
                        <Label className="text-[11px] text-muted-foreground">Paid</Label>
                      </div>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => delLt.mutate(t.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Row>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- HOLIDAYS ---------- */}
        <TabsContent value="holidays" className="mt-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-[170px] space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" value={hol.holiday_date} onChange={(e) => setHol({ ...hol, holiday_date: e.target.value })} />
                </div>
                <div className="min-w-[200px] flex-1 space-y-1.5">
                  <Label>Title</Label>
                  <Input value={hol.title} onChange={(e) => setHol({ ...hol, title: e.target.value })} placeholder="Eid-ul-Fitr" />
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <Switch checked={hol.is_recurring} onCheckedChange={(v) => setHol({ ...hol, is_recurring: v })} />
                  <Label className="text-xs">Every year</Label>
                </div>
                <Button onClick={() => addHol.mutate()} disabled={addHol.isPending}><Plus className="mr-1.5 h-4 w-4" />Add</Button>
              </div>
              <div className="space-y-2">
                {!isLoading && !data?.holidays.length && <p className="text-sm text-muted-foreground">Kono holiday add kora nei.</p>}
                {data?.holidays.map((h: any) => (
                  <Row key={h.id}>
                    <Badge variant="outline" className="text-[10px]">
                      {new Date(h.holiday_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </Badge>
                    <span className="font-medium">{h.title}</span>
                    {h.is_recurring && <Badge className="bg-violet-500/10 text-violet-600 text-[10px]" variant="outline">Yearly</Badge>}
                    <Button variant="ghost" size="icon" className="ml-auto text-destructive" onClick={() => delHol.mutate(h.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </Row>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
