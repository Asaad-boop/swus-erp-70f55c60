import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as React from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare, Loader2, Star, AlertTriangle, Repeat, Phone as PhoneIcon, Package, ChevronLeft, ChevronRight, Search, X, Lock } from "lucide-react";
import { toast } from "sonner";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { fetchCourierHistoryFn } from "@/lib/erp/courier-history.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useBrand } from "@/contexts/brand-context";
import { OrderDrawer } from "@/components/erp/orders/order-drawer";
import { cn } from "@/lib/utils";
import { computeAutoTags, topTag, type AutoTagKey } from "@/lib/erp/order-tags";
import { AutoTagChips } from "@/components/erp/orders/auto-tag-chips";
import { CopyIconBtn, PhoneActions } from "@/components/erp/orders/contact-actions";
import { AdvanceBadge } from "@/components/erp/orders/advance-badge";
import { TagFilterBar, buildFilterOptions } from "@/components/erp/orders/tag-filter-bar";
import { IncompleteOrdersTable } from "@/components/erp/orders/incomplete-orders-table";
import { useAbandonedCartCount } from "@/hooks/erp/use-abandoned-carts-query";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { WebOrdersFilterBar, computeDateRange, type SortKey, type DatePreset } from "@/components/erp/orders/web-orders-filter-bar";
import { WebBulkActionBar, type WebStatusKey } from "@/components/erp/orders/web-bulk-action-bar";
import { BulkPrintDialog } from "@/components/erp/orders/bulk-print-dialog";
import { PathaoBulkUploadDialog } from "@/components/erp/orders/pathao-bulk-upload-dialog";
import { useOrderLocks } from "@/hooks/erp/use-order-locks";

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200, 500, 0] as const; // 0 = All
const DEFAULT_PAGE_SIZE = 25;
const COURIER_HISTORY_BATCH_SIZE = 100;
const STATUS_KEYS = ["processing", "good_but_no_response", "no_response", "advance_payment", "on_hold", "complete", "cancelled"] as const;
// All order sources that represent orders placed through the website
// (direct checkout, pixel-tracked, UTM-tagged). All appear in Web Orders.
const WEB_SOURCES: Array<"website" | "pixel" | "utm"> = ["website", "pixel", "utm"];
// Unconfirmed orders (status = "new") always belong in this queue, whatever the
// source — manual / phone / facebook / shopify entries would otherwise be
// invisible (the Orders list hides status = "new").
const WEB_QUEUE_FILTER = `source.in.(${WEB_SOURCES.join(",")}),status.eq.new`;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

const searchSchema = z.object({
  tab: fallback(
    z.enum(["processing", "incomplete", "good_but_no_response", "no_response", "advance_payment", "on_hold", "complete", "cancelled", "all"]),
    "processing",
  ).default("processing"),
  q: fallback(z.string(), "").default(""),
  source: fallback(z.string(), "all").default("all"),
  sort: fallback(z.enum(["newest", "oldest", "highest", "lowest", "recent_note"]), "newest").default("newest"),
  payment: fallback(z.string(), "all").default("all"),
  preset: fallback(z.enum(["all", "today", "yesterday", "7d", "30d", "custom"]), "all").default("all"),
  from: fallback(z.string().nullable(), null).default(null),
  to: fallback(z.string().nullable(), null).default(null),
  page: fallback(z.number().int().min(1), 1).default(1),
  pageSize: fallback(z.number().int().min(0).max(500), DEFAULT_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
type WebOrdersSearch = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/_authenticated/erp/orders/web")({
  head: () => ({ meta: [{ title: "Web Orders — ERP" }] }),
  validateSearch: zodValidator(searchSchema),
  component: WebOrdersPage,
});

type WebStatus =
  | "processing"
  | "incomplete"
  | "good_but_no_response"
  | "no_response"
  | "advance_payment"
  | "on_hold"
  | "complete"
  | "cancelled";

const STATUS_TABS: { key: WebStatus | "all"; label: string; color: string }[] = [
  { key: "processing", label: "Processing", color: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  { key: "incomplete", label: "Incomplete", color: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" },
  { key: "good_but_no_response", label: "Good But No Response", color: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  { key: "no_response", label: "No Response", color: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  { key: "advance_payment", label: "Advance Payment", color: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300" },
  { key: "on_hold", label: "On Hold", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300" },
  { key: "complete", label: "Confirmed", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  { key: "cancelled", label: "Cancel", color: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  { key: "all", label: "All", color: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200" },
];

type WebOrderRow = {
  id: string;
  created_at: string;
  shipping_name: string | null;
  shipping_phone: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_district: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  latest_note: string | null;
  customer_note: string | null;
  notes: string | null;
  tags: string[] | null;
  source_website: string | null;
  status: string | null;
  web_status: WebStatus | null;
  total: number;
  advance_amount: number | null;
  payment_method: string | null;
  call_attempt_count: number | null;
  call_status: string | null;
  brand_id: string | null;
  items_summary?: { name: string; quantity: number; image: string | null; unit_price: number | null }[];
  latest_order_note?: string | null;
  attribution?: { utm_source: string | null; utm_medium: string | null } | null;
};

function CallLogPopover({
  orderId, currentCount, onSaved,
}: {
  orderId: string;
  currentCount: number;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<string>("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!result) { toast.error("Pick a result"); return; }
    setSaving(true);
    try {
      const body = `📞 ${result}${note.trim() ? ` — ${note.trim()}` : ""}`;
      const { error: noteErr } = await supabase.from("order_notes").insert({ order_id: orderId, body, is_internal: true });
      if (noteErr) throw noteErr;
      const { error: updErr } = await supabase
        .from("orders")
        .update({ call_attempt_count: currentCount + 1, call_status: result } as never)
        .eq("id", orderId);
      if (updErr) throw updErr;
      toast.success("Call logged");
      setResult(""); setNote(""); setOpen(false);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const RESULTS = ["Answered", "No Answer", "Busy", "Wrong Number"];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          title="Log call"
          className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md border border-border/60 bg-background hover:bg-muted text-[10px] font-semibold text-foreground/80"
        >
          <PhoneIcon className="h-3 w-3" />
          {currentCount > 0 && <span className="tabular-nums">{currentCount}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-64 p-3" onClick={(e) => e.stopPropagation()}>
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Log call result</div>
        <div className="grid grid-cols-2 gap-1.5 mb-2">
          {RESULTS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setResult(r)}
              className={cn(
                "h-7 rounded-md text-[11px] font-medium border transition-colors",
                result === r ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border/60",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="text-xs min-h-[60px]"
        />
        <div className="flex justify-end gap-1.5 mt-2">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving || !result}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type Breakdown = { total: number; confirmed: number; cancelled: number; returned: number; delivered: number };

type ProviderStat = { total: number; success: number; cancelled: number };
type CourierBreakdown = {
  pathao: ProviderStat;
  steadfast: ProviderStat;
  found: boolean;
};

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("880")) return "0" + digits.slice(3);
  if (digits.length === 10 && digits.startsWith("1")) return "0" + digits;
  return digits;
}

const STATUS_ACCENT: Record<string, string> = {
  processing: "bg-blue-500",
  incomplete: "bg-orange-500",
  good_but_no_response: "bg-amber-500",
  no_response: "bg-red-500",
  advance_payment: "bg-purple-500",
  on_hold: "bg-yellow-500",
  complete: "bg-emerald-500",
  cancelled: "bg-zinc-400",
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

function SuccessBlock({ total, success }: { total: number; success: number }) {
  const pct = total > 0 ? Math.round((success / total) * 100) : 0;
  const tone = total === 0
    ? { text: "text-muted-foreground/60", ring: "stroke-muted-foreground/30", chip: "bg-muted/40 text-muted-foreground ring-border", glow: "" }
    : pct >= 80
      ? { text: "text-emerald-600 dark:text-emerald-400", ring: "stroke-emerald-500", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30", glow: "shadow-[0_0_12px_-2px_rgba(16,185,129,0.35)]" }
      : pct >= 50
        ? { text: "text-amber-600 dark:text-amber-400", ring: "stroke-amber-500", chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/30", glow: "shadow-[0_0_12px_-2px_rgba(245,158,11,0.35)]" }
        : { text: "text-rose-600 dark:text-rose-400", ring: "stroke-rose-500", chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/30", glow: "shadow-[0_0_12px_-2px_rgba(244,63,94,0.35)]" };
  if (total === 0) return <span className="text-xs text-muted-foreground/50">—</span>;
  const R = 15;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - pct / 100);
  return (
    <div className="flex items-center gap-3">
      <div className={cn("relative shrink-0 rounded-full", tone.glow)}>
        <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
          <circle cx="18" cy="18" r={R} className="fill-none stroke-muted/50" strokeWidth="2.5" />
          <circle
            cx="18" cy="18" r={R}
            className={cn("fill-none transition-all duration-700 ease-out", tone.ring)}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("text-[11px] font-bold tabular-nums tracking-tight", tone.text)}>{pct}%</span>
        </div>
      </div>
      <div className="text-xs tabular-nums leading-tight space-y-1">
        <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset", tone.chip)}>
          {pct}% success
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Order</span>
          <span className="font-semibold text-foreground">{success}<span className="text-muted-foreground/50">/{total}</span></span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Rating</span>
          <span className="font-semibold text-foreground">{success}</span>
        </div>
      </div>
    </div>
  );
}

function AllItemsPopover({
  items,
  total,
}: {
  items: { name: string; quantity: number; image: string | null; unit_price: number | null }[];
  total: number;
}) {
  return _AllItemsPopover({ items, total });
}

function ProductThumb({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  const url = src && src.trim() ? src : null;
  if (!url || failed) {
    return (
      <div className={cn("h-full w-full flex items-center justify-center bg-muted text-muted-foreground", className)}>
        <Package className="h-1/2 w-1/2 opacity-50" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("h-full w-full object-cover", className)}
    />
  );
}

function _AllItemsPopover({
  items,
  total,
}: {
  items: { name: string; quantity: number; image: string | null; unit_price: number | null }[];
  total: number;
}) {
  const totalQty = items.reduce((s, i) => s + (i.quantity ?? 0), 0);
  return (
    <PopoverContent
      align="start"
      side="top"
      className="w-80 p-0 overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
          {items.length} item{items.length === 1 ? "" : "s"} · {totalQty} qty
        </div>
        <div className="text-sm font-bold tabular-nums text-primary">৳{Number(total).toLocaleString()}</div>
      </div>
      <div className="max-h-80 overflow-y-auto divide-y">
        {items.map((it, idx) => (
          <div key={idx} className="flex items-center gap-2.5 p-2.5 hover:bg-muted/40">
            <div className="h-11 w-11 rounded-md border bg-muted overflow-hidden shrink-0">
              <ProductThumb src={it.image} alt={it.name} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium leading-tight line-clamp-2">{it.name}</div>
              {it.unit_price != null && (
                <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                  ৳{Number(it.unit_price).toLocaleString()} × {it.quantity}
                </div>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="text-[11px] font-bold tabular-nums">×{it.quantity}</div>
              <div className="text-[10px] font-semibold tabular-nums text-primary">
                ৳{(Number(it.unit_price ?? 0) * (it.quantity ?? 0)).toLocaleString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </PopoverContent>
  );
}

function WebOrdersPage() {
  // placeholder; real component declared below
  return _WebOrdersPageBody();
}

function CustomerBadges({ total, confirmRate, delivered }: { total: number; confirmRate: number; delivered: number }) {
  if (total <= 1) return null;
  const tooltip = `${total} orders | ${confirmRate}% confirm rate | ${delivered} delivered`;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 flex-wrap">
            {total >= 5 ? (
              <span className="inline-flex items-center gap-1 h-[17px] px-1.5 rounded-full text-[9.5px] font-medium tracking-wide bg-foreground/[0.04] text-foreground/80 ring-1 ring-inset ring-border/60">
                <span className="h-1 w-1 rounded-full bg-amber-500" />VIP
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 h-[17px] px-1.5 rounded-full text-[9.5px] font-medium tracking-wide bg-foreground/[0.04] text-foreground/80 ring-1 ring-inset ring-border/60 tabular-nums">
                <span className="h-1 w-1 rounded-full bg-indigo-500" />{total}×
              </span>
            )}
            {confirmRate < 30 && total >= 3 && (
              <span className="inline-flex items-center gap-1 h-[17px] px-1.5 rounded-full text-[9.5px] font-medium tracking-wide bg-foreground/[0.04] text-foreground/80 ring-1 ring-inset ring-border/60">
                <span className="h-1 w-1 rounded-full bg-rose-500" />Low
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function SourcePill({ attribution, siteLabel }: { attribution: { utm_source: string | null; utm_medium: string | null } | null | undefined; siteLabel: string }) {
  const raw = (attribution?.utm_source ?? "").toLowerCase();
  let icon = "🔗";
  let label = "Direct";
  let tone = "bg-muted/60 text-muted-foreground ring-border";
  if (raw.includes("facebook") || raw === "fb" || raw.includes("meta")) {
    icon = "📘"; label = "Facebook"; tone = "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60";
  } else if (raw.includes("instagram") || raw === "ig") {
    icon = "📷"; label = "Instagram"; tone = "bg-pink-50 text-pink-700 ring-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:ring-pink-900/60";
  } else if (raw.includes("google")) {
    icon = "🔍"; label = "Google"; tone = "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60";
  } else if (raw && raw !== "direct" && raw !== "organic") {
    icon = "🌐"; label = attribution!.utm_source!.slice(0, 16); tone = "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60";
  } else if (!raw && siteLabel) {
    icon = "🔗"; label = siteLabel;
  }
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 h-5 rounded-full text-[10px] font-semibold ring-1 ring-inset max-w-[120px]", tone)}>
      <span>{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

type SiteIdentity = {
  key: "toyora" | "hobbyshop" | "main" | "other";
  label: string;
  initial: string;
  dotClass: string;
  pillClass: string;
};

function resolveSite(raw: string | null | undefined): SiteIdentity | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  if (!s) return null;
  if (s.includes("toyora")) {
    return {
      key: "toyora", label: "Toyora", initial: "T",
      dotClass: "bg-rose-500",
      pillClass: "bg-background text-foreground/85 ring-border/70",
    };
  }
  if (s.includes("hobby")) {
    return {
      key: "hobbyshop", label: "HobbyShop", initial: "H",
      dotClass: "bg-indigo-500",
      pillClass: "bg-background text-foreground/85 ring-border/70",
    };
  }
  if (s === "main" || s.includes("swus")) {
    return {
      key: "main", label: "Main", initial: "M",
      dotClass: "bg-foreground/70",
      pillClass: "bg-background text-foreground/85 ring-border/70",
    };
  }
  return {
    key: "other", label: s.length > 18 ? s.slice(0, 18) + "…" : s, initial: s[0]?.toUpperCase() ?? "·",
    dotClass: "bg-violet-500",
    pillClass: "bg-background text-foreground/85 ring-border/70",
  };
}

function BrandChip({ name }: { name: string }) {
  const n = name.toLowerCase();
  let dot = "bg-foreground/70";
  if (n.includes("toyora")) dot = "bg-rose-500";
  else if (n.includes("hobby")) dot = "bg-indigo-500";
  return (
    <span className="inline-flex items-center gap-1.5 px-2 h-[20px] rounded-full text-[10.5px] font-medium tracking-tight bg-background text-foreground/85 ring-1 ring-inset ring-border/70">
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      <span>{name}</span>
    </span>
  );
}

function _WebOrdersPageBody() {
  const { activeBrand, brandIds, isAllBrands, brands } = useBrand();
  const brandNameById = new Map(brands.map((b) => [b.id, b.name] as const));
  const brandsKey = brandIds.join(",");
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const activeTab = search.tab;
  const sort = search.sort;
  const sourceFilter = search.source;
  const paymentFilter = search.payment;
  const datePreset = search.preset;
  const [openId, setOpenId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<Set<AutoTagKey>>(new Set());
  const [incompletePage, setIncompletePage] = useState(0);
  const [searchInput, setSearchInput] = useState(search.q);
  const [debouncedSearch, setDebouncedSearch] = useState(search.q);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const flashTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  useEffect(() => () => {
    flashTimersRef.current.forEach((t) => clearTimeout(t));
    flashTimersRef.current.clear();
  }, []);
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printOpen, setPrintOpen] = useState(false);
  const [pathaoBulkOpen, setPathaoBulkOpen] = useState(false);
  // inline status buttons removed; selection-based bulk actions only

  // Debounce search input (300ms) → URL + query key
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput);
      navigate({ search: (prev: WebOrdersSearch) => ({ ...prev, q: searchInput || "" }), replace: true });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Sync external URL changes back into input
  useEffect(() => { if (search.q !== searchInput) setSearchInput(search.q); /* eslint-disable-next-line */ }, [search.q]);

  const { data: incompleteCount } = useAbandonedCartCount(activeBrand?.id ?? null, brandIds);

  // Date range from preset
  const dateRange = useMemo(
    () => computeDateRange(datePreset, search.from, search.to),
    [datePreset, search.from, search.to],
  );

  // Pre-fetch order IDs matching source filter (for fb/insta/google/other)
  const { data: sourceOrderIds } = useQuery({
    queryKey: ["web-orders-source-ids", brandsKey, sourceFilter],
    enabled: brandIds.length > 0 && ["facebook", "instagram", "google", "other"].includes(sourceFilter),
    staleTime: 60_000,
    queryFn: async () => {
      const map: Record<string, string> = {
        facebook: "%facebook%",
        instagram: "%instagram%",
        google: "%google%",
      };
      let q = applyBrandScope(
        supabase.from("mkt_order_attributions").select("order_id, utm_source"),
        brandIds,
      ).limit(10000);
      if (sourceFilter === "other") {
        q = q.not("utm_source", "ilike", "%facebook%")
          .not("utm_source", "ilike", "%instagram%")
          .not("utm_source", "ilike", "%google%")
          .not("utm_source", "is", null);
      } else {
        q = q.ilike("utm_source", map[sourceFilter]);
      }
      const { data, error } = await q;
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r) => r.order_id)));
    },
  });

  // Paginated orders (page 1-indexed in URL)
  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? DEFAULT_PAGE_SIZE; // 0 = All
  const ordersQueryKey = ["web-orders-page", brandsKey, activeTab, debouncedSearch, sort, sourceFilter, paymentFilter, dateRange.from, dateRange.to, sourceOrderIds?.join(",") ?? "", page, pageSize] as const;

  const ordersQuery = useQuery({
    queryKey: ordersQueryKey,
    enabled: brandIds.length > 0 && activeTab !== "incomplete"
      && (sourceFilter === "all" || sourceFilter === "direct" || !!sourceOrderIds),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const pageIdx = page - 1;
      let q = applyBrandScope(
        supabase
          .from("orders")
          .select(
            "id,created_at,shipping_name,shipping_phone,shipping_address,shipping_city,shipping_district,guest_name,guest_phone,latest_note,customer_note,notes,tags,source_website,status,web_status,total,advance_amount,payment_method,call_attempt_count,call_status,brand_id,updated_at",
            { count: "exact" },
          ),
        brandIds,
      ).in("source", WEB_SOURCES);

      // Pre-orders also show in the Web Orders queue so they go to processing.
      // sort
      if (sort === "newest") q = q.order("created_at", { ascending: false });
      else if (sort === "oldest") q = q.order("created_at", { ascending: true });
      else if (sort === "highest") q = q.order("total", { ascending: false });
      else if (sort === "lowest") q = q.order("total", { ascending: true });
      else if (sort === "recent_note") q = q.order("updated_at", { ascending: false });

      if (activeTab !== "all") q = q.eq("web_status", activeTab);
      if (activeTab === "processing") q = q.eq("status", "new" as never);
      if (paymentFilter && paymentFilter !== "all") {
        q = q.eq("payment_method", paymentFilter as never);
      }
      if (debouncedSearch.trim()) {
        const s = debouncedSearch.trim();
        const esc = s.replace(/[,()]/g, " ");
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
        const parts = [
          `shipping_name.ilike.%${esc}%`,
          `shipping_phone.ilike.%${esc}%`,
          `shipping_address.ilike.%${esc}%`,
          `shipping_city.ilike.%${esc}%`,
          `shipping_thana.ilike.%${esc}%`,
          `shipping_district.ilike.%${esc}%`,
          `guest_name.ilike.%${esc}%`,
          `guest_phone.ilike.%${esc}%`,
          `guest_email.ilike.%${esc}%`,
          `invoice_no.ilike.%${esc}%`,
          `tracking_number.ilike.%${esc}%`,
        ];
        if (isUuid) parts.push(`id.eq.${s}`);
        q = q.or(parts.join(","));
      }
      if (dateRange.from) q = q.gte("created_at", dateRange.from);
      if (dateRange.to) q = q.lte("created_at", dateRange.to);

      if (["facebook", "instagram", "google", "other"].includes(sourceFilter)) {
        const ids = sourceOrderIds ?? [];
        if (ids.length === 0) return { rows: [] as WebOrderRow[], total: 0 };
        q = q.in("id", ids);
      }

      if (pageSize > 0) {
        const from = pageIdx * pageSize;
        const to = from + pageSize - 1;
        q = q.range(from, to);
      } else {
        // "All" — cap at supabase max
        q = q.range(0, 9999);
      }

      const { data, error, count } = await q;
      if (error) throw error;
      let rows = (data ?? []) as WebOrderRow[];

      // fetch items + notes + attribution for this page
      const ids = rows.map((r) => r.id);
      if (ids.length) {
        const [{ data: items }, { data: orderNotes }, { data: attrs }] = await Promise.all([
          supabase.from("order_items").select("order_id,name,quantity,image,unit_price").in("order_id", ids),
          supabase.from("order_notes").select("order_id,body,created_at").in("order_id", ids).order("created_at", { ascending: false }),
          supabase.from("mkt_order_attributions").select("order_id,utm_source,utm_medium").in("order_id", ids),
        ]);
        const byOrder = new Map<string, { name: string; quantity: number; image: string | null; unit_price: number | null }[]>();
        (items ?? []).forEach((it) => {
          const arr = byOrder.get(it.order_id) ?? [];
          arr.push({ name: it.name ?? "—", quantity: it.quantity ?? 0, image: it.image ?? null, unit_price: it.unit_price ?? null });
          byOrder.set(it.order_id, arr);
        });
        const latestNoteByOrder = new Map<string, string>();
        (orderNotes ?? []).forEach((n) => {
          if (!latestNoteByOrder.has(n.order_id) && n.body) latestNoteByOrder.set(n.order_id, n.body);
        });
        const attrByOrder = new Map<string, { utm_source: string | null; utm_medium: string | null }>();
        (attrs ?? []).forEach((a) => {
          if (!attrByOrder.has(a.order_id)) attrByOrder.set(a.order_id, { utm_source: a.utm_source, utm_medium: a.utm_medium });
        });
        rows.forEach((r) => {
          r.items_summary = byOrder.get(r.id) ?? [];
          r.latest_order_note = latestNoteByOrder.get(r.id) ?? null;
          r.attribution = attrByOrder.get(r.id) ?? null;
        });
      }

      // client-side filter for "direct" source (no attribution row)
      if (sourceFilter === "direct") {
        rows = rows.filter((r) => !r.attribution || !r.attribution.utm_source);
      }

      const total = count ?? 0;
      return { rows, total };
    },
  });

  const rows = useMemo<WebOrderRow[]>(() => ordersQuery.data?.rows ?? [], [ordersQuery.data]);
  const totalRows = ordersQuery.data?.total ?? 0;
  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(totalRows / pageSize)) : 1;
  const isLoading = ordersQuery.isLoading;

  // counts per status — parallel head count queries
  const { data: counts } = useQuery({
    queryKey: ["web-orders-counts", brandsKey],
    enabled: brandIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const queries = STATUS_KEYS.map(async (st) => {
        let q = applyBrandScope(
          supabase.from("orders").select("id", { count: "exact", head: true }),
          brandIds,
        ).in("source", WEB_SOURCES).eq("web_status", st);
        if (st === "processing") q = q.eq("status", "new" as never);
        const { count } = await q;
        return [st, count ?? 0] as const;
      });
      const allQ = applyBrandScope(
        supabase.from("orders").select("id", { count: "exact", head: true }),
        brandIds,
      ).in("source", WEB_SOURCES);
      const [allRes, ...stRes] = await Promise.all([allQ, ...queries]);
      const result: Record<string, number> = { all: allRes.count ?? 0 };
      stRes.forEach(([k, v]) => { result[k] = v; });
      return result;
    },
  });

  // Realtime: new orders for active brand(s)
  useEffect(() => {
    if (brandIds.length === 0) return;
    const channel = supabase
      .channel(`web-orders-realtime-${brandsKey}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: `source=in.(${WEB_SOURCES.join(",")})` },
        (payload) => {
          const row = payload.new as { id: string; brand_id: string | null; total: number; shipping_name: string | null; guest_name: string | null; shipping_city: string | null };
          if (!row.brand_id || !brandIds.includes(row.brand_id)) return;
          const name = row.shipping_name ?? row.guest_name ?? "Customer";
          void name;
          setFlashIds((prev) => { const n = new Set(prev); n.add(row.id); return n; });
          const timer = setTimeout(() => {
            flashTimersRef.current.delete(timer);
            setFlashIds((prev) => { const n = new Set(prev); n.delete(row.id); return n; });
          }, 3000);
          flashTimersRef.current.add(timer);
          queryClient.invalidateQueries({ queryKey: ["web-orders-inf"] });
          queryClient.invalidateQueries({ queryKey: ["web-orders-counts"] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // brandIds intentionally omitted — brandsKey is the stable identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandsKey, queryClient]);

  // customer breakdown by phone — historical totals across all orders in this brand
  const phones = Array.from(new Set(rows.map((r) => r.shipping_phone ?? r.guest_phone).filter(Boolean) as string[]));
  const courierPhones = Array.from(new Set(phones.map(normalizePhone).filter(Boolean)));
  const { data: breakdowns } = useQuery({
    queryKey: ["customer-breakdown", brandsKey, phones.sort().join(",")],
    enabled: brandIds.length > 0 && phones.length > 0,
    queryFn: async () => {
      const { data, error } = await applyBrandScope(
        supabase.from("orders").select("shipping_phone,guest_phone,web_status,status"),
        brandIds,
      )
        .or(phones.map((p) => `shipping_phone.eq.${p},guest_phone.eq.${p}`).join(","))
        .limit(5000);
      if (error) throw error;
      const map = new Map<string, Breakdown>();
      (data ?? []).forEach((o) => {
        const ph = (o as { shipping_phone: string | null; guest_phone: string | null }).shipping_phone
          ?? (o as { guest_phone: string | null }).guest_phone;
        if (!ph) return;
        const b = map.get(ph) ?? { total: 0, confirmed: 0, cancelled: 0, returned: 0, delivered: 0 };
        b.total++;
        const ws = (o as { web_status: string | null }).web_status;
        const st = (o as { status: string | null }).status;
        if (ws === "complete") b.confirmed++;
        else if (ws === "cancelled") b.cancelled++;
        if (st === "delivered") b.delivered++;
        else if (st === "returned") b.returned++;
        map.set(ph, b);
      });
      return map;
    },
  });

  // Courier history (Pathao + Steadfast) by phone — from cache
  const fetchCourierHistory = useServerFn(fetchCourierHistoryFn);
  // FAST PATH: read DB-cached rows directly so cards appear instantly on reload
  const { data: cachedCourierHistory } = useQuery({
    queryKey: ["courier-history-cache", brandsKey, courierPhones.sort().join(",")],
    enabled: courierPhones.length > 0,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const cacheRows = await Promise.all(
        chunkArray(courierPhones, COURIER_HISTORY_BATCH_SIZE).map(async (phoneChunk) => {
          const { data } = await supabase
            .from("courier_history_cache")
            .select("phone, data")
            .in("phone", phoneChunk);
          return data ?? [];
        }),
      );
      const map = new Map<string, CourierBreakdown>();
      cacheRows.flat().forEach((row) => {
        const hist = row.data as { providers?: Array<{ name: string; total: number; success: number; cancelled: number; ok: boolean }> } | null;
        if (!hist) return;
        const result: CourierBreakdown = {
          pathao: { total: 0, success: 0, cancelled: 0 },
          steadfast: { total: 0, success: 0, cancelled: 0 },
          found: false,
        };
        (hist.providers ?? []).forEach((p) => {
          const stat = { total: p.total ?? 0, success: p.success ?? 0, cancelled: p.cancelled ?? 0 };
          if (p.name === "pathao") result.pathao = stat;
          else if (p.name === "steadfast") result.steadfast = stat;
        });
        result.found = result.pathao.total + result.steadfast.total > 0;
        map.set(row.phone, result);
      });
      return map;
    },
  });
  // SLOW PATH: only fetch phones MISSING from cache, runs in background
  const missingPhones = courierPhones.filter((p) => !cachedCourierHistory?.has(p));
  const { data: freshCourierHistory } = useQuery({
    queryKey: ["courier-history", brandsKey, missingPhones.sort().join(",")],
    enabled: missingPhones.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const historyResponses = [];
      for (const phoneChunk of chunkArray(missingPhones, COURIER_HISTORY_BATCH_SIZE)) {
        historyResponses.push(await fetchCourierHistory({ data: { phones: phoneChunk, brandId: activeBrand?.id } }));
      }
      const results = historyResponses.reduce<Record<string, Awaited<ReturnType<typeof fetchCourierHistory>>["results"][string]>>(
        (acc, response) => ({ ...acc, ...response.results }),
        {},
      );
      const map = new Map<string, CourierBreakdown>();
      Object.entries(results).forEach(([phone, d]) => {
        const result: CourierBreakdown = {
          pathao: { total: 0, success: 0, cancelled: 0 },
          steadfast: { total: 0, success: 0, cancelled: 0 },
          found: !!d.found,
        };
        (d.providers ?? []).forEach((p) => {
          const stat = { total: p.total ?? 0, success: p.success ?? 0, cancelled: p.cancelled ?? 0 };
          if (p.name === "pathao") result.pathao = stat;
          else if (p.name === "steadfast") result.steadfast = stat;
        });
        map.set(phone, result);
        map.set(normalizePhone(phone), result);
      });
      return map;
    },
  });
  // Merge cached + fresh so previously-cached rows render instantly while new phones backfill
  const courierHistory = useMemo(() => {
    const merged = new Map<string, CourierBreakdown>();
    cachedCourierHistory?.forEach((v, k) => merged.set(k, v));
    freshCourierHistory?.forEach((v, k) => merged.set(k, v));
    return merged;
  }, [cachedCourierHistory, freshCourierHistory]);

  const getBreakdown = (r: WebOrderRow): Breakdown => {
    const phone = r.shipping_phone ?? r.guest_phone;
    if (!phone) return { total: 0, confirmed: 0, cancelled: 0, returned: 0, delivered: 0 };
    return breakdowns?.get(phone) ?? { total: 1, confirmed: 0, cancelled: 0, returned: 0, delivered: 0 };
  };

  const emptyProvider: ProviderStat = { total: 0, success: 0, cancelled: 0 };
  const getCourier = (r: WebOrderRow): CourierBreakdown => {
    const phone = normalizePhone(r.shipping_phone ?? r.guest_phone ?? "");
    if (!phone) return { pathao: emptyProvider, steadfast: emptyProvider, found: false };
    return courierHistory?.get(phone) ?? { pathao: emptyProvider, steadfast: emptyProvider, found: false };
  };

  // Compute auto-tags for every loaded row (cheap, sync)
  const taggedRows = rows.map((r) => {
    const items = r.items_summary ?? [];
    const totalQty = items.reduce((s, it) => s + (it.quantity ?? 0), 0);
    const tags = computeAutoTags(
      {
        total: r.total,
        customer_note: r.customer_note,
        notes: r.notes,
        shipping_city: r.shipping_city,
        call_attempt_count: r.call_attempt_count,
        created_at: r.created_at,
        status: r.web_status,
        itemCount: items.length,
        totalQty,
      },
      getBreakdown(r),
      getCourier(r),
    );
    return { row: r, tags };
  });

  const filterOptions = buildFilterOptions(taggedRows.map((t) => t.tags));
  const filteredRows = tagFilter.size === 0
    ? taggedRows
    : taggedRows.filter(({ tags }) => tags.some((t) => tagFilter.has(t.key)));

  const toggleTagFilter = (k: AutoTagKey) => {
    setTagFilter((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  // Pagination
  const goToPage = useCallback((p: number) => {
    const clamped = Math.max(1, Math.min(totalPages, p));
    navigate({ search: (prev: WebOrdersSearch) => ({ ...prev, page: clamped }), replace: true });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, [navigate, totalPages]);

  // Reset page to 1 whenever filters change
  useEffect(() => {
    if ((search.page ?? 1) !== 1) {
      navigate({ search: (prev: WebOrdersSearch) => ({ ...prev, page: 1 }), replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, debouncedSearch, sort, sourceFilter, paymentFilter, dateRange.from, dateRange.to]);

  const setActiveTab = (key: WebStatus | "all") => navigate({ search: (prev: WebOrdersSearch) => ({ ...prev, tab: key, page: 1 }), replace: true });

  const updateFilters = (patch: Partial<{ source: string; sort: SortKey; payment: string; datePreset: DatePreset; dateFrom: string | null; dateTo: string | null }>) => {
    navigate({
      search: (prev: WebOrdersSearch) => ({
        ...prev,
        ...(patch.source !== undefined ? { source: patch.source } : {}),
        ...(patch.sort !== undefined ? { sort: patch.sort } : {}),
        ...(patch.payment !== undefined ? { payment: patch.payment } : {}),
        ...(patch.datePreset !== undefined ? { preset: patch.datePreset } : {}),
        ...(patch.dateFrom !== undefined ? { from: patch.dateFrom } : {}),
        ...(patch.dateTo !== undefined ? { to: patch.dateTo } : {}),
      }),
      replace: true,
    });
  };
  const clearAllFilters = () => navigate({
    search: (prev: WebOrdersSearch) => ({ ...prev, source: "all", payment: "all", sort: "newest" as const, preset: "all" as const, from: null, to: null }),
    replace: true,
  });

  // ============ FEATURE 1 + 2: status mutations ============
  const invalidateWebOrders = () => {
    queryClient.invalidateQueries({ queryKey: ["web-orders-page"] });
    queryClient.invalidateQueries({ queryKey: ["web-orders-inf"] });
    queryClient.invalidateQueries({ queryKey: ["web-orders-counts"] });
  };

  const bulkStatus = useMutation({
    mutationFn: async (status: WebStatusKey) => {
      const ids = Array.from(selectedIds);
      const now = new Date().toISOString();
      const selectedNewIds = rows.filter((r) => ids.includes(r.id) && r.status === "new").map((r) => r.id);
      const selectedExistingIds = ids.filter((id) => !selectedNewIds.includes(id));
      const patch = status === "complete"
        ? { web_status: status as never, status: "confirmed" as never, confirmation_status: "pending" as never, confirmed_at: now }
        : status === "cancelled"
          ? { web_status: status as never, status: "cancelled" as never, cancelled_at: now }
          : { web_status: status as never };
      if (status === "complete" || status === "cancelled") {
        if (selectedNewIds.length) {
          const { error } = await supabase.from("orders").update(patch).in("id", selectedNewIds);
          if (error) throw error;
        }
        if (selectedExistingIds.length) {
          const { error } = await supabase.from("orders").update({ web_status: status as never }).in("id", selectedExistingIds);
          if (error) throw error;
        }
      } else {
        const { error } = await supabase.from("orders").update(patch).in("id", ids);
        if (error) throw error;
      }
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`Updated ${n} order${n === 1 ? "" : "s"}`);
      setSelectedIds(new Set());
      invalidateWebOrders();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkAddTag = useMutation({
    mutationFn: async (tag: string) => {
      const ids = Array.from(selectedIds);
      const idRows = rows.filter((r) => ids.includes(r.id));
      await Promise.all(idRows.map(async (r) => {
        const next = Array.from(new Set([...(r.tags ?? []), tag]));
        await supabase.from("orders").update({ tags: next as never }).eq("id", r.id);
      }));
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`Tagged ${n} order${n === 1 ? "" : "s"}`);
      setSelectedIds(new Set());
      invalidateWebOrders();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // selection helpers — operate on currently visible filteredRows
  const visibleIds = useMemo(() => filteredRows.map(({ row }) => row.id), [filteredRows]);
  const orderLocks = useOrderLocks(visibleIds);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));
  const toggleSelect = (id: string) => setSelectedIds((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleAllVisible = (checked: boolean) => setSelectedIds((prev) => {
    const n = new Set(prev);
    if (checked) visibleIds.forEach((id) => n.add(id));
    else visibleIds.forEach((id) => n.delete(id));
    return n;
  });
  const selectedOrderRows = rows.filter((r) => selectedIds.has(r.id));

  return (
    <div className="px-5 md:px-8 py-6 md:py-8 max-w-[1600px] mx-auto">
      {/* Header — refined, minimal */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
            Orders
          </div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight leading-tight text-foreground">
            Web Orders
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground truncate">
            {isAllBrands ? `All Brands · ${brands.length}` : activeBrand?.name ?? "—"}
            {activeTab !== "incomplete" && totalRows > 0 && (
              <span className="ml-2 text-muted-foreground/70">{rows.length} of {totalRows}</span>
            )}
          </p>
        </div>
        <div className="relative w-full sm:w-[420px] justify-self-center">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/80 pointer-events-none transition-colors" />
          <Input
            placeholder="Search invoice, name, phone…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-10 pl-11 pr-9 rounded-full border-transparent bg-muted/50 hover:bg-muted/70 focus:bg-background text-[14px] font-semibold tracking-tight placeholder:font-medium placeholder:text-muted-foreground/60 shadow-none transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:border-border/60 focus-visible:shadow-sm"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div aria-hidden className="hidden sm:block" />
      </header>

      {/* Tabs — segmented underline, Linear/Notion-style */}
      <div className="mt-6 flex items-center gap-1 overflow-x-auto -mx-1 px-1 border-b border-border/60 [scrollbar-width:thin]">
        {STATUS_TABS.map((t) => {
          const active = activeTab === t.key;
          const count =
            t.key === "incomplete"
              ? incompleteCount ?? 0
              : counts?.[t.key] ?? 0;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                "relative shrink-0 inline-flex items-center gap-2 px-3 py-2.5 text-[13px] font-medium transition-colors -mb-px border-b-2",
                active
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <span>{t.label}</span>
              <span
                className={cn(
                  "tabular-nums inline-flex items-center justify-center rounded-md text-[10.5px] font-medium min-w-[20px] h-[18px] px-1.5",
                  active
                    ? "bg-foreground text-background"
                    : "bg-muted/70 text-muted-foreground",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter row — tags inline + dropdowns right-aligned */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 py-1">
        <div className="min-w-0 flex-1">
          <TagFilterBar
            options={filterOptions}
            selected={tagFilter}
            onToggle={toggleTagFilter}
            onClear={() => setTagFilter(new Set())}
            compact
          />
        </div>
        <div className="shrink-0">
          <WebOrdersFilterBar
            state={{
              datePreset,
              dateFrom: search.from,
              dateTo: search.to,
              source: sourceFilter,
              payment: paymentFilter,
              sort,
            }}
            onChange={(patch) => updateFilters(patch)}
            onClearAll={clearAllFilters}
          />
        </div>
      </div>

      <div className="mt-4 space-y-4">

      {activeTab === "incomplete" ? (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <IncompleteOrdersTable
            brandId={activeBrand?.id ?? null}
            brandIds={isAllBrands ? brandIds : activeBrand ? [activeBrand.id] : undefined}
            search={debouncedSearch}
            page={incompletePage}
            pageSize={50}
            onPageChange={setIncompletePage}
            onOpenOrder={setOpenId}
          />
        </div>
      ) : (
      <div className="rounded-xl border border-border/60 bg-card overflow-x-auto shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30 border-border/60">
              <TableHead className="w-[36px] pl-3">
                <Checkbox
                  checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                  onCheckedChange={(v) => toggleAllVisible(!!v)}
                  aria-label="Select all visible"
                />
              </TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[120px]">Created</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[220px]">Customer</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[180px]">Note</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[240px]">Order Items</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[160px]">Success Rate</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[180px]">Tags</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[120px]">Site</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[130px]">Source</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right w-[110px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 10 }).map((_, j) => (
                    <TableCell key={j} className="py-2"><Skeleton className="h-10 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
                  {tagFilter.size > 0 ? "No orders match the selected tags" : "No web orders in this status"}
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map(({ row: r, tags: autoTags }) => {
                const name = r.shipping_name ?? r.guest_name ?? "—";
                const phone = r.shipping_phone ?? r.guest_phone ?? "";
                // Only real customer/staff notes — skip r.notes (auto-populated with items summary)
                const rawNote = r.latest_order_note ?? r.customer_note ?? r.latest_note ?? "";
                const note = /^\s*items?\s*:/i.test(rawNote) ? "" : rawNote;
                const address = [r.shipping_address, r.shipping_city, r.shipping_district].filter(Boolean).join(", ");
                const items = r.items_summary ?? [];
                const totalQty = items.reduce((s, it) => s + (it.quantity ?? 0), 0);
                const b = getBreakdown(r);
                const courier = getCourier(r);
                const top = topTag(autoTags);
                const accent = top?.accent ?? STATUS_ACCENT[r.web_status ?? ""] ?? "bg-muted-foreground";
                const siteLabel = (r.source_website ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
                const flash = flashIds.has(r.id);
                const confirmRate = b.total > 0 ? Math.round((b.confirmed / b.total) * 100) : 0;
                const isSelected = selectedIds.has(r.id);
                const lock = orderLocks.get(r.id);
                return (
                  <TableRow
                    key={r.id}
                    className={cn(
                      "group/row cursor-pointer hover:bg-muted/40 border-b border-border/40 last:border-0 align-top transition-colors",
                      isSelected && "bg-primary/[0.04] hover:bg-primary/[0.06] dark:bg-primary/10",
                      flash && "animate-in slide-in-from-top-2 bg-emerald-50/70 dark:bg-emerald-950/30",
                      lock && "ring-1 ring-inset ring-amber-500/30 bg-amber-50/40 dark:bg-amber-950/15",
                    )}
                    onClick={() => setOpenId(r.id)}
                  >
                    {/* Select */}
                    <TableCell className="py-3 pl-3 w-[36px]" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(r.id)}
                        aria-label="Select row"
                      />
                    </TableCell>
                    {/* Created */}
                    <TableCell className="py-3">
                      <div className="flex gap-2.5">
                        <div className={cn("w-[3px] rounded-full self-stretch opacity-80", accent)} />
                        <div className="text-xs leading-tight">
                          <div className="font-semibold text-foreground tracking-tight">{format(new Date(r.created_at), "dd MMM")}</div>
                          <div className="text-[11px] text-muted-foreground tabular-nums">{format(new Date(r.created_at), "hh:mm a")}</div>
                          <div className="text-[10px] text-muted-foreground/70 mt-1">
                            {formatDistanceToNowStrict(new Date(r.created_at), { addSuffix: true })}
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {/* Customer */}
                    <TableCell className="py-3">
                      <div className="max-w-[220px]">
                        <div className="min-w-0 text-xs space-y-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[13px] font-semibold text-foreground truncate tracking-tight" title={name}>{name}</span>
                            {name !== "—" && <CopyIconBtn value={name} label="Name" className="shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity" />}
                            <CustomerBadges total={b.total} confirmRate={confirmRate} delivered={b.delivered} />
                          </div>
                          {lock && (
                            <TooltipProvider delayDuration={150}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1 h-[18px] px-1.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-500/40 max-w-[200px]">
                                    <Lock className="h-2.5 w-2.5 shrink-0" />
                                    <span className="truncate">Opened by {lock.user_name ?? "Staff"}</span>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  Currently being edited — click to view / takeover
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {phone && (
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-[11.5px] text-muted-foreground truncate font-mono tabular-nums">{phone}</span>
                              <PhoneActions phone={phone} className="shrink-0" />
                              <CallLogPopover
                                orderId={r.id}
                                currentCount={r.call_attempt_count ?? 0}
                                onSaved={invalidateWebOrders}
                              />
                            </div>
                          )}
                          {address && (
                            <div className="flex items-center gap-1 min-w-0">
                              <span
                                className="text-[11px] text-muted-foreground/80 truncate leading-tight flex-1 max-w-[180px]"
                                title={address}
                              >
                                {address}
                              </span>
                              <CopyIconBtn value={address} label="Address" className="shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity" />
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Note */}
                    <TableCell className="py-3">
                      {note ? (
                        <div className="w-[210px] pl-2.5 border-l-2 border-amber-400/60 dark:border-amber-500/50">
                          <p className="text-[11.5px] leading-snug text-foreground/85 line-clamp-3" title={note}>
                            {note}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/60">—</span>
                      )}
                    </TableCell>

                    {/* Order Items */}
                    <TableCell className="py-3">
                      <div className="flex items-start gap-2">
                        <div className="flex -space-x-1.5">
                          {items.slice(0, 3).map((it, i) => (
                            <Popover key={i}>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-10 w-10 rounded-lg ring-2 ring-card bg-muted overflow-hidden shrink-0 hover:z-10 hover:scale-110 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
                                  title={it.name}
                                >
                                  <ProductThumb src={it.image} alt={it.name} />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent
                                align="start"
                                side="top"
                                className="w-72 p-0 overflow-hidden"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex gap-3 p-3">
                                  <div className="h-[72px] w-[72px] rounded-lg border bg-muted overflow-hidden shrink-0">
                                    <ProductThumb src={it.image} alt={it.name} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm font-semibold leading-tight line-clamp-3">{it.name}</div>
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 border-t bg-muted/30 text-center">
                                  <div className="px-2 py-2 border-r">
                                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Qty</div>
                                    <div className="text-sm font-bold tabular-nums">{it.quantity}</div>
                                  </div>
                                  <div className="px-2 py-2 border-r">
                                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Price</div>
                                    <div className="text-sm font-bold tabular-nums">৳{Number(it.unit_price ?? 0).toLocaleString()}</div>
                                  </div>
                                  <div className="px-2 py-2">
                                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Total</div>
                                    <div className="text-sm font-bold tabular-nums text-primary">৳{(Number(it.unit_price ?? 0) * (it.quantity ?? 0)).toLocaleString()}</div>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          ))}
                          {items.length > 3 && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-10 w-10 rounded-lg ring-2 ring-card bg-muted hover:bg-muted/70 flex items-center justify-center text-[10px] font-semibold text-muted-foreground hover:z-10 hover:scale-110 transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
                                >
                                  +{items.length - 3}
                                </button>
                              </PopoverTrigger>
                              <AllItemsPopover items={items} total={r.total} />
                            </Popover>
                          )}
                        </div>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs space-y-0.5 min-w-0 text-left rounded-md px-2 py-1 hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors"
                            >
                              <div className="text-[13px] font-semibold text-foreground tabular-nums tracking-tight">৳{Number(r.total).toLocaleString()}</div>
                              <div className="text-[11px] text-muted-foreground">
                                {items.length} {items.length === 1 ? "item" : "items"} · {totalQty} qty
                              </div>
                              <AdvanceBadge advance={r.advance_amount} total={r.total} txnId={(r as any).advance_txn_id} variant="full" className="mt-1 items-start" />
                              {r.payment_method && r.payment_method.toLowerCase() !== "cod" && (
                                <span className="mt-1 inline-flex items-center gap-1 h-[18px] px-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-pink-500/10 text-pink-700 dark:text-pink-300 ring-1 ring-inset ring-pink-500/40">
                                  📱 {r.payment_method}
                                </span>
                              )}
                            </button>
                          </PopoverTrigger>
                          <AllItemsPopover items={items} total={r.total} />
                        </Popover>
                      </div>
                    </TableCell>

                    {/* Success Rate */}
                    <TableCell className="py-3">
                      <SuccessBlock
                        total={courier.pathao.total + courier.steadfast.total || b.total}
                        success={courier.pathao.success + courier.steadfast.success || b.confirmed}
                      />
                    </TableCell>

                    {/* Tags */}
                    <TableCell className="py-3 w-[90px]">
                      <AutoTagChips autoTags={autoTags} manualTags={r.tags} max={3} compact />
                    </TableCell>

                    {/* Site */}
                    <TableCell className="py-3">
                      <div className="flex flex-col gap-1 items-start">
                        {(() => {
                          const brandName = isAllBrands
                            ? (r.brand_id ? brandNameById.get(r.brand_id) : null)
                            : activeBrand?.name;
                          return brandName ? <BrandChip name={brandName} /> : null;
                        })()}
                        {(() => {
                          const site = resolveSite(r.source_website);
                          if (!site) return <span className="text-xs text-muted-foreground/60">—</span>;
                          return (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 px-2 h-[20px] rounded-full text-[10.5px] font-medium tracking-tight ring-1 ring-inset max-w-[150px]",
                                site.pillClass,
                              )}
                              title={r.source_website ?? site.label}
                            >
                              <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", site.dotClass)} />
                              <span className="truncate">{site.label}</span>
                            </span>
                          );
                        })()}
                      </div>
                    </TableCell>

                    {/* Source */}
                    <TableCell className="py-3">
                      <SourcePill attribution={r.attribution} siteLabel={siteLabel} />
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="py-3 text-right">
                      <div onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 justify-end">
                        <Button asChild size="sm" variant="ghost" className="h-8 px-3 text-xs font-semibold opacity-60 group-hover/row:opacity-100 group-hover/row:bg-foreground group-hover/row:text-background transition-all">
                          <Link
                            to="/erp/orders/$orderId"
                            params={{ orderId: r.id }}
                            onClick={() => {
                              try {
                                sessionStorage.setItem(
                                  "order-nav-list",
                                  JSON.stringify(filteredRows.map((f) => f.row.id)),
                                );
                              } catch { /* ignore */ }
                            }}
                          >
                            Open
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        {totalRows > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t px-4 py-3 text-sm">
            <div className="flex items-center gap-3">
              <div className="text-xs text-muted-foreground">
                Showing{" "}
                <span className="font-medium text-foreground">
                  {pageSize > 0 ? (page - 1) * pageSize + 1 : 1}
                </span>
                –
                <span className="font-medium text-foreground">
                  {pageSize > 0 ? Math.min(page * pageSize, totalRows) : rows.length}
                </span>
                {" of "}<span className="font-medium text-foreground">{totalRows}</span>
                {ordersQuery.isFetching && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Rows</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => navigate({
                    search: (prev: WebOrdersSearch) => ({ ...prev, pageSize: Number(v), page: 1 }),
                    replace: true,
                  })}
                >
                  <SelectTrigger className="h-8 w-[84px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>{n === 0 ? "All" : n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goToPage(1)}>First</Button>
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" /> Prev
              </Button>
              <span className="px-3 text-xs text-muted-foreground">
                Page <span className="font-medium text-foreground">{page}</span> of {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => goToPage(totalPages)}>Last</Button>
            </div>
          </div>
        )}
      </div>
      )}
      </div>

      <OrderDrawer orderId={openId} onClose={() => setOpenId(null)} mode="web" />

      <WebBulkActionBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onStatus={(s) => bulkStatus.mutate(s)}
        onPrintInvoices={() => { if (selectedIds.size > 0) setPrintOpen(true); }}
        onBookCourier={() => { if (selectedIds.size > 0) setPathaoBulkOpen(true); }}
        onAddTag={(tag) => bulkAddTag.mutate(tag)}
        isPending={bulkStatus.isPending || bulkAddTag.isPending}
      />

      <BulkPrintDialog
        open={printOpen}
        onOpenChange={(o) => setPrintOpen(o)}
        mode="invoice"
        orderIds={Array.from(selectedIds)}
      />

      <PathaoBulkUploadDialog
        open={pathaoBulkOpen}
        onOpenChange={(o) => { setPathaoBulkOpen(o); if (!o) setSelectedIds(new Set()); }}
        orders={selectedOrderRows.map((r) => ({ id: r.id, invoice_no: null }))}
      />
    </div>
  );
}