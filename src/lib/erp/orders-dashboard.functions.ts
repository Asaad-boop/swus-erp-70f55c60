import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Shared filter schema — also used by the route's URL search params. */
export const orderDashboardFilterSchema = z.object({
  brandIds: z.array(z.string().uuid()).default([]),
  from: z.string().nullable().default(null),
  to: z.string().nullable().default(null),
  statuses: z.array(z.string()).default([]),
  paymentStatus: z.string().nullable().default(null),
  source: z.string().nullable().default(null),
  courier: z.string().nullable().default(null),
  confirmedBy: z.string().uuid().nullable().default(null),
  search: z.string().default(""),
  tags: z.array(z.string()).default([]),
  minAmount: z.number().nullable().default(null),
  maxAmount: z.number().nullable().default(null),
  city: z.string().nullable().default(null),
});

export type OrderDashboardFilter = z.infer<typeof orderDashboardFilterSchema>;

const listSchema = orderDashboardFilterSchema.extend({
  sort: z.string().default("created_at"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(500).default(50),
});

function rpcArgs(f: OrderDashboardFilter) {
  return {
    p_brand_ids: f.brandIds.length ? f.brandIds : null,
    p_from: f.from,
    p_to: f.to,
    p_statuses: f.statuses.length ? f.statuses : null,
    p_payment_status: f.paymentStatus,
    p_source: f.source,
    p_courier: f.courier,
    p_confirmed_by: f.confirmedBy,
    p_search: f.search?.trim() ? f.search.trim() : null,
    p_tags: f.tags.length ? f.tags : null,
    p_min_amount: f.minAmount,
    p_max_amount: f.maxAmount,
    p_city: f.city?.trim() ? f.city.trim() : null,
  };
}

export type DashboardKpis = {
  total_orders: number;
  total_value: number;
  delivered_orders: number;
  delivered_value: number;
  returned_orders: number;
  returned_value: number;
  cancelled_orders: number;
  in_transit_orders: number;
  advance_collected: number;
  cod_outstanding: number;
  paid_orders: number;
  avg_order_value: number;
  avg_confirm_to_delivery_hours: number;
};

export type OrderDashboardSummary = {
  kpis: DashboardKpis;
  statuses: { status: string; orders: number; value: number }[];
  payments: { payment_status: string; orders: number; value: number }[];
  daily: { d: string; orders: number; value: number; delivered: number }[];
  sources: { source: string; orders: number; value: number }[];
  brands: { brand_id: string | null; name: string | null; orders: number; value: number }[];
  products: { name: string | null; qty: number; value: number }[];
  cities: { city: string; orders: number; value: number; delivered: number }[];
  confirmers: { user_id: string; name: string; orders: number; value: number }[];
  couriers: { courier: string; orders: number; delivered: number; returned: number }[];
};

export type DashboardOrderItem = {
  id: string;
  name: string | null;
  image: string | null;
  quantity: number;
  variant_label: string | null;
  line_total: number | null;
};

export type DashboardOrderRow = {
  id: string;
  invoice_no: string | null;
  created_at: string;
  updated_at: string | null;
  status: string;
  payment_status: string | null;
  confirmation_status: string | null;
  web_status: string | null;
  source: string | null;
  brand_id: string | null;
  brand_name: string | null;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  zone: string | null;
  total: number;
  subtotal: number | null;
  discount_amount: number | null;
  shipping_fee: number | null;
  advance_amount: number | null;
  advance_source: string | null;
  advance_txn_id: string | null;
  cod_due: number;
  courier_name: string | null;
  tracking_number: string | null;
  courier_status: string | null;
  actual_shipping_cost: number | null;
  net_collected: number | null;
  reconciliation_status: string | null;
  tags: string[];
  is_preorder: boolean | null;
  printed_at: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  confirmed_by_name: string | null;
  packaged_at: string | null;
  packaged_by_name: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  paid_at: string | null;
  assigned_to_name: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  external_platform: string | null;
  customer_note: string | null;
  admin_notes: string | null;
  note_count: number;
  item_count: number;
  total_qty: number;
  items: DashboardOrderItem[];
};

export type OrderDashboardPage = {
  total: number;
  sum_total: number;
  rows: DashboardOrderRow[];
};

export const getOrderDashboardSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orderDashboardFilterSchema.parse(d))
  .handler(async ({ data, context }): Promise<OrderDashboardSummary> => {
    const { data: res, error } = await context.supabase.rpc(
      "erp_order_dashboard_summary",
      rpcArgs(data),
    );
    if (error) throw new Error(error.message);
    return res as unknown as OrderDashboardSummary;
  });

export const listOrderDashboardRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => listSchema.parse(d))
  .handler(async ({ data, context }): Promise<OrderDashboardPage> => {
    const { data: res, error } = await context.supabase.rpc("erp_order_dashboard_rows", {
      ...rpcArgs(data),
      p_sort: data.sort,
      p_dir: data.dir,
      p_limit: data.pageSize,
      p_offset: data.page * data.pageSize,
    });
    if (error) throw new Error(error.message);
    return res as unknown as OrderDashboardPage;
  });

export type OrderTimelineEntry = {
  id: string;
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
  note: string | null;
  created_at: string;
  changed_by: string | null;
  changed_by_name: string | null;
};

export type OrderDashboardDetail = {
  timeline: OrderTimelineEntry[];
  notes: { id: string; body: string; is_internal: boolean | null; created_at: string; author: string | null }[];
  sms: { id: string; message: string; status: string | null; template_key: string | null; created_at: string }[];
  shipments: {
    id: string;
    provider: string | null;
    consignment_id: string | null;
    status: string | null;
    delivery_fee: number | null;
    created_at: string;
  }[];
};

export const getOrderDashboardDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<OrderDashboardDetail> => {
    const { supabase } = context;
    const [histRes, notesRes, smsRes, shipRes] = await Promise.all([
      supabase
        .from("order_status_history")
        .select("id, from_status, to_status, reason, note, created_at, changed_by")
        .eq("order_id", data.orderId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("order_notes")
        .select("id, body, is_internal, created_at, created_by")
        .eq("order_id", data.orderId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("sms_logs")
        .select("id, message, status, template_key, created_at")
        .eq("order_id", data.orderId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("courier_shipments")
        .select("id, provider, consignment_id, status, delivery_fee, created_at")
        .eq("order_id", data.orderId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const hist = histRes.data ?? [];
    const notes = notesRes.data ?? [];
    const userIds = [
      ...new Set(
        [...hist.map((h) => h.changed_by), ...notes.map((n) => n.created_by)].filter(
          (v): v is string => !!v,
        ),
      ),
    ];
    const nameById = new Map<string, string>();
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);
      for (const p of profs ?? []) nameById.set(p.id, p.display_name ?? "");
    }

    return {
      timeline: hist.map((h) => ({
        id: h.id,
        from_status: h.from_status,
        to_status: h.to_status,
        reason: h.reason,
        note: h.note,
        created_at: h.created_at,
        changed_by: h.changed_by,
        changed_by_name: h.changed_by ? nameById.get(h.changed_by) || null : null,
      })),
      notes: notes.map((n) => ({
        id: n.id,
        body: n.body,
        is_internal: n.is_internal,
        created_at: n.created_at,
        author: n.created_by ? nameById.get(n.created_by) || null : null,
      })),
      sms: smsRes.data ?? [],
      shipments: shipRes.data ?? [],
    };
  });

/** Full (unpaginated, capped) export of the current filter as CSV rows. */
export const exportOrderDashboardCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orderDashboardFilterSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ csv: string; count: number }> => {
    const pageSize = 500;
    const all: DashboardOrderRow[] = [];
    for (let page = 0; page < 20; page++) {
      const { data: res, error } = await context.supabase.rpc("erp_order_dashboard_rows", {
        ...rpcArgs(data),
        p_sort: "created_at",
        p_dir: "desc",
        p_limit: pageSize,
        p_offset: page * pageSize,
      });
      if (error) throw new Error(error.message);
      const chunk = (res as unknown as OrderDashboardPage).rows ?? [];
      all.push(...chunk);
      if (chunk.length < pageSize) break;
    }

    const headers = [
      "Invoice", "Order ID", "Date", "Status", "Payment", "Brand", "Customer", "Phone",
      "City", "Zone", "Items", "Qty", "Subtotal", "Discount", "Delivery", "Total",
      "Advance", "COD due", "Courier", "Consignment", "Courier status", "Source",
      "UTM campaign", "Confirmed by", "Confirmed at", "Packed by", "Shipped at",
      "Delivered at", "Cancelled at", "Cancel reason", "Reconciliation", "Tags",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const r of all) {
      lines.push(
        [
          r.invoice_no ?? r.id.slice(0, 8), r.id, r.created_at, r.status, r.payment_status,
          r.brand_name, r.customer_name, r.phone, r.city, r.zone,
          r.items.map((i) => `${i.name}${i.variant_label ? ` (${i.variant_label})` : ""} x${i.quantity}`).join(" | "),
          r.total_qty, r.subtotal, r.discount_amount, r.shipping_fee, r.total,
          r.advance_amount, r.cod_due, r.courier_name, r.tracking_number, r.courier_status,
          r.source, r.utm_campaign, r.confirmed_by_name, r.confirmed_at, r.packaged_by_name,
          r.shipped_at, r.delivered_at, r.cancelled_at, r.cancel_reason,
          r.reconciliation_status, (r.tags ?? []).join(" "),
        ].map(esc).join(","),
      );
    }
    return { csv: lines.join("\n"), count: all.length };
  });