import { createFileRoute } from "@tanstack/react-router";

/**
 * Sends queued outbound webhooks. Called by pg_cron every minute.
 * Auth: `apikey` = Supabase anon key, or header `x-cron-secret` = CRON_SECRET.
 */
export const Route = createFileRoute("/api/public/cron/dispatch-webhooks")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SECRET;
        const anon =
          process.env.SUPABASE_PUBLISHABLE_KEY ??
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
          import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const apikey =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        const cronHeader = request.headers.get("x-cron-secret");
        const ok = (anon && apikey && apikey === anon) || (expected && cronHeader === expected);
        if (!ok) return new Response("Unauthorized", { status: 401 });

        let body: { limit?: number } = {};
        try {
          body = await request.json();
        } catch {
          /* empty body OK */
        }

        const { tryGetSupabaseAdmin } = await import("@/integrations/supabase/client.server");
        const supabaseAdmin = tryGetSupabaseAdmin();
        if (!supabaseAdmin) {
          return Response.json({ skipped: true, reason: "Supabase admin client unavailable" });
        }

        const { dispatchPendingWebhooks } = await import("@/lib/erp/integrations/webhooks.server");
        const result = await dispatchPendingWebhooks(supabaseAdmin, { limit: body.limit ?? 40 });
        return Response.json(result);
      },
    },
  },
});
