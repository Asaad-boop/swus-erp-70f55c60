import { createFileRoute } from "@tanstack/react-router";

/**
 * Auto-sync Pathao payout invoices → reconciliation runs.
 * Schedule (pg_cron / external):
 *   GET https://swus-erp.lovable.app/api/public/cron/sync-pathao-invoices?key=<CRON_SECRET>
 */
async function run(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const secret = process.env["CRON_SECRET"];
  if (!secret) {
    return Response.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 503 });
  }
  if (url.searchParams.get("key") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { tryGetSupabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = tryGetSupabaseAdmin();
  if (!admin) return Response.json({ ok: false, error: "Supabase admin client unavailable" });

  const lookback = Number(url.searchParams.get("days") ?? "") || undefined;

  // ?mode=resync → only repair zero-payout InstaPay runs (cheap, run often).
  if (url.searchParams.get("mode") === "resync") {
    const { resyncZeroPayoutInstapay } = await import("@/lib/erp/instapay-resync.server");
    return Response.json(await resyncZeroPayoutInstapay(admin, {}));
  }

  const { runPathaoAutoSync } = await import("@/lib/erp/pathao-autosync.server");
  const res = await runPathaoAutoSync(admin, { lookbackDays: lookback });
  return Response.json(res);
}

export const Route = createFileRoute("/api/public/cron/sync-pathao-invoices")({
  server: { handlers: { GET: ({ request }) => run(request), POST: ({ request }) => run(request) } },
});
