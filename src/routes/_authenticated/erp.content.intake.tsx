import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PackageOpen,
  Search,
  Timer,
  Sparkles,
  ExternalLink,
  ImageOff,
  Plus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { ContentKpi, ContentPageHeader } from "@/components/erp/content/content-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  bdt,
  elapsedMs,
  fetchIntake,
  fetchInspirations,
  fmtElapsed,
  IDLE_TONE_CLASS,
  idleTone,
  type IntakeRow,
} from "@/lib/erp/content/content-data";

export const Route = createFileRoute("/_authenticated/erp/content/intake")({
  head: () => ({
    meta: [
      { title: "Stock → Content Intake — Content Studio" },
      {
        name: "description",
        content:
          "In-transit and in-stock products with a live content idle timer, so no product sits without creative for long.",
      },
      { property: "og:title", content: "Stock → Content Intake — Content Studio" },
      {
        property: "og:description",
        content: "Push freshly sourced products into a content plan before they go idle.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IntakePage,
});

function IntakePage() {
  const { brandIds, activeBrand } = useBrand();
  const qc = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [search, setSearch] = useState("");
  const [phase, setPhase] = useState<"all" | "in_stock" | "in_transit" | "idle">("all");
  const [target, setTarget] = useState<IntakeRow | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const rowsQ = useQuery({
    queryKey: ["content-intake", brandIds],
    queryFn: () => fetchIntake(brandIds),
  });
  const inspoQ = useQuery({
    queryKey: ["content-inspirations", brandIds],
    queryFn: () => fetchInspirations(brandIds),
  });

  const rows = rowsQ.data ?? [];

  const kpis = useMemo(() => {
    let inStock = 0;
    let inTransit = 0;
    let noContent = 0;
    let overdue = 0;
    for (const r of rows) {
      if (r.phase === "in_stock") inStock++;
      else inTransit++;
      if (r.content_count === 0) noContent++;
      if (idleTone(elapsedMs(r.since, now), r.content_count > 0) === "bad") overdue++;
    }
    return { inStock, inTransit, noContent, overdue };
  }, [rows, now]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (phase === "in_stock" && r.phase !== "in_stock") return false;
      if (phase === "in_transit" && r.phase !== "in_transit") return false;
      if (phase === "idle" && idleTone(elapsedMs(r.since, now), r.content_count > 0) !== "bad")
        return false;
      if (!s) return true;
      return (
        r.title.toLowerCase().includes(s) || (r.sku ?? "").toLowerCase().includes(s)
      );
    });
  }, [rows, search, phase, now]);

  const pushMut = useMutation({
    mutationFn: async (input: {
      row: IntakeRow;
      count: number;
      targetDate: string;
      budget: number;
      strategy: string;
    }) => {
      const brand_id = input.row.brand_id ?? activeBrand?.id ?? null;
      const { data: plan, error } = await supabase
        .from("content_plans")
        .insert({
          brand_id,
          product_id: input.row.product_id,
          title: input.row.title,
          target_count: input.count,
          target_date: input.targetDate || null,
          budget: input.budget,
          strategy: input.strategy || null,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      const planId = (plan as { id: string }).id;
      const items = Array.from({ length: Math.max(1, input.count) }, (_, i) => ({
        brand_id,
        plan_id: planId,
        product_id: input.row.product_id,
        title: `${input.row.title} — content ${i + 1}`,
        due_date: input.targetDate || null,
        cost: input.count > 0 ? Math.round(input.budget / input.count) : 0,
      }));
      const { error: e2 } = await supabase.from("content_items").insert(items as never);
      if (e2) throw e2;
      return planId;
    },
    onSuccess: () => {
      toast.success("Content plan তৈরি হয়েছে — Pipeline-এ card চলে গেছে");
      setTarget(null);
      qc.invalidateQueries({ queryKey: ["content-intake"] });
      qc.invalidateQueries({ queryKey: ["content-items"] });
      qc.invalidateQueries({ queryKey: ["content-plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-3 md:p-6">
      <ContentPageHeader
        icon={PackageOpen}
        title="Stock → Content Intake"
        subtitle="Sourcing থেকে আসা product এখানে auto আসে — idle timer দেখে content plan push করো"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/erp/content/pipeline">
              Pipeline <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <ContentKpi
          label="In stock"
          value={kpis.inStock}
          onClick={() => setPhase(phase === "in_stock" ? "all" : "in_stock")}
          active={phase === "in_stock"}
        />
        <ContentKpi
          label="In transit"
          value={kpis.inTransit}
          onClick={() => setPhase(phase === "in_transit" ? "all" : "in_transit")}
          active={phase === "in_transit"}
        />
        <ContentKpi label="No content yet" value={kpis.noContent} tone="warn" />
        <ContentKpi
          label="Idle 72h+"
          value={kpis.overdue}
          tone="bad"
          onClick={() => setPhase(phase === "idle" ? "all" : "idle")}
          active={phase === "idle"}
        />
      </div>

      <div className="sticky top-[46px] z-20 flex items-center gap-2 rounded-xl border bg-background/85 p-2 backdrop-blur">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Product বা SKU খোঁজো..."
            className="h-9 pl-8 text-sm"
          />
        </div>
        {phase !== "all" && (
          <Button variant="ghost" size="sm" onClick={() => setPhase("all")}>
            Clear
          </Button>
        )}
      </div>

      {rowsQ.isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          কোনো product পাওয়া যায়নি।
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => {
            const ms = elapsedMs(r.since, now);
            const tone = idleTone(ms, r.content_count > 0);
            return (
              <div key={r.product_id} className="rounded-xl border bg-card p-3 shadow-sm">
                <div className="flex gap-3">
                  {r.image ? (
                    <img
                      src={r.image}
                      alt={r.title}
                      loading="lazy"
                      className="h-14 w-14 shrink-0 rounded-lg border object-cover"
                    />
                  ) : (
                    <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border bg-muted">
                      <ImageOff className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{r.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {r.sku || "No SKU"} · {r.price != null ? bdt(r.price) : "—"} ·{" "}
                      {r.phase === "in_stock"
                        ? `Stock ${r.stock}`
                        : `Incoming ${r.incoming_qty}`}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={`gap-1 text-[10px] ${IDLE_TONE_CLASS[tone]}`}
                      >
                        <Timer className="h-3 w-3" />
                        {fmtElapsed(ms)} {r.phase === "in_stock" ? "in stock" : "in transit"} ·{" "}
                        {r.content_count} content
                      </Badge>
                      {r.published_count > 0 && (
                        <Badge variant="secondary" className="text-[10px]">
                          {r.published_count} live
                        </Badge>
                      )}
                      {r.po_numbers.slice(0, 2).map((p) => (
                        <Badge key={p} variant="outline" className="text-[10px]">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {r.plan_id
                      ? `Plan: ${r.content_count}/${r.plan_target ?? 0} content`
                      : "কোনো plan নেই"}
                  </span>
                  <Button size="sm" className="h-7 text-xs" onClick={() => setTarget(r)}>
                    <Plus className="mr-1 h-3 w-3" /> Push to plan
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(inspoQ.data ?? []).length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Inspiration (Product Scraping থেকে)
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(inspoQ.data ?? []).map((i) => (
              <a
                key={i.id}
                href={i.source_url ?? i.video_url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="w-36 shrink-0 rounded-lg border bg-card p-2 hover:border-primary/40"
              >
                {i.image_url ? (
                  <img
                    src={i.image_url}
                    alt={i.title}
                    loading="lazy"
                    className="mb-1.5 h-20 w-full rounded object-cover"
                  />
                ) : (
                  <div className="mb-1.5 grid h-20 place-items-center rounded bg-muted">
                    <ImageOff className="h-4 w-4 text-muted-foreground/50" />
                  </div>
                )}
                <p className="line-clamp-2 text-[11px] font-medium">{i.title}</p>
              </a>
            ))}
          </div>
        </section>
      )}

      <PushDialog
        row={target}
        saving={pushMut.isPending}
        onClose={() => setTarget(null)}
        onSave={(v) => target && pushMut.mutate({ row: target, ...v })}
      />
    </div>
  );
}

function PushDialog({
  row,
  saving,
  onClose,
  onSave,
}: {
  row: IntakeRow | null;
  saving: boolean;
  onClose: () => void;
  onSave: (v: { count: number; targetDate: string; budget: number; strategy: string }) => void;
}) {
  const [count, setCount] = useState(3);
  const [targetDate, setTargetDate] = useState("");
  const [budget, setBudget] = useState(0);
  const [strategy, setStrategy] = useState("");

  useEffect(() => {
    if (row) {
      setCount(3);
      setTargetDate("");
      setBudget(0);
      setStrategy("");
    }
  }, [row]);

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Content plan — {row?.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px]">কয়টা content</Label>
              <Input
                type="number"
                min={1}
                value={count}
                onChange={(e) => setCount(Number(e.target.value) || 1)}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-[11px]">Target date</Label>
              <Input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <div>
            <Label className="text-[11px]">Content budget (৳)</Label>
            <Input
              type="number"
              min={0}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value) || 0)}
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-[11px]">Strategy / angle note</Label>
            <Textarea
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              className="min-h-20 text-sm"
              placeholder="কোন angle, কোন audience, কী ধরনের hook..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={() => onSave({ count, targetDate, budget, strategy })}
          >
            Create plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}