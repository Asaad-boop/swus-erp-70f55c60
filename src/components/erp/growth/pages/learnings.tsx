import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BookOpen, Plus, Search, Trash2 } from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { InsufficientData } from "@/components/erp/growth/growth-filters";
import { deleteLearning, listLearnings, saveLearning } from "@/lib/erp/growth/lab.functions";
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

export function LearningsPanel() {
  const { brandIds, activeBrand, isLoading } = useBrand();
  const qc = useQueryClient();
  const list = useServerFn(listLearnings);
  const save = useServerFn(saveLearning);
  const remove = useServerFn(deleteLearning);
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const q = useQuery({
    queryKey: ["growth-learnings", brandIds],
    enabled: !isLoading && brandIds.length > 0,
    queryFn: () => list({ data: { brandIds } }),
  });

  const mSave = useMutation({
    mutationFn: (vars: { insight: string; category: string | null; tags: string[]; confidence: string }) =>
      save({ data: { brandId: activeBrand?.id ?? brandIds[0]!, ...vars } }),
    onSuccess: () => {
      toast.success("Learning saved");
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["growth-learnings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mDelete = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["growth-learnings"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (q.data ?? []).filter((r) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      r.insight.toLowerCase().includes(s) ||
      (r.category ?? "").toLowerCase().includes(s) ||
      r.tags.some((t) => t.toLowerCase().includes(s))
    );
  });

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="h-4 w-4 text-muted-foreground" /> Learning database
          </h2>
          <p className="text-xs text-muted-foreground">Reusable insight — ja shikhechi, ta ekhane thakbe.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search insight / tag"
              className="h-9 w-48 pl-8"
            />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="shadow-none">
                <Plus className="mr-1.5 h-4 w-4" /> Add learning
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New learning</DialogTitle></DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const insight = String(f.get("insight") ?? "").trim();
                  if (!insight) return toast.error("Insight lagbe");
                  mSave.mutate({
                    insight,
                    category: String(f.get("category") ?? "").trim() || null,
                    tags: String(f.get("tags") ?? "")
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                    confidence: String(f.get("confidence") ?? "medium"),
                  });
                }}
                className="space-y-3"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="insight">Insight</Label>
                  <Textarea id="insight" name="insight" rows={3} required />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="category">Category</Label>
                    <Input id="category" name="category" placeholder="Creative / Offer / Audience" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tags">Tags</Label>
                    <Input id="tags" name="tags" placeholder="comma, separated" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Confidence</Label>
                    <Select name="confidence" defaultValue="medium">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">low</SelectItem>
                        <SelectItem value="medium">medium</SelectItem>
                        <SelectItem value="high">high</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={mSave.isPending} className="shadow-none">Save</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {q.isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <InsufficientData note="Kono learning record nei." />
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {rows.map((r) => (
            <Card key={r.id} className="shadow-none">
              <CardContent className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{r.insight}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {r.category && <Badge variant="outline">{r.category}</Badge>}
                    {r.tags.map((t) => (
                      <Badge key={t} variant="secondary">{t}</Badge>
                    ))}
                    <span className="text-[11px] text-muted-foreground">
                      {r.confidence} · {new Date(r.created_at).toLocaleDateString("en-GB")}
                    </span>
                  </div>
                </div>
                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => mDelete.mutate(r.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
