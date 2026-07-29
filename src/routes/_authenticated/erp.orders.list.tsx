import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Download, RefreshCw, Inbox, Truck } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBrand } from "@/contexts/brand-context";
import { useOrdersQuery, useOrderStatusCounts, type OrdersFilter } from "@/hooks/erp/use-orders-query";
import { useCourierShipments, normalizeCourierStatus, COURIER_BUCKETS, COURIER_BUCKET_META, type CourierBucket, type CourierShipmentRow } from "@/hooks/erp/use-courier-shipments";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { OrdersStatusTabs } from "@/components/erp/orders/orders-status-tabs";
import { OrdersToolbar } from "@/components/erp/orders/orders-toolbar";
import { OrdersBulkActions } from "@/components/erp/orders/orders-bulk-actions";
import { OrdersTable } from "@/components/erp/orders/orders-table";
import { OrderDrawer } from "@/components/erp/orders/order-drawer";
import { IncompleteOrdersTable } from "@/components/erp/orders/incomplete-orders-table";
import { useAbandonedCartCount } from "@/hooks/erp/use-abandoned-carts-query";
import { PathaoBulkUploadDialog } from "@/components/erp/orders/pathao-bulk-upload-dialog";
import { PreorderConvertDialog } from "@/components/erp/orders/preorder-convert-dialog";
import { BulkPrintDialog, type PrintMode } from "@/components/erp/orders/bulk-print-dialog";
import { CourierStatusSyncDialog } from "@/components/erp/orders/courier-status-sync-dialog";
import { PhoneHistorySyncDialog } from "@/components/erp/orders/phone-history-sync-dialog";
import { downloadCsv, exportOrdersCsv, statusAge, statusSinceTs, tabForStatuses, type OrderRow, type OrderStatus } from "@/lib/erp/orders";
import { AlertTriangle, RefreshCcw } from "lucide-react";

const WEB_ORDER_SOURCE_FILTER = "source.not.in.(website,pixel,utm)";

export const Route = createFileRoute("/_authenticated/erp/orders/list")({
  head: () => ({ meta: [{ title: "Orders — ERP" }] }),
  component: OrdersPage,
});

function OrdersPage() {
  const qc = useQueryClient();
  const { activeBrand, brandIds, isAllBrands } = useBrand();
  const [filter, setFilter] = useState<OrdersFilter>({
    brandId: null, brandIds: [], search: "", statuses: ["confirmed"], source: null,
    dateFrom: null, dateTo: null, courier: null, page: 0, pageSize: 50,
  });
  const [view, setView] = useState<"orders" | "incomplete">("orders");
  const [incompletePage, setIncompletePage] = useState(0);
  const [exporting, setExporting] = useState(false);

  const effective = useMemo<OrdersFilter>(
    () => ({
      ...filter,
      brandId: activeBrand?.id ?? null,
      brandIds: isAllBrands ? brandIds : activeBrand ? [activeBrand.id] : [],
    }),
    [filter, activeBrand?.id, isAllBrands, brandIds, activeBrand],
  );

  const { data, isLoading, isFetching } = useOrdersQuery(effective);
  const { data: countsData } = useOrderStatusCounts(effective);
  const { data: incompleteCount } = useAbandonedCartCount(effective.brandId, effective.brandIds);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [pathaoBulkOpen, setPathaoBulkOpen] = useState(false);
  const [preorderOpen, setPreorderOpen] = useState(false);
  const [printMode, setPrintMode] = useState<PrintMode | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [singleSyncId, setSingleSyncId] = useState<string | null>(null);
  const [phoneHistOpen, setPhoneHistOpen] = useState(false);
  const [courierStatusFilter, setCourierStatusFilter] = useState<CourierBucket | "all">("all");
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());

  // Bulk fetch live courier shipments for the current page
  const pageOrderIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const { data: shipmentsMap = {} } = useCourierShipments(pageOrderIds);

  // Apply client-side courier status filter
  const visibleRows = useMemo(() => {
    if (courierStatusFilter === "all") return rows;
    return rows.filter((r) => {
      const s = shipmentsMap[r.id];
      const bucket = s ? normalizeCourierStatus(s.status) : null;
      return bucket === courierStatusFilter;
    });
  }, [rows, shipmentsMap, courierStatusFilter]);

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

  const courierCounts = useMemo(() => {
    const counts: Partial<Record<CourierBucket, number>> = {};
    for (const r of rows) {
      const s = shipmentsMap[r.id];
      const b = s ? normalizeCourierStatus(s.status) : null;
      if (!b) continue;
      counts[b] = (counts[b] ?? 0) + 1;
    }
    return counts;
  }, [rows, shipmentsMap]);

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
    setFilter((f) => ({ ...f, search: "", source: null, courier: null, dateFrom: null, dateTo: null, statuses: [], page: 0 }));
    setView("orders");
  };
  const hasActiveFilters = !!(filter.search || filter.source || filter.courier || filter.dateFrom || filter.dateTo || filter.statuses.length > 0);

  const totalPages = Math.max(1, Math.ceil(total / filter.pageSize));
  const activeTab =
    view === "incomplete" ? "incomplete"
      : tabForStatuses(effective.statuses);

  return (
    <div className="p-4 md:p-6 space-y-4 min-h-screen bg-gradient-to-b from-muted/30 via-muted/10 to-background">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            {activeBrand?.name ?? "All brands"} · Orders
          </div>
          <div className="flex items-baseline gap-3 mt-1.5">
            <h1 className="text-[28px] font-bold tracking-tight leading-none">Orders</h1>
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-foreground/5 border text-xs">
              <span className="tabular-nums font-bold text-foreground">{total.toLocaleString()}</span>
              <span className="text-muted-foreground">total</span>
              {isFetching && <span className="text-primary font-medium">· syncing</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {lastSyncedAt && (
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              Last synced {relTimeShort(lastSyncedAt)}
            </span>
          )}
          <Select value={courierStatusFilter} onValueChange={(v) => setCourierStatusFilter(v as CourierBucket | "all")}>
            <SelectTrigger className="h-9 w-[170px]">
              <span className="flex items-center gap-1.5 text-xs">
                <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="Courier status" />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All courier statuses</SelectItem>
              {COURIER_BUCKETS.map((b) => (
                <SelectItem key={b} value={b}>
                  {COURIER_BUCKET_META[b].label}
                  {courierCounts[b] ? ` (${courierCounts[b]})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="inline-flex rounded-lg border bg-card shadow-sm overflow-hidden">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-none border-r"
              onClick={handleRefresh}
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="ghost" size="sm" className="h-9 rounded-none gap-1.5" onClick={handleExport} disabled={exporting}>
              <Download className={`h-3.5 w-3.5 ${exporting ? "animate-pulse" : ""}`} /> {exporting ? "Exporting…" : "Export"}
            </Button>
          </div>
          <Link to="/erp/orders/new">
            <Button size="sm" className="h-9 shadow-sm gap-1.5 px-3">
              <Plus className="h-3.5 w-3.5" />New Order
            </Button>
          </Link>
        </div>
      </header>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <OrdersStatusTabs
          active={activeTab}
          counts={countsData?.counts ?? {}}
          total={countsData?.total ?? 0}
          incompleteCount={incompleteCount ?? 0}
          onChange={(statuses, key) => {
            if (key === "incomplete") {
              setView("incomplete");
              setIncompletePage(0);
            } else {
              setView("orders");
              setFilter({ ...filter, statuses, page: 0 });
            }
          }}
        />
        {view === "incomplete" ? (
          <>
            <OrdersToolbar filter={effective} onChange={setFilter} />
            <IncompleteOrdersTable
              brandId={effective.brandId}
              brandIds={effective.brandIds}
              search={effective.search}
              page={incompletePage}
              pageSize={50}
              onPageChange={setIncompletePage}
              onOpenOrder={setOpenId}
            />
          </>
        ) : (
          <>
          {stuckIds.length > 0 && !nudgeDismissed && (
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-amber-500/10 text-[12px]">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <span className="font-medium text-foreground/90">
                <span className="tabular-nums font-bold">{stuckIds.length}</span> order{stuckIds.length > 1 ? "s" : ""} stuck 3+ days in current status
              </span>
              <span className="text-muted-foreground hidden sm:inline">— bulk sync courier status?</span>
              <div className="flex-1" />
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-[11px]"
                onClick={() => setSelectedIds(new Set(stuckIds))}
              >
                Select {stuckIds.length}
              </Button>
              <Button
                size="sm"
                className="h-7 gap-1.5 text-[11px]"
                onClick={() => { setSelectedIds(new Set(stuckIds)); setSyncOpen(true); }}
              >
                <RefreshCcw className="h-3 w-3" /> Sync all
              </Button>
              <button
                type="button"
                onClick={() => setNudgeDismissed(true)}
                className="ml-1 h-6 w-6 grid place-items-center rounded hover:bg-muted text-muted-foreground"
                title="Dismiss"
              >
                ×
              </button>
            </div>
          )}
          <OrdersToolbar
          filter={effective}
          onChange={setFilter}
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
        <OrdersTable
          rows={visibleRows}
          loading={isLoading}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          onRowClick={setOpenId}
          onStatusChange={(id, status) => statusMutation.mutate({ id, status })}
          pendingStatusIds={pendingIds}
          shipmentsByOrderId={shipmentsMap}
          flashOrderIds={flashIds}
          onSyncRow={(id) => { setSingleSyncId(id); }}
        />
        {!isLoading && visibleRows.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
              <Inbox className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <div className="font-semibold">No orders found</div>
              <div className="text-sm text-muted-foreground">
                {courierFilterActive
                  ? `No orders with courier status "${COURIER_BUCKET_META[courierStatusFilter as CourierBucket].label}" on this page.`
                  : "Try adjusting your filters or date range."}
              </div>
            </div>
            {(hasActiveFilters || courierFilterActive) && (
              <Button variant="outline" size="sm" onClick={() => { clearAllFilters(); setCourierStatusFilter("all"); }}>Clear filters</Button>
            )}
          </div>
        )}
          </>
        )}
      </div>

      {view === "orders" && (
      <div className="flex items-center justify-between text-sm rounded-xl border bg-card px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span>
            Page <span className="font-semibold text-foreground tabular-nums">{filter.page + 1}</span> of <span className="font-semibold text-foreground tabular-nums">{totalPages}</span>
          </span>
          <Select
            value={String(filter.pageSize)}
            onValueChange={(v) => setFilter((f) => ({ ...f, pageSize: Number(v), page: 0 }))}
          >
            <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25 / page</SelectItem>
              <SelectItem value="50">50 / page</SelectItem>
              <SelectItem value="100">100 / page</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={filter.page === 0} onClick={() => setFilter({ ...filter, page: filter.page - 1 })}>Prev</Button>
          <Button variant="outline" size="sm" disabled={filter.page + 1 >= totalPages} onClick={() => setFilter({ ...filter, page: filter.page + 1 })}>Next</Button>
        </div>
      </div>
      )}

      <OrderDrawer orderId={openId} onClose={() => setOpenId(null)} />

      <PreorderConvertDialog
        open={preorderOpen}
        onOpenChange={setPreorderOpen}
        orderIds={Array.from(selectedIds)}
        brandId={activeBrand?.id ?? null}
        onDone={() => setSelectedIds(new Set())}
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
