import { createFileRoute } from "@tanstack/react-router";
import {
  mapCourierStatus,
  normalizeCourierStatus,
  type CourierStatusMappingOverrides,
} from "@/lib/erp/courier-status-mapping";

/**
 * Pathao webhook receiver.
 * Configure in Pathao dashboard: https://swus-erp.lovable.app/api/public/webhook/pathao
 * Signature: header `X-PATHAO-Signature` must match env PATHAO_WEBHOOK_SECRET.
 * The secret MUST be configured server-side; there is no fallback default.
 */
export const Route = createFileRoute("/api/public/webhook/pathao")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sig = request.headers.get("x-pathao-signature");
        const expected = process.env.PATHAO_WEBHOOK_SECRET;
        if (!expected) {
          return Response.json({ ok: true, skipped: true, reason: "Webhook not configured" });
        }
        if (!sig || sig !== expected) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: any;
        try {
          payload = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        try {
          return await processPathao(payload, expected);
        } catch (e: any) {
          console.error("[pathao webhook] error:", e?.message ?? e, e?.stack);
          return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 200 });
        }
      },

      GET: async () => {
        return new Response("Pathao webhook OK", { status: 200 });
      },
    },
  },
});

async function processPathao(payload: any, expected: string): Promise<Response> {
        // ---- InstaPay payment invoice events -> wallet + reconciliation ----
        const { isPaymentInvoiceEvent, ingestPathaoPaymentInvoice } = await import("@/lib/erp/instapay.server");
        if (isPaymentInvoiceEvent(payload)) {
          const { tryGetSupabaseAdmin: getAdmin } = await import("@/integrations/supabase/client.server");
          const admin = getAdmin();
          if (!admin) {
            return Response.json({ ok: true, skipped: true, reason: "Supabase admin client unavailable" });
          }
          const res = await ingestPathaoPaymentInvoice(admin, payload);
          return Response.json({ ok: true, instapay: res });
        }

        // Pathao sends: { event, consignment_id, order_status, merchant_order_id, updated_at, ... }
        const consignmentId: string | null = payload?.consignment_id ?? payload?.data?.consignment_id ?? null;
        const merchantOrderId: string | null = payload?.merchant_order_id ?? payload?.data?.merchant_order_id ?? null;
        const rawStatus: string | null = payload?.order_status ?? payload?.event ?? payload?.data?.order_status ?? null;

        if (!rawStatus || (!consignmentId && !merchantOrderId)) {
          // Pathao validates the endpoint by POSTing — always 202 OK.
          return new Response("Acknowledged", { status: 202, headers: { "X-Pathao-Merchant-Webhook-Integration-Secret": expected } });
        }

        const { tryGetSupabaseAdmin } = await import("@/integrations/supabase/client.server");
        const supabaseAdmin = tryGetSupabaseAdmin();
        if (!supabaseAdmin) {
          return Response.json({ ok: true, skipped: true, reason: "Supabase admin client unavailable" });
        }

        // Find shipment → order
        let orderId: string | null = null;
        let brandId: string | null = null;
        let currentStatus: string | null = null;

        if (consignmentId) {
          const { data: ship } = await supabaseAdmin
            .from("courier_shipments")
            .select("order_id, brand_id, orders:order_id(status)")
            .eq("consignment_id", consignmentId)
            .ilike("provider", "%pathao%")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (ship) {
            orderId = ship.order_id;
            brandId = (ship as any).brand_id ?? null;
            currentStatus = (ship as any).orders?.status ?? null;
          }
        }

        if (!orderId && merchantOrderId) {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(merchantOrderId);
          const filter = isUuid
            ? `invoice_no.eq.${merchantOrderId},id.eq.${merchantOrderId}`
            : `invoice_no.eq.${merchantOrderId}`;
          const { data: o } = await supabaseAdmin
            .from("orders")
            .select("id, status, brand_id")
            .or(filter)
            .maybeSingle();
          if (o) {
            orderId = o.id;
            brandId = o.brand_id;
            currentStatus = o.status;
          }
        }

        if (!orderId) {
          return Response.json({ ok: true, matched: false }, { status: 200 });
        }

        if (!brandId || !currentStatus) {
          const { data: o } = await supabaseAdmin
            .from("orders").select("status, brand_id").eq("id", orderId).maybeSingle();
          brandId = brandId ?? o?.brand_id ?? null;
          currentStatus = currentStatus ?? o?.status ?? null;
        }

        // Load brand mapping overrides
        let overrides: CourierStatusMappingOverrides | null = null;
        if (brandId) {
          const { data: s } = await supabaseAdmin
            .from("erp_settings").select("config").eq("brand_id", brandId).maybeSingle();
          const m = (s?.config as any)?.courier_status_mapping;
          if (m && typeof m === "object") overrides = m as CourierStatusMappingOverrides;
        }

        const mapped = mapCourierStatus("pathao", rawStatus, overrides);
        if (!mapped || mapped === currentStatus) {
          return Response.json({ ok: true, matched: true, action: "noop", raw: normalizeCourierStatus(rawStatus) });
        }

        // Route via RPC — mirrors cron path, writes order_status_history via the function itself.
        const { error: uErr } = await supabaseAdmin.rpc("transition_order_status", {
          _order_id: orderId,
          _new_status: mapped as any,
          _reason: "pathao_webhook",
          _note: `pathao: ${normalizeCourierStatus(rawStatus)}`,
        });
        if (uErr) return Response.json({ ok: false, error: uErr.message });

        return Response.json({ ok: true, matched: true, action: "updated", from: currentStatus, to: mapped });
}