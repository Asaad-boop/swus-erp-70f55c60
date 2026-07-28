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
  followup_status?: string | null;
  followup_count?: number | null;
  last_followup_at?: string | null;
  last_followup_channel?: string | null;
};

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

    if (data.dateFrom) q = q.gte("updated_at", data.dateFrom);
    if (data.dateTo) q = q.lte("updated_at", data.dateTo);
    if (typeof data.subtotalMin === "number") q = q.gte("subtotal", data.subtotalMin);
    if (typeof data.subtotalMax === "number") q = q.lte("subtotal", data.subtotalMax);
    if (data.lastSteps && data.lastSteps.length > 0) q = q.in("last_step", data.lastSteps);
    if (data.followupStatuses && data.followupStatuses.length > 0) {
      q = q.in("followup_status", data.followupStatuses);
    }

    // Sort
    switch (data.sort) {
      case "oldest": q = q.order("updated_at", { ascending: true }); break;
      case "highest": q = q.order("subtotal", { ascending: false }); break;
      case "lowest": q = q.order("subtotal", { ascending: true }); break;
      case "priority": q = q.order("subtotal", { ascending: false }).order("updated_at", { ascending: false }); break;
      case "newest":
      default: q = q.order("updated_at", { ascending: false });
    }

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

export const convertAbandonedCartFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      brandId: z.string().uuid(),
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
      throw new Error("Not authorized to confirm incomplete checkouts");
    }

    const supabaseAdmin = context.supabase;

    const { data: cart, error: cartErr } = await supabaseAdmin
      .from("abandoned_carts")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (cartErr) throw new Error(cartErr.message);
    if (!cart) throw new Error("Cart not found");
    if (cart.is_converted) throw new Error("Already converted");

    const items = (cart.cart_items as unknown as AbandonedCartItem[]) ?? [];
    if (!items.length) throw new Error("Cart has no items");

    const subtotal = items.reduce((s, it) => {
      const price = Number(it.unit_price ?? it.price ?? 0);
      const qty = Number(it.quantity ?? it.qty ?? 1);
      return s + price * qty;
    }, 0);
    const total = subtotal; // shipping/discount = 0 by default; staff can adjust later

    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .insert({
        brand_id: data.brandId,
        source: "incomplete" as never,
        status: "confirmed" as never,
        web_status: "incomplete" as never,
        confirmation_status: "pending" as never,
        subtotal,
        total,
        shipping_fee: 0,
        discount_amount: 0,
        is_guest_order: true,
        shipping_name: cart.customer_name,
        shipping_phone: cart.customer_phone,
        shipping_address: cart.shipping_address,
        shipping_city: cart.shipping_city,
        shipping_district: cart.shipping_district,
        shipping_thana: cart.shipping_thana,
        guest_name: cart.customer_name,
        guest_phone: cart.customer_phone,
        payment_method: "cod",
      })
      .select("id, invoice_no")
      .single();
    if (oErr) throw new Error(oErr.message);

    const itemRows = items
      .filter((it) => it.product_id || it.id)
      .map((it) => {
        const price = Number(it.unit_price ?? it.price ?? 0);
          const qty = Number(it.quantity ?? it.qty ?? 1);
        return {
          order_id: order.id,
          product_id: (it.product_id ?? it.id)!,
          variant_id: it.variant_id ?? null,
          variant_label: it.variant_label ?? null,
          name: it.name ?? "Item",
          image: it.image ?? null,
          price,
          unit_price: price,
          quantity: qty,
          line_total: price * qty,
        };
      });

    if (itemRows.length) {
      const { error: iErr } = await supabaseAdmin.from("order_items").insert(itemRows);
      if (iErr) throw new Error(iErr.message);
    }

    await supabaseAdmin.rpc("mark_abandoned_cart_converted", {
      _id: data.id,
      _order_id: order.id,
    });

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
      .gte("updated_at", data.dateFrom)
      .lte("updated_at", data.dateTo)
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