import { createFileRoute } from "@tanstack/react-router";

/**
 * Inbox webhook — Messenger, Instagram DM and WhatsApp all post here.
 * Meta App → Webhooks → Callback URL: https://<erp-domain>/api/public/inbox/webhook
 * Verify token: shown in ERP → Inbox → Channels.
 * Every POST must carry a valid X-Hub-Signature-256 (HMAC of the body with META_APP_SECRET).
 */
export const Route = createFileRoute("/api/public/inbox/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (!mode) return new Response("Inbox webhook OK", { status: 200 });
        try {
          const { inboxVerifyToken } = await import("@/lib/erp/inbox/meta.server");
          if (mode === "subscribe" && token && token === (await inboxVerifyToken())) {
            return new Response(challenge ?? "", {
              status: 200,
              headers: { "Content-Type": "text/plain" },
            });
          }
        } catch (e) {
          console.error("[inbox webhook] verify failed", e);
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const raw = await request.text();
        const { verifyMetaSignature } = await import("@/lib/erp/inbox/meta.server");
        let valid = false;
        try {
          valid = await verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"));
        } catch (e) {
          console.error("[inbox webhook] signature check unavailable", e);
        }
        if (!valid) return new Response("Invalid signature", { status: 401 });

        let payload: any;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const { tryGetSupabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin: any = tryGetSupabaseAdmin();
        if (!admin) return new Response("Admin client unavailable", { status: 500 });

        try {
          const { processInboxWebhook } = await import("@/lib/erp/inbox/webhook.server");
          await processInboxWebhook(admin, payload);
          return new Response("EVENT_RECEIVED", { status: 200 });
        } catch (e: any) {
          console.error("[inbox webhook] processing failed", e?.message ?? e);
          await admin.from("inbox_webhook_events").insert({
            object: payload?.object ?? null,
            payload,
            error: String(e?.message ?? e).slice(0, 1000),
          });
          // 200 so Meta does not disable the subscription; the raw event is kept for replay.
          return new Response("EVENT_RECEIVED", { status: 200 });
        }
      },
    },
  },
});
