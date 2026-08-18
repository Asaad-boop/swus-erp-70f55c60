import { createFileRoute } from "@tanstack/react-router";

/**
 * Re-apply InstaPay invoices whose webhook rows landed with zero amounts.
 * POST { invoice_ids: string[] } with header `x-cron-secret: $CRON_SECRET`.
 */
export const Route = createFileRoute("/api/public/instapay/backfill")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["CRON_SECRET"];
        if (!secret || request.headers.get("x-cron-secret") !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        let body: any = {};
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const ids: string[] = Array.isArray(body?.invoice_ids) ? body.invoice_ids.map(String) : [];
        if (!ids.length) return Response.json({ ok: false, error: "invoice_ids required" }, { status: 400 });

        const { tryGetSupabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = tryGetSupabaseAdmin();
        if (!admin) return Response.json({ ok: false, error: "admin client unavailable" }, { status: 500 });

        const { backfillInstapayInvoice } = await import("@/lib/erp/instapay.server");
        const results: any[] = [];
        for (const id of ids) {
          try {
            results.push(await backfillInstapayInvoice(admin, id));
          } catch (e: any) {
            results.push({ ok: false, invoiceId: id, error: String(e?.message ?? e) });
          }
        }
        return Response.json({ ok: true, results });
      },
    },
  },
});
