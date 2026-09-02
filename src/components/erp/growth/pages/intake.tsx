import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PackageOpen,
  Timer,
  Sparkles,
  ExternalLink,
  ImageOff,
  Plus,
  Flame,
  Boxes,
  Truck,
  CheckCircle2,
  AlertTriangle,
  CircleSlash,
  Layers,
  RefreshCw,
  EyeOff,
  Undo2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  bdt,
  CONTENT_STYLES,
  contentRiskScore,
  coverageBucket,
  elapsedMs,
  fetchIntake,
  fetchInspirations,
  fmtElapsed,
  labelOf,
  riskTone,
  type IntakeRow,
} from "@/lib/erp/content/content-data";
import {
  ContentHero,
  DensityToggle,
  EmptyState,
  ExportButton,
  Kpi,
  KpiStrip,
  LoadingGrid,
  MiniBar,
  Pill,
  SearchBox,
  Segmented,
  Toolbar,
  downloadCsv,
  sortBy,
  useNow,
  usePersistedState,
} from "@/components/erp/content/content-ui";
import { cn } from "@/lib/utils";

type SortKey = "risk" | "idle" | "value" | "stock" | "title";
type CoverageTab = "all" | "none" | "under" | "covered";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "risk", label: "Risk score" },
  { key: "idle", label: "Idle time" },
  { key: "value", label: "Stock value" },
  { key: "stock", label: "Stock qty" },
  { key: "title", label: "Name" },
];

export function IntakePage() {
  const { brandIds, activeBrand } = useBrand();
  const qc = useQueryClient();
  const now = useNow();

  const [view, patchView] = usePersistedState("intake", {
    search: "",
    phase: "all" as "all" | "in_stock" | "in_transit",
    coverage: "all" as CoverageTab,
    sort: "risk" as SortKey,
    density: "comfortable" as "comfortable" | "compact",
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pushRows, setPushRows] = useState<IntakeRow[] | null>(null);
  const [preview, setPreview] = useState<Enriched | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);

  const rowsQ = useQuery({
    queryKey: ["content-intake", brandIds],
    queryFn: () => fetchIntake(brandIds),
  });
  const inspoQ = useQuery({
    queryKey: ["content-inspirations", brandIds],
    queryFn: () => fetchInspirations(brandIds),
  });
  const skippedQ = useQuery({
    queryKey: ["content-intake-skipped", brandIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_intake_excluded")
        .select("product_id, reason, created_at");
      if (error) throw error;
      return (data ?? []) as { product_id: string; reason: string | null; created_at: string }[];
    },
  });
  const skippedIds = useMemo(
    () => new Set((skippedQ.data ?? []).map((s) => s.product_id)),
    [skippedQ.data],
  );

  const rows = useMemo(
    () =>
      (rowsQ.data ?? []).map((r) => ({
        ...r,
        _risk: contentRiskScore(r, now),
        _idle: elapsedMs(r.since, now),
        _value: (r.stock + r.incoming_qty) * (r.price ?? 0),
        _bucket: coverageBucket(r.content_count, r.plan_target),
      })),
    [rowsQ.data, now],
  );

  const kpis = useMemo(() => {
    let inStock = 0;
    let inTransit = 0;
    let noContent = 0;
    let highRisk = 0;
    let value = 0;
    for (const r of rows) {
      if (r.phase === "in_stock") inStock++;
      else inTransit++;
      if (r._bucket === "none") noContent++;
      if (r._risk >= 70) highRisk++;
      value += r._value;
    }
    const covered = rows.filter((r) => r._bucket === "covered").length;
    return {
      inStock,
      inTransit,
      noContent,
      highRisk,
      value,
      covered,
      coverage: rows.length ? covered / rows.length : 0,
    };
  }, [rows]);

  const buckets = useMemo(() => {
    const b = { none: 0, under: 0, covered: 0 };
    for (const r of rows) b[r._bucket]++;
    return b;
  }, [rows]);

  const filtered = useMemo(() => {
    const s = view.search.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (showSkipped ? !skippedIds.has(r.product_id) : skippedIds.has(r.product_id)) return false;
      if (view.phase !== "all" && r.phase !== view.phase) return false;
      if (view.coverage !== "all" && r._bucket !== view.coverage) return false;
      if (!s) return true;
      return (
        r.title.toLowerCase().includes(s) ||
        (r.sku ?? "").toLowerCase().includes(s) ||
        r.po_numbers.some((p) => p.toLowerCase().includes(s))
      );
    });
    switch (view.sort) {
      case "idle":
        return sortBy(out, (r) => r._idle);
      case "value":
        return sortBy(out, (r) => r._value);
      case "stock":
        return sortBy(out, (r) => r.stock + r.incoming_qty);
      case "title":
        return sortBy(out, (r) => r.title.toLowerCase(), "asc");
      default:
        return sortBy(out, (r) => r._risk);
    }
  }, [rows, view, showSkipped, skippedIds]);

  const selectedRows = useMemo(
    () => filtered.filter((r) => selected.has(r.product_id)),
    [filtered, selected],
  );

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const skipMut = useMutation({
    mutationFn: async (input: { rows: IntakeRow[]; reason?: string }) => {
      const payload = input.rows.map((r) => ({
        product_id: r.product_id,
        brand_id: r.brand_id ?? activeBrand?.id ?? null,
        reason: input.reason ?? null,
      }));
      const { error } = await supabase
        .from("content_intake_excluded")
        .upsert(payload as never, { onConflict: "product_id" });
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (n) => {
      toast.success(`${n}টি product content list থেকে বাদ দেওয়া হয়েছে`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["content-intake-skipped"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unskipMut = useMutation({
    mutationFn: async (productIds: string[]) => {
      const { error } = await supabase
        .from("content_intake_excluded")
        .delete()
        .in("product_id", productIds);
      if (error) throw error;
      return productIds.length;
    },
    onSuccess: (n) => {
      toast.success(`${n}টি product আবার list-এ ফিরে এসেছে`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["content-intake-skipped"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pushMut = useMutation({
    mutationFn: async (input: {
      rows: IntakeRow[];
      count: number;
      targetDate: string;
      budget: number;
      strategy: string;
      content_style: string;
    }) => {
      for (const row of input.rows) {
        const brand_id = row.brand_id ?? activeBrand?.id ?? null;
        const { data: plan, error } = await supabase
          .from("content_plans")
          .insert({
            brand_id,
            product_id: row.product_id,
            title: row.title,
            target_count: input.count,
            target_date: input.targetDate || null,
            budget: input.budget,
            strategy: input.strategy || null,
            content_style: input.content_style || null,
          } as never)
          .select("id")
          .single();
        if (error) throw error;
        const planId = (plan as { id: string }).id;
        const items = Array.from({ length: Math.max(1, input.count) }, (_, i) => ({
          brand_id,
          plan_id: planId,
          product_id: row.product_id,
          title: `${row.title} — content ${i + 1}`,
          due_date: input.targetDate || null,
          cost: input.count > 0 ? Math.round(input.budget / input.count) : 0,
          content_style: input.content_style || null,
        }));
        const { error: e2 } = await supabase.from("content_items").insert(items as never);
        if (e2) throw e2;
      }
      return input.rows.length;
    },
    onSuccess: (n) => {
      toast.success(`${n}টি product-এর content plan তৈরি হয়েছে`);
      setPushRows(null);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["content-intake"] });
      qc.invalidateQueries({ queryKey: ["content-items"] });
      qc.invalidateQueries({ queryKey: ["content-plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = () =>
    downloadCsv(`content-intake-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["Product", "SKU", "Phase", "Stock", "Incoming", "Price", "Stock value", "Idle", "Content", "Published", "Target", "Risk"],
      ...filtered.map((r) => [
        r.title,
        r.sku ?? "",
        r.phase,
        r.stock,
        r.incoming_qty,
        r.price ?? "",
        Math.round(r._value),
        fmtElapsed(r._idle),
        r.content_count,
        r.published_count,
        r.plan_target ?? "",
        r._risk,
      ]),
    ]);

  const compact = view.density === "compact";

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-3 md:p-6">
      <ContentHero
        icon={PackageOpen}
        title="Stock → Content Intake"
        subtitle="Sourcing থেকে আসা প্রতিটি product এখানে risk score অনুযায়ী সাজানো — যেটার content নেই সেটা আগে দেখাবে।"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => rowsQ.refetch()}
              disabled={rowsQ.isFetching}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", rowsQ.isFetching && "animate-spin")} />
              Refresh
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9">
              <Link to="/erp/growth/pipeline">
                Pipeline <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </>
        }
      >
        <KpiStrip cols={5}>
          <Kpi
            label="In stock"
            value={kpis.inStock}
            icon={Boxes}
            onClick={() => patchView({ phase: view.phase === "in_stock" ? "all" : "in_stock" })}
            active={view.phase === "in_stock"}
          />
          <Kpi
            label="In transit"
            value={kpis.inTransit}
            icon={Truck}
            tone="info"
            onClick={() => patchView({ phase: view.phase === "in_transit" ? "all" : "in_transit" })}
            active={view.phase === "in_transit"}
          />
          <Kpi
            label="No content"
            value={kpis.noContent}
            icon={CircleSlash}
            tone="warn"
            onClick={() => patchView({ coverage: view.coverage === "none" ? "all" : "none" })}
            active={view.coverage === "none"}
          />
          <Kpi
            label="High risk"
            value={kpis.highRisk}
            icon={Flame}
            tone="bad"
            hint="Risk score ≥ 70"
            onClick={() => patchView({ sort: "risk" })}
          />
          <Kpi
            label="Coverage"
            value={`${Math.round(kpis.coverage * 100)}%`}
            icon={CheckCircle2}
            tone={kpis.coverage > 0.6 ? "good" : "warn"}
            hint={`${bdt(kpis.value)} stock value`}
            progress={kpis.coverage}
          />
        </KpiStrip>
      </ContentHero>

      <Toolbar>
        <SearchBox
          value={view.search}
          onChange={(v) => patchView({ search: v })}
          placeholder="Product, SKU বা PO খোঁজো…  ( / )"
        />
        <Segmented
          value={view.coverage}
          onChange={(v) => patchView({ coverage: v })}
          options={[
            { key: "all", label: "All", count: rows.length },
            { key: "none", label: "No content", count: buckets.none },
            { key: "under", label: "Under target", count: buckets.under },
            { key: "covered", label: "Covered", count: buckets.covered },
          ]}
        />
        <Select value={view.sort} onValueChange={(v) => patchView({ sort: v as SortKey })}>
          <SelectTrigger className="h-9 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.key} value={s.key} className="text-xs">
                Sort: {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant={showSkipped ? "default" : "outline"}
            size="sm"
            className="h-9 gap-1.5 text-xs"
            onClick={() => {
              setShowSkipped((v) => !v);
              setSelected(new Set());
            }}
          >
            <EyeOff className="h-3.5 w-3.5" />
            Skipped ({skippedIds.size})
          </Button>
          <DensityToggle value={view.density} onChange={(v) => patchView({ density: v })} />
          <ExportButton onClick={exportCsv} />
        </div>
      </Toolbar>

      {selectedRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
          <Layers className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium">{selectedRows.length} product selected</span>
          <span className="text-[11px] text-muted-foreground">
            মোট stock value {bdt(selectedRows.reduce((a, r) => a + r._value, 0))}
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            {showSkipped ? (
              <Button
                size="sm"
                className="h-8"
                disabled={unskipMut.isPending}
                onClick={() => unskipMut.mutate(selectedRows.map((r) => r.product_id))}
              >
                <Undo2 className="mr-1 h-3.5 w-3.5" /> Restore
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={skipMut.isPending}
                  onClick={() => skipMut.mutate({ rows: selectedRows })}
                >
                  <EyeOff className="mr-1 h-3.5 w-3.5" /> Content লাগবে না
                </Button>
                <Button size="sm" className="h-8" onClick={() => setPushRows(selectedRows)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Bulk push to plan
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {rowsQ.isLoading ? (
        <LoadingGrid rows={6} height={compact ? 64 : 116} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title={showSkipped ? "কোনো skipped product নেই" : "কোনো product পাওয়া যায়নি"}
          description={
            showSkipped
              ? "যেসব product-এর content দরকার নেই সেগুলো এখানে জমা হবে — যেকোনো সময় restore করা যাবে।"
              : "Filter বদলাও, অথবা Supply Chain থেকে নতুন stock এলে এখানে নিজে থেকেই দেখাবে।"
          }
        />
      ) : (
        <div
          className={cn(
            "grid gap-2",
            compact ? "grid-cols-1" : "sm:grid-cols-2 xl:grid-cols-3",
          )}
        >
          {filtered.map((r) => (
            <IntakeCard
              key={r.product_id}
              row={r}
              compact={compact}
              selected={selected.has(r.product_id)}
              skipped={showSkipped}
              onSkip={() =>
                showSkipped
                  ? unskipMut.mutate([r.product_id])
                  : skipMut.mutate({ rows: [r] })
              }
              onToggle={() => toggle(r.product_id)}
              onPreview={() => setPreview(r)}
              onPush={() => setPushRows([r])}
            />
          ))}
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
                className="w-36 shrink-0 rounded-xl border border-border/70 bg-card p-2 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                {i.image_url ? (
                  <img
                    src={i.image_url}
                    alt={i.title}
                    loading="lazy"
                    className="mb-1.5 h-20 w-full rounded-lg object-cover"
                  />
                ) : (
                  <div className="mb-1.5 grid h-20 place-items-center rounded-lg bg-muted">
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
        rows={pushRows}
        saving={pushMut.isPending}
        onClose={() => setPushRows(null)}
        onSave={(v) => pushRows && pushMut.mutate({ rows: pushRows, ...v })}
      />

      <PreviewSheet row={preview} onClose={() => setPreview(null)} onPush={(r) => { setPreview(null); setPushRows([r]); }} />
    </div>
  );
}

type Enriched = IntakeRow & { _risk: number; _idle: number; _value: number; _bucket: ReturnType<typeof coverageBucket> };

function IntakeCard({
  row,
  compact,
  selected,
  skipped,
  onSkip,
  onToggle,
  onPreview,
  onPush,
}: {
  row: Enriched;
  compact: boolean;
  selected: boolean;
  skipped: boolean;
  onSkip: () => void;
  onToggle: () => void;
  onPreview: () => void;
  onPush: () => void;
}) {
  const tone = riskTone(row._risk);
  const target = Math.max(1, row.plan_target ?? 3);
  const ring =
    tone === "bad"
      ? "border-destructive/40"
      : tone === "warn"
        ? "border-amber-500/40"
        : "border-border/70";

  return (
    <div
      className={cn(
        "group relative rounded-xl border bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
        ring,
        selected && "ring-1 ring-primary/40",
      )}
    >
      <div className="flex gap-3">
        <div className="relative shrink-0">
          <button type="button" onClick={onPreview} className="block">
            {row.image ? (
              <img
                src={row.image}
                alt={row.title}
                loading="lazy"
                className={cn(
                  "rounded-lg border object-cover",
                  compact ? "h-11 w-11" : "h-16 w-16",
                )}
              />
            ) : (
              <div
                className={cn(
                  "grid place-items-center rounded-lg border bg-muted",
                  compact ? "h-11 w-11" : "h-16 w-16",
                )}
              >
                <ImageOff className="h-5 w-5 text-muted-foreground/50" />
              </div>
            )}
          </button>
          <span className="absolute -left-1.5 -top-1.5">
            <Checkbox checked={selected} onCheckedChange={onToggle} className="h-4 w-4 bg-background" />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <button type="button" onClick={onPreview} className="min-w-0 text-left">
              <p className="truncate text-sm font-semibold group-hover:text-primary">{row.title}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {row.sku || "No SKU"} · {row.price != null ? bdt(row.price) : "—"} ·{" "}
                {row.phase === "in_stock" ? `Stock ${row.stock}` : `Incoming ${row.incoming_qty}`}
              </p>
            </button>
            <Pill tone={tone}>
              {tone === "bad" ? <Flame className="h-3 w-3" /> : tone === "warn" ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
              {row._risk}
            </Pill>
          </div>

          {!compact && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Pill tone={row._bucket === "none" ? "bad" : row._bucket === "under" ? "warn" : "good"}>
                <Timer className="h-3 w-3" />
                {fmtElapsed(row._idle)} {row.phase === "in_stock" ? "in stock" : "in transit"}
              </Pill>
              {row.published_count > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {row.published_count} live
                </Badge>
              )}
              {row.po_numbers.slice(0, 2).map((p) => (
                <Badge key={p} variant="outline" className="text-[10px]">
                  {p}
                </Badge>
              ))}
            </div>
          )}

          <div className="mt-2 flex items-center gap-2">
            <MiniBar
              value={row.content_count}
              max={target}
              tone={row._bucket === "covered" ? "good" : row._bucket === "under" ? "warn" : "bad"}
              className="flex-1"
            />
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {row.content_count}/{target}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="truncate text-[11px] text-muted-foreground">
          {row.plan_id ? `Plan active · ${bdt(row._value)} value` : `কোনো plan নেই · ${bdt(row._value)} value`}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {skipped ? (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onSkip}>
              <Undo2 className="mr-1 h-3 w-3" /> Restore
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                title="Content লাগবে না — list থেকে বাদ দাও"
                onClick={onSkip}
              >
                <EyeOff className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={onPush}>
                <Plus className="mr-1 h-3 w-3" /> Push
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewSheet({
  row,
  onClose,
  onPush,
}: {
  row: Enriched | null;
  onClose: () => void;
  onPush: (r: Enriched) => void;
}) {
  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-base">{row?.title}</SheetTitle>
        </SheetHeader>
        {row && (
          <div className="mt-4 space-y-4">
            {row.image && (
              <img src={row.image} alt={row.title} className="h-48 w-full rounded-xl border object-cover" />
            )}
            <div className="grid grid-cols-2 gap-2">
              <Field label="SKU" value={row.sku || "—"} />
              <Field label="Price" value={row.price != null ? bdt(row.price) : "—"} />
              <Field label="Stock" value={String(row.stock)} />
              <Field label="Incoming" value={String(row.incoming_qty)} />
              <Field label="Stock value" value={bdt(row._value)} />
              <Field label="Idle" value={fmtElapsed(row._idle)} />
              <Field label="Content" value={`${row.content_count} (${row.published_count} live)`} />
              <Field label="Risk score" value={String(row._risk)} />
            </div>
            {row.po_numbers.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Purchase orders
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {row.po_numbers.map((p) => (
                    <Badge key={p} variant="outline" className="text-[10px]">
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <Button className="w-full" onClick={() => onPush(row)}>
              <Plus className="mr-1.5 h-4 w-4" /> Push to content plan
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 px-2.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

const BRIEF_TEMPLATES = [
  { key: "", label: "কোনো template নয়", text: "" },
  {
    key: "ugc",
    label: "UGC unboxing",
    text: "Hook: প্রথম ৩ সেকেন্ডে product-এর সবচেয়ে বড় benefit দেখাও।\nBody: unboxing → real use → before/after।\nCTA: 'অর্ডার করতে কমেন্টে Price লিখুন'।",
  },
  {
    key: "problem",
    label: "Problem → Solution",
    text: "Hook: customer-এর pain point দিয়ে শুরু।\nBody: কেন আগের সমাধান কাজ করে না, তারপর আমাদের product।\nCTA: limited stock urgency।",
  },
  {
    key: "review",
    label: "Review / testimonial",
    text: "Hook: real customer voice।\nBody: ব্যবহারের ৭ দিনের অভিজ্ঞতা, ৩টি specific benefit।\nCTA: delivery ও warranty mention করে অর্ডার।",
  },
];

function PushDialog({
  rows,
  saving,
  onClose,
  onSave,
}: {
  rows: IntakeRow[] | null;
  saving: boolean;
  onClose: () => void;
  onSave: (v: { count: number; targetDate: string; budget: number; strategy: string; content_style: string }) => void;
}) {
  const [count, setCount] = useState(3);
  const [targetDate, setTargetDate] = useState("");
  const [budget, setBudget] = useState(0);
  const [strategy, setStrategy] = useState("");
  const [template, setTemplate] = useState("");
  const [contentStyle, setContentStyle] = useState("");

  useEffect(() => {
    if (rows) {
      setCount(3);
      const d = new Date();
      d.setDate(d.getDate() + 7);
      setTargetDate(d.toISOString().slice(0, 10));
      setBudget(0);
      setStrategy("");
      setTemplate("");
      setContentStyle("");
    }
  }, [rows]);

  const n = rows?.length ?? 0;

  return (
    <Dialog open={!!rows} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {n > 1 ? `${n}টি product-এর content plan` : `Content plan — ${rows?.[0]?.title}`}
          </DialogTitle>
          <DialogDescription className="text-xs">
            প্রতিটি product-এর জন্য একটি plan ও {count}টি content card তৈরি হবে।
          </DialogDescription>
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
            <Label className="text-[11px]">Content budget প্রতি product (৳)</Label>
            <Input
              type="number"
              min={0}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value) || 0)}
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-[11px]">Brief template</Label>
            <Select
              value={template}
              onValueChange={(v) => {
                setTemplate(v);
                const t = BRIEF_TEMPLATES.find((x) => x.key === v);
                if (t?.text) setStrategy(t.text);
              }}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Template বাছো" />
              </SelectTrigger>
              <SelectContent>
                {BRIEF_TEMPLATES.filter((t) => t.key).map((t) => (
                  <SelectItem key={t.key} value={t.key} className="text-xs">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px]">Content style</Label>
            <Select
              value={contentStyle}
              onValueChange={(v) => setContentStyle(v)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Style বাছো" />
              </SelectTrigger>
              <SelectContent>
                {CONTENT_STYLES.map((t) => (
                  <SelectItem key={t.key} value={t.key} className="text-xs">
                    {t.label}
                    {t.hint && <span className="ml-1.5 text-muted-foreground">— {t.hint}</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px]">Strategy / angle note</Label>
            <Textarea
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              className="min-h-24 text-sm"
              placeholder="কোন angle, কোন audience, কী ধরনের hook..."
            />
          </div>
          {n > 1 && (
            <div className="rounded-lg border border-border/70 bg-muted/30 p-2 text-[11px] text-muted-foreground">
              {rows?.slice(0, 6).map((r) => (
                <p key={r.product_id} className="truncate">
                  • {r.title}
                </p>
              ))}
              {n > 6 && <p>…আরও {n - 6}টি</p>}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => onSave({ count, targetDate, budget, strategy, content_style: contentStyle })}>
            {saving ? "তৈরি হচ্ছে…" : n > 1 ? `${n}টি plan তৈরি করো` : "Create plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
