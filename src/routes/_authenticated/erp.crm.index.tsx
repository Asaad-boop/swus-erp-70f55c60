import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Download, Search, Tag as TagIcon, Upload, Users, Filter, X, Phone, MessageSquare,
  ShoppingBag, ShieldCheck, Trash2, Rows3, Rows2, CheckCircle2, AlertCircle, Users2, Megaphone,
  ChevronDown, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { CrmKpiCards } from "@/components/erp/crm/kpi-cards";
import { CrmImportDialog } from "@/components/erp/crm/import-dialog";
import { FindDuplicatesSheet } from "@/components/erp/crm/find-duplicates-sheet";
import { SavedFiltersMenu } from "@/components/erp/crm/saved-filters";
import {
  RecalculateRfmButton, OverdueTasksCard, PushToMetaDialog,
} from "@/components/erp/crm/dashboard-extras";
import { useCurrentRole } from "@/hooks/use-current-role";
import { SEGMENT_LABELS, SEGMENT_TONES } from "@/lib/erp/crm/segments";
import {
  listCrmCustomers, exportCrmCustomersCsv, listCrmTags,
  bulkAddCrmTag, bulkRemoveCrmTag, bulkSetCrmStatus, bulkDeleteCrmCustomers,
  getCrmCustomerOrdersPreview,
} from "@/lib/erp/crm/crm.functions";
import type { CrmFilters, CrmSort, CrmSegment } from "@/lib/erp/crm/types";

export const Route = createFileRoute("/_authenticated/erp/crm/")({
  head: () => ({ meta: [{ title: "Customers — CRM" }] }),
  component: CrmListPage,
});

const PAGE_SIZE = 50;

function fmtBdt(n: number) {
  return `৳${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(n)}`;
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function daysSince(s: string | null): number | null {
  if (!s) return null;
  return Math.floor((Date.now() - new Date(s).getTime()) / 86400000);
}
function waUrl(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) return `https://wa.me/880${d.slice(1)}`;
  if (d.length === 10) return `https://wa.me/880${d}`;
  return `https://wa.me/${d}`;
}
function downloadCsv(csv: string, name: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

const STATUSES: { value: "active" | "vip" | "at_risk" | "lost" | "blocked"; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "vip", label: "VIP" },
  { value: "at_risk", label: "At risk" },
  { value: "lost", label: "Lost" },
  { value: "blocked", label: "Blocked" },
];

function CrmListPage() {
  const { brandIds, isAllBrands, brands, activeBrand } = useBrand();
  const { isAdmin } = useCurrentRole();
  const qc = useQueryClient();
  const listFn = useServerFn(listCrmCustomers);
  const exportFn = useServerFn(exportCrmCustomersCsv);
  const tagsFn = useServerFn(listCrmTags);
  const bulkTagFn = useServerFn(bulkAddCrmTag);
  const bulkRemoveTagFn = useServerFn(bulkRemoveCrmTag);
  const bulkSetStatusFn = useServerFn(bulkSetCrmStatus);
  const bulkDeleteFn = useServerFn(bulkDeleteCrmCustomers);

  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | "registered" | "guest">("all");
  const [segment, setSegment] = useState<CrmSegment | "all">("all");
  const [tag, setTag] = useState<string>("all");
  const [sort, setSort] = useState<CrmSort>("ltv_desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkTagValue, setBulkTagValue] = useState("");
  const [bulkRemoveTagOpen, setBulkRemoveTagOpen] = useState(false);
  const [bulkRemoveTagValue, setBulkRemoveTagValue] = useState("");
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [dense, setDense] = useState(true);
  const [dupesOpen, setDupesOpen] = useState(false);
  const [metaPushOpen, setMetaPushOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const previewFn = useServerFn(getCrmCustomerOrdersPreview);
  const searchActive = search.trim().length > 0;
  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  // Advanced filters
  const [advBrandIds, setAdvBrandIds] = useState<string[]>([]);
  const [minSpend, setMinSpend] = useState("");
  const [maxSpend, setMaxSpend] = useState("");
  const [lastOrderFrom, setLastOrderFrom] = useState("");
  const [lastOrderTo, setLastOrderTo] = useState("");
  const [hasEmail, setHasEmail] = useState<"any" | "yes" | "no">("any");

  const brandNameById = useMemo(() => new Map(brands.map((b) => [b.id, b.name] as const)), [brands]);

  const effectiveBrandIds = advBrandIds.length
    ? advBrandIds
    : (isAllBrands ? undefined : brandIds);

  const filters: CrmFilters = {
    search: search.trim() || undefined,
    brandIds: effectiveBrandIds,
    type,
    segment,
    tag: tag === "all" ? undefined : tag,
    minSpend: minSpend.trim() ? Number(minSpend) : undefined,
    maxSpend: maxSpend.trim() ? Number(maxSpend) : undefined,
    lastOrderFrom: lastOrderFrom || undefined,
    lastOrderTo: lastOrderTo || undefined,
    hasEmail: hasEmail === "any" ? undefined : hasEmail === "yes",
  };

  const advFilterCount =
    (advBrandIds.length ? 1 : 0) +
    (minSpend.trim() ? 1 : 0) +
    (maxSpend.trim() ? 1 : 0) +
    (lastOrderFrom ? 1 : 0) +
    (lastOrderTo ? 1 : 0) +
    (hasEmail !== "any" ? 1 : 0);

  const resetAdvanced = () => {
    setAdvBrandIds([]);
    setMinSpend(""); setMaxSpend("");
    setLastOrderFrom(""); setLastOrderTo("");
    setHasEmail("any");
    setPage(1);
  };

  // ----- Saved filters apply/snapshot -----
  const filterSnapshot = {
    search, type, segment, tag, sort,
    advBrandIds, minSpend, maxSpend, lastOrderFrom, lastOrderTo, hasEmail,
  };
  const applySavedFilter = (f: Record<string, any>) => {
    if (typeof f.search === "string") setSearch(f.search);
    if (f.type) setType(f.type);
    if (f.segment) setSegment(f.segment);
    if (f.tag) setTag(f.tag);
    if (f.sort) setSort(f.sort);
    setAdvBrandIds(Array.isArray(f.advBrandIds) ? f.advBrandIds : []);
    setMinSpend(f.minSpend ?? "");
    setMaxSpend(f.maxSpend ?? "");
    setLastOrderFrom(f.lastOrderFrom ?? "");
    setLastOrderTo(f.lastOrderTo ?? "");
    setHasEmail(f.hasEmail ?? "any");
    setPage(1);
    toast.success("Filter applied");
  };

  const queryKey = ["crm-list", filters, sort, page] as const;
  const { data, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: () => listFn({ data: { filters, sort, page, pageSize: PAGE_SIZE } }),
    staleTime: 30_000,
  });

  const { data: allTags = [] } = useQuery({
    queryKey: ["crm-tags"],
    queryFn: () => tagsFn(),
    staleTime: 60_000,
  });

  const exportMut = useMutation({
    mutationFn: () => exportFn({ data: { filters, sort } }),
    onSuccess: (res) => {
      downloadCsv(res.csv, `crm-customers-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(`Exported ${res.count} customers`);
    },
    onError: (e: any) => toast.error(e.message ?? "Export failed"),
  });

  const bulkTagMut = useMutation({
    mutationFn: () => bulkTagFn({ data: { customerKeys: Array.from(selected), tag: bulkTagValue.trim() } }),
    onSuccess: () => {
      toast.success(`Tag added to ${selected.size} customers`);
      setBulkTagOpen(false);
      setBulkTagValue("");
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["crm-list"] });
      qc.invalidateQueries({ queryKey: ["crm-tags"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const bulkRemoveTagMut = useMutation({
    mutationFn: () => bulkRemoveTagFn({ data: { customerKeys: Array.from(selected), tag: bulkRemoveTagValue.trim() } }),
    onSuccess: () => {
      toast.success(`Tag removed from ${selected.size} customers`);
      setBulkRemoveTagOpen(false);
      setBulkRemoveTagValue("");
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["crm-list"] });
      qc.invalidateQueries({ queryKey: ["crm-tags"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const bulkStatusMut = useMutation({
    mutationFn: (status: (typeof STATUSES)[number]["value"]) =>
      bulkSetStatusFn({ data: { customerKeys: Array.from(selected), status } }),
    onSuccess: (_r, status) => {
      toast.success(`Set ${selected.size} customers as ${status}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["crm-list"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: () => bulkDeleteFn({ data: { customerKeys: Array.from(selected) } }),
    onSuccess: (r) => {
      toast.success(`Cleared CRM data for ${r.count} customers`);
      setBulkDeleteOpen(false);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["crm-list"] });
      qc.invalidateQueries({ queryKey: ["crm-tags"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const exportSelected = () => {
    const keys = new Set(selected);
    const visible = (data?.rows ?? []).filter((r) => keys.has(r.customer_key));
    if (!visible.length) {
      toast.error("Selected rows current page e nai — Export CSV use korun");
      return;
    }
    const headers = ["Phone","Name","Email","Type","Segment","Orders","LTV","AOV","First order","Last order","Days since","Tags"];
    const esc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    visible.forEach((r) => {
      lines.push([
        r.customer_key, r.name ?? "", r.email ?? "",
        r.is_registered ? "Registered" : "Guest",
        r.segment, r.orders_count, r.lifetime_value.toFixed(2), r.avg_order_value.toFixed(2),
        r.first_order_at ?? "", r.last_order_at ?? "", daysSince(r.last_order_at) ?? "",
        r.tags.join("; "),
      ].map(esc).join(","));
    });
    downloadCsv(lines.join("\n"), `crm-selected-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(`Exported ${visible.length} selected`);
  };

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.customer_key));
  const toggleAllOnPage = () => {
    const next = new Set(selected);
    if (allOnPageSelected) rows.forEach((r) => next.delete(r.customer_key));
    else rows.forEach((r) => next.add(r.customer_key));
    setSelected(next);
  };
  const toggleRow = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };
  const toggleAdvBrand = (id: string) => {
    setAdvBrandIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    setPage(1);
  };

  const cellPad = dense ? "py-1.5" : "py-3";

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-primary shrink-0" />
            <span className="truncate">Customers</span>
          </h1>
          <p className="text-sm text-muted-foreground truncate">
            {isAllBrands ? "All brands" : brands.find((b) => brandIds[0] === b.id)?.name ?? "—"} · {total.toLocaleString()} customers
            {selected.size > 0 ? ` · ${selected.size} selected` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDense((d) => !d)}
            title={dense ? "Cozy density" : "Compact density"}
          >
            {dense ? <Rows2 className="h-4 w-4" /> : <Rows3 className="h-4 w-4" />}
          </Button>
          {isAdmin && <RecalculateRfmButton />}
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setDupesOpen(true)}>
              <Users2 className="h-4 w-4 mr-1.5" />
              Duplicates
            </Button>
          )}
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setMetaPushOpen(true)} disabled={isAllBrands}>
              <Megaphone className="h-4 w-4 mr-1.5" />
              Meta Audience
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1.5" />
            Import
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportMut.mutate()} disabled={exportMut.isPending}>
            <Download className="h-4 w-4 mr-1.5" />
            {exportMut.isPending ? "Exporting…" : "Export CSV"}
          </Button>
        </div>
      </div>

      <CrmKpiCards kpis={data?.kpis} loading={isLoading} />

      <OverdueTasksCard brandId={activeBrand?.id} />

      {/* Filters */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, phone, email…"
              className="pl-8"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select value={type} onValueChange={(v: any) => { setType(v); setPage(1); }}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="registered">Registered</SelectItem>
              <SelectItem value="guest">Guest</SelectItem>
            </SelectContent>
          </Select>
          <Select value={segment} onValueChange={(v: any) => { setSegment(v); setPage(1); }}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All segments</SelectItem>
              {(Object.keys(SEGMENT_LABELS) as CrmSegment[]).map((s) => (
                <SelectItem key={s} value={s}>{SEGMENT_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tag} onValueChange={(v) => { setTag(v); setPage(1); }}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Tag" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v: any) => setSort(v)}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ltv_desc">Top LTV</SelectItem>
              <SelectItem value="ltv_asc">Lowest LTV</SelectItem>
              <SelectItem value="orders_desc">Most orders</SelectItem>
              <SelectItem value="orders_asc">Fewest orders</SelectItem>
              <SelectItem value="last_order_desc">Recent order</SelectItem>
              <SelectItem value="last_order_asc">Oldest order</SelectItem>
              <SelectItem value="first_order_desc">Newest customer</SelectItem>
            </SelectContent>
          </Select>

          <SavedFiltersMenu
            brandId={activeBrand?.id}
            currentFilters={filterSnapshot}
            onApply={applySavedFilter}
          />

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Filter className="h-4 w-4" />
                Advanced
                {advFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{advFilterCount}</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[360px] p-4 space-y-3" align="end">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Advanced filters</div>
                {advFilterCount > 0 && (
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={resetAdvanced}>Reset</Button>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Brands</Label>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-auto p-1 rounded-md border">
                  {brands.map((b) => {
                    const on = advBrandIds.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => toggleAdvBrand(b.id)}
                        className={`text-[11px] px-2 py-0.5 rounded-md border transition-colors ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"}`}
                      >
                        {b.name}
                      </button>
                    );
                  })}
                </div>
                {advBrandIds.length === 0 && (
                  <p className="text-[10px] text-muted-foreground">Empty = use top brand switcher</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Min spend (৳)</Label>
                  <Input type="number" inputMode="numeric" value={minSpend}
                    onChange={(e) => { setMinSpend(e.target.value); setPage(1); }} className="h-9" placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Max spend (৳)</Label>
                  <Input type="number" inputMode="numeric" value={maxSpend}
                    onChange={(e) => { setMaxSpend(e.target.value); setPage(1); }} className="h-9" placeholder="∞" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Last order from</Label>
                  <Input type="date" value={lastOrderFrom}
                    onChange={(e) => { setLastOrderFrom(e.target.value); setPage(1); }} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Last order to</Label>
                  <Input type="date" value={lastOrderTo}
                    onChange={(e) => { setLastOrderTo(e.target.value); setPage(1); }} className="h-9" />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Has email</Label>
                <Select value={hasEmail} onValueChange={(v: any) => { setHasEmail(v); setPage(1); }}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="yes">With email</SelectItem>
                    <SelectItem value="no">Without email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </PopoverContent>
          </Popover>

          {selected.size > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="secondary" className="gap-1.5">
                  <TagIcon className="h-4 w-4" />
                  Actions ({selected.size})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Bulk actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setBulkTagOpen(true)}>
                  <TagIcon className="h-4 w-4 mr-2" /> Add tag…
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setBulkRemoveTagOpen(true)}>
                  <X className="h-4 w-4 mr-2" /> Remove tag…
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <ShieldCheck className="h-4 w-4 mr-2" /> Set status
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {STATUSES.map((s) => (
                      <DropdownMenuItem key={s.value} onClick={() => bulkStatusMut.mutate(s.value)}>
                        {s.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem onClick={exportSelected}>
                  <Download className="h-4 w-4 mr-2" /> Export selected (page)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Clear CRM data…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSelected(new Set())}>
                  <X className="h-4 w-4 mr-2" /> Clear selection
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto max-h-[calc(100vh-380px)] min-h-[320px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--border)]">
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allOnPageSelected} onCheckedChange={toggleAllOnPage} />
                </TableHead>
                <TableHead className="w-8" />
                <TableHead className="min-w-[220px]">Customer</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Segment</TableHead>
                <TableHead className="min-w-[140px]">Brands</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">LTV</TableHead>
                <TableHead className="text-right">AOV</TableHead>
                <TableHead>First order</TableHead>
                <TableHead>Last order</TableHead>
                <TableHead className="text-right">Days since</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="min-w-[140px]">Tags</TableHead>
                <TableHead className="text-right pr-3 w-[140px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={15} className="text-center py-10 text-muted-foreground">Loading customers…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={15} className="text-center py-10 text-muted-foreground">No customers found</TableCell></TableRow>
              ) : rows.map((r) => {
                const dsl = daysSince(r.last_order_at);
                const isOpen = searchActive || expanded.has(r.customer_key);
                return (
                  <Fragment key={r.customer_key}>
                  <TableRow key={r.customer_key} className={`group hover:bg-accent/30 ${selected.has(r.customer_key) ? "bg-primary/5" : ""}`}>
                    <TableCell className={cellPad}>
                      <Checkbox checked={selected.has(r.customer_key)} onCheckedChange={() => toggleRow(r.customer_key)} />
                    </TableCell>
                    <TableCell className={cellPad}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => toggleExpand(r.customer_key)}
                        title={isOpen ? "Hide orders" : "Show orders"}
                      >
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </Button>
                    </TableCell>
                    <TableCell className={cellPad}>
                      <Link
                        to="/erp/crm/$customerId"
                        params={{ customerId: r.customer_key }}
                        className="block"
                      >
                        <div className="font-medium hover:text-primary">{r.name || "Unnamed"}</div>
                        <div className="text-xs text-muted-foreground font-mono">{r.customer_key}</div>
                      </Link>
                    </TableCell>
                    <TableCell className={cellPad}>
                      <Badge variant={r.is_registered ? "default" : "secondary"} className="text-[10px]">
                        {r.is_registered ? "Registered" : "Guest"}
                      </Badge>
                    </TableCell>
                    <TableCell className={cellPad}>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium ${SEGMENT_TONES[r.segment]}`}>
                        {SEGMENT_LABELS[r.segment]}
                      </span>
                    </TableCell>
                    <TableCell className={cellPad}>
                      <div className="flex flex-wrap gap-1 max-w-[160px]">
                        {(r.brand_ids ?? []).slice(0, 3).map((bid) => (
                          <Badge key={bid} variant="outline" className="text-[10px]">
                            {brandNameById.get(bid) ?? "—"}
                          </Badge>
                        ))}
                        {(r.brand_ids?.length ?? 0) > 3 && (
                          <Badge variant="outline" className="text-[10px]">+{(r.brand_ids?.length ?? 0) - 3}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${cellPad}`}>{r.orders_count}</TableCell>
                    <TableCell className={`text-right tabular-nums font-semibold ${cellPad}`}>{fmtBdt(r.lifetime_value)}</TableCell>
                    <TableCell className={`text-right tabular-nums text-muted-foreground ${cellPad}`}>{fmtBdt(r.avg_order_value)}</TableCell>
                    <TableCell className={`text-muted-foreground text-sm ${cellPad}`}>{fmtDate(r.first_order_at)}</TableCell>
                    <TableCell className={`text-muted-foreground text-sm ${cellPad}`}>{fmtDate(r.last_order_at)}</TableCell>
                    <TableCell className={`text-right tabular-nums text-sm ${cellPad}`}>
                      {dsl == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={dsl > 120 ? "text-red-600 font-medium" : dsl > 60 ? "text-orange-600" : "text-muted-foreground"}>
                          {dsl}d
                        </span>
                      )}
                    </TableCell>
                    <TableCell className={cellPad}>
                      {r.email ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700" title={r.email}>
                          <CheckCircle2 className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-[140px]">{r.email}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <AlertCircle className="h-3 w-3" /> none
                        </span>
                      )}
                    </TableCell>
                    <TableCell className={cellPad}>
                      <div className="flex flex-wrap gap-1 max-w-[140px]">
                        {r.tags.slice(0, 2).map((t) => (
                          <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                        ))}
                        {r.tags.length > 2 && <Badge variant="secondary" className="text-[10px]">+{r.tags.length - 2}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className={`text-right pr-3 ${cellPad}`}>
                      <div className="inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <Button asChild variant="ghost" size="icon" className="h-7 w-7" title="Call">
                          <a href={`tel:${r.customer_key}`} onClick={(e) => e.stopPropagation()}><Phone className="h-3.5 w-3.5" /></a>
                        </Button>
                        <Button asChild variant="ghost" size="icon" className="h-7 w-7" title="SMS">
                          <a href={`sms:${r.customer_key}`} onClick={(e) => e.stopPropagation()}><MessageSquare className="h-3.5 w-3.5" /></a>
                        </Button>
                        <Button asChild variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" title="WhatsApp">
                          <a href={waUrl(r.customer_key)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current"><path d="M20.52 3.48A11.94 11.94 0 0 0 12.04 0C5.5 0 .2 5.3.2 11.84c0 2.09.55 4.13 1.59 5.93L0 24l6.4-1.68a11.83 11.83 0 0 0 5.64 1.43h.01c6.54 0 11.84-5.3 11.84-11.84 0-3.16-1.23-6.13-3.37-8.43zM12.05 21.5h-.01a9.65 9.65 0 0 1-4.92-1.34l-.35-.21-3.8 1 1.01-3.7-.23-.38a9.62 9.62 0 0 1-1.5-5.04c0-5.32 4.34-9.65 9.65-9.65 2.58 0 5 1 6.82 2.82a9.6 9.6 0 0 1 2.83 6.82c0 5.32-4.33 9.66-9.65 9.66zm5.3-7.22c-.29-.15-1.71-.85-1.98-.94-.27-.1-.46-.15-.65.15-.2.29-.75.94-.91 1.13-.17.2-.34.22-.63.07-.29-.14-1.22-.45-2.32-1.43a8.77 8.77 0 0 1-1.62-2.02c-.17-.29-.02-.45.13-.59.13-.13.29-.34.43-.51.15-.17.2-.29.29-.49.1-.2.05-.36-.02-.51-.07-.15-.65-1.57-.89-2.15-.24-.57-.48-.49-.66-.5l-.56-.01a1.08 1.08 0 0 0-.78.36 3.27 3.27 0 0 0-1.03 2.43c0 1.43 1.04 2.81 1.19 3.01.15.2 2.05 3.14 4.97 4.41.7.3 1.24.48 1.66.61.7.22 1.33.19 1.83.12.56-.08 1.71-.7 1.96-1.38.24-.68.24-1.27.17-1.39-.07-.12-.27-.2-.56-.34z"/></svg>
                          </a>
                        </Button>
                        <Button asChild variant="ghost" size="icon" className="h-7 w-7" title="View profile">
                          <Link to="/erp/crm/$customerId" params={{ customerId: r.customer_key }}>
                            <ShoppingBag className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow key={`${r.customer_key}-preview`} className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={15} className="p-0">
                        <CustomerOrdersPreview
                          customerKey={r.customer_key}
                          previewFn={previewFn}
                          brandNameById={brandNameById}
                          showAll={searchActive}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <div className="text-xs text-muted-foreground">
              Page {page} of {totalPages} · {total.toLocaleString()} customers
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1 || isFetching} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages || isFetching} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Bulk add tag */}
      <Dialog open={bulkTagOpen} onOpenChange={setBulkTagOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add tag to {selected.size} customers</DialogTitle></DialogHeader>
          <Input
            placeholder="Tag name (e.g. vip, wholesale)"
            value={bulkTagValue}
            onChange={(e) => setBulkTagValue(e.target.value)}
          />
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {allTags.slice(0, 12).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setBulkTagValue(t)}
                  className="text-[11px] px-2 py-0.5 rounded-md border hover:bg-accent"
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkTagOpen(false)}>Cancel</Button>
            <Button
              disabled={!bulkTagValue.trim() || bulkTagMut.isPending}
              onClick={() => bulkTagMut.mutate()}
            >
              {bulkTagMut.isPending ? "Tagging…" : "Apply tag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk remove tag */}
      <Dialog open={bulkRemoveTagOpen} onOpenChange={setBulkRemoveTagOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove tag from {selected.size} customers</DialogTitle></DialogHeader>
          <Select value={bulkRemoveTagValue} onValueChange={setBulkRemoveTagValue}>
            <SelectTrigger><SelectValue placeholder="Pick a tag to remove" /></SelectTrigger>
            <SelectContent>
              {allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkRemoveTagOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!bulkRemoveTagValue.trim() || bulkRemoveTagMut.isPending}
              onClick={() => bulkRemoveTagMut.mutate()}
            >
              {bulkRemoveTagMut.isPending ? "Removing…" : "Remove tag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete confirm */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear CRM data for {selected.size} customers?</AlertDialogTitle>
            <AlertDialogDescription>
              Eta tags, notes, status, ar imported entries shob delete kore debe. Real orders ba registered profile remove hobe na — order data thakle customer abar list e ashbe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => bulkDeleteMut.mutate()}
            >
              {bulkDeleteMut.isPending ? "Clearing…" : "Yes, clear data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CrmImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <FindDuplicatesSheet open={dupesOpen} onOpenChange={setDupesOpen} brandId={activeBrand?.id} />
      <PushToMetaDialog open={metaPushOpen} onOpenChange={setMetaPushOpen} brandId={activeBrand?.id} />
    </div>
  );
}

const ORDER_STATUS_TONE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  packaged: "bg-indigo-100 text-indigo-800",
  shipped: "bg-purple-100 text-purple-800",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-700",
  returned: "bg-orange-100 text-orange-700",
  refunded: "bg-zinc-200 text-zinc-700",
  on_hold: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-700",
};

function CustomerOrdersPreview({
  customerKey,
  previewFn,
  brandNameById,
  showAll,
}: {
  customerKey: string;
  previewFn: (args: { data: { customerKey: string; limit?: number } }) => Promise<any>;
  brandNameById: Map<string, string>;
  showAll?: boolean;
}) {
  const limit = showAll ? 500 : 5;
  const { data, isLoading } = useQuery({
    queryKey: ["crm-orders-preview", customerKey, limit],
    queryFn: () => previewFn({ data: { customerKey, limit } }),
    staleTime: 60_000,
  });
  if (isLoading) {
    return <div className="px-4 py-3 text-xs text-muted-foreground">Loading recent orders…</div>;
  }
  const orders = data?.orders ?? [];
  if (!orders.length) {
    return <div className="px-4 py-3 text-xs text-muted-foreground">No orders found for this customer.</div>;
  }
  return (
    <div className="px-4 py-3 space-y-2">
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        Recent orders ({orders.length})
      </div>
      <div className="space-y-2">
        {orders.map((o: any) => (
          <div key={o.id} className="rounded-md border bg-card p-2.5 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:w-[260px] shrink-0">
              <Link
                to="/erp/orders/$orderId"
                params={{ orderId: o.id }}
                className="text-primary hover:underline font-mono text-xs"
              >
                #{o.invoice_no || o.id.slice(0, 8)}
              </Link>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${ORDER_STATUS_TONE[o.status] ?? "bg-zinc-100 text-zinc-700"}`}>
                {o.status}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {new Date(o.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground mb-1">
                {brandNameById.get(o.brand_id) ?? "—"}
                {o.shipping_city ? ` · ${o.shipping_city}` : ""}
                {o.payment_method ? ` · ${o.payment_method}` : ""}
              </div>
              <div className="flex flex-wrap gap-1">
                {(o.items ?? []).slice(0, 6).map((it: any, i: number) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-[11px] max-w-[280px]"
                    title={`${it.name}${it.variant_label ? ` (${it.variant_label})` : ""} × ${it.quantity}`}
                  >
                    <span className="truncate">{it.name}</span>
                    {it.variant_label && <span className="text-muted-foreground">· {it.variant_label}</span>}
                    <span className="text-muted-foreground">× {it.quantity}</span>
                  </span>
                ))}
                {(o.items?.length ?? 0) > 6 && (
                  <span className="text-[11px] text-muted-foreground">+{o.items.length - 6} more</span>
                )}
              </div>
            </div>
            <div className="text-right tabular-nums text-sm font-semibold sm:w-20">
              ৳{new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(o.total)}
            </div>
          </div>
        ))}
      </div>
      <div className="pt-1">
        <Link
          to="/erp/crm/$customerId"
          params={{ customerId: customerKey }}
          className="text-xs text-primary hover:underline"
        >
          View full customer profile →
        </Link>
      </div>
    </div>
  );
}
