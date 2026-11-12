import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import {
  Package, ShoppingCart, Users, LayoutDashboard, Wallet, Boxes, ClipboardList, Globe, Heart,
  BarChart3, Loader2, Clock, ChevronRight, ChevronDown, ExternalLink, User as UserIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

type Ctx = { open: boolean; setOpen: (v: boolean) => void; openSearch: () => void };
const SearchCtx = createContext<Ctx | null>(null);
export function useGlobalSearch() {
  const c = useContext(SearchCtx);
  if (!c) throw new Error("useGlobalSearch must be used within GlobalSearchProvider");
  return c;
}

const PAGES: { name: string; path: string; section: string; icon: typeof LayoutDashboard }[] = [
  { name: "Dashboard", path: "/erp", section: "Overview", icon: LayoutDashboard },
  { name: "Web Orders", path: "/erp/orders/web", section: "Sales", icon: Globe },
  { name: "Order List", path: "/erp/orders/list", section: "Sales", icon: ClipboardList },
  { name: "Create Order", path: "/erp/orders/new", section: "Sales", icon: ShoppingCart },
  { name: "Inventory", path: "/erp/inventory", section: "Operations", icon: Boxes },
  { name: "Reorder Queue", path: "/erp/reorder-queue", section: "Operations", icon: Package },
  { name: "Purchase Orders", path: "/erp/purchase-orders", section: "Operations", icon: ClipboardList },
  { name: "Stocktake", path: "/erp/stocktake", section: "Operations", icon: ClipboardList },
  { name: "Courier", path: "/erp/courier", section: "Operations", icon: Package },
  { name: "Returns & Exchanges", path: "/erp/returns", section: "Operations", icon: Package },
  { name: "COD Reconciliation", path: "/erp/reconciliation", section: "Operations", icon: ClipboardList },
  { name: "Suppliers", path: "/erp/suppliers", section: "Operations", icon: Users },
  { name: "Imports", path: "/erp/imports", section: "Operations", icon: Package },
  { name: "Finance Overview", path: "/erp/finance", section: "Money", icon: Wallet },
  { name: "Finance Journal", path: "/erp/finance/journal", section: "Money", icon: Wallet },
  { name: "Finance Accounts & Wallets", path: "/erp/finance/accounts", section: "Money", icon: Wallet },
  { name: "Finance Receivables", path: "/erp/finance/receivables", section: "Money", icon: Wallet },
  { name: "Finance Dollar Purchase", path: "/erp/finance/dollar-purchase", section: "Money", icon: Wallet },
  { name: "Finance Budgets", path: "/erp/finance/budgets", section: "Money", icon: Wallet },
  { name: "Finance Taxes", path: "/erp/finance/taxes", section: "Money", icon: Wallet },
  { name: "Finance Reports", path: "/erp/finance/reports", section: "Money", icon: Wallet },
  { name: "Finance Product P&L", path: "/erp/finance/product-profitability", section: "Money", icon: Wallet },
  { name: "Marketing Today", path: "/erp/marketing", section: "Growth", icon: BarChart3 },
  { name: "CRM Customers", path: "/erp/crm", section: "Growth", icon: Heart },
  { name: "Analytics", path: "/erp/analytics", section: "Growth", icon: BarChart3 },
  { name: "Live Analytics", path: "/erp/analytics/live", section: "Growth", icon: BarChart3 },
  { name: "Users", path: "/erp/users", section: "Workspace", icon: Users },
  { name: "Settings", path: "/erp/settings", section: "Workspace", icon: Wallet },
  { name: "Diagnostics", path: "/erp/diagnostics", section: "Workspace", icon: BarChart3 },
];

const RECENT_KEY = "erp.search.recent";
function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
function saveRecent(q: string) {
  if (!q || typeof window === "undefined") return;
  const cur = loadRecent().filter((x) => x !== q);
  cur.unshift(q);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, 5))); } catch { /* ignore */ }
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function escapeIlike(s: string) {
  return s.replace(/[%,()]/g, " ").trim();
}

const STATUS_TONE: Record<string, string> = {
  new: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
  pending: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-900",
  confirmed: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
  processing: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900",
  incomplete: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900",
  good_but_no_response: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  no_response: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
  advance_payment: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900",
  shipped: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  complete: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  cancelled: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
  on_hold: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  returned: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-800",
};
function statusTone(s: string | null) {
  return STATUS_TONE[(s || "").toLowerCase()] || "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-800";
}

type OrderItemSummary = { id: string; name: string; quantity: number; variant_label: string | null; image: string | null; price: number | null; line_total?: number | null };
type OrderRow = {
  id: string;
  invoice_no: string | null;
  shipping_name: string | null;
  shipping_phone: string | null;
  alternate_phone?: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  shipping_city: string | null;
  shipping_district?: string | null;
  shipping_thana?: string | null;
  shipping_address?: string | null;
  total: number | null;
  status: string | null;
  web_status?: string | null;
  source?: string | null;
  tracking_number?: string | null;
  created_at: string | null;
  items?: OrderItemSummary[];
};

const ORDER_SEARCH_SELECT = "id, invoice_no, shipping_name, shipping_phone, alternate_phone, guest_name, guest_phone, shipping_city, shipping_district, shipping_thana, shipping_address, total, status, web_status, source, tracking_number, created_at, items:order_items(id, name, quantity, variant_label, image, price, line_total)";
const WEB_ORDER_SOURCES = new Set(["website", "pixel", "utm"]);

function primaryStatus(order: OrderRow) {
  return order.source && WEB_ORDER_SOURCES.has(order.source) && order.web_status ? order.web_status : order.status;
}

function prettyStatus(s: string | null | undefined) {
  return (s || "unknown").replace(/_/g, " ");
}

function orderLocation(order: OrderRow) {
  return [order.shipping_city, order.shipping_district, order.shipping_thana].filter(Boolean).join(" · ");
}

function OrderResultRow({ order, onOpen }: { order: OrderRow; onOpen: (path: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const { data, isFetching } = useQuery({
    queryKey: ["global-search-order-detail", order.id],
    enabled: expanded,
    staleTime: 30_000,
    queryFn: async () => {
      const [itemsRes, histRes] = await Promise.all([
        supabase.from("order_items").select("id, name, quantity, variant_label, image, price, line_total").eq("order_id", order.id),
        supabase.from("order_status_history").select("id, from_status, to_status, reason, note, changed_by, created_at").eq("order_id", order.id).order("created_at", { ascending: false }).limit(20),
      ]);
      const rows = histRes.data ?? [];
      const userIds = Array.from(new Set(rows.map((r: any) => r.changed_by).filter(Boolean))) as string[];
      const names = new Map<string, string>();
      if (userIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", userIds);
        (profs ?? []).forEach((p: any) => names.set(p.id, p.display_name ?? ""));
      }
      return {
        items: (itemsRes.data ?? []) as Array<{ id: string; name: string; quantity: number; variant_label: string | null; image: string | null; price: number | null; line_total: number | null }>,
        history: rows.map((r: any) => ({ ...r, staff: r.changed_by ? names.get(r.changed_by) || "Staff" : "System" })),
      };
    },
  });
  const customerName = order.shipping_name || order.guest_name || "—";
  const phone = order.shipping_phone || order.guest_phone || order.alternate_phone;
  const status = primaryStatus(order);
  const products = order.items ?? [];
  const remainingProducts = Math.max(0, products.length - 3);
  return (
    <div className="rounded-lg border border-border/60 bg-card/70 mb-2 overflow-hidden shadow-sm">
      <div
        role="button"
        onClick={() => setExpanded((v) => !v)}
        className="cursor-pointer hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-start gap-2 px-2.5 py-2">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />}
          <div className="h-8 w-8 rounded-md bg-muted/70 border border-border/50 shrink-0 flex items-center justify-center">
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-xs font-semibold shrink-0">#{order.invoice_no || order.id.slice(0, 8).toUpperCase()}</span>
              {status && (
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-semibold capitalize shrink-0", statusTone(status))}>
                  {prettyStatus(status)}
                </span>
              )}
              {order.web_status && order.status && order.web_status !== order.status && (
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded border capitalize shrink-0", statusTone(order.status))}>
                  Order: {prettyStatus(order.status)}
                </span>
              )}
              {order.source && <span className="text-[10px] px-1.5 py-0.5 rounded border bg-muted/40 uppercase tracking-wide shrink-0">{order.source}</span>}
              {order.created_at && (
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="font-medium truncate max-w-[190px]">{customerName}</span>
              {phone && <span className="text-muted-foreground font-mono">{phone}</span>}
              {orderLocation(order) && <span className="text-muted-foreground truncate max-w-[240px]">{orderLocation(order)}</span>}
              {order.tracking_number && <span className="text-muted-foreground font-mono truncate max-w-[160px]">{order.tracking_number}</span>}
            </div>
            {products.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {products.slice(0, 3).map((it) => (
                  <span key={it.id} className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/70 px-1.5 py-1 max-w-[220px]">
                    {it.image ? (
                      <img src={it.image} alt="" className="h-5 w-5 rounded object-cover border border-border/50 shrink-0" />
                    ) : (
                      <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-[11px] font-medium truncate">{it.name}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">×{it.quantity}</span>
                  </span>
                ))}
                {remainingProducts > 0 && <span className="text-[10px] text-muted-foreground px-1.5 py-1">+{remainingProducts} more</span>}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-sm font-semibold tabular-nums">৳{Number(order.total ?? 0).toLocaleString()}</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 shrink-0"
              onClick={(e) => { e.stopPropagation(); onOpen(`/erp/orders/${order.id}`); }}
            >
              <ExternalLink className="h-3 w-3 mr-1" /> Open
            </Button>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border/60 bg-muted/20 px-3 py-2.5 space-y-3">
          {isFetching && (
            <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Loading…
            </div>
          )}
          {!isFetching && data && (
            <>
              {data.items.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1.5">Products ({data.items.length})</div>
                  <ul className="space-y-1.5">
                    {data.items.map((it) => (
                      <li key={it.id} className="flex items-center gap-2 text-xs">
                        {it.image ? (
                          <img src={it.image} alt="" className="h-7 w-7 rounded object-cover border border-border/60 shrink-0" />
                        ) : (
                          <div className="h-7 w-7 rounded bg-muted shrink-0 flex items-center justify-center"><Package className="h-3 w-3 text-muted-foreground" /></div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{it.name}</div>
                          {it.variant_label && <div className="text-[10px] text-muted-foreground truncate">{it.variant_label}</div>}
                        </div>
                        <span className="text-[11px] tabular-nums shrink-0">×{it.quantity}</span>
                        {(it.line_total ?? it.price) != null && <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">৳{Number(it.line_total ?? it.price).toLocaleString()}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1.5">Activity timeline</div>
                {data.history.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">No status changes yet.</p>
                ) : (
                  <ol className="relative pl-4 space-y-2 before:absolute before:left-1 before:top-1 before:bottom-1 before:w-px before:bg-border">
                    {data.history.map((e: any) => (
                      <li key={e.id} className="relative">
                        <span className={cn("absolute -left-[10px] top-1.5 h-2 w-2 rounded-full ring-2 ring-background",
                          /confirm|deliver|complete/.test((e.to_status ?? "").toLowerCase()) ? "bg-emerald-500"
                          : /cancel/.test((e.to_status ?? "").toLowerCase()) ? "bg-rose-500"
                          : /hold/.test((e.to_status ?? "").toLowerCase()) ? "bg-amber-500"
                          : "bg-slate-400")} />
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          {e.from_status && (
                            <>
                              <span className={cn("px-1 py-0.5 rounded border text-[10px] capitalize", statusTone(e.from_status))}>{String(e.from_status).replace(/_/g, " ")}</span>
                              <span className="text-muted-foreground">→</span>
                            </>
                          )}
                          <span className={cn("px-1 py-0.5 rounded border text-[10px] capitalize", statusTone(e.to_status))}>{String(e.to_status).replace(/_/g, " ")}</span>
                          <span className="ml-auto text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
                          <UserIcon className="h-2.5 w-2.5" /><span>{e.staff}</span>
                        </div>
                        {(e.reason || e.note) && (
                          <p className="text-[10px] mt-0.5 rounded bg-background/60 border border-border/40 px-1.5 py-1 whitespace-pre-wrap">{e.reason || e.note}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CustomerResultRow({ customer, brandIds, onOpen }: { customer: { customer_key: string; name: string | null; orders_count: number | null; lifetime_value: number | null }; brandIds: string[]; onOpen: (path: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const { data, isFetching } = useQuery({
    queryKey: ["global-search-customer-orders", customer.customer_key, brandIds],
    enabled: expanded,
    staleTime: 30_000,
    queryFn: async () => {
      const key = customer.customer_key;
      const res = await applyBrandScope(
        supabase.from("orders").select(ORDER_SEARCH_SELECT),
        brandIds,
      )
        .or(`shipping_phone.like.%${key},guest_phone.like.%${key},alternate_phone.like.%${key}`)
        .order("created_at", { ascending: false })
        .limit(100);
      return (res.data ?? []) as OrderRow[];
    },
  });
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 mb-1.5 overflow-hidden">
      <div
        role="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 px-2.5 py-2 cursor-pointer hover:bg-muted/40 transition-colors"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        <Users className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate min-w-0 flex-1">
          {customer.name || customer.customer_key}
          <span className="text-muted-foreground font-normal"> · {customer.customer_key}</span>
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded border bg-muted/40 shrink-0">{customer.orders_count ?? 0} orders</span>
        <span className="text-xs tabular-nums shrink-0">৳{Number(customer.lifetime_value ?? 0).toLocaleString()}</span>
      </div>
      {expanded && (
        <div className="border-t border-border/60 bg-muted/20 px-2 py-2 space-y-1.5">
          {isFetching && (
            <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Loading orders…
            </div>
          )}
          {!isFetching && data && data.length === 0 && (
            <p className="text-[11px] text-muted-foreground px-2 py-1">No orders found.</p>
          )}
          {!isFetching && data && data.map((o) => (
            <OrderResultRow key={o.id} order={o} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

function SearchDialog({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const navigate = useNavigate();
  const { brandIds } = useBrand();
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 300);
  const term = escapeIlike(debounced);
  const enabled = term.length >= 2 && brandIds.length > 0;
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => { if (open) setRecent(loadRecent()); }, [open]);
  useEffect(() => { if (!open) setQuery(""); }, [open]);

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", term, brandIds],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const like = `%${term}%`;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(term);
      const [ordersRes, productsRes, customersRes] = await Promise.all([
        applyBrandScope(
          supabase.from("orders").select(ORDER_SEARCH_SELECT),
          brandIds,
        )
          .or(
            [
              `shipping_name.ilike.${like}`,
              `shipping_phone.ilike.${like}`,
              `alternate_phone.ilike.${like}`,
              `shipping_address.ilike.${like}`,
              `shipping_city.ilike.${like}`,
              `shipping_district.ilike.${like}`,
              `shipping_thana.ilike.${like}`,
              `guest_name.ilike.${like}`,
              `guest_phone.ilike.${like}`,
              `guest_email.ilike.${like}`,
              `invoice_no.ilike.${like}`,
              `tracking_number.ilike.${like}`,
              ...(isUuid ? [`id.eq.${term}`] : []),
            ].join(","),
          )
          .order("created_at", { ascending: false })
          .limit(50),
        applyBrandScope(
          supabase.from("products").select("id, title, sku, stock, image"),
          brandIds,
        ).or(`title.ilike.${like},sku.ilike.${like}`).limit(5),
        supabase.from("crm_customers_v")
          .select("customer_key, name, orders_count, lifetime_value, brand_ids")
          .or(`name.ilike.${like},customer_key.ilike.${like}`)
          .overlaps("brand_ids", brandIds)
          .limit(5),
      ]);
      return {
        orders: (ordersRes.data ?? []) as OrderRow[],
        products: (productsRes.data ?? []) as Array<{ id: string; title: string; sku: string | null; stock: number | null; image: string | null }>,
        customers: (customersRes.data ?? []) as Array<{ customer_key: string; name: string | null; orders_count: number | null; lifetime_value: number | null }>,
      };
    },
  });

  const matchedPages = useMemo(() => {
    if (term.length < 2) return [];
    const q = term.toLowerCase();
    return PAGES.filter((p) => p.name.toLowerCase().includes(q) || p.section.toLowerCase().includes(q)).slice(0, 6);
  }, [term]);

  const go = useCallback((path: string) => {
    saveRecent(query.trim());
    setOpen(false);
    navigate({ to: path as never });
  }, [navigate, query, setOpen]);

  const showResults = term.length >= 2;
  const quickLinks = PAGES.slice(0, 6);

  return (
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false} contentClassName="sm:max-w-3xl">
      <CommandInput
        placeholder="Search orders, products, customers, pages..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[70vh]">
        {!showResults && (
          <>
            {recent.length > 0 && (
              <CommandGroup heading="Recent searches">
                {recent.map((r) => (
                  <CommandItem key={r} value={`recent-${r}`} onSelect={() => setQuery(r)}>
                    <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
                    {r}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading="Quick links">
              {quickLinks.map((p) => (
                <CommandItem key={p.path} value={`quick-${p.path}`} onSelect={() => go(p.path)}>
                  <p.icon className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span>{p.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{p.section}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {showResults && (
          <>
            {isFetching && (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Searching...
              </div>
            )}
            {!isFetching && !data?.orders.length && !data?.products.length && !data?.customers.length && matchedPages.length === 0 && (
              <CommandEmpty>No results for "{query}"</CommandEmpty>
            )}
            {data && data.orders.length > 0 && (
              <CommandGroup heading={`Orders (${data.orders.length})`}>
                <div className="px-1 py-1">
                  {data.orders.map((o) => (
                    <OrderResultRow key={o.id} order={o} onOpen={go} />
                  ))}
                </div>
              </CommandGroup>
            )}
            {data && data.products.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={`Products (${data.products.length})`}>
                  {data.products.map((p) => (
                    <CommandItem key={p.id} value={`p-${p.id}`} onSelect={() => go(`/erp/inventory?q=${encodeURIComponent(p.sku || p.title)}`)}>
                      {p.image ? (
                        <img src={p.image} alt="" className="h-6 w-6 rounded object-cover mr-2" />
                      ) : (
                        <Package className="h-4 w-4 mr-2 text-muted-foreground" />
                      )}
                      <span className="truncate">{p.title}</span>
                      {p.sku && <span className="ml-2 text-xs text-muted-foreground">{p.sku}</span>}
                      <Badge variant="outline" className="ml-auto text-[10px]">Stock: {p.stock ?? 0}</Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            {data && data.customers.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={`Customers (${data.customers.length})`}>
                  <div className="px-1 py-1">
                    {data.customers.map((c) => (
                      <CustomerResultRow key={c.customer_key} customer={c} brandIds={brandIds} onOpen={go} />
                    ))}
                  </div>
                </CommandGroup>
              </>
            )}
            {matchedPages.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={`Pages (${matchedPages.length})`}>
                  {matchedPages.map((p) => (
                    <CommandItem key={p.path} value={`pg-${p.path}`} onSelect={() => go(p.path)}>
                      <p.icon className="h-4 w-4 mr-2 text-muted-foreground" />
                      <span>{p.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{p.section}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openSearch = useCallback(() => setOpen(true), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const value = useMemo(() => ({ open, setOpen, openSearch }), [open, openSearch]);

  return (
    <SearchCtx.Provider value={value}>
      {children}
      <SearchDialog open={open} setOpen={setOpen} />
    </SearchCtx.Provider>
  );
}