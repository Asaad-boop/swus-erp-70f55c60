import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Megaphone, Plus, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { ContentKpi, ContentPageHeader } from "@/components/erp/content/content-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
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
  type MediaPlan,
} from "@/lib/erp/content/content-data";
import { getMediaPlanActuals } from "@/lib/erp/content/media-actuals.functions";

export const Route = createFileRoute("/_authenticated/erp/content/media-plans")({
  head: () => ({
    meta: [
      { title: "Media Buying Hub — Content Studio" },
      {
        name: "description",
        content:
          "Per-product campaign economics: target qty, ad and content budget, live delivered revenue and ROAS.",
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

function MediaPlansPage() {
  const { brandIds, activeBrand } = useBrand();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [open, setOpen] = useState<MediaPlan | null>(null);

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
    const m = new Map<string, { revenue: number; units: number; profit: number; spend: number }>();
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

  const totals = useMemo(() => {
    let planned = 0;
    let spend = 0;
    let revenue = 0;
    let profit = 0;
    for (const p of plans) {
      planned += p.ad_budget + p.content_budget + p.creator_budget;
      const a = actualsMap.get(p.id);
      if (a) {
        spend += a.spend;
        revenue += a.revenue;
        profit += a.profit;
      }
    }
    return { planned, spend, revenue, profit, roas: spend > 0 ? revenue / spend : 0 };
  }, [plans, actualsMap]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!draft.title.trim()) throw new Error("Title দাও");
      const { error } = await supabase.from("content_media_plans").insert({
        brand_id: activeBrand?.id ?? brandIds[0] ?? null,
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

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-3 md:p-6">
      <ContentPageHeader
        icon={Megaphone}
        title="Media Buying Hub"
        subtitle="Product-ভিত্তিক campaign economics — budget vs আসল delivered revenue"
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New media plan
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <ContentKpi label="Planned budget" value={bdt(totals.planned)} />
        <ContentKpi label="Actual ad spend" value={bdt(totals.spend)} tone="warn" />
        <ContentKpi label="Delivered revenue" value={bdt(totals.revenue)} tone="good" />
        <ContentKpi
          label="Gross profit"
          value={bdt(totals.profit)}
          tone={totals.profit >= 0 ? "good" : "bad"}
        />
        <ContentKpi label="ROAS" value={totals.roas ? `${totals.roas.toFixed(2)}x` : "—"} />
      </div>

      {plansQ.isLoading ? (
        <div className="grid gap-2 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          এখনো কোনো media plan নেই।
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {plans.map((p) => {
            const a = actualsMap.get(p.id);
            const budget = p.ad_budget + p.content_budget + p.creator_budget;
            const targetRevenue = p.target_qty * p.selling_price;
            const pct =
              targetRevenue > 0 ? Math.min(100, ((a?.revenue ?? 0) / targetRevenue) * 100) : 0;
            const contentCount = (itemsQ.data ?? []).filter((i) => i.media_plan_id === p.id)
              .length;
            return (
              <button
                key={p.id}
                onClick={() => setOpen(p)}
                className="rounded-xl border bg-card p-3 text-left shadow-sm transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{p.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {p.product_id ? (productName.get(p.product_id) ?? "—") : "Brand-wide"} ·{" "}
                      {p.start_date ?? "—"} → {p.end_date ?? "—"}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {p.status}
                  </Badge>
                </div>

                <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
                  <Metric label="Target" value={`${p.target_qty} pcs`} />
                  <Metric label="Budget" value={bdt(budget)} />
                  <Metric label="Spend" value={bdt(a?.spend ?? 0)} />
                  <Metric
                    label="ROAS"
                    value={a && a.spend > 0 ? `${(a.revenue / a.spend).toFixed(2)}x` : "—"}
                  />
                </div>

                <div className="mt-2.5">
                  <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>
                      {bdt(a?.revenue ?? 0)} / {bdt(targetRevenue)} delivered
                    </span>
                    <span>{contentCount} content</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Create sheet */}
      <Sheet open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-base">New media plan</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 py-3">
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
                    onChange={(e) =>
                      setDraft({ ...draft, [k]: Number(e.target.value) || 0 })
                    }
                    className="h-9"
                  />
                </div>
              ))}
            </div>
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
            <Button
              className="w-full"
              disabled={createMut.isPending}
              onClick={() => createMut.mutate()}
            >
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
              briefs={(briefsQ.data ?? []).filter((b) => b.media_plan_id === open.id)}
              creators={(creatorsQ.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
              onBrief={(v) => briefMut.mutate({ plan: open, ...v })}
              briefing={briefMut.isPending}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xs font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function PlanDetail({
  plan,
  actual,
  briefs,
  creators,
  onBrief,
  briefing,
}: {
  plan: MediaPlan;
  actual?: { revenue: number; units: number; profit: number; spend: number };
  briefs: { id: string; deliverable_type: string; hook: string | null; cost: number; approval_status: string }[];
  creators: { id: string; name: string }[];
  onBrief: (v: {
    creator_id: string;
    deliverable_type: string;
    hook: string;
    cost: number;
    due_date: string;
  }) => void;
  briefing: boolean;
}) {
  const [creator, setCreator] = useState("");
  const [type, setType] = useState("ugc");
  const [hook, setHook] = useState("");
  const [cost, setCost] = useState(0);
  const [due, setDue] = useState("");

  const budget = plan.ad_budget + plan.content_budget + plan.creator_budget;
  const cpa = actual && actual.units > 0 ? actual.spend / actual.units : 0;

  return (
    <>
      <SheetHeader>
        <SheetTitle className="text-base">{plan.title}</SheetTitle>
      </SheetHeader>
      <div className="space-y-4 py-3">
        <div className="grid grid-cols-3 gap-2">
          <ContentKpi label="Budget" value={bdt(budget)} />
          <ContentKpi label="Ad spend" value={bdt(actual?.spend ?? 0)} tone="warn" />
          <ContentKpi label="Revenue" value={bdt(actual?.revenue ?? 0)} tone="good" />
          <ContentKpi label="Delivered" value={`${actual?.units ?? 0} pcs`} />
          <ContentKpi
            label="Gross profit"
            value={bdt(actual?.profit ?? 0)}
            tone={(actual?.profit ?? 0) >= 0 ? "good" : "bad"}
          />
          <ContentKpi label="CPA" value={cpa ? bdt(cpa) : "—"} />
        </div>

        {plan.audience && (
          <p className="rounded-lg border bg-muted/40 p-2 text-[11px]">
            <span className="font-semibold">Audience:</span> {plan.audience}
          </p>
        )}
        {plan.notes && (
          <p className="rounded-lg border bg-muted/40 p-2 text-[11px] whitespace-pre-wrap">
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
                className="flex items-center justify-between rounded-lg border bg-card px-2.5 py-2"
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
            {briefs.length === 0 && (
              <p className="text-[11px] text-muted-foreground">এখনো brief নেই।</p>
            )}
          </div>
        </div>

        <div className="space-y-2 rounded-xl border p-2.5">
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
            onChange={(e) => setType(e.target.value)}
            placeholder="Deliverable type"
            className="h-9"
          />
          <Textarea
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            placeholder="Hook / brief"
            className="min-h-16 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              value={cost}
              onChange={(e) => setCost(Number(e.target.value) || 0)}
              placeholder="Cost"
              className="h-9"
            />
            <Input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="h-9"
            />
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