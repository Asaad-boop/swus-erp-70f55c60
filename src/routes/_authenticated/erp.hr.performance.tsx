import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HrPageHeader, money, statusTone } from "@/components/erp/hr/hr-shell";
import { Trophy, Plus, Trash2, Star } from "lucide-react";

export const Route = createFileRoute("/_authenticated/erp/hr/performance")({
  component: PerformancePage,
  head: () => ({
    meta: [
      { title: "Performance & KPI — Synq ERP HRM" },
      { name: "description", content: "Track monthly KPI targets versus actuals and record employee performance reviews with ratings and incentives." },
      { property: "og:title", content: "Performance & KPI — Synq ERP HRM" },
      { property: "og:description", content: "KPI scorecards and review notes for every team member." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const monthNow = () => new Date().toISOString().slice(0, 7);

function PerformancePage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(monthNow());
  const [kpiOpen, setKpiOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [kpiForm, setKpiForm] = useState({ employee_id: "", metric: "", target_value: "0", actual_value: "0", unit: "", weight: "1" });
  const [reviewForm, setReviewForm] = useState({
    employee_id: "",
    period_start: `${monthNow()}-01`,
    period_end: "",
    rating: "4",
    strengths: "",
    improvements: "",
    goals: "",
    incentive_amount: "0",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["hr-performance", month],
    queryFn: async () => {
      const [kpis, reviews, emps] = await Promise.all([
        supabase.from("hr_kpi_entries").select("*").eq("period_month", `${month}-01`),
        supabase.from("hr_reviews").select("*").order("period_end", { ascending: false }).limit(50),
        supabase.from("hr_employees").select("id, full_name").order("full_name"),
      ]);
      if (kpis.error) throw new Error(kpis.error.message);
      return { kpis: kpis.data ?? [], reviews: reviews.data ?? [], employees: emps.data ?? [] };
    },
  });

  const empName = (id: string) => data?.employees.find((e) => e.id === id)?.full_name ?? "—";

  const grouped = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const k of data?.kpis ?? []) {
      const list = m.get(k.employee_id as string) ?? [];
      list.push(k);
      m.set(k.employee_id as string, list);
    }
    return [...m.entries()].map(([empId, list]) => {
      const totalWeight = list.reduce((s, k) => s + Number(k.weight || 1), 0) || 1;
      const score =
        list.reduce((s, k) => {
          const t = Number(k.target_value) || 0;
          const pct = t > 0 ? Math.min(150, (Number(k.actual_value) / t) * 100) : 0;
          return s + pct * Number(k.weight || 1);
        }, 0) / totalWeight;
      return { empId, list, score: Math.round(score) };
    }).sort((a, b) => b.score - a.score);
  }, [data]);

  const addKpi = useMutation({
    mutationFn: async () => {
      if (!kpiForm.employee_id || !kpiForm.metric.trim()) throw new Error("Employee ar metric dorkar");
      const { error } = await supabase.from("hr_kpi_entries").insert({
        employee_id: kpiForm.employee_id,
        period_month: `${month}-01`,
        metric: kpiForm.metric.trim(),
        target_value: Number(kpiForm.target_value) || 0,
        actual_value: Number(kpiForm.actual_value) || 0,
        unit: kpiForm.unit.trim() || null,
        weight: Number(kpiForm.weight) || 1,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("KPI added");
      setKpiOpen(false);
      setKpiForm({ employee_id: "", metric: "", target_value: "0", actual_value: "0", unit: "", weight: "1" });
      void qc.invalidateQueries({ queryKey: ["hr-performance", month] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateKpi = useMutation({
    mutationFn: async ({ id, actual }: { id: string; actual: number }) => {
      const { error } = await supabase.from("hr_kpi_entries").update({ actual_value: actual }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr-performance", month] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeKpi = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_kpi_entries").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr-performance", month] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const addReview = useMutation({
    mutationFn: async () => {
      if (!reviewForm.employee_id) throw new Error("Employee select korun");
      if (!reviewForm.period_start || !reviewForm.period_end) throw new Error("Period date dorkar");
      const { error } = await supabase.from("hr_reviews").insert({
        employee_id: reviewForm.employee_id,
        period_start: reviewForm.period_start,
        period_end: reviewForm.period_end,
        rating: Number(reviewForm.rating) || null,
        strengths: reviewForm.strengths.trim() || null,
        improvements: reviewForm.improvements.trim() || null,
        goals: reviewForm.goals.trim() || null,
        incentive_amount: Number(reviewForm.incentive_amount) || 0,
        status: "submitted",
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Review saved");
      setReviewOpen(false);
      void qc.invalidateQueries({ queryKey: ["hr-performance", month] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      <HrPageHeader
        icon={Trophy}
        title="Performance & KPI"
        subtitle="Target vs actual score ar review notes"
        actions={
          <>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 w-[150px]" />
            <Button size="sm" variant="outline" onClick={() => setReviewOpen(true)}>
              <Star className="mr-1.5 h-3.5 w-3.5" /> New review
            </Button>
            <Button size="sm" onClick={() => setKpiOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add KPI
            </Button>
          </>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : grouped.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Ei mash e kono KPI set kora nei.</CardContent></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {grouped.map((g) => (
            <Card key={g.empId}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm">{empName(g.empId)}</CardTitle>
                <Badge variant="outline" className={g.score >= 90 ? statusTone.approved : g.score >= 60 ? statusTone.pending : statusTone.rejected}>
                  Score {g.score}%
                </Badge>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {g.list.map((k: any) => {
                  const t = Number(k.target_value) || 0;
                  const pct = t > 0 ? Math.min(100, (Number(k.actual_value) / t) * 100) : 0;
                  return (
                    <div key={k.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-medium">{k.metric}{k.unit ? ` (${k.unit})` : ""}</span>
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Input
                            type="number"
                            defaultValue={Number(k.actual_value)}
                            onBlur={(e) => {
                              const v = Number(e.target.value) || 0;
                              if (v !== Number(k.actual_value)) updateKpi.mutate({ id: k.id, actual: v });
                            }}
                            className="h-7 w-[80px] text-right"
                          />
                          / {t}
                          <button className="text-destructive" onClick={() => removeKpi.mutate(k.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Recent reviews</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(data?.reviews ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Kono review nei.</p>
          ) : (
            (data?.reviews ?? []).map((r) => (
              <div key={r.id} className="rounded-lg border border-border/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{empName(r.employee_id)}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{r.rating ?? "—"}/5</Badge>
                    {Number(r.incentive_amount) > 0 && <Badge variant="outline" className={statusTone.approved}>{money(r.incentive_amount)}</Badge>}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">{r.period_start} → {r.period_end}</p>
                {r.strengths && <p className="mt-1 text-xs"><span className="text-muted-foreground">Strengths:</span> {r.strengths}</p>}
                {r.improvements && <p className="text-xs"><span className="text-muted-foreground">Improve:</span> {r.improvements}</p>}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={kpiOpen} onOpenChange={setKpiOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add KPI — {month}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Employee</Label>
              <Select value={kpiForm.employee_id} onValueChange={(v) => setKpiForm({ ...kpiForm, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {(data?.employees ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Metric</Label>
              <Input value={kpiForm.metric} onChange={(e) => setKpiForm({ ...kpiForm, metric: e.target.value })} placeholder="Orders packed / Calls made" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Target</Label>
                <Input type="number" value={kpiForm.target_value} onChange={(e) => setKpiForm({ ...kpiForm, target_value: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Actual</Label>
                <Input type="number" value={kpiForm.actual_value} onChange={(e) => setKpiForm({ ...kpiForm, actual_value: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Unit</Label>
                <Input value={kpiForm.unit} onChange={(e) => setKpiForm({ ...kpiForm, unit: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Weight</Label>
                <Input type="number" value={kpiForm.weight} onChange={(e) => setKpiForm({ ...kpiForm, weight: e.target.value })} />
              </div>
            </div>
            <Button onClick={() => addKpi.mutate()} disabled={addKpi.isPending}>Save KPI</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New performance review</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Employee</Label>
              <Select value={reviewForm.employee_id} onValueChange={(v) => setReviewForm({ ...reviewForm, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {(data?.employees ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Period start</Label>
                <Input type="date" value={reviewForm.period_start} onChange={(e) => setReviewForm({ ...reviewForm, period_start: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Period end</Label>
                <Input type="date" value={reviewForm.period_end} onChange={(e) => setReviewForm({ ...reviewForm, period_end: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Rating (1-5)</Label>
                <Input type="number" min={1} max={5} value={reviewForm.rating} onChange={(e) => setReviewForm({ ...reviewForm, rating: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Incentive (৳)</Label>
                <Input type="number" value={reviewForm.incentive_amount} onChange={(e) => setReviewForm({ ...reviewForm, incentive_amount: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Strengths</Label>
              <Textarea rows={2} value={reviewForm.strengths} onChange={(e) => setReviewForm({ ...reviewForm, strengths: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Improvements</Label>
              <Textarea rows={2} value={reviewForm.improvements} onChange={(e) => setReviewForm({ ...reviewForm, improvements: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Next goals</Label>
              <Textarea rows={2} value={reviewForm.goals} onChange={(e) => setReviewForm({ ...reviewForm, goals: e.target.value })} />
            </div>
            <Button onClick={() => addReview.mutate()} disabled={addReview.isPending}>Save review</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}