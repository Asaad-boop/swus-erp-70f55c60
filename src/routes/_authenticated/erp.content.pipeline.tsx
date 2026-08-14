import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KanbanSquare, Plus, Search, ChevronLeft, ChevronRight, Play } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  bdt,
  CONTENT_SOURCES,
  CONTENT_TYPES,
  fetchAgencies,
  fetchCreators,
  fetchItems,
  fetchProductsLite,
  ITEM_STATUSES,
  labelOf,
  PIPELINE_STAGES,
  PLATFORMS,
  type ContentItem,
} from "@/lib/erp/content/content-data";

export const Route = createFileRoute("/_authenticated/erp/content/pipeline")({
  head: () => ({
    meta: [
      { title: "Content Pipeline — Content Studio" },
      {
        name: "description",
        content:
          "Kanban of every content piece across Ideation, Create, Editing, Published and Performance stages.",
      },
      { property: "og:title", content: "Content Pipeline — Content Studio" },
      {
        property: "og:description",
        content: "Track every content piece from idea to published performance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PipelinePage,
});

const emptyDraft = {
  title: "",
  product_id: "",
  content_type: "ugc",
  platform: "facebook",
  source: "in_house",
  creator_id: "",
  agency_id: "",
  due_date: "",
  cost: 0,
};

function PipelinePage() {
  const { brandIds, activeBrand } = useBrand();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("all");
  const [source, setSource] = useState("all");
  const [open, setOpen] = useState<ContentItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);

  const itemsQ = useQuery({
    queryKey: ["content-items", brandIds],
    queryFn: () => fetchItems(brandIds),
  });
  const productsQ = useQuery({
    queryKey: ["content-products", brandIds],
    queryFn: () => fetchProductsLite(brandIds),
  });
  const creatorsQ = useQuery({
    queryKey: ["content-creators", brandIds],
    queryFn: () => fetchCreators(brandIds),
  });
  const agenciesQ = useQuery({
    queryKey: ["content-agencies", brandIds],
    queryFn: () => fetchAgencies(brandIds),
  });

  const items = itemsQ.data ?? [];
  const productName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of productsQ.data ?? []) m.set(p.id, p.title);
    return m;
  }, [productsQ.data]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items.filter((i) => {
      if (platform !== "all" && i.platform !== platform) return false;
      if (source !== "all" && i.source !== source) return false;
      if (!s) return true;
      return (
        i.title.toLowerCase().includes(s) ||
        (i.code ?? "").toLowerCase().includes(s) ||
        (i.hook ?? "").toLowerCase().includes(s)
      );
    });
  }, [items, search, platform, source]);

  const kpis = useMemo(() => {
    const live = filtered.filter((i) => i.stage === "published" || i.stage === "performance");
    return {
      total: filtered.length,
      wip: filtered.filter((i) => i.stage === "create" || i.stage === "editing").length,
      live: live.length,
      spend: filtered.reduce((s, i) => s + (Number(i.cost) || 0), 0),
      views: live.reduce((s, i) => s + (Number(i.views) || 0), 0),
      orders: live.reduce((s, i) => s + (Number(i.attributed_orders) || 0), 0),
    };
  }, [filtered]);

  const saveMut = useMutation({
    mutationFn: async (patch: Partial<ContentItem> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase
        .from("content_items")
        .update(rest as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-items"] });
      qc.invalidateQueries({ queryKey: ["content-intake"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!draft.title.trim()) throw new Error("Title দাও");
      const { error } = await supabase.from("content_items").insert({
        brand_id: activeBrand?.id ?? brandIds[0] ?? null,
        title: draft.title.trim(),
        product_id: draft.product_id || null,
        content_type: draft.content_type,
        platform: draft.platform,
        source: draft.source,
        creator_id: draft.creator_id || null,
        agency_id: draft.agency_id || null,
        due_date: draft.due_date || null,
        cost: draft.cost,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Content piece যোগ হয়েছে");
      setCreating(false);
      setDraft(emptyDraft);
      qc.invalidateQueries({ queryKey: ["content-items"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function move(item: ContentItem, dir: -1 | 1) {
    const idx = PIPELINE_STAGES.findIndex((s) => s.key === item.stage);
    const next = PIPELINE_STAGES[Math.min(PIPELINE_STAGES.length - 1, Math.max(0, idx + dir))];
    if (!next || next.key === item.stage) return;
    const patch: Partial<ContentItem> & { id: string } = { id: item.id, stage: next.key };
    if (next.key === "published" && !item.published_at) {
      patch.published_at = new Date().toISOString();
      patch.status = "published";
    }
    saveMut.mutate(patch);
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-3 md:p-6">
      <ContentPageHeader
        icon={KanbanSquare}
        title="Content Pipeline"
        subtitle="Ideation → Create/Shoot → Editing → Published → Performance"
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New content
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <ContentKpi label="Pieces" value={kpis.total} />
        <ContentKpi label="In production" value={kpis.wip} tone="warn" />
        <ContentKpi label="Live" value={kpis.live} tone="good" />
        <ContentKpi label="Content spend" value={bdt(kpis.spend)} />
        <ContentKpi
          label="Views / orders"
          value={`${kpis.views.toLocaleString()} / ${kpis.orders}`}
        />
      </div>

      <div className="sticky top-[46px] z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-background/85 p-2 backdrop-blur">
        <div className="relative min-w-40 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, code, hook..."
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger className="h-9 w-32 text-xs">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            {PLATFORMS.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="h-9 w-32 text-xs">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {CONTENT_SOURCES.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {itemsQ.isLoading ? (
        <div className="grid gap-2 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="flex snap-x gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-5 md:overflow-visible">
          {PIPELINE_STAGES.map((st) => {
            const list = filtered.filter((i) => i.stage === st.key);
            return (
              <div
                key={st.key}
                className="w-[86vw] shrink-0 snap-start rounded-xl border bg-muted/30 p-2 md:w-auto"
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-xs font-semibold">{st.label}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {list.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {list.map((i) => (
                    <div
                      key={i.id}
                      className="rounded-lg border bg-card p-2.5 shadow-sm transition-colors hover:border-primary/40"
                    >
                      <button
                        className="w-full text-left"
                        onClick={() => setOpen(i)}
                        type="button"
                      >
                        <p className="line-clamp-2 text-xs font-semibold">{i.title}</p>
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                          {i.code} · {labelOf(CONTENT_TYPES, i.content_type)} ·{" "}
                          {labelOf(PLATFORMS, i.platform)}
                        </p>
                        {i.product_id && productName.get(i.product_id) && (
                          <p className="mt-1 truncate text-[10px] text-muted-foreground">
                            📦 {productName.get(i.product_id)}
                          </p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <Badge variant="outline" className="text-[10px]">
                            {labelOf(ITEM_STATUSES, i.status)}
                          </Badge>
                          {i.cost > 0 && (
                            <Badge variant="outline" className="text-[10px]">
                              {bdt(i.cost)}
                            </Badge>
                          )}
                          {i.views > 0 && (
                            <Badge variant="secondary" className="text-[10px]">
                              {i.views.toLocaleString()} views
                            </Badge>
                          )}
                        </div>
                      </button>
                      <div className="mt-2 flex items-center justify-between">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => move(i, -1)}
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        {i.video_url && (
                          <a
                            href={i.video_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-primary"
                          >
                            <Play className="h-3.5 w-3.5" />
                          </a>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => move(i, 1)}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {list.length === 0 && (
                    <p className="px-1 py-6 text-center text-[11px] text-muted-foreground">
                      খালি
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ItemSheet
        item={open}
        onClose={() => setOpen(null)}
        onSave={(patch) => {
          saveMut.mutate(patch);
          setOpen(null);
        }}
        creators={(creatorsQ.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
        agencies={(agenciesQ.data ?? []).map((a) => ({ id: a.id, name: a.name }))}
        productLabel={open?.product_id ? (productName.get(open.product_id) ?? null) : null}
      />

      <Sheet open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-base">New content piece</SheetTitle>
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
                  <SelectItem value="none">No product</SelectItem>
                  {(productsQ.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px]">Type</Label>
                <Select
                  value={draft.content_type}
                  onValueChange={(v) => setDraft({ ...draft, content_type: v })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTENT_TYPES.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">Platform</Label>
                <Select
                  value={draft.platform}
                  onValueChange={(v) => setDraft({ ...draft, platform: v })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px]">Source</Label>
                <Select
                  value={draft.source}
                  onValueChange={(v) => setDraft({ ...draft, source: v })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTENT_SOURCES.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">Cost (৳)</Label>
                <Input
                  type="number"
                  value={draft.cost}
                  onChange={(e) => setDraft({ ...draft, cost: Number(e.target.value) || 0 })}
                  className="h-9"
                />
              </div>
            </div>
            {draft.source === "creator" && (
              <div>
                <Label className="text-[11px]">Creator</Label>
                <Select
                  value={draft.creator_id || "none"}
                  onValueChange={(v) =>
                    setDraft({ ...draft, creator_id: v === "none" ? "" : v })
                  }
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {(creatorsQ.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {draft.source === "agency" && (
              <div>
                <Label className="text-[11px]">Agency</Label>
                <Select
                  value={draft.agency_id || "none"}
                  onValueChange={(v) => setDraft({ ...draft, agency_id: v === "none" ? "" : v })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {(agenciesQ.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-[11px]">Due date</Label>
              <Input
                type="date"
                value={draft.due_date}
                onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
                className="h-9"
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
    </div>
  );
}

function ItemSheet({
  item,
  onClose,
  onSave,
  creators,
  agencies,
  productLabel,
}: {
  item: ContentItem | null;
  onClose: () => void;
  onSave: (patch: Partial<ContentItem> & { id: string }) => void;
  creators: { id: string; name: string }[];
  agencies: { id: string; name: string }[];
  productLabel: string | null;
}) {
  const [d, setD] = useState<ContentItem | null>(item);
  const key = item?.id ?? "none";
  const [seed, setSeed] = useState(key);
  if (seed !== key) {
    setSeed(key);
    setD(item);
  }
  if (!item || !d) return null;

  const set = (patch: Partial<ContentItem>) => setD({ ...d, ...patch });
  const words = (d.script ?? "").trim() ? (d.script ?? "").trim().split(/\s+/).length : 0;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-base">{d.title}</SheetTitle>
          <p className="text-[11px] text-muted-foreground">
            {d.code} · {productLabel ?? "No product"}
          </p>
        </SheetHeader>
        <Tabs defaultValue="script" className="py-3">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="script" className="text-xs">
              Script
            </TabsTrigger>
            <TabsTrigger value="prod" className="text-xs">
              Production
            </TabsTrigger>
            <TabsTrigger value="results" className="text-xs">
              Results
            </TabsTrigger>
          </TabsList>

          <TabsContent value="script" className="space-y-3 pt-3">
            <div>
              <Label className="text-[11px]">Hook</Label>
              <Input
                value={d.hook ?? ""}
                onChange={(e) => set({ hook: e.target.value })}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-[11px]">Angle</Label>
              <Input
                value={d.angle ?? ""}
                onChange={(e) => set({ angle: e.target.value })}
                className="h-9"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-[11px]">Script</Label>
                <span className="text-[10px] text-muted-foreground">
                  {words} words · ~{Math.max(1, Math.round(words / 2.5))}s
                </span>
              </div>
              <Textarea
                value={d.script ?? ""}
                onChange={(e) => set({ script: e.target.value })}
                className="min-h-40 text-sm"
              />
            </div>
            <div>
              <Label className="text-[11px]">Caption</Label>
              <Textarea
                value={d.caption ?? ""}
                onChange={(e) => set({ caption: e.target.value })}
                className="min-h-20 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px]">CTA</Label>
                <Input
                  value={d.cta ?? ""}
                  onChange={(e) => set({ cta: e.target.value })}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-[11px]">Hashtags</Label>
                <Input
                  value={d.hashtags ?? ""}
                  onChange={(e) => set({ hashtags: e.target.value })}
                  className="h-9"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="prod" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px]">Stage</Label>
                <Select value={d.stage} onValueChange={(v) => set({ stage: v })}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PIPELINE_STAGES.map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">Status</Label>
                <Select value={d.status} onValueChange={(v) => set({ status: v })}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ITEM_STATUSES.map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px]">Creator</Label>
                <Select
                  value={d.creator_id ?? "none"}
                  onValueChange={(v) => set({ creator_id: v === "none" ? null : v })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {creators.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">Agency</Label>
                <Select
                  value={d.agency_id ?? "none"}
                  onValueChange={(v) => set({ agency_id: v === "none" ? null : v })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {agencies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px]">Due date</Label>
                <Input
                  type="date"
                  value={d.due_date ?? ""}
                  onChange={(e) => set({ due_date: e.target.value || null })}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-[11px]">Cost (৳)</Label>
                <Input
                  type="number"
                  value={d.cost}
                  onChange={(e) => set({ cost: Number(e.target.value) || 0 })}
                  className="h-9"
                />
              </div>
            </div>
            <div>
              <Label className="text-[11px]">Video / draft URL</Label>
              <Input
                value={d.video_url ?? ""}
                onChange={(e) => set({ video_url: e.target.value || null })}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-[11px]">Revision note</Label>
              <Textarea
                value={d.revision_note ?? ""}
                onChange={(e) => set({ revision_note: e.target.value || null })}
                className="min-h-20 text-sm"
              />
            </div>
          </TabsContent>

          <TabsContent value="results" className="space-y-3 pt-3">
            <div>
              <Label className="text-[11px]">Published URL</Label>
              <Input
                value={d.published_url ?? ""}
                onChange={(e) => set({ published_url: e.target.value || null })}
                className="h-9"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["views", "Views"],
                  ["likes", "Likes"],
                  ["comments", "Comments"],
                  ["shares", "Shares"],
                  ["attributed_orders", "Attributed orders"],
                ] as const
              ).map(([k, label]) => (
                <div key={k}>
                  <Label className="text-[11px]">{label}</Label>
                  <Input
                    type="number"
                    value={d[k]}
                    onChange={(e) => set({ [k]: Number(e.target.value) || 0 } as never)}
                    className="h-9"
                  />
                </div>
              ))}
            </div>
            <p className="rounded-lg border bg-muted/40 p-2 text-[11px] text-muted-foreground">
              Cost per order:{" "}
              {d.attributed_orders > 0 ? bdt(d.cost / d.attributed_orders) : "—"}
            </p>
          </TabsContent>
        </Tabs>
        <div className="sticky bottom-0 flex gap-2 border-t bg-background py-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={() =>
              onSave({
                id: d.id,
                hook: d.hook,
                angle: d.angle,
                script: d.script,
                caption: d.caption,
                cta: d.cta,
                hashtags: d.hashtags,
                stage: d.stage,
                status: d.status,
                creator_id: d.creator_id,
                agency_id: d.agency_id,
                due_date: d.due_date,
                cost: d.cost,
                video_url: d.video_url,
                revision_note: d.revision_note,
                published_url: d.published_url,
                views: d.views,
                likes: d.likes,
                comments: d.comments,
                shares: d.shares,
                attributed_orders: d.attributed_orders,
              })
            }
          >
            Save
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}