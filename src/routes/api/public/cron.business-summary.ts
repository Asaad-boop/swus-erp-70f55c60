import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled business summary.
 * Builds the closed-period snapshot (yesterday, and last month on the 1st)
 * for every enabled subscription, then pushes an SMS digest to recipients.
 *
 * Auth: `apikey`/Bearer = Supabase anon key (pg_cron pattern) OR `x-cron-secret`.
 * Body (optional): { day?: "YYYY-MM-DD", monthly?: boolean, dryRun?: boolean }
 */

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

function dhakaToday(): string {
  return new Date(Date.now() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
}
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const bdt = (v: unknown) => Math.round(num(v)).toLocaleString("en-BD");

function normalizeBdPhone(raw: string): string | null {
  const d = String(raw).replace(/\D/g, "");
  const t = d.startsWith("880") ? d.slice(3) : d.startsWith("0") ? d.slice(1) : d;
  return /^1[3-9]\d{8}$/.test(t) ? `01${t.slice(1)}` : null;
}

type SummaryLike = Record<string, unknown>;

function buildMessage(label: string, delivered: SummaryLike, cash: SummaryLike) {
  const rev = num(delivered.total_revenue ?? delivered.net_revenue);
  return [
    `${label} summary`,
    `Revenue ${bdt(rev)} | Delivered ${num(delivered.delivered_orders)}`,
    `Orders ${num(delivered.orders_placed)} | Units ${num(delivered.units_sold)}`,
    `Profit ${bdt(delivered.contribution_profit)} | Return ${num(delivered.returned_orders)}`,
    `Cash in ${bdt(cash.cash_in)} | out ${bdt(cash.cash_out)}`,
  ].join("\n");
}

export const Route = createFileRoute("/api/public/cron/business-summary")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SECRET;
        const anon =
          process.env.SUPABASE_PUBLISHABLE_KEY ??
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
          import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const apikey =
          request.headers.get("apikey") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        const cronHeader = request.headers.get("x-cron-secret");
        const ok = (anon && apikey && apikey === anon) || (expected && cronHeader === expected);
        if (!ok) return new Response("Unauthorized", { status: 401 });

        let body: { day?: string; monthly?: boolean; dryRun?: boolean } = {};
        try {
          body = await request.json();
        } catch {
          /* empty body OK */
        }

        const { tryGetSupabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = tryGetSupabaseAdmin();
        if (!admin) return Response.json({ skipped: true, reason: "Supabase admin client unavailable" });

        const today = dhakaToday();
        const day = body.day ?? addDays(today, -1);
        const runMonthly = body.monthly ?? today.endsWith("-01");
        const monthStart = `${addDays(today, -1).slice(0, 7)}-01`;

        const { data: subs, error: subErr } = await admin
          .from("rpt_subscriptions")
          .select("*")
          .eq("enabled", true);
        if (subErr) return Response.json({ error: subErr.message }, { status: 500 });

        // Always keep an all-brand daily archive even without subscribers.
        const { data: brands } = await admin.from("brands").select("id");
        const allBrandIds = (brands ?? []).map((b: { id: string }) => b.id);

        const jobs: Array<{ type: "day" | "month"; start: string; brandIds: string[]; sub?: any }> = [
          { type: "day", start: day, brandIds: allBrandIds },
        ];
        if (runMonthly) jobs.push({ type: "month", start: monthStart, brandIds: allBrandIds });
        for (const s of subs ?? []) {
          const ids: string[] = (s.brand_ids ?? []).length ? s.brand_ids : allBrandIds;
          if (s.frequency === "daily") jobs.push({ type: "day", start: day, brandIds: ids, sub: s });
          else if (s.frequency === "monthly" && runMonthly)
            jobs.push({ type: "month", start: monthStart, brandIds: ids, sub: s });
        }

        const results: unknown[] = [];
        for (const job of jobs) {
          const { data: snap, error } = await admin.rpc("rpt_build_snapshot", {
            _period_type: job.type,
            _period_start: job.start,
            _brand_ids: job.brandIds,
          } as never);
          if (error) {
            results.push({ job: job.type, start: job.start, error: error.message });
            continue;
          }
          const payload = ((snap as any)?.payload ?? {}) as Record<string, SummaryLike>;
          const delivered = payload.delivered ?? {};
          const cash = payload.cash ?? {};

          if (!job.sub) {
            results.push({ job: job.type, start: job.start, snapshot: true });
            continue;
          }

          const label = job.type === "day" ? job.start : job.start.slice(0, 7);
          const message = buildMessage(label, delivered, cash);
          const numbers = (job.sub.recipients ?? [])
            .map((n: string) => normalizeBdPhone(n))
            .filter((n: string | null): n is string => !!n);

          if (job.sub.channel !== "sms" || numbers.length === 0 || body.dryRun) {
            results.push({ sub: job.sub.id, sent: false, dryRun: !!body.dryRun, message });
            if (!body.dryRun) {
              await admin
                .from("rpt_subscriptions")
                .update({ last_sent_at: new Date().toISOString(), last_result: "snapshot only" })
                .eq("id", job.sub.id);
            }
            continue;
          }

          // BulkSMSBD credentials live per brand in app_settings.
          const brandForCreds = job.brandIds[0];
          const { data: cfgRow } = await admin
            .from("app_settings")
            .select("value")
            .eq("key", `sms:bulksmsbd:${brandForCreds}`)
            .maybeSingle();
          let apiKeyCfg = "";
          let senderId = "";
          try {
            const parsed = JSON.parse(String(cfgRow?.value ?? "{}"));
            apiKeyCfg = parsed.api_key ?? "";
            senderId = parsed.sender_id ?? "";
          } catch {
            /* ignore */
          }
          if (!apiKeyCfg || !senderId) {
            await admin
              .from("rpt_subscriptions")
              .update({ last_sent_at: new Date().toISOString(), last_result: "SMS config missing" })
              .eq("id", job.sub.id);
            results.push({ sub: job.sub.id, sent: false, reason: "SMS config missing" });
            continue;
          }

          const { sendBulkSms } = await import("@/lib/erp/sms/sms.server");
          const res = await sendBulkSms({ apiKey: apiKeyCfg, senderId, numbers, message });
          await admin
            .from("rpt_subscriptions")
            .update({
              last_sent_at: new Date().toISOString(),
              last_result: res.ok ? `Sent to ${numbers.length}` : res.message,
            })
            .eq("id", job.sub.id);
          results.push({ sub: job.sub.id, sent: res.ok, message: res.message });
        }

        return Response.json({ day, monthly: runMonthly, jobs: jobs.length, results });
      },
    },
  },
});
