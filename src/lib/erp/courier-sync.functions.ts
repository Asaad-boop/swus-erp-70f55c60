import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  mapCourierStatus,
  normalizeCourierStatus,
  type CourierProvider,
  type CourierStatusMappingOverrides,
} from "./courier-status-mapping";
import type { OrderStatus } from "./orders";

export type CourierSyncResult = {
  order_id: string;
  invoice_no: string | null;
  customer: string | null;
  phone: string | null;
  current_status: OrderStatus;
  provider: CourierProvider | null;
  identifier: string | null;
  raw_status: string | null;
  mapped_status: OrderStatus | null;
  actual_fee: number | null;
  fee_recorded: boolean;
  fee_breakdown: {
    delivery: number;
    cod: number;
    discount: number;
    promo_discount: number;
    additional: number;
    compensation: number;
    extra: number;
    total: number;
  } | null;
  order_total: number | null;
  courier_payable: number | null;
  ok: boolean;
  error?: string;
};

function pickProviderFromName(name: string | null | undefined): CourierProvider | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n.includes("pathao")) return "pathao";
  if (n.includes("steadfast") || n.includes("packzy")) return "steadfast";
  return null;
}

async function resolvePathaoRoute(client: any, order: { shipping_address?: string | null; shipping_city?: string | null; shipping_thana?: string | null; shipping_district?: string | null }) {
  const address = [order.shipping_address, order.shipping_thana, order.shipping_city, order.shipping_district].filter(Boolean).join(", ");
  if (address.trim().length < 10) return null;
  const parsed = await client.parseAddress(address).catch(() => null);
  const cityId = extractNumber(parsed, ["district_id", "city_id", "recipient_city"]);
  const zoneId = extractNumber(parsed, ["zone_id", "recipient_zone"]);
  if (!cityId || !zoneId) return null;
  return { cityId, zoneId };
}

function extractPathaoStatus(payload: any): string | null {
  const d = payload?.data ?? payload;
  return (
    d?.order_status ??
    d?.status ??
    d?.delivery_status ??
    null
  );
}

function extractFee(payload: any, keys: string[]): number | null {
  const seen = new Set<any>();
  const wanted = new Set(keys.map((k) => k.toLowerCase()));
  const visit = (node: any): number | null => {
    if (!node || typeof node !== "object" || seen.has(node)) return null;
    seen.add(node);
    for (const [key, value] of Object.entries(node)) {
      if (wanted.has(key.toLowerCase()) && value !== undefined && value !== null && value !== "") {
        const n = Number(value);
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
    for (const value of Object.values(node)) {
      const found = visit(value);
      if (found !== null) return found;
    }
    return null;
  };
  return visit(payload?.data ?? payload);
}

function extractNumber(payload: any, keys: string[]): number | null {
  const seen = new Set<any>();
  const wanted = new Set(keys.map((k) => k.toLowerCase()));
  const visit = (node: any): number | null => {
    if (!node || typeof node !== "object" || seen.has(node)) return null;
    seen.add(node);
    for (const [key, value] of Object.entries(node)) {
      if (wanted.has(key.toLowerCase()) && value !== undefined && value !== null && value !== "") {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
      }
    }
    for (const value of Object.values(node)) {
      const found = visit(value);
      if (found !== null) return found;
    }
    return null;
  };
  return visit(payload?.data ?? payload);
}

function buildFeeBreakdown(input: {
  deliveryFee: number;
  collected: number;
  codFeeRaw: number | null;
  discount: number;
  promoDiscount: number;
  additional: number;
  compensation: number;
  totalCost: number | null;
  isInsideDhaka: boolean;
}) {
  const codFee = input.codFeeRaw && input.codFeeRaw > 0
    ? input.codFeeRaw
    : (input.collected > 0 ? Math.round(input.collected * 0.01 * 100) / 100 : 0);
  const standingDiscount = input.discount > 0 ? 0 : (input.isInsideDhaka ? 15 : 10);
  const effectiveDiscount = input.discount + standingDiscount;
  const computed = input.deliveryFee > 0
    ? input.deliveryFee + codFee + input.additional + input.compensation - effectiveDiscount - input.promoDiscount
    : 0;
  const maxReasonableTotal = Math.max(500, input.collected * 0.5);
  const trustedTotalCost = input.totalCost && input.totalCost > 0 && input.totalCost <= maxReasonableTotal ? input.totalCost : null;
  const total = trustedTotalCost ?? computed;
  const roundedTotal = total > 0 ? Math.round(total * 100) / 100 : 0;
  return {
    actualFee: roundedTotal > 0 ? roundedTotal : null,
    breakdown: {
      delivery: input.deliveryFee,
      cod: codFee,
      discount: effectiveDiscount,
      promo_discount: input.promoDiscount,
      additional: input.additional,
      compensation: input.compensation,
      extra: input.additional + input.compensation,
      total: roundedTotal,
    },
  };
}

function extractSteadfastStatus(payload: any): string | null {
  const d = payload?.data ?? payload;
  return d?.delivery_status ?? d?.status ?? null;
}

async function syncOne(
  supabase: any,
  brandId: string | null,
  order: {
    id: string;
    invoice_no: string | null;
    status: OrderStatus;
    shipping_name: string | null;
    guest_name: string | null;
    shipping_phone: string | null;
    guest_phone: string | null;
    courier_name: string | null;
    tracking_number: string | null;
    brand_id: string | null;
    total: number | null;
    shipping_fee?: number | null;
    pathao_city_id?: number | null;
    pathao_zone_id?: number | null;
    shipping_address?: string | null;
    shipping_city?: string | null;
    shipping_district?: string | null;
    shipping_thana?: string | null;
  },
  shipment: { provider: string; consignment_id: string | null; tracking_code: string | null; delivery_fee?: number | null } | null,
  overrideId?: { provider: CourierProvider; identifier: string },
  mappingOverrides?: CourierStatusMappingOverrides | null,
): Promise<CourierSyncResult> {
  const base: CourierSyncResult = {
    order_id: order.id,
    invoice_no: order.invoice_no,
    customer: order.shipping_name ?? order.guest_name,
    phone: order.shipping_phone ?? order.guest_phone,
    current_status: order.status,
    provider: null,
    identifier: null,
    raw_status: null,
    mapped_status: null,
    actual_fee: null,
    fee_recorded: false,
    fee_breakdown: null,
    order_total: null,
    courier_payable: null,
    ok: false,
  };

  // Resolve provider + identifier
  let provider: CourierProvider | null = overrideId?.provider ?? null;
  let identifier: string | null = overrideId?.identifier ?? null;

  if (!provider || !identifier) {
    if (shipment) {
      const p = pickProviderFromName(shipment.provider);
      if (p) {
        provider = p;
        identifier = shipment.consignment_id ?? shipment.tracking_code ?? null;
      }
    }
    if (!provider || !identifier) {
      const p = pickProviderFromName(order.courier_name);
      if (p && order.tracking_number) {
        provider = p;
        identifier = order.tracking_number;
      }
    }
  }

  if (!provider) {
    return { ...base, error: "No courier linked" };
  }

  base.provider = provider;
  base.identifier = identifier;

  try {
    let raw: string | null = null;
    const effectiveBrand = order.brand_id ?? brandId;

    if (provider === "pathao") {
      if (!identifier) return { ...base, error: "No consignment ID" };
      const { loadPathaoCreds, createPathaoClient } = await import("./pathao.server");
      const creds = await loadPathaoCreds(supabase, effectiveBrand);
      const client = createPathaoClient(creds);
      const res: any = await client.track(identifier);
      raw = extractPathaoStatus(res);
      // Pathao'r merchant portal e dekhano "Total Cost" =
      //   Delivery Fee (price-plan theke) + COD Fee (collected * 1%) - Standing Discount
      // Standing Discount: Dhaka inside 15, baire 10 (merchant'er fixed deal).
      // Pathao info/track API cost expose kore na, tai price-plan call kori
      // jeta ekhonkar actual delivery rate dey city/zone/weight onujayi.
      let priceCityId = order.pathao_city_id ?? null;
      let priceZoneId = order.pathao_zone_id ?? null;
      if (!priceCityId || !priceZoneId) {
        const route = await resolvePathaoRoute(client, order);
        priceCityId = route?.cityId ?? priceCityId;
        priceZoneId = route?.zoneId ?? priceZoneId;
      }
      const locationText = [order.shipping_address, order.shipping_thana, order.shipping_city, order.shipping_district]
        .filter(Boolean)
        .join(" ");
      const isInsideDhaka =
        priceCityId === 1 ||
        /dhaka|ঢাকা|mirpur|uttara|banani|dhanmondi|khilgaon|jurain|mohammadpur|gulshan|badda|wari|motijheel|tejgaon/i.test(locationText);
      const collected = Number(order.total ?? 0);
      const trackedTotalCost = extractNumber(res, [
        "total_cost",
        "total_delivery_cost",
        "merchant_total_cost",
        "courier_charge",
      ]);
      let deliveryFee =
        extractFee(res, ["delivery_fee", "delivery_charge", "normal_delivery", "same_day_delivery"]) ?? 0;
      let additional =
        extractNumber(res, ["additional_charge", "extra_charge", "weight_charge", "insurance_fee"]) ?? 0;
      let effectiveDiscount =
        extractNumber(res, ["discount", "discount_amount", "merchant_discount", "promo_discount", "promo_discount_amount"]) ?? 0;
      let hasBaseDeliveryRate = deliveryFee > 0;
      if (priceCityId && priceZoneId) {
        const priceRes: any = await client.price({
          store_id: client.storeId,
          item_type: 2,
          delivery_type: 48,
          item_weight: 0.5,
          recipient_city: priceCityId,
          recipient_zone: priceZoneId,
        }).catch(() => null);
        const data = priceRes?.data ?? priceRes;
        // Pathao price-plan: `price` = base delivery, `final_price` = discount-baad-deya.
        // Merchant portal er Total Cost match korte base delivery + COD - discount use kori.
        const basePrice = Number(data?.price ?? data?.delivery_fee ?? data?.normal_delivery ?? 0);
        const finalPrice = Number(data?.final_price ?? data?.finalPrice ?? 0);
        additional = Number(data?.additional_charge ?? 0);
        const apiDiscount = Number(data?.promo_discount ?? data?.discount ?? data?.merchant_discount ?? 0);
        if (basePrice > 0) {
          deliveryFee = basePrice;
          hasBaseDeliveryRate = true;
        } else if (finalPrice > 0 && apiDiscount > 0) {
          deliveryFee = Math.max(finalPrice - additional + apiDiscount, 0);
          hasBaseDeliveryRate = true;
        } else if (finalPrice > 0) {
          deliveryFee = finalPrice;
        }
        if (effectiveDiscount <= 0) effectiveDiscount = apiDiscount > 0 ? apiDiscount : 0;
      }
      // Fallback: price API fail korle booking-time fee use koro
      if (deliveryFee <= 0) {
        deliveryFee = Number(shipment?.delivery_fee ?? order.shipping_fee ?? 0);
        hasBaseDeliveryRate = deliveryFee > 0;
      }
      if (effectiveDiscount <= 0 && hasBaseDeliveryRate) {
        effectiveDiscount = isInsideDhaka ? 15 : 10;
      }
      if (deliveryFee > 0) {
        const codFee = collected > 0 ? Math.round(collected * 0.01 * 100) / 100 : 0;
        const maxReasonableTotal = Math.max(500, collected * 0.5);
        const trustedTotalCost =
          trackedTotalCost && trackedTotalCost > 0 && trackedTotalCost <= maxReasonableTotal ? trackedTotalCost : null;
        const total = trustedTotalCost ?? Math.max(deliveryFee + codFee + additional - effectiveDiscount, 0);
        const rounded = Math.round(total * 100) / 100;
        base.actual_fee = rounded;
        base.fee_breakdown = {
          delivery: deliveryFee,
          cod: codFee,
          discount: effectiveDiscount,
          promo_discount: 0,
          additional,
          compensation: 0,
          extra: additional,
          total: rounded,
        };
      }
      if (collected > 0) {
        base.order_total = collected;
        base.courier_payable = Math.max(collected - (base.actual_fee ?? 0), 0);
      }
    } else {
      const { loadSteadfastCreds, createSteadfastClient } = await import("./steadfast.server");
      const creds = await loadSteadfastCreds(supabase, effectiveBrand);
      const client = createSteadfastClient(creds);
      let res: any = null;
      if (identifier) {
        res = await client.trackByCid(identifier).catch(() => null);
      }
      if (!res && order.invoice_no) {
        res = await client.trackByInvoice(order.invoice_no).catch(() => null);
      }
      if (!res) return { ...base, error: "Steadfast lookup failed" };
      raw = extractSteadfastStatus(res);
      base.actual_fee = extractFee(res, ["delivery_fee", "delivery_charge", "charge", "amount"]);
    }

    if (!raw) return { ...base, error: "Status not found in response" };

    base.raw_status = normalizeCourierStatus(raw);
    base.mapped_status = mapCourierStatus(provider, raw, mappingOverrides);
    base.ok = true;
    return base;
  } catch (e) {
    return { ...base, error: (e as Error).message };
  }
}

export const syncCourierStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        orderIds: z.array(z.string().uuid()).min(1).max(100),
        brandId: z.string().uuid().optional(),
        /**
         * Write the mapped courier status back to orders.status.
         * Default false: fetching is a PREVIEW. Dialogs show the suggestion
         * and only the user's explicit "Apply" performs the transition —
         * otherwise a simple refresh silently reverts manual corrections.
         */
        apply: z.boolean().optional(),
        overrides: z
          .array(
            z.object({
              orderId: z.string().uuid(),
              provider: z.enum(["pathao", "steadfast"]),
              identifier: z.string().min(1).max(120),
            }),
          )
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: orders, error: oErr } = await supabase
      .from("orders")
      .select(
        "id,invoice_no,status,shipping_name,guest_name,shipping_phone,guest_phone,courier_name,tracking_number,brand_id,total,shipping_fee,pathao_city_id,pathao_zone_id,shipping_address,shipping_city,shipping_district,shipping_thana",
      )
      .in("id", data.orderIds);
    if (oErr) throw oErr;

    const { data: shipments } = await supabase
      .from("courier_shipments")
      .select("id, order_id, provider, consignment_id, tracking_code, delivery_fee, status, created_at")
      .in("order_id", data.orderIds)
      .order("created_at", { ascending: false });

    type ShipRow = { id: string; provider: string; consignment_id: string | null; tracking_code: string | null; delivery_fee: number | null; status: string | null };
    const shipmentsByOrder = new Map<string, ShipRow[]>();
    for (const s of (shipments ?? []) as Array<ShipRow & { order_id: string }>) {
      const arr = shipmentsByOrder.get(s.order_id) ?? [];
      arr.push(s);
      shipmentsByOrder.set(s.order_id, arr);
    }
    // Active (non-cancelled) shipments first, then cancelled as last resort.
    // Pathao "Pickup_Cancelled" / "Cancelled" / "Return" → treat as inactive.
    const isCancelledStatus = (s: string | null) =>
      !!s && /cancel|return/i.test(s);
    for (const [oid, arr] of shipmentsByOrder) {
      arr.sort((a, b) => {
        const ac = isCancelledStatus(a.status) ? 1 : 0;
        const bc = isCancelledStatus(b.status) ? 1 : 0;
        return ac - bc; // active (0) before cancelled (1); preserves created_at desc otherwise
      });
      shipmentsByOrder.set(oid, arr);
    }
    const latestShipment = new Map<string, ShipRow>();
    for (const [oid, arr] of shipmentsByOrder) {
      if (arr[0]) latestShipment.set(oid, arr[0]);
    }

    const overrideMap = new Map<string, { provider: CourierProvider; identifier: string }>();
    for (const o of data.overrides ?? []) {
      overrideMap.set(o.orderId, { provider: o.provider, identifier: o.identifier });
    }

    // Load per-brand mapping overrides from erp_settings.config.courier_status_mapping
    let mappingOverrides: CourierStatusMappingOverrides | null = null;
    const brandsInScope = new Set<string>();
    for (const o of (orders ?? []) as Array<{ brand_id: string | null }>) {
      if (o.brand_id) brandsInScope.add(o.brand_id);
    }
    if (data.brandId) brandsInScope.add(data.brandId);
    if (brandsInScope.size === 1) {
      const [bid] = Array.from(brandsInScope);
      const { data: s } = await supabase
        .from("erp_settings")
        .select("config")
        .eq("brand_id", bid)
        .maybeSingle();
      const m = (s?.config as any)?.courier_status_mapping;
      if (m && typeof m === "object") mappingOverrides = m as CourierStatusMappingOverrides;
    }

    // For each order: try latest shipment. If courier reports a cancelled
    // status, delete that row and try the next one. The "active" consignment
    // wins; cancelled rows leave no trace.
    const results: CourierSyncResult[] = [];
    // Pathao rate-limits burst traffic aggressively. Each order triggers 2-3
    // API calls (track + parse-address + price), so keep concurrency at 2 with
    // a small inter-batch delay to avoid 429 storms on 50-order bulk syncs.
    const batchSize = 2;
    const list = (orders ?? []) as Array<Parameters<typeof syncOne>[2]>;
    const orderById = new Map(list.map((o) => [o.id, o]));
    const tryOne = async (o: Parameters<typeof syncOne>[2]): Promise<CourierSyncResult> => {
      const override = overrideMap.get(o.id);
      if (override) {
        return syncOne(supabase, data.brandId ?? null, o, null, override, mappingOverrides);
      }
      const queue = (shipmentsByOrder.get(o.id) ?? []).slice();
      // Always include a no-shipment attempt (uses orders.tracking_number) as final fallback
      let last: CourierSyncResult | null = null;
      while (queue.length > 0) {
        const ship = queue.shift()!;
        const r = await syncOne(supabase, data.brandId ?? null, o, ship, undefined, mappingOverrides);
        last = r;
        if (r.ok && r.raw_status && /cancel/i.test(r.raw_status)) {
          // drop this cancelled shipment row and try next
          await supabase.from("courier_shipments").delete().eq("id", ship.id);
          latestShipment.set(o.id, queue[0] ?? ship); // best-effort fee fallback ref
          continue;
        }
        // mirror status back to row so re-book flows can see it
        if (r.ok && r.raw_status) {
          const norm = String(r.raw_status).toLowerCase().replace(/[\s-]+/g, "_");
          await supabase
            .from("courier_shipments")
            .update({ status: norm, updated_at: new Date().toISOString() })
            .eq("id", ship.id);
        }
        return r;
      }
      return last ?? (await syncOne(supabase, data.brandId ?? null, o, null, undefined, mappingOverrides));
    };
    for (let i = 0; i < list.length; i += batchSize) {
      const batch = list.slice(i, i + batchSize);
      const settled = await Promise.all(batch.map((o) => tryOne(o)));
      results.push(...settled);
      if (i + batchSize < list.length) {
        await new Promise((r) => setTimeout(r, 350));
      }
    }

    // Fallback: if track API didn't return a fee, use the fee captured at booking time.
    for (const r of results) {
      if (r.ok && (!r.actual_fee || r.actual_fee <= 0)) {
        const ship = latestShipment.get(r.order_id);
        const o = orderById.get(r.order_id);
        const f = Number(ship?.delivery_fee ?? o?.shipping_fee ?? 0);
        if (f > 0) {
          r.actual_fee = f;
        }
      }
    }

    // Backfill orders.courier_name + tracking_number for orders that were
    // synced via manual consignment override but had no booking row yet.
    const backfillIds = results
      .filter((r) => r.ok && r.provider && r.identifier)
      .map((r) => r.order_id);
    if (backfillIds.length > 0) {
      const { data: existingCourier } = await supabase
        .from("orders")
        .select("id, courier_name, tracking_number")
        .in("id", backfillIds);
      const courierMap = new Map(
        ((existingCourier ?? []) as Array<{ id: string; courier_name: string | null; tracking_number: string | null }>)
          .map((r) => [r.id, r]),
      );
      for (const r of results) {
        if (!r.ok || !r.provider || !r.identifier) continue;
        const cur = courierMap.get(r.order_id);
        if (!cur) continue;
        const needsName = !cur.courier_name;
        const needsId = !cur.tracking_number;
        if (!needsName && !needsId) continue;
        await supabase
          .from("orders")
          .update({
            ...(needsName ? { courier_name: r.provider } : {}),
            ...(needsId ? { tracking_number: r.identifier } : {}),
          })
          .eq("id", r.order_id);
      }
    }

    // Persist actual courier fees + write expense (skip orders manually overridden)
    if (results.some((r) => r.ok && r.actual_fee && r.actual_fee > 0)) {
      const ids = results.filter((r) => r.ok && r.actual_fee).map((r) => r.order_id);
      const { data: existing } = await supabase
        .from("orders")
        .select("id, actual_shipping_source")
        .in("id", ids);
      const manualSet = new Set(
        ((existing ?? []) as Array<{ id: string; actual_shipping_source: string | null }>)
          .filter((r) => r.actual_shipping_source === "manual")
          .map((r) => r.id),
      );
      for (const r of results) {
        if (!r.ok || !r.actual_fee || r.actual_fee <= 0) continue;
        if (manualSet.has(r.order_id)) continue; // respect manual override
        const { error: uErr } = await supabase
          .from("orders")
          .update({
            actual_shipping_cost: r.actual_fee,
            actual_shipping_source: "auto",
            actual_shipping_recorded_at: new Date().toISOString(),
            actual_shipping_breakdown: r.fee_breakdown ?? null,
          })
          .eq("id", r.order_id);
        if (uErr) continue;
        const { error: rpcErr } = await supabase.rpc("record_order_courier_expense", {
          _order_id: r.order_id,
          _amount: r.actual_fee,
        });
        if (!rpcErr) r.fee_recorded = true;
      }
    }

    // Sync orders.status from mapped courier status ONLY when explicitly asked.
    if (data.apply) {
      const statusChanges = results.filter(
        (r) => r.ok && r.mapped_status && r.mapped_status !== r.current_status,
      );
      if (statusChanges.length > 0) {
        await Promise.all(
          statusChanges.map(async (r) => {
            const target = r.mapped_status!;
            // Try the validated RPC first (logs history + enforces transitions)
            const { error: rpcErr } = await supabase.rpc("transition_order_status", {
              _order_id: r.order_id,
              _new_status: target,
            });
            if (rpcErr) {
              // Fall back to a direct update so courier truth still wins
              await supabase
                .from("orders")
                .update({ status: target, updated_at: new Date().toISOString() })
                .eq("id", r.order_id);
            }
            r.current_status = target;
          }),
        );
      }
    }

    return { results };
  });

// Manual override: staff enters actual courier cost on an order.
export const setOrderActualShippingCostFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        orderId: z.string().uuid(),
        amount: z.number().min(0).max(100000),
        accountId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error: uErr } = await supabase
      .from("orders")
      .update({
        actual_shipping_cost: data.amount,
        actual_shipping_source: "manual",
        actual_shipping_recorded_at: new Date().toISOString(),
      })
      .eq("id", data.orderId);
    if (uErr) throw new Error(uErr.message);

    if (data.amount > 0) {
      const { error: rpcErr } = await supabase.rpc("record_order_courier_expense", {
        _order_id: data.orderId,
        _amount: data.amount,
        _account_id: data.accountId ?? undefined,
      });
      if (rpcErr) throw new Error(rpcErr.message);
    }
    return { ok: true };
  });