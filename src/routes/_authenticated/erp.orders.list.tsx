import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Download, RefreshCw, Inbox } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useBrand } from "@/contexts/brand-context";
import {
  useOrdersQuery, useOrderStatusCounts, fetchAllMatchingOrderIds,
  type OrdersFilter, type OrdersSortKey, type OrdersSortDir,
} from "@/hooks/erp/use-orders-query";
import { useCourierShipments, COURIER_BUCKET_META, type CourierBucket, type CourierShipmentRow } from "@/hooks/erp/use-courier-shipments";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { OrdersStatusTabs } from "@/components/erp/orders/orders-status-tabs";
import { OrdersToolbar } from "@/components/erp/orders/orders-toolbar";
import { OrdersBulkActions } from "@/components/erp/orders/orders-bulk-actions";
import { OrdersTable } from "@/components/erp/orders/orders-table";
import { OrdersSelectionBar } from "@/components/erp/orders/orders-selection-bar";
import { OrdersPagination } from "@/components/erp/orders/orders-pagination";
import { ErpPageHeader, HeaderChip } from "@/components/erp/ui/page-header";
import { EmptyState } from "@/components/erp/ui/data-panel";
import { useOrdersPrefs, useSavedViews } from "@/hooks/erp/use-orders-prefs";
import { OrderDrawer } from "@/components/erp/orders/order-drawer";
import { IncompleteOrdersTable } from "@/components/erp/orders/incomplete-orders-table";
import { useAbandonedCartCount } from "@/hooks/erp/use-abandoned-carts-query";
import { PathaoBulkUploadDialog } from "@/components/erp/orders/pathao-bulk-upload-dialog";
import { PreorderConvertDialog } from "@/components/erp/orders/preorder-convert-dialog";
import { BulkPrintDialog, type PrintMode } from "@/components/erp/orders/bulk-print-dialog";
import { CourierStatusSyncDialog } from "@/components/erp/orders/courier-status-sync-dialog";
import { PhoneHistorySyncDialog } from "@/components/erp/orders/phone-history-sync-dialog";
import { downloadCsv, exportOrdersCsv, statusAge, statusSinceTs, tabForStatuses, STATUS_TABS, type OrderRow, type OrderStatus } from "@/lib/erp/orders";
import { AlertTriangle, RefreshCcw } from "lucide-react";

const WEB_ORDER_SOURCE_FILTER = "source.not.in.(website,pixel,utm)";

type OrdersSearch = {
  q?: string; tab?: string; page?: number; size?: number;
  sort?: OrdersSortKey; dir?: OrdersSortDir;
  src?: string; from?: string; to?: string;
  courier?: string; bucket?: CourierBucket;
  pm?: string; ps?: string; city?: string; assignee?: string;
  min?: number; max?: number;
  adv?: "any" | "with" | "without";
  printed?: "all" | "printed" | "unprinted";
  view?: "orders" | "incomplete";
};

function searchFromFilter(filter: OrdersFilter, view: "orders" | "incomplete"): OrdersSearch {
  const activeTabKey = view === "incomplete" ? "incomplete" : tabForStatuses(filter.statuses);
  return {
    q: filter.search || undefined,
    tab: activeTabKey,
    page: filter.page || undefined,
    size: filter.pageSize !== 50 ? filter.pageSize : undefined,
    sort: filter.sortKey !== "created_at" ? filter.sortKey : undefined,
    dir: filter.sortDir !== "desc" ? filter.sortDir : undefined,
    src: filter.source ?? undefined,
    from: filter.dateFrom ?? undefined,
    to: filter.dateTo ?? undefined,
    courier: filter.courier ?? undefined,
    bucket: filter.courierBucket ?? undefined,
    pm: filter.paymentMethod ?? undefined,
    ps: filter.paymentStatus ?? undefined,
    city: filter.city ?? undefined,
    assignee: filter.assignee ?? undefined,
    min: filter.amountMin ?? undefined,
    max: filter.amountMax ?? undefined,
    adv: filter.advanceFilter && filter.advanceFilter !== "any" ? filter.advanceFilter : undefined,
    printed: filter.printedFilter && filter.printedFilter !== "all" ? filter.printedFilter : undefined,
    view: view === "incomplete" ? "incomplete" : undefined,
  };
}

function filterToSearch(filter: Partial<OrdersFilter>): OrdersSearch {
  return {
    q: filter.search || undefined,
    tab: filter.statuses ? tabForStatuses(filter.statuses) : undefined,
    page: filter.page ?? undefined,
    size: filter.pageSize ?? undefined,
    sort: filter.sortKey ?? undefined,
    dir: filter.sortDir ?? undefined,
    src: filter.source ?? undefined,
    from: filter.dateFrom ?? undefined,
    to: filter.dateTo ?? undefined,
    courier: filter.courier ?? undefined,
    bucket: filter.courierBucket ?? undefined,
    pm: filter.paymentMethod ?? undefined,
    ps: filter.paymentStatus ?? undefined,
    city: filter.city ?? undefined,
    assignee: filter.assignee ?? undefined,
    min: filter.amountMin ?? undefined,
    max: filter.amountMax ?? undefined,
    adv: filter.advanceFilter && filter.advanceFilter !== "any" ? filter.advanceFilter : undefined,
    printed: filter.printedFilter && filter.printedFilter !== "all" ? filter.printedFilter : undefined,
  };
}

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const num = (v: unknown) => {
  const n = Number(v);
  return v === "" || v == null || Number.isNaN(n) ? undefined : n;
};

export const Route = createFileRoute("/_authenticated/erp/orders/list")({
  head: () => ({ meta: [{ title: "Orders — ERP" }] }),
  validateSearch: (s: Record<string, unknown>): OrdersSearch => ({
    q: str(s['q']),
    tab: str(s['tab']),
    page: num(s['page']),
    size: num(s['size']),
    sort: str(s['sort']) as OrdersSortKey | undefined,
    dir: str(s['dir']) === "asc" ? "asc" : str(s['dir']) === "desc" ? "desc" : undefined,
    src: str(s['src']),
    from: str(s['from']),
    to: str(s['to']),
    courier: str(s['courier']),
    bucket: str(s['bucket']) as CourierBucket | undefined,
    pm: str(s['pm']),
    ps: str(s['ps']),
    city: str(s['city']),
    assignee: str(s['assignee']),
    min: num(s['min']),
    max: num(s['max']),
    adv: (["any", "with", "without"] as const).find((x) => x === s['adv']),
    printed: (["all", "printed", "unprinted"] as const).find((x) => x === s['printed']),
    view: s['view'] === "incomplete" ? "incomplete" : undefined,
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const qc = useQueryClient();
  const navigate = useNavigate({ from: "/erp/orders/list" });
  const sp = Route.useSearch();
  const { activeBrand, brandIds, isAllBrands } = useBrand();

  // URL is the single source of truth for filters and the active tab/view.
  const spKey = useMemo(() => JSON.stringify(sp), [sp]);
  const view = sp.view === "incomplete" ? "incomplete" : "orders";

  const filter = useMemo<OrdersFilter>(
    () => {
      const tab = STATUS_TABS.find((t) => t.key === (sp.tab ?? "pending"));
      return {
        brandId: activeBrand?.id ?? null,
        brandIds: isAllBrands ? brandIds : activeBrand ? [activeBrand.id] : [],
        search: sp.q ?? "",
        statuses: view === "incomplete" ? [] : (tab?.statuses ?? ["confirmed"]),
        source: sp.src ?? null,
        dateFrom: sp.from ?? null,
        dateTo: sp.to ?? null,
        courier: sp.courier ?? null,
        page: sp.page ?? 0,
        pageSize: sp.size ?? 50,
        sortKey: sp.sort ?? "created_at",
        sortDir: sp.dir ?? "desc",
        courierBucket: sp.bucket ?? null,
        paymentMethod: sp.pm ?? null,
        paymentStatus: sp.ps ?? null,
        city: sp.city ?? null,
        assignee: sp.assignee ?? null,
        amountMin: sp.min ?? null,
        amountMax: sp.max ?? null,
        advanceFilter: sp.adv ?? "any",
        printedFilter: sp.printed ?? "all",
      };
    },
    [spKey, activeBrand?.id, isAllBrands, brandIds],
  );

  const prefs = useOrdersPrefs();
  const savedViews = useSavedViews();
  const [selectingAll, setSelectingAll] = useState(false);
  const [incompletePage, setIncompletePage] = useState(0);
  const [exporting, setExporting] = useState(false);

  const effective = useMemo<OrdersFilter>(
    () => ({
      ...filter,
      brandId: activeBrand?.id ?? null,
      brandIds: isAllBrands ? brandIds : activeBrand ? [activeBrand.id] : [],
    }),
    [filter, activeBrand?.id, isAllBrands, brandIds],
  );

  const { data, isLoading, isFetching } = useOrdersQuery(effective);

  // Stable update helper that writes the next filter state to the URL.
  const filterRef = useRef(filter);
  const viewRef = useRef<"incomplete" | "orders">(view);
  filterRef.current = filter;
  viewRef.current = view;
  const updateFilter = useCallback(
    (patchOrFn: Partial<OrdersFilter> | ((f: OrdersFilter) => Partial<OrdersFilter>)) => {
      const patch = typeof patchOrFn === "function" ? patchOrFn(filterRef.current) : patchOrFn;
      const nextFilter = { ...filterRef.current, ...patch };
      navigate({ replace: true, search: searchFromFilter(nextFilter, viewRef.current) });
    },
    [navigate],
  );

  const { data: countsData } = useOrderStatusCounts(effective);
  const { data: incompleteCount } = useAbandonedCartCount(effective.brandId, effective.brandIds);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [pathaoBulkOpen, setPathaoBulkOpen] = useState(false);
  const [preorderOpen, setPreorderOpen] = useState(false);
  const [preorderIds, setPreorderIds] = useState<string[]>([]);
  const [printMode, setPrintMode] = useState<PrintMode | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [singleSyncId, setSingleSyncId] = useState<string | null>(null);
  const [phoneHistOpen, setPhoneHistOpen] = useState(false);
  // Live courier bucket is resolved server-side (see useOrdersQuery) so counts
  // and pagination stay correct instead of filtering only the current page.
  const courierStatusFilter: CourierBucket | "all" = filter.courierBucket ?? "all";
  const setCourierStatusFilter = (v: CourierBucket | "all") =>
    updateFilter({ courierBucket: v === "all" ? null : v, page: 0 });
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());

  // Bulk fetch live courier shipments for the current page
  const pageOrderIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const { data: shipmentsMap = {} } = useCourierShipments(pageOrderIds);

  const visibleRows = rows;

  // Realtime: subscribe to courier_shipments UPDATE/INSERT
  const idsKey = useMemo(() => [...pageOrderIds].sort().join(","), [pageOrderIds]);
  const orderIdSetRef = useRef<Set<string>>(new Set());
  useEffect(() => { orderIdSetRef.current = new Set(pageOrderIds); }, [pageOrderIds]);
  const flashTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  useEffect(() => () => {
    flashTimersRef.current.forEach((t) => clearTimeout(t));
    flashTimersRef.current.clear();
  }, []);
  useEffect(() => {
    if (!idsKey) return;
    const queryKey = ["courier-shipments", idsKey] as const;
    const channel = supabase
      .channel(`courier-status-live-${idsKey.slice(0, 32)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "courier_shipments" },
        (payload) => {
          const row = (payload.new ?? payload.old) as CourierShipmentRow | undefined;
          if (!row?.order_id || !orderIdSetRef.current.has(row.order_id)) return;
          if (payload.eventType === "DELETE") {
            qc.setQueryData<Record<string, CourierShipmentRow>>(queryKey, (old) => {
              if (!old) return old;
              const next = { ...old };
              delete next[row.order_id];
              return next;
            });
            return;
          }
          const newRow = payload.new as CourierShipmentRow;
          qc.setQueryData<Record<string, CourierShipmentRow>>(queryKey, (old) => {
            const prev = old?.[newRow.order_id];
            // Only replace if this shipment is newer
            if (prev && prev.updated_at && newRow.updated_at && prev.updated_at > newRow.updated_at) {
              return old;
            }
            return { ...(old ?? {}), [newRow.order_id]: newRow };
          });
          // Flash row briefly
          setFlashIds((s) => { const n = new Set(s); n.add(newRow.order_id); return n; });
          const timer = setTimeout(() => {
            flashTimersRef.current.delete(timer);
            setFlashIds((s) => { const n = new Set(s); n.delete(newRow.order_id); return n; });
          }, 2500);
          flashTimersRef.current.add(timer);
        },
      )
      .subscribe();
    // Also listen to orders UPDATE so status/payment_status changes reflect live
    const ordersChannel = supabase
      .channel(`orders-live-${idsKey.slice(0, 32)}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as { id?: string } | undefined;
          if (!row?.id || !orderIdSetRef.current.has(row.id)) return;
          qc.invalidateQueries({ queryKey: ["orders"] });
          qc.invalidateQueries({ queryKey: ["orders-status-counts"] });
          setFlashIds((s) => { const n = new Set(s); n.add(row.id!); return n; });
          const timer = setTimeout(() => {
            flashTimersRef.current.delete(timer);
            setFlashIds((s) => { const n = new Set(s); n.delete(row.id!); return n; });
          }, 2500);
          flashTimersRef.current.add(timer);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(ordersChannel);
    };
  }, [idsKey, qc]);

  const courierFilterActive = courierStatusFilter !== "all";

  // Proactive nudge: stuck orders (3+ days in current status) on this page
  const stuckIds = useMemo(() => {
    const out: string[] = [];
    for (const r of visibleRows) {
      const age = statusAge(statusSinceTs(r));
      if (age.tone === "stale") out.push(r.id);
    }
    return out;
  }, [visibleRows]);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  useEffect(() => { setNudgeDismissed(false); }, [filter.page, filter.statuses.join(",")]);

  // BUG 1: clear selection when page/filter/tab/view changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [
    filter.page,
    filter.pageSize,
    filter.search,
    filter.source,
    filter.courier,
    filter.dateFrom,
    filter.dateTo,
    filter.statuses.join(","),
    view,
  ]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };
  const toggleAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(visibleRows.map((r) => r.id)));
    else setSelectedIds(new Set());
  };

  /** Select every order matching the current filter, not just this page. */
  const selectAllMatching = async () => {
    setSelectingAll(true);
    try {
      const ids = await fetchAllMatchingOrderIds(effective);
      setSelectedIds(new Set(ids));
      toast.success(`${ids.length.toLocaleString()} orders selected`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSelectingAll(false);
    }
  };

  const applyView = (searchObj: Record<string, unknown>) => {
    navigate({ replace: true, search: { ...sp, ...filterToSearch(searchObj as Partial<OrdersFilter>), page: 0 } });
  };

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      const { error } = await supabase.rpc("transition_order_status", { _order_id: id, _new_status: status });
      if (error) throw error;
    },
    onMutate: async ({ id, status }) => {
      setPendingIds((prev) => {
        const n = new Set(prev); n.add(id); return n;
      });
      await qc.cancelQueries({ queryKey: ["orders"] });
      const queryKey = ["orders", effective] as const;
      const previous = qc.getQueryData<{ rows: OrderRow[]; total: number }>(queryKey);
      if (previous) {
        qc.setQueryData(queryKey, {
          ...previous,
          rows: previous.rows.map((o) => (o.id === id ? { ...o, status } : o)),
        });
      }
      return { previous, queryKey };
    },
    onSuccess: () => {
      toast.success("Status updated");
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(ctx.queryKey, ctx.previous);
      toast.error(e.message);
    },
    onSettled: (_d, _e, vars) => {
      setPendingIds((prev) => {
        const n = new Set(prev); n.delete(vars.id); return n;
      });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders-status-counts"] });
    },
  });

  const bulkStatus = useMutation({
    mutationFn: async (status: OrderStatus) => {
      const ids = Array.from(selectedIds);
      const results = await Promise.allSettled(
        ids.map(async (id) => {
          const { error } = await supabase.rpc("transition_order_status", { _order_id: id, _new_status: status });
          if (error) throw error;
          return id;
        }),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      const succeeded = results.length - failed;
      return { failed, succeeded };
    },
    onSuccess: ({ failed, succeeded }) => {
      if (failed > 0) toast.error(`${failed} orders failed, ${succeeded} succeeded`);
      else toast.success(`${succeeded} orders updated`);
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders-status-counts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // BUG 3: export ALL filtered orders, not just current page
  const handleExport = async () => {
    const brandsArr = effective.brandIds && effective.brandIds.length > 0
      ? effective.brandIds
      : effective.brandId ? [effective.brandId] : [];
    if (brandsArr.length === 0) return;
    setExporting(true);
    const tid = toast.loading("Preparing export…");
    try {
      const pageSize = 500;
      const all: OrderRow[] = [];
      for (let page = 0; ; page++) {
        let q = applyBrandScope(
          supabase.from("orders").select(
            "id,invoice_no,created_at,status,confirmation_status,total,subtotal,shipping_fee,discount_amount,advance_amount,payment_method,shipping_name,shipping_phone,shipping_address,shipping_city,shipping_district,shipping_thana,guest_name,guest_phone,is_guest_order,user_id,brand_id,source,courier_name,tracking_number,paid_at"
          ),
          brandsArr,
        ).order("created_at", { ascending: false });
        if (effective.statuses.length > 0) {
          q = q.in("status", effective.statuses);
          if (effective.statuses.includes("confirmed")) {
            q = q.or(`status.neq.confirmed,source.is.null,${WEB_ORDER_SOURCE_FILTER},web_status.eq.complete`);
          }
        } else {
          q = q.neq("status", "new");
          q = q.or(`status.neq.confirmed,source.is.null,${WEB_ORDER_SOURCE_FILTER},web_status.eq.complete`);
        }
        if (effective.source) q = q.eq("source", effective.source as never);
        if (effective.courier) q = q.eq("courier_name", effective.courier);
        if (effective.dateFrom) q = q.gte("created_at", effective.dateFrom);
        if (effective.dateTo) q = q.lte("created_at", effective.dateTo);
        if (effective.search.trim()) {
          const s = effective.search.trim();
          q = q.or(
            `shipping_name.ilike.%${s}%,shipping_phone.ilike.%${s}%,guest_name.ilike.%${s}%,guest_phone.ilike.%${s}%,tracking_number.ilike.%${s}%`,
          );
        }
        const from = page * pageSize;
        const to = from + pageSize - 1;
        const { data, error } = await q.range(from, to);
        if (error) throw error;
        const batch = (data ?? []) as unknown as OrderRow[];
        all.push(...batch);
        if (batch.length < pageSize) break;
        if (all.length > 50000) break;
      }
      const csv = exportOrdersCsv(all);
      downloadCsv(`orders-${activeBrand?.slug ?? "all"}-${new Date().toISOString().slice(0,10)}.csv`, csv);
      toast.success(`Exported ${all.length.toLocaleString()} orders`, { id: tid });
    } catch (e) {
      toast.error((e as Error).message, { id: tid });
    } finally {
      setExporting(false);
    }
  };

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["orders-status-counts"] });
    qc.invalidateQueries({ queryKey: ["abandoned-carts"] });
    qc.invalidateQueries({ queryKey: ["abandoned-carts-count"] });
  };

  const clearAllFilters = () => {
    navigate({ replace: true, search: { tab: "all" } });
  };
  const hasActiveFilters = !!(filter.search || filter.source || filter.courier || filter.dateFrom || filter.dateTo || filter.statuses.length > 0);

  const totalPages = Math.max(1, Math.ceil(total / filter.pageSize));
  const activeTab =
    view === "incomplete" ? "incomplete"
      : tabForStatuses(effective.statuses);

  // Keyboard shortcuts: "/" focus search, "a" select page, "Esc" clear, "r" refresh.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.key === "Escape") { setSelectedIds(new Set()); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>("input[data-orders-search]")?.focus();
      } else if (e.key === "a") {
        e.preventDefault();
        setSelectedIds(new Set(visibleRows.map((r) => r.id)));
      } else if (e.key === "r") {
        e.preventDefault();
        handleRefresh();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRows]);

  return (
    <div className="p-4 md:p-6 min-h-screen bg-background">
      <ErpPageHeader
        live
        eyebrow={activeBrand?.name ?? "All brands"}
        title="Orders"
        subtitle="Manage and track all your orders in one place"
        chips={
          <>
            <HeaderChip value={total.toLocaleString()} label="orders" />
            {selectedIds.size > 0 && <HeaderChip tone="primary" value={selectedIds.size} label="selected" />}
          </>
        }
        actions={
          <>
          {lastSyncedAt && (
            <span className="text-[10px] text-muted-foreground/70 hidden md:inline">
              Synced {relTimeShort(lastSyncedAt)}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-2 rounded-xl border border-[var(--panel-border)] bg-card px-3 text-[13px] font-medium text-foreground/80 hover:text-foreground"
            onClick={handleRefresh}
            title="Refresh (r)"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Sync
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-2 rounded-xl border border-[var(--panel-border)] bg-card px-3 text-[13px] font-medium text-foreground/80 hover:text-foreground"
            onClick={handleExport}
            disabled={exporting}
          >
            <Download className={`h-3.5 w-3.5 ${exporting ? "animate-pulse" : ""}`} /> {exporting ? "Exporting…" : "Export"}
          </Button>
          <Link to="/erp/orders/new">
            <Button size="sm" className="h-9 gap-2 rounded-xl px-3.5 text-[13px] shadow-sm">
              <Plus className="h-4 w-4" />Create Order
            </Button>
          </Link>
          </>
        }
      />

      <div className="space-y-3">
        <OrdersStatusTabs
          active={activeTab}
          counts={countsData?.counts ?? {}}
          total={countsData?.total ?? 0}
          incompleteCount={incompleteCount ?? 0}
          onChange={(_statuses, key) => {
            setIncompletePage(0);
            if (key === "incomplete") {
              navigate({ replace: true, search: { ...sp, tab: "incomplete", view: "incomplete" } });
            } else {
              navigate({ replace: true, search: { ...sp, tab: key, view: undefined } });
            }
          }}
        />
        {view === "incomplete" ? (
          <>
            <OrdersToolbar filter={effective} onChange={updateFilter} />
            <div className="overflow-hidden rounded-2xl border border-[var(--panel-border)] bg-card">
            <IncompleteOrdersTable
              brandId={effective.brandId}
              brandIds={effective.brandIds}
              search={effective.search}
              page={incompletePage}
              pageSize={50}
              onPageChange={setIncompletePage}
              onOpenOrder={setOpenId}
            />
            </div>
          </>
        ) : (
          <>
          {stuckIds.length > 0 && !nudgeDismissed && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-300/50 bg-amber-500/[0.07] px-3 py-2 text-[12px] dark:border-amber-900/50">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <span className="text-foreground/90">
                <span className="tabular-nums font-semibold">{stuckIds.length}</span> order{stuckIds.length > 1 ? "s" : ""} stuck 3+ days
              </span>
              <div className="flex-1" />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 text-[11px] font-normal"
                onClick={() => setSelectedIds(new Set(stuckIds))}
              >
                Select {stuckIds.length}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-[11px] font-normal"
                onClick={() => { setSelectedIds(new Set(stuckIds)); setSyncOpen(true); }}
              >
                <RefreshCcw className="h-3 w-3" /> Sync
              </Button>
              <button
                type="button"
                onClick={() => setNudgeDismissed(true)}
                className="ml-0.5 h-6 w-6 grid place-items-center rounded text-muted-foreground hover:text-foreground"
                title="Dismiss"
              >
                ×
              </button>
            </div>
          )}
          <OrdersToolbar
          filter={effective}
          onChange={updateFilter}
          density={prefs.density}
          onDensityChange={prefs.setDensity}
          hiddenColumns={prefs.hiddenColumns}
          onToggleColumn={prefs.toggleColumn}
          onResetColumns={prefs.resetColumns}
          savedViews={savedViews.views}
          onSaveView={(name) =>
            savedViews.save(name, {
              search: filter.search, source: filter.source, courier: filter.courier,
              courierBucket: filter.courierBucket ?? null, paymentMethod: filter.paymentMethod ?? null,
              paymentStatus: filter.paymentStatus ?? null, city: filter.city ?? null,
              assignee: filter.assignee ?? null, amountMin: filter.amountMin ?? null,
              amountMax: filter.amountMax ?? null, advanceFilter: filter.advanceFilter ?? "any",
              printedFilter: filter.printedFilter ?? "all", dateFrom: filter.dateFrom, dateTo: filter.dateTo,
              statuses: filter.statuses, sortKey: filter.sortKey, sortDir: filter.sortDir,
            })
          }
          onApplyView={(v) => applyView(v.search)}
          onDeleteView={savedViews.remove}
          rightSlot={
            <OrdersBulkActions
              selectedCount={selectedIds.size}
              totalCount={rows.length}
              onSelectAll={() => setSelectedIds(new Set(rows.map((r) => r.id)))}
              onClear={() => setSelectedIds(new Set())}
              onStatus={(s) => bulkStatus.mutate(s)}
              onExport={handleExport}
              onSendToPathao={() => {
                if (selectedIds.size === 0) return;
                setPathaoBulkOpen(true);
              }}
              onSyncCourier={() => {
                if (selectedIds.size === 0) return;
                setSyncOpen(true);
              }}
              onPhoneHistory={() => {
                if (selectedIds.size === 0) return;
                setPhoneHistOpen(true);
              }}
              onPreorder={() => {
                if (selectedIds.size === 0) return;
                setPreorderIds(Array.from(selectedIds));
                setPreorderOpen(true);
              }}
              onPrint={(mode) => {
                if (selectedIds.size === 0) return;
                setPrintMode(mode);
              }}
              isPending={bulkStatus.isPending}
            />
          }
        />
        <div className="overflow-hidden rounded-2xl border border-[var(--panel-border)] bg-card">
        <OrdersTable
          rows={visibleRows}
          loading={isLoading}
          density={prefs.density}
          hiddenColumns={prefs.hiddenColumns}
          sortKey={filter.sortKey ?? "created_at"}
          sortDir={filter.sortDir ?? "desc"}
          onSortChange={(key) =>
            updateFilter((f) => ({
              ...f,
              sortKey: key,
              sortDir: f.sortKey === key ? ((f.sortDir ?? "desc") === "desc" ? "asc" : "desc") : "desc",
              page: 0,
            }))
          }
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          onRowClick={setOpenId}
          onStatusChange={(id, status) => statusMutation.mutate({ id, status })}
          pendingStatusIds={pendingIds}
          shipmentsByOrderId={shipmentsMap}
          flashOrderIds={flashIds}
          onSyncRow={(id) => { setSingleSyncId(id); }}
          onPreorder={(id) => { setPreorderIds([id]); setPreorderOpen(true); }}
        />
        {!isLoading && visibleRows.length === 0 && (
          <EmptyState
            icon={<Inbox className="h-7 w-7" />}
            title="No orders found"
            description={
              courierFilterActive
                ? `No orders with courier status "${COURIER_BUCKET_META[courierStatusFilter as CourierBucket].label}" on this page.`
                : "Try adjusting your filters or date range."
            }
            action={
              (hasActiveFilters || courierFilterActive) ? (
                <Button variant="outline" size="sm" onClick={() => { clearAllFilters(); setCourierStatusFilter("all"); }}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        )}
        <OrdersPagination
          page={filter.page}
          pageSize={filter.pageSize}
          total={total}
          rowsOnPage={visibleRows.length}
          onPage={(p) => updateFilter({ page: p })}
          onPageSize={(n) => updateFilter({ pageSize: n, page: 0 })}
        />
        </div>
          </>
        )}
      </div>

      {view === "orders" && (
        <OrdersSelectionBar
          count={selectedIds.size}
          totalMatching={total}
          allMatchingSelected={selectedIds.size >= total}
          isSelectingAll={selectingAll}
          onSelectAllMatching={selectAllMatching}
          onClear={() => setSelectedIds(new Set())}
          onQuickStatus={(s) => bulkStatus.mutate(s)}
          onPrint={() => setPrintMode("invoice")}
          onBookCourier={() => setPathaoBulkOpen(true)}
          onSyncCourier={() => setSyncOpen(true)}
          isPending={bulkStatus.isPending}
        />
      )}

      <OrderDrawer orderId={openId} onClose={() => setOpenId(null)} />

      <PreorderConvertDialog
        open={preorderOpen}
        onOpenChange={setPreorderOpen}
        orderIds={preorderIds}
        brandId={activeBrand?.id ?? null}
        onDone={() => { setPreorderIds([]); setSelectedIds(new Set()); }}
      />

      <PathaoBulkUploadDialog
        open={pathaoBulkOpen}
        onOpenChange={(o) => {
          setPathaoBulkOpen(o);
          if (!o) setSelectedIds(new Set());
        }}
        orders={rows.filter((r) => selectedIds.has(r.id)).map((r) => ({ id: r.id, invoice_no: r.invoice_no }))}
      />

      <BulkPrintDialog
        open={printMode !== null}
        onOpenChange={(o) => { if (!o) setPrintMode(null); }}
        mode={printMode ?? "invoice"}
        orderIds={Array.from(selectedIds)}
      />

      <CourierStatusSyncDialog
        open={syncOpen}
        onOpenChange={(o) => {
          setSyncOpen(o);
          if (!o) {
            setSelectedIds(new Set());
            setLastSyncedAt(Date.now());
            qc.invalidateQueries({ queryKey: ["courier-shipments"] });
          }
        }}
        orderIds={Array.from(selectedIds)}
      />

      <CourierStatusSyncDialog
        open={singleSyncId !== null}
        onOpenChange={(o) => {
          if (!o) {
            setSingleSyncId(null);
            setLastSyncedAt(Date.now());
            qc.invalidateQueries({ queryKey: ["courier-shipments"] });
          }
        }}
        orderIds={singleSyncId ? [singleSyncId] : []}
      />

      <PhoneHistorySyncDialog
        open={phoneHistOpen}
        onOpenChange={(o) => {
          setPhoneHistOpen(o);
          if (!o) setSelectedIds(new Set());
        }}
        orders={rows
          .filter((r) => selectedIds.has(r.id))
          .map((r) => ({
            id: r.id,
            invoice_no: r.invoice_no ?? null,
            customer: (r as any).shipping_name ?? (r as any).guest_name ?? null,
            phone: (r as any).shipping_phone ?? (r as any).guest_phone ?? null,
            status: r.status,
          }))}
      />
    </div>
  );
}

function relTimeShort(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
