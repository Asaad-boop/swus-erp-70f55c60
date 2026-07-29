import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import type { OrderRow, OrderStatus } from "@/lib/erp/orders";
import { statusSinceTs } from "@/lib/erp/orders";
import { fetchCourierHistoryFn } from "@/lib/erp/courier-history.functions";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";

const WEB_ORDER_SOURCE_FILTER = "source.not.in.(website,pixel,utm)";

export type OrdersFilter = {
  brandId: string | null;
  brandIds?: string[];
  search: string;
  statuses: OrderStatus[];
  source: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  courier: string | null;
  page: number;
  pageSize: number;
  /** Restrict to specific order ids (used by Needs Attention tab). */
  ids?: string[] | null;
  /** Print status filter: "all" (default), "printed", or "unprinted". */
  printedFilter?: "all" | "printed" | "unprinted";
};

export function useOrdersQuery(filter: OrdersFilter) {
  const brandIds = filter.brandIds && filter.brandIds.length > 0
    ? filter.brandIds
    : filter.brandId
      ? [filter.brandId]
      : [];
  return useQuery({
    queryKey: ["orders", filter],
    enabled: brandIds.length > 0 && (filter.ids == null || filter.ids.length > 0),
    queryFn: async () => {
      let q = applyBrandScope(
        supabase
          .from("orders")
          .select(
            "id,invoice_no,created_at,updated_at,status,confirmation_status,total,subtotal,shipping_fee,discount_amount,advance_amount,payment_method,shipping_name,shipping_phone,shipping_address,shipping_city,shipping_district,shipping_thana,guest_name,guest_phone,is_guest_order,user_id,brand_id,source,courier_name,tracking_number,actual_shipping_cost,assigned_to,admin_notes,customer_note,shipping_note,call_status,call_attempt_count,delivered_at,shipped_at,confirmed_at,paid_at,cancelled_at,reconciliation_status,net_collected,printed_at,items:order_items(id,name,image,quantity,variant_label,line_total)",
            { count: "exact" },
          ),
        brandIds,
      ).order("created_at", { ascending: false });

      if (filter.ids && filter.ids.length > 0) {
        q = q.in("id", filter.ids);
      } else if (filter.statuses.length > 0) {
        q = q.in("status", filter.statuses);
        if (filter.statuses.includes("confirmed")) {
          q = q.or(`status.neq.confirmed,source.is.null,${WEB_ORDER_SOURCE_FILTER},web_status.eq.complete`);
        }
      } else {
        // `new` orders live exclusively in the Web Orders queue — never surface them here.
        q = q.neq("status", "new");
        // `pre_order` lives in the dedicated Pre-orders pipeline page.
        q = q.neq("status", "pre_order");
        q = q.or(`status.neq.confirmed,source.is.null,${WEB_ORDER_SOURCE_FILTER},web_status.eq.complete`);
      }
      if (filter.printedFilter === "printed") q = q.not("printed_at", "is", null);
      else if (filter.printedFilter === "unprinted") q = q.is("printed_at", null);
      if (filter.source) q = q.eq("source", filter.source as never);
      if (filter.courier) q = q.eq("courier_name", filter.courier);
      if (filter.dateFrom) q = q.gte("created_at", filter.dateFrom);
      if (filter.dateTo) q = q.lte("created_at", filter.dateTo);
      if (filter.search.trim()) {
        const s = filter.search.trim();
        q = q.or(
          `shipping_name.ilike.%${s}%,shipping_phone.ilike.%${s}%,guest_name.ilike.%${s}%,guest_phone.ilike.%${s}%,tracking_number.ilike.%${s}%`,
        );
      }

      const from = filter.page * filter.pageSize;
      const to = from + filter.pageSize - 1;
      q = q.range(from, to);

      const { data, error, count } = await q;
      if (error) throw error;
      const rows = (data ?? []) as OrderRow[];

      // Attach `status_since` from order_status_history in ONE query for the whole page.
      // Prefer the latest history row whose to_status matches the current order.status
      // (guards against direct .update() writes that skipped the transition RPC).
      if (rows.length > 0) {
        const ids = rows.map((r) => r.id);
        const { data: hist } = await supabase
          .from("order_status_history")
          .select("order_id,to_status,created_at")
          .in("order_id", ids)
          .order("created_at", { ascending: false });
        if (hist && hist.length > 0) {
          const latestMatch = new Map<string, string>();
          const statusById = new Map(rows.map((r) => [r.id, r.status]));
          for (const h of hist as { order_id: string; to_status: string; created_at: string }[]) {
            if (latestMatch.has(h.order_id)) continue;
            if (h.to_status === statusById.get(h.order_id)) {
              latestMatch.set(h.order_id, h.created_at);
            }
          }
          for (const r of rows) {
            const ts = latestMatch.get(r.id);
            if (ts) (r as OrderRow & { status_since?: string }).status_since = ts;
          }
        }
      }

      return { rows, total: count ?? 0 };
    },
  });
}

export function useOrderDetail(orderId: string | null) {
  return useQuery({
    queryKey: ["order-detail", orderId],
    enabled: !!orderId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () => {
      const [orderRes, itemsRes, historyRes, notesRes] = await Promise.all([
        supabase.from("orders").select("*").eq("id", orderId!).single(),
        supabase.from("order_items").select("*").eq("order_id", orderId!),
        supabase.from("order_status_history").select("*").eq("order_id", orderId!).order("created_at", { ascending: false }),
        supabase.from("order_notes").select("*").eq("order_id", orderId!).order("created_at", { ascending: false }),
      ]);
      if (orderRes.error) throw orderRes.error;
      return {
        order: orderRes.data,
        items: itemsRes.data ?? [],
        history: historyRes.data ?? [],
        notes: notesRes.data ?? [],
      };
    },
  });
}

export function useStaffList() {
  return useQuery({
    queryKey: ["erp-staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,display_name")
        .order("display_name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// Counts per status for the status-tabs strip. Scoped to brand + global filters
// (search/date/source/courier) but NOT to the active status filter so all tabs stay accurate.
export function useOrderStatusCounts(filter: OrdersFilter) {
  const brandIds = filter.brandIds && filter.brandIds.length > 0
    ? filter.brandIds
    : filter.brandId
      ? [filter.brandId]
      : [];
  return useQuery({
    queryKey: ["orders-status-counts", brandIds, filter.search, filter.source, filter.courier, filter.dateFrom, filter.dateTo, filter.printedFilter],
    enabled: brandIds.length > 0,
    staleTime: 0,
    queryFn: async () => {
      // Single grouped aggregate on the server instead of 17 separate
      // exact-count round trips (each of which scanned the whole table).
      const { data, error } = await supabase.rpc("erp_order_status_counts", {
        _brand_ids: brandIds,
        _search: filter.search.trim() || undefined,
        _source: filter.source ?? undefined,
        _courier: filter.courier ?? undefined,
        _date_from: filter.dateFrom ?? undefined,
        _date_to: filter.dateTo ?? undefined,
        _printed: filter.printedFilter ?? "all",
      });
      if (error) throw error;

      const counts: Record<string, number> = {};
      let total = 0;
      for (const row of (data ?? []) as { status: string; cnt: number }[]) {
        const c = Number(row.cnt) || 0;
        if (c > 0) counts[row.status] = c;
        total += c;
      }
      return { counts, total };
    },
  });
}

export type CustomerHistoryOrder = {
  id: string;
  invoice_no: string | null;
  created_at: string;
  status: OrderStatus;
  total: number;
};

export function useCustomerHistory(phone: string | null, brandId: string | null, enabled: boolean) {
  const norm = (phone ?? "").replace(/[^0-9]/g, "").slice(-11);
  return useQuery({
    queryKey: ["customer-history", brandId, norm],
    enabled: enabled && !!brandId && norm.length >= 6,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,invoice_no,created_at,status,total,shipping_phone,guest_phone")
        .eq("brand_id", brandId!)
        .or(`shipping_phone.ilike.%${norm}%,guest_phone.ilike.%${norm}%`)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows = (data ?? []) as CustomerHistoryOrder[];
      const summary = rows.reduce(
        (a, r) => {
          a.total += 1;
          a.spent += Number(r.total) || 0;
          if (r.status === "delivered") a.delivered += 1;
          else if (r.status === "cancelled") a.cancelled += 1;
          else if (r.status === "returned") a.returned += 1;
          return a;
        },
        { total: 0, spent: 0, delivered: 0, cancelled: 0, returned: 0 },
      );
      return { rows, summary };
    },
  });
}

export type CourierProviderStat = {
  name: "pathao" | "steadfast";
  label: string;
  total: number;
  success: number;
  cancelled: number;
  ok: boolean;
  error?: string;
};

export type CourierHistoryData = {
  phone: string;
  found: boolean;
  fetched_at: string;
  providers: CourierProviderStat[];
  summary: { total: number; success: number; cancelled: number };
};

export function useCourierHistory(phone: string | null, brandId: string | null, enabled: boolean, force = false) {
  const fn = useServerFn(fetchCourierHistoryFn);
  const norm = (phone ?? "").replace(/\D/g, "");
  return useQuery({
    queryKey: ["courier-history", brandId, norm, force],
    enabled: enabled && !!phone && norm.length >= 10,
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const res = await fn({ data: { phones: [phone!], brandId: brandId ?? undefined, force } });
      const r = res.results as Record<string, CourierHistoryData>;
      return r[phone!] ?? r[norm] ?? null;
    },
  });
}