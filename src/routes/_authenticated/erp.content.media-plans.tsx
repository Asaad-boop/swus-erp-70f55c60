import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Megaphone,
  Plus,
  Target,
  LayoutGrid,
  GanttChartSquare,
  TrendingUp,
  TrendingDown,
  Wallet,
  Coins,
  Percent,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  bdt,
  fetchBriefs,
  fetchCreators,
  fetchItems,
  fetchMediaPlans,
  fetchProductsLite,
  APPROVAL_STATUSES,
  labelOf,
  mediaPlanEconomics,
  type MediaPlan,
} from "@/lib/erp/content/content-data";
import { getMediaPlanActuals } from "@/lib/erp/content/media-actuals.functions";
import {
  ContentHero,
  EmptyState,
  ExportButton,
  Kpi,
  KpiStrip,
  MiniBar,
  Pill,
  SearchBox,
  Segmented,
  Toolbar,
  downloadCsv,
  sortBy,
  usePersistedState,
  BrandTag,
  BrandSelect,
} from "@/components/erp/content/content-ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/content/media-plans")({
  head: () => ({
    meta: [
      { title: "Media Buying Hub — Content Studio" },
      {
        name: "description",
        content:
          "Per-product campaign economics: budget vs actual ad spend, break-even ROAS, delivered revenue and profit variance.",
      },
      { property: "og:title", content: "Media Buying Hub — Content Studio" },
      {
        property: "og:description",
        content: "Plan budget vs actual ad spend, delivered revenue and profit per product.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MediaPlansPage,
});

const emptyDraft = {
  title: "",
  product_id: "",
  target_qty: 0,
  selling_price: 0,
  ad_budget: 0,
  content_budget: 0,
  creator_budget: 0,
  audience: "",
  start_date: "",
  end_date: "",
  notes: "",
};

type Actual = { revenue: number; units: number; profit: number; spend: number };

function MediaPlansPage() {
  const { brandIds, activeBrand } = useBrand();
  const qc = useQueryClient();
  const [formBrand, setFormBrand] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [open, setOpen] = useState<MediaPlan | null>(null);

  const [view, patchView] = usePersistedState("media-plans", {
    search: "",
    status: "all",
    mode: "cards" as "cards" | "timeline",
    sort: "recent" as "recent" | "roas" | "spend" | "profit",
  });

  const plansQ = useQuery({
    queryKey: ["content-media-plans", brandIds],
    queryFn: () => fetchMediaPlans(brandIds),
  });
  const productsQ = useQuery({
    queryKey: ["content-products", brandIds],
    queryFn: () => fetchProductsLite(brandIds),
  });
  const itemsQ = useQuery({
    queryKey: ["content-items", brandIds],
    queryFn: () => fetchItems(brandIds),
  });
  const briefsQ = useQuery({
    queryKey: ["content-briefs", brandIds],
    queryFn: () => fetchBriefs(brandIds),
  });
  const creatorsQ = useQuery({
    queryKey: ["content-creators", brandIds],
    queryFn: () => fetchCreators(brandIds),
  });

  const plans = plansQ.data ?? [];
  const actualsFn = useServerFn(getMediaPlanActuals);
  const actualsQ = useQuery({
    queryKey: ["content-media-actuals", plans.map((p) => p.id).join(",")],
    enabled: plans.length > 0,
    queryFn: () =>
      actualsFn({
        data: {
          plans: plans.slice(0, 50).map((p) => ({
            id: p.id,
            brand_id: p.brand_id,
            product_id: p.product_id,
            start_date: p.start_date ?? new Date().toISOString().slice(0, 10),
            end_date: p.end_date ?? new Date().toISOString().slice(0, 10),
          })),
        },
      }),
  });

  const actualsMap = useMemo(() => {
    const m = new Map<string, Actual>();
    for (const a of actualsQ.data ?? [])
      m.set(a.plan_id, {
        revenue: a.delivered_revenue,
        units: a.delivered_units,
        profit: a.gross_profit,
        spend: a.ad_spend,
      });
    return m;
  }, [actualsQ.data]);

  const productName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of productsQ.data ?? []) m.set(p.id, p.title);
    return m;
  }, [productsQ.data]);

  const contentCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of itemsQ.data ?? []) {
      if (!i.media_plan_id) continue;
      m.set(i.media_plan_id, (m.get(i.media_plan_id) ?? 0) + 1);
    }
    return m;
  }, [itemsQ.data]);

  const filtered = useMemo(() => {
    const s = view.search.trim().toLowerCase();
    const out = plans.filter((p) => {
      if (view.status !== "all" && p.status !== view.status) return false;
      if (!s) return true;
      return (
        p.title.toLowerCase().includes(s) ||
        (p.audience ?? "").toLowerCase().includes(s) ||
        (p.product_id ? (productName.get(p.product_id) ?? "") : "").toLowerCase().includes(s)
      );
    });
    switch (view.sort) {
      case "roas":
        return sortBy(out, (p) => {
          const a = actualsMap.get(p.id);
          return a && a.spend > 0 ? a.revenue / a.spend : 0;
        });
      case "spend":
        return sortBy(out, (p) => actualsMap.get(p.id)?.spend ?? 0);
      case "profit":
        return sortBy(out, (p) => actualsMap.get(p.id)?.profit ?? 0);
      default:
        return sortBy(out, (p) => p.created_at);
    }
  }, [plans, view, actualsMap, productName]);

  const statuses = useMemo(() => [...new Set(plans.map((p) => p.status))], [plans]);

  const totals = useMemo(() => {
    let planned = 0;
    let spend = 0;
    let revenue = 0;
    let profit = 0;
    let targetRevenue = 0;
    for (const p of filtered) {
      planned += p.ad_budget + p.content_budget + p.creator_budget;
      targetRevenue += p.target_qty * p.selling_price;
      const a = actualsMap.get(p.id);
      if (a) {
        spend += a.spend;
        revenue += a.revenue;
        profit += a.profit;
      }
    }
    return {
      planned,
      spend,
      revenue,
      profit,
      targetRevenue,
      roas: spend > 0 ? revenue / spend : 0,
      pace: planned > 0 ? spend / planned : 0,
    };
  }, [filtered, actualsMap]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!draft.title.trim()) throw new Error("Title দাও");
      const brand_id = formBrand ?? activeBrand?.id ?? null;
      if (!brand_id) throw new Error("Brand বাছাই করুন");
      const { error } = await supabase.from("content_media_plans").insert({
        brand_id,
        title: draft.title.trim(),
        product_id: draft.product_id || null,
        target_qty: draft.target_qty,
        selling_price: draft.selling_price,
        ad_budget: draft.ad_budget,
        content_budget: draft.content_budget,
        creator_budget: draft.creator_budget,
        audience: draft.audience || null,
        start_date: draft.start_date || null,
        end_date: draft.end_date || null,
        notes: draft.notes || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Media plan তৈরি হয়েছে");
      setCreating(false);
      setDraft(emptyDraft);
      qc.invalidateQueries({ queryKey: ["content-media-plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMut = useMutation({
    mutationFn: async (v: { id: string; status: string }) => {
      const { error } = await supabase
        .from("content_media_plans")
        .update({ status: v.status } as never)
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status আপডেট হয়েছে");
      qc.invalidateQueries({ queryKey: ["content-media-plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const briefMut = useMutation({
    mutationFn: async (v: {
      plan: MediaPlan;
      creator_id: string;
      deliverable_type: string;
      hook: string;
      cost: number;
      due_date: string;
    }) => {
      const { error } = await supabase.from("content_briefs").insert({
        brand_id: v.plan.brand_id,
        media_plan_id: v.plan.id,
        creator_id: v.creator_id || null,
        deliverable_type: v.deliverable_type,
        hook: v.hook || null,
        cost: v.cost,
        due_date: v.due_date || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Brief পাঠানো হয়েছে");
      qc.invalidateQueries({ queryKey: ["content-briefs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("content_media_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Media plan মুছে ফেলা হয়েছে");
      setOpen(null);
      qc.invalidateQueries({ queryKey: ["content-media-plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = () =>
    downloadCsv(`media-plans-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["Plan", "Product", "Status", "Start", "End", "Target qty", "Price", "Budget", "Ad spend", "Revenue", "Units", "Profit", "ROAS", "Break-even ROAS"],
      ...filtered.map((p) => {
        const a = actualsMap.get(p.id);
        const e = mediaPlanEconomics(p);
        return [
          p.title,
          p.product_id ? (productName.get(p.product_id) ?? "") : "Brand-wide",
          p.status,
          p.start_date ?? "",
          p.end_date ?? "",
          p.target_qty,
          p.selling_price,
          e.totalBudget,
          a?.spend ?? 0,
          a?.revenue ?? 0,
          a?.units ?? 0,
          a?.profit ?? 0,
          a && a.spend > 0 ? (a.revenue / a.spend).toFixed(2) : "",
          e.breakEvenRoas.toFixed(2),
        ];
      }),
    ]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-3 md:p-6">
      <ContentHero
        icon={Megaphone}
        title="Media Buying Hub"
        subtitle="Product-ভিত্তিক campaign economics — planned budget বনাম আসল ad spend, delivered revenue আর profit variance।"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => actualsQ.refetch()}
              disabled={actualsQ.isFetching}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", actualsQ.isFetching && "animate-spin")} />
              Sync actuals
            </Button>
            <Button size="sm" className="h-9" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New media plan
            </Button>
          </>
        }
      >
        <KpiStrip cols={6}>
          <Kpi label="Planned budget" value={bdt(totals.planned)} icon={Wallet} />
          <Kpi
            label="Actual ad spend"
            value={bdt(totals.spend)}
            icon={Coins}
            tone={totals.pace > 1 ? "bad" : "warn"}
            hint={`${Math.round(totals.pace * 100)}% of budget`}
            progress={totals.pace}
          />
          <Kpi label="Delivered revenue" value={bdt(totals.revenue)} icon={TrendingUp} tone="good" />
          <Kpi
            label="Gross profit"
            value={bdt(totals.profit)}
            icon={totals.profit >= 0 ? TrendingUp : TrendingDown}
            tone={totals.profit >= 0 ? "good" : "bad"}
          />
          <Kpi
            label="ROAS"
            value={totals.roas ? `${totals.roas.toFixed(2)}x` : "—"}
            icon={Percent}
            tone={totals.roas >= 2 ? "good" : totals.roas > 0 ? "warn" : "default"}
          />
          <Kpi
            label="Target revenue"
            value={bdt(totals.targetRevenue)}
            icon={Target}
            hint={
              totals.targetRevenue > 0
                ? `${Math.round((totals.revenue / totals.targetRevenue) * 100)}% achieved`
                : undefined
            }
            progress={totals.targetRevenue > 0 ? totals.revenue / totals.targetRevenue : 0}
          />
        </KpiStrip>
      </ContentHero>

      <Toolbar>
        <SearchBox
          value={view.search}
          onChange={(v) => patchView({ search: v })}
          placeholder="Plan, product, audience…  ( / )"
        />
        <Segmented
          value={view.mode}
          onChange={(v) => patchView({ mode: v })}
          options={[
            { key: "cards", label: "Cards", icon: LayoutGrid },
            { key: "timeline", label: "Timeline", icon: GanttChartSquare },
          ]}
        />
        <Select value={view.status} onValueChange={(v) => patchView({ status: v })}>
          <SelectTrigger className="h-9 w-[130px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={view.sort} onValueChange={(v) => patchView({ sort: v as typeof view.sort })}>
          <SelectTrigger className="h-9 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent" className="text-xs">Sort: Newest</SelectItem>
            <SelectItem value="roas" className="text-xs">Sort: ROAS</SelectItem>
            <SelectItem value="spend" className="text-xs">Sort: Ad spend</SelectItem>
            <SelectItem value="profit" className="text-xs">Sort: Profit</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <ExportButton onClick={exportCsv} />
        </div>
      </Toolbar>

      {plansQ.isLoading ? (
        <div className="grid gap-2 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="এখনো কোনো media plan নেই"
          description="Product-ভিত্তিক budget আর target দিয়ে plan তৈরি করলে এখানে live economics দেখাবে।"
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New media plan
            </Button>
          }
        />
      ) : view.mode === "timeline" ? (
        <TimelineView
          plans={filtered}
          actuals={actualsMap}
          productName={productName}
          onOpen={setOpen}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              actual={actualsMap.get(p.id)}
              product={p.product_id ? (productName.get(p.product_id) ?? null) : null}
              contents={contentCount.get(p.id) ?? 0}
              onOpen={() => setOpen(p)}
            />
          ))}
        </div>
      )}

      {/* Create sheet */}
      <Sheet open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-base">New media plan</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 py-3">
            <BrandSelect value={formBrand ?? activeBrand?.id ?? null} onChange={setFormBrand} />
            <div>
              <Label className="text-[11px]">Title</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-[11px]">Product</Label>
              <Select
                value={draft.product_id || "none"}
                onValueChange={(v) => setDraft({ ...draft, product_id: v === "none" ? "" : v })}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Brand-wide</SelectItem>
                  {(productsQ.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["target_qty", "Target qty"],
                  ["selling_price", "Selling price"],
                  ["ad_budget", "Ad budget"],
                  ["content_budget", "Content budget"],
                  ["creator_budget", "Creator budget"],
                ] as const
              ).map(([k, label]) => (
                <div key={k}>
                  <Label className="text-[11px]">{label}</Label>
                  <Input
                    type="number"
                    value={draft[k]}
                    onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) || 0 })}
                    className="h-9"
                  />
                </div>
              ))}
            </div>
            <LivePreview draft={draft} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px]">Start</Label>
                <Input
                  type="date"
                  value={draft.start_date}
                  onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-[11px]">End</Label>
                <Input
                  type="date"
                  value={draft.end_date}
                  onChange={(e) => setDraft({ ...draft, end_date: e.target.value })}
                  className="h-9"
                />
              </div>
            </div>
            <div>
              <Label className="text-[11px]">Audience</Label>
              <Input
                value={draft.audience}
                onChange={(e) => setDraft({ ...draft, audience: e.target.value })}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-[11px]">Notes</Label>
              <Textarea
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                className="min-h-20 text-sm"
              />
            </div>
            <Button className="w-full" disabled={createMut.isPending} onClick={() => createMut.mutate()}>
              Create
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Detail sheet */}
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {open && (
            <PlanDetail
              plan={open}
              actual={actualsMap.get(open.id)}
              product={open.product_id ? (productName.get(open.product_id) ?? null) : null}
              briefs={(briefsQ.data ?? []).filter((b) => b.media_plan_id === open.id)}
              creators={(creatorsQ.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
              onBrief={(v) => briefMut.mutate({ plan: open, ...v })}
              onStatus={(s) => {
                statusMut.mutate({ id: open.id, status: s });
                setOpen({ ...open, status: s });
              }}
              briefing={briefMut.isPending}
              onDelete={() => {
                if (confirm(`"${open.title}" plan মুছে ফেলবে?`)) deleteMut.mutate(open.id);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function LivePreview({ draft }: { draft: typeof emptyDraft }) {
  const e = mediaPlanEconomics(draft);
  if (e.totalBudget <= 0 && e.revenue <= 0) return null;
  return (
    <div className="grid grid-cols-3 gap-2 rounded-xl border border-border/70 bg-muted/30 p-2">
      <Metric label="Budget" value={bdt(e.totalBudget)} />
      <Metric label="Break-even ROAS" value={`${e.breakEvenRoas.toFixed(2)}x`} />
      <Metric label="CAC ceiling" value={bdt(e.cac)} />
    </div>
  );
}

function PlanCard({
  plan: p,
  actual: a,
  product,
  contents,
  onOpen,
}: {
  plan: MediaPlan;
  actual?: Actual;
  product: string | null;
  contents: number;
  onOpen: () => void;
}) {
  const e = mediaPlanEconomics(p);
  const roas = a && a.spend > 0 ? a.revenue / a.spend : 0;
  const pace = e.totalBudget > 0 ? (a?.spend ?? 0) / e.totalBudget : 0;
  const achieved = e.revenue > 0 ? (a?.revenue ?? 0) / e.revenue : 0;
  const healthy = roas >= e.breakEvenRoas && roas > 0;

  return (
    <button
      onClick={onOpen}
      className="group rounded-xl border border-border/70 bg-card p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold group-hover:text-primary">{p.title}</p>
          <BrandTag brandId={p.brand_id} className="mt-0.5" />
          <p className="truncate text-[11px] text-muted-foreground">
            {product ?? "Brand-wide"} · {p.start_date ?? "—"} → {p.end_date ?? "—"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant="outline" className="text-[10px]">
            {p.status}
          </Badge>
          {a && a.spend > 0 && (
            <Pill tone={healthy ? "good" : "bad"}>
              {healthy ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {roas.toFixed(2)}x
            </Pill>
          )}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-2">
        <Metric label="Target" value={`${p.target_qty} pcs`} />
        <Metric label="Budget" value={bdt(e.totalBudget)} />
        <Metric label="Spend" value={bdt(a?.spend ?? 0)} />
        <Metric
          label="Profit"
          value={bdt(a?.profit ?? 0)}
          tone={(a?.profit ?? 0) >= 0 ? "good" : "bad"}
        />
      </div>

      <div className="mt-2.5 space-y-1.5">
        <div>
          <div className="mb-0.5 flex justify-between text-[10px] text-muted-foreground">
            <span>Revenue {bdt(a?.revenue ?? 0)} / {bdt(e.revenue)}</span>
            <span>{Math.round(achieved * 100)}%</span>
          </div>
          <MiniBar value={a?.revenue ?? 0} max={e.revenue} tone="good" />
        </div>
        <div>
          <div className="mb-0.5 flex justify-between text-[10px] text-muted-foreground">
            <span>Spend pace</span>
            <span>{Math.round(pace * 100)}% · {contents} content</span>
          </div>
          <MiniBar value={a?.spend ?? 0} max={e.totalBudget} tone={pace > 1 ? "bad" : "warn"} />
        </div>
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground">
        Break-even ROAS {e.breakEvenRoas.toFixed(2)}x · CAC ceiling {bdt(e.cac)}
      </p>
    </button>
  );
}

function TimelineView({
  plans,
  actuals,
  productName,
  onOpen,
}: {
  plans: MediaPlan[];
  actuals: Map<string, Actual>;
  productName: Map<string, string>;
  onOpen: (p: MediaPlan) => void;
}) {
  const dated = plans.filter((p) => p.start_date && p.end_date);
  const undated = plans.filter((p) => !p.start_date || !p.end_date);

  const range = useMemo(() => {
    if (dated.length === 0) return null;
    const starts = dated.map((p) => new Date(p.start_date!).getTime());
    const ends = dated.map((p) => new Date(p.end_date!).getTime());
    const min = Math.min(...starts);
    const max = Math.max(...ends);
    return { min, max, span: Math.max(1, max - min) };
  }, [dated]);

  return (
    <div className="space-y-3">
      {range ? (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card p-3">
          <div className="mb-2 flex justify-between text-[10px] text-muted-foreground">
            <span>{new Date(range.min).toLocaleDateString()}</span>
            <span>{new Date(range.max).toLocaleDateString()}</span>
          </div>
          <div className="space-y-2">
            {dated.map((p) => {
              const s = new Date(p.start_date!).getTime();
              const e = new Date(p.end_date!).getTime();
              const left = ((s - range.min) / range.span) * 100;
              const width = Math.max(2, ((e - s) / range.span) * 100);
              const a = actuals.get(p.id);
              const roas = a && a.spend > 0 ? a.revenue / a.spend : 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onOpen(p)}
                  className="block w-full text-left"
                >
                  <div className="mb-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-medium">
                      {p.title}
                      <span className="ml-1.5 text-muted-foreground">
                        {p.product_id ? (productName.get(p.product_id) ?? "") : "Brand-wide"}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {roas ? `${roas.toFixed(2)}x` : "—"}
                    </span>
                  </div>
                  <div className="relative h-4 w-full rounded bg-muted">
                    <div
                      className={cn(
                        "absolute inset-y-0 rounded",
                        roas >= 2 ? "bg-emerald-500/70" : roas > 0 ? "bg-amber-500/70" : "bg-primary/50",
                      )}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <EmptyState icon={GanttChartSquare} title="Timeline দেখাতে start ও end date দরকার" />
      )}

      {undated.length > 0 && (
        <div className="rounded-xl border border-dashed border-border/70 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Date নেই ({undated.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {undated.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpen(p)}
                className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] hover:border-primary/40 hover:text-primary"
              >
                {p.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-xs font-semibold tabular-nums",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}

const PLAN_STATUSES = ["draft", "active", "paused", "completed"];

function PlanDetail({
  plan,
  actual,
  product,
  briefs,
  creators,
  onBrief,
  onStatus,
  briefing,
  onDelete,
}: {
  plan: MediaPlan;
  actual?: Actual;
  product: string | null;
  briefs: { id: string; deliverable_type: string; hook: string | null; cost: number; approval_status: string }[];
  creators: { id: string; name: string }[];
  onBrief: (v: {
    creator_id: string;
    deliverable_type: string;
    hook: string;
    cost: number;
    due_date: string;
  }) => void;
  onStatus: (s: string) => void;
  briefing: boolean;
  onDelete: () => void;
}) {
  const [creator, setCreator] = useState("");
  const [type, setType] = useState("ugc");
  const [hook, setHook] = useState("");
  const [cost, setCost] = useState(0);
  const [due, setDue] = useState("");

  const e = mediaPlanEconomics(plan);
  const cpa = actual && actual.units > 0 ? actual.spend / actual.units : 0;
  const roas = actual && actual.spend > 0 ? actual.revenue / actual.spend : 0;
  const variance = (actual?.profit ?? 0) - e.grossProfit;
  const briefCost = briefs.reduce((s, b) => s + b.cost, 0);

  return (
    <>
      <SheetHeader>
        <div className="flex items-start justify-between gap-2 pr-6">
          <SheetTitle className="text-base">{plan.title}</SheetTitle>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {product ?? "Brand-wide"} · {plan.start_date ?? "—"} → {plan.end_date ?? "—"}
        </p>
      </SheetHeader>
      <div className="space-y-4 py-3">
        <div>
          <Label className="text-[11px]">Status</Label>
          <Select value={plan.status} onValueChange={onStatus}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...new Set([plan.status, ...PLAN_STATUSES])].map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <KpiStrip cols={3}>
          <Kpi label="Budget" value={bdt(e.totalBudget)} />
          <Kpi label="Ad spend" value={bdt(actual?.spend ?? 0)} tone="warn" />
          <Kpi label="Revenue" value={bdt(actual?.revenue ?? 0)} tone="good" />
          <Kpi label="Delivered" value={`${actual?.units ?? 0} pcs`} hint={`target ${plan.target_qty}`} />
          <Kpi
            label="Gross profit"
            value={bdt(actual?.profit ?? 0)}
            tone={(actual?.profit ?? 0) >= 0 ? "good" : "bad"}
            hint={`plan ${bdt(e.grossProfit)}`}
          />
          <Kpi label="CPA" value={cpa ? bdt(cpa) : "—"} hint={`ceiling ${bdt(e.cac)}`} />
        </KpiStrip>

        <div className="rounded-xl border border-border/70 bg-muted/30 p-2.5 text-[11px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">ROAS (actual / break-even)</span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                roas >= e.breakEvenRoas && roas > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-destructive",
              )}
            >
              {roas ? `${roas.toFixed(2)}x` : "—"} / {e.breakEvenRoas.toFixed(2)}x
            </span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-muted-foreground">Profit variance vs plan</span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                variance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
              )}
            >
              {variance >= 0 ? "+" : ""}
              {bdt(variance)}
            </span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-muted-foreground">Brief committed cost</span>
            <span className="font-semibold tabular-nums">{bdt(briefCost)}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Metric label="Ad budget" value={bdt(plan.ad_budget)} />
          <Metric label="Content" value={bdt(plan.content_budget)} />
          <Metric label="Creator" value={bdt(plan.creator_budget)} />
        </div>

        {plan.audience && (
          <p className="rounded-lg border border-border/70 bg-muted/30 p-2 text-[11px]">
            <span className="font-semibold">Audience:</span> {plan.audience}
          </p>
        )}
        {plan.notes && (
          <p className="whitespace-pre-wrap rounded-lg border border-border/70 bg-muted/30 p-2 text-[11px]">
            {plan.notes}
          </p>
        )}

        <div>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Target className="h-3.5 w-3.5" /> Briefs ({briefs.length})
          </h3>
          <div className="space-y-1.5">
            {briefs.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between rounded-lg border border-border/70 bg-card px-2.5 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{b.hook || b.deliverable_type}</p>
                  <p className="text-[10px] text-muted-foreground">{bdt(b.cost)}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {labelOf(APPROVAL_STATUSES, b.approval_status)}
                </Badge>
              </div>
            ))}
            {briefs.length === 0 && <p className="text-[11px] text-muted-foreground">এখনো brief নেই।</p>}
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-border/70 p-2.5">
          <p className="text-xs font-semibold">নতুন brief</p>
          <Select value={creator || "none"} onValueChange={(v) => setCreator(v === "none" ? "" : v)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Creator" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">In-house</SelectItem>
              {creators.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={type}
            onChange={(e2) => setType(e2.target.value)}
            placeholder="Deliverable type"
            className="h-9"
          />
          <Textarea
            value={hook}
            onChange={(e2) => setHook(e2.target.value)}
            placeholder="Hook / brief"
            className="min-h-16 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              value={cost}
              onChange={(e2) => setCost(Number(e2.target.value) || 0)}
              placeholder="Cost"
              className="h-9"
            />
            <Input type="date" value={due} onChange={(e2) => setDue(e2.target.value)} className="h-9" />
          </div>
          <Button
            size="sm"
            className="w-full"
            disabled={briefing}
            onClick={() => {
              onBrief({ creator_id: creator, deliverable_type: type, hook, cost, due_date: due });
              setHook("");
              setCost(0);
            }}
          >
            Send brief
          </Button>
        </div>
      </div>
    </>
  );
}
