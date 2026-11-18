import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";

export type AbandonedCartItem = {
  product_id?: string;
  id?: string;
  variant_id?: string | null;
  variant_label?: string | null;
  name?: string;
  image?: string | null;
  price?: number;
  unit_price?: number;
  qty?: number;
  quantity?: number;
};

export type AbandonedCartRow = {
  id: string;
  brand_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_district: string | null;
  shipping_thana: string | null;
  cart_items: AbandonedCartItem[];
  subtotal: number;
  last_step: string | null;
  is_converted: boolean;
  converted_order_id: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at?: string | null;
  source_site?: string | null;
  followup_status?: string | null;
  followup_count?: number | null;
  last_followup_at?: string | null;
  last_followup_channel?: string | null;
};

// Date filters are business days in Asia/Dhaka. Accept either a plain
// "YYYY-MM-DD" (converted to Dhaka day boundaries) or a full ISO string.
function dhakaDayStart(v?: string | null): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v}T00:00:00.000+06:00`;
  return v;
}
function dhakaDayEnd(v?: string | null): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v}T23:59:59.999+06:00`;
  return v;
}

async function assertStaff(context: { supabase: any; userId: string }) {
  const [admin, cs, ops] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "customer_service" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "operations" }),
  ]);
  const err = admin.error ?? cs.error ?? ops.error;
  if (err) throw new Error(err.message);
  if (!admin.data && !cs.data && !ops.data) {
    throw new Error("Not authorized");
  }
}

export const listAbandonedCartsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      brandId: z.string().uuid().nullable().optional(),
      brandIds: z.array(z.string().uuid()).optional(),
      search: z.string().optional(),
      page: z.number().int().min(0).default(0),
      pageSize: z.number().int().min(1).max(200).default(50),
      dateFrom: z.string().nullable().optional(),
      dateTo: z.string().nullable().optional(),
      subtotalMin: z.number().nullable().optional(),
      subtotalMax: z.number().nullable().optional(),
      lastSteps: z.array(z.string()).optional(),
      followupStatuses: z.array(z.string()).optional(),
      sort: z.enum(["newest","oldest","highest","lowest","priority"]).default("newest"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertStaff(context);

    const from = data.page * data.pageSize;
    const to = from + data.pageSize - 1;

    let q = supabase
      .from("abandoned_carts")
      .select("*", { count: "exact" })
      .eq("is_converted", false)
      .not("customer_phone", "is", null)
      .neq("customer_phone", "")
      .gt("subtotal", 0);

    if (data.brandIds && data.brandIds.length > 0) {
      q = applyBrandScope(q, data.brandIds);
    } else if (data.brandId) {
      q = q.eq("brand_id", data.brandId);
    }

    if (data.search?.trim()) {
      const s = data.search.trim();
      q = q.or(
        `customer_name.ilike.%${s}%,customer_phone.ilike.%${s}%,customer_email.ilike.%${s}%`,
      );
    }

    // Filter on created_at (cart date) — updated_at moves when staff logs a
    // follow-up, which used to make carts jump between date buckets.
    const df = dhakaDayStart(data.dateFrom);
    const dt = dhakaDayEnd(data.dateTo);
    if (df) q = q.gte("created_at", df);
    if (dt) q = q.lte("created_at", dt);
    if (typeof data.subtotalMin === "number") q = q.gte("subtotal", data.subtotalMin);
    if (typeof data.subtotalMax === "number") q = q.lte("subtotal", data.subtotalMax);
    if (data.lastSteps && data.lastSteps.length > 0) q = q.in("last_step", data.lastSteps);
    if (data.followupStatuses && data.followupStatuses.length > 0) {
      q = q.in("followup_status", data.followupStatuses);
    }

    // Sort by created_at (cart date) — the column the table displays.
    // updated_at moves on every cart edit / follow-up, which made the list
    // order contradict the dates shown on screen.
    switch (data.sort) {
      case "oldest": q = q.order("created_at", { ascending: true }); break;
      case "highest": q = q.order("subtotal", { ascending: false }); break;
      case "lowest": q = q.order("subtotal", { ascending: true }); break;
      case "priority": q = q.order("subtotal", { ascending: false }).order("created_at", { ascending: false }); break;
      case "newest":
      default: q = q.order("created_at", { ascending: false });
    }
    q = q.order("id", { ascending: data.sort === "oldest" });

    q = q.range(from, to);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as AbandonedCartRow[], total: count ?? 0 };
  });

export const countAbandonedCartsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      brandId: z.string().uuid().nullable().optional(),
      brandIds: z.array(z.string().uuid()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const [admin, customerService, operations] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "customer_service" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "operations" }),
    ]);
    const roleError = admin.error ?? customerService.error ?? operations.error;
    if (roleError) throw new Error(roleError.message);
    if (!admin.data && !customerService.data && !operations.data) {
      throw new Error("Not authorized to view incomplete checkouts");
    }

    let q = context.supabase
      .from("abandoned_carts")
      .select("id", { count: "exact", head: true })
      .eq("is_converted", false)
      .not("customer_phone", "is", null)
      .neq("customer_phone", "")
      .gt("subtotal", 0);
    if (data.brandIds && data.brandIds.length > 0) {
      q = applyBrandScope(q, data.brandIds);
    } else if (data.brandId) {
      q = q.eq("brand_id", data.brandId);
    }
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

export const deleteAbandonedCartFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [admin, customerService, operations] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "customer_service" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "operations" }),
    ]);
    const roleError = admin.error ?? customerService.error ?? operations.error;
    if (roleError) throw new Error(roleError.message);
    if (!admin.data && !customerService.data && !operations.data) {
      throw new Error("Not authorized to delete incomplete checkouts");
    }

    const { error } = await context.supabase
      .from("abandoned_carts")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const reviewItemSchema = z.object({
  product_id: z.string().min(1),
  variant_id: z.string().nullable().optional(),
  variant_label: z.string().nullable().optional(),
  name: z.string().min(1),
  image: z.string().nullable().optional(),
  unit_price: z.number().min(0),
  quantity: z.number().int().min(1).max(999),
});

const reviewCustomerSchema = z.object({
  customer_name: z.string().trim().max(120).nullable().optional(),
  customer_phone: z.string().trim().max(30).nullable().optional(),
  shipping_address: z.string().trim().max(500).nullable().optional(),
  shipping_city: z.string().trim().max(100).nullable().optional(),
  shipping_district: z.string().trim().max(100).nullable().optional(),
  shipping_thana: z.string().trim().max(100).nullable().optional(),
});

function cleanText(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length ? t : null;
}

const SITE_TO_SOURCE_WEBSITE: Record<string, string> = {
  "toyorakids.com": "toyora",
  "www.toyorakids.com": "toyora",
  "hobbyshopbd.com": "main",
  "www.hobbyshopbd.com": "main",
};

/**
 * Save staff edits (address, phone, items...) on an incomplete checkout
 * WITHOUT creating an order. Used while talking to the customer.
 */
export const updateAbandonedCartFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    reviewCustomerSchema
      .extend({
        id: z.string().uuid(),
        items: z.array(reviewItemSchema).min(1).max(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const subtotal = data.items.reduce((s, it) => s + it.unit_price * it.quantity, 0);
    const { error } = await context.supabase
      .from("abandoned_carts")
      .update({
        customer_name: cleanText(data.customer_name),
        customer_phone: cleanText(data.customer_phone),
        shipping_address: cleanText(data.shipping_address),
        shipping_city: cleanText(data.shipping_city),
        shipping_district: cleanText(data.shipping_district),
        shipping_thana: cleanText(data.shipping_thana),
        cart_items: data.items as never,
        subtotal,
      })
      .eq("id", data.id)
      .eq("is_converted", false);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Staff has talked to the customer and pressed CONFIRM:
 * only now is a real (confirmed) order created from the reviewed details.
 */
export const convertAbandonedCartFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    reviewCustomerSchema
      .extend({
        id: z.string().uuid(),
        brandId: z.string().uuid(),
        items: z.array(reviewItemSchema).min(1).max(50),
        shippingFee: z.number().min(0).max(100000).default(0),
        discount: z.number().min(0).max(1000000).default(0),
        note: z.string().max(1000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const sb = context.supabase;

    const name = cleanText(data.customer_name);
    const phone = cleanText(data.customer_phone);
    const address = cleanText(data.shipping_address);
    if (!name) throw new Error("Customer name lagbe");
    if (!phone || phone.replace(/\D/g, "").length < 10) throw new Error("Sothik phone number lagbe");
    if (!address) throw new Error("Address lagbe");

    const subtotal = data.items.reduce((s, it) => s + it.unit_price * it.quantity, 0);
    const discount = Math.min(data.discount, subtotal);
    const total = Math.max(0, subtotal + data.shippingFee - discount);

    // Claim the cart first so a double-click can never create two orders.
    const { data: claimed, error: claimErr } = await sb
      .from("abandoned_carts")
      .update({ is_converted: true })
      .eq("id", data.id)
      .eq("is_converted", false)
      .select("id, source_site")
      .maybeSingle();
    if (claimErr) throw new Error(claimErr.message);
    if (!claimed) throw new Error("Ei checkout already order hoye geche");

    const release = async () => {
      await sb.from("abandoned_carts").update({ is_converted: false, converted_order_id: null }).eq("id", data.id);
    };

    const now = new Date().toISOString();
    const district = cleanText(data.shipping_district);
    const { data: order, error: oErr } = await sb
      .from("orders")
      .insert({
        brand_id: data.brandId,
        source: "incomplete" as never,
        source_website: SITE_TO_SOURCE_WEBSITE[(claimed as { source_site?: string | null }).source_site ?? ""] ?? null,
        status: "confirmed" as never,
        web_status: "complete" as never,
        confirmation_status: "pending" as never,
        confirmed_at: now,
        confirmed_by: context.userId,
        subtotal,
        total,
        shipping_fee: data.shippingFee,
        discount_amount: discount,
        is_guest_order: true,
        shipping_name: name,
        shipping_phone: phone,
        shipping_address: address,
        shipping_city: cleanText(data.shipping_city) ?? district,
        shipping_district: district,
        shipping_thana: cleanText(data.shipping_thana),
        guest_name: name,
        guest_phone: phone,
        payment_method: "cod",
        notes: cleanText(data.note),
      })
      .select("id, invoice_no")
      .single();
    if (oErr) {
      await release();
      throw new Error(oErr.message);
    }

    const itemRows = data.items.map((it) => ({
      order_id: order.id,
      product_id: it.product_id,
      variant_id: it.variant_id ?? null,
      variant_label: it.variant_label ?? null,
      name: it.name,
      image: it.image ?? null,
      price: it.unit_price,
      unit_price: it.unit_price,
      quantity: it.quantity,
      line_total: it.unit_price * it.quantity,
    }));
    const { error: iErr } = await sb.from("order_items").insert(itemRows);
    if (iErr) {
      await sb.from("orders").delete().eq("id", order.id);
      await release();
      throw new Error(iErr.message);
    }

    await sb.rpc("mark_abandoned_cart_converted", { _id: data.id, _order_id: order.id });

    return { orderId: order.id, invoiceNo: order.invoice_no };
  });

export const bulkDeleteAbandonedCartsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { error, count } = await context.supabase
      .from("abandoned_carts")
      .delete({ count: "exact" })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { deleted: count ?? 0 };
  });

export const logCartMessageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      cartId: z.string().uuid(),
      channel: z.enum(["whatsapp", "sms", "manual", "call"]),
      messageBody: z.string().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { data: cart, error: cErr } = await context.supabase
      .from("abandoned_carts")
      .select("id, brand_id, followup_count")
      .eq("id", data.cartId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!cart) throw new Error("Cart not found");

    const { error: msgErr } = await context.supabase
      .from("abandoned_cart_messages")
      .insert({
        cart_id: data.cartId,
        brand_id: cart.brand_id,
        channel: data.channel,
        message_body: data.messageBody ?? null,
        sent_by: context.userId,
      });
    if (msgErr) throw new Error(msgErr.message);

    const { error: uErr } = await context.supabase
      .from("abandoned_carts")
      .update({
        followup_status: "contacted",
        followup_count: (cart.followup_count ?? 0) + 1,
        last_followup_at: new Date().toISOString(),
        last_followup_channel: data.channel,
      })
      .eq("id", data.cartId);
    if (uErr) throw new Error(uErr.message);
    return { ok: true };
  });

export const bulkLogCartMessagesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      cartIds: z.array(z.string().uuid()).min(1).max(200),
      channel: z.enum(["whatsapp", "sms", "manual", "call"]),
      messageBody: z.string().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { data: carts, error: cErr } = await context.supabase
      .from("abandoned_carts")
      .select("id, brand_id, followup_count")
      .in("id", data.cartIds);
    if (cErr) throw new Error(cErr.message);
    const rows = (carts ?? []).map((c: any) => ({
      cart_id: c.id,
      brand_id: c.brand_id,
      channel: data.channel,
      message_body: data.messageBody ?? null,
      sent_by: context.userId,
    }));
    if (rows.length === 0) return { logged: 0 };
    const { error: mErr } = await context.supabase.from("abandoned_cart_messages").insert(rows);
    if (mErr) throw new Error(mErr.message);

    // Bump followup counters individually (small batch, ok)
    await Promise.all(
      (carts ?? []).map((c: any) =>
        context.supabase
          .from("abandoned_carts")
          .update({
            followup_status: "contacted",
            followup_count: (c.followup_count ?? 0) + 1,
            last_followup_at: new Date().toISOString(),
            last_followup_channel: data.channel,
          })
          .eq("id", c.id),
      ),
    );
    return { logged: rows.length };
  });

export type IncompleteReport = {
  totalCarts: number;
  totalRevenue: number;
  convertedCarts: number;
  convertedRevenue: number;
  recoveryRate: number;
  lostRevenue: number;
  avgCartValue: number;
  contactedCount: number;
  messagesSent: number;
  responseRate: number;
  byLastStep: { step: string; count: number }[];
};

export const incompleteReportsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      brandId: z.string().uuid().nullable().optional(),
      brandIds: z.array(z.string().uuid()).optional(),
      dateFrom: z.string(),
      dateTo: z.string(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    let q = context.supabase
      .from("abandoned_carts")
      .select("id, subtotal, is_converted, last_step, followup_status, followup_count")
      .gte("created_at", dhakaDayStart(data.dateFrom) ?? data.dateFrom)
      .lte("created_at", dhakaDayEnd(data.dateTo) ?? data.dateTo)
      .not("customer_phone", "is", null)
      .neq("customer_phone", "")
      .gt("subtotal", 0);
    if (data.brandIds && data.brandIds.length > 0) {
      q = applyBrandScope(q, data.brandIds);
    } else if (data.brandId) {
      q = q.eq("brand_id", data.brandId);
    }
    const { data: carts, error } = await q;
    if (error) throw new Error(error.message);

    const list = (carts ?? []) as Array<{
      subtotal: number;
      is_converted: boolean;
      last_step: string | null;
      followup_status: string | null;
      followup_count: number | null;
    }>;

    const totalCarts = list.length;
    const totalRevenue = list.reduce((s, c) => s + Number(c.subtotal ?? 0), 0);
    // "Recovered" = cart that we actually contacted (followup sent) AND then got converted.
    // Auto-conversion without any follow-up is NOT a recovery — the customer would have placed the order anyway.
    const recovered = list.filter((c) => c.is_converted && (c.followup_count ?? 0) > 0);
    const convertedCarts = recovered.length;
    const convertedRevenue = recovered.reduce((s, c) => s + Number(c.subtotal ?? 0), 0);
    const contactedCount = list.filter((c) => (c.followup_count ?? 0) > 0).length;
    const messagesSent = list.reduce((s, c) => s + (c.followup_count ?? 0), 0);
    // Lost revenue = carts that stayed abandoned (never converted).
    const lostRevenue = list
      .filter((c) => !c.is_converted)
      .reduce((s, c) => s + Number(c.subtotal ?? 0), 0);
    // Recovery rate = of the ones we contacted, how many converted.
    const recoveryRate = contactedCount > 0 ? (convertedCarts / contactedCount) * 100 : 0;
    const avgCartValue = totalCarts > 0 ? totalRevenue / totalCarts : 0;
    const responseRate = recoveryRate;
    const stepMap = new Map<string, number>();
    list.forEach((c) => {
      const k = c.last_step ?? "unknown";
      stepMap.set(k, (stepMap.get(k) ?? 0) + 1);
    });
    const byLastStep = Array.from(stepMap.entries())
      .map(([step, count]) => ({ step, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totalCarts,
      totalRevenue,
      convertedCarts,
      convertedRevenue,
      recoveryRate,
      lostRevenue,
      avgCartValue,
      contactedCount,
      messagesSent,
      responseRate,
      byLastStep,
    } satisfies IncompleteReport;
  });