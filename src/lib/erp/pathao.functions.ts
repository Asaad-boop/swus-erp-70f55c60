import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertCourierRole(supabase: any, userId: string) {
  const [{ data: admin }, { data: ops }, { data: cs }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "operations" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "customer_service" }),
  ]);
  if (!admin && !ops && !cs) throw new Error("Not authorized");
}

async function clientForBrand(supabase: any, brandId?: string | null) {
  const { createPathaoClient, loadPathaoCreds } = await import("./pathao.server");
  const creds = await loadPathaoCreds(supabase, brandId ?? null);
  return createPathaoClient(creds);
}

type NormalizedGeo = { id: number; name: string; raw?: any };

function asPathaoList(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.data?.data)) return value.data.data;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.results)) return value.results;
  return [];
}

function readPathaoNumber(row: any, keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function readPathaoString(row: any, keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function normalizePathaoCities(rows: any): NormalizedGeo[] {
  return asPathaoList(rows)
    .map((row) => ({
      id: readPathaoNumber(row, ["city_id", "cityId", "city", "id", "value"]),
      name: readPathaoString(row, ["city_name", "name", "label", "title"]),
      raw: row,
    }))
    .filter((row) => row.id > 0 && row.name.length > 0);
}

function normalizePathaoZones(rows: any): NormalizedGeo[] {
  return asPathaoList(rows)
    .map((row) => ({
      id: readPathaoNumber(row, ["zone_id", "zoneId", "zone", "id", "value"]),
      name: readPathaoString(row, ["zone_name", "name", "label", "title"]),
      raw: row,
    }))
    .filter((row) => row.id > 0 && row.name.length > 0);
}

function normalizePathaoAreas(rows: any): NormalizedGeo[] {
  return asPathaoList(rows)
    .map((row) => ({
      id: readPathaoNumber(row, ["area_id", "areaId", "area", "id", "value"]),
      name: readPathaoString(row, ["area_name", "name", "label", "title"]),
      raw: row,
    }))
    .filter((row) => row.id > 0 && row.name.length > 0);
}

function toApiCity(row: NormalizedGeo) {
  return { city_id: row.id, city_name: row.name };
}

function toApiZone(row: NormalizedGeo) {
  return { zone_id: row.id, zone_name: row.name };
}

function toApiArea(row: NormalizedGeo) {
  return { area_id: row.id, area_name: row.name };
}

/**
 * Remove any existing courier_shipments rows for this order whose status
 * looks cancelled (e.g. "Pickup_Cancelled", "Cancelled", "Canceled").
 * Lets the user re-book a fresh consignment without keeping stale history.
 */
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

function readPositiveNumber(payload: any, keys: string[]): number | null {
  const wanted = new Set(keys.map((k) => k.toLowerCase()));
  const seen = new Set<any>();
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

function pathaoActualCost(result: any, deliveryFee: number, codAmount: number, cityId?: number | null) {
  const rawTotalCost = readPositiveNumber(result, [
    "total_cost",
    "total_delivery_cost",
    "merchant_total_cost",
    "courier_charge",
  ]);
  const cod =
    readPositiveNumber(result, ["cod_fee", "cod_charge", "collection_fee"]) ??
    Math.round(Math.max(codAmount, 0) * 0.01 * 100) / 100;
  // Pathao order response er `delivery_fee` base charge hoye ashe; merchant standing
  // discount na thakle Dhaka 15 / outside 10 apply korte hobe.
  const discount =
    readPositiveNumber(result, [
      "discount",
      "discount_amount",
      "merchant_discount",
      "promo_discount",
      "promo_discount_amount",
    ]) ?? (cityId === 1 ? 15 : 10);
  const promo = 0;
  const additional = readPositiveNumber(result, ["additional_charge", "extra_charge", "weight_charge", "insurance_fee"]) ?? 0;
  const compensation = readPositiveNumber(result, ["compensation_cost", "compensation"]) ?? 0;
  const computed = deliveryFee > 0 ? deliveryFee + cod + additional + compensation - discount - promo : 0;
  const maxReasonableTotal = Math.max(500, Math.max(codAmount, 0) * 0.5);
  const totalCost = rawTotalCost && rawTotalCost <= maxReasonableTotal ? rawTotalCost : null;
  const total = totalCost && totalCost > 0 ? totalCost : computed;
  const rounded = total > 0 ? Math.round(total * 100) / 100 : 0;
  return {
    total: rounded,
    breakdown: { delivery: deliveryFee, cod, discount, promo_discount: promo, additional, compensation, extra: additional + compensation, total: rounded },
  };
}

export const pathaoCitiesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ brandId: z.string().uuid().optional() }).optional().parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const client = await clientForBrand(context.supabase, data?.brandId);
    return { items: normalizePathaoCities(await client.cities()).map(toApiCity) };
  });

export const pathaoZonesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ cityId: z.number().int().positive(), brandId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const client = await clientForBrand(context.supabase, data.brandId);
    return { items: normalizePathaoZones(await client.zones(data.cityId)).map(toApiZone) };
  });

export const pathaoAreasFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ zoneId: z.number().int().positive(), brandId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const client = await clientForBrand(context.supabase, data.brandId);
    return { items: normalizePathaoAreas(await client.areas(data.zoneId)).map(toApiArea) };
  });

/* ---------------------------------------------------------------------- */
/*  Pathao merchant address-parser detection — no AI, no local guessing   */
/* ---------------------------------------------------------------------- */
//
// City / Zone / Area preview and booking both use Pathao's own merchant
// address-parser endpoint first and strictly. This is the same endpoint their
// reception/new-delivery form calls when an operator types an address.

/**
 * Pathao customer lookup by phone — same call the Pathao merchant portal
 * uses to auto-fill "New Delivery" forms. Returns the last-used City,
 * Zone, Area, recipient name & address. Authoritative for any data-entry
 * form (Create Order, Web Orders book dialog).
 */
export const pathaoLookupByPhoneFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        phone: z.string().min(6).max(20),
        brandId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const client = await clientForBrand(context.supabase, data.brandId);
    const phone = data.phone.replace(/\D/g, "").slice(-11);
    if (phone.length < 11) return { found: false as const };
    const info: any = await client.lookupCustomer(phone);
    const dd = info?.data ?? info ?? {};
    const cityId = Number(dd.city_id || dd.recipient_city || 0);
    const zoneId = Number(dd.zone_id || dd.recipient_zone || 0);
    const areaId = Number(dd.area_id || dd.recipient_area || 0);
    if (!cityId || !zoneId) return { found: false as const };
    const citiesRaw = normalizePathaoCities(await client.cities());
    const cityName = citiesRaw.find((c) => c.id === cityId)?.name ?? dd.city_name ?? "";
    const zonesRaw = normalizePathaoZones(await client.zones(cityId));
    const zoneName = zonesRaw.find((z) => z.id === zoneId)?.name ?? dd.zone_name ?? "";
    let areaName = "";
    if (areaId) {
      try {
        const areasRaw = normalizePathaoAreas(await client.areas(zoneId));
        areaName = areasRaw.find((a) => a.id === areaId)?.name ?? dd.area_name ?? "";
      } catch { /* ignore */ }
    }
    return {
      found: true as const,
      city: { id: cityId, name: cityName },
      zone: { id: zoneId, name: zoneName },
      area: areaId ? { id: areaId, name: areaName } : null,
      recipient_name: (dd.name || dd.recipient_name || "") as string,
      recipient_address: (dd.address || dd.recipient_address || "") as string,
      success_ratio: typeof dd.success_ratio === "number" ? dd.success_ratio : null,
    };
  });

/**
 * Address-based City / Zone / Area detection. The authoritative result comes
 * from Pathao's merchant-panel address parser only; Aladdin city/zone/area
 * lists are used only to verify/normalize names/IDs from that parser response.
 */
function normalizeAddr(s: string) {
  const normalized = (s || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[।,.;:/|()\-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized;
}

function readPathaoStringDeep(payload: any, keys: string[]): string {
  const wanted = new Set(keys.map((k) => k.toLowerCase()));
  const seen = new Set<any>();
  const visit = (node: any): string => {
    if (!node || typeof node !== "object" || seen.has(node)) return "";
    seen.add(node);
    for (const [key, value] of Object.entries(node)) {
      if (wanted.has(key.toLowerCase()) && value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim();
      }
    }
    for (const value of Object.values(node)) {
      const found = visit(value);
      if (found) return found;
    }
    return "";
  };
  return visit(payload?.data ?? payload);
}

function findByPathaoName(items: NormalizedGeo[], name: string) {
  const normalized = normalizeAddr(name);
  const compact = normalized.replace(/\s+/g, "");
  if (!normalized) return null;
  return items.find((item) => {
    const itemName = normalizeAddr(item.name);
    const itemCompact = itemName.replace(/\s+/g, "");
    return itemName === normalized || itemCompact === compact;
  }) ?? null;
}

async function normalizeParserRoute(client: any, parsed: any) {
  const cityNameRaw = readPathaoStringDeep(parsed, [
    "district_name", "city_name", "recipient_city_name", "name",
  ]);
  const zoneNameRaw = readPathaoStringDeep(parsed, [
    "zone_name", "recipient_zone_name",
  ]);
  const areaNameRaw = readPathaoStringDeep(parsed, [
    "area_name", "recipient_area_name",
  ]);
  let cityId = readPositiveNumber(parsed, ["district_id", "city_id", "recipient_city"]);
  let zoneId = readPositiveNumber(parsed, ["zone_id", "recipient_zone"]);
  let areaId = readPositiveNumber(parsed, ["area_id", "recipient_area"]);

  const cities = normalizePathaoCities(await client.cities());
  let city = cityId ? cities.find((c) => c.id === cityId) ?? null : null;
  if (!city && cityNameRaw) city = findByPathaoName(cities, cityNameRaw);
  cityId = city?.id ?? cityId;
  if (!cityId) return null;

  const zones = normalizePathaoZones(await client.zones(cityId).catch(() => []));
  let zone = zoneId ? zones.find((z) => z.id === zoneId) ?? null : null;
  if (!zone && zoneNameRaw) zone = findByPathaoName(zones, zoneNameRaw);
  zoneId = zone?.id ?? zoneId;
  if (!zoneId) return null;

  const areas = normalizePathaoAreas(await client.areas(zoneId).catch(() => []));
  let area = areaId ? areas.find((a) => a.id === areaId) ?? null : null;
  if (!area && areaNameRaw) area = findByPathaoName(areas, areaNameRaw);
  areaId = area?.id ?? areaId;

  return {
    city: { id: cityId, name: city?.name || cityNameRaw || "" },
    zone: { id: zoneId, name: zone?.name || zoneNameRaw || "" },
    area: areaId ? { id: areaId, name: area?.name || areaNameRaw || "" } : null,
    raw: parsed,
    score: 240,
  };
}

// Small in-process cache so rapid re-typing or repeated detection calls
// don't keep hitting Pathao's parser + cities/zones/areas endpoints.
const PARSER_CACHE = new Map<string, { at: number; value: any }>();
const PARSER_TTL = 5 * 60 * 1000;

async function resolveByPathaoParser(client: any, address: string) {
  const trimmed = address.trim();
  if (trimmed.length < 10) return null;
  const key = `${client.storeId ?? ""}::${trimmed.toLowerCase()}`;
  const hit = PARSER_CACHE.get(key);
  if (hit && Date.now() - hit.at < PARSER_TTL) return hit.value;
  const parsed = await client.parseAddress(trimmed);
  if (!parsed) return null;
  const value = await normalizeParserRoute(client, parsed);
  PARSER_CACHE.set(key, { at: Date.now(), value });
  if (PARSER_CACHE.size > 500) {
    const oldestKey = PARSER_CACHE.keys().next().value;
    if (oldestKey) PARSER_CACHE.delete(oldestKey);
  }
  return value;
}

async function resolveByAddress(client: any, address: string) {
  const parserRoute = await resolveByPathaoParser(client, address).catch(() => null);
  // Important: no local scoring fallback here. The user expectation is 100%
  // parity with what Pathao shows after typing the same recipient address in
  // their merchant portal. If Pathao cannot parse it, we show "not detected"
  // instead of inventing a different City / Zone / Area locally.
  if (parserRoute?.city && parserRoute.zone) return parserRoute;
  return null;
}

async function resolveExplicitLocation(client: any, cityId: number, zoneId: number, areaId?: number | null) {
  const cities = normalizePathaoCities(await client.cities());
  const city = cities.find((c) => c.id === cityId) ?? { id: cityId, name: "" };
  const zones = normalizePathaoZones(await client.zones(cityId).catch(() => []));
  const zone = zones.find((z) => z.id === zoneId) ?? { id: zoneId, name: "" };
  let area: { id: number; name: string } | null = null;
  if (areaId) {
    const areas = normalizePathaoAreas(await client.areas(zoneId).catch(() => []));
    const matchedArea = areas.find((a) => a.id === areaId);
    area = { id: areaId, name: matchedArea?.name ?? "" };
  }
  return {
    city: { id: city.id, name: city.name },
    zone: { id: zone.id, name: zone.name },
    area,
    score: 200,
  };
}

export const pathaoMatchAddressFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        address: z.string().min(2).max(500),
        brandId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const client = await clientForBrand(context.supabase, data.brandId);
    const route = await resolveByAddress(client, data.address);
    if (!route) return { found: false as const };
    return {
      found: true as const,
      city: route.city,
      zone: route.zone,
      area: route.area,
      confidence: Math.min(1, Math.round((route.score / 200) * 100) / 100),
      source: "pathao_address_parser" as const,
      raw: route.raw ?? null,
    };
  });

/**
 * Pathao-only preview detection for a saved order. The saved/current address
 * is sent directly to Pathao's merchant address parser; phone history and
 * local list scoring are intentionally not used for route selection.
 */
export const pathaoDetectForOrderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const { supabase } = context;

    const { data: order, error } = await supabase
      .from("orders")
      .select("id, brand_id, shipping_phone, guest_phone, shipping_address, shipping_city, shipping_thana, shipping_district")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order) throw new Error("Order not found");

    const client = await clientForBrand(supabase, order.brand_id);
    const addressText = [order.shipping_address, order.shipping_thana, order.shipping_city, order.shipping_district]
      .filter(Boolean)
      .join(", ");
    const route = await resolveByAddress(client, addressText);
    if (route?.zone) {
      return {
        city: route.city,
        zone: route.zone,
        area: route.area,
        confidence: Math.min(1, Math.round((route.score / 200) * 100) / 100),
        source: "pathao_address_parser" as const,
        raw: route.raw ?? null,
      };
    }

    if (route) {
      return {
        city: route.city,
        zone: null,
        area: null,
        confidence: Math.min(1, Math.round((route.score / 200) * 100) / 100),
        source: "pathao_address_parser" as const,
        raw: route.raw ?? null,
      };
    }
    return { city: null, zone: null, area: null, confidence: 0, source: "none" as const, raw: null };
  });


export const pathaoPriceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        item_weight: z.number().positive(),
        recipient_city: z.number().int().positive(),
        recipient_zone: z.number().int().positive(),
        delivery_type: z.union([z.literal(48), z.literal(12)]).default(48),
        item_type: z.union([z.literal(1), z.literal(2)]).default(2),
        brandId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const client = await clientForBrand(context.supabase, data.brandId);
    const { brandId: _b, ...rest } = data;
    return { price: await client.price({ store_id: client.storeId, ...rest }) };
  });

export const pathaoBookOrderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        orderId: z.string().uuid(),
        recipient_city: z.number().int().positive().optional(),
        recipient_zone: z.number().int().positive().optional(),
        recipient_area: z.number().int().positive().optional(),
        item_weight: z.number().positive(),
        item_quantity: z.number().int().positive().default(1),
        amount_to_collect: z.number().nonnegative(),
        item_description: z.string().max(500).optional(),
        special_instruction: z.string().max(500).optional(),
        delivery_type: z.union([z.literal(48), z.literal(12)]).default(48),
        item_type: z.union([z.literal(1), z.literal(2)]).default(2),
      })
      .parse(d),
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
    const phone = order.shipping_phone || order.guest_phone || "";
    const address = [order.shipping_address, order.shipping_thana, order.shipping_city, order.shipping_district].filter(Boolean).join(", ");

    // Drop any prior cancelled shipments so we start fresh
    await purgeCancelledShipments(supabase, order.id);

    const client = await clientForBrand(supabase, order.brand_id);
    const merchantId = order.id.slice(0, 8).toUpperCase();
    const manualLocation = data.recipient_city && data.recipient_zone;
    const explicitLocation = manualLocation
      ? await resolveExplicitLocation(client, data.recipient_city!, data.recipient_zone!, data.recipient_area)
      : null;
    const detectedLocation = explicitLocation ?? await resolveByAddress(client, address);
    const locationPayload = manualLocation
      ? {
          recipient_city: data.recipient_city,
          recipient_zone: data.recipient_zone,
          recipient_area: data.recipient_area,
          source: "manual" as const,
        }
      : detectedLocation?.city && detectedLocation.zone
        ? {
            recipient_city: detectedLocation.city.id,
            recipient_zone: detectedLocation.zone.id,
            recipient_area: detectedLocation.area?.id,
            source: "pathao_address" as const,
          }
        : null;
    const result: any = await client.createOrder({
      store_id: client.storeId,
      merchant_order_id: merchantId,
      recipient_name: name,
      recipient_phone: phone,
      recipient_address: address,
      ...(locationPayload ? {
        recipient_city: locationPayload.recipient_city,
        recipient_zone: locationPayload.recipient_zone,
        recipient_area: locationPayload.recipient_area,
      } : {}),
      delivery_type: data.delivery_type,
      item_type: data.item_type,
      special_instruction: data.special_instruction,
      item_quantity: data.item_quantity,
      item_weight: data.item_weight,
      amount_to_collect: Math.round(data.amount_to_collect),
      item_description: data.item_description,
    });

    const consignment = result?.consignment_id || result?.data?.consignment_id || null;
    const tracking = result?.tracking_code || result?.data?.tracking_code || null;
    const fee = readPositiveNumber(result, ["delivery_fee", "delivery_charge", "normal_delivery", "same_day_delivery"]) ?? 0;
    const actualCost = pathaoActualCost(result, fee, data.amount_to_collect, locationPayload?.recipient_city ?? null);
    const status = result?.order_status || result?.data?.order_status || "Pickup_Requested";

    const { data: shipment, error: sErr } = await supabase
      .from("courier_shipments")
      .insert({
        order_id: order.id,
        brand_id: order.brand_id,
        provider: "pathao",
        consignment_id: consignment,
        merchant_order_id: merchantId,
        tracking_code: tracking,
        delivery_fee: fee || null,
        status,
        request_payload: { ...data, pathao_location_source: locationPayload?.source ?? "pathao_auto_address", detected_location: detectedLocation } as never,
        response_payload: result as never,
        created_by: userId,
      })
      .select("id")
      .single();
    if (sErr) throw sErr;

    // Removed: record_courier_expense (booking-time estimate caused duplicate courier
    // expense posting alongside record_order_courier_expense during sync). Actual
    // courier cost is now posted idempotently at delivery via order_courier flow.

    const orderUpdate: Record<string, unknown> = {
      courier_name: "pathao",
      courier_assigned_at: new Date().toISOString(),
      tracking_number: consignment ?? undefined,
      ...(locationPayload ? {
        pathao_city_id: locationPayload.recipient_city,
        pathao_city_name: detectedLocation?.city?.name ?? null,
        pathao_zone_id: locationPayload.recipient_zone,
        pathao_zone_name: detectedLocation?.zone?.name ?? null,
        pathao_area_id: locationPayload.recipient_area ?? null,
        pathao_area_name: detectedLocation?.area?.name ?? null,
      } : {}),
      ...(actualCost.total > 0 ? {
        actual_shipping_cost: actualCost.total,
        actual_shipping_source: "auto",
        actual_shipping_recorded_at: new Date().toISOString(),
        actual_shipping_breakdown: actualCost.breakdown as never,
      } : {}),
    };

    await supabase
      .from("orders")
      .update(orderUpdate as never)
      .eq("id", order.id);

    return { shipmentId: shipment.id, consignment, tracking, fee: actualCost.total || fee, status };
  });

export const pathaoTrackFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ shipmentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const { supabase } = context;
    const { data: ship, error } = await supabase
      .from("courier_shipments")
      .select("id, consignment_id, provider, brand_id")
      .eq("id", data.shipmentId)
      .maybeSingle();
    if (error) throw error;
    if (!ship?.consignment_id) throw new Error("Shipment has no consignment id");

    const client = await clientForBrand(supabase, ship.brand_id);
    const info: any = await client.track(ship.consignment_id);
    const status = info?.order_status || info?.data?.order_status || info?.status || null;

    if (status) {
      const payload = info?.data ?? info ?? {};
      const norm = String(status).toLowerCase().replace(/[\s-]+/g, "_");
      const isActiveDelivery = /assigned_for_delivery|on_delivery|out_for_delivery/.test(norm);
      const riderName = isActiveDelivery
        ? (payload?.delivery_man_name ?? payload?.delivery_man?.name ?? null)
        : null;
      const riderPhone = isActiveDelivery
        ? (payload?.delivery_man_phone ?? payload?.delivery_man?.phone ?? null)
        : null;
      await supabase
        .from("courier_shipments")
        .update({
          status: norm,
          response_payload: info as never,
          rider_name: riderName,
          rider_phone: riderPhone,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", ship.id);
    }
    return { status, info };
  });

/**
 * Auto-detect city/zone/area from Pathao's live city/zone/area API lists and
 * book a Pathao consignment in one call. Designed for bulk "Send to Pathao".
 */
export const pathaoBookOrderAutoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        orderId: z.string().uuid(),
        item_weight: z.number().positive().default(0.5),
        item_quantity: z.number().int().positive().default(1),
        delivery_type: z.union([z.literal(48), z.literal(12)]).default(48),
        item_type: z.union([z.literal(1), z.literal(2)]).default(2),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const { supabase, userId } = context;

    const { data: order, error: oErr } = await supabase
      .from("orders")
      .select(
        "id, invoice_no, brand_id, shipping_name, shipping_phone, guest_name, guest_phone, shipping_address, shipping_thana, shipping_city, shipping_district, total, pathao_city_id, pathao_zone_id, pathao_area_id, items:order_items(name, quantity)",
      )
      .eq("id", data.orderId)
      .maybeSingle();
    if (oErr) throw oErr;
    if (!order) throw new Error("Order not found");

    // Bail early if already booked with Pathao
    const { data: existing } = await supabase
      .from("courier_shipments")
      .select("consignment_id, tracking_code, status")
      .eq("order_id", order.id)
      .eq("provider", "pathao")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const existingIsCancelled = /cancel/i.test(existing?.status ?? "");
    if (existing?.consignment_id && !existingIsCancelled) {
      return {
        skipped: true,
        consignment: existing.consignment_id,
        tracking: existing.tracking_code,
        message: "Already booked",
      };
    }

    // Existing one was cancelled — wipe it and book fresh.
    await purgeCancelledShipments(supabase, order.id);

    const name = order.shipping_name || order.guest_name || "Customer";
    const phone = order.shipping_phone || order.guest_phone || "";
    const address = [order.shipping_address, order.shipping_thana, order.shipping_city, order.shipping_district]
      .filter(Boolean)
      .join(", ");
    if (!phone || address.length < 5) throw new Error("Missing phone or address");

    const client = await clientForBrand(supabase, order.brand_id);
    const detectedLocation = await resolveByAddress(client, address);
    const locationPayload = detectedLocation?.city && detectedLocation.zone
      ? {
          recipient_city: detectedLocation.city.id,
          recipient_zone: detectedLocation.zone.id,
          recipient_area: detectedLocation.area?.id,
        }
      : (order as { pathao_city_id: number | null; pathao_zone_id: number | null; pathao_area_id: number | null }).pathao_city_id &&
          (order as { pathao_zone_id: number | null }).pathao_zone_id
        ? {
            recipient_city: (order as { pathao_city_id: number }).pathao_city_id,
            recipient_zone: (order as { pathao_zone_id: number }).pathao_zone_id,
            recipient_area: (order as { pathao_area_id: number | null }).pathao_area_id ?? undefined,
          }
        : null;
    if (!locationPayload) {
      throw new Error(
        `Pathao city/zone detect korte pari nai. Address theke match hoi nai ebong order-e pathao_city_id/pathao_zone_id save nai. Order edit kore Pathao city+zone select koro, tarpor abar upload koro. (address: "${address}")`,
      );
    }

    const items = (order.items ?? []) as Array<{ name: string | null; quantity: number | null }>;
    const totalQty = items.reduce((s, it) => s + (it.quantity ?? 0), 0) || data.item_quantity;
    const desc = items
      .map((it) => `${it.quantity ?? 1}× ${it.name ?? "item"}`)
      .join(", ")
      .slice(0, 480) || "Order items";

    const merchantId = order.invoice_no || order.id.slice(0, 8).toUpperCase();
    const result: any = await client.createOrder({
      store_id: client.storeId,
      merchant_order_id: merchantId,
      recipient_name: name,
      recipient_phone: phone,
      recipient_address: address,
      ...(locationPayload ? locationPayload : {}),
      delivery_type: data.delivery_type,
      item_type: data.item_type,
      item_quantity: totalQty,
      item_weight: data.item_weight,
      amount_to_collect: Math.round(Number(order.total) || 0),
      item_description: desc,
    });

    const consignment = result?.consignment_id || result?.data?.consignment_id || null;
    const tracking = result?.tracking_code || result?.data?.tracking_code || null;
    const fee = readPositiveNumber(result, ["delivery_fee", "delivery_charge", "normal_delivery", "same_day_delivery"]) ?? 0;
    const actualCost = pathaoActualCost(result, fee, Number(order.total) || 0, locationPayload?.recipient_city ?? null);
    const status = result?.order_status || result?.data?.order_status || "Pickup_Requested";

    const { data: shipment, error: sErr } = await supabase
      .from("courier_shipments")
      .insert({
        order_id: order.id,
        brand_id: order.brand_id,
        provider: "pathao",
        consignment_id: consignment,
        merchant_order_id: merchantId,
        tracking_code: tracking,
        delivery_fee: fee || null,
        status,
        request_payload: {
          auto: true,
          pathao_location_source: locationPayload ? "pathao_address" : "pathao_auto_address",
          address,
          detected_location: detectedLocation,
        } as never,
        response_payload: result as never,
        created_by: userId,
      })
      .select("id")
      .single();
    if (sErr) throw sErr;

    // Removed: record_courier_expense (see note above — booking-time estimate is
    // superseded by delivery-time record_order_courier_expense).

    await supabase
      .from("orders")
      .update({
        courier_name: "pathao",
        courier_assigned_at: new Date().toISOString(),
        tracking_number: consignment ?? undefined,
        ...(locationPayload ? {
          pathao_city_id: locationPayload.recipient_city,
          pathao_city_name: detectedLocation?.city?.name ?? null,
          pathao_zone_id: locationPayload.recipient_zone,
          pathao_zone_name: detectedLocation?.zone?.name ?? null,
          pathao_area_id: locationPayload.recipient_area ?? null,
          pathao_area_name: detectedLocation?.area?.name ?? null,
        } : {}),
        ...(actualCost.total > 0 ? {
          actual_shipping_cost: actualCost.total,
          actual_shipping_source: "auto",
          actual_shipping_recorded_at: new Date().toISOString(),
          actual_shipping_breakdown: actualCost.breakdown as never,
        } : {}),
      })
      .eq("id", order.id);

    return {
      shipmentId: shipment.id,
      consignment,
      tracking,
      fee: actualCost.total || fee,
      status,
      city: detectedLocation?.city ?? null,
      zone: detectedLocation?.zone ?? null,
    };
  });

// ---- Settings management ----

const SettingsSchema = z.object({
  brand_id: z.string().uuid(),
  base_url: z.string().url().optional().or(z.literal("")),
  // Credentials optional — if a brand only needs its own store_id and wants to
  // reuse another brand's API credentials, leave these blank.
  client_id: z.string().max(200).optional().or(z.literal("")),
  client_secret: z.string().max(500).optional().or(z.literal("")),
  username: z.string().max(200).optional().or(z.literal("")),
  password: z.string().max(200).optional().or(z.literal("")),
  store_id: z.string().min(1).max(50),
  is_active: z.boolean().default(true),
});
const SettingsSaveSchema = SettingsSchema.extend({
  wallet_id: z.string().uuid().nullable().optional(),
});

export const pathaoGetSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ brandId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: admin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!admin) throw new Error("Admin only");
    const { data: row, error } = await supabase
      .from("erp_courier_settings")
      .select("brand_id, base_url, client_id, client_secret, username, password, store_id, is_active, wallet_id")
      .eq("provider", "pathao")
      .eq("brand_id", data.brandId)
      .maybeSingle();
    if (error) throw error;
    return { settings: row };
  });

export const pathaoSaveSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SettingsSaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: admin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!admin) throw new Error("Admin only");
    const payload = {
      brand_id: data.brand_id,
      provider: "pathao",
      base_url: data.base_url && data.base_url.length > 0 ? data.base_url : "https://api-hermes.pathao.com",
      client_id: data.client_id || null,
      client_secret: data.client_secret || null,
      username: data.username || null,
      password: data.password || null,
      store_id: data.store_id,
      is_active: data.is_active,
      wallet_id: data.wallet_id ?? null,
    };
    const { error } = await supabase
      .from("erp_courier_settings")
      .upsert(payload, { onConflict: "brand_id,provider" });
    if (error) throw error;
    return { ok: true };
  });

export const pathaoTestConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ brandId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: admin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!admin) throw new Error("Admin only");
    const client = await clientForBrand(supabase, data.brandId);
    const cities = await client.cities();
    return { ok: true, cityCount: Array.isArray(cities) ? cities.length : 0 };
  });