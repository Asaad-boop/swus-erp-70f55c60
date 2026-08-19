import { useEffect, useState } from "react";
import {
  Search, X, Calendar as CalendarIcon, ArrowUpDown, Printer, Rows3, Rows4,
  Columns3, Bookmark, BookmarkPlus, Trash2, ChevronDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { OrdersFilterPanel } from "@/components/erp/orders/orders-filter-panel";
import { ORDER_COLUMNS, type Density, type SavedView } from "@/hooks/erp/use-orders-prefs";
import { COURIER_BUCKET_META } from "@/hooks/erp/use-courier-shipments";
import type { OrdersFilter, OrdersSortKey } from "@/hooks/erp/use-orders-query";
import { cn } from "@/lib/utils";

const SORT_LABEL: Record<OrdersSortKey, string> = {
  created_at: "Date created",
  updated_at: "Last updated",
  total: "Order amount",
  invoice_no: "Invoice no",
};

type Props = {
  filter: OrdersFilter;
  onChange: (next: OrdersFilter) => void;
  rightSlot?: React.ReactNode;
  density?: Density;
  onDensityChange?: (d: Density) => void;
  hiddenColumns?: string[];
  onToggleColumn?: (id: string) => void;
  onResetColumns?: () => void;
  savedViews?: SavedView[];
  onSaveView?: (name: string) => void;
  onApplyView?: (v: SavedView) => void;
  onDeleteView?: (id: string) => void;
};

export function OrdersToolbar({
  filter, onChange, rightSlot,
  density = "comfortable", onDensityChange,
  hiddenColumns = [], onToggleColumn, onResetColumns,
  savedViews = [], onSaveView, onApplyView, onDeleteView,
}: Props) {
  const update = (patch: Partial<OrdersFilter>) => onChange({ ...filter, ...patch, page: 0 });

  // Debounced search — typing no longer fires a query per keystroke.
  const [searchInput, setSearchInput] = useState(filter.search);
  useEffect(() => { setSearchInput(filter.search); }, [filter.search]);
  useEffect(() => {
    if (searchInput === filter.search) return;
    const t = setTimeout(() => update({ search: searchInput }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const reset = () =>
    onChange({
      ...filter, search: "", source: null, courier: null, courierBucket: null,
      dateFrom: null, dateTo: null, paymentMethod: null, paymentStatus: null,
      city: null, assignee: null, amountMin: null, amountMax: null,
      advanceFilter: "any", printedFilter: "all", page: 0,
    });

  const chips = buildChips(filter, update);
  const advancedCount = [
    filter.courier, filter.courierBucket, filter.paymentMethod, filter.paymentStatus,
    filter.city, filter.assignee, filter.amountMin, filter.amountMax,
    filter.advanceFilter && filter.advanceFilter !== "any" ? filter.advanceFilter : null,
  ].filter((v) => v != null && v !== "").length;

  const [viewName, setViewName] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);

  return (
    <div className="border-b bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/50">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            data-orders-search
            placeholder="Search invoice, customer, phone, tracking…  (press /)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 pr-8 h-9 bg-background/80 border-border/80 focus-visible:ring-primary/40"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 grid place-items-center rounded hover:bg-muted text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <OrdersFilterPanel filter={filter} onChange={update} activeCount={advancedCount} />

        {/* Sort */}
        <div className="inline-flex items-center rounded-md border h-9 bg-background overflow-hidden">
          <Select
            value={filter.sortKey ?? "created_at"}
            onValueChange={(v) => update({ sortKey: v as OrdersSortKey })}
          >
            <SelectTrigger className="h-9 w-[150px] border-0 rounded-none focus:ring-0 text-xs">
              <span className="flex items-center gap-1.5">
                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABEL) as OrdersSortKey[]).map((k) => (
                <SelectItem key={k} value={k}>{SORT_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => update({ sortDir: (filter.sortDir ?? "desc") === "desc" ? "asc" : "desc" })}
            className="h-9 px-2.5 border-l text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Toggle sort direction"
          >
            {(filter.sortDir ?? "desc") === "desc" ? "▼ Desc" : "▲ Asc"}
          </button>
        </div>

        <Select value={filter.source ?? "all"} onValueChange={(v) => update({ source: v === "all" ? null : v })}>
          <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="website">Website</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="phone">Phone</SelectItem>
            <SelectItem value="shopify">Shopify</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filter.printedFilter ?? "all"}
          onValueChange={(v) => update({ printedFilter: v as "all" | "printed" | "unprinted" })}
        >
          <SelectTrigger className="w-[140px] h-9">
            <span className="flex items-center gap-1.5 text-xs">
              <Printer className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue placeholder="Print status" />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All prints</SelectItem>
            <SelectItem value="printed">Printed</SelectItem>
            <SelectItem value="unprinted">Not printed</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 rounded-md border h-9 px-2 bg-background">
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="date"
            value={filter.dateFrom?.slice(0, 10) ?? ""}
            onChange={(e) => update({ dateFrom: e.target.value ? new Date(e.target.value).toISOString() : null })}
            className="border-0 h-7 px-1 w-[120px] text-xs focus-visible:ring-0"
          />
          <span className="text-muted-foreground text-xs">→</span>
          <Input
            type="date"
            value={filter.dateTo?.slice(0, 10) ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              update({ dateTo: v ? new Date(`${v}T23:59:59`).toISOString() : null });
            }}
            className="border-0 h-7 px-1 w-[120px] text-xs focus-visible:ring-0"
          />
        </div>

        {/* Quick date presets */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1 text-xs">
              Quick range <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {[
              { label: "Today", days: 0 },
              { label: "Last 7 days", days: 6 },
              { label: "Last 30 days", days: 29 },
              { label: "Last 90 days", days: 89 },
            ].map((p) => (
              <DropdownMenuItem
                key={p.label}
                onClick={() => {
                  const to = new Date(); to.setHours(23, 59, 59, 999);
                  const from = new Date(); from.setDate(from.getDate() - p.days); from.setHours(0, 0, 0, 0);
                  update({ dateFrom: from.toISOString(), dateTo: to.toISOString() });
                }}
              >
                {p.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => update({ dateFrom: null, dateTo: null })}>All time</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1" />

        {/* Density */}
        {onDensityChange && (
          <div className="inline-flex rounded-md border overflow-hidden h-9">
            {([["comfortable", Rows3], ["compact", Rows4]] as const).map(([d, Icon]) => (
              <button
                key={d}
                type="button"
                onClick={() => onDensityChange(d)}
                title={d === "comfortable" ? "Comfortable rows" : "Compact rows"}
                className={cn(
                  "px-2.5 transition-colors",
                  density === d ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        )}

        {/* Columns */}
        {onToggleColumn && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                <Columns3 className="h-3.5 w-3.5" /> Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Visible columns
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ORDER_COLUMNS.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={!hiddenColumns.includes(c.id)}
                  onCheckedChange={() => onToggleColumn(c.id)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
              {onResetColumns && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onResetColumns}>Show all</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Saved views */}
        {onSaveView && (
          <Popover open={saveOpen} onOpenChange={setSaveOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                <Bookmark className="h-3.5 w-3.5" /> Views
                {savedViews.length > 0 && (
                  <span className="text-[10px] font-bold tabular-nums text-muted-foreground">{savedViews.length}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Saved views</div>
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {savedViews.length === 0 && (
                  <div className="text-xs text-muted-foreground py-2">No saved views yet.</div>
                )}
                {savedViews.map((v) => (
                  <div key={v.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => { onApplyView?.(v); setSaveOpen(false); }}
                      className="flex-1 text-left text-xs px-2 h-8 rounded-md hover:bg-muted truncate"
                    >
                      {v.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteView?.(v.id)}
                      className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title="Delete view"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <form
                className="flex gap-1.5 mt-3 pt-3 border-t"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = viewName.trim();
                  if (!n) return;
                  onSaveView(n);
                  setViewName("");
                  setSaveOpen(false);
                }}
              >
                <Input value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="Save current filters as…" className="h-8 text-xs" />
                <Button type="submit" size="sm" className="h-8 px-2"><BookmarkPlus className="h-3.5 w-3.5" /></Button>
              </form>
            </PopoverContent>
          </Popover>
        )}

        {rightSlot}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2.5">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.clear}
              className="group inline-flex items-center gap-1.5 h-6 pl-2 pr-1.5 rounded-full border bg-background text-[11px] font-medium hover:border-destructive/50 transition-colors"
            >
              <span className="text-muted-foreground">{c.label}:</span>
              <span className="text-foreground truncate max-w-[160px]">{c.value}</span>
              <X className="h-3 w-3 text-muted-foreground group-hover:text-destructive" />
            </button>
          ))}
          <button
            type="button"
            onClick={reset}
            className="h-6 px-2 rounded-full text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

type Chip = { key: string; label: string; value: string; clear: () => void };

function buildChips(f: OrdersFilter, update: (p: Partial<OrdersFilter>) => void): Chip[] {
  const out: Chip[] = [];
  const add = (key: string, label: string, value: string, patch: Partial<OrdersFilter>) =>
    out.push({ key, label, value, clear: () => update(patch) });

  if (f.search) add("search", "Search", f.search, { search: "" });
  if (f.source) add("source", "Source", f.source, { source: null });
  if (f.courier) add("courier", "Courier", f.courier, { courier: null });
  if (f.courierBucket) add("bucket", "Live status", COURIER_BUCKET_META[f.courierBucket].label, { courierBucket: null });
  if (f.paymentMethod) add("pm", "Payment", f.paymentMethod, { paymentMethod: null });
  if (f.paymentStatus) add("ps", "Pay status", f.paymentStatus, { paymentStatus: null });
  if (f.city) add("city", "City", f.city, { city: null });
  if (f.assignee) add("assignee", "Assigned", "selected staff", { assignee: null });
  if (f.amountMin != null) add("min", "Min", `৳${f.amountMin}`, { amountMin: null });
  if (f.amountMax != null) add("max", "Max", `৳${f.amountMax}`, { amountMax: null });
  if (f.advanceFilter && f.advanceFilter !== "any")
    add("adv", "Advance", f.advanceFilter === "with" ? "has advance" : "no advance", { advanceFilter: "any" });
  if (f.printedFilter && f.printedFilter !== "all") add("printed", "Print", f.printedFilter, { printedFilter: "all" });
  if (f.dateFrom || f.dateTo)
    add(
      "date", "Date",
      `${f.dateFrom?.slice(0, 10) ?? "…"} → ${f.dateTo?.slice(0, 10) ?? "…"}`,
      { dateFrom: null, dateTo: null },
    );
  return out;
}
