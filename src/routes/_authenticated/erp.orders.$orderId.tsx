import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft, Printer, Truck, Loader2, Phone, MessageCircle, Plus, Minus, Trash2,
  Search, Star, Tag as TagIcon, XCircle, Smartphone, Save, Undo2, CheckCircle2,
  ChevronLeft, ChevronRight, RotateCcw, Repeat, Copy, Check, MapPin, ShieldCheck, ShieldAlert, CalendarClock, RefreshCw,
  ChevronDown,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PreorderConvertDialog } from "@/components/erp/orders/preorder-convert-dialog";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchCourierHistoryFn } from "@/lib/erp/courier-history.functions";
import { pathaoCitiesFn, pathaoZonesFn, pathaoAreasFn, pathaoDetectForOrderFn, pathaoMatchAddressFn } from "@/lib/erp/pathao.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useOrderDetail } from "@/hooks/erp/use-orders-query";
import { customerName, customerPhone, invoiceDisplay, settlementBadge, statusBadge, type OrderStatus } from "@/lib/erp/orders";
import { PrintableInvoice } from "@/components/erp/orders/order-invoice";
import { BookPathaoDialog } from "@/components/erp/courier/book-pathao-dialog";
import { BookSteadfastDialog } from "@/components/erp/courier/book-steadfast-dialog";
import {
  OrderTimeline, ShipmentPanel, CustomerHistoryPanel, AttributionPanel,
  ReturnDialog, ExchangeDialog, useOrderNeighbors, OrderCasesPanel, ActivityLogPanel,
} from "@/components/erp/orders/order-detail-extras";
import { useCurrentRole } from "@/hooks/use-current-role";
import { useOrderLock } from "@/hooks/erp/use-order-lock";
import type { OrderLockState } from "@/hooks/erp/use-order-lock";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/orders/$orderId")({
  head: () => ({ meta: [{ title: "Web Order Details — ERP" }] }),
  component: OrderDetailsPage,
});

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function normalizePhone(raw: string) {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("880")) return "0" + digits.slice(3);
  if (digits.length === 10 && digits.startsWith("1")) return "0" + digits;
  return digits;
}

function bdtCompact(n: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n || 0);
}

function parseMoneyText(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function normalizePaymentSource(value: string | null): string | null {
  const s = (value ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s.includes("bkash") || s.includes("b-kash") || s.includes("বিকাশ")) return "bKash";
  if (s.includes("nagad")) return "Nagad";
  if (s.includes("rocket")) return "Rocket";
  if (s.includes("upay")) return "Upay";
  if (s.includes("bank")) return "Bank";
  if (s.includes("card") || s.includes("visa") || s.includes("master")) return "Card";
  return value?.trim() || null;
}

function parseWebsiteAdvanceDetails(text: string) {
  const advanceMatch = text.match(/(?:advance\s*(?:paid|payment|amount)?|paid\s*advance)\s*[:\-]?\s*(?:৳|tk\.?|bdt)?\s*([0-9,]+(?:\.[0-9]+)?)/i);
  const dueMatch = text.match(/(?:due\s*(?:on\s*delivery|amount)?|cod\s*due)\s*[:\-]?\s*(?:৳|tk\.?|bdt)?\s*([0-9,]+(?:\.[0-9]+)?)/i);
  const sourceMatch = text.match(/(?:payment(?:\s*method)?|method|source)\s*[:\-]\s*([A-Za-z\- ]{2,24})/i);
  const phoneMatch = text.match(/(?:from|sender|payment\s*(?:no|number)|(?:b\s*-?kash|bkash|nagad|rocket)\s*(?:no|number))\s*[:\-]\s*(\+?\d[\d\s\-]{5,24})/i);
  const txnMatch = text.match(/(?:trx\s*id|trxid|transaction\s*id|txn\s*id|txn)\s*[:\-]\s*([A-Za-z0-9_-]{4,60})/i);
  return {
    amount: parseMoneyText(advanceMatch?.[1]),
    due: parseMoneyText(dueMatch?.[1]),
    source: normalizePaymentSource(sourceMatch?.[1] ?? null),
    paymentNumber: phoneMatch?.[1]?.replace(/[^0-9+]/g, "") ?? null,
    txnId: txnMatch?.[1] ?? null,
  };
}

function isWebsiteOrderSource(order: { source?: string | null; source_platform?: string | null; source_website?: string | null } | null | undefined) {
  const text = [order?.source, order?.source_platform, order?.source_website].filter(Boolean).join(" ").toLowerCase();
  return /website|pixel|utm|direct|organic|shopify|hobbyshop|toyora/.test(text);
}

function pathaoSourceLabel(source?: string) {
  if (source === "pathao_address_parser") return "Pathao merchant address parser";
  return source ?? "";
}

function sourceLabel(source?: string | null): string {
  if (!source) return "—";
  const s = source.toLowerCase();
  if (s === "pixel" || s === "website" || s === "utm" || s === "direct" || s === "organic") return "Website";
  if (s === "facebook" || s === "fb" || s === "meta") return "Facebook";
  if (s === "instagram" || s === "ig") return "Instagram";
  if (s === "google") return "Google";
  return source;
}

function CopyChip({ value, className, children }: { value: string; className?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          toast.success("Copied to clipboard");
          setTimeout(() => setCopied(false), 1200);
        }).catch(() => toast.error("Copy failed"));
      }}
      className={cn("group inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-gray-100 dark:hover:bg-muted/50 transition-colors", className)}
      title="Click to copy"
    >
      {children}
      {copied
        ? <Check className="h-3 w-3 text-emerald-600" />
        : <Copy className="h-3 w-3 text-gray-300 group-hover:text-gray-500 transition-colors" />}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stats strip — donut design (ours) + RedX + Fraud Note                      */
/* -------------------------------------------------------------------------- */

/** Unified section shell — optionally collapsible to keep the page calm. */
function Panel({
  title, accent = "bg-gray-300", right, children, collapsible = false, defaultOpen = true, className, bodyClassName, lazy = false,
}: {
  title: React.ReactNode;
  accent?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  className?: string;
  bodyClassName?: string;
  lazy?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = collapsible ? open : true;
  return (
    <section className={cn("surface-panel rise-in group/panel relative rounded-2xl overflow-hidden", lazy && "lazy-panel", className)}>
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/10" />
      <header className="surface-head px-4 py-3 sm:px-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <button
          type="button"
          disabled={!collapsible}
          onClick={() => setOpen((v) => !v)}
          className={cn("flex min-w-0 items-center gap-2.5 text-left", collapsible && "group cursor-pointer")}
        >
          <span className={cn("h-5 w-1.5 shrink-0 rounded-full transition-transform duration-300 group-hover/panel:scale-y-110", accent)} />
          <h3 className="font-display truncate text-[13px] font-semibold tracking-tight text-gray-900 dark:text-foreground">{title}</h3>
          {collapsible && (
            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-300", isOpen && "rotate-180")} />
          )}
        </button>
        {right ? <div className="shrink-0">{right}</div> : null}
      </header>
      {isOpen && (
        <div className={cn("border-t border-gray-100 dark:border-border", bodyClassName ?? "p-4 sm:p-5")}>{children}</div>
      )}
    </section>
  );
}

type StatCell = { total: number; success: number; cancel: number };

const STAT_COLUMNS = [
  { key: "ourRecord", label: "Our Record", dot: "bg-indigo-500", bar: "bg-indigo-500", tint: "from-indigo-500/[0.07]" },
  { key: "overall",   label: "Overall",    dot: "bg-sky-500",    bar: "bg-sky-500",    tint: "from-sky-500/[0.07]" },
  { key: "pathao",    label: "Pathao",     dot: "bg-rose-500",   bar: "bg-rose-500",   tint: "from-rose-500/[0.07]" },
  { key: "steadfast", label: "Other couriers",  dot: "bg-amber-500",  bar: "bg-amber-500",  tint: "from-amber-500/[0.07]" },
] as const;

type CourierRow = { name: string; label: string; total: number; success: number; cancel: number };

function toneFor(pct: number, empty: boolean) {
  if (empty) return { text: "text-muted-foreground/60", ring: "stroke-muted-foreground/30", bar: "bg-muted-foreground/30", chip: "bg-muted/40 text-muted-foreground ring-border", glow: "" };
  if (pct >= 80) return { text: "text-emerald-600 dark:text-emerald-400", ring: "stroke-emerald-500", bar: "bg-emerald-500", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30", glow: "shadow-[0_0_16px_-2px_rgba(16,185,129,0.4)]" };
  if (pct >= 50) return { text: "text-amber-600 dark:text-amber-400", ring: "stroke-amber-500", bar: "bg-amber-500", chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/30", glow: "shadow-[0_0_16px_-2px_rgba(245,158,11,0.4)]" };
  return { text: "text-rose-600 dark:text-rose-400", ring: "stroke-rose-500", bar: "bg-rose-500", chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/30", glow: "shadow-[0_0_16px_-2px_rgba(244,63,94,0.4)]" };
}

/** Bangla verdict for a success percentage. */
function banglaVerdict(pct: number, empty: boolean) {
  if (empty) return { label: "তথ্য নেই", chip: "bg-muted/50 text-muted-foreground ring-border" };
  if (pct >= 80) return { label: "ভালো", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30" };
  if (pct >= 50) return { label: "মিডিয়াম", chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/30" };
  return { label: "খারাপ", chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/30" };
}

function StatsStrip({
  stats,
  customerName: cname,
  fraudNote,
  onRefresh,
  refreshing,
  loading,
  couriers = [],
}: {
  stats: Record<string, StatCell>;
  customerName: string;
  fraudNote: string;
  onRefresh: () => void;
  refreshing: boolean;
  loading?: boolean;
  couriers?: CourierRow[];
}) {
  // Hide cards without data: Our Record/RedX/Steadfast/Pathao hide if total===0.
  // Overall always shown when any provider has data.
  void cname;
  const visibleColumns = STAT_COLUMNS.filter((c) => {
    const s = stats[c.key];
    if (!s) return false;
    if (c.key === "overall") {
      return (stats.pathao?.total ?? 0) + (stats.steadfast?.total ?? 0) > 0;
    }
    return s.total > 0;
  });
  const showFraud = !!fraudNote.trim();
  const cardCount = visibleColumns.length + (showFraud ? 1 : 0);
  // While courier history is loading on first paint, show skeleton placeholders
  // so the strip does not flicker in/out on page reload.
  if (loading && cardCount === 0) {
    return (
      <div className="rounded-2xl border bg-card overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)]">
        <div className="grid grid-cols-2 sm:grid-cols-2 divide-x divide-y sm:divide-y-0 divide-border/60">
          {[0, 1].map((i) => (
            <div key={i} className="px-4 py-4 space-y-3">
              <div className="h-3 w-20 rounded bg-muted/60 animate-pulse" />
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-muted/60 animate-pulse" />
                <div className="space-y-1.5">
                  <div className="h-3 w-16 rounded bg-muted/60 animate-pulse" />
                  <div className="h-3 w-20 rounded bg-muted/60 animate-pulse" />
                  <div className="h-3 w-14 rounded bg-muted/60 animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  const courierRows = couriers
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
  if (cardCount === 0 && courierRows.length === 0) return null;
  // Hero = Overall if present, else the first visible column.
  const heroCol = visibleColumns.find((c) => c.key === "overall") ?? visibleColumns[0];
  const subCols = visibleColumns.filter((c) => c.key !== heroCol?.key);
  const hero = heroCol ? stats[heroCol.key]! : null;
  const heroDenom = hero ? hero.success + hero.cancel : 0;
  const heroPct = heroDenom > 0 ? Math.round((hero!.success / heroDenom) * 100) : 0;
  const heroTone = toneFor(heroPct, heroDenom === 0);
  const R = 15;
  const C = 2 * Math.PI * R;
  return (
    <div className="rounded-2xl border bg-card overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)]">
      {/* Header: single hero ring + compact per-source pills + refresh */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3.5">
        {hero && (
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
                <circle cx="18" cy="18" r={R} className="fill-none stroke-muted/60" strokeWidth="3" />
                <circle cx="18" cy="18" r={R}
                  className={cn("fill-none transition-all duration-700 ease-out", heroTone.ring)}
                  strokeWidth="3.5" strokeLinecap="round" strokeDasharray={C}
                  strokeDashoffset={heroDenom === 0 ? C : C * (1 - heroPct / 100)} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={cn("text-sm font-bold tabular-nums", heroTone.text)}>
                  {heroDenom === 0 ? "—" : `${heroPct}%`}
                </span>
              </div>
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Success rate
                </span>
                <span className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset",
                  banglaVerdict(heroPct, heroDenom === 0).chip,
                )}>
                  {banglaVerdict(heroPct, heroDenom === 0).label}
                </span>
              </div>
              <div className="text-sm font-semibold tabular-nums text-foreground">
                {hero.success}<span className="text-muted-foreground/60">/{heroDenom || hero.total}</span>
                <span className="ml-2 text-xs font-medium text-rose-600 dark:text-rose-400">{hero.cancel} cancel</span>
              </div>
            </div>
          </div>
        )}

        {subCols.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {subCols.map((c) => {
              const s = stats[c.key]!;
              const denom = s.success + s.cancel;
              const pct = denom > 0 ? Math.round((s.success / denom) * 100) : 0;
              const t = toneFor(pct, denom === 0);
              return (
                <span
                  key={c.key}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-muted/30 px-2.5 py-1 text-[11px]"
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
                  <span className="text-muted-foreground">{c.label}</span>
                  <span className={cn("font-bold tabular-nums", t.text)}>{denom === 0 ? "—" : `${pct}%`}</span>
                  <span className="tabular-nums text-muted-foreground/70">{s.success}/{denom || s.total}</span>
                </span>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
          {refreshing ? "Refreshing" : "Refresh"}
        </button>
      </div>

      {/* Per-courier breakdown */}
      {(courierRows.length > 0 || loading || refreshing) && (
        <div className="border-t border-border/60">
          {courierRows.length === 0 ? (
            <p className="px-4 py-2.5 text-[11px] text-muted-foreground/70">Courier data ashche...</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {courierRows.map((c) => {
                const denom = c.success + c.cancel;
                const pct = denom > 0 ? Math.round((c.success / denom) * 100) : 0;
                const t = toneFor(pct, denom === 0);
                return (
                  <li key={c.name} className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-muted/30">
                    <span className="w-24 shrink-0 truncate text-[11px] font-medium text-foreground">{c.label}</span>
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full rounded-full transition-all duration-700", t.bar)} style={{ width: `${denom === 0 ? 0 : pct}%` }} />
                    </div>
                    <span className={cn("w-9 shrink-0 text-right text-[11px] font-bold tabular-nums", t.text)}>
                      {denom === 0 ? "—" : `${pct}%`}
                    </span>
                    <span className={cn(
                      "w-16 shrink-0 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold ring-1 ring-inset",
                      banglaVerdict(pct, denom === 0).chip,
                    )}>
                      {banglaVerdict(pct, denom === 0).label}
                    </span>
                    <span className="w-14 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                      {c.success}/{denom || c.total}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {showFraud && (
        <div className="border-t border-border/60 bg-muted/20 px-4 py-2.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Fraud note</span>
          <p className="mt-1 text-[11px] leading-snug text-foreground/80 whitespace-pre-wrap">{fraudNote}</p>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Field shell                                                                */
/* -------------------------------------------------------------------------- */

function FieldShell({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Click to Add Products panel                                                */
/* -------------------------------------------------------------------------- */

type ProductLite = {
  id: string;
  title: string;
  price: number;
  image: string | null;
  stock: number;
  is_featured: boolean | null;
};

type VariantLite = {
  id: string;
  product_id: string;
  color_name: string | null;
  color_hex: string | null;
  sku: string | null;
  image: string | null;
  stock: number | null;
};

function ProductSearchPanel({
  brandId, onAdd,
}: { brandId: string | null; onAdd: (p: ProductLite, v?: VariantLite) => void }) {
  const [codeQ, setCodeQ] = useState("");
  const [nameQ, setNameQ] = useState("");
  const [debounced, setDebounced] = useState({ code: "", name: "" });

  useEffect(() => {
    const t = setTimeout(() => setDebounced({ code: codeQ.trim(), name: nameQ.trim() }), 300);
    return () => clearTimeout(t);
  }, [codeQ, nameQ]);

  const { data: results, isFetching } = useQuery({
    queryKey: ["erp-product-search", brandId, debounced],
    enabled: !!brandId,
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id,title,price,image,stock,is_featured,slug")
        .eq("brand_id", brandId!)
        .eq("is_active", true)
        .order("is_featured", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20);
      if (debounced.name) q = q.ilike("title", `%${debounced.name}%`);
      if (debounced.code) q = q.or(`slug.ilike.%${debounced.code}%,id.eq.${debounced.code}`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as (ProductLite & { slug: string })[];
    },
  });

  const productIds = (results ?? []).map((p) => p.id);
  const { data: variantsByProduct } = useQuery({
    queryKey: ["erp-product-search-variants", productIds],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id,product_id,color_name,color_hex,sku,image,stock")
        .in("product_id", productIds)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      const map = new Map<string, VariantLite[]>();
      for (const v of (data ?? []) as VariantLite[]) {
        const arr = map.get(v.product_id) ?? [];
        arr.push(v);
        map.set(v.product_id, arr);
      }
      return map;
    },
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FieldShell label="Code/sku">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={codeQ} onChange={(e) => setCodeQ(e.target.value)} placeholder="Type to Search…" className="h-8 pl-7 text-xs" />
          </div>
        </FieldShell>
        <FieldShell label="Name">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={nameQ} onChange={(e) => setNameQ(e.target.value)} placeholder="Type to Search…" className="h-8 pl-7 text-xs" />
          </div>
        </FieldShell>
      </div>
      <div className="max-h-[360px] overflow-y-auto -mx-2">
        {isFetching && (results ?? []).length === 0 && (
          <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        )}
        {!isFetching && (results ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">No products found</p>
        )}
        <ul className="divide-y">
          {(results ?? []).map((p) => (
            <li key={p.id} className="px-2 py-2 hover:bg-muted/40 transition-colors">
             <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                {p.image
                  ? <img src={p.image} alt="" className="h-full w-full object-cover" />
                  : <span className="text-[8px] text-muted-foreground">No Image</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate flex items-center gap-1">
                  {p.is_featured && <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />}
                  {p.title}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">SKU: {p.slug?.slice(0, 24) ?? p.id.slice(0, 8)}</div>
                <div className="flex items-center gap-2 text-[10px] mt-0.5">
                  <span className="text-rose-600">Price: ৳{bdtCompact(Number(p.price))}</span>
                  <span className={cn("text-muted-foreground", p.stock <= 0 && "text-rose-600")}>Stock: {p.stock}</span>
                </div>
              </div>
              {(variantsByProduct?.get(p.id)?.length ?? 0) === 0 ? (
                <Button size="sm" variant="outline" className="h-7 px-2"
                  onClick={() => onAdd({ id: p.id, title: p.title, price: Number(p.price), image: p.image, stock: p.stock, is_featured: p.is_featured })}>
                  <Plus className="h-3 w-3" />
                </Button>
              ) : (
                <span className="shrink-0 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                  Select color
                </span>
              )}
             </div>
             {(variantsByProduct?.get(p.id)?.length ?? 0) > 0 && (
               <div className="mt-2 flex flex-wrap gap-1.5 pl-[52px]">
                 {(variantsByProduct?.get(p.id) ?? []).map((v) => {
                   const out = (v.stock ?? 0) <= 0;
                   return (
                     <button
                       key={v.id}
                       type="button"
                        title={`Add ${v.color_name ?? "variant"}${out ? " (backorder)" : ""}`}
                       onClick={() => onAdd({ id: p.id, title: p.title, price: Number(p.price), image: p.image, stock: p.stock, is_featured: p.is_featured }, v)}
                       className={cn(
                         "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium transition-colors",
                          "hover:border-indigo-400 hover:bg-indigo-500/10",
                          out && "border-dashed",
                       )}
                     >
                       <span className="h-3 w-3 rounded-full border shrink-0" style={{ background: v.color_hex || "transparent" }} />
                       <span className="truncate max-w-[90px]">{v.color_name ?? v.sku ?? "Variant"}</span>
                       <span className="tabular-nums text-muted-foreground">{v.stock ?? 0}</span>
                       <Plus className="h-2.5 w-2.5" />
                     </button>
                   );
                 })}
               </div>
             )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

type WebStatus =
  | "processing" | "incomplete" | "good_but_no_response" | "no_response"
  | "advance_payment" | "on_hold" | "complete" | "cancelled";

const WEB_STATUSES: { key: WebStatus; label: string }[] = [
  { key: "processing", label: "Processing" },
  { key: "incomplete", label: "Incomplete" },
  { key: "good_but_no_response", label: "Good But No Response" },
  { key: "no_response", label: "No Response" },
  { key: "advance_payment", label: "Advance Payment" },
  { key: "on_hold", label: "On Hold" },
  { key: "complete", label: "Complete" },
  { key: "cancelled", label: "Cancel" },
];

function OrderDetailsPage() {
  const { orderId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useOrderDetail(orderId);
  const orderLock = useOrderLock(orderId);
  const detectFn = useServerFn(pathaoDetectForOrderFn);
  const matchAddressFn = useServerFn(pathaoMatchAddressFn);

  // Kick off Pathao city/zone/area detection the moment the order opens, so
  // the booking dialog (and form below) have instant pre-filled values.
  const { data: pathaoDetected } = useQuery({
    queryKey: ["pathao-detect", orderId],
    queryFn: async () =>
      (await detectFn({ data: { orderId } })) as {
        city: { id: number; name: string } | null;
        zone: { id: number; name: string } | null;
        area: { id: number; name: string } | null;
        source: string;
        confidence?: number;
      },
    enabled: !!data?.order,
    staleTime: 1000 * 60 * 10,
    retry: false,
  });

  const order = data?.order;
  const items = data?.items ?? [];
  const notes = data?.notes ?? [];
  const [preorderOpen, setPreorderOpen] = useState(false);
  const phone = order ? normalizePhone(customerPhone(order)) : "";

  /* ------------------------------ Local form state ------------------------- */

  const [form, setForm] = useState({
    mobile: "", name: "", delivery_method: "", address: "", shipping_note: "",
    city_id: "", zone_id: "", area_id: "",
    source_platform: "", is_preorder: false, is_cross_sale: false,
    discount: 0, advance: 0, shipping_fee: 0,
    advance_source: "", advance_payment_number: "", advance_txn_id: "",
    note_input: "", tag_input: "",
  });
  const [baseline, setBaseline] = useState<typeof form | null>(null);
  const [formReady, setFormReady] = useState(false);

  useEffect(() => {
    if (!order) return;
    setForm((f) => {
      const next = {
        ...f,
        mobile: phone,
        name: customerName(order),
        delivery_method: order.delivery_method ?? "",
        address: order.shipping_address ?? "",
        shipping_note: order.shipping_note ?? "",
        city_id: order.pathao_city_id != null ? String(order.pathao_city_id) : "",
        zone_id: order.pathao_zone_id != null ? String(order.pathao_zone_id) : "",
        area_id: order.pathao_area_id != null ? String(order.pathao_area_id) : "",
        source_platform: order.source_platform ?? order.source_website ?? "Website",
        is_preorder: !!order.is_preorder,
        is_cross_sale: !!order.is_cross_sale,
        discount: Number(order.discount_amount ?? 0),
        advance: Number(order.advance_amount ?? 0),
        shipping_fee: Number(order.shipping_fee ?? 0),
        advance_source: order.advance_source ?? "",
        advance_payment_number: order.advance_payment_number ?? "",
        advance_txn_id: order.advance_txn_id ?? "",
      };
      setBaseline(next);
      return next;
    });
    setDraftWebStatus((order.web_status as WebStatus) ?? "");
    setFormReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  // When Pathao detection comes back, use the live Pathao route for the
  // current address. Old saved IDs can be stale/wrong, so address detection
  // intentionally wins until the operator manually changes the dropdowns.
  useEffect(() => {
    if (!pathaoDetected || !formReady) return;
    if (pathaoDetected.city) {
      setDetection({
        city: { id: String(pathaoDetected.city.id), name: pathaoDetected.city.name },
        zone: pathaoDetected.zone ? { id: String(pathaoDetected.zone.id), name: pathaoDetected.zone.name } : undefined,
        area: pathaoDetected.area ? { id: String(pathaoDetected.area.id), name: pathaoDetected.area.name } : undefined,
        source: pathaoDetected.source,
        confidence: pathaoDetected.confidence,
      });
      setCitySuggestions([]);
    }
    setForm((f) => {
      const next = { ...f };
      if (pathaoDetected.city) next.city_id = String(pathaoDetected.city.id);
      if (pathaoDetected.zone) next.zone_id = String(pathaoDetected.zone.id);
      else next.zone_id = "";
      if (pathaoDetected.area) next.area_id = String(pathaoDetected.area.id);
      else next.area_id = "";
      return next;
    });
  }, [pathaoDetected, formReady]);

  /* ------------------------------ Pathao geo cascades ---------------------- */

  const fetchCities = useServerFn(pathaoCitiesFn);
  const fetchZones = useServerFn(pathaoZonesFn);
  const fetchAreas = useServerFn(pathaoAreasFn);

  const { data: cities } = useQuery({
    queryKey: ["pathao-cities", order?.brand_id],
    enabled: !!order,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const r = await fetchCities({ data: order?.brand_id ? { brandId: order.brand_id } : {} });
      return ((r as { items: { city_id: number; city_name: string }[] }).items ?? []).map((c) => ({
        id: String(c.city_id),
        name_en: c.city_name,
      }));
    },
  });
  const { data: zones } = useQuery({
    queryKey: ["pathao-zones", form.city_id, order?.brand_id],
    enabled: !!form.city_id,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const r = await fetchZones({ data: { cityId: Number(form.city_id), brandId: order?.brand_id ?? undefined } });
      return ((r as { items: { zone_id: number; zone_name: string }[] }).items ?? []).map((z) => ({
        id: String(z.zone_id),
        name_en: z.zone_name,
      }));
    },
  });
  const { data: areas } = useQuery({
    queryKey: ["pathao-areas", form.zone_id, order?.brand_id],
    enabled: !!form.zone_id,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const r = await fetchAreas({ data: { zoneId: Number(form.zone_id), brandId: order?.brand_id ?? undefined } });
      return ((r as { items: { area_id: number; area_name: string }[] }).items ?? []).map((a) => ({
        id: String(a.area_id),
        name_en: a.area_name,
      }));
    },
  });

  /* ----------------------- Smart address auto-detection -------------------- */

  type Hit = { id: string; name: string };
  type Detection = { city: Hit; zone?: Hit; area?: Hit; source?: string; confidence?: number };
  const [detection, setDetection] = useState<Detection | null>(null);
  const [citySuggestions, setCitySuggestions] = useState<Hit[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [detectionAttempted, setDetectionAttempted] = useState(false);
  const [confirmAttempted, setConfirmAttempted] = useState(false);
  const detectCacheRef = useRef<Map<string, { detection: Detection | null; suggestions: Hit[] }>>(new Map());
  const lastDetectedAddrRef = useRef<string>("");

  const runDetection = async (address: string, applyResult: boolean) => {
    const trimmed = address.trim();
    if (trimmed.length < 10) return;
    const cached = detectCacheRef.current.get(trimmed);
    if (cached) {
      setCitySuggestions(cached.suggestions);
      if (applyResult && cached.detection) applyDetection(cached.detection);
      return;
    }
    setDetecting(true);
    try {
      const r: any = await matchAddressFn({ data: { address: trimmed, brandId: order?.brand_id ?? undefined } });
      if (!r?.found || !r.city) {
        detectCacheRef.current.set(trimmed, { detection: null, suggestions: [] });
        setCitySuggestions([]);
        return;
      }
      const detected: Detection = {
        city: { id: String(r.city.id), name: r.city.name },
        zone: r.zone ? { id: String(r.zone.id), name: r.zone.name } : undefined,
        area: r.area ? { id: String(r.area.id), name: r.area.name } : undefined,
        source: r.source,
        confidence: r.confidence,
      };
      detectCacheRef.current.set(trimmed, { detection: detected, suggestions: [] });
      setCitySuggestions([]);
      if (applyResult) applyDetection(detected);
    } catch (e) {
      toast.error((e as Error).message || "Pathao location detect failed");
    } finally {
      setDetecting(false);
    }
  };

  const applyDetection = (d: Detection) => {
    setDetection(d);
    setForm((f) => ({
      ...f,
      city_id: d.city.id,
      zone_id: d.zone?.id ?? "",
      area_id: d.area?.id ?? "",
    }));
  };

  // Debounced auto-detection on address change
  useEffect(() => {
    const addr = form.address.trim();
    if (addr === lastDetectedAddrRef.current) return;
    if (addr.length < 10) {
      setCitySuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      lastDetectedAddrRef.current = addr;
      void runDetection(addr, true);
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.address]);

  // Auto-detect immediately on order load; current address wins over stale saved Pathao IDs.
  useEffect(() => {
    if (!formReady) return;
    if (!order?.shipping_address) return;
    const addr = order.shipping_address.trim();
    if (addr.length < 10) return;
    if (lastDetectedAddrRef.current === addr) return;
    const timer = setTimeout(() => {
      lastDetectedAddrRef.current = addr;
      setDetectionAttempted(true);
      void runDetection(addr, true);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, formReady]);

  // Clear the "✓ Detected" chip when user changes city manually away from detection
  useEffect(() => {
    if (detection && detection.city.id !== form.city_id) setDetection(null);
  }, [form.city_id, detection]);

  /* ------------------------------ Courier history -------------------------- */

  const { data: ourRecord } = useQuery({
    queryKey: ["customer-our-record-all", phone, orderId],
    enabled: !!phone,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,status,web_status,shipping_phone,guest_phone,brand_id")
        .or(`shipping_phone.eq.${phone},guest_phone.eq.${phone}`)
        .neq("id", orderId)
        .limit(2000);
      if (error) throw error;
      let total = 0, success = 0, cancel = 0;
      (data ?? []).forEach((o) => {
        total++;
        const s = (o.status ?? "") + " " + (o.web_status ?? "");
        if (/deliver|complete/i.test(s)) success++;
        else if (/cancel|fake|return/i.test(s)) cancel++;
      });
      return { total, success, cancel };
    },
  });

  const fetchCourierHistory = useServerFn(fetchCourierHistoryFn);
  const [refreshing, setRefreshing] = useState(false);

  // FAST PATH: read the DB-cached row directly so cards appear instantly on reload
type HistProvider = { name: string; label?: string; total: number; success: number; cancelled: number; ok: boolean; error?: string };

/** Pathao = our own API; every other courier comes from BDCourier and is summed together. */
function splitCourierProviders(providers?: HistProvider[] | null) {
  const list = providers ?? [];
  const pathao = list.find((p) => p.name === "pathao");
  const others = list.filter((p) => p.name !== "pathao");
  const okOthers = others.filter((p) => p.ok);
  const failed = others.find((p) => !p.ok);
  return {
    pathao: { total: pathao?.total ?? 0, success: pathao?.success ?? 0, cancel: pathao?.cancelled ?? 0 },
    steadfast: {
      total: okOthers.reduce((s, p) => s + p.total, 0),
      success: okOthers.reduce((s, p) => s + p.success, 0),
      cancel: okOthers.reduce((s, p) => s + p.cancelled, 0),
    },
    steadfastError: okOthers.length > 0 ? "" : failed?.error ?? "",
    couriers: list
      .filter((p) => p.ok)
      .map((p) => ({
        name: p.name,
        label: p.label ?? p.name.charAt(0).toUpperCase() + p.name.slice(1),
        total: p.total,
        success: p.success,
        cancel: p.cancelled,
      })),
  };
}

  const { data: cachedCourierHistory } = useQuery({
    queryKey: ["courier-history-cache", phone],
    enabled: !!phone && phone.length >= 11,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("courier_history_cache")
        .select("data")
        .eq("phone", phone)
        .maybeSingle();
      const hist = data?.data as { providers?: HistProvider[] } | null;
      if (!hist) return null;
      return splitCourierProviders(hist.providers);
    },
  });

  // SLOW PATH: hits external couriers if cache stale; runs in background
  const { data: freshCourierHistory, refetch: refetchHistory, isFetching: courierFetching } = useQuery({
    queryKey: ["courier-history", order?.brand_id, phone],
    enabled: !!order?.brand_id && !!phone && phone.length >= 11,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { results } = await fetchCourierHistory({ data: { phones: [phone], brandId: order!.brand_id! } });
      const r = results[phone];
      return splitCourierProviders(r?.providers);
    },
  });
  // Prefer fresh data when available; fall back to cached for instant render
  const courierHistory = freshCourierHistory ?? cachedCourierHistory;
  const courierLoading = !cachedCourierHistory && !freshCourierHistory && courierFetching;

  const stats = useMemo<Record<string, StatCell>>(() => {
    const our = ourRecord ?? { total: 0, success: 0, cancel: 0 };
    const pathao = courierHistory?.pathao ?? { total: 0, success: 0, cancel: 0 };
    const steadfast = courierHistory?.steadfast ?? { total: 0, success: 0, cancel: 0 };
    const overall = {
      total: pathao.total + steadfast.total,
      success: pathao.success + steadfast.success,
      cancel: pathao.cancel + steadfast.cancel,
    };
    return { ourRecord: our, overall, pathao, steadfast };
  }, [ourRecord, courierHistory]);

  /* ------------------------------ Item arithmetic -------------------------- */

  const itemsSubtotal = useMemo(
    () => items.reduce(
      (s, it) => (it as any).is_combo_child
        ? s
        : s + Number(it.line_total ?? Number(it.unit_price ?? it.price) * it.quantity),
      0,
    ),
    [items],
  );
  const grandTotal = Math.max(0, itemsSubtotal + Number(form.shipping_fee) - Number(form.discount) - Number(form.advance));

  /* ------------------------------ Live stock per item ---------------------- */
  const productIds = useMemo(() => Array.from(new Set(items.map((it) => it.product_id).filter(Boolean))), [items]);
  const { data: stockMap } = useQuery({
    queryKey: ["order-item-stock", productIds.sort().join(",")],
    enabled: productIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, stock").in("id", productIds);
      const m = new Map<string, number>();
      (data ?? []).forEach((p: any) => m.set(p.id, Number(p.stock ?? 0)));
      return m;
    },
  });

  /* ------------------------------ Session device info ---------------------- */
  const { data: sessionInfo } = useQuery({
    queryKey: ["order-session-info", orderId],
    queryFn: async () => {
      const { data } = await supabase
        .from("analytics_events")
        .select("device_type, user_agent")
        .eq("order_id", orderId)
        .not("device_type", "is", null)
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      return data;
    },
  });

  /* ------------------------------ Prev/Next navigation --------------------- */
  const neighbors = useOrderNeighbors(orderId);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "ArrowLeft" && neighbors.prev) navigate({ to: "/erp/orders/$orderId", params: { orderId: neighbors.prev } });
      else if (e.key === "ArrowRight" && neighbors.next) navigate({ to: "/erp/orders/$orderId", params: { orderId: neighbors.next } });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [neighbors.prev, neighbors.next, navigate]);

  /* ------------------------------ Role for note delete --------------------- */
  const { isAdmin, userId: currentUserId } = useCurrentRole();

  /* ------------------------------ Mutations -------------------------------- */

  const invalidate = () => qc.invalidateQueries({ queryKey: ["order-detail", orderId] });

  const getAdvanceValidationError = () => {
    if (Number(form.advance) <= 0) return null;
    // Payment already verified (bKash/Nagad screenshot check) — number optional.
    if (order?.verified_at) return null;
    if (!form.advance_source) return "Select advance payment source";
    if (!form.advance_payment_number || form.advance_payment_number.length < 4) return "Enter payment number or last 4 digits";
    return null;
  };

  const updateStatus = useMutation({
    mutationFn: async (status: OrderStatus) => {
      const { error } = await supabase.rpc("transition_order_status", { _order_id: orderId, _new_status: status });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status updated"); qc.invalidateQueries({ queryKey: ["orders"] }); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const verifyPayment = useMutation({
    mutationFn: async (verify: boolean) => {
      // Payable = items + delivery − discount (advance বাদে)
      const payable = Math.max(0, itemsSubtotal + Number(form.shipping_fee) - Number(form.discount));
      const currentAdvance = Number(form.advance || order?.advance_amount || 0);
      const advanceText = [
        order?.notes,
        order?.customer_note,
        order?.latest_note,
        ...notes.map((n) => n.body),
      ].filter(Boolean).join("\n");
      const parsedAdvance = parseWebsiteAdvanceDetails(advanceText);
      const websiteOrder = isWebsiteOrderSource(order);
      const authoritativeAdvance = parsedAdvance.amount != null ? parsedAdvance.amount : currentAdvance;
      if (verify && websiteOrder && order?.is_preorder && parsedAdvance.amount == null) {
        throw new Error("Website pre-order advance missing — enter the actual paid amount before verifying.");
      }
      if (verify && websiteOrder && authoritativeAdvance <= 0) {
        throw new Error("Website advance amount missing — enter the actual paid amount before verifying.");
      }
      const verifiedAdvance = authoritativeAdvance > 0 ? Math.min(payable, authoritativeAdvance) : payable;
      const remainingDue = Math.max(0, payable - verifiedAdvance);
      const keepPreorderAdvance = !verify && !!order?.is_preorder && currentAdvance > 0;
      const patch = verify
        ? {
            verified_at: new Date().toISOString(),
            advance_amount: verifiedAdvance,
            advance_source: parsedAdvance.source || form.advance_source || order?.advance_source || order?.payment_method || "bKash",
            advance_payment_number: parsedAdvance.paymentNumber || form.advance_payment_number || order?.advance_payment_number || null,
            advance_txn_id: parsedAdvance.txnId || form.advance_txn_id || order?.advance_txn_id || null,
            total: parsedAdvance.due != null ? parsedAdvance.due : remainingDue,
            payment_status: remainingDue <= 0 ? "paid" as const : "partial" as const,
          }
        : {
            verified_at: null as string | null,
            advance_amount: keepPreorderAdvance ? currentAdvance : 0,
            total: payable,
            payment_status: keepPreorderAdvance ? "partial" as const : "unpaid" as const,
          };
      const { error } = await supabase
        .from("orders")
        .update(patch)
        .eq("id", orderId);
      if (error) throw error;
      return {
        payable,
        verify,
        advance: verifiedAdvance,
        remainingDue: parsedAdvance.due != null ? parsedAdvance.due : remainingDue,
        keepPreorderAdvance,
        currentAdvance,
        source: verify ? patch.advance_source : form.advance_source,
        paymentNumber: verify ? patch.advance_payment_number : form.advance_payment_number,
        txnId: verify ? patch.advance_txn_id : form.advance_txn_id,
      };
    },
    onSuccess: (res, verify) => {
      setForm((f) => ({
        ...f,
        advance: verify ? res.advance : (res.keepPreorderAdvance ? res.currentAdvance : 0),
        advance_source: verify ? (res.source || f.advance_source || order?.payment_method || "bKash") : f.advance_source,
        advance_payment_number: verify ? (res.paymentNumber ?? f.advance_payment_number) : f.advance_payment_number,
        advance_txn_id: verify ? (res.txnId ?? f.advance_txn_id) : f.advance_txn_id,
      }));
      toast.success(
        verify
          ? `Payment verified — ৳${bdtCompact(res.advance)} advance, COD due ৳${bdtCompact(res.remainingDue)}`
          : "Verification cleared",
      );
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["web-orders"] });
      qc.invalidateQueries({ queryKey: ["web-orders-page"] });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmOrder = useMutation({
    mutationFn: async () => {
      const advanceError = getAdvanceValidationError();
      if (advanceError) throw new Error(advanceError);
      // 1) Persist any pending customer + pricing edits first
      const subtotal = itemsSubtotal;
      const total = Math.max(0, subtotal + Number(form.shipping_fee) - Number(form.discount) - Number(form.advance));
      const basePayload = {
        shipping_phone: form.mobile,
        shipping_name: form.name,
        delivery_method: form.delivery_method || null,
        shipping_address: form.address,
        shipping_note: form.shipping_note,
        pathao_city_id: form.city_id ? Number(form.city_id) : null,
        pathao_city_name: cities?.find((c) => c.id === form.city_id)?.name_en ?? null,
        pathao_zone_id: form.zone_id ? Number(form.zone_id) : null,
        pathao_zone_name: zones?.find((z) => z.id === form.zone_id)?.name_en ?? null,
        pathao_area_id: form.area_id ? Number(form.area_id) : null,
        pathao_area_name: areas?.find((a) => a.id === form.area_id)?.name_en ?? null,
        shipping_city: cities?.find((c) => c.id === form.city_id)?.name_en ?? order?.shipping_city ?? null,
        shipping_thana: zones?.find((z) => z.id === form.zone_id)?.name_en ?? order?.shipping_thana ?? null,
        source_platform: form.source_platform,
        is_preorder: form.is_preorder,
        is_cross_sale: form.is_cross_sale,
        subtotal,
        shipping_fee: Number(form.shipping_fee),
        discount_amount: Number(form.discount),
        advance_amount: Number(form.advance),
        advance_source: Number(form.advance) > 0 ? form.advance_source : null,
        advance_payment_number: Number(form.advance) > 0 ? form.advance_payment_number : null,
        advance_txn_id: Number(form.advance) > 0 && form.advance_txn_id ? form.advance_txn_id : null,
        total,
        web_status: "complete" as const,
      };
      const updatePayload = order?.is_guest_order
        ? { ...basePayload, guest_name: form.name, guest_phone: form.mobile }
        : basePayload;
      const { error: upErr } = await supabase.from("orders").update(updatePayload).eq("id", orderId);
      if (upErr) throw upErr;

      // 2) Transition status -> confirmed (reserves stock + sets confirmed_at)
      if (order?.status === "new") {
        const { error: rpcErr } = await supabase.rpc("transition_order_status", {
          _order_id: orderId,
          _new_status: "confirmed" as OrderStatus,
        });
        if (rpcErr) throw rpcErr;
      }
    },
    onSuccess: () => {
      toast.success("Order confirmed");
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["web-orders"] });
      invalidate();
      navigate({ to: "/erp/orders/web" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateWebStatus = useMutation({
    mutationFn: async ({ status, extra }: { status: WebStatus; extra?: Partial<{ hold_reason: string; cancellation_reason: string; cancel_reason: string; advance_amount: number }> }) => {
      const { error } = await supabase
        .from("orders")
        .update({ web_status: status, ...(extra ?? {}) })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(`Marked as ${vars.status.replace(/_/g, " ")}`);
      qc.invalidateQueries({ queryKey: ["web-orders"] });
      invalidate();
      navigate({ to: "/erp/orders/web", search: { tab: vars.status } as never });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onPickWebStatus = (v: WebStatus) => {
    if (v === "on_hold" || v === "cancelled" || v === "advance_payment") {
      setPendingReason("");
      setPendingAdvance("");
      setPendingWebStatus(v);
      return;
    }
    updateWebStatus.mutate({ status: v });
  };

  const submitPendingWebStatus = async () => {
    if (!pendingWebStatus) return;
    if (pendingWebStatus === "on_hold") {
      if (!pendingReason.trim()) { toast.error("Please provide a hold reason"); return; }
      updateWebStatus.mutate({ status: "on_hold", extra: { hold_reason: pendingReason.trim() } });
    } else if (pendingWebStatus === "cancelled") {
      if (!pendingReason.trim()) { toast.error("Please provide a cancellation reason"); return; }
      updateWebStatus.mutate({
        status: "cancelled",
        extra: { cancellation_reason: pendingReason.trim(), cancel_reason: pendingReason.trim() },
      });
    } else if (pendingWebStatus === "advance_payment") {
      const amt = Number(pendingAdvance);
      if (!amt || amt <= 0) { toast.error("Enter a valid advance amount"); return; }
      updateWebStatus.mutate({
        status: "advance_payment",
        extra: { advance_amount: amt },
      });
      const note = pendingReason.trim();
      if (note) {
        try { await supabase.rpc("add_order_note", { _order_id: orderId, _body: `Advance note: ${note}`, _is_internal: true }); } catch { /* non-fatal */ }
      }
      setForm((f) => ({ ...f, advance: amt }));
    }
    setPendingWebStatus(null);
  };

  const saveCustomer = useMutation({
    mutationFn: async () => {
      const payload = {
        shipping_phone: form.mobile,
        shipping_name: form.name,
        delivery_method: form.delivery_method || null,
        shipping_address: form.address,
        shipping_note: form.shipping_note,
        pathao_city_id: form.city_id ? Number(form.city_id) : null,
        pathao_city_name: cities?.find((c) => c.id === form.city_id)?.name_en ?? null,
        pathao_zone_id: form.zone_id ? Number(form.zone_id) : null,
        pathao_zone_name: zones?.find((z) => z.id === form.zone_id)?.name_en ?? null,
        pathao_area_id: form.area_id ? Number(form.area_id) : null,
        pathao_area_name: areas?.find((a) => a.id === form.area_id)?.name_en ?? null,
        shipping_city: cities?.find((c) => c.id === form.city_id)?.name_en ?? order?.shipping_city ?? null,
        shipping_thana: zones?.find((z) => z.id === form.zone_id)?.name_en ?? order?.shipping_thana ?? null,
        source_platform: form.source_platform,
        is_preorder: form.is_preorder,
        is_cross_sale: form.is_cross_sale,
        ...(order?.is_guest_order ? { guest_name: form.name, guest_phone: form.mobile } : {}),
      } as const;
      const { error } = await supabase.from("orders").update(payload).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Customer details saved"); setBaseline((b) => b ? { ...b, ...form } : b); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const savePricing = useMutation({
    mutationFn: async () => {
      const advanceError = getAdvanceValidationError();
      if (advanceError) throw new Error(advanceError);
      const subtotal = itemsSubtotal;
      const total = Math.max(0, subtotal + Number(form.shipping_fee) - Number(form.discount) - Number(form.advance));
      const { error } = await supabase.from("orders").update({
        subtotal, shipping_fee: Number(form.shipping_fee), discount_amount: Number(form.discount),
        advance_amount: Number(form.advance),
        advance_source: Number(form.advance) > 0 ? form.advance_source : null,
        advance_payment_number: Number(form.advance) > 0 ? form.advance_payment_number : null,
        advance_txn_id: Number(form.advance) > 0 && form.advance_txn_id ? form.advance_txn_id : null,
        total,
      }).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pricing saved");
      setBaseline((b) => b ? {
        ...b,
        discount: form.discount,
        advance: form.advance,
        shipping_fee: form.shipping_fee,
        advance_source: form.advance_source,
        advance_payment_number: form.advance_payment_number,
        advance_txn_id: form.advance_txn_id,
      } : b);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateItem = useMutation({
    mutationFn: async (input: { id: string; quantity?: number; unit_price?: number }) => {
      const it = items.find((x) => x.id === input.id); if (!it) return;
      const quantity = input.quantity ?? it.quantity;
      const unit_price = input.unit_price ?? Number(it.unit_price ?? it.price);
      const line_total = quantity * unit_price;
      const { error } = await supabase.from("order_items")
        .update({ quantity, unit_price, price: unit_price, line_total }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("order_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Item removed"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("order_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Note deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addItem = useMutation({
    mutationFn: async ({ p, v }: { p: ProductLite; v?: VariantLite }) => {
      const existing = items.find((x) =>
        x.product_id === p.id && ((x as any).variant_id ?? null) === (v?.id ?? null));
      if (existing) { await updateItem.mutateAsync({ id: existing.id, quantity: existing.quantity + 1 }); return; }
      const unit_price = p.price;
      const variant_label = v ? [v.color_name, v.sku].filter(Boolean).join(" · ") : null;
      const { error } = await supabase.from("order_items").insert({
        order_id: orderId, product_id: p.id, name: p.title, image: v?.image || p.image,
        variant_id: v?.id ?? null, variant_label,
        quantity: 1, price: unit_price, unit_price, line_total: unit_price,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Item added"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateTags = useMutation({
    mutationFn: async (tags: string[]) => {
      const { error } = await supabase.from("orders").update({ order_tags: tags }).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const addNote = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("add_order_note", { _order_id: orderId, _body: form.note_input, _is_internal: true });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Note added");
      setForm((f) => ({ ...f, note_input: "" }));
      qc.invalidateQueries({ queryKey: ["web-orders"] });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* ------------------------------ Dialogs ---------------------------------- */

  const [bookOpen, setBookOpen] = useState(false);
  const [bookSteadfastOpen, setBookSteadfastOpen] = useState(false);
  const [showAddProducts, setShowAddProducts] = useState(false);
  const [insightTab, setInsightTab] = useState<"history" | "cases" | "attribution" | "activity">("history");
  const isWebOrder = order?.status === "new" && ["website", "pixel", "utm"].includes(String(order?.source ?? ""));
  const [returnOpen, setReturnOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [pendingWebStatus, setPendingWebStatus] = useState<WebStatus | null>(null);
  const [pendingReason, setPendingReason] = useState("");
  const [pendingAdvance, setPendingAdvance] = useState("");
  const [draftWebStatus, setDraftWebStatus] = useState<WebStatus | "">("");

  if (isLoading || !order) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const tags: string[] = order.order_tags ?? [];
  // Only treat as fraud note when we actually have fraud data — not generic API errors
  const rawFraud = courierHistory?.steadfastError || "";
  const isRealFraud = /fraud|cancel|return/i.test(rawFraud) && rawFraud.length > 0 && !/unauthor|forbidden|not\s*found|invalid|error|failed|timeout/i.test(rawFraud);
  const fraudNote = isRealFraud ? rawFraud : "";

  /* ------------------------------ Render ----------------------------------- */

  return (
    <div className="min-h-screen workspace-bg print:hidden">
      <OrderLockBanner lock={orderLock} />
      {/* Sticky Header */}
      <header className="glass-bar sticky top-0 z-30 border-b border-border/60">
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        <div className="max-w-[1600px] mx-auto px-3 sm:px-4 md:px-6 py-2.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button asChild size="sm" variant="ghost" className="h-8 px-2 text-gray-600 hover:text-gray-900">
              <Link to="/erp/orders/web"><ArrowLeft className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Orders</span></Link>
            </Button>
            <span className="h-4 w-px bg-border" />
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="hidden sm:inline text-[11px] uppercase tracking-wider text-muted-foreground">Order</span>
              <CopyChip value={invoiceDisplay(order)} className="-mx-1">
                <span className="font-mono text-sm font-semibold text-foreground truncate">#{invoiceDisplay(order)}</span>
              </CopyChip>
              <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px] hidden sm:inline-flex", statusBadge(order.status).className)}>{statusBadge(order.status).label}</Badge>
              {(() => {
                const s = settlementBadge(order);
                return s ? (
                  <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px] font-bold uppercase tracking-wide hidden sm:inline-flex", s.className)}>{s.label}</Badge>
                ) : null;
              })()}
            </div>
            {neighbors.total > 0 && (
              <div className="flex items-center gap-1 ml-2">
                <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={!neighbors.prev}
                  onClick={() => neighbors.prev && navigate({ to: "/erp/orders/$orderId", params: { orderId: neighbors.prev } })}
                  title="Previous order (← arrow key)"><ChevronLeft className="h-3.5 w-3.5" /></Button>
                <span className="text-[10px] text-gray-500 tabular-nums px-1">
                  {neighbors.index + 1}/{neighbors.total}
                </span>
                <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={!neighbors.next}
                  onClick={() => neighbors.next && navigate({ to: "/erp/orders/$orderId", params: { orderId: neighbors.next } })}
                  title="Next order (→ arrow key)"><ChevronRight className="h-3.5 w-3.5" /></Button>
                <span className="hidden lg:inline-flex items-center gap-0.5 ml-1.5 text-[9px] text-gray-400">
                  <kbd className="px-1 py-0.5 rounded border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/40 font-mono text-[9px] leading-none">←</kbd>
                  <kbd className="px-1 py-0.5 rounded border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/40 font-mono text-[9px] leading-none">→</kbd>
                </span>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden lg:flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="text-gray-400">Created</span>
              <span className="text-emerald-600 font-medium">{formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}</span>
              <span className="h-3 w-px bg-gray-200" />
              <span className="text-gray-400">Updated</span>
              <span className="font-medium text-gray-700">{formatDistanceToNow(new Date(order.updated_at ?? order.created_at), { addSuffix: true })}</span>
            </div>
            {!isWebOrder && (
              <>
                <Button size="sm" variant="outline" className="h-8 px-2 sm:px-3 transition-transform active:scale-95" onClick={() => {
                  window.print();
                  void import("@/lib/erp/mark-printed").then(({ markOrdersPrinted }) => markOrdersPrinted([order.id]));
                }}><Printer className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Invoice</span></Button>
                <Button size="sm" variant="outline" className="h-8 px-2 sm:px-3 transition-transform active:scale-95" onClick={() => setBookOpen(true)}><Truck className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Pathao</span></Button>
                <Button size="sm" variant="outline" className="h-8 px-2 sm:px-3 hidden sm:inline-flex transition-transform active:scale-95" onClick={() => setBookSteadfastOpen(true)}><Truck className="h-3.5 w-3.5 mr-1" />Steadfast</Button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto p-3 sm:p-4 md:p-6 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] gap-3 sm:gap-4 items-start">
        {/* MAIN */}
        <div className="space-y-4 min-w-0">
          {/* Stats strip */}
          <StatsStrip
            stats={stats}
            customerName={form.name}
            fraudNote={fraudNote}
            refreshing={refreshing}
            couriers={courierHistory?.couriers ?? []}
            loading={courierLoading || (courierFetching && !courierHistory)}
            onRefresh={async () => { setRefreshing(true); await refetchHistory(); setRefreshing(false); }}
          />

          {/* Customer row */}
          <Panel title="Customer & Delivery" accent="bg-indigo-500" bodyClassName="p-5">
            <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FieldShell label="Mobile Number">
                <div className="relative">
                  <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="h-9 pr-16 font-mono" />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5">
                    <a href={`tel:${form.mobile}`} className="p-1 rounded hover:bg-muted text-emerald-600"><Phone className="h-3.5 w-3.5" /></a>
                    <a href={`https://wa.me/${form.mobile.replace(/^0/, "880")}`} target="_blank" rel="noreferrer" className="p-1 rounded hover:bg-muted text-emerald-600"><MessageCircle className="h-3.5 w-3.5" /></a>
                  </div>
                </div>
                {stats.ourRecord.total > 0 && (
                  <p className="text-[10px] text-sky-600">Check Our Record above for customer history</p>
                )}
              </FieldShell>
              <FieldShell label="Name">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-9" />
              </FieldShell>
              <FieldShell label="Delivery Method">
                <Select value={form.delivery_method || ""} onValueChange={(v) => setForm({ ...form, delivery_method: v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Choose courier" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pathao">Pathao</SelectItem>
                    <SelectItem value="steadfast">Steadfast</SelectItem>
                    <SelectItem value="redx">RedX</SelectItem>
                    <SelectItem value="own">Own Delivery</SelectItem>
                  </SelectContent>
                </Select>
              </FieldShell>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FieldShell label="Address">
                <Textarea
                  rows={3}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="resize-none"
                />
                <div className="mt-1.5 space-y-1.5">
                  {detecting && (
                    <div className="inline-flex items-center gap-1.5 text-[10px] text-gray-500">
                      <Loader2 className="h-3 w-3 animate-spin" />Detecting location…
                    </div>
                  )}
                  {detection && !detecting && (
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                      <Check className="h-3 w-3" />
                      <span>
                        {pathaoSourceLabel(detection.source)}: {detection.city.name}
                        {detection.zone && ` → ${detection.zone.name}`}
                        {detection.area && ` → ${detection.area.name}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setDetection(null);
                          setForm((f) => ({ ...f, city_id: "", zone_id: "", area_id: "" }));
                        }}
                        className="ml-0.5 rounded-full hover:bg-emerald-100 dark:hover:bg-emerald-500/20 p-0.5"
                        title="Clear detection"
                      ><XCircle className="h-3 w-3" /></button>
                    </div>
                  )}
                  {!detection && citySuggestions.length > 0 && !detecting && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                        <MapPin className="h-3 w-3" />Did you mean
                      </span>
                      {citySuggestions.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setForm((f) => ({ ...f, city_id: c.id, zone_id: "", area_id: "" }));
                            // Re-run detection but pin to this city by injecting cached city pick
                            const trimmed = form.address.trim();
                            const cached = detectCacheRef.current.get(trimmed);
                            // Force a fresh detection that auto-applies now that city is chosen
                            detectCacheRef.current.delete(trimmed);
                            void runDetection(trimmed, true).catch(() => void cached);
                          }}
                          className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 text-[10px] font-medium hover:bg-indigo-100 dark:hover:bg-indigo-500/20"
                        >{c.name}</button>
                      ))}
                    </div>
                  )}
                </div>
              </FieldShell>
              <FieldShell label="Shipping Note">
                <ShippingNotePresets
                  value={form.shipping_note}
                  onChange={(v) => setForm({ ...form, shipping_note: v.slice(0, 150) })}
                />
              </FieldShell>
              <div className="space-y-3">
                <FieldShell label="Source Platform">
                  <Select value={form.source_platform} onValueChange={(v) => setForm({ ...form, source_platform: v })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Website">Website</SelectItem>
                      <SelectItem value="Facebook">Facebook</SelectItem>
                      <SelectItem value="Instagram">Instagram</SelectItem>
                      <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                      <SelectItem value="Phone">Phone</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldShell>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center justify-between rounded-md border px-2.5 py-2">
                    <span className="text-[11px]">Preorder</span>
                    <Switch checked={form.is_preorder} onCheckedChange={(v) => setForm({ ...form, is_preorder: v })} />
                  </div>
                  <div className="flex items-center justify-between rounded-md border px-2.5 py-2">
                    <span className="text-[11px]">Cross Sale</span>
                    <Switch checked={form.is_cross_sale} onCheckedChange={(v) => setForm({ ...form, is_cross_sale: v })} />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-muted-foreground">City</label>
                  <button
                    type="button"
                    onClick={() => {
                      const addr = (form.address || order?.shipping_address || "").trim();
                      if (addr.length < 4) return;
                      lastDetectedAddrRef.current = "";
                      detectCacheRef.current.delete(addr);
                      setDetectionAttempted(true);
                      void runDetection(addr, true);
                    }}
                    disabled={detecting}
                    className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50"
                  >
                    {detecting ? "Detecting…" : "🔍 Detect"}
                  </button>
                </div>
                <Select value={form.city_id} onValueChange={(v) => setForm({ ...form, city_id: v, zone_id: "", area_id: "" })}>
                  <SelectTrigger className={`h-9 ${confirmAttempted && !form.city_id ? "border-red-500 ring-1 ring-red-500" : ""}`}><SelectValue placeholder={detecting ? "Detecting…" : "Select city"} /></SelectTrigger>
                  <SelectContent>{(cities ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}</SelectContent>
                </Select>
                {detectionAttempted && !detecting && !detection && !form.city_id && citySuggestions.length === 0 && (
                  <p className="text-[10px] text-muted-foreground">Could not detect — please select manually</p>
                )}
              </div>
              <FieldShell label="Zone">
                <Select value={form.zone_id} onValueChange={(v) => setForm({ ...form, zone_id: v, area_id: "" })} disabled={!form.city_id}>
                  <SelectTrigger className={`h-9 ${confirmAttempted && !form.zone_id ? "border-red-500 ring-1 ring-red-500" : ""}`}><SelectValue placeholder="Select zone" /></SelectTrigger>
                  <SelectContent>{(zones ?? []).map((z) => <SelectItem key={z.id} value={z.id}>{z.name_en}</SelectItem>)}</SelectContent>
                </Select>
              </FieldShell>
              <FieldShell label="Area">
                <Select value={form.area_id} onValueChange={(v) => setForm({ ...form, area_id: v })} disabled={!form.zone_id}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select an area" /></SelectTrigger>
                  <SelectContent>{(areas ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name_en}</SelectItem>)}</SelectContent>
                </Select>
              </FieldShell>
            </div>
            {(() => {
              const customerKeys = ["mobile","name","delivery_method","address","shipping_note","city_id","zone_id","area_id","source_platform","is_preorder","is_cross_sale"] as const;
              const dirty = !!baseline && customerKeys.some((k) => (form as any)[k] !== (baseline as any)[k]);
              return (
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100 dark:border-border">
                  {dirty && (
                    <span className="mr-auto inline-flex items-center gap-1.5 text-[11px] text-amber-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />Unsaved changes
                    </span>
                  )}
                  <Button size="sm" variant="ghost" disabled={!dirty || saveCustomer.isPending}
                    onClick={() => baseline && setForm({ ...form, ...baseline })}>
                    <Undo2 className="h-3.5 w-3.5 mr-1" />Discard
                  </Button>
                  <Button size="sm" disabled={!dirty || saveCustomer.isPending}
                    onClick={() => saveCustomer.mutate()} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                    {saveCustomer.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                    Save Customer
                  </Button>
                </div>
              );
            })()}
            </div>
          </Panel>

          {/* Ordered Products (add-products folded in) */}
          <Panel
            title={<span className="inline-flex items-center gap-2">Ordered Products
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 dark:bg-muted text-[10px] font-semibold text-gray-600 tabular-nums">{items.length}</span>
            </span>}
            accent="bg-emerald-500"
            bodyClassName="p-4"
            right={
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-500 tabular-nums">৳{bdtCompact(itemsSubtotal)}</span>
                <Button size="sm" variant={showAddProducts ? "secondary" : "outline"} className="h-7 px-2 text-[11px]"
                  onClick={() => setShowAddProducts((v) => !v)}>
                  <Plus className="h-3 w-3 mr-1" />{showAddProducts ? "Close" : "Add"}
                </Button>
              </div>
            }
          >
            <div>
              {showAddProducts && (
                <div className="mb-4 rounded-xl border border-dashed border-gray-200 dark:border-border p-3">
                  <ProductSearchPanel brandId={order.brand_id ?? null} onAdd={(p, v) => addItem.mutate({ p, v })} />
                </div>
              )}
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No items in this order</p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-border -mx-2">
                  {items.filter((it) => !(it as any).is_combo_child).map((it) => {
                    const unit = Number(it.unit_price ?? it.price);
                    const total = Number(it.line_total ?? unit * it.quantity);
                    const children = items.filter((c) => (c as any).combo_parent_item_id === it.id);
                    const isCombo = children.length > 0;
                    return (
                      <li key={it.id} className="px-2 py-3 rounded-lg hover:bg-gray-50/70 dark:hover:bg-muted/30 transition-colors">
                        <div className="flex items-start gap-3">
                          <div className="h-12 w-12 rounded-lg bg-gray-100 dark:bg-muted ring-1 ring-gray-200/70 dark:ring-border shrink-0 overflow-hidden flex items-center justify-center">
                            {it.image ? <img src={it.image} alt="" className="h-full w-full object-cover" /> : <span className="text-[8px] text-muted-foreground">No Image</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-xs font-mono text-muted-foreground">{it.product_id.slice(0, 8)}</div>
                              {isCombo && (
                                <span className="rounded bg-violet-500/15 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                                  Combo
                                </span>
                              )}
                            </div>
                             <div className="text-sm font-medium truncate">{it.name}</div>
                             {it.variant_label && (
                               <div className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 ring-1 ring-inset ring-indigo-500/20">
                                 <span className="opacity-70">Variant:</span>
                                 <span>{it.variant_label}</span>
                               </div>
                             )}
                             <div className="flex items-center gap-2 text-[10px]">
                               <span className="text-rose-600">৳{bdtCompact(unit)}</span>
                               {(() => {
                                 if (isCombo) return null;
                                 const s = stockMap?.get(it.product_id);
                                 if (s === undefined) return null;
                                 if (s <= 0) return <span className="rounded px-1 py-0.5 bg-rose-500/15 text-rose-600 font-semibold">Out of stock</span>;
                                 if (s < 5) return <span className="rounded px-1 py-0.5 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold">Stock: {s}</span>;
                                 return <span className="rounded px-1 py-0.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold">Stock: {s}</span>;
                               })()}
                             </div>
                             {isCombo && (
                               <div className="mt-2 rounded-md border border-violet-200 dark:border-violet-800/50 bg-violet-50/40 dark:bg-violet-950/20 px-2 py-1.5">
                                 <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300 mb-1">Includes</div>
                                 <ul className="space-y-1">
                                   {children.map((c) => (
                                     <li key={c.id} className="flex items-center gap-2 text-[11px]">
                                       {c.image ? <img src={c.image} alt="" className="h-5 w-5 rounded object-cover" /> : <span className="h-5 w-5 rounded bg-muted" />}
                                       <span className="truncate flex-1">{c.name}</span>
                                       <span className="text-muted-foreground tabular-nums">× {c.quantity}</span>
                                     </li>
                                   ))}
                                 </ul>
                               </div>
                             )}
                          </div>
                          <button onClick={() => deleteItem.mutate(it.id)} className="p-1.5 rounded-md hover:bg-rose-500/10 text-gray-400 hover:text-rose-600 transition-colors" title="Remove item">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          <FieldShell label="Qty">
                            <QtyInput value={it.quantity} onChange={(v) => updateItem.mutate({ id: it.id, quantity: v })} />
                          </FieldShell>
                          <FieldShell label="Price">
                            <QtyInput value={unit} onChange={(v) => updateItem.mutate({ id: it.id, unit_price: v })} step={10} />
                          </FieldShell>
                          <FieldShell label="Total">
                            <Input value={bdtCompact(total)} readOnly className="h-8 text-xs bg-gray-50 dark:bg-muted/40 border-gray-100 tabular-nums font-semibold" />
                          </FieldShell>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Panel>

          {/* Totals row */}
          <Panel title="Pricing & Totals" accent="bg-amber-500" bodyClassName="p-5">
            <div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <FieldShell label="Discount">
                <NumInput value={form.discount} onChange={(v) => setForm({ ...form, discount: v })} />
              </FieldShell>
              <FieldShell label="Advance">
                <NumInput value={form.advance} onChange={(v) => setForm({ ...form, advance: v })} />
              </FieldShell>
              {Number(form.advance) > 0 && (
                <div className="col-span-2 md:col-span-5 grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3">
                  <FieldShell label="Advance Source *">
                    <Select value={form.advance_source} onValueChange={(v) => setForm({ ...form, advance_source: v })}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select source" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bKash">bKash</SelectItem>
                        <SelectItem value="Nagad">Nagad</SelectItem>
                        <SelectItem value="Rocket">Rocket</SelectItem>
                        <SelectItem value="Upay">Upay</SelectItem>
                        <SelectItem value="Bank">Bank Transfer</SelectItem>
                        <SelectItem value="Card">Card</SelectItem>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldShell>
                  <FieldShell label="Payment No / Last 4 *">
                    <Input
                      inputMode="numeric"
                      maxLength={20}
                      value={form.advance_payment_number}
                      onChange={(e) => setForm({ ...form, advance_payment_number: e.target.value.replace(/[^0-9]/g, "") })}
                      placeholder="017... or 5678"
                      className="h-9 tabular-nums"
                    />
                  </FieldShell>
                  <FieldShell label="Transaction ID (optional)">
                    <Input
                      maxLength={50}
                      value={form.advance_txn_id}
                      onChange={(e) => setForm({ ...form, advance_txn_id: e.target.value })}
                      placeholder="Txn ID"
                      className="h-9"
                    />
                  </FieldShell>
                </div>
              )}
              <FieldShell label="Sub Total">
                <Input value={bdtCompact(itemsSubtotal)} readOnly className="h-9 bg-muted/40 tabular-nums" />
              </FieldShell>
              <FieldShell label="Delivery Charge">
                <NumInput value={form.shipping_fee} onChange={(v) => setForm({ ...form, shipping_fee: v })} />
              </FieldShell>
              <FieldShell label="Grand Total">
                <Input value={`৳ ${bdtCompact(grandTotal)}`} readOnly className="h-9 bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 font-bold tabular-nums" />
              </FieldShell>
            </div>
            {order.payment_method?.toLowerCase().includes("cod") && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300 text-center">
                Cash on Delivery (COD) — please confirm with the customer before booking.
              </div>
            )}
            {order.status !== "confirmed" && order.web_status !== "complete" ? (
              <>
              {confirmAttempted && (!form.city_id || !form.zone_id) && (
                <div className="mt-3 rounded-md border border-red-300 bg-red-50 dark:bg-red-500/10 dark:border-red-500/30 px-3 py-2 text-[12px] text-red-700 dark:text-red-300 text-center">
                  City and Zone required before confirming order
                </div>
              )}
              <Button
                className="w-full mt-4 h-11 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-600/20"
                size="lg"
                disabled={confirmOrder.isPending}
                onClick={() => {
                  if (!form.city_id || !form.zone_id) {
                    setConfirmAttempted(true);
                    return;
                  }
                  setConfirmAttempted(false);
                  confirmOrder.mutate();
                }}
              >
                {confirmOrder.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <><CheckCircle2 className="h-4 w-4 mr-1.5" />Confirm Order (৳{bdtCompact(grandTotal)}.00)</>}
              </Button>
              <Button
                variant="outline"
                className="w-full mt-2 h-10 gap-1.5 border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-900 dark:text-indigo-300"
                onClick={() => setPreorderOpen(true)}
              >
                <CalendarClock className="h-4 w-4" />
                Move to Pre-order
              </Button>
              </>
            ) : (
              <Button
                className="w-full mt-4 h-11"
                size="lg"
                variant="outline"
                disabled={savePricing.isPending}
                onClick={() => savePricing.mutate()}
              >
                {savePricing.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Save Order (৳${bdtCompact(grandTotal)}.00)`}
              </Button>
            )}
            </div>
          </Panel>

          {/* Order Timeline (self-collapsible) */}
          <OrderTimeline orderId={orderId} />
        </div>

        {/* RIGHT SIDEBAR */}
        <aside className="space-y-4 xl:sticky xl:top-[64px] xl:max-h-[calc(100vh-80px)] xl:overflow-y-auto xl:pr-1 xl:-mr-1">
          <Panel
            title="Order Summary"
            accent="bg-emerald-500"
            right={<span className="text-[10px] font-mono text-gray-500">#{invoiceDisplay(order)}</span>}
            bodyClassName="p-4"
          >
            <div className="space-y-2 text-xs">
              <Row label="Date" value={format(new Date(order.created_at), "dd MMM yyyy, hh:mm a")} />
              <Row label="Status" value={
                <div className="flex items-center gap-1.5">
                  <Badge className={statusBadge(order.status).className}>{statusBadge(order.status).label}</Badge>
                  {(() => {
                    const s = settlementBadge(order);
                    return s ? <Badge variant="outline" className={cn("font-bold uppercase tracking-wide", s.className)}>{s.label}</Badge> : null;
                  })()}
                </div>
              } />
              <Row label="Payment" value={order.payment_method ?? "—"} />
              <Row label="Source" value={sourceLabel(order.source)} />
              <Row label="Device" value={<span className="inline-flex items-center gap-1 capitalize"><Smartphone className="h-3 w-3 text-gray-400" />{sessionInfo?.device_type || "Not tracked"}</span>} />
              <Row label="Mobile" value={
                <CopyChip value={`+88${form.mobile}`} className="-mx-1">
                  <span className="font-mono">+88{form.mobile}</span>
                </CopyChip>
              } />
              <div className="h-px bg-border my-2" />
              <Row label="Subtotal" value={`৳${bdtCompact(itemsSubtotal)}`} />
              <Row label="Delivery" value={`৳${bdtCompact(form.shipping_fee)}`} />
              <Row label="Total" value={<span className="font-bold text-foreground">৳{bdtCompact(grandTotal)}</span>} />
            </div>
          </Panel>

          {/* Payment Verification — customer-provided txn / number */}
          {(() => {
            const pm = (order.payment_method ?? "").toLowerCase();
            const isDigitalPay = pm && !pm.includes("cod") && pm !== "cash";
            // COD orders e verification card dorkar nei — sudhu digital (bKash/Nagad/Rocket) hole show koro.
            if (!isDigitalPay) return null;
            const verified = !!order.verified_at;
            const txnId = order.advance_txn_id
              ?? (order as { transaction_id?: string | null }).transaction_id
              ?? null;
            const payNumber = order.advance_payment_number ?? null;
            const method = order.payment_method ?? "—";
            return (
              <section className={cn(
                "rounded-2xl border shadow-sm overflow-hidden",
                verified
                  ? "border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20"
                  : "border-pink-200 dark:border-pink-900/50 bg-pink-50/40 dark:bg-pink-950/20"
              )}>
                <header className="px-5 py-3 border-b border-gray-100 dark:border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {verified
                      ? <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      : <ShieldAlert className="h-4 w-4 text-pink-600" />}
                    <h3 className="text-[13px] font-semibold">
                      Payment Verification
                    </h3>
                  </div>
                  <Badge className={cn(
                    "text-[10px] font-bold uppercase",
                    verified
                      ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                      : "bg-pink-600 hover:bg-pink-600 text-white"
                  )}>
                    {verified ? "Verified" : "Pending"}
                  </Badge>
                </header>
                <div className="p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Method</span>
                    <Badge variant="outline" className="capitalize">{method}</Badge>
                  </div>
                  {Number(order.advance_amount ?? 0) > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Amount</span>
                      <span className="font-semibold tabular-nums">৳{bdtCompact(Number(order.advance_amount))}</span>
                    </div>
                  )}
                  {payNumber && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-500">Sender Number</span>
                      <CopyChip value={String(payNumber)}>
                        <span className="font-mono font-semibold">{payNumber}</span>
                      </CopyChip>
                    </div>
                  )}
                  {txnId && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-500">Transaction ID</span>
                      <CopyChip value={String(txnId)}>
                        <span className="font-mono font-semibold">{txnId}</span>
                      </CopyChip>
                    </div>
                  )}
                  {!payNumber && !txnId && (
                    <div className="text-[11px] text-gray-500 italic">
                      Customer এখনো txn ID / sender number দেয়নি।
                    </div>
                  )}
                  {verified && order.verified_at && (
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400 pt-1">
                      ✓ Verified {formatDistanceToNow(new Date(order.verified_at), { addSuffix: true })}
                    </div>
                  )}
                  <div className="pt-2 flex gap-2">
                    {verified ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 flex-1"
                        disabled={verifyPayment.isPending}
                        onClick={() => verifyPayment.mutate(false)}
                      >
                        <Undo2 className="h-3.5 w-3.5 mr-1" />Unverify
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-8 flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={verifyPayment.isPending}
                        onClick={() => verifyPayment.mutate(true)}
                      >
                        {verifyPayment.isPending
                          ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          : <ShieldCheck className="h-3.5 w-3.5 mr-1" />}
                        Mark Verified
                      </Button>
                    )}
                  </div>
                </div>
              </section>
            );
          })()}

          {/* Shipment tracking — hidden on Web Order (pre-confirmation) */}
          {!isWebOrder && (
            <ShipmentPanel
              orderId={orderId}
              brandId={order.brand_id ?? null}
              onBookPathao={() => setBookOpen(true)}
              onBookSteadfast={() => setBookSteadfastOpen(true)}
            />
          )}

          {/* Tags — folded until needed */}
          <Panel
            title={<span className="inline-flex items-center gap-1.5"><TagIcon className="h-3.5 w-3.5 text-amber-600" />Order Tags</span>}
            accent="bg-amber-500"
            collapsible
            defaultOpen={tags.length > 0}
            bodyClassName="p-4"
            right={tags.length > 0 ? <span className="text-[10px] text-gray-500 tabular-nums">{tags.length}</span> : null}
          >
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5 min-h-[24px]">
                {tags.length === 0 && <span className="text-xs text-gray-400">No tags yet</span>}
                {tags.map((t) => (
                  <button key={t} onClick={() => updateTags.mutate(tags.filter((x) => x !== t))}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 ring-1 ring-inset ring-indigo-200/60 dark:ring-indigo-500/30 text-[11px] font-medium hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors">
                    {t}<XCircle className="h-3 w-3" />
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={form.tag_input} onChange={(e) => setForm({ ...form, tag_input: e.target.value })}
                  placeholder="Add tag…" className="h-8 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && form.tag_input.trim()) {
                      e.preventDefault();
                      updateTags.mutate(Array.from(new Set([...tags, form.tag_input.trim()])));
                      setForm((f) => ({ ...f, tag_input: "" }));
                    }
                  }} />
              </div>
            </div>
          </Panel>

          <Panel title="Actions & Notes" accent="bg-indigo-500" bodyClassName="p-4">
            <div className="space-y-3">
              <Select
                value={draftWebStatus}
                disabled={updateWebStatus.isPending}
                onValueChange={(v) => setDraftWebStatus(v as WebStatus)}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Change status" /></SelectTrigger>
                <SelectContent>
                  {WEB_STATUSES.map((s) => (
                    <SelectItem key={s.key} value={s.key} className="text-xs">{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(() => {
                const changed = !!draftWebStatus && draftWebStatus !== (order.web_status ?? "");
                return (
                  <Button
                    size="sm"
                    className="w-full h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                    disabled={!changed || updateWebStatus.isPending}
                    onClick={() => draftWebStatus && onPickWebStatus(draftWebStatus as WebStatus)}
                  >
                    {updateWebStatus.isPending
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : "Update Status"}
                  </Button>
                );
              })()}
              <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-border">
                <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Internal Notes</label>
                <Textarea rows={2} value={form.note_input} onChange={(e) => setForm({ ...form, note_input: e.target.value })} placeholder="Internal note…" className="text-xs resize-none" />
                <Button size="sm" variant="outline" className="w-full h-7 text-xs" disabled={!form.note_input.trim() || addNote.isPending} onClick={() => addNote.mutate()}>Add Note</Button>
                {notes.length > 0 && (
                  <div className="space-y-1.5 pt-2 max-h-56 overflow-y-auto">
                    {notes.map((n: any) => {
                      const canDelete = isAdmin || (currentUserId && n.created_by === currentUserId);
                      return (
                        <div key={n.id} className="rounded-lg border border-gray-100 dark:border-border bg-gray-50/60 dark:bg-muted/20 px-2.5 py-2 text-xs group hover:border-gray-200 dark:hover:border-border/80 transition-colors">
                          <div className="flex items-center justify-between gap-1">
                            <div className="text-[10px] text-gray-500 truncate">
                              <span className="font-semibold text-gray-700 dark:text-foreground">{n.author_name || (n.created_by ? "Staff" : "System")}</span>
                              <span className="text-gray-400"> · {format(new Date(n.created_at), "dd MMM, hh:mm a")}</span>
                            </div>
                            {canDelete && (
                              <button
                                onClick={() => deleteNote.mutate(n.id)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-rose-500/10 text-gray-400 hover:text-rose-600"
                                title="Delete note"
                              ><Trash2 className="h-3 w-3" /></button>
                            )}
                          </div>
                          <div className="whitespace-pre-wrap leading-snug mt-1 text-gray-700 dark:text-foreground">{n.body}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-gray-100 dark:border-border">
                <a
                  href={`https://wa.me/${form.mobile.replace(/^0/, "880")}?text=${encodeURIComponent("আপনার অর্ডারটি প্রস্তুত আছে। ডেলিভারি দিতে আসছি। অনুগ্রহ করে ফোন রাখুন।")}`}
                  target="_blank" rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1 h-7 px-2 rounded-md border bg-emerald-500/5 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[11px] hover:bg-emerald-500/10"
                >📱 Send Reminder</a>
                <a
                  href={`https://wa.me/${form.mobile.replace(/^0/, "880")}?text=${encodeURIComponent("আপনার অর্ডার কনফার্ম করতে অগ্রিম পেমেন্ট পাঠান: bKash/Nagad " + (form.advance_payment_number || "[number]"))}`}
                  target="_blank" rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1 h-7 px-2 rounded-md border bg-emerald-500/5 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[11px] hover:bg-emerald-500/10"
                >💰 Request Advance</a>
              </div>
              {(() => {
                const s = ((order.status ?? "") + " " + (order.web_status ?? "")).toLowerCase();
                const showRMA = /deliver|complete/.test(s);
                if (!showRMA) return null;
                return (
                  <div className="grid grid-cols-2 gap-1.5 pt-2 border-t">
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setReturnOpen(true)}>
                      <RotateCcw className="h-3 w-3 mr-1" />Initiate Return
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setExchangeOpen(true)}>
                      <Repeat className="h-3 w-3 mr-1" />Initiate Exchange
                    </Button>
                  </div>
                );
              })()}
            </div>
          </Panel>

          {/* Insights — one at a time instead of four stacked cards */}
          <div className="space-y-3">
            <div className="flex items-center gap-1 rounded-xl border border-gray-100 dark:border-border bg-white dark:bg-card p-1 shadow-sm">
              {([
                ["history", "Customer"],
                ["cases", "Cases"],
                ["attribution", "Source"],
                ["activity", "Activity"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setInsightTab(key)}
                  className={cn(
                    "flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors",
                    insightTab === key
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-gray-500 hover:bg-gray-100 dark:hover:bg-muted/50",
                  )}
                >{label}</button>
              ))}
            </div>
            {insightTab === "history" && <CustomerHistoryPanel brandId={order.brand_id ?? null} phone={phone} currentOrderId={orderId} />}
            {insightTab === "cases" && <OrderCasesPanel orderId={orderId} />}
            {insightTab === "attribution" && <AttributionPanel orderId={orderId} />}
            {insightTab === "activity" && <ActivityLogPanel orderId={orderId} />}
          </div>
        </aside>
      </div>

      <PrintableInvoice order={order} items={items as never} />
      <BookPathaoDialog open={bookOpen} onOpenChange={setBookOpen} orderId={orderId} defaultAmount={Number(order.total ?? 0)} brandId={order.brand_id ?? null} />
      <BookSteadfastDialog open={bookSteadfastOpen} onOpenChange={setBookSteadfastOpen} orderId={orderId} defaultAmount={Number(order.total ?? 0)} />
      <ReturnDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        orderId={orderId}
        brandId={order.brand_id ?? null}
        items={items.map((it) => ({
          id: it.id, product_id: it.product_id, name: it.name,
          quantity: it.quantity, unit_price: it.unit_price ?? null, price: it.price ?? null,
        }))}
      />
      <ExchangeDialog
        open={exchangeOpen}
        onOpenChange={setExchangeOpen}
        orderId={orderId}
        brandId={order.brand_id ?? null}
        items={items.map((it) => ({
          id: it.id, product_id: it.product_id, name: it.name,
          quantity: it.quantity, unit_price: it.unit_price ?? null, price: it.price ?? null,
        }))}
      />
      <Dialog open={pendingWebStatus !== null} onOpenChange={(o) => !o && setPendingWebStatus(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingWebStatus === "on_hold" && "Put Order On Hold"}
              {pendingWebStatus === "cancelled" && "Cancel Order"}
              {pendingWebStatus === "advance_payment" && "Advance Payment"}
            </DialogTitle>
            <DialogDescription>
              {pendingWebStatus === "on_hold" && "Why are you putting this order on hold?"}
              {pendingWebStatus === "cancelled" && "Please tell us why this order is being cancelled."}
              {pendingWebStatus === "advance_payment" && "How much advance does the customer need to pay?"}
            </DialogDescription>
          </DialogHeader>
          {pendingWebStatus === "advance_payment" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Advance Amount (৳) <span className="text-rose-600">*</span>
                </label>
                <Input
                  type="number" min={1} autoFocus
                  value={pendingAdvance}
                  onChange={(e) => setPendingAdvance(e.target.value)}
                  placeholder="e.g. 100"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Note <span className="text-muted-foreground/70">(optional)</span>
                </label>
                <Textarea
                  rows={2}
                  maxLength={300}
                  value={pendingReason}
                  onChange={(e) => setPendingReason(e.target.value)}
                  placeholder="e.g. customer ke advance jonno bola hoyeche…"
                  className="resize-none"
                />
                <p className="text-[10px] text-muted-foreground">Source/payment details order create form e add koren.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Reason</label>
              <Textarea
                rows={3} autoFocus maxLength={500}
                value={pendingReason}
                onChange={(e) => setPendingReason(e.target.value)}
                placeholder="Type the reason…"
                className="resize-none"
              />
              <div className="text-[10px] text-right text-muted-foreground">{pendingReason.length}/500</div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingWebStatus(null)}>Cancel</Button>
            <Button
              disabled={updateWebStatus.isPending}
              onClick={submitPendingWebStatus}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {updateWebStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PreorderConvertDialog
        open={preorderOpen}
        onOpenChange={setPreorderOpen}
        orderIds={[orderId]}
        brandId={(order as { brand_id?: string | null } | undefined)?.brand_id ?? null}
      />
    </div>
  );
}

function OrderLockBanner({ lock }: { lock: OrderLockState }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!lock.heldByOther) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [lock.heldByOther]);

  if (!lock.lock) return null;

  if (lock.heldByOther) {
    const expiresInSec = Math.max(
      0,
      Math.round((new Date(lock.lock.last_heartbeat_at).getTime() + 90_000 - now) / 1000),
    );
    return (
      <>
        <div className="sticky top-0 z-40 bg-amber-500 text-amber-950 border-b border-amber-600 shadow-sm">
          <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base">🔒</span>
              <span className="font-semibold truncate">
                Opened by {lock.lock.user_name ?? "another user"}
              </span>
              <span className="opacity-75">· Expires in ~{expiresInSec}s</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 bg-white hover:bg-amber-50 border-amber-700 text-amber-950"
              onClick={() => lock.takeOver().then(() => toast.success("You took over editing"))}
            >
              Takeover & Open
            </Button>
          </div>
        </div>
        <div
          className="fixed inset-0 z-20 bg-black/30 backdrop-blur-[1px] pointer-events-auto"
          aria-hidden="true"
          onClick={(e) => e.stopPropagation()}
        />
      </>
    );
  }

  if (lock.isMine) {
    return (
      <div className="bg-emerald-500/10 border-b border-emerald-500/30 text-emerald-800 dark:text-emerald-300">
        <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-1.5 text-xs flex items-center gap-2">
          <span>✏️</span>
          <span className="font-medium">You are editing this order</span>
        </div>
      </div>
    );
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Small input helpers                                                        */
/* -------------------------------------------------------------------------- */

function QtyInput({ value, onChange, step = 1 }: { value: number; onChange: (v: number) => void; step?: number }) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  const commit = (n: number) => { const v = Math.max(0, Number.isFinite(n) ? n : 0); onChange(v); setLocal(String(v)); };
  return (
    <div className="flex items-center h-8 rounded-md border overflow-hidden">
      <button type="button" className="px-2 h-full hover:bg-muted text-muted-foreground" onClick={() => commit(Number(local) - step)}><Minus className="h-3 w-3" /></button>
      <input value={local} onChange={(e) => setLocal(e.target.value)} onBlur={() => commit(Number(local))}
        className="flex-1 min-w-0 text-center text-xs bg-transparent outline-none tabular-nums" />
      <button type="button" className="px-2 h-full hover:bg-muted text-muted-foreground" onClick={() => commit(Number(local) + step)}><Plus className="h-3 w-3" /></button>
    </div>
  );
}

function NumInput({ value, onChange, onCommit }: { value: number; onChange: (v: number) => void; onCommit?: () => void }) {
  return (
    <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} onBlur={onCommit} className="h-9 tabular-nums" />
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums truncate text-right">{value}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shipping Note Presets                                                      */
/* -------------------------------------------------------------------------- */

const DEFAULT_SHIPPING_PRESETS = [
  "Call before delivery",
  "Fragile - handle with care",
  "Delivery time 10AM-6PM",
  "Cash collection only",
  "Leave at reception if unavailable",
  "Do not fold",
];
const SHIPPING_PRESETS_KEY = "erp:shipping_note_presets";

function ShippingNotePresets({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [custom, setCustom] = useState<string[]>([]);
  const [newPreset, setNewPreset] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SHIPPING_PRESETS_KEY);
      if (raw) setCustom(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const persist = (list: string[]) => {
    setCustom(list);
    try { localStorage.setItem(SHIPPING_PRESETS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
  };

  const apply = (text: string) => {
    const cur = value.trim();
    onChange(cur ? `${cur} • ${text}` : text);
  };

  const all = [...DEFAULT_SHIPPING_PRESETS, ...custom];

  return (
    <div className="space-y-2">
      <Textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="resize-none"
        placeholder="Type a note or pick a preset below"
      />
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Click preset to append</span>
        <span>{value.length}/150</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {all.map((p, i) => {
          const isCustom = i >= DEFAULT_SHIPPING_PRESETS.length;
          return (
            <span key={`${p}-${i}`} className="group inline-flex items-center gap-1 rounded-full border bg-muted/40 hover:bg-muted px-2 py-0.5 text-[11px]">
              <button type="button" onClick={() => apply(p)} className="truncate max-w-[180px]">{p}</button>
              {isCustom && (
                <button
                  type="button"
                  onClick={() => persist(custom.filter((c) => c !== p))}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remove preset"
                >
                  <XCircle className="h-3 w-3" />
                </button>
              )}
            </span>
          );
        })}
      </div>
      <div className="flex gap-1.5">
        <Input
          value={newPreset}
          onChange={(e) => setNewPreset(e.target.value)}
          placeholder="Save new preset..."
          className="h-7 text-xs"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => {
            const t = newPreset.trim();
            if (!t || custom.includes(t) || DEFAULT_SHIPPING_PRESETS.includes(t)) return;
            persist([...custom, t]);
            setNewPreset("");
          }}
        >Save</Button>
      </div>
    </div>
  );
}