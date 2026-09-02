import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FlaskConical, Plus, Trash2, Trophy } from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { InsufficientData } from "@/components/erp/growth/growth-filters";
import {
  deleteExperiment,
  listExperiments,
  saveExperiment,
  saveLearning,
  type Experiment,
} from "@/lib/erp/growth/lab.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUSES = ["planned", "running", "completed", "abandoned"] as const;

const bdt = (n: number) => `৳${Math.round(n).toLocaleString("en-BD")}`;

const statusTone: Record<string, string> = {
  planned: "border-border text-muted-foreground",
  running: "border-primary/40 text-primary",
  completed: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  abandoned: "border-destructive/40 text-destructive",
};

export function ExperimentsPanel() {
  const { brandIds, activeBrand, isLoading } = useBrand();
  const qc = useQueryClient();
  const list = useServerFn(listExperiments);
  const save = useServerFn(saveExperiment);
  const remove = useServerFn(deleteExperiment);
  const addLearning = useServerFn(saveLearning);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Experiment | null>(null);

  const q = useQuery({
    queryKey: ["growth-experiments", brandIds],
    enabled: !isLoading && brandIds.length > 0,
    queryFn: () => list({ data: { brandIds } }),
  });

  const mSave = useMutation({
    mutationFn: (vars: { id?: string; patch: Record<string, unknown> }) =>
      save({ data: { id: vars.id, brandId: activeBrand?.id ?? brandIds[0]!, patch: vars.patch } }),
    onSuccess: () => {
      toast.success("Experiment saved");
      setOpen(false);
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["growth-experiments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mDelete = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      void qc.invalidateQueries({ queryKey: ["growth-experiments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mApply = useMutation({
    mutationFn: (exp: Experiment) =>
      addLearning({
        data: {
          brandId: exp.brand_id ?? activeBrand?.id ?? brandIds[0]!,
          insight: exp.learning || `${exp.title}: winner ${exp.winner ?? "—"}`,
          category: exp.variable ?? null,
          confidence: "high",
          experimentId: exp.id,
        },
      }),
    onSuccess: () => {
      toast.success("Winner applied to the learning database");
      void qc.invalidateQueries({ queryKey: ["growth-learnings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const patch: Record<string, unknown> = {
      title: String(f.get("title") ?? "").trim(),
      hypothesis: String(f.get("hypothesis") ?? "").trim() || null,
      variable: String(f.get("variable") ?? "").trim() || null,
      variant_a: String(f.get("variant_a") ?? "").trim() || null,
      variant_b: String(f.get("variant_b") ?? "").trim() || null,
      budget: Number(f.get("budget") ?? 0) || 0,
      start_date: String(f.get("start_date") ?? "") || null,
      end_date: String(f.get("end_date") ?? "") || null,
      status: String(f.get("status") ?? "planned"),
      result: String(f.get("result") ?? "").trim() || null,
      winner: String(f.get("winner") ?? "").trim() || null,
      learning: String(f.get("learning") ?? "").trim() || null,
    };
    if (!patch["title"]) {
      toast.error("Title lagbe");
      return;
    }
    mSave.mutate({ id: editing?.id, patch });
  };

  const rows = q.data ?? [];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FlaskConical className="h-4 w-4 text-muted-foreground" /> Experiments
          </h2>
          <p className="text-xs text-muted-foreground">
            Hypothesis → test → result → learning. Winner apply korle learning database e chole jabe.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" className="shadow-none">
              <Plus className="mr-1.5 h-4 w-4" /> New experiment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit experiment" : "New experiment"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" defaultValue={editing?.title ?? ""} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hypothesis">Hypothesis</Label>
                <Textarea
                  id="hypothesis"
                  name="hypothesis"
                  rows={2}
                  defaultValue={editing?.hypothesis ?? ""}
                  placeholder="If we ... then ... because ..."
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="variable">Variable</Label>
                  <Input id="variable" name="variable" defaultValue={editing?.variable ?? ""} placeholder="Hook / Price / Creative" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="variant_a">Variant A</Label>
                  <Input id="variant_a" name="variant_a" defaultValue={editing?.variant_a ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="variant_b">Variant B</Label>
                  <Input id="variant_b" name="variant_b" defaultValue={editing?.variant_b ?? ""} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="budget">Budget (৳)</Label>
                  <Input id="budget" name="budget" type="number" min={0} defaultValue={editing?.budget ?? 0} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="start_date">Start</Label>
                  <Input id="start_date" name="start_date" type="date" defaultValue={editing?.start_date ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="end_date">End</Label>
                  <Input id="end_date" name="end_date" type="date" defaultValue={editing?.end_date ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select name="status" defaultValue={editing?.status ?? "planned"}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="result">Result</Label>
                  <Textarea id="result" name="result" rows={2} defaultValue={editing?.result ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="winner">Winner</Label>
                  <Input id="winner" name="winner" defaultValue={editing?.winner ?? ""} placeholder="A / B / none" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="learning">Learning</Label>
                <Textarea id="learning" name="learning" rows={2} defaultValue={editing?.learning ?? ""} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={mSave.isPending} className="shadow-none">
                  {mSave.isPending ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {q.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <InsufficientData note="Ekhono kono experiment nei. New experiment diye shuru koro." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((exp) => (
            <Card key={exp.id} className="shadow-none">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{exp.title}</p>
                    {exp.hypothesis && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{exp.hypothesis}</p>
                    )}
                  </div>
                  <Badge variant="outline" className={statusTone[exp.status] ?? ""}>{exp.status}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                  <div><span className="block text-[10px] uppercase">Variable</span>{exp.variable ?? "—"}</div>
                  <div><span className="block text-[10px] uppercase">A / B</span>{exp.variant_a ?? "—"} / {exp.variant_b ?? "—"}</div>
                  <div><span className="block text-[10px] uppercase">Budget</span>{bdt(exp.budget)}</div>
                  <div><span className="block text-[10px] uppercase">Window</span>{exp.start_date ?? "—"} → {exp.end_date ?? "—"}</div>
                </div>
                {(exp.result || exp.winner) && (
                  <div className="rounded-md border border-border p-2 text-xs">
                    {exp.winner && <p><span className="font-medium">Winner:</span> {exp.winner}</p>}
                    {exp.result && <p className="text-muted-foreground">{exp.result}</p>}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="shadow-none"
                    onClick={() => { setEditing(exp); setOpen(true); }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shadow-none"
                    disabled={!exp.winner || mApply.isPending}
                    onClick={() => mApply.mutate(exp)}
                  >
                    <Trophy className="mr-1.5 h-3.5 w-3.5" /> Apply winner
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-destructive"
                    onClick={() => mDelete.mutate(exp.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
