import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect, Fragment } from "react";
import {
  Download, Search, ArrowUp, ArrowDown, History, Check, Package, Boxes,
  AlertTriangle, Wallet, ChevronRight, ChevronDown, BarChart3, MoreVertical,
  ScanLine, Plus, Settings, Lock, TrendingUp, TrendingDown, Layers, Clock,
  Edit3, AlertCircle, X, Trash2, Tag, DollarSign,
} from "lucide-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useBrand } from "@/contexts/brand-context";
import {
  useInventoryQuery,
  useInventorySummary,
  useProductCategories,
  useLowStockAlerts,
  useStockMovements,
  useProductTitles,
  DEFAULT_INVENTORY_FILTER,
  type InventoryFilter,
} from "@/hooks/erp/use-inventory-query";
import {
  stockBadge,
  exportProductsCsv,
  STOCK_REASONS,
  sourceBadge,
  type ProductRow,
} from "@/lib/erp/inventory";
import { downloadCsv } from "@/lib/erp/orders";
import { StockAdjustDialog } from "@/components/erp/inventory/stock-adjust-dialog";
import { BulkStockDialog } from "@/components/erp/inventory/bulk-stock-dialog";
import { BulkReorderDialog } from "@/components/erp/inventory/bulk-reorder-dialog";
import { ProductEditDialog } from "@/components/erp/inventory/product-edit-dialog";
import { ProductAddDialog } from "@/components/erp/inventory/product-add-dialog";

export const Route = createFileRoute("/_authenticated/erp/inventory")({
  head: () => ({ meta: [{ title: "Inventory — ERP" }] }),
  component: InventoryPage,
});

type ColumnKey = "wac" | "reserved" | "incoming" | "reorder";
const COLUMN_LABELS: Array<{ key: ColumnKey; label: string }> = [
  { key: "wac", label: "WAC" },
  { key: "reserved", label: "Reserved" },
  { key: "incoming", label: "Incoming" },
  { key: "reorder", label: "Reorder" },
];
const COLUMNS_STORAGE_KEY = "erp.inventory.columns";

function InventoryPage() {
  const { activeBrand, brandIds, isAllBrands, brands } = useBrand();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<InventoryFilter>(DEFAULT_INVENTORY_FILTER);
  const [searchInput, setSearchInput] = useState("");

  // debounce search -> filter
  useEffect(() => {
    const t = setTimeout(() => {
      setFilter((f) => (f.search === searchInput ? f : { ...f, search: searchInput, page: 0 }));
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // "/" focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        document.getElementById("inventory-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [cols, setCols] = useState<Record<ColumnKey, boolean>>({
    wac: true, reserved: true, incoming: true, reorder: true,
  });
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMNS_STORAGE_KEY);
      if (raw) setCols((c) => ({ ...c, ...(JSON.parse(raw) as Record<ColumnKey, boolean>) }));
    } catch { /* ignore */ }
  }, []);
  const toggleCol = (k: ColumnKey) => setCols((c) => {
    const n = { ...c, [k]: !c[k] };
    try { localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(n)); } catch { /* ignore */ }
    return n;
  });
  const visibleColCount = 9 + Object.values(cols).filter(Boolean).length;

  const effective = useMemo<InventoryFilter>(
    () => ({ ...filter, brandIds }),
    [filter, brandIds],
  );

  const { data, isLoading, dataUpdatedAt } = useInventoryQuery(effective);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const summaryQuery = useInventorySummary(effective);
  const categories = useProductCategories(brandIds);
  const lowQuery = useLowStockAlerts(brandIds);
  const movements = useStockMovements(brandIds);

  const brandNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of brands) m.set(b.id, b.name);
    return m;
  }, [brands]);

  const [adjust, setAdjust] = useState<{ product: ProductRow; mode: "in" | "out" } | null>(null);
  const [historyProduct, setHistoryProduct] = useState<ProductRow | null>(null);
  const [editProduct, setEditProduct] = useState<ProductRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => setExpanded((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const [adjustVariant, setAdjustVariant] = useState<string | null>(null);
  const [bulkStock, setBulkStock] = useState<"in" | "out" | null>(null);
  const [bulkReorder, setBulkReorder] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) => setSelected((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const clearSelection = () => setSelected(new Set());

  const handleExport = () => {
    const csv = exportProductsCsv(rows);
    const slug = isAllBrands ? "all-brands" : activeBrand?.slug ?? "brand";
    downloadCsv(`inventory-${slug}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const movementProductIds = useMemo(
    () => Array.from(new Set((movements.data ?? []).map((m) => m.product_id))),
    [movements.data],
  );
  const titles = useProductTitles(movementProductIds);

  const totalPages = Math.max(1, Math.ceil(total / filter.pageSize));

  const pageIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const pageSelectedCount = pageIds.filter((id) => selected.has(id)).length;
  const allPageSelected = pageIds.length > 0 && pageSelectedCount === pageIds.length;
  const somePageSelected = pageSelectedCount > 0 && !allPageSelected;
  const togglePageAll = () => setSelected((s) => {
    const n = new Set(s);
    if (allPageSelected) { for (const id of pageIds) n.delete(id); }
    else { for (const id of pageIds) n.add(id); }
    return n;
  });
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("products").update({ is_active: false }).in("id", ids);
      if (error) throw error;
      return ids;
    },
    onSuccess: (ids) => {
      clearSelection();
      setConfirmDelete(false);
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(`${ids.length} product${ids.length === 1 ? "" : "s"} deleted`, {
        action: {
          label: "Undo",
          onClick: async () => {
            const { error } = await supabase.from("products").update({ is_active: true }).in("id", ids);
            if (error) { toast.error(error.message); return; }
            qc.invalidateQueries({ queryKey: ["inventory"] });
            toast.success("Restored");
          },
        },
        duration: 8000,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const handleExportSelected = () => {
    if (!selectedRows.length) return;
    const csv = exportProductsCsv(selectedRows);
    const slug = isAllBrands ? "all-brands" : activeBrand?.slug ?? "brand";
    downloadCsv(`inventory-selected-${slug}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const bulkMoveBrand = useMutation({
    mutationFn: async ({ ids, brandId }: { ids: string[]; brandId: string }) => {
      const { error } = await supabase.from("products").update({ brand_id: brandId }).in("id", ids);
      if (error) throw error;
      return { ids, brandId };
    },
    onSuccess: ({ ids, brandId }) => {
      const targetName = brandNameById.get(brandId) ?? "brand";
      const prevByProduct = new Map(selectedRows.map((r) => [r.id, r.brand_id as string | null]));
      clearSelection();
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(`${ids.length} product${ids.length === 1 ? "" : "s"} moved to ${targetName}`, {
        action: {
          label: "Undo",
          onClick: async () => {
            const groups = new Map<string, string[]>();
            for (const id of ids) {
              const prev = prevByProduct.get(id);
              if (!prev) continue;
              const arr = groups.get(prev) ?? [];
              arr.push(id);
              groups.set(prev, arr);
            }
            for (const [prevBrand, pids] of groups) {
              await supabase.from("products").update({ brand_id: prevBrand }).in("id", pids);
            }
            qc.invalidateQueries({ queryKey: ["inventory"] });
            toast.success("Restored");
          },
        },
        duration: 8000,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const summary = summaryQuery.data ?? { products: 0, units: 0, value: 0, reserved: 0, low: 0, out: 0 };

  const lowOrOut = summary.low + summary.out;
  const syncedAt = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  const stockPills: Array<{ k: InventoryFilter["stockState"]; label: string }> = [
    { k: "all", label: "All" },
    { k: "in", label: "In Stock" },
    { k: "low", label: "Low Stock" },
    { k: "out", label: "Out of Stock" },
    { k: "reserved", label: "Reserved" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1600px] p-4 md:p-8 space-y-8">
      {/* HEADER */}
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-border/60 pb-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <span>ERP</span>
            <span className="text-border">/</span>
            <span className="text-foreground/70">Inventory</span>
          </div>
          <h1 className="text-[40px] leading-none font-semibold tracking-tight">Inventory</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 py-1 text-xs font-medium text-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {isAllBrands ? `All brands · ${brands.length}` : activeBrand?.name ?? "—"}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs">
              <Package className="h-3.5 w-3.5" />
              <span className="tabular-nums font-medium text-foreground">{total.toLocaleString()}</span> products
            </span>
            {syncedAt && (
              <span className="inline-flex items-center gap-1.5 text-xs">
                <Clock className="h-3.5 w-3.5" />
                Synced {syncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground hover:text-foreground">
            <Settings className="h-4 w-4" />Settings
          </Button>
          <Button size="sm" variant="outline" onClick={handleExport} disabled={!rows.length} className="gap-1.5">
            <Download className="h-4 w-4" />Export
          </Button>
          <Link to="/erp/inventory-reports">
            <Button size="sm" variant="outline" className="gap-1.5"><BarChart3 className="h-4 w-4" />Reports</Button>
          </Link>
          <Button size="sm" className="gap-1.5 shadow-sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />Add Product
          </Button>
        </div>
      </header>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px rounded-2xl border border-border/70 bg-border/60 overflow-hidden">
        <KpiCard
          accent="blue"
          icon={<Package className="h-5 w-5" />}
          label="Total Products"
          value={total.toLocaleString()}
          hint={`${rows.length} on this page`}
        />
        <KpiCard
          accent="purple"
          icon={<Boxes className="h-5 w-5" />}
          label="Total Units"
          value={summary.units.toLocaleString()}
          hint={summary.reserved > 0 ? `${summary.reserved.toLocaleString()} reserved` : "No reservations"}
        />
        <KpiCard
          accent="green"
          icon={<Wallet className="h-5 w-5" />}
          label="Stock Value (BDT)"
          value={`৳${summary.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          hint="Weighted avg cost × stock"
        />
        <KpiCard
          accent="red"
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Low / Out of Stock"
          value={`${lowOrOut} / ${rows.length || 0}`}
          hint={lowQuery.data?.length ? `${lowQuery.data.length} active alerts` : "All healthy"}
          emphasize={lowOrOut > 0}
        />
      </div>

      {/* TABS */}
      <Tabs defaultValue="products" className="space-y-6">
        <TabsList className="bg-transparent border-b border-border/70 rounded-none p-0 h-auto gap-6 w-full justify-start">
          <PillTab value="products" icon={<Package className="h-3.5 w-3.5" />}>Products</PillTab>
          <PillTab value="opening" icon={<Layers className="h-3.5 w-3.5" />}>Opening Stock</PillTab>
          <PillTab value="cost" icon={<DollarSign className="h-3.5 w-3.5" />}>Cost Price</PillTab>
          <PillTab value="low" icon={<AlertTriangle className="h-3.5 w-3.5" />} badge={lowQuery.data?.length}>
            Low Stock
          </PillTab>
          <PillTab value="movements" icon={<TrendingUp className="h-3.5 w-3.5" />}>Stock Movements</PillTab>
        </TabsList>

        {/* PRODUCTS TAB */}
        <TabsContent value="products" className="space-y-5 mt-0">
          {/* Filter bar */}
          <div className="rounded-2xl border border-border/70 bg-card/50 p-3 md:p-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10 pr-12 h-11 text-sm rounded-xl border-border/70 bg-background shadow-none focus-visible:ring-2 focus-visible:ring-ring/40"
                placeholder="Search by title, SKU, barcode or slug — scanner ready…"
                value={filter.search}
                onChange={(e) => setFilter({ ...filter, search: e.target.value, page: 0 })}
                autoFocus
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                <ScanLine className="h-3 w-3" /> scan
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1">
                {stockPills.map((p) => {
                  const active = (p.k === "reserved" ? false : filter.stockState === p.k);
                  return (
                    <button
                      key={p.k}
                      onClick={() => p.k !== "reserved" && setFilter({ ...filter, stockState: p.k as InventoryFilter["stockState"], page: 0 })}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                        active
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted",
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5">
                <Select defaultValue="all">
                  <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent><SelectItem value="all">All categories</SelectItem></SelectContent>
                </Select>
                <Select defaultValue="updated">
                  <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="updated">Sort: Updated</SelectItem>
                    <SelectItem value="title">Sort: Title</SelectItem>
                    <SelectItem value="stock">Sort: Stock</SelectItem>
                  </SelectContent>
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-xs">Columns</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel className="text-xs">Toggle columns</DropdownMenuLabel>
                    {["WAC", "Reserved", "Incoming", "Reorder"].map((c) => (
                      <DropdownMenuItem key={c} className="text-xs">{c}</DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {/* Selection action bar */}
          {selected.size > 0 && (
            <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-foreground/20 bg-foreground text-background px-3 py-2 shadow-lg animate-fade-in">
              <div className="flex items-center gap-3 text-sm">
                <span className="inline-flex items-center justify-center h-6 min-w-[24px] rounded-md bg-background/15 px-1.5 text-xs font-semibold tabular-nums">
                  {selected.size}
                </span>
                <span className="font-medium">selected</span>
                <button onClick={clearSelection} className="text-xs text-background/70 hover:text-background underline-offset-2 hover:underline">
                  Clear
                </button>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Button size="sm" variant="secondary" className="h-8 gap-1.5" onClick={handleExportSelected}>
                  <Download className="h-3.5 w-3.5" />Export CSV
                </Button>
                <Button
                  size="sm" variant="secondary" className="h-8 gap-1.5"
                  onClick={() => { if (selectedRows[0]) setAdjust({ product: selectedRows[0], mode: "in" }); }}
                >
                  <ArrowUp className="h-3.5 w-3.5 text-emerald-600" />Stock In
                </Button>
                <Button
                  size="sm" variant="secondary" className="h-8 gap-1.5"
                  onClick={() => { if (selectedRows[0]) setAdjust({ product: selectedRows[0], mode: "out" }); }}
                >
                  <ArrowDown className="h-3.5 w-3.5 text-red-600" />Stock Out
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="secondary" className="h-8 gap-1.5">
                      <MoreVertical className="h-3.5 w-3.5" />More
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel className="text-xs">Bulk actions</DropdownMenuLabel>
                    <DropdownMenuItem className="text-xs" onClick={handleExportSelected}>
                      <Download className="h-3.5 w-3.5 mr-2" />Export selected
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="text-xs">
                        <Tag className="h-3.5 w-3.5 mr-2" />Move to brand
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent>
                          {brands.length === 0 && (
                            <DropdownMenuItem disabled className="text-xs">No brands</DropdownMenuItem>
                          )}
                          {brands.map((b) => {
                            const allSame = selectedRows.every((r) => r.brand_id === b.id);
                            return (
                              <DropdownMenuItem
                                key={b.id}
                                className="text-xs"
                                disabled={allSame || bulkMoveBrand.isPending}
                                onClick={() => bulkMoveBrand.mutate({ ids: Array.from(selected), brandId: b.id })}
                              >
                                {allSame && <Check className="h-3.5 w-3.5 mr-2 opacity-60" />}
                                {!allSame && <Tag className="h-3.5 w-3.5 mr-2 opacity-60" />}
                                {b.name}
                              </DropdownMenuItem>
                            );
                          })}
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                    <DropdownMenuItem className="text-xs" onClick={() => toast.info("Bulk reorder point — coming soon")}>
                      <AlertCircle className="h-3.5 w-3.5 mr-2" />Set reorder point
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs text-red-600 focus:text-red-600" onClick={() => setConfirmDelete(true)}>
                      <Trash2 className="h-3.5 w-3.5 mr-2" />Delete selected
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-background/70 hover:text-background hover:bg-background/10" onClick={clearSelection}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="rounded-2xl border border-border/70 bg-card overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/30 sticky top-0 z-10 backdrop-blur-sm">
                <TableRow className="hover:bg-transparent border-b border-border/70">
                  <TableHead className="w-10 pl-4">
                    <Checkbox
                      checked={allPageSelected ? true : somePageSelected ? "indeterminate" : false}
                      onCheckedChange={togglePageAll}
                      aria-label="Select all rows on page"
                    />
                  </TableHead>
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product</TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">SKU</TableHead>
                  <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Price</TableHead>
                  <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">WAC</TableHead>
                  <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">In Stock</TableHead>
                  <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reserved</TableHead>
                  <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Available</TableHead>
                  <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Incoming</TableHead>
                  <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reorder</TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                  <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={13} className="text-center py-12 text-muted-foreground">Loading inventory…</TableCell></TableRow>
                )}
                {!isLoading && rows.length === 0 && (
                  <TableRow><TableCell colSpan={13} className="text-center py-12 text-muted-foreground">No products found</TableCell></TableRow>
                )}
                {rows.map((r) => {
                  const variants = r.variants ?? [];
                  const hasVariants = variants.length > 0;
                  const isOpen = expanded.has(r.id);
                  const reserved = Number(r.reserved_stock ?? 0);
                  const available = Number(r.available_stock ?? (r.stock - reserved));
                  const wac = Number(r.weighted_avg_cost ?? r.cost_price ?? 0);
                  const threshold = r.low_stock_threshold ?? 5;
                  const reorderPoint = r.reorder_point ?? 0;
                  const isOut = r.stock <= 0;
                  const isLow = !isOut && r.stock <= threshold;
                  const needsReorder = reorderPoint > 0 && available <= reorderPoint;

                  return (
                    <Fragment key={r.id}>
                      <TableRow
                        data-state={selected.has(r.id) ? "selected" : undefined}
                        className={cn(
                          "group transition-colors border-b border-border/60 relative",
                          selected.has(r.id)
                            ? "bg-foreground/[0.035] hover:bg-foreground/[0.05]"
                            : "hover:bg-muted/30",
                        )}
                      >
                        <TableCell className="pl-4 align-middle relative">
                          {selected.has(r.id) && (
                            <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-foreground" />
                          )}
                          <Checkbox
                            checked={selected.has(r.id)}
                            onCheckedChange={() => toggleSelect(r.id)}
                            aria-label={`Select ${r.title}`}
                          />
                        </TableCell>
                        <TableCell className="p-1 align-middle">
                          {hasVariants ? (
                            <Button size="icon" variant="ghost" className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground" onClick={() => toggleExpand(r.id)}>
                              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-200", isOpen && "rotate-90")} />
                            </Button>
                          ) : null}
                        </TableCell>
                        <TableCell className="py-3.5">
                          <button
                            type="button"
                            onClick={() => setEditProduct(r)}
                            className="flex items-center gap-3 text-left w-full group/cell"
                          >
                            {r.video_url ? (
                              <video
                                src={r.video_url}
                                poster={r.image ?? undefined}
                                muted
                                autoPlay
                                loop
                                playsInline
                                className="h-11 w-11 rounded-lg object-cover ring-1 ring-border/70 shadow-sm transition-transform duration-200 group-hover/cell:scale-[1.03] bg-black"
                              />
                            ) : r.image ? (
                              <img
                                src={r.image} alt=""
                                className="h-11 w-11 rounded-lg object-cover ring-1 ring-border/70 shadow-sm transition-transform duration-200 group-hover/cell:scale-[1.03]"
                              />
                            ) : (
                              <div className="h-11 w-11 rounded-lg bg-gradient-to-br from-muted to-muted/60 flex items-center justify-center ring-1 ring-border/70">
                                <Package className="h-4.5 w-4.5 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-medium text-[13.5px] leading-tight truncate max-w-[260px] text-foreground group-hover/cell:underline underline-offset-4 decoration-foreground/30">
                                {r.title}
                              </div>
                              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                {isAllBrands && r.brand_id && (
                                  <span className="inline-flex items-center rounded-md border border-border/70 bg-background px-1.5 py-0.5 text-[10px] font-medium text-foreground/80">
                                    {brandNameById.get(r.brand_id) ?? "Brand"}
                                  </span>
                                )}
                                <span className="truncate font-mono">
                                  {r.barcode ? `${r.barcode}` : r.slug}
                                </span>
                                {hasVariants && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">
                                    <Layers className="h-2.5 w-2.5" />{variants.length}
                                  </span>
                                )}
                                {variants.filter((v) => v.color_hex || v.color_name).slice(0, 6).map((v) => (
                                  <span
                                    key={v.id}
                                    title={`${v.color_name ?? ""} · ${v.stock} in stock`}
                                    className="h-3.5 w-3.5 rounded-full border border-border shadow-sm"
                                    style={{ background: v.color_hex || "#e5e7eb" }}
                                  />
                                ))}
                                {r.is_preorder && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 text-[10px] font-medium">
                                    <Clock className="h-2.5 w-2.5" />Pre-order
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        </TableCell>
                        <TableCell>
                          <InlineTextEdit value={r.sku ?? ""} placeholder="SKU" onSave={(v) => updateInventoryField(r.id, { sku: v })} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-medium">
                          <span className="text-muted-foreground/60 mr-0.5">৳</span>{Number(r.price).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                          <span className="text-muted-foreground/50 mr-0.5">৳</span>{wac.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-foreground/80">{r.stock}</TableCell>
                        <TableCell className="text-right">
                          {reserved > 0 ? (
                            <span className="inline-flex items-center gap-1 tabular-nums text-sm text-amber-600 dark:text-amber-400 font-medium">
                              <Lock className="h-3 w-3" />{reserved}
                            </span>
                          ) : (
                            <span className="tabular-nums text-sm text-muted-foreground/50">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 tabular-nums text-base font-semibold tracking-tight",
                            isOut && "text-red-600 dark:text-red-400",
                            isLow && "text-amber-600 dark:text-amber-400",
                            !isOut && !isLow && "text-foreground",
                          )}>
                            <span className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              isOut ? "bg-red-500" : isLow ? "bg-amber-500" : "bg-emerald-500",
                            )} />
                            {available}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(r.incoming) > 0 ? (
                            <span className="inline-flex items-center gap-1 tabular-nums text-xs font-medium text-blue-600 dark:text-blue-400">
                              <ArrowUp className="h-3 w-3" />{r.incoming}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1.5 group/rp justify-end">
                            {needsReorder && (
                              <span title="Below reorder point" className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                            )}
                            <InlineNumberEdit value={reorderPoint} onSave={(v) => updateInventoryField(r.id, { reorder_point: v })} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusPill out={isOut} low={isLow} />
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-md opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => setAdjust({ product: r, mode: "in" })}>
                                <ArrowUp className="h-4 w-4 mr-2 text-emerald-600" />Stock In
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setAdjust({ product: r, mode: "out" })}>
                                <ArrowDown className="h-4 w-4 mr-2 text-red-600" />Stock Out
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setHistoryProduct(r)}>
                                <History className="h-4 w-4 mr-2" />View Movements
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setEditProduct(r)}>
                                <Edit3 className="h-4 w-4 mr-2 text-blue-600" />Edit Product
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setEditProduct(r)}>
                                <AlertCircle className="h-4 w-4 mr-2 text-amber-600" />Set Reorder Point
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={async () => {
                                  const next = !r.is_preorder;
                                  const { error } = await supabase
                                    .from("products")
                                    .update({ is_preorder: next })
                                    .eq("id", r.id);
                                  if (error) toast.error(error.message);
                                  else {
                                    toast.success(next ? "Pre-order enabled" : "Pre-order disabled");
                                    qc.invalidateQueries({ queryKey: ["inventory"] });
                                  }
                                }}
                              >
                                <Clock className="h-4 w-4 mr-2 text-violet-600" />
                                {r.is_preorder ? "Disable Pre-order" : "Enable Pre-order"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                      {hasVariants && isOpen && variants.map((v) => {
                        const vAvail = v.available_stock;
                        const vOut = v.stock <= 0;
                        return (
                          <TableRow key={`${r.id}__${v.id}`} className="bg-muted/20 border-l-2 border-l-indigo-300 dark:border-l-indigo-700 animate-fade-in">
                            <TableCell></TableCell>
                            <TableCell></TableCell>
                            <TableCell className="pl-12 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="text-indigo-500">↳</span>
                                {(v.color_hex || v.color_name) && (
                                  <span
                                    className="h-4 w-4 rounded-full border border-border shadow-sm shrink-0"
                                    style={{ background: v.color_hex || "#e5e7eb" }}
                                    title={v.color_name ?? ""}
                                  />
                                )}
                                <span className="font-medium">{v.color_name ?? v.sku ?? v.id.slice(0, 8)}</span>
                                {!v.is_active && <Badge variant="outline" className="h-4 px-1 text-[10px]">inactive</Badge>}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs font-mono text-muted-foreground">{v.sku}</TableCell>
                            <TableCell></TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">৳{Number(v.weighted_avg_cost).toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{v.stock}</TableCell>
                            <TableCell className={cn("text-right font-mono text-xs", v.reserved_stock > 0 ? "text-amber-600 font-semibold" : "text-muted-foreground")}>{v.reserved_stock}</TableCell>
                            <TableCell className={cn("text-right font-mono text-xs font-bold", vOut ? "text-red-600" : "text-emerald-600")}>{vAvail}</TableCell>
                            <TableCell></TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">RP: {v.reorder_point}</TableCell>
                            <TableCell><StatusPill out={vOut} low={!vOut && v.stock <= 5} /></TableCell>
                            <TableCell className="text-right">
                              <div className="inline-flex gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setAdjustVariant(v.id); setAdjust({ product: r, mode: "in" }); }}>
                                  <ArrowUp className="h-3.5 w-3.5 text-emerald-600" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setAdjustVariant(v.id); setAdjust({ product: r, mode: "out" }); }}>
                                  <ArrowDown className="h-3.5 w-3.5 text-red-600" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">Page {filter.page + 1} of {totalPages}</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={filter.page === 0} onClick={() => setFilter({ ...filter, page: filter.page - 1 })}>Prev</Button>
              <Button variant="outline" size="sm" disabled={filter.page + 1 >= totalPages} onClick={() => setFilter({ ...filter, page: filter.page + 1 })}>Next</Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="opening" className="space-y-3 mt-0">
          <OpeningStockTab brandId={activeBrand?.id ?? null} />
        </TabsContent>

        <TabsContent value="cost" className="space-y-3 mt-0">
          <CostPriceTab brandIds={brandIds} />
        </TabsContent>

        {/* LOW STOCK — card grid */}
        <TabsContent value="low" className="space-y-3 mt-0">
          {lowQuery.isLoading && (
            <div className="text-center py-12 text-muted-foreground">Loading…</div>
          )}
          {!lowQuery.isLoading && (lowQuery.data?.length ?? 0) === 0 && (
            <Card><CardContent className="py-16 text-center text-muted-foreground">
              <div className="text-4xl mb-2">🎉</div>
              <div className="font-medium">No low-stock alerts</div>
              <div className="text-xs mt-1">All products are healthy</div>
            </CardContent></Card>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {[...(lowQuery.data ?? [])]
              .sort((a, b) => {
                const ap = (a.products as unknown as { stock: number }).stock;
                const bp = (b.products as unknown as { stock: number }).stock;
                return ap - bp;
              })
              .map((a) => {
                const p = a.products as unknown as {
                  id: string; title: string; slug: string; image: string | null; stock: number;
                  low_stock_threshold: number | null; brand_id: string | null;
                };
                const critical = p.stock <= 0;
                return (
                  <Card key={a.id} className={cn(
                    "overflow-hidden border-l-4 transition-shadow hover:shadow-md",
                    critical ? "border-l-red-500" : "border-l-amber-500",
                  )}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        {p.image ? (
                          <img src={p.image} alt="" className="h-14 w-14 rounded-lg object-cover ring-1 ring-border" />
                        ) : (
                          <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center">
                            <Package className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate">{p.title}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            Alerted {new Date(a.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-end justify-between">
                        <div>
                          <div className={cn("text-3xl font-bold tabular-nums", critical ? "text-red-600" : "text-amber-600")}>{p.stock}</div>
                          <div className="text-[11px] text-muted-foreground">Threshold: {a.threshold}</div>
                        </div>
                        <Button size="sm" onClick={() => setAdjust({
                          product: { id: p.id, title: p.title, slug: p.slug, image: p.image, price: 0, stock: p.stock, low_stock_threshold: p.low_stock_threshold, is_active: true, brand_id: p.brand_id, category_id: null, updated_at: "" },
                          mode: "in",
                        })}>
                          <ArrowUp className="h-3.5 w-3.5 mr-1" />Quick Stock In
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </TabsContent>

        {/* MOVEMENTS */}
        <TabsContent value="movements" className="space-y-3 mt-0">
          <MovementsSummary movements={movements.data ?? []} />
          <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent border-b">
                  <TableHead className="font-semibold text-foreground/80">Date</TableHead>
                  <TableHead className="font-semibold text-foreground/80">Product</TableHead>
                  <TableHead className="font-semibold text-foreground/80">Variant</TableHead>
                  <TableHead className="font-semibold text-foreground/80">Source</TableHead>
                  <TableHead className="font-semibold text-foreground/80">Reason</TableHead>
                  <TableHead className="text-right font-semibold text-foreground/80">Delta</TableHead>
                  <TableHead className="text-right font-semibold text-foreground/80">Before → After</TableHead>
                  <TableHead className="text-right font-semibold text-foreground/80">Unit Cost</TableHead>
                  <TableHead className="text-right font-semibold text-foreground/80">Total Cost</TableHead>
                  <TableHead className="font-semibold text-foreground/80">Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.isLoading && (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                )}
                {!movements.isLoading && (movements.data?.length ?? 0) === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No movements yet</TableCell></TableRow>
                )}
                {(movements.data ?? []).map((m) => {
                  const t = titles.data?.get(m.product_id);
                  const reasonLabel = STOCK_REASONS.find((x) => x.value === m.reason)?.label ?? m.reason;
                  const src = sourceBadge(m.movement_source);
                  return (
                    <TableRow key={m.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(m.created_at).toLocaleString()}</TableCell>
                      <TableCell className="truncate max-w-[240px] text-sm">{t?.title ?? m.product_id.slice(0, 8)}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{m.variant_id ? m.variant_id.slice(0, 8) : "—"}</TableCell>
                      <TableCell><span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold", src.tone)}>{src.label}</span></TableCell>
                      <TableCell className="text-xs">{reasonLabel}</TableCell>
                      <TableCell className={cn("text-right font-mono font-semibold", m.delta < 0 ? "text-red-600" : "text-emerald-600")}>
                        {m.delta > 0 ? "+" : ""}{m.delta}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">{m.stock_before} → {m.stock_after}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{m.unit_cost_bdt ? `৳${Number(m.unit_cost_bdt).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{m.total_cost_bdt ? `৳${Number(m.total_cost_bdt).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">{m.note ?? ""}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <StockAdjustDialog
        product={adjust?.product ?? null}
        mode={adjust?.mode ?? "in"}
        initialVariantId={adjustVariant}
        onClose={() => { setAdjust(null); setAdjustVariant(null); qc.invalidateQueries({ queryKey: ["inventory"] }); }}
      />

      <ProductHistorySheet product={historyProduct} onClose={() => setHistoryProduct(null)} brandId={activeBrand?.id ?? null} />

      <ProductEditDialog
        product={editProduct}
        onClose={() => { setEditProduct(null); qc.invalidateQueries({ queryKey: ["inventory"] }); }}
      />

      <ProductAddDialog open={addOpen} onClose={() => setAddOpen(false)} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} product{selected.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Products gulo deactivate kora hobe — storefront e ar dekha jabe na, kintu data + stock history thakbe.
              Toast e "Undo" button paben 8 second er moddhe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-40 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs space-y-1">
            {selectedRows.slice(0, 8).map((r) => (
              <div key={r.id} className="truncate">• {r.title}</div>
            ))}
            {selectedRows.length > 8 && (
              <div className="text-muted-foreground">+{selectedRows.length - 8} more…</div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDelete.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkDelete.isPending}
              onClick={(e) => { e.preventDefault(); bulkDelete.mutate(Array.from(selected)); }}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {bulkDelete.isPending ? "Deleting…" : `Delete ${selected.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}

/* ─────────────── components ─────────────── */

function PillTab({ value, icon, badge, children }: { value: string; icon: React.ReactNode; badge?: number; children: React.ReactNode }) {
  return (
    <TabsTrigger
      value={value}
      className="relative gap-1.5 rounded-none bg-transparent px-0 pb-3 pt-1 text-sm font-medium text-muted-foreground shadow-none border-b-2 border-transparent data-[state=active]:text-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-colors hover:text-foreground"
    >
      {icon}{children}
      {badge ? (
        <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 min-w-[18px] h-[18px] text-[10px] font-semibold">
          {badge}
        </span>
      ) : null}
    </TabsTrigger>
  );
}

type KpiAccent = "blue" | "purple" | "green" | "red";
const ACCENT_STYLES: Record<KpiAccent, { dot: string; icon: string }> = {
  blue:   { dot: "bg-blue-500",    icon: "text-blue-600 dark:text-blue-400" },
  purple: { dot: "bg-purple-500",  icon: "text-purple-600 dark:text-purple-400" },
  green:  { dot: "bg-emerald-500", icon: "text-emerald-600 dark:text-emerald-400" },
  red:    { dot: "bg-red-500",     icon: "text-red-600 dark:text-red-400" },
};

function KpiCard({ icon, label, value, hint, accent, emphasize }: {
  icon: React.ReactNode; label: string; value: string; hint?: string; accent: KpiAccent; emphasize?: boolean;
}) {
  const s = ACCENT_STYLES[accent];
  return (
    <div className="group bg-card transition-colors hover:bg-muted/30 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.14em]">{label}</div>
          </div>
        </div>
        <div className={cn("opacity-60 group-hover:opacity-100 transition-opacity", s.icon)}>
          {icon}
        </div>
      </div>
      <div className={cn(
        "mt-3 text-[32px] leading-none font-semibold tabular-nums tracking-tight",
        emphasize && accent === "red" && "text-red-600 dark:text-red-400",
      )}>
        {value}
      </div>
      {hint && <div className="mt-2 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function StatusPill({ out, low }: { out: boolean; low: boolean }) {
  if (out) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 text-red-700 dark:text-red-300 px-2 py-0.5 text-[11px] font-medium">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />Out of stock
      </span>
    );
  }
  if (low) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[11px] font-medium">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Low stock
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-medium">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />In stock
    </span>
  );
}

function MovementsSummary({ movements }: { movements: Array<{ delta: number; created_at: string }> }) {
  const { totalIn, totalOut, bars } = useMemo(() => {
    let inSum = 0, outSum = 0;
    const buckets = new Map<string, { in: number; out: number }>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      buckets.set(d.toISOString().slice(0, 10), { in: 0, out: 0 });
    }
    for (const m of movements) {
      if (m.delta > 0) inSum += m.delta; else outSum += Math.abs(m.delta);
      const key = new Date(m.created_at).toISOString().slice(0, 10);
      const b = buckets.get(key);
      if (b) {
        if (m.delta > 0) b.in += m.delta; else b.out += Math.abs(m.delta);
      }
    }
    const bars = Array.from(buckets.entries()).map(([k, v]) => ({ k, ...v }));
    return { totalIn: inSum, totalOut: outSum, bars };
  }, [movements]);

  const max = Math.max(1, ...bars.flatMap((b) => [b.in, b.out]));

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total In (500 latest)</div>
              <div className="text-xl font-bold text-emerald-600 tabular-nums inline-flex items-center gap-1">
                <TrendingUp className="h-4 w-4" />+{totalIn.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Out</div>
              <div className="text-xl font-bold text-red-600 tabular-nums inline-flex items-center gap-1">
                <TrendingDown className="h-4 w-4" />-{totalOut.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Net</div>
              <div className="text-xl font-bold tabular-nums">{(totalIn - totalOut).toLocaleString()}</div>
            </div>
          </div>
          <div className="flex items-end gap-1 h-12">
            {bars.map((b) => (
              <div key={b.k} className="flex flex-col items-center gap-0.5" title={`${b.k}: +${b.in} / -${b.out}`}>
                <div className="flex items-end gap-px h-10">
                  <div className="w-2 bg-emerald-500/80 rounded-sm" style={{ height: `${(b.in / max) * 100}%` }} />
                  <div className="w-2 bg-red-500/80 rounded-sm" style={{ height: `${(b.out / max) * 100}%` }} />
                </div>
                <div className="text-[9px] text-muted-foreground">{b.k.slice(5)}</div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductHistorySheet({ product, onClose, brandId }: { product: ProductRow | null; onClose: () => void; brandId: string | null }) {
  const brandIds = brandId ? [brandId] : [];
  const { data, isLoading } = useStockMovements(brandIds, product?.id);
  return (
    <Sheet open={!!product} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="truncate">History — {product?.title}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2">
          {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!isLoading && (data?.length ?? 0) === 0 && <div className="text-sm text-muted-foreground">No movements recorded.</div>}
          {(data ?? []).map((m) => {
            const reasonLabel = STOCK_REASONS.find((x) => x.value === m.reason)?.label ?? m.reason;
            return (
              <div key={m.id} className="border rounded-md p-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{reasonLabel}</span>
                  <span className={cn("font-mono", m.delta < 0 ? "text-red-600" : "text-emerald-600")}>
                    {m.delta > 0 ? "+" : ""}{m.delta}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground flex justify-between mt-1">
                  <span>{new Date(m.created_at).toLocaleString()}</span>
                  <span className="font-mono">{m.stock_before} → {m.stock_after}</span>
                </div>
                {m.note && <div className="text-xs mt-1">{m.note}</div>}
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

async function updateInventoryField(
  productId: string,
  fields: { low_stock_threshold?: number; reorder_point?: number; cost_price?: number; sku?: string; barcode?: string },
) {
  const { error } = await supabase.rpc("update_product_inventory_fields", {
    _product_id: productId,
    _low_stock_threshold: fields.low_stock_threshold ?? undefined,
    _reorder_point: fields.reorder_point ?? undefined,
    _cost_price: fields.cost_price ?? undefined,
    _sku: fields.sku ?? undefined,
    _barcode: fields.barcode ?? undefined,
  });
  if (error) throw error;
}

function InlineTextEdit({ value, placeholder, onSave }: { value: string; placeholder?: string; onSave: (v: string) => Promise<void> }) {
  const qc = useQueryClient();
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const [saving, setSaving] = useState(false);
  const commit = async () => {
    if (v === value) return;
    setSaving(true);
    try { await onSave(v); qc.invalidateQueries({ queryKey: ["inventory"] }); toast.success("Saved"); }
    catch (e) { toast.error((e as Error).message); setV(value); }
    finally { setSaving(false); }
  };
  return (
    <Input
      value={v}
      placeholder={placeholder}
      disabled={saving}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="h-7 text-xs w-28"
    />
  );
}

function InlineNumberEdit({ value, prefix, onSave }: { value: number; prefix?: string; onSave: (v: number) => Promise<void> }) {
  const qc = useQueryClient();
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const [saving, setSaving] = useState(false);
  const commit = async () => {
    const n = Number(v);
    if (!Number.isFinite(n) || n === value) { setV(String(value)); return; }
    setSaving(true);
    try { await onSave(n); qc.invalidateQueries({ queryKey: ["inventory"] }); toast.success("Saved"); }
    catch (e) { toast.error((e as Error).message); setV(String(value)); }
    finally { setSaving(false); }
  };
  return (
    <div className="inline-flex items-center gap-1">
      {prefix ? <span className="text-xs text-muted-foreground">{prefix}</span> : null}
      <Input
        type="number"
        value={v}
        disabled={saving}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="h-7 text-xs w-16 text-right"
      />
    </div>
  );
}

function OpeningStockTab({ brandId }: { brandId: string | null }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const brandIds = brandId ? [brandId] : [];
  const { data, isLoading } = useInventoryQuery({
    ...DEFAULT_INVENTORY_FILTER, brandIds, search, page: 0, pageSize: 200,
  });
  const rows = data?.rows ?? [];
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [costs, setCosts] = useState<Record<string, string>>({});

  const apply = useMutation({
    mutationFn: async (entries: { id: string; qty: number; cost?: number }[]) => {
      for (const e of entries) {
        const { error } = await supabase.rpc("set_product_stock", {
          _product_id: e.id, _new_qty: e.qty, _reason: "opening_stock", _note: "Initial opening stock",
        });
        if (error) throw error;
        if (e.cost != null && Number.isFinite(e.cost)) {
          await supabase.rpc("update_product_inventory_fields", {
            _product_id: e.id, _cost_price: e.cost,
          });
        }
      }
    },
    onSuccess: (_d, vars) => {
      toast.success(`Opening stock applied to ${vars.length} product${vars.length === 1 ? "" : "s"}`);
      setCounts({}); setCosts({});
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      qc.invalidateQueries({ queryKey: ["low-stock"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = useMemo(() => {
    const list: { id: string; qty: number; cost?: number; title: string; currentStock: number }[] = [];
    for (const r of rows) {
      const raw = counts[r.id];
      if (raw == null || raw === "") continue;
      const qty = Number(raw);
      if (!Number.isFinite(qty) || qty < 0) continue;
      if (qty === r.stock) continue;
      const costRaw = costs[r.id];
      const cost = costRaw ? Number(costRaw) : undefined;
      list.push({ id: r.id, qty, cost, title: r.title, currentStock: r.stock });
    }
    return list;
  }, [counts, costs, rows]);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 text-sm space-y-1">
          <div className="font-medium">Opening Stock setup</div>
          <p className="text-muted-foreground text-xs">
            Protita product er ajker physical count likho. System current stock theke delta calculate kore stock_movements e <span className="font-medium">opening_stock</span> hisebe log korbe. Cost price (per unit) optional — diley stock valuation accurate hobe.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search title, SKU, barcode…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{pending.length} pending</span>
          <Button disabled={!pending.length || apply.isPending} onClick={() => apply.mutate(pending)}>
            <Check className="h-4 w-4 mr-1" />
            {apply.isPending ? "Applying…" : `Apply ${pending.length || ""}`.trim()}
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right w-[140px]">Physical count</TableHead>
              <TableHead className="text-right w-[140px]">Cost (optional)</TableHead>
              <TableHead className="text-right">Delta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No products</TableCell></TableRow>
            )}
            {rows.map((r) => {
              const raw = counts[r.id] ?? "";
              const qty = raw === "" ? null : Number(raw);
              const delta = qty != null && Number.isFinite(qty) ? qty - r.stock : null;
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {r.image && <img src={r.image} alt="" className="h-8 w-8 rounded object-cover" />}
                      <div className="min-w-0">
                        <div className="font-medium truncate max-w-[280px]">{r.title}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{r.sku ? `SKU: ${r.sku}` : r.slug}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">{r.stock}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number" min={0} placeholder="—"
                      value={raw}
                      onChange={(e) => setCounts((c) => ({ ...c, [r.id]: e.target.value }))}
                      className="h-8 text-right text-sm w-[120px] ml-auto"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number" min={0} placeholder={r.cost_price ? `৳${r.cost_price}` : "—"}
                      value={costs[r.id] ?? ""}
                      onChange={(e) => setCosts((c) => ({ ...c, [r.id]: e.target.value }))}
                      className="h-8 text-right text-sm w-[120px] ml-auto"
                    />
                  </TableCell>
                  <TableCell className={cn(
                    "text-right font-mono",
                    delta == null && "text-muted-foreground",
                    delta != null && delta < 0 && "text-red-600",
                    delta != null && delta > 0 && "text-emerald-600",
                  )}>
                    {delta == null ? "—" : delta > 0 ? `+${delta}` : delta}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CostPriceTab({ brandIds }: { brandIds: string[] }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const { data, isLoading } = useInventoryQuery({
    ...DEFAULT_INVENTORY_FILTER, brandIds, search, page: 0, pageSize: 500,
  });
  const allRows = data?.rows ?? [];
  const rows = useMemo(
    () => showAll
      ? allRows
      : allRows.filter((r) => !r.cost_price || Number(r.cost_price) === 0),
    [allRows, showAll],
  );
  const missingCount = allRows.filter((r) => !r.cost_price || Number(r.cost_price) === 0).length;
  const [costs, setCosts] = useState<Record<string, string>>({});

  const apply = useMutation({
    mutationFn: async (entries: { id: string; cost: number }[]) => {
      for (const e of entries) {
        const { error } = await supabase.rpc("update_product_inventory_fields", {
          _product_id: e.id, _cost_price: e.cost,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      toast.success(`Cost updated for ${vars.length} product${vars.length === 1 ? "" : "s"}`);
      setCosts({});
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = useMemo(() => {
    const list: { id: string; cost: number; title: string }[] = [];
    for (const r of rows) {
      const raw = costs[r.id];
      if (raw == null || raw === "") continue;
      const cost = Number(raw);
      if (!Number.isFinite(cost) || cost < 0) continue;
      if (cost === Number(r.cost_price ?? 0)) continue;
      list.push({ id: r.id, cost, title: r.title });
    }
    return list;
  }, [costs, rows]);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 text-sm space-y-1">
          <div className="font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-600" /> Cost Price setup
          </div>
          <p className="text-muted-foreground text-xs">
            Je products import theke asheni ba manually cost add korte chao — protita product er unit cost likho.
            Cost price product-profitability & P&L reports e COGS calculate korte use hoy.
            <span className="font-medium"> {missingCount}</span> product er ekhono cost missing.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search title, SKU, barcode…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <Checkbox checked={showAll} onCheckedChange={(v) => setShowAll(!!v)} />
            Show all (including ones with cost)
          </label>
          <span className="text-xs text-muted-foreground">{pending.length} pending</span>
          <Button disabled={!pending.length || apply.isPending} onClick={() => apply.mutate(pending)}>
            <Check className="h-4 w-4 mr-1" />
            {apply.isPending ? "Saving…" : `Save ${pending.length || ""}`.trim()}
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Sell price</TableHead>
              <TableHead className="text-right">Current cost</TableHead>
              <TableHead className="text-right w-[160px]">New cost (BDT)</TableHead>
              <TableHead className="text-right">Margin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                {showAll ? "No products" : "🎉 All products have a cost price set"}
              </TableCell></TableRow>
            )}
            {rows.map((r) => {
              const raw = costs[r.id] ?? "";
              const newCost = raw === "" ? Number(r.cost_price ?? 0) : Number(raw);
              const price = Number(r.price ?? 0);
              const marginPct = price > 0 && newCost > 0 ? ((price - newCost) / price) * 100 : null;
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {r.image && <img src={r.image} alt="" className="h-8 w-8 rounded object-cover" />}
                      <div className="min-w-0">
                        <div className="font-medium truncate max-w-[300px]">{r.title}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{r.sku ? `SKU: ${r.sku}` : r.slug}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">{r.stock}</TableCell>
                  <TableCell className="text-right font-mono">৳{price}</TableCell>
                  <TableCell className="text-right font-mono">
                    {r.cost_price ? `৳${r.cost_price}` : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number" min={0} placeholder={r.cost_price ? `৳${r.cost_price}` : "—"}
                      value={raw}
                      onChange={(e) => setCosts((c) => ({ ...c, [r.id]: e.target.value }))}
                      className="h-8 text-right text-sm w-[140px] ml-auto"
                    />
                  </TableCell>
                  <TableCell className={cn(
                    "text-right font-mono text-xs",
                    marginPct == null && "text-muted-foreground",
                    marginPct != null && marginPct < 0 && "text-red-600",
                    marginPct != null && marginPct >= 30 && "text-emerald-600",
                  )}>
                    {marginPct == null ? "—" : `${marginPct.toFixed(0)}%`}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
