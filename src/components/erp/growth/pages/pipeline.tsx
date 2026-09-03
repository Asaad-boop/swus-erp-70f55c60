import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  KanbanSquare,
  Plus,
  ChevronLeft,
  ChevronRight,
  Play,
  CalendarDays,
  List,
  LayoutGrid,
  AlertTriangle,
  Eye,
  ShoppingCart,
  Wallet,
  Clock,
  GripVertical,
  CheckCircle2,
  Users,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  CONTENT_STYLES,
  CONTENT_TYPES,
  costPerOrder,
  daysUntil,
  engagementRate,
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
  BrandTag,
  BrandSelect,
  BrandFilter,
  downloadCsv,
  fmtNum,
  sortBy,
  usePersistedState,
} from "@/components/erp/content/content-ui";
import { BriefPanel } from "@/components/erp/content/brief-drawer";
import { cn } from "@/lib/utils";

const emptyDraft = {
  title: "",
  brand_id: "",
  product_id: "",
  content_type: "ugc",
  content_style: "",
  platform: "facebook",
  source: "in_house",
  creator_id: "",
  agency_id: "",
  due_date: "",
  cost: 0,
};

type ViewMode = "board" | "list" | "calendar";

export function PipelinePage() {
  const { brandIds, activeBrand, brands } = useBrand();
  const qc = useQueryClient();

  const [view, patchView] = usePersistedState("pipeline", {
    search: "",
    platform: "all",
    source: "all",
    stage: "all",
    brand: "all",
    mode: "board" as ViewMode,
    swimlane: "none" as "none" | "creator" | "product",
    onlyOverdue: false,
  });

  const [open, setOpen] = useState<ContentItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const itemsQ = useQuery({
    queryKey: ["content-items", brandIds],
    queryFn: () => fetchItems(brandIds),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
  const productsQ = useQuery({
    queryKey: ["content-products", brandIds],
    queryFn: () => fetchProductsLite(brandIds),
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
  const creatorsQ = useQuery({
    queryKey: ["content-creators", brandIds],
    queryFn: () => fetchCreators(brandIds),
    staleTime: 5 * 60_000,
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
  const creatorName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of creatorsQ.data ?? []) m.set(c.id, c.name);
    return m;
  }, [creatorsQ.data]);

  const filtered = useMemo(() => {
    const s = view.search.trim().toLowerCase();
    return items.filter((i) => {
      if (view.platform !== "all" && i.platform !== view.platform) return false;
      if (view.source !== "all" && i.source !== view.source) return false;
      if (view.stage !== "all" && i.stage !== view.stage) return false;
      if (view.brand !== "all" && i.brand_id !== view.brand) return false;
      if (view.onlyOverdue) {
        const d = daysUntil(i.due_date);
        const done = i.stage === "published" || i.stage === "performance";
        if (done || d == null || d >= 0) return false;
      }
      if (!s) return true;
      return (
        i.title.toLowerCase().includes(s) ||
        (i.code ?? "").toLowerCase().includes(s) ||
        (i.hook ?? "").toLowerCase().includes(s) ||
        (i.script ?? "").toLowerCase().includes(s) ||
        (i.content_style ?? "").toLowerCase().includes(s)
      );
    });
  }, [items, view]);

  const brandName = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of brands) m.set(b.id, b.name);
    return m;
  }, [brands]);

  const brandCounts = useMemo(() => {
    const m = new Map<string | null, number>();
    for (const i of items) m.set(i.brand_id, (m.get(i.brand_id) ?? 0) + 1);
    return m;
  }, [items]);

  const kpis = useMemo(() => {
    const live = filtered.filter((i) => i.stage === "published" || i.stage === "performance");
    const overdue = filtered.filter((i) => {
      const d = daysUntil(i.due_date);
      const done = i.stage === "published" || i.stage === "performance";
      return !done && d != null && d < 0;
    }).length;
    const spend = filtered.reduce((s, i) => s + (Number(i.cost) || 0), 0);
    const orders = live.reduce((s, i) => s + (Number(i.attributed_orders) || 0), 0);
    return {
      total: filtered.length,
      wip: filtered.filter((i) => i.stage === "create" || i.stage === "editing").length,
      live: live.length,
      overdue,
      spend,
      views: live.reduce((s, i) => s + (Number(i.views) || 0), 0),
      orders,
      cpo: costPerOrder(spend, orders),
    };
  }, [filtered]);

  const stageCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of filtered) m.set(i.stage, (m.get(i.stage) ?? 0) + 1);
    return m;
  }, [filtered]);

  /** Patch the cached list instantly so drag/stage moves feel native. */
  const patchCache = (ids: string[], patch: Partial<ContentItem>) => {
    const key = ["content-items", brandIds];
    const prev = qc.getQueryData<ContentItem[]>(key);
    if (prev) {
      qc.setQueryData<ContentItem[]>(
        key,
        prev.map((i) => (ids.includes(i.id) ? { ...i, ...patch } : i)),
      );
    }
    return { key, prev } as const;
  };

  const saveMut = useMutation({
    mutationFn: async (patch: Partial<ContentItem> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase
        .from("content_items")
        .update(rest as never)
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ["content-items", brandIds] });
      const { id, ...rest } = patch;
      return patchCache([id], rest as Partial<ContentItem>);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-items"] });
      qc.invalidateQueries({ queryKey: ["content-intake"] });
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error(e.message);
    },
  });

  const bulkMut = useMutation({
    mutationFn: async (patch: Partial<ContentItem>) => {
      const ids = [...selected];
      const { error } = await supabase
        .from("content_items")
        .update(patch as never)
        .in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ["content-items", brandIds] });
      return patchCache([...selected], patch);
    },
    onSuccess: (n) => {
      toast.success(`${n}টি content আপডেট হয়েছে`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["content-items"] });
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error(e.message);
    },
  });


  const createMut = useMutation({
    mutationFn: async (opts: { again?: boolean } = {}) => {
      if (!draft.title.trim()) throw new Error("Title দাও");
      if (!(draft.brand_id || activeBrand?.id)) throw new Error("Brand বাছাই করুন");
      const { error } = await supabase.from("content_items").insert({
        brand_id: draft.brand_id || activeBrand?.id || null,
        title: draft.title.trim(),
        product_id: draft.product_id || null,
        content_type: draft.content_type,
        content_style: draft.content_style || null,
        platform: draft.platform,
        source: draft.source,
        creator_id: draft.creator_id || null,
        agency_id: draft.agency_id || null,
        due_date: draft.due_date || null,
        cost: draft.cost,
      } as never);
      if (error) throw error;
      return opts;
    },
    onSuccess: (opts) => {
      toast.success("Content piece যোগ হয়েছে");
      if (opts?.again) {
        // keep product/brand/type context, clear only the title for rapid entry
        setDraft((d) => ({ ...d, title: "" }));
      } else {
        setCreating(false);
        setDraft(emptyDraft);
      }
      qc.invalidateQueries({ queryKey: ["content-items"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const deleteMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("content_items").delete().in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`${n}টি content মুছে ফেলা হয়েছে`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["content-items"] });
      qc.invalidateQueries({ queryKey: ["content-intake"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function stagePatch(item: ContentItem, stageKey: string) {
    const patch: Partial<ContentItem> & { id: string } = { id: item.id, stage: stageKey };
    if (stageKey === "published" && !item.published_at) {
      patch.published_at = new Date().toISOString();
      patch.status = "published";
    }
    return patch;
  }

  function move(item: ContentItem, dir: -1 | 1) {
    const idx = PIPELINE_STAGES.findIndex((s) => s.key === item.stage);
    const next = PIPELINE_STAGES[Math.min(PIPELINE_STAGES.length - 1, Math.max(0, idx + dir))];
    if (!next || next.key === item.stage) return;
    saveMut.mutate(stagePatch(item, next.key));
  }

  function dropOn(stageKey: string) {
    const item = items.find((i) => i.id === dragId);
    setDragId(null);
    setDragOver(null);
    if (!item || item.stage === stageKey) return;
    saveMut.mutate(stagePatch(item, stageKey));
    toast.success(`"${item.title}" → ${labelOf(PIPELINE_STAGES, stageKey)}`);
  }

  const exportCsv = () =>
    downloadCsv(`content-pipeline-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["Code", "Brand", "Title", "Product", "Stage", "Status", "Type", "Style", "Platform", "Source", "Creator", "Due", "Cost", "Views", "Orders", "Cost/Order"],
      ...filtered.map((i) => [
        i.code,
        brandName.get(i.brand_id ?? "") ?? "",
        i.title,
        i.product_id ? (productName.get(i.product_id) ?? "") : "",
        labelOf(PIPELINE_STAGES, i.stage),
        labelOf(ITEM_STATUSES, i.status),
        labelOf(CONTENT_TYPES, i.content_type),
        i.content_style ? labelOf(CONTENT_STYLES, i.content_style) : "",
        labelOf(PLATFORMS, i.platform),
        labelOf(CONTENT_SOURCES, i.source),
        i.creator_id ? (creatorName.get(i.creator_id) ?? "") : "",
        i.due_date ?? "",
        i.cost,
        i.views,
        i.attributed_orders,
        costPerOrder(i.cost, i.attributed_orders)?.toFixed(0) ?? "",
      ]),
    ]);

  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const cardProps = {
    productName,
    creatorName,
    selected,
    onToggle: toggleSel,
    onOpen: setOpen,
    onMove: move,
    onDragStart: (id: string) => setDragId(id),
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-3 md:p-6">
      <ContentHero
        icon={KanbanSquare}
        title="Content Pipeline"
        subtitle="Ideation → Create/Shoot → Editing → Published → Performance. Card টেনে stage বদলাও।"
        actions={
          <Button size="sm" className="h-9" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New content
          </Button>
        }
      >
        <KpiStrip cols={6}>
          <Kpi label="Pieces" value={kpis.total} icon={LayoutGrid} />
          <Kpi label="In production" value={kpis.wip} icon={Clock} tone="warn" />
          <Kpi label="Live" value={kpis.live} icon={CheckCircle2} tone="good" />
          <Kpi
            label="Overdue"
            value={kpis.overdue}
            icon={AlertTriangle}
            tone="bad"
            onClick={() => patchView({ onlyOverdue: !view.onlyOverdue })}
            active={view.onlyOverdue}
          />
          <Kpi label="Spend" value={bdt(kpis.spend)} icon={Wallet} />
          <Kpi
            label="Views / orders"
            value={`${fmtNum(kpis.views)} / ${kpis.orders}`}
            icon={Eye}
            tone="info"
            hint={kpis.cpo != null ? `${bdt(kpis.cpo)} per order` : "no attributed order"}
          />
        </KpiStrip>
      </ContentHero>

      <Toolbar>
        <SearchBox
          value={view.search}
          onChange={(v) => patchView({ search: v })}
          placeholder="Title, code, hook, script…  ( / )"
        />
        <Segmented
          value={view.mode}
          onChange={(v) => patchView({ mode: v })}
          options={[
            { key: "board", label: "Board", icon: LayoutGrid },
            { key: "list", label: "List", icon: List },
            { key: "calendar", label: "Calendar", icon: CalendarDays },
          ]}
        />
        <BrandFilter value={view.brand} onChange={(v) => patchView({ brand: v })} counts={brandCounts} />
        <Select value={view.platform} onValueChange={(v) => patchView({ platform: v })}>
          <SelectTrigger className="h-9 w-[130px] text-xs">
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
        <Select value={view.source} onValueChange={(v) => patchView({ source: v })}>
          <SelectTrigger className="h-9 w-[120px] text-xs">
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
        {view.mode === "board" && (
          <Select value={view.swimlane} onValueChange={(v) => patchView({ swimlane: v as "none" | "creator" | "product" })}>
            <SelectTrigger className="h-9 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-xs">No swimlane</SelectItem>
              <SelectItem value="creator" className="text-xs">Group: Creator</SelectItem>
              <SelectItem value="product" className="text-xs">Group: Product</SelectItem>
            </SelectContent>
          </Select>
        )}
        <div className="ml-auto">
          <ExportButton onClick={exportCsv} />
        </div>
      </Toolbar>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-xs font-medium">{selected.size} selected</span>
          <Select onValueChange={(v) => bulkMut.mutate({ stage: v })}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Move to stage" />
            </SelectTrigger>
            <SelectContent>
              {PIPELINE_STAGES.map((s) => (
                <SelectItem key={s.key} value={s.key} className="text-xs">
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select onValueChange={(v) => bulkMut.mutate({ creator_id: v === "none" ? null : v })}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Assign creator" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-xs">Unassign</SelectItem>
              {(creatorsQ.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-xs">
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="ml-auto h-8" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-destructive hover:text-destructive"
            onClick={() => {
              if (confirm(`${selected.size}টি content মুছে ফেলবে?`)) deleteMut.mutate([...selected]);
            }}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      )}

      {itemsQ.isLoading ? (
        <div className="grid gap-2 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={KanbanSquare}
          title="কোনো content নেই"
          description="Intake থেকে product push করো, অথবা এখানে নতুন content piece যোগ করো।"
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New content
            </Button>
          }
        />
      ) : view.mode === "board" ? (
        <BoardView
          items={filtered}
          swimlane={view.swimlane}
          stageCounts={stageCounts}
          dragOver={dragOver}
          setDragOver={setDragOver}
          onDrop={dropOn}
          creatorName={creatorName}
          productName={productName}
          cardProps={cardProps}
        />
      ) : view.mode === "list" ? (
        <ListView
          items={filtered}
          productName={productName}
          creatorName={creatorName}
          selected={selected}
          onToggle={toggleSel}
          onOpen={setOpen}
        />
      ) : (
        <CalendarView items={filtered} onOpen={setOpen} />
      )}

      <ItemSheet
        item={open}
        onClose={() => setOpen(null)}
        onSave={(patch) => {
          saveMut.mutate(patch);
          setOpen(null);
        }}
        onDelete={(id) => {
          deleteMut.mutate([id]);
          setOpen(null);
        }}
        creators={(creatorsQ.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
        agencies={(agenciesQ.data ?? []).map((a) => ({ id: a.id, name: a.name }))}
        productLabel={open?.product_id ? (productName.get(open.product_id) ?? null) : null}
        brandLabel={
          brands.find((b) => b.id === open?.brand_id)?.name ?? activeBrand?.name ?? null
        }
      />

      <Sheet open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-base">New content piece</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 py-3">
            <div>
              <Label className="text-[11px]">Product</Label>
              <ProductPicker
                products={productsQ.data ?? []}
                value={draft.product_id || null}
                onChange={(id) => {
                  const p = (productsQ.data ?? []).find((x) => x.id === id);
                  setDraft((d) => ({
                    ...d,
                    product_id: id ?? "",
                    // product বাছলে title খালি থাকলে auto-fill
                    title: d.title.trim() ? d.title : p ? `${p.title} — ${labelOf(CONTENT_TYPES, d.content_type)}` : d.title,
                  }));
                }}
              />
            </div>
            <div>
              <Label className="text-[11px]">Title</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !createMut.isPending) createMut.mutate({});
                }}
                placeholder="যেমন: Rocket Launcher — UGC hook test"
                className="h-9"
              />
            </div>

            <BrandSelect
              value={draft.brand_id || activeBrand?.id || null}
              onChange={(v) => setDraft({ ...draft, brand_id: v ?? "" })}
            />
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
                <Label className="text-[11px]">Style</Label>
                <Select
                  value={draft.content_style}
                  onValueChange={(v) => setDraft({ ...draft, content_style: v })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTENT_STYLES.map((t) => (
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
                  onValueChange={(v) => setDraft({ ...draft, creator_id: v === "none" ? "" : v })}
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
            <div className="sticky bottom-0 flex gap-2 border-t bg-background py-3">
              <Button
                variant="outline"
                className="flex-1"
                disabled={createMut.isPending}
                onClick={() => createMut.mutate({ again: true })}
              >
                Save & add another
              </Button>
              <Button
                className="flex-1"
                disabled={createMut.isPending}
                onClick={() => createMut.mutate({})}
              >
                Create
              </Button>
            </div>

          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ---------------- Board ---------------- */

type CardProps = {
  productName: Map<string, string>;
  creatorName: Map<string, string>;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (i: ContentItem) => void;
  onMove: (i: ContentItem, dir: -1 | 1) => void;
  onDragStart: (id: string) => void;
};

function BoardView({
  items,
  swimlane,
  stageCounts,
  dragOver,
  setDragOver,
  onDrop,
  creatorName,
  productName,
  cardProps,
}: {
  items: ContentItem[];
  swimlane: "none" | "creator" | "product";
  stageCounts: Map<string, number>;
  dragOver: string | null;
  setDragOver: (v: string | null) => void;
  onDrop: (stage: string) => void;
  creatorName: Map<string, string>;
  productName: Map<string, string>;
  cardProps: CardProps;
}) {
  const lanes = useMemo(() => {
    if (swimlane === "none") return [{ key: "all", label: "", items }];
    const m = new Map<string, ContentItem[]>();
    for (const i of items) {
      const id = swimlane === "creator" ? i.creator_id : i.product_id;
      const label =
        id == null
          ? "Unassigned"
          : swimlane === "creator"
            ? (creatorName.get(id) ?? "Unknown creator")
            : (productName.get(id) ?? "Unknown product");
      const arr = m.get(label) ?? [];
      arr.push(i);
      m.set(label, arr);
    }
    return [...m.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([label, list]) => ({ key: label, label, items: list }));
  }, [items, swimlane, creatorName, productName]);

  return (
    <div className="space-y-4">
      {lanes.map((lane) => (
        <div key={lane.key} className="space-y-2">
          {lane.label && (
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs font-semibold">{lane.label}</p>
              <Badge variant="secondary" className="text-[10px]">
                {lane.items.length}
              </Badge>
            </div>
          )}
          <div className="flex snap-x gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-5 md:overflow-visible">
            {PIPELINE_STAGES.map((st) => {
              const list = lane.items.filter((i) => i.stage === st.key);
              const dropKey = `${lane.key}:${st.key}`;
              return (
                <div
                  key={st.key}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(dropKey);
                  }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    onDrop(st.key);
                  }}
                  className={cn(
                    "w-[86vw] shrink-0 snap-start rounded-xl border border-border/60 bg-muted/25 p-2 transition-colors md:w-auto",
                    dragOver === dropKey && "border-primary/50 bg-primary/5 ring-1 ring-primary/20",
                  )}
                >
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-xs font-semibold">{st.label}</span>
                    <Badge variant="secondary" className="text-[10px] tabular-nums">
                      {swimlane === "none" ? (stageCounts.get(st.key) ?? 0) : list.length}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {list.map((i) => (
                      <PipelineCard key={i.id} item={i} {...cardProps} />
                    ))}
                    {list.length === 0 && (
                      <p className="px-1 py-6 text-center text-[11px] text-muted-foreground">খালি</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function PipelineCard({
  item: i,
  productName,
  creatorName,
  selected,
  onToggle,
  onOpen,
  onMove,
  onDragStart,
}: CardProps & { item: ContentItem }) {
  const due = daysUntil(i.due_date);
  const done = i.stage === "published" || i.stage === "performance";
  const overdue = !done && due != null && due < 0;
  const isSel = selected.has(i.id);

  return (
    <div
      draggable
      onDragStart={() => onDragStart(i.id)}
      className={cn(
        "group cursor-grab rounded-lg border bg-card p-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:cursor-grabbing",
        overdue ? "border-destructive/40" : "border-border/70",
        isSel && "ring-1 ring-primary/40",
      )}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={isSel}
          onCheckedChange={() => onToggle(i.id)}
          className="mt-0.5 h-3.5 w-3.5"
        />
        <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(i)} type="button">
          <p className="line-clamp-2 text-xs font-semibold">{i.title}</p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {i.code} · {labelOf(CONTENT_TYPES, i.content_type)} · {labelOf(PLATFORMS, i.platform)}
          </p>
          <div className="mt-1">
            <BrandTag brandId={i.brand_id} />
          </div>
          {i.product_id && productName.get(i.product_id) && (
            <p className="mt-1 truncate text-[10px] text-muted-foreground">
              📦 {productName.get(i.product_id)}
            </p>
          )}
          {i.creator_id && creatorName.get(i.creator_id) && (
            <p className="truncate text-[10px] text-muted-foreground">
              🎬 {creatorName.get(i.creator_id)}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <Badge variant="outline" className="text-[10px]">
              {labelOf(ITEM_STATUSES, i.status)}
            </Badge>
            {i.content_style && (
              <Badge variant="secondary" className="text-[10px]">
                {labelOf(CONTENT_STYLES, i.content_style)}
              </Badge>
            )}
            {i.cost > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {bdt(i.cost)}
              </Badge>
            )}
            {i.views > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {fmtNum(i.views)} views
              </Badge>
            )}
            {due != null && !done && (
              <Pill tone={overdue ? "bad" : due <= 2 ? "warn" : "default"}>
                <Clock className="h-3 w-3" />
                {overdue ? `${Math.abs(due)}d late` : `${due}d left`}
              </Pill>
            )}
          </div>
        </button>
        <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onMove(i, -1)}>
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
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onMove(i, 1)}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/* ---------------- List ---------------- */

function ListView({
  items,
  productName,
  creatorName,
  selected,
  onToggle,
  onOpen,
}: {
  items: ContentItem[];
  productName: Map<string, string>;
  creatorName: Map<string, string>;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (i: ContentItem) => void;
}) {
  const rows = sortBy(items, (i) => i.due_date ?? "9999", "asc");
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
      <div className="hidden grid-cols-[28px_1.6fr_1fr_100px_100px_90px_90px_90px] gap-2 border-b bg-muted/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
        <span />
        <span>Content</span>
        <span>Product / creator</span>
        <span>Stage</span>
        <span>Status</span>
        <span>Due</span>
        <span className="text-right">Cost</span>
        <span className="text-right">Views</span>
      </div>
      <div className="divide-y divide-border/60">
        {rows.map((i) => {
          const due = daysUntil(i.due_date);
          const done = i.stage === "published" || i.stage === "performance";
          const overdue = !done && due != null && due < 0;
          return (
            <div
              key={i.id}
              className="grid grid-cols-[28px_1fr] gap-2 px-3 py-2 text-xs transition-colors hover:bg-muted/40 md:grid-cols-[28px_1.6fr_1fr_100px_100px_90px_90px_90px] md:items-center"
            >
              <Checkbox
                checked={selected.has(i.id)}
                onCheckedChange={() => onToggle(i.id)}
                className="h-3.5 w-3.5"
              />
              <button className="min-w-0 text-left" onClick={() => onOpen(i)} type="button">
                <p className="truncate font-medium">{i.title}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {i.code} · {labelOf(PLATFORMS, i.platform)}
                </p>
                <div className="mt-0.5">
                  <BrandTag brandId={i.brand_id} />
                </div>
              </button>
              <span className="truncate text-[11px] text-muted-foreground">
                {(i.product_id ? productName.get(i.product_id) : null) ?? "—"}
                {i.creator_id ? ` · ${creatorName.get(i.creator_id) ?? ""}` : ""}
              </span>
              <span className="hidden md:block">
                <Badge variant="outline" className="text-[10px]">
                  {labelOf(PIPELINE_STAGES, i.stage)}
                </Badge>
              </span>
              <span className="hidden text-[11px] md:block">{labelOf(ITEM_STATUSES, i.status)}</span>
              <span className={cn("hidden text-[11px] md:block", overdue && "font-semibold text-destructive")}>
                {i.due_date ?? "—"}
              </span>
              <span className="hidden text-right text-[11px] tabular-nums md:block">{bdt(i.cost)}</span>
              <span className="hidden text-right text-[11px] tabular-nums md:block">{fmtNum(i.views)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Calendar ---------------- */

function CalendarView({ items, onOpen }: { items: ContentItem[]; onOpen: (i: ContentItem) => void }) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const byDay = useMemo(() => {
    const m = new Map<string, ContentItem[]>();
    for (const i of items) {
      if (!i.due_date) continue;
      const key = i.due_date.slice(0, 10);
      const arr = m.get(key) ?? [];
      arr.push(i);
      m.set(key, arr);
    }
    return m;
  }, [items]);

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: startPad }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];
  const todayKey = new Date().toISOString().slice(0, 10);
  const undated = items.filter((i) => !i.due_date);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="min-w-[140px] text-center text-sm font-semibold">
            {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => {
            const d = new Date();
            setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
          }}
        >
          Today
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <span key={d} className="py-1.5">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, idx) => {
            const key = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";
            const list = d ? (byDay.get(key) ?? []) : [];
            return (
              <div
                key={idx}
                className={cn(
                  "min-h-[86px] border-b border-r border-border/50 p-1",
                  !d && "bg-muted/20",
                  key === todayKey && "bg-primary/5",
                )}
              >
                {d && (
                  <>
                    <p
                      className={cn(
                        "mb-1 text-[10px] font-semibold tabular-nums",
                        key === todayKey ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {d.getDate()}
                    </p>
                    <div className="space-y-1">
                      {list.slice(0, 3).map((i) => (
                        <button
                          key={i.id}
                          type="button"
                          onClick={() => onOpen(i)}
                          className="block w-full truncate rounded bg-primary/10 px-1 py-0.5 text-left text-[10px] font-medium text-primary hover:bg-primary/20"
                        >
                          {i.title}
                        </button>
                      ))}
                      {list.length > 3 && (
                        <p className="px-1 text-[9px] text-muted-foreground">+{list.length - 3} more</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {undated.length > 0 && (
        <div className="rounded-xl border border-dashed border-border/70 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Due date নেই ({undated.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {undated.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => onOpen(i)}
                className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] hover:border-primary/40 hover:text-primary"
              >
                {i.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Detail sheet ---------------- */

function ItemSheet({
  item,
  onClose,
  onSave,
  onDelete,
  creators,
  agencies,
  productLabel,
  brandLabel,
}: {
  item: ContentItem | null;
  onClose: () => void;
  onSave: (patch: Partial<ContentItem> & { id: string }) => void;
  onDelete: (id: string) => void;
  creators: { id: string; name: string }[];
  agencies: { id: string; name: string }[];
  productLabel: string | null;
  brandLabel?: string | null;
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
  const checklist = [
    { label: "Hook", ok: !!d.hook?.trim() },
    { label: "Script", ok: words >= 20 },
    { label: "Caption", ok: !!d.caption?.trim() },
    { label: "CTA", ok: !!d.cta?.trim() },
    { label: "Hashtags", ok: !!d.hashtags?.trim() },
  ];
  const ready = checklist.filter((c) => c.ok).length;
  const er = engagementRate(d);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-base">{d.title}</SheetTitle>
          <p className="text-[11px] text-muted-foreground">
            {d.code} · {productLabel ?? "No product"} · {labelOf(PIPELINE_STAGES, d.stage)}
          </p>
          <div className="pt-1">
            <BrandTag brandId={d.brand_id} />
          </div>
        </SheetHeader>
        <Tabs defaultValue="script" className="py-3">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="script" className="text-xs">
              Script Studio
            </TabsTrigger>
            <TabsTrigger value="brief" className="text-xs">
              Brief
            </TabsTrigger>
            <TabsTrigger value="prod" className="text-xs">
              Production
            </TabsTrigger>
            <TabsTrigger value="results" className="text-xs">
              Results
            </TabsTrigger>
          </TabsList>

          <TabsContent value="brief">
            <BriefPanel
              item={item}
              productLabel={productLabel}
              brandLabel={brandLabel ?? null}
              creators={creators}
              agencies={agencies}
            />
          </TabsContent>

          <TabsContent value="script" className="space-y-3 pt-3">
            <div className="rounded-xl border border-border/70 bg-muted/30 p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[11px] font-semibold">Readiness</p>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {ready}/{checklist.length}
                </span>
              </div>
              <MiniBar value={ready} max={checklist.length} tone={ready === checklist.length ? "good" : "warn"} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {checklist.map((c) => (
                  <Pill key={c.label} tone={c.ok ? "good" : "default"}>
                    {c.ok ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                    {c.label}
                  </Pill>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-[11px]">Hook</Label>
              <Input value={d.hook ?? ""} onChange={(e) => set({ hook: e.target.value })} className="h-9" />
            </div>
            <div>
              <Label className="text-[11px]">Angle</Label>
              <Input value={d.angle ?? ""} onChange={(e) => set({ angle: e.target.value })} className="h-9" />
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
                className="min-h-48 text-sm leading-relaxed"
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
                <Input value={d.cta ?? ""} onChange={(e) => set({ cta: e.target.value })} className="h-9" />
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
                <Label className="text-[11px]">Style</Label>
                <Select
                  value={d.content_style ?? "none"}
                  onValueChange={(v) => set({ content_style: v === "none" ? null : v })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="No style" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No style</SelectItem>
                    {CONTENT_STYLES.map((t) => (
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
            {d.video_url && <VideoEmbed url={d.video_url} />}
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
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Engagement" value={`${(er * 100).toFixed(1)}%`} />
              <Metric
                label="Cost / order"
                value={costPerOrder(d.cost, d.attributed_orders) != null ? bdt(costPerOrder(d.cost, d.attributed_orders)!) : "—"}
              />
              <Metric
                label="Cost / 1k views"
                value={d.views > 0 ? bdt((d.cost / d.views) * 1000) : "—"}
              />
            </div>
          </TabsContent>
        </Tabs>
        <div className="sticky bottom-0 flex gap-2 border-t bg-background py-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => {
              if (confirm(`"${d.title}" মুছে ফেলবে?`)) onDelete(d.id);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
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
                content_style: d.content_style,
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 px-2 py-1.5 text-center">
      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
}

function VideoEmbed({ url }: { url: string }) {
  const src = useMemo(() => {
    try {
      const u = new URL(url);
      if (u.hostname.includes("youtube.com")) {
        const v = u.searchParams.get("v");
        return v ? `https://www.youtube.com/embed/${v}` : null;
      }
      if (u.hostname === "youtu.be") return `https://www.youtube.com/embed${u.pathname}`;
      if (u.hostname.includes("vimeo.com")) return `https://player.vimeo.com/video${u.pathname}`;
      return null;
    } catch {
      return null;
    }
  }, [url]);

  if (/\.(mp4|webm|mov)$/i.test(url)) {
    return <video src={url} controls className="w-full rounded-xl border" />;
  }
  if (src) {
    return (
      <iframe
        src={src}
        title="Content preview"
        allowFullScreen
        className="aspect-video w-full rounded-xl border"
      />
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs text-primary hover:underline"
    >
      <Play className="h-3.5 w-3.5" /> Open video
    </a>
  );
}
