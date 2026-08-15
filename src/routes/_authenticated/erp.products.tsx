import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Search, Plus, Download, Wand2, Trash2, Edit3, Package, PackageX, Tag,
  Wallet, Globe, ChevronLeft, ChevronRight, MoreVertical, Copy, Power, X, Boxes,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

function Kpi({ icon: Icon, label, value, sub, tone }: { icon: any; label: string; value: string; sub?: string; tone: string }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tone)}><Icon className="h-5 w-5" /></div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="truncate text-xl font-semibold tabular-nums">{value}</div>
          {sub && <div className="truncate text-[11px] text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
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

  useEffect(() => {
    const t = setTimeout(() => setFilter((f) => ({ ...f, search: searchRaw, page: 0 })), 300);
    return () => clearTimeout(t);
  }, [searchRaw]);

  const { data, isLoading } = useProductsCatalog(filter);
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

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Product Catalog</h1>
          <p className="text-sm text-muted-foreground">সব ব্র্যান্ড · active + inactive · full lifecycle</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export</Button>
          <Button variant="outline" size="sm" onClick={() => setSkuTargets(selectedRows.length ? selectedRows : rows)}>
            <Wand2 className="mr-2 h-4 w-4" />SKU generate
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="mr-2 h-4 w-4" />New product</Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi icon={Package} label="Total products" value={String(stats?.total ?? 0)} sub={`${stats?.active ?? 0} active · ${stats?.inactive ?? 0} inactive`} tone="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" />
        <Kpi icon={Tag} label="SKU missing" value={String(stats?.missingSku ?? 0)} sub="generator দিয়ে ঠিক করো" tone="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" />
        <Kpi icon={Globe} label="Not listed" value={String(stats?.notListed ?? 0)} sub="কোনো brand storefront-এ নেই" tone="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" />
        <Kpi icon={PackageX} label="Out of stock" value={String(stats?.outOfStock ?? 0)} tone="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" />
        <Kpi icon={Wallet} label="Stock value" value={money(stats?.stockValue ?? 0)} sub="WAC × stock" tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Title, SKU, barcode, slug…" value={searchRaw} onChange={(e) => setSearchRaw(e.target.value)} />
          </div>
          <Select value={filter.brandId} onValueChange={(v) => set("brandId", v)}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Brand" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All brands</SelectItem>
              {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              <SelectItem value="none">No brand</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filter.categoryId} onValueChange={(v) => set("categoryId", v)}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filter.status} onValueChange={(v) => set("status", v as CatalogFilter["status"])}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filter.stock} onValueChange={(v) => set("stock", v as CatalogFilter["stock"])}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any stock</SelectItem>
              <SelectItem value="in">In stock</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="out">Out</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filter.sku} onValueChange={(v) => set("sku", v as CatalogFilter["sku"])}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any SKU</SelectItem>
              <SelectItem value="missing">SKU missing</SelectItem>
              <SelectItem value="has">Has SKU</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filter.flag} onValueChange={(v) => set("flag", v as CatalogFilter["flag"])}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
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
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="updated:desc">Recently updated</SelectItem>
              <SelectItem value="created:desc">Newest first</SelectItem>
              <SelectItem value="title:asc">Title A→Z</SelectItem>
              <SelectItem value="price:desc">Price high→low</SelectItem>
              <SelectItem value="stock:asc">Stock low→high</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => toggleActive.mutate({ ids: [...selected], active: true })}><Power className="mr-2 h-4 w-4" />Activate</Button>
          <Button size="sm" variant="outline" onClick={() => toggleActive.mutate({ ids: [...selected], active: false })}><Power className="mr-2 h-4 w-4" />Deactivate</Button>
          <Button size="sm" variant="outline" onClick={() => setSkuTargets(selectedRows)}><Wand2 className="mr-2 h-4 w-4" />SKU</Button>
          <Button size="sm" variant="destructive" onClick={() => setDeleteTargets(selectedRows)}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}><X className="h-4 w-4" /></Button>
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allChecked} onCheckedChange={(c) => {
                    setSelected(c ? new Set(rows.map((r) => r.id)) : new Set());
                  }} />
                </TableHead>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead>Sync</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={11} className="py-10 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={11} className="py-10 text-center text-sm text-muted-foreground">কোনো product পাওয়া যায়নি</TableCell></TableRow>}
              {rows.map((p) => {
                const sync = syncState(p);
                const sb = stockBadge(p.stock, p.low_stock_threshold);
                return (
                  <TableRow key={p.id} className={cn(!p.is_active && "opacity-60")}>
                    <TableCell>
                      <Checkbox checked={selected.has(p.id)} onCheckedChange={(c) => {
                        setSelected((s) => { const n = new Set(s); if (c) n.add(p.id); else n.delete(p.id); return n; });
                      }} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {p.image
                          ? <img src={p.image} alt={p.title} loading="lazy" className="h-10 w-10 rounded-lg border object-cover" />
                          : <div className="grid h-10 w-10 place-items-center rounded-lg border bg-muted"><Package className="h-4 w-4 text-muted-foreground" /></div>}
                        <div className="min-w-0">
                          <div className="max-w-[280px] truncate font-medium">{p.title}</div>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="truncate">{p.slug}</span>
                            {p.variants.length > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]"><Boxes className="mr-0.5 h-2.5 w-2.5" />{p.variants.length}</Badge>}
                            {p.is_combo && <Badge variant="secondary" className="h-4 px-1 text-[10px]">Combo</Badge>}
                            {p.is_preorder && <Badge variant="secondary" className="h-4 px-1 text-[10px]">Pre-order</Badge>}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {p.sku
                        ? <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{p.sku}</code>
                        : <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-violet-600" onClick={() => setSkuTargets([p])}><Wand2 className="mr-1 h-3 w-3" />Generate</Button>}
                    </TableCell>
                    <TableCell className="text-sm">{brandName(p.brand_id)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{catName(p.category_id)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(p.price)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{money(Number(p.weighted_avg_cost ?? p.cost_price ?? 0))}</TableCell>
                    <TableCell className="text-right">
                      <div className="tabular-nums">{p.stock}</div>
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px]", sb.className)}>{sb.label}</span>
                    </TableCell>
                    <TableCell><span className={cn("rounded px-2 py-0.5 text-[11px]", sync.tone)}>{sync.label}</span></TableCell>
                    <TableCell>
                      <Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditing(p)}><Edit3 className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setSkuTargets([p])}><Wand2 className="mr-2 h-4 w-4" />Generate SKU</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(p.id); toast.success("Product ID copied"); }}><Copy className="mr-2 h-4 w-4" />Copy ID</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleActive.mutate({ ids: [p.id], active: !p.is_active })}>
                            <Power className="mr-2 h-4 w-4" />{p.is_active ? "Deactivate" : "Activate"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600" onClick={() => setDeleteTargets([p])}><Trash2 className="mr-2 h-4 w-4" />Permanent delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-sm">
          <span className="text-muted-foreground">{total} products · page {filter.page + 1}/{pages}</span>
          <div className="flex items-center gap-2">
            <Select value={String(filter.pageSize)} onValueChange={(v) => setFilter((f) => ({ ...f, pageSize: Number(v), page: 0 }))}>
              <SelectTrigger className="h-8 w-[90px]"><SelectValue /></SelectTrigger>
              <SelectContent>{[25, 50, 100, 200].map((n) => <SelectItem key={n} value={String(n)}>{n}/page</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={filter.page === 0} onClick={() => setFilter((f) => ({ ...f, page: f.page - 1 }))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={filter.page + 1 >= pages} onClick={() => setFilter((f) => ({ ...f, page: f.page + 1 }))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>

      <ProductAddDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <ProductEditDialog product={editing as unknown as ProductRow | null} onClose={() => setEditing(null)} />
      {skuTargets && <SkuGeneratorDialog products={skuTargets} brandName={brandName} catName={catName} onClose={() => setSkuTargets(null)} />}
      {deleteTargets && (
        <ProductDeleteDialog products={deleteTargets} onClose={() => setDeleteTargets(null)} onDeleted={() => setSelected(new Set())} />
      )}
    </div>
  );
}
