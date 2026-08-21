import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertCourierRole(supabase: any, userId: string) {
  const [{ data: admin }, { data: ops }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "operations" }),
  ]);
  if (!admin && !ops) throw new Error("Not authorized");
}

async function clientForBrand(supabase: any, brandId?: string | null) {
  const { createSteadfastClient, loadSteadfastCreds } = await import("./steadfast.server");
  const creds = await loadSteadfastCreds(supabase, brandId ?? null);
  return createSteadfastClient(creds);
}

async function purgeCancelledShipments(supabase: any, orderId: string) {
  const { data: rows } = await supabase
    .from("courier_shipments")
    .select("id, status")
    .eq("order_id", orderId);
  const ids = ((rows ?? []) as Array<{ id: string; status: string | null }>)
    .filter((r) => /cancel/i.test(r.status ?? ""))
    .map((r) => r.id);
  if (ids.length > 0) {
    await supabase.from("courier_shipments").delete().in("id", ids);
  }
}

export const steadfastBalanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ brandId: z.string().uuid().optional() }).optional().parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const client = await clientForBrand(context.supabase, data?.brandId);
    const r: any = await client.balance();
    return { balance: Number(r?.current_balance ?? r?.data?.current_balance ?? 0) };
  });

export const steadfastBookOrderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      orderId: z.string().uuid(),
      cod_amount: z.number().nonnegative(),
      note: z.string().max(500).optional(),
      item_description: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const { supabase, userId } = context;

    const { data: order, error: oErr } = await supabase
      .from("orders")
      .select("id, brand_id, shipping_name, shipping_phone, guest_name, guest_phone, shipping_address, shipping_thana, shipping_city, shipping_district, total")
      .eq("id", data.orderId)
      .maybeSingle();
    if (oErr) throw oErr;
    if (!order) throw new Error("Order not found");

    const name = order.shipping_name || order.guest_name || "Customer";
    const phone = (order.shipping_phone || order.guest_phone || "").replace(/[^0-9]/g, "");
    const address = [order.shipping_address, order.shipping_thana, order.shipping_city, order.shipping_district]
      .filter(Boolean).join(", ");

    if (!phone || phone.length < 11) throw new Error("Recipient phone must be 11 digits");
    if (!address) throw new Error("Recipient address is missing");

    await purgeCancelledShipments(supabase, order.id);

    const invoice = order.id.slice(0, 8).toUpperCase() + "-" + Date.now().toString(36).slice(-4);
    const client = await clientForBrand(supabase, order.brand_id);
    const result: any = await client.createOrder({
      invoice,
      recipient_name: name,
      recipient_phone: phone,
      recipient_address: address,
      cod_amount: data.cod_amount,
      note: data.note,
      item_description: data.item_description,
    });

    const c = result?.consignment ?? result?.data?.consignment ?? result?.data ?? {};
    const consignment = c?.consignment_id ? String(c.consignment_id) : null;
    const tracking = c?.tracking_code ?? null;
    const status = c?.status ?? "in_review";

    const { data: shipment, error: sErr } = await supabase
      .from("courier_shipments")
      .insert({
        order_id: order.id,
        brand_id: order.brand_id,
        provider: "steadfast",
        consignment_id: consignment,
        merchant_order_id: invoice,
        tracking_code: tracking,
        delivery_fee: null,
        status,
        request_payload: data as never,
        response_payload: result as never,
        created_by: userId,
      })
      .select("id")
      .single();
    if (sErr) throw sErr;

    await supabase
      .from("orders")
      .update({
        courier_name: "steadfast",
        courier_assigned_at: new Date().toISOString(),
        tracking_number: consignment ?? invoice,
      })
      .eq("id", order.id);

    return { shipmentId: shipment.id, consignment, tracking, status, invoice };
  });

export const steadfastTrackFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ shipmentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const { supabase } = context;
    const { data: ship, error } = await supabase
      .from("courier_shipments")
      .select("id, consignment_id, merchant_order_id, brand_id")
      .eq("id", data.shipmentId)
      .maybeSingle();
    if (error) throw error;
    if (!ship) throw new Error("Shipment not found");

    const client = await clientForBrand(supabase, ship.brand_id);
    const info: any = ship.consignment_id
      ? await client.trackByCid(ship.consignment_id)
      : await client.trackByInvoice(ship.merchant_order_id!);
    const status = info?.delivery_status ?? info?.data?.delivery_status ?? info?.status ?? null;

    if (status) {
      const norm = String(status).toLowerCase().replace(/[\s-]+/g, "_");
      await supabase
        .from("courier_shipments")
        .update({ status: norm, response_payload: info as never, updated_at: new Date().toISOString() })
        .eq("id", ship.id);
    }
    return { status, info };
  });

// ---- Settings management ----

const SettingsSchema = z.object({
  brand_id: z.string().uuid(),
  base_url: z.string().url().optional().or(z.literal("")),
  api_key: z.string().min(1).max(500),
  secret_key: z.string().min(1).max(500),
  is_active: z.boolean().default(true),
});
const SettingsSaveSchema = SettingsSchema.extend({
  wallet_id: z.string().uuid().nullable().optional(),
});

export const steadfastGetSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ brandId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: admin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!admin) throw new Error("Admin only");
    const { data: row, error } = await supabase
      .from("erp_courier_settings")
      .select("brand_id, base_url, client_id, client_secret, is_active, wallet_id")
      .eq("provider", "steadfast")
      .eq("brand_id", data.brandId)
      .maybeSingle();
    if (error) throw error;
    return {
      settings: row
        ? {
            brand_id: row.brand_id,
            base_url: row.base_url,
            api_key: row.client_id,
            secret_key: row.client_secret,
            is_active: row.is_active,
            wallet_id: row.wallet_id,
          }
        : null,
    };
  });

export const steadfastSaveSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SettingsSaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: admin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!admin) throw new Error("Admin only");
    const payload = {
      brand_id: data.brand_id,
      provider: "steadfast",
      base_url: data.base_url && data.base_url.length > 0 ? data.base_url : "https://portal.packzy.com/api/v1",
      client_id: data.api_key,
      client_secret: data.secret_key,
      is_active: data.is_active,
      wallet_id: data.wallet_id ?? null,
    };
    const { error } = await supabase
      .from("erp_courier_settings")
      .upsert(payload, { onConflict: "brand_id,provider" });
    if (error) throw error;
    return { ok: true };
  });

export const steadfastTestConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ brandId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: admin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!admin) throw new Error("Admin only");
    const client = await clientForBrand(supabase, data.brandId);
    const r: any = await client.balance();
    return { ok: true, balance: Number(r?.current_balance ?? r?.data?.current_balance ?? 0) };
  });