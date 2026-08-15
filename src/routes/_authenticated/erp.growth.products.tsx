import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Lightbulb,
  Plus,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  Pencil,
  Calculator,
  ExternalLink,
  Heart,
  CheckCircle2,
  XCircle,
  PackageSearch,
} from "lucide-react";
import {
  Search,
  Copy,
  LayoutGrid,
  Columns3,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  X,
} from "lucide-react";
import { PlayCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { useCurrentRole } from "@/hooks/use-current-role";
import { HubPageHeader } from "@/components/erp/hub/hub-shell";
import { IdeaGallery, StarRating } from "@/components/erp/hub/idea-visuals";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  IDEA_STATUSES,
  IDEA_FUNNEL_ORDER,
  fetchForecasts,
  fetchIdeaSummaries,
  fetchIdeas,
  fetchMyVotes,
  fetchIdeaPeople,
  fmtValue,
  type HubIdea,
  type HubIdeaForecast,
  type HubIdeaVoter,
} from "@/lib/erp/hub/hub-data";

export const Route = createFileRoute("/_authenticated/erp/growth/products")({
  head: () => ({
    meta: [
      { title: "Product Pipeline — Growth Hub" },
      {
        name: "description",
        content:
          "Team product idea board with up/down voting, supplier links and profit forecasting from idea to launch.",
      },
      { property: "og:title", content: "Product Pipeline — Growth Hub" },
      {
        property: "og:description",
        content: "Add product ideas, vote as a team and forecast monthly profit before ordering.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductPipelinePage,
});

type Draft = {
  id?: string;
  title: string;
  description: string;
  image_url: string;
  images: string;
  source_url: string;
  video_url: string;
  supplier_name: string;
  supplier_url: string;
  category: string;
  est_unit_cost: string;
  est_sell_price: string;
  target_price_min: string;
  target_price_max: string;
  moq: string;
  status: string;
  notes: string;
};

const emptyDraft = (): Draft => ({
  title: "",
  description: "",
  image_url: "",
  images: "",
  source_url: "",
  video_url: "",
  supplier_name: "",
  supplier_url: "",
  category: "",
  est_unit_cost: "",
  est_sell_price: "",
  target_price_min: "",
  target_price_max: "",
  moq: "",
  status: "voting",
  notes: "",
});

const STATUS_STYLE: Record<string, string> = {
  idea: "bg-background/90 text-muted-foreground",
  voting: "bg-indigo-500/90 text-white",
  approved: "bg-emerald-500/90 text-white",
  sourcing: "bg-amber-500/90 text-white",
  ordered: "bg-sky-500/90 text-white",
  launched: "bg-violet-500/90 text-white",
  rejected: "bg-destructive/90 text-destructive-foreground",
};

type FDraft = {
  monthly_units: string;
  sell_price: string;
  unit_cost: string;
  ad_cost_per_order: string;
  courier_cost: string;
  packaging_cost: string;
  return_rate: string;
};

const emptyForecast = (i?: HubIdea): FDraft => ({
  monthly_units: "100",
  sell_price: i ? String(i.est_sell_price || "") : "",
  unit_cost: i ? String(i.est_unit_cost || "") : "",
  ad_cost_per_order: "150",
  courier_cost: "80",
  packaging_cost: "20",
  return_rate: "15",
});

function calcForecast(f: FDraft) {
  const units = Number(f.monthly_units || 0);
  const rr = Number(f.return_rate || 0) / 100;
  const price = Number(f.sell_price || 0);
  const cost = Number(f.unit_cost || 0);
  const pack = Number(f.packaging_cost || 0);
  const courier = Number(f.courier_cost || 0);
  const ad = Number(f.ad_cost_per_order || 0);
  const delivered = units * (1 - rr);
  const contribution = price - cost - pack - courier - ad;
  const returnLoss = units * rr * (courier + ad);
  const profit = delivered * contribution - returnLoss;
  const marginBase = price - cost - pack - courier;
  return {
    delivered,
    contribution,
    profit,
    revenue: delivered * price,
    breakevenRoas: marginBase > 0 ? price / marginBase : null,
  };
}

function ProductPipelinePage() {
  const { brandIds, activeBrand, isLoading: brandLoading } = useBrand();
  const { isAdmin } = useCurrentRole();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [statusFilter, setStatusFilter] = useState<string>("voting");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<string>("score");
  const [view, setView] = useState<"grid" | "board">("grid");
  const [confirmDelete, setConfirmDelete] = useState<HubIdea | null>(null);
  const [fcIdea, setFcIdea] = useState<HubIdea | null>(null);
  const [fc, setFc] = useState<FDraft>(emptyForecast());
  const [videoIdea, setVideoIdea] = useState<HubIdea | null>(null);

  const ideasQ = useQuery({
    queryKey: ["hub-ideas", brandIds],
    queryFn: () => fetchIdeas(brandIds),
    enabled: brandIds.length > 0,
  });
  const sumQ = useQuery({
    queryKey: ["hub-idea-summary", brandIds],
    queryFn: () => fetchIdeaSummaries(brandIds),
    enabled: brandIds.length > 0,
  });
  const votesQ = useQuery({ queryKey: ["hub-my-votes"], queryFn: fetchMyVotes });
  const ideas = useMemo(() => ideasQ.data ?? [], [ideasQ.data]);
  const forecastQ = useQuery({
    queryKey: ["hub-forecasts", ideas.map((i) => i.id)],
    queryFn: () => fetchForecasts(ideas.map((i) => i.id)),
    enabled: ideas.length > 0,
  });
  const peopleQ = useQuery({
    queryKey: ["hub-idea-people", ideas.map((i) => i.id)],
    queryFn: () => fetchIdeaPeople(ideas.map((i) => i.id)),
    enabled: ideas.length > 0,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["hub-ideas"] });
    qc.invalidateQueries({ queryKey: ["hub-idea-summary"] });
    qc.invalidateQueries({ queryKey: ["hub-forecasts"] });
    qc.invalidateQueries({ queryKey: ["hub-idea-people"] });
  };

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const row = {
        brand_id: activeBrand?.id ?? null,
        title: d.title.trim(),
        description: d.description.trim() || null,
        image_url: d.image_url.trim() || null,
        images: d.images
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean),
        source_url: d.source_url.trim() || null,
        video_url: d.video_url.trim() || null,
        supplier_name: d.supplier_name.trim() || null,
        supplier_url: d.supplier_url.trim() || null,
        category: d.category.trim() || null,
        est_unit_cost: Number(d.est_unit_cost || 0),
        est_sell_price: Number(d.est_sell_price || 0),
        target_price_min: d.target_price_min ? Number(d.target_price_min) : null,
        target_price_max: d.target_price_max ? Number(d.target_price_max) : null,
        moq: d.moq ? Number(d.moq) : null,
        status: d.status,
        notes: d.notes.trim() || null,
      };
      const { error } = d.id
        ? await supabase.from("hub_product_ideas").update(row as never).eq("id", d.id)
        : await supabase.from("hub_product_ideas").insert(row as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Idea saved");
      setOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hub_product_ideas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("hub_product_ideas")
        .update({ status } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const vote = useMutation({
    mutationFn: async ({ ideaId, value }: { ideaId: string; value: number }) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Not signed in");
      const existing = votesQ.data?.get(ideaId);
      if (existing && existing.vote === value && existing.rating == null) {
        const { error } = await supabase.from("hub_idea_votes").delete().eq("id", existing.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("hub_idea_votes")
        .upsert(
          {
            idea_id: ideaId,
            user_id: uid,
            vote: existing && existing.vote === value ? 0 : value,
            rating: existing?.rating ?? null,
          } as never,
          { onConflict: "idea_id,user_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hub-my-votes"] });
      qc.invalidateQueries({ queryKey: ["hub-idea-people"] });
      qc.invalidateQueries({ queryKey: ["hub-idea-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rate = useMutation({
    mutationFn: async ({ ideaId, rating }: { ideaId: string; rating: number }) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Not signed in");
      const existing = votesQ.data?.get(ideaId);
      const { error } = await supabase.from("hub_idea_votes").upsert(
        {
          idea_id: ideaId,
          user_id: uid,
          vote: existing?.vote ?? 0,
          rating: existing?.rating === rating ? null : rating,
        } as never,
        { onConflict: "idea_id,user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hub-my-votes"] });
      qc.invalidateQueries({ queryKey: ["hub-idea-people"] });
      qc.invalidateQueries({ queryKey: ["hub-idea-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const decide = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("hub_product_ideas")
        .update({
          status: approve ? "approved" : "rejected",
          approved_by: approve ? (auth.user?.id ?? null) : null,
          approved_at: approve ? new Date().toISOString() : null,
        } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.approve ? "Approved — Sourcing-এ পাঠানো হলো" : "Rejected");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveForecast = useMutation({
    mutationFn: async () => {
      if (!fcIdea) return;
      const row = {
        idea_id: fcIdea.id,
        monthly_units: Number(fc.monthly_units || 0),
        sell_price: Number(fc.sell_price || 0),
        unit_cost: Number(fc.unit_cost || 0),
        ad_cost_per_order: Number(fc.ad_cost_per_order || 0),
        courier_cost: Number(fc.courier_cost || 0),
        packaging_cost: Number(fc.packaging_cost || 0),
        return_rate: Number(fc.return_rate || 0),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("hub_idea_forecast")
        .upsert(row as never, { onConflict: "idea_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Forecast saved");
      setFcIdea(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const sums = sumQ.data;
    const q = search.trim().toLowerCase();
    let list = statusFilter === "all" ? ideas : ideas.filter((i) => i.status === statusFilter);
    if (q) {
      list = list.filter((i) =>
        [i.title, i.category, i.supplier_name, i.description, ...(i.tags ?? [])]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    const margin = (i: HubIdea) =>
      i.est_sell_price > 0 ? ((i.est_sell_price - i.est_unit_cost) / i.est_sell_price) * 100 : -1;
    const cmp: Record<string, (a: HubIdea, b: HubIdea) => number> = {
      score: (a, b) => (sums?.get(b.id)?.score ?? 0) - (sums?.get(a.id)?.score ?? 0),
      rating: (a, b) => (sums?.get(b.id)?.avg_rating ?? 0) - (sums?.get(a.id)?.avg_rating ?? 0),
      profit: (a, b) =>
        (sums?.get(b.id)?.monthly_profit ?? 0) - (sums?.get(a.id)?.monthly_profit ?? 0),
      margin: (a, b) => margin(b) - margin(a),
      newest: (a, b) => String(b.created_at).localeCompare(String(a.created_at)),
      title: (a, b) => a.title.localeCompare(b.title),
    };
    return [...list].sort(cmp[sortBy] ?? cmp.score);
  }, [ideas, statusFilter, sumQ.data, search, sortBy]);

  const statusCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of ideas) m.set(i.status, (m.get(i.status) ?? 0) + 1);
    return m;
  }, [ideas]);

  const funnelStatuses = useMemo(
    () =>
      IDEA_FUNNEL_ORDER.map(
        (k) => IDEA_STATUSES.find((s) => s.key === k) ?? { key: k, label: k },
      ),
    [],
  );

  const stats = useMemo(() => {
    const approved = ideas.filter((i) =>
      ["approved", "sourcing", "ordered", "launched"].includes(i.status),
    ).length;
    let projected = 0;
    for (const i of ideas) {
      const p = sumQ.data?.get(i.id)?.monthly_profit;
      if (p && ["approved", "sourcing", "ordered", "launched"].includes(i.status)) projected += p;
    }
    const margins = ideas
      .filter((i) => i.est_sell_price > 0)
      .map((i) => ((i.est_sell_price - i.est_unit_cost) / i.est_sell_price) * 100);
    const avgMargin = margins.length
      ? margins.reduce((a, b) => a + b, 0) / margins.length
      : 0;
    const awaiting = ideas.filter((i) => ["idea", "voting"].includes(i.status)).length;
    return { total: ideas.length, approved, projected, avgMargin, awaiting };
  }, [ideas, sumQ.data]);

  const clone = useMutation({
    mutationFn: async (i: HubIdea) => {
      const { error } = await supabase.from("hub_product_ideas").insert({
        brand_id: i.brand_id,
        title: `${i.title} (copy)`,
        description: i.description,
        image_url: i.image_url,
        images: i.images ?? [],
        source_url: i.source_url,
        video_url: i.video_url ?? null,
        supplier_name: i.supplier_name,
        supplier_url: i.supplier_url,
        category: i.category,
        est_unit_cost: i.est_unit_cost,
        est_sell_price: i.est_sell_price,
        target_price_min: i.target_price_min,
        target_price_max: i.target_price_max,
        moq: i.moq,
        status: "idea",
        notes: i.notes,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Duplicate তৈরি হয়েছে");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveStage = (i: HubIdea, dir: -1 | 1) => {
    const order = IDEA_STATUSES.map((s) => s.key);
    const idx = order.indexOf(i.status as (typeof order)[number]);
    const next = order[Math.min(order.length - 1, Math.max(0, idx + dir))];
    if (next && next !== i.status) setStatus.mutate({ id: i.id, status: next });
  };

  const openNew = () => {
    setDraft(emptyDraft());
    setOpen(true);
  };
  const openEdit = (i: HubIdea) => {
    setDraft({
      id: i.id,
      title: i.title,
      description: i.description ?? "",
      image_url: i.image_url ?? "",
      images: (i.images ?? []).join("\n"),
      source_url: i.source_url ?? "",
      video_url: i.video_url ?? "",
      supplier_name: i.supplier_name ?? "",
      supplier_url: i.supplier_url ?? "",
      category: i.category ?? "",
      est_unit_cost: String(i.est_unit_cost || ""),
      est_sell_price: String(i.est_sell_price || ""),
      target_price_min: i.target_price_min != null ? String(i.target_price_min) : "",
      target_price_max: i.target_price_max != null ? String(i.target_price_max) : "",
      moq: i.moq ? String(i.moq) : "",
      status: i.status,
      notes: i.notes ?? "",
    });
    setOpen(true);
  };
  const openForecast = (i: HubIdea) => {
    const existing: HubIdeaForecast | undefined = forecastQ.data?.get(i.id);
    setFcIdea(i);
    setFc(
      existing
        ? {
            monthly_units: String(existing.monthly_units),
            sell_price: String(existing.sell_price),
            unit_cost: String(existing.unit_cost),
            ad_cost_per_order: String(existing.ad_cost_per_order),
            courier_cost: String(existing.courier_cost),
            packaging_cost: String(existing.packaging_cost),
            return_rate: String(existing.return_rate),
          }
        : emptyForecast(i),
    );
  };

  const preview = calcForecast(fc);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-3 md:p-6">
      <HubPageHeader
        icon={Lightbulb}
        title="Product Pipeline"
        subtitle={
          activeBrand
            ? `${activeBrand.name} — idea থেকে launch পর্যন্ত`
            : "Team idea board, voting আর profit forecast"
        }
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search idea, supplier, category…"
                className="h-9 w-[220px] pl-8"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score">Top voted</SelectItem>
                <SelectItem value="rating">Best rated</SelectItem>
                <SelectItem value="profit">Forecast profit</SelectItem>
                <SelectItem value="margin">Best margin</SelectItem>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="title">A → Z</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {funnelStatuses.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label}
                  </SelectItem>
                ))}
                <SelectItem value="all">All status</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex h-9 items-center rounded-md border border-border p-0.5">
              <button
                type="button"
                aria-label="Grid view"
                onClick={() => setView("grid")}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded",
                  view === "grid" ? "bg-muted text-foreground" : "text-muted-foreground",
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Pipeline board view"
                onClick={() => setView("board")}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded",
                  view === "board" ? "bg-muted text-foreground" : "text-muted-foreground",
                )}
              >
                <Columns3 className="h-4 w-4" />
              </button>
            </div>
            <Button size="sm" onClick={openNew}>
              <Plus className="mr-1.5 h-4 w-4" /> New idea
            </Button>
          </>
        }
      />

      {ideas.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total ideas" value={String(stats.total)} />
            <StatCard label="Awaiting decision" value={String(stats.awaiting)} />
            <StatCard label="Approved+" value={String(stats.approved)} />
            <StatCard
              label="Projected monthly profit"
              value={fmtValue(Math.round(stats.projected), "bdt")}
              hint={`Avg margin ${stats.avgMargin.toFixed(0)}%`}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {funnelStatuses.map((s) => (
              <FunnelChip
                key={s.key}
                label={s.label}
                count={statusCounts.get(s.key) ?? 0}
                active={statusFilter === s.key}
                onClick={() => setStatusFilter(s.key)}
              />
            ))}
            <FunnelChip
              label="All"
              count={ideas.length}
              active={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
            />
          </div>
        </>
      )}

      {(ideasQ.isLoading || brandLoading) && <Skeleton className="h-40 w-full rounded-xl" />}

      {!ideasQ.isLoading && filtered.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            এখনো কোনো product idea নেই। "New idea" দিয়ে যোগ করো — টিম vote দেবে, তারপর forecast
            দেখে order করবে।
          </CardContent>
        </Card>
      )}

      {view === "board" && filtered.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {funnelStatuses.map((st) => {
            const col = filtered.filter((i) => i.status === st.key);
            return (
              <div key={st.key} className="w-[260px] shrink-0 rounded-xl border bg-muted/30 p-2">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-xs font-semibold uppercase tracking-wide">{st.label}</span>
                  <span className="rounded-full bg-background px-1.5 text-[10px] font-semibold">
                    {col.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {col.map((i) => {
                    const s = sumQ.data?.get(i.id);
                    const thumb = i.image_url || i.images?.[0];
                    return (
                      <div key={i.id} className="rounded-lg border bg-background p-2 shadow-sm">
                        <div className="flex gap-2">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt={i.title}
                              loading="lazy"
                              className="h-10 w-10 shrink-0 rounded object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 shrink-0 rounded bg-muted" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold">{i.title}</p>
                            <p className="text-[10px] text-muted-foreground">
                              ♥ {s?.up_votes ?? 0} · ★ {(s?.avg_rating ?? 0).toFixed(1)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <button
                            type="button"
                            aria-label="Previous stage"
                            onClick={() => moveStage(i, -1)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(i)}
                            className="text-[10px] font-medium text-primary hover:underline"
                          >
                            Details
                          </button>
                          <button
                            type="button"
                            aria-label="Next stage"
                            onClick={() => moveStage(i, 1)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {col.length === 0 && (
                    <p className="px-1 py-3 text-center text-[11px] text-muted-foreground">খালি</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className={cn("grid gap-3 md:grid-cols-2 xl:grid-cols-3", view === "board" && "hidden")}>
        {filtered.map((i) => {
          const s = sumQ.data?.get(i.id);
          const mine = votesQ.data?.get(i.id);
          const my = mine?.vote ?? 0;
          const f = forecastQ.data?.get(i.id);
          const people = peopleQ.data?.get(i.id);
          const imgs = i.images?.length ? i.images : i.image_url ? [i.image_url] : [];
          const statusMeta = STATUS_STYLE[i.status] ?? STATUS_STYLE.idea;
          return (
            <Card
              key={i.id}
              className="group overflow-hidden border-border/70 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="relative">
                <IdeaGallery images={imgs} title={i.title} />
                <span
                  className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusMeta}`}
                >
                  {IDEA_STATUSES.find((x) => x.key === i.status)?.label ?? i.status}
                </span>
                <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    aria-label="Edit idea"
                    onClick={() => openEdit(i)}
                    className="rounded-full bg-background/90 p-1.5 shadow"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Duplicate idea"
                    onClick={() => clone.mutate(i)}
                    disabled={clone.isPending}
                    className="rounded-full bg-background/90 p-1.5 shadow"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete idea"
                    onClick={() => setConfirmDelete(i)}
                    className="rounded-full bg-background/90 p-1.5 shadow"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
                <button
                  type="button"
                  aria-label="Like"
                  onClick={() => vote.mutate({ ideaId: i.id, value: 1 })}
                  className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold shadow backdrop-blur transition-transform active:scale-95"
                >
                  <Heart
                    className={`h-3.5 w-3.5 transition-colors ${
                      my === 1 ? "fill-rose-500 text-rose-500" : "text-muted-foreground"
                    }`}
                  />
                  {s?.up_votes ?? 0}
                </button>
              </div>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{i.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {i.category || "uncategorised"}
                      {i.supplier_name ? ` · ${i.supplier_name}` : ""}
                      {i.moq ? ` · MOQ ${i.moq}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="flex items-center justify-end gap-1 text-xs font-semibold">
                      <StarRating value={s?.avg_rating ?? 0} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {s?.avg_rating ? `${s.avg_rating.toFixed(1)} · ${s.rating_count} rating` : "no rating"}
                    </p>
                  </div>
                </div>

                {i.description && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{i.description}</p>
                )}

                <PeopleStrip
                  addedBy={people?.created_by_name ?? null}
                  addedAt={i.created_at}
                  voters={people?.voters ?? []}
                />

                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge variant="outline">Cost {fmtValue(i.est_unit_cost, "bdt")}</Badge>
                  <Badge variant="outline">Sell {fmtValue(i.est_sell_price, "bdt")}</Badge>
                  {i.est_sell_price > 0 && (
                    <Badge
                      className={cn(
                        "border-0 text-white",
                        (i.est_sell_price - i.est_unit_cost) / i.est_sell_price >= 0.4
                          ? "bg-emerald-600"
                          : (i.est_sell_price - i.est_unit_cost) / i.est_sell_price >= 0.2
                            ? "bg-amber-500"
                            : "bg-destructive",
                      )}
                    >
                      <TrendingUp className="mr-1 h-3 w-3" />
                      {(((i.est_sell_price - i.est_unit_cost) / i.est_sell_price) * 100).toFixed(0)}%
                      margin
                    </Badge>
                  )}
                  {(i.target_price_min != null || i.target_price_max != null) && (
                    <Badge variant="secondary">
                      Target {fmtValue(i.target_price_min ?? 0, "bdt")}–
                      {fmtValue(i.target_price_max ?? 0, "bdt")}
                    </Badge>
                  )}
                  {i.source_url && (
                    <a
                      href={i.source_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      source <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {i.video_url && (
                    <button
                      type="button"
                      onClick={() => setVideoIdea(i)}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary hover:bg-primary/20"
                    >
                      <PlayCircle className="h-3.5 w-3.5" /> Video
                    </button>
                  )}
                </div>

                {f && (
                  <p className="text-xs">
                    <span className="text-muted-foreground">Forecast profit/mo: </span>
                    <span className="font-semibold">
                      {fmtValue(Math.round(s?.monthly_profit ?? 0), "bdt")}
                    </span>
                    {s?.breakeven_roas ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · breakeven ROAS {s.breakeven_roas.toFixed(2)}
                      </span>
                    ) : null}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <StarRating
                      value={mine?.rating ?? 0}
                      onRate={(v) => rate.mutate({ ideaId: i.id, rating: v })}
                    />
                    <Button
                      size="sm"
                      variant={my === 1 ? "default" : "outline"}
                      onClick={() => vote.mutate({ ideaId: i.id, value: 1 })}
                    >
                      <ThumbsUp className="mr-1 h-3.5 w-3.5" /> {s?.up_votes ?? 0}
                    </Button>
                    <Button
                      size="sm"
                      variant={my === -1 ? "destructive" : "outline"}
                      onClick={() => vote.mutate({ ideaId: i.id, value: -1 })}
                    >
                      <ThumbsDown className="mr-1 h-3.5 w-3.5" /> {s?.down_votes ?? 0}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openForecast(i)}>
                      <Calculator className="mr-1 h-3.5 w-3.5" /> Forecast
                    </Button>
                  </div>
                  <Select
                    value={i.status}
                    onValueChange={(v) => setStatus.mutate({ id: i.id, status: v })}
                  >
                    <SelectTrigger className="h-8 w-[128px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {IDEA_STATUSES.map((s2) => (
                        <SelectItem key={s2.key} value={s2.key}>
                          {s2.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isAdmin && ["idea", "voting"].includes(i.status) && (
                  <div className="flex gap-2 border-t pt-3">
                    <Button
                      size="sm"
                      className="flex-1 bg-emerald-600 text-white hover:bg-emerald-600/90"
                      onClick={() => decide.mutate({ id: i.id, approve: true })}
                      disabled={decide.isPending}
                    >
                      <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve → Sourcing
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => decide.mutate({ id: i.id, approve: false })}
                      disabled={decide.isPending}
                    >
                      <XCircle className="mr-1.5 h-4 w-4 text-destructive" /> Reject
                    </Button>
                  </div>
                )}

                {["approved", "sourcing", "ordered"].includes(i.status) && (
                  <Link
                    to="/erp/hub/sourcing"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                  >
                    <PackageSearch className="h-3.5 w-3.5" /> Sourcing desk-এ দেখুন
                  </Link>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit idea" : "New product idea"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Product name">
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="LED rocket launcher toy"
              />
            </Field>
            <Field label="Why this product">
              <Textarea
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Field>
            <Field label="Main image URL">
              <Input
                value={draft.image_url}
                onChange={(e) => setDraft({ ...draft, image_url: e.target.value })}
                placeholder="https://..."
              />
            </Field>
            <Field label="More images (এক লাইনে একটা URL)">
              <Textarea
                rows={3}
                value={draft.images}
                onChange={(e) => setDraft({ ...draft, images: e.target.value })}
                placeholder={"https://...jpg\nhttps://...jpg"}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Target price min (৳)">
                <Input
                  type="number"
                  value={draft.target_price_min}
                  onChange={(e) => setDraft({ ...draft, target_price_min: e.target.value })}
                />
              </Field>
              <Field label="Target price max (৳)">
                <Input
                  type="number"
                  value={draft.target_price_max}
                  onChange={(e) => setDraft({ ...draft, target_price_max: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Source / product link">
              <Input
                value={draft.source_url}
                onChange={(e) => setDraft({ ...draft, source_url: e.target.value })}
                placeholder="1688 / Alibaba link"
              />
            </Field>
            <Field label="Video link (YouTube / TikTok / MP4)">
              <Input
                value={draft.video_url}
                onChange={(e) => setDraft({ ...draft, video_url: e.target.value })}
                placeholder="https://youtube.com/watch?v=..."
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Supplier name">
                <Input
                  value={draft.supplier_name}
                  onChange={(e) => setDraft({ ...draft, supplier_name: e.target.value })}
                />
              </Field>
              <Field label="Category">
                <Input
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Unit cost (৳)">
                <Input
                  type="number"
                  value={draft.est_unit_cost}
                  onChange={(e) => setDraft({ ...draft, est_unit_cost: e.target.value })}
                />
              </Field>
              <Field label="Sell price (৳)">
                <Input
                  type="number"
                  value={draft.est_sell_price}
                  onChange={(e) => setDraft({ ...draft, est_sell_price: e.target.value })}
                />
              </Field>
              <Field label="MOQ">
                <Input
                  type="number"
                  value={draft.moq}
                  onChange={(e) => setDraft({ ...draft, moq: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Status">
              <Select
                value={draft.status}
                onValueChange={(v) => setDraft({ ...draft, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IDEA_STATUSES.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Notes">
              <Textarea
                rows={2}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate(draft)}
              disabled={!draft.title.trim() || save.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!videoIdea} onOpenChange={(o) => !o && setVideoIdea(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{videoIdea?.title} — Video</DialogTitle>
          </DialogHeader>
          {videoIdea?.video_url ? <VideoPlayer url={videoIdea.video_url} /> : null}
          {videoIdea?.video_url && (
            <a
              href={videoIdea.video_url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              নতুন ট্যাবে খুলুন <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!fcIdea} onOpenChange={(o) => !o && setFcIdea(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Forecast — {fcIdea?.title}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monthly units">
              <Input
                type="number"
                value={fc.monthly_units}
                onChange={(e) => setFc({ ...fc, monthly_units: e.target.value })}
              />
            </Field>
            <Field label="Return rate (%)">
              <Input
                type="number"
                value={fc.return_rate}
                onChange={(e) => setFc({ ...fc, return_rate: e.target.value })}
              />
            </Field>
            <Field label="Sell price (৳)">
              <Input
                type="number"
                value={fc.sell_price}
                onChange={(e) => setFc({ ...fc, sell_price: e.target.value })}
              />
            </Field>
            <Field label="Unit cost (৳)">
              <Input
                type="number"
                value={fc.unit_cost}
                onChange={(e) => setFc({ ...fc, unit_cost: e.target.value })}
              />
            </Field>
            <Field label="Ad cost / order (৳)">
              <Input
                type="number"
                value={fc.ad_cost_per_order}
                onChange={(e) => setFc({ ...fc, ad_cost_per_order: e.target.value })}
              />
            </Field>
            <Field label="Courier cost (৳)">
              <Input
                type="number"
                value={fc.courier_cost}
                onChange={(e) => setFc({ ...fc, courier_cost: e.target.value })}
              />
            </Field>
            <Field label="Packaging (৳)">
              <Input
                type="number"
                value={fc.packaging_cost}
                onChange={(e) => setFc({ ...fc, packaging_cost: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <Metric label="Delivered orders" value={Math.round(preview.delivered).toString()} />
            <Metric label="Revenue" value={fmtValue(preview.revenue, "bdt")} />
            <Metric label="Profit / order" value={fmtValue(preview.contribution, "bdt")} />
            <Metric label="Monthly profit" value={fmtValue(preview.profit, "bdt")} />
            <Metric
              label="Breakeven ROAS"
              value={preview.breakevenRoas ? preview.breakevenRoas.toFixed(2) : "—"}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFcIdea(null)}>
              Cancel
            </Button>
            <Button onClick={() => saveForecast.mutate()} disabled={saveForecast.isPending}>
              Save forecast
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Idea delete করব?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDelete?.title}" এবং এর vote/forecast/quote সব মুছে যাবে। এটা undo করা যাবে
              না।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDelete) remove.mutate(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-display text-2xl font-bold">{value}</p>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function PeopleStrip({
  addedBy,
  addedAt,
  voters,
}: {
  addedBy: string | null;
  addedAt: string;
  voters: HubIdeaVoter[];
}) {
  const likers = voters.filter((v) => v.vote === 1);
  const dislikers = voters.filter((v) => v.vote === -1);
  const raters = voters.filter((v) => v.rating != null);
  return (
    <div className="space-y-1.5 rounded-lg border border-dashed border-border/70 bg-muted/30 p-2 text-[11px]">
      <p className="text-muted-foreground">
        Added by <span className="font-semibold text-foreground">{addedBy ?? "Unknown"}</span> ·{" "}
        {new Date(addedAt).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </p>
      {likers.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          <Heart className="h-3 w-3 fill-rose-500 text-rose-500" />
          {likers.map((v) => (
            <span
              key={v.user_id}
              title={v.comment ?? v.name}
              className="inline-flex items-center gap-1 rounded-full bg-background px-1.5 py-0.5 font-medium shadow-sm"
            >
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-[8px] font-bold text-primary">
                {initials(v.name)}
              </span>
              {v.name}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">এখনো কেউ like দেয়নি</p>
      )}
      {(dislikers.length > 0 || raters.length > 0) && (
        <p className="text-muted-foreground">
          {dislikers.length > 0 && <>👎 {dislikers.map((v) => v.name).join(", ")}</>}
          {dislikers.length > 0 && raters.length > 0 && " · "}
          {raters.length > 0 && (
            <>★ {raters.map((v) => `${v.name} (${v.rating})`).join(", ")}</>
          )}
        </p>
      )}
    </div>
  );
}


function FunnelChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-[10px] font-semibold",
          active ? "bg-primary-foreground/20" : "bg-muted",
        )}
      >
        {count}
      </span>
    </button>
  );
}


function toEmbedUrl(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    if (host.endsWith("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
      if (u.pathname.startsWith("/shorts/"))
        return `https://www.youtube.com/embed/${u.pathname.split("/")[2]}`;
      if (u.pathname.startsWith("/embed/")) return url;
    }
    if (host.endsWith("vimeo.com")) return `https://player.vimeo.com/video/${u.pathname.slice(1)}`;
    if (host.endsWith("facebook.com") || host.endsWith("fb.watch"))
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`;
    if (host.endsWith("tiktok.com")) {
      const id = u.pathname.split("/video/")[1]?.split(/[/?]/)[0];
      if (id) return `https://www.tiktok.com/embed/v2/${id}`;
    }
  } catch {
    return null;
  }
  return null;
}

function VideoPlayer({ url }: { url: string }) {
  const embed = toEmbedUrl(url);
  if (embed) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
        <iframe
          src={embed}
          title="Product video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>
    );
  }
  if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(url)) {
    return <video src={url} controls className="w-full rounded-lg bg-black" />;
  }
  return (
    <p className="text-sm text-muted-foreground">
      এই লিংকটি এখানে play করা যাচ্ছে না — নিচের বাটনে ক্লিক করে নতুন ট্যাবে দেখুন।
    </p>
  );
}
