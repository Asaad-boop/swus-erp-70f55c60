import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Search, Plus, Download, Wand2, Trash2, Edit3, Package, PackageX, Tag,
  Wallet, Globe, ChevronLeft, ChevronRight, MoreVertical, Copy, Power, X, Boxes,
  LayoutGrid, Rows3, SlidersHorizontal, RotateCcw, Sparkles, ImageOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useBrand } from "@/contexts/brand-context";
import {
  useProductsCatalog, useCatalogStats, useAllCategories,
  DEFAULT_CATALOG_FILTER, type CatalogFilter,
} from "@/hooks/erp/use-products-catalog";
import { exportCatalogCsv, syncState, type CatalogProduct } from "@/lib/erp/product-catalog";
import { downloadCsv } from "@/lib/erp/orders";
import { stockBadge, type ProductRow } from "@/lib/erp/inventory";
import { ProductAddDialog } from "@/components/erp/inventory/product-add-dialog";
import { ProductEditDialog } from "@/components/erp/inventory/product-edit-dialog";
import { SkuGeneratorDialog } from "@/components/erp/inventory/sku-generator-dialog";
import { ProductDeleteDialog } from "@/components/erp/inventory/product-delete-dialog";

export const Route = createFileRoute("/_authenticated/erp/products")({
  head: () => ({
    meta: [
      { title: "Product Catalog — Synq ERP" },
      { name: "description", content: "সব ব্র্যান্ডের প্রোডাক্ট মাস্টার লিস্ট — SKU, স্টক, সিঙ্ক স্ট্যাটাস, অ্যাড/এডিট ও পার্মানেন্ট ডিলিট।" },
      { property: "og:title", content: "Product Catalog — Synq ERP" },
      { property: "og:description", content: "সব ব্র্যান্ডের প্রোডাক্ট এক জায়গায় — SKU generator, sync status ও full lifecycle management।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductCatalogPage,
});

const money = (n: number) => `৳${Math.round(n).toLocaleString("en-BD")}`;
const compact = (n: number) =>
  n >= 10000000 ? `৳${(n / 10000000).toFixed(2)}Cr` : n >= 100000 ? `৳${(n / 100000).toFixed(2)}L` : money(n);

type KpiProps = {
  icon: any; label: string; value: string; sub?: string;
  ring: string; glow: string; active?: boolean; onClick?: () => void;
};

function Kpi({ icon: Icon, label, value, sub, ring, glow, active, onClick }: KpiProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-card p-4 text-left transition-all",
        "hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "ring-2 ring-primary/60 shadow-md",
      )}
    >
      <div className={cn("pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full blur-2xl opacity-60 transition-opacity group-hover:opacity-100", glow)} />
      <div className="relative flex items-center gap-3">
        <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl border", ring)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="truncate text-2xl font-semibold tabular-nums leading-tight">{value}</div>
          {sub && <div className="truncate text-[11px] text-muted-foreground">{sub}</div>}
        </div>
      </div>
    </button>
  );
}

function ProductCatalogPage() {
  const qc = useQueryClient();
  const { brands } = useBrand();
  const [filter, setFilter] = useState<CatalogFilter>(DEFAULT_CATALOG_FILTER);
  const [searchRaw, setSearchRaw] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogProduct | null>(null);
  const [skuTargets, setSkuTargets] = useState<CatalogProduct[] | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<CatalogProduct[] | null>(null);
  const [view, setView] = useState<"table" | "grid">("table");
  const [showFilters, setShowFilters] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setFilter((f) => ({ ...f, search: searchRaw, page: 0 })), 300);
    return () => clearTimeout(t);
  }, [searchRaw]);

  // "/" focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        document.getElementById("catalog-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data, isLoading, isFetching } = useProductsCatalog(filter);
  const { data: stats } = useCatalogStats();
  const { data: categories = [] } = useAllCategories();

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / filter.pageSize));

  const brandName = useMemo(() => {
    const m = new Map(brands.map((b) => [b.id, b.name]));
    return (id: string | null) => (id ? (m.get(id) ?? "—") : "No brand");
  }, [brands]);
  const catName = useMemo(() => {
    const m = new Map(categories.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (m.get(id) ?? "—") : "—");
  }, [categories]);

  const set = <K extends keyof CatalogFilter>(k: K, v: CatalogFilter[K]) =>
    setFilter((f) => ({ ...f, [k]: v, page: k === "page" ? (v as number) : 0 }));

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const chips = useMemo(() => {
    const out: Array<{ key: keyof CatalogFilter; label: string; reset: any }> = [];
    if (filter.brandId !== "all") out.push({ key: "brandId", label: `Brand: ${filter.brandId === "none" ? "No brand" : brandName(filter.brandId)}`, reset: "all" });
    if (filter.categoryId !== "all") out.push({ key: "categoryId", label: `Category: ${catName(filter.categoryId)}`, reset: "all" });
    if (filter.status !== "all") out.push({ key: "status", label: `Status: ${filter.status}`, reset: "all" });
    if (filter.stock !== "all") out.push({ key: "stock", label: `Stock: ${filter.stock}`, reset: "all" });
    if (filter.sku !== "all") out.push({ key: "sku", label: filter.sku === "missing" ? "SKU missing" : "Has SKU", reset: "all" });
    if (filter.flag !== "all") out.push({ key: "flag", label: `Type: ${filter.flag}`, reset: "all" });
    if (filter.search) out.push({ key: "search", label: `“${filter.search}”`, reset: "" });
    return out;
  }, [filter, brandName, catName]);

  const resetAll = () => { setSearchRaw(""); setFilter(DEFAULT_CATALOG_FILTER); };

  const toggleActive = useMutation({
    mutationFn: async ({ ids, active }: { ids: string[]; active: boolean }) => {
      const { error } = await supabase.from("products").update({ is_active: active }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["products-catalog"] });
      qc.invalidateQueries({ queryKey: ["products-catalog-stats"] });
      toast.success(`${v.ids.length}টি product ${v.active ? "active" : "inactive"} করা হয়েছে`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = () => {
    downloadCsv(`products-${new Date().toISOString().slice(0, 10)}.csv`, exportCatalogCsv(rows, brandName, catName));
  };

  const toggleRow = (id: string, on: boolean | string) =>
    setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  const thumb = (p: CatalogProduct, size = "h-11 w-11") =>
    p.image ? (
      <img src={p.image} alt={p.title} loading="lazy" className={cn(size, "rounded-xl border object-cover")} />
    ) : (
      <div className={cn(size, "grid place-items-center rounded-xl border bg-muted/60")}>
        <ImageOff className="h-4 w-4 text-muted-foreground" />
      </div>
    );

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-card to-card p-5 md:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> Master data
            </div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Product Catalog</h1>
            <p className="text-sm text-muted-foreground">সব ব্র্যান্ড · active + inactive · SKU, sync ও full lifecycle এক জায়গায়</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={exportCsv}>
              <Download className="mr-2 h-4 w-4" />Export
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setSkuTargets(selectedRows.length ? selectedRows : rows)}>
              <Wand2 className="mr-2 h-4 w-4" />SKU generate
            </Button>
            <Button size="sm" className="rounded-xl shadow-sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />New product
            </Button>
          </div>
        </div>
      </header>

      {/* KPI strip — clickable filters */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi icon={Package} label="Total products" value={String(stats?.total ?? 0)}
          sub={`${stats?.active ?? 0} active · ${stats?.inactive ?? 0} inactive`}
          ring="border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-300" glow="bg-blue-500/25"
          active={filter.status === "all" && filter.sku === "all" && filter.stock === "all"}
          onClick={resetAll} />
        <Kpi icon={Tag} label="SKU missing" value={String(stats?.missingSku ?? 0)} sub="ক্লিক করে ফিল্টার করো"
          ring="border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-300" glow="bg-violet-500/25"
          active={filter.sku === "missing"}
          onClick={() => set("sku", filter.sku === "missing" ? "all" : "missing")} />
        <Kpi icon={Globe} label="Not listed" value={String(stats?.notListed ?? 0)} sub="কোনো brand storefront-এ নেই"
          ring="border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-300" glow="bg-amber-500/25" />
        <Kpi icon={PackageX} label="Out of stock" value={String(stats?.outOfStock ?? 0)} sub="ক্লিক করে ফিল্টার করো"
          ring="border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-300" glow="bg-red-500/25"
          active={filter.stock === "out"}
          onClick={() => set("stock", filter.stock === "out" ? "all" : "out")} />
        <Kpi icon={Wallet} label="Stock value" value={compact(stats?.stockValue ?? 0)} sub="WAC × stock"
          ring="border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" glow="bg-emerald-500/25" />
      </div>

      {/* Sticky toolbar */}
      <div className="sticky top-2 z-20 rounded-2xl border bg-background/80 p-3 shadow-sm backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="catalog-search" className="h-10 rounded-xl pl-9 pr-16" placeholder="Title, SKU, barcode, slug…"
              value={searchRaw} onChange={(e) => setSearchRaw(e.target.value)} />
            {searchRaw ? (
              <button onClick={() => setSearchRaw("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted">
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">/</kbd>
            )}
          </div>

          <Button variant={showFilters ? "secondary" : "outline"} size="sm" className="h-10 rounded-xl" onClick={() => setShowFilters((s) => !s)}>
            <SlidersHorizontal className="mr-2 h-4 w-4" />Filters
            {chips.length > 0 && <Badge className="ml-2 h-5 rounded-full px-1.5">{chips.length}</Badge>}
          </Button>

          <div className="flex h-10 items-center rounded-xl border p-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={view === "table" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-lg" onClick={() => setView("table")}>
                  <Rows3 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Table view</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={view === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-lg" onClick={() => setView("grid")}>
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Grid view</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {showFilters && (
          <>
            <Separator className="my-3" />
            <div className="flex flex-wrap items-center gap-2">
              <Select value={filter.brandId} onValueChange={(v) => set("brandId", v)}>
                <SelectTrigger className="h-9 w-[160px] rounded-xl"><SelectValue placeholder="Brand" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All brands</SelectItem>
                  {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  <SelectItem value="none">No brand</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filter.categoryId} onValueChange={(v) => set("categoryId", v)}>
                <SelectTrigger className="h-9 w-[160px] rounded-xl"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filter.status} onValueChange={(v) => set("status", v as CatalogFilter["status"])}>
                <SelectTrigger className="h-9 w-[130px] rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filter.stock} onValueChange={(v) => set("stock", v as CatalogFilter["stock"])}>
                <SelectTrigger className="h-9 w-[130px] rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any stock</SelectItem>
                  <SelectItem value="in">In stock</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="out">Out</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filter.sku} onValueChange={(v) => set("sku", v as CatalogFilter["sku"])}>
                <SelectTrigger className="h-9 w-[130px] rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any SKU</SelectItem>
                  <SelectItem value="missing">SKU missing</SelectItem>
                  <SelectItem value="has">Has SKU</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filter.flag} onValueChange={(v) => set("flag", v as CatalogFilter["flag"])}>
                <SelectTrigger className="h-9 w-[140px] rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="featured">Featured</SelectItem>
                  <SelectItem value="new">New arrival</SelectItem>
                  <SelectItem value="preorder">Pre-order</SelectItem>
                  <SelectItem value="combo">Combo</SelectItem>
                  <SelectItem value="variants">Has variants</SelectItem>
                </SelectContent>
              </Select>
              <Select value={`${filter.sortBy}:${filter.sortDir}`} onValueChange={(v) => {
                const [b, d] = v.split(":");
                setFilter((f) => ({ ...f, sortBy: b as CatalogFilter["sortBy"], sortDir: d as "asc" | "desc", page: 0 }));
              }}>
                <SelectTrigger className="h-9 w-[170px] rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="updated:desc">Recently updated</SelectItem>
                  <SelectItem value="created:desc">Newest first</SelectItem>
                  <SelectItem value="title:asc">Title A→Z</SelectItem>
                  <SelectItem value="price:desc">Price high→low</SelectItem>
                  <SelectItem value="stock:asc">Stock low→high</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {chips.map((c) => (
              <button key={String(c.key)} onClick={() => { if (c.key === "search") setSearchRaw(""); set(c.key, c.reset); }}
                className="group inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1 text-xs transition-colors hover:bg-muted">
                {c.label}<X className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />
              </button>
            ))}
            <Button variant="ghost" size="sm" className="h-7 rounded-full text-xs" onClick={resetAll}>
              <RotateCcw className="mr-1.5 h-3 w-3" />Reset all
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      <Card className="overflow-hidden rounded-2xl">
        {isFetching && !isLoading && <div className="h-0.5 w-full animate-pulse bg-primary/60" />}

        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-1/5" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl border bg-muted/50"><Package className="h-6 w-6 text-muted-foreground" /></div>
            <div>
              <div className="font-medium">কোনো product পাওয়া যায়নি</div>
              <p className="text-sm text-muted-foreground">ফিল্টার বদলাও অথবা নতুন product যোগ করো।</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="rounded-xl" onClick={resetAll}><RotateCcw className="mr-2 h-4 w-4" />Reset filters</Button>
              <Button size="sm" className="rounded-xl" onClick={() => setAddOpen(true)}><Plus className="mr-2 h-4 w-4" />New product</Button>
            </div>
          </div>
        ) : view === "grid" ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {rows.map((p) => {
              const sync = syncState(p);
              const sb = stockBadge(p.stock, p.low_stock_threshold);
              const on = selected.has(p.id);
              return (
                <div key={p.id} className={cn(
                  "group relative rounded-2xl border bg-card p-3 transition-all hover:-translate-y-0.5 hover:shadow-lg",
                  on && "ring-2 ring-primary/60", !p.is_active && "opacity-70",
                )}>
                  <div className="absolute left-4 top-4 z-10 opacity-0 transition-opacity group-hover:opacity-100 data-[on=true]:opacity-100" data-on={on}>
                    <Checkbox checked={on} onCheckedChange={(c) => toggleRow(p.id, c as boolean)} className="bg-background" />
                  </div>
                  <div className="absolute right-3 top-3 z-10">
                    <RowMenu p={p} setEditing={setEditing} setSkuTargets={setSkuTargets} setDeleteTargets={setDeleteTargets} toggleActive={toggleActive} />
                  </div>
                  <div className="mb-3 aspect-square w-full overflow-hidden rounded-xl border bg-muted/40">
                    {p.image
                      ? <img src={p.image} alt={p.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                      : <div className="grid h-full place-items-center"><ImageOff className="h-6 w-6 text-muted-foreground" /></div>}
                  </div>
                  <div className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug">{p.title}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="truncate">{brandName(p.brand_id)}</span>·
                    {p.sku ? <code className="truncate font-mono">{p.sku}</code>
                      : <button className="text-violet-600 hover:underline" onClick={() => setSkuTargets([p])}>SKU generate</button>}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-base font-semibold tabular-nums">{money(p.price)}</div>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px]", sb.className)}>{sb.label} · {p.stock}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px]", sync.tone)}>{sync.label}</span>
                    {p.variants.length > 0 && <Badge variant="secondary" className="h-5 rounded-full px-1.5 text-[10px]"><Boxes className="mr-0.5 h-2.5 w-2.5" />{p.variants.length}</Badge>}
                    {p.is_combo && <Badge variant="secondary" className="h-5 rounded-full px-1.5 text-[10px]">Combo</Badge>}
                    {!p.is_active && <Badge variant="outline" className="h-5 rounded-full px-1.5 text-[10px]">Inactive</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">
                    <Checkbox checked={allChecked} onCheckedChange={(c) => setSelected(c ? new Set(rows.map((r) => r.id)) : new Set())} />
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide">Product</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide">SKU</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide">Brand</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide">Category</TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide">Price</TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide">Cost</TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide">Stock</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide">Sync</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide">Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const sync = syncState(p);
                  const sb = stockBadge(p.stock, p.low_stock_threshold);
                  const on = selected.has(p.id);
                  return (
                    <TableRow key={p.id} data-on={on}
                      onDoubleClick={() => setEditing(p)}
                      className={cn(
                        "group cursor-default transition-colors data-[on=true]:bg-primary/5",
                        !p.is_active && "opacity-60",
                      )}>
                      <TableCell>
                        <Checkbox checked={on} onCheckedChange={(c) => toggleRow(p.id, c as boolean)} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {thumb(p)}
                          <div className="min-w-0">
                            <div className="max-w-[280px] truncate font-medium">{p.title}</div>
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <span className="max-w-[150px] truncate">{p.slug}</span>
                              {p.variants.length > 0 && <Badge variant="secondary" className="h-4 rounded-full px-1 text-[10px]"><Boxes className="mr-0.5 h-2.5 w-2.5" />{p.variants.length}</Badge>}
                              {p.is_combo && <Badge variant="secondary" className="h-4 rounded-full px-1 text-[10px]">Combo</Badge>}
                              {p.is_preorder && <Badge variant="secondary" className="h-4 rounded-full px-1 text-[10px]">Pre-order</Badge>}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {p.sku
                          ? <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">{p.sku}</code>
                          : <Button variant="ghost" size="sm" className="h-6 rounded-lg px-2 text-xs text-violet-600" onClick={() => setSkuTargets([p])}><Wand2 className="mr-1 h-3 w-3" />Generate</Button>}
                      </TableCell>
                      <TableCell className="text-sm">{brandName(p.brand_id)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{catName(p.category_id)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{money(p.price)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{money(Number(p.weighted_avg_cost ?? p.cost_price ?? 0))}</TableCell>
                      <TableCell className="text-right">
                        <div className="font-medium tabular-nums">{p.stock}</div>
                        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", sb.className)}>{sb.label}</span>
                      </TableCell>
                      <TableCell><span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px]", sync.tone)}>{sync.label}</span></TableCell>
                      <TableCell>
                        <Badge variant={p.is_active ? "default" : "secondary"} className="rounded-full">{p.is_active ? "Active" : "Inactive"}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-0.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100" onClick={() => setEditing(p)}>
                                <Edit3 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit</TooltipContent>
                          </Tooltip>
                          <RowMenu p={p} setEditing={setEditing} setSkuTargets={setSkuTargets} setDeleteTargets={setDeleteTargets} toggleActive={toggleActive} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-sm">
          <span className="text-muted-foreground">
            {total.toLocaleString()} products · page {filter.page + 1}/{pages}
          </span>
          <div className="flex items-center gap-2">
            <Select value={String(filter.pageSize)} onValueChange={(v) => setFilter((f) => ({ ...f, pageSize: Number(v), page: 0 }))}>
              <SelectTrigger className="h-8 w-[90px] rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>{[25, 50, 100, 200].map((n) => <SelectItem key={n} value={String(n)}>{n}/page</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={filter.page === 0} onClick={() => setFilter((f) => ({ ...f, page: f.page - 1 }))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={filter.page + 1 >= pages} onClick={() => setFilter((f) => ({ ...f, page: f.page + 1 }))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>

      {/* Floating selection bar */}
      {selected.size > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-2xl border bg-background/90 px-3 py-2 shadow-2xl backdrop-blur-xl">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{selected.size} selected</span>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => toggleActive.mutate({ ids: [...selected], active: true })}><Power className="mr-2 h-4 w-4" />Activate</Button>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => toggleActive.mutate({ ids: [...selected], active: false })}><Power className="mr-2 h-4 w-4" />Deactivate</Button>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setSkuTargets(selectedRows)}><Wand2 className="mr-2 h-4 w-4" />SKU</Button>
            <Button size="sm" variant="destructive" className="rounded-xl" onClick={() => setDeleteTargets(selectedRows)}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
            <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => setSelected(new Set())}><X className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      <ProductAddDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <ProductEditDialog product={editing as unknown as ProductRow | null} onClose={() => setEditing(null)} />
      {skuTargets && <SkuGeneratorDialog products={skuTargets} brandName={brandName} catName={catName} onClose={() => setSkuTargets(null)} />}
      {deleteTargets && (
        <ProductDeleteDialog products={deleteTargets} onClose={() => setDeleteTargets(null)} onDeleted={() => setSelected(new Set())} />
      )}
    </div>
  );
}

function RowMenu({ p, setEditing, setSkuTargets, setDeleteTargets, toggleActive }: {
  p: CatalogProduct;
  setEditing: (p: CatalogProduct) => void;
  setSkuTargets: (p: CatalogProduct[]) => void;
  setDeleteTargets: (p: CatalogProduct[]) => void;
  toggleActive: { mutate: (v: { ids: string[]; active: boolean }) => void };
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg"><MoreVertical className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => setEditing(p)}><Edit3 className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setSkuTargets([p])}><Wand2 className="mr-2 h-4 w-4" />Generate SKU</DropdownMenuItem>
        <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(p.id); toast.success("Product ID copied"); }}><Copy className="mr-2 h-4 w-4" />Copy ID</DropdownMenuItem>
        <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(p.sku ?? ""); toast.success(p.sku ? "SKU copied" : "SKU নেই"); }}><Tag className="mr-2 h-4 w-4" />Copy SKU</DropdownMenuItem>
        <DropdownMenuItem onClick={() => toggleActive.mutate({ ids: [p.id], active: !p.is_active })}>
          <Power className="mr-2 h-4 w-4" />{p.is_active ? "Deactivate" : "Activate"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-red-600" onClick={() => setDeleteTargets([p])}><Trash2 className="mr-2 h-4 w-4" />Permanent delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
