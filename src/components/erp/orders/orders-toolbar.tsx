import { useEffect, useState } from "react";
import {
  Search, X, Calendar as CalendarIcon, ArrowUpDown, Rows3, Rows4,
  Bookmark, BookmarkPlus, Trash2, Check, Columns3, ChevronDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

const DATE_PRESETS = [
  { label: "Today", days: 0 },
  { label: "Last 7 days", days: 6 },
  { label: "Last 30 days", days: 29 },
  { label: "Last 90 days", days: 89 },
];

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

/** Bordered pill control — matches the reference toolbar chrome. */
const CTRL =
  "h-9 gap-2 rounded-xl border border-[var(--panel-border)] bg-card px-3 text-[13px] font-medium text-foreground/80 shadow-none hover:bg-foreground/[0.03] hover:text-foreground";

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
    filter.city, filter.assignee, filter.amountMin, filter.amountMax, filter.source,
    filter.advanceFilter && filter.advanceFilter !== "any" ? filter.advanceFilter : null,
    filter.printedFilter && filter.printedFilter !== "all" ? filter.printedFilter : null,
  ].filter((v) => v != null && v !== "").length;

  const [viewName, setViewName] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);

  const dateLabel = filter.dateFrom || filter.dateTo
    ? `${filter.dateFrom?.slice(5, 10) ?? "…"} → ${filter.dateTo?.slice(5, 10) ?? "…"}`
    : "Any date";

  return (
    <div className="rounded-2xl border border-[var(--panel-border)] bg-card px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search — the only prominent control */}
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
          <Input
            data-orders-search
            placeholder="Search orders, invoice, customer, phone…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-9 pl-9 pr-8 rounded-xl border-[var(--panel-border)] bg-background text-[13px] shadow-none placeholder:text-muted-foreground/70"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 grid place-items-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Quick selects */}
        <QuickSelect
          label="Courier"
          value={filter.courier}
          options={QUICK_COURIERS}
          onSelect={(v) => update({ courier: v })}
        />
        <QuickSelect
          label="Source"
          value={filter.source}
          options={QUICK_SOURCES}
          onSelect={(v) => update({ source: v })}
        />
        <QuickSelect
          label="Payment"
          value={filter.paymentMethod}
          options={QUICK_PAYMENTS}
          onSelect={(v) => update({ paymentMethod: v })}
        />

        {/* Date range */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className={cn(CTRL, (filter.dateFrom || filter.dateTo) && "border-primary/50 text-foreground")}>
              <CalendarIcon className="h-4 w-4 text-muted-foreground" /> {dateLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2">
            <div className="grid gap-0.5">
              {DATE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="h-8 rounded-md px-2 text-left text-xs hover:bg-muted"
                  onClick={() => {
                    const to = new Date(); to.setHours(23, 59, 59, 999);
                    const from = new Date(); from.setDate(from.getDate() - p.days); from.setHours(0, 0, 0, 0);
                    update({ dateFrom: from.toISOString(), dateTo: to.toISOString() });
                  }}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                className="h-8 rounded-md px-2 text-left text-xs hover:bg-muted"
                onClick={() => update({ dateFrom: null, dateTo: null })}
              >
                All time
              </button>
            </div>
            <div className="mt-2 border-t pt-2 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Custom</div>
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  value={filter.dateFrom?.slice(0, 10) ?? ""}
                  onChange={(e) => update({ dateFrom: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  className="h-8 text-xs"
                />
                <span className="text-muted-foreground text-xs">→</span>
                <Input
                  type="date"
                  value={filter.dateTo?.slice(0, 10) ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    update({ dateTo: v ? new Date(`${v}T23:59:59`).toISOString() : null });
                  }}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex-1" />

        {/* Everything filter-ish behind one button */}
        <OrdersFilterPanel filter={filter} onChange={update} activeCount={advancedCount} triggerClassName={CTRL} />

        {/* Sort */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className={CTRL}>
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              <span className="hidden md:inline">{SORT_LABEL[filter.sortKey ?? "created_at"]}</span>
              <span className="text-muted-foreground/70">{(filter.sortDir ?? "desc") === "desc" ? "↓" : "↑"}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Sort by</DropdownMenuLabel>
            {(Object.keys(SORT_LABEL) as OrdersSortKey[]).map((k) => (
              <DropdownMenuItem key={k} onClick={() => update({ sortKey: k })} className="text-xs">
                <span className="flex-1">{SORT_LABEL[k]}</span>
                {(filter.sortKey ?? "created_at") === k && <Check className="h-3.5 w-3.5" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {(["desc", "asc"] as const).map((d) => (
              <DropdownMenuItem key={d} onClick={() => update({ sortDir: d })} className="text-xs">
                <span className="flex-1">{d === "desc" ? "Newest / highest first" : "Oldest / lowest first"}</span>
                {(filter.sortDir ?? "desc") === d && <Check className="h-3.5 w-3.5" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1" />

        {/* Display: density + columns in one menu */}
        {(onDensityChange || onToggleColumn) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className={CTRL}>
                <Columns3 className="h-4 w-4 text-muted-foreground" /> <span className="hidden lg:inline">Customize Columns</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {onDensityChange && (
                <>
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Row height</DropdownMenuLabel>
                  {([["comfortable", Rows3, "Comfortable"], ["compact", Rows4, "Compact"]] as const).map(([d, Icon, label]) => (
                    <DropdownMenuItem key={d} onClick={() => onDensityChange(d)} className="text-xs">
                      <Icon className="h-3.5 w-3.5" />
                      <span className="flex-1">{label}</span>
                      {density === d && <Check className="h-3.5 w-3.5" />}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}
              {onToggleColumn && (
                <>
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Columns</DropdownMenuLabel>
                  {ORDER_COLUMNS.map((c) => (
                    <DropdownMenuCheckboxItem
                      key={c.id}
                      checked={!hiddenColumns.includes(c.id)}
                      onCheckedChange={() => onToggleColumn(c.id)}
                      onSelect={(e) => e.preventDefault()}
                      className="text-xs"
                    >
                      {c.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                  {onResetColumns && (
                    <DropdownMenuItem onClick={onResetColumns} className="text-xs">Show all columns</DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Saved views */}
        {onSaveView && (
          <Popover open={saveOpen} onOpenChange={setSaveOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className={CTRL}>
                <Bookmark className="h-4 w-4 text-muted-foreground" />
                <span className="hidden lg:inline">Views</span>
                {savedViews.length > 0 && <span className="tabular-nums text-[11px] text-muted-foreground/70">{savedViews.length}</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-3">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Saved views</div>
              <div className="space-y-0.5 max-h-56 overflow-y-auto">
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
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-[var(--panel-border)] pt-2.5">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.clear}
              className="group inline-flex items-center gap-1.5 h-7 pl-2.5 pr-2 rounded-full bg-primary/[0.08] text-[11.5px] text-primary hover:bg-primary/[0.14] transition-colors"
            >
              <span className="opacity-70">{c.label}:</span>
              <span className="font-medium truncate max-w-[160px]">{c.value}</span>
              <X className="h-3 w-3 opacity-60 group-hover:opacity-100" />
            </button>
          ))}
          <button
            type="button"
            onClick={reset}
            className="h-7 px-2 rounded-md text-[11.5px] font-medium text-primary hover:underline"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

const QUICK_COURIERS = ["pathao", "steadfast", "redx", "paperfly", "sundarban"];
const QUICK_SOURCES = ["website", "manual", "facebook", "phone", "shopify"];
const QUICK_PAYMENTS = ["cod", "bkash", "nagad", "rocket", "card", "bank"];

function QuickSelect({
  label, value, options, onSelect,
}: {
  label: string;
  value: string | null | undefined;
  options: string[];
  onSelect: (v: string | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={cn(CTRL, value && "border-primary/50 text-foreground")}>
          <span className="capitalize">{value ?? label}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuItem className="text-xs" onClick={() => onSelect(null)}>
          <span className="flex-1">All {label.toLowerCase()}</span>
          {!value && <Check className="h-3.5 w-3.5" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuItem key={o} className="text-xs capitalize" onClick={() => onSelect(o)}>
            <span className="flex-1">{o}</span>
            {value === o && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
