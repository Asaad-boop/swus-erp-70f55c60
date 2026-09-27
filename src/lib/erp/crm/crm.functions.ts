import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeSegment } from "./segments";
import type { CrmCustomerRow, CrmListResponse, CrmSegment } from "./types";

const ALL_SEGMENTS: CrmSegment[] = ["new", "one_time", "repeat", "vip", "at_risk", "lost", "blocked"];

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw error;
  if (!data) throw new Error("Admin only");
}

function normalizePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  if (!digits.length) return null;
  return digits.slice(-11);
}

const filtersSchema = z
  .object({
    search: z.string().optional(),
    brandIds: z.array(z.string()).optional(),
    type: z.enum(["all", "registered", "guest"]).optional(),
    segment: z.string().optional(),
    tag: z.string().optional(),
    minSpend: z.number().optional(),
    maxSpend: z.number().optional(),
    minOrders: z.number().optional(),
    maxOrders: z.number().optional(),
    lastOrderFrom: z.string().optional(),
    lastOrderTo: z.string().optional(),
    hasEmail: z.boolean().optional(),
  })
  .default({});

async function loadAll(
  supabaseClient: any,
  brandIds: string[] | undefined,
): Promise<any[]> {
  // Read from the materialized view (fast snapshot). Fall back to live view
  // if the MV doesn't exist yet. Pages are fetched in parallel after one count
  // query, and only the columns the list needs are selected.
  const PAGE = 1000;
  const COLS =
    "customer_key,name,email,user_id,is_registered,orders_count,valid_orders_count,lifetime_value,avg_order_value,first_order_at,last_order_at,brand_ids,meta_status";
  const build = (source: string, head = false) => {
    let q = supabaseClient.from(source).select(head ? "customer_key" : COLS, head ? { count: "exact", head: true } : undefined);
    if (brandIds && brandIds.length) q = q.overlaps("brand_ids", brandIds);
    return q;
  };
  let source = "crm_customers_mv";
  let { count, error } = await build(source, true);
  if (error || !count) {
    source = "crm_customers_v";
    ({ count, error } = await build(source, true));
    if (error) throw error;
  }
  const total = count ?? 0;
  const pages = Math.ceil(total / PAGE);
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      build(source).order("customer_key", { ascending: true }).range(i * PAGE, i * PAGE + PAGE - 1),
    ),
  );
  const all: any[] = [];
  for (const r of results as { data: any[] | null; error: any }[]) {
    if (r.error) throw r.error;
    all.push(...(r.data ?? []));
  }
  return all;
}

async function loadTags(supabaseClient: any): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const { data, error } = await supabaseClient
    .from("crm_customer_tags")
    .select("customer_key, tag");
  if (error) throw error;
  (data ?? []).forEach((r: any) => {
    const arr = map.get(r.customer_key) ?? [];
    arr.push(r.tag);
    map.set(r.customer_key, arr);
  });
  return map;
}

function applyFilters(
  rows: CrmCustomerRow[],
  f: z.infer<typeof filtersSchema>,
): CrmCustomerRow[] {
  let out = rows;
  if (f.search) {
    const s = f.search.toLowerCase().trim();
    out = out.filter(
      (r) =>
        (r.name ?? "").toLowerCase().includes(s) ||
        (r.email ?? "").toLowerCase().includes(s) ||
        r.customer_key.includes(s),
    );
  }
  if (f.type === "registered") out = out.filter((r) => r.is_registered);
  if (f.type === "guest") out = out.filter((r) => !r.is_registered);
  if (f.segment && f.segment !== "all") out = out.filter((r) => r.segment === f.segment);
  if (f.tag) out = out.filter((r) => r.tags.includes(f.tag!));
  if (typeof f.minSpend === "number") out = out.filter((r) => r.lifetime_value >= f.minSpend!);
  if (typeof f.maxSpend === "number") out = out.filter((r) => r.lifetime_value <= f.maxSpend!);
  if (typeof f.minOrders === "number") out = out.filter((r) => r.orders_count >= f.minOrders!);
  if (typeof f.maxOrders === "number") out = out.filter((r) => r.orders_count <= f.maxOrders!);
  if (f.lastOrderFrom) {
    const t = new Date(f.lastOrderFrom).getTime();
    out = out.filter((r) => r.last_order_at && new Date(r.last_order_at).getTime() >= t);
  }
  if (f.lastOrderTo) {
    const t = new Date(f.lastOrderTo).getTime() + 86400000;
    out = out.filter((r) => r.last_order_at && new Date(r.last_order_at).getTime() <= t);
  }
  if (typeof f.hasEmail === "boolean") {
    out = out.filter((r) => f.hasEmail ? !!(r.email && r.email.trim()) : !(r.email && r.email.trim()));
  }
  return out;
}

function sortRows(rows: CrmCustomerRow[], sort: string): CrmCustomerRow[] {
  const copy = [...rows];
  const ts = (s: string | null) => (s ? new Date(s).getTime() : 0);
  switch (sort) {
    case "ltv_asc": copy.sort((a, b) => a.lifetime_value - b.lifetime_value); break;
    case "orders_desc": copy.sort((a, b) => b.orders_count - a.orders_count); break;
    case "orders_asc": copy.sort((a, b) => a.orders_count - b.orders_count); break;
    case "last_order_asc": copy.sort((a, b) => ts(a.last_order_at) - ts(b.last_order_at)); break;
    case "first_order_desc": copy.sort((a, b) => ts(b.first_order_at) - ts(a.first_order_at)); break;
    case "last_order_desc": copy.sort((a, b) => ts(b.last_order_at) - ts(a.last_order_at)); break;
    case "ltv_desc":
    default: copy.sort((a, b) => b.lifetime_value - a.lifetime_value); break;
  }
  return copy;
}

function enrich(rows: any[], tagMap: Map<string, string[]>): CrmCustomerRow[] {
  const sortedByLtv = [...rows].sort((a, b) => (b.lifetime_value ?? 0) - (a.lifetime_value ?? 0));
  const top10Idx = Math.max(0, Math.floor(sortedByLtv.length * 0.1) - 1);
  const vipThresholdLtv = sortedByLtv[top10Idx]?.lifetime_value ?? Infinity;

  return rows.map((r) => {
    const segment = computeSegment({
      validOrdersCount: Number(r.valid_orders_count ?? 0),
      lifetimeValue: Number(r.lifetime_value ?? 0),
      firstOrderAt: r.first_order_at,
      lastOrderAt: r.last_order_at,
      metaStatus: r.meta_status,
      vipThresholdLtv,
    });
    return {
      customer_key: r.customer_key,
      name: r.name,
      email: r.email,
      user_id: r.user_id,
      is_registered: !!r.is_registered,
      orders_count: Number(r.orders_count ?? 0),
      valid_orders_count: Number(r.valid_orders_count ?? 0),
      lifetime_value: Number(r.lifetime_value ?? 0),
      avg_order_value: Number(r.avg_order_value ?? 0),
      first_order_at: r.first_order_at,
      last_order_at: r.last_order_at,
      brand_ids: r.brand_ids ?? [],
      meta_status: r.meta_status,
      segment,
      tags: tagMap.get(r.customer_key) ?? [],
    } satisfies CrmCustomerRow;
  });
}

function computeKpis(rows: CrmCustomerRow[]): CrmListResponse["kpis"] {
  const now = Date.now();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const ms = monthStart.getTime();
  const day30 = now - 30 * 86400000;

  let totalLtv = 0;
  let totalAovSum = 0;
  let aovCount = 0;
  let newThisMonth = 0;
  let active30 = 0;
  const segmentCounts = ALL_SEGMENTS.reduce(
    (acc, s) => ({ ...acc, [s]: 0 }),
    {} as Record<CrmSegment, number>,
  );
  // 30-day trend: bucket by yyyy-mm-dd of first_order_at
  const trendBuckets = new Map<string, number>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    trendBuckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of rows) {
    totalLtv += r.lifetime_value;
    if (r.avg_order_value > 0) { totalAovSum += r.avg_order_value; aovCount++; }
    if (r.first_order_at && new Date(r.first_order_at).getTime() >= ms) newThisMonth++;
    if (r.last_order_at && new Date(r.last_order_at).getTime() >= day30) active30++;
    segmentCounts[r.segment] = (segmentCounts[r.segment] ?? 0) + 1;
    if (r.first_order_at) {
      const key = r.first_order_at.slice(0, 10);
      if (trendBuckets.has(key)) trendBuckets.set(key, (trendBuckets.get(key) ?? 0) + 1);
    }
  }
  return {
    totalCustomers: rows.length,
    newThisMonth,
    activeLast30: active30,
    totalLtv,
    avgLtv: rows.length ? totalLtv / rows.length : 0,
    avgAov: aovCount ? totalAovSum / aovCount : 0,
    segmentCounts,
    newTrend: Array.from(trendBuckets.entries()).map(([date, count]) => ({ date, count })),
  };
}

/* =================== LIST =================== */
export const listCrmCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { filters?: any; sort?: string; page?: number; pageSize?: number }) => ({
    filters: filtersSchema.parse(d?.filters ?? {}),
    sort: d?.sort ?? "ltv_desc",
    page: d?.page ?? 1,
    pageSize: Math.min(d?.pageSize ?? 50, 200),
  }))
  .handler(async ({ data, context }): Promise<CrmListResponse> => {
    await assertAdmin(context.supabase, context.userId);
    const [raw, tagMap] = await Promise.all([
      loadAll(context.supabase, data.filters.brandIds),
      loadTags(context.supabase),
    ]);
    const enriched = enrich(raw, tagMap);
    const kpis = computeKpis(enriched);
    const filtered = applyFilters(enriched, data.filters);
    const sorted = sortRows(filtered, data.sort);
    const start = (data.page - 1) * data.pageSize;
    return { rows: sorted.slice(start, start + data.pageSize), total: sorted.length, kpis };
  });

/* =================== GET ONE =================== */
export const getCrmCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerKey: string }) => z.object({ customerKey: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const key = normalizePhone(data.customerKey) ?? data.customerKey;

    const [initialViewRes, tagsRes, notesRes, metaRes] = await Promise.all([
      context.supabase.from("crm_customers_mv").select("*").eq("customer_key", key).maybeSingle(),
      context.supabase.from("crm_customer_tags").select("id, tag, created_at").eq("customer_key", key).order("created_at", { ascending: false }),
      context.supabase.from("crm_customer_notes").select("id, note, created_at, updated_at, created_by").eq("customer_key", key).order("created_at", { ascending: false }),
      context.supabase.from("crm_customer_meta").select("*").eq("customer_key", key).maybeSingle(),
    ]);
    const viewRes = initialViewRes.error || !initialViewRes.data
      ? await context.supabase.from("crm_customers_v").select("*").eq("customer_key", key).maybeSingle()
      : initialViewRes;
    if (viewRes.error) throw viewRes.error;
    if (!viewRes.data) throw new Error("Customer not found");

    const v = viewRes.data;
    const tags = (tagsRes.data ?? []).map((t: any) => t.tag);
    const segment = computeSegment({
      validOrdersCount: Number(v.valid_orders_count ?? 0),
      lifetimeValue: Number(v.lifetime_value ?? 0),
      firstOrderAt: v.first_order_at,
      lastOrderAt: v.last_order_at,
      metaStatus: v.meta_status,
    });

    // Orders for this customer (by phone in shipping or guest)
    const { data: orders, error: ordersErr } = await context.supabase
      .from("orders")
      .select("id, total, status, created_at, brand_id, payment_method, shipping_city, shipping_phone, guest_phone, shipping_name, guest_name")
      .or(`shipping_phone.like.%${key},guest_phone.like.%${key}`)
      .order("created_at", { ascending: false })
      .limit(500);
    if (ordersErr) throw ordersErr;

    // Addresses for registered user
    let addresses: any[] = [];
    if (v.user_id) {
      const { data: addr } = await context.supabase
        .from("addresses")
        .select("id, label, full_name, phone, address_line, city, district, postal_code, is_default")
        .eq("user_id", v.user_id)
        .order("is_default", { ascending: false });
      addresses = addr ?? [];
    }

    // Brand-wise spend breakdown
    const brandMap = new Map<string, { brand_id: string; orders: number; total: number }>();
    (orders ?? []).forEach((o: any) => {
      if (!o.brand_id) return;
      const cur = brandMap.get(o.brand_id) ?? { brand_id: o.brand_id, orders: 0, total: 0 };
      cur.orders++;
      if (!["cancelled", "returned", "refunded", "failed"].includes(o.status)) {
        cur.total += Number(o.total ?? 0);
      }
      brandMap.set(o.brand_id, cur);
    });

    return {
      summary: {
        customer_key: v.customer_key,
        name: v.name,
        email: v.email,
        user_id: v.user_id,
        is_registered: !!v.is_registered,
        orders_count: Number(v.orders_count ?? 0),
        valid_orders_count: Number(v.valid_orders_count ?? 0),
        lifetime_value: Number(v.lifetime_value ?? 0),
        avg_order_value: Number(v.avg_order_value ?? 0),
        first_order_at: v.first_order_at,
        last_order_at: v.last_order_at,
        brand_ids: v.brand_ids ?? [],
        meta_status: v.meta_status,
        segment,
        tags,
      } as CrmCustomerRow,
      orders: orders ?? [],
      addresses,
      notes: notesRes.data ?? [],
      meta: metaRes.data,
      brandBreakdown: Array.from(brandMap.values()),
    };
  });

/* =================== ORDERS PREVIEW (for CRM list inline expand) =================== */
export const getCrmCustomerOrdersPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerKey: string; limit?: number }) =>
    z.object({ customerKey: z.string().min(1), limit: z.number().int().min(1).max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const key = normalizePhone(data.customerKey) ?? data.customerKey;
    const limit = data.limit ?? 500;
    const { data: orders, error } = await context.supabase
      .from("orders")
      .select("id, invoice_no, total, status, payment_method, created_at, brand_id, shipping_city")
      .or(`shipping_phone.like.%${key},guest_phone.like.%${key}`)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    const ids = (orders ?? []).map((o: any) => o.id);
    let itemsByOrder = new Map<string, { name: string; quantity: number; variant_label: string | null; image: string | null }[]>();
    if (ids.length) {
      const { data: items, error: itErr } = await context.supabase
        .from("order_items")
        .select("order_id, name, quantity, variant_label, image")
        .in("order_id", ids);
      if (itErr) throw itErr;
      (items ?? []).forEach((it: any) => {
        const arr = itemsByOrder.get(it.order_id) ?? [];
        arr.push({ name: it.name, quantity: it.quantity, variant_label: it.variant_label, image: it.image });
        itemsByOrder.set(it.order_id, arr);
      });
    }
    return {
      orders: (orders ?? []).map((o: any) => ({
        id: o.id,
        invoice_no: o.invoice_no ?? null,
        total: Number(o.total ?? 0),
        status: o.status,
        payment_method: o.payment_method,
        created_at: o.created_at,
        brand_id: o.brand_id,
        shipping_city: o.shipping_city,
        items: itemsByOrder.get(o.id) ?? [],
      })),
    };
  });

/* =================== EXPORT CSV =================== */
export const exportCrmCustomersCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { filters?: any; sort?: string }) => ({
    filters: filtersSchema.parse(d?.filters ?? {}),
    sort: d?.sort ?? "ltv_desc",
  }))
  .handler(async ({ data, context }): Promise<{ csv: string; count: number }> => {
    await assertAdmin(context.supabase, context.userId);
    const [raw, tagMap] = await Promise.all([
      loadAll(context.supabase, data.filters.brandIds),
      loadTags(context.supabase),
    ]);
    const enriched = enrich(raw, tagMap);
    const filtered = applyFilters(enriched, data.filters);
    const sorted = sortRows(filtered, data.sort);

    const headers = [
      "Phone","Name","Email","Type","Segment","Status","Orders","Valid Orders","Lifetime Value","Avg Order Value","First Order","Last Order","Tags",
    ];
    const escape = (v: any) => {
      const s = v == null ? "" : String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [headers.join(",")];
    for (const r of sorted) {
      lines.push([
        r.customer_key,
        r.name ?? "",
        r.email ?? "",
        r.is_registered ? "Registered" : "Guest",
        r.segment,
        r.meta_status ?? "",
        r.orders_count,
        r.valid_orders_count,
        r.lifetime_value.toFixed(2),
        r.avg_order_value.toFixed(2),
        r.first_order_at ?? "",
        r.last_order_at ?? "",
        r.tags.join("; "),
      ].map(escape).join(","));
    }
    return { csv: lines.join("\n"), count: sorted.length };
  });

/* =================== NOTES =================== */
export const addCrmNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerKey: string; note: string }) =>
    z.object({ customerKey: z.string().min(1), note: z.string().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const key = normalizePhone(data.customerKey) ?? data.customerKey;
    const { error } = await context.supabase.from("crm_customer_notes")
      .insert({ customer_key: key, note: data.note, created_by: context.userId });
    if (error) throw error;
    return { ok: true };
  });

export const deleteCrmNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("crm_customer_notes").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* =================== TAGS =================== */
export const addCrmTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerKey: string; tag: string }) =>
    z.object({ customerKey: z.string().min(1), tag: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const key = normalizePhone(data.customerKey) ?? data.customerKey;
    const tag = data.tag.trim().toLowerCase();
    const { error } = await context.supabase.from("crm_customer_tags")
      .upsert({ customer_key: key, tag, created_by: context.userId }, { onConflict: "customer_key,tag" });
    if (error) throw error;
    return { ok: true };
  });

export const removeCrmTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerKey: string; tag: string }) =>
    z.object({ customerKey: z.string().min(1), tag: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const key = normalizePhone(data.customerKey) ?? data.customerKey;
    const { error } = await context.supabase.from("crm_customer_tags")
      .delete().eq("customer_key", key).eq("tag", data.tag.toLowerCase());
    if (error) throw error;
    return { ok: true };
  });

export const bulkAddCrmTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerKeys: string[]; tag: string }) =>
    z.object({ customerKeys: z.array(z.string().min(1)).min(1).max(2000), tag: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const tag = data.tag.trim().toLowerCase();
    const rows = data.customerKeys.map((k) => ({
      customer_key: normalizePhone(k) ?? k,
      tag,
      created_by: context.userId,
    }));
    const { error } = await context.supabase.from("crm_customer_tags")
      .upsert(rows, { onConflict: "customer_key,tag" });
    if (error) throw error;
    return { ok: true, count: rows.length };
  });

export const bulkRemoveCrmTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerKeys: string[]; tag: string }) =>
    z.object({ customerKeys: z.array(z.string().min(1)).min(1).max(2000), tag: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const tag = data.tag.trim().toLowerCase();
    const keys = data.customerKeys.map((k) => normalizePhone(k) ?? k);
    const { error } = await context.supabase.from("crm_customer_tags")
      .delete().in("customer_key", keys).eq("tag", tag);
    if (error) throw error;
    return { ok: true, count: keys.length };
  });

export const bulkSetCrmStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerKeys: string[]; status: "active" | "at_risk" | "lost" | "blocked" | "vip" }) =>
    z.object({
      customerKeys: z.array(z.string().min(1)).min(1).max(2000),
      status: z.enum(["active", "at_risk", "lost", "blocked", "vip"]),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const rows = data.customerKeys.map((k) => ({
      customer_key: normalizePhone(k) ?? k,
      status: data.status,
      updated_by: context.userId,
    }));
    const { error } = await context.supabase.from("crm_customer_meta")
      .upsert(rows, { onConflict: "customer_key" });
    if (error) throw error;
    return { ok: true, count: rows.length };
  });

/**
 * Removes a customer from the CRM list. Only removes CRM-side data
 * (imported entry, tags, notes, meta). Actual order/profile rows are
 * untouched — customers with orders will reappear because the view
 * derives from orders.
 */
export const bulkDeleteCrmCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerKeys: string[] }) =>
    z.object({ customerKeys: z.array(z.string().min(1)).min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const keys = data.customerKeys.map((k) => normalizePhone(k) ?? k);
    const [a, b, c, d2] = await Promise.all([
      context.supabase.from("crm_imported_customers").delete().in("customer_key", keys),
      context.supabase.from("crm_customer_tags").delete().in("customer_key", keys),
      context.supabase.from("crm_customer_notes").delete().in("customer_key", keys),
      context.supabase.from("crm_customer_meta").delete().in("customer_key", keys),
    ]);
    const err = a.error || b.error || c.error || d2.error;
    if (err) throw err;
    return { ok: true, count: keys.length };
  });

/* =================== STATUS =================== */
export const setCrmStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerKey: string; status: "active" | "at_risk" | "lost" | "blocked" | "vip" }) =>
    z.object({
      customerKey: z.string().min(1),
      status: z.enum(["active", "at_risk", "lost", "blocked", "vip"]),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const key = normalizePhone(data.customerKey) ?? data.customerKey;
    const { error } = await context.supabase.from("crm_customer_meta")
      .upsert({ customer_key: key, status: data.status, updated_by: context.userId }, { onConflict: "customer_key" });
    if (error) throw error;
    return { ok: true };
  });

/* =================== TAG LIST (for filter) =================== */
export const listCrmTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("crm_customer_tags").select("tag");
    if (error) throw error;
    const set = new Set<string>();
    (data ?? []).forEach((r: any) => set.add(r.tag));
    return Array.from(set).sort();
  });

/* =================== IMPORT =================== */
export const importCrmCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rows: Array<{ phone: string; name?: string; email?: string }>; source?: string }) =>
    z.object({
      rows: z.array(z.object({
        phone: z.string().min(1),
        name: z.string().optional(),
        email: z.string().optional(),
      })).min(1).max(10000),
      source: z.string().max(40).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const source = data.source?.trim() || "csv";
    const seen = new Set<string>();
    const cleaned: Array<{ customer_key: string; name: string | null; email: string | null; source: string; imported_by: string }> = [];
    let skipped = 0;
    for (const r of data.rows) {
      const key = normalizePhone(r.phone);
      if (!key || seen.has(key)) { skipped++; continue; }
      seen.add(key);
      cleaned.push({
        customer_key: key,
        name: (r.name ?? "").trim() || null,
        email: (r.email ?? "").trim() || null,
        source,
        imported_by: context.userId,
      });
    }
    if (!cleaned.length) return { inserted: 0, skipped, tagged: 0 };

    // Upsert imported customers (chunked)
    const CHUNK = 500;
    for (let i = 0; i < cleaned.length; i += CHUNK) {
      const slice = cleaned.slice(i, i + CHUNK);
      const { error } = await context.supabase.from("crm_imported_customers")
        .upsert(slice, { onConflict: "customer_key" });
      if (error) throw error;
    }

    // Tag every imported customer with "imported"
    const tagRows = cleaned.map((c) => ({
      customer_key: c.customer_key,
      tag: "imported",
      created_by: context.userId,
    }));
    for (let i = 0; i < tagRows.length; i += CHUNK) {
      const slice = tagRows.slice(i, i + CHUNK);
      const { error } = await context.supabase.from("crm_customer_tags")
        .upsert(slice, { onConflict: "customer_key,tag" });
      if (error) throw error;
    }

    return { inserted: cleaned.length, skipped, tagged: tagRows.length };
  });