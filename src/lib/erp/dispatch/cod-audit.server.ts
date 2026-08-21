import type { SupabaseClient } from "@supabase/supabase-js";
import { courierCodDue } from "@/lib/erp/courier-cod";
import { SMS_DEFAULTS, normalizeBdPhone, smsConfigKey, smsSegments, type SmsConfig } from "@/lib/erp/sms/templates";

type ServerContext = { supabase: SupabaseClient<any>; userId: string };

export type CourierCodAuditRow = {
  shipmentId: string;
  orderId: string;
  invoice: string;
  brandId: string;
  provider: string;
  waybill: string;
  courierStatus: string;
  customer: string;
  phone: string;
  total: number;
  advance: number;
  erpDue: number;
  courierCod: number | null;
  difference: number | null;
  classification: "confirmed_mismatch" | "manual_review";
  evidence: string;
  smsMessage: string;
};

const ACTIVE_COURIER_STATUSES = [
  "pending", "pickup_requested", "waiting_for_pickup", "waiting_for_pick_up", "assigned_for_pickup",
  "picked", "picked_up", "collected", "in_transit", "at_the_sorting_hub", "at_sorting_hub",
  "sorting_hub", "received_at_last_mile_hub", "last_mile_hub", "hub_received", "at_delivery_hub",
  "on_the_way_to_delivery_hub", "forwarded", "reached", "rider_assigned", "assigned_for_delivery",
  "on_delivery", "out_for_delivery", "on_hold", "delivery_hold", "delivery_rescheduled",
];

async function assertDispatchAccess(context: ServerContext) {
  const roles = ["admin", "operations", "customer_service"] as const;
  const results = await Promise.all(
    roles.map((role) => context.supabase.rpc("has_role", { _user_id: context.userId, _role: role })),
  );
  if (!results.some((result) => result.data === true)) throw new Error("Not authorized");
}

function numberFromPayload(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const amount = Number(value);
    if (Number.isFinite(amount)) return amount;
  }
  return null;
}

function smsText(customer: string, due: number, invoice: string) {
  return `Dear ${customer || "Customer"}, technical issue-er karone courier parcel-e amount beshi dekhacchilo. Eta correction kora hoyeche. Apnake shudhu Tk ${due.toLocaleString("en-US")} pay korte hobe; extra kono taka diben na. Order #${invoice}. Dhonnobad.`;
}

export async function auditActiveCourierCod(context: ServerContext, brandIds: string[]) {
  await assertDispatchAccess(context);
  let shipmentQuery = context.supabase
    .from("courier_shipments")
    .select("id,order_id,brand_id,provider,consignment_id,tracking_code,status,request_payload,response_payload,created_at")
    .in("status", ACTIVE_COURIER_STATUSES)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (brandIds.length > 0) shipmentQuery = shipmentQuery.in("brand_id", brandIds);
  const { data: shipments, error: shipmentError } = await shipmentQuery;
  if (shipmentError) throw shipmentError;

  const latestByOrder = new Map<string, any>();
  for (const shipment of shipments ?? []) {
    if (!latestByOrder.has(shipment.order_id)) latestByOrder.set(shipment.order_id, shipment);
  }
  const orderIds = [...latestByOrder.keys()];
  if (orderIds.length === 0) return { scanned: 0, rows: [] as CourierCodAuditRow[], auditedAt: new Date().toISOString() };

  const { data: orders, error: orderError } = await context.supabase
    .from("orders")
    .select("id,invoice_no,total,advance_amount,advance_txn_id,shipping_name,guest_name,shipping_phone,guest_phone")
    .in("id", orderIds);
  if (orderError) throw orderError;
  const orderById = new Map((orders ?? []).map((order: any) => [order.id, order]));
  const rows: CourierCodAuditRow[] = [];

  for (const shipment of latestByOrder.values()) {
    const order: any = orderById.get(shipment.order_id);
    if (!order) continue;
    const total = Number(order.total ?? 0);
    const advance = Number(order.advance_amount ?? 0);
    const due = courierCodDue(total, advance);
    const request = shipment.request_payload ?? {};
    const response = shipment.response_payload ?? {};
    const storedCourierCod = numberFromPayload(
      request.amount_to_collect,
      request.cod_amount,
      response.amount_to_collect,
      response.cod_amount,
      response.data?.amount_to_collect,
      response.data?.cod_amount,
    );

    let classification: CourierCodAuditRow["classification"] | null = null;
    let courierCod: number | null = storedCourierCod;
    let evidence = "";
    if (storedCourierCod !== null && Math.abs(storedCourierCod - due) >= 1) {
      classification = "confirmed_mismatch";
      evidence = "Stored courier booking amount differs from ERP due";
    } else if (storedCourierCod === null && advance > 0 && total > 0) {
      // Legacy Pathao rows did not persist amount_to_collect. They were created by the
      // pre-fix booking path that submitted gross total; the portal screenshot confirms it.
      classification = "confirmed_mismatch";
      courierCod = total;
      evidence = "Legacy pre-fix booking; gross COD pattern confirmed in courier portal";
    } else if (storedCourierCod === null && advance > 0 && total <= 0) {
      classification = "manual_review";
      evidence = "ERP total is zero; verify the courier portal amount before correction";
    }
    if (!classification) continue;

    const invoice = order.invoice_no ?? String(order.id).slice(0, 8);
    const customer = order.shipping_name ?? order.guest_name ?? "Customer";
    rows.push({
      shipmentId: shipment.id,
      orderId: order.id,
      invoice,
      brandId: shipment.brand_id,
      provider: String(shipment.provider ?? ""),
      waybill: shipment.consignment_id ?? shipment.tracking_code ?? "",
      courierStatus: shipment.status ?? "",
      customer,
      phone: order.shipping_phone ?? order.guest_phone ?? "",
      total,
      advance,
      erpDue: due,
      courierCod,
      difference: courierCod === null ? null : Math.round((courierCod - due) * 100) / 100,
      classification,
      evidence,
      smsMessage: smsText(customer, due, invoice),
    });
  }

  rows.sort((a, b) => {
    if (a.classification !== b.classification) return a.classification === "confirmed_mismatch" ? -1 : 1;
    return a.invoice.localeCompare(b.invoice);
  });
  return { scanned: latestByOrder.size, rows, auditedAt: new Date().toISOString() };
}

async function loadSmsConfig(context: ServerContext, brandId: string): Promise<SmsConfig> {
  const { data } = await context.supabase.from("app_settings").select("value").eq("key", smsConfigKey(brandId)).maybeSingle();
  if (!data?.value) return { ...SMS_DEFAULTS };
  try {
    const parsed = JSON.parse(String(data.value)) as Partial<SmsConfig>;
    return { ...SMS_DEFAULTS, ...parsed, templates: { ...SMS_DEFAULTS.templates, ...(parsed.templates ?? {}) } };
  } catch {
    return { ...SMS_DEFAULTS };
  }
}

export async function sendCodCorrectionSms(context: ServerContext, orderIds: string[]) {
  await assertDispatchAccess(context);
  const audit = await auditActiveCourierCod(context, []);
  const selected = audit.rows.filter((row) => orderIds.includes(row.orderId) && row.classification === "confirmed_mismatch");
  if (selected.length === 0) throw new Error("No confirmed COD mismatch selected");
  const { sendBulkSms } = await import("@/lib/erp/sms/sms.server");
  const configs = new Map<string, SmsConfig>();
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of selected) {
    const phone = normalizeBdPhone(row.phone);
    if (!phone) { skipped += 1; continue; }
    let config = configs.get(row.brandId);
    if (!config) {
      config = await loadSmsConfig(context, row.brandId);
      configs.set(row.brandId, config);
    }
    if (!config.api_key || !config.sender_id) { skipped += 1; continue; }
    const result = await sendBulkSms({ apiKey: config.api_key, senderId: config.sender_id, numbers: [phone], message: row.smsMessage });
    result.ok ? sent += 1 : failed += 1;
    await context.supabase.from("sms_logs").insert({
      brand_id: row.brandId,
      order_id: row.orderId,
      phone,
      message: row.smsMessage,
      template_key: "custom",
      status: result.ok ? "sent" : "failed",
      provider_response: `${result.code ?? ""} ${result.message}`.trim(),
      segments: smsSegments(row.smsMessage),
      created_by: context.userId,
    });
  }
  return { requested: selected.length, sent, failed, skipped };
}