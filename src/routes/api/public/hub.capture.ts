import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: CORS });

function str(v: unknown, max = 2000) {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

export const Route = createFileRoute("/api/public/hub/capture")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let payload: Record<string, unknown>;
        try {
          payload = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }

        const token = str(payload.token, 200);
        if (!token) return json({ error: "Missing token" }, 401);
        const tokenHash = createHash("sha256").update(token).digest("hex");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: tok } = await supabaseAdmin
          .from("hub_capture_tokens")
          .select("id,user_id,default_brand_id,is_active,use_count")
          .eq("token_hash", tokenHash)
          .maybeSingle();

        if (!tok || !(tok as { is_active: boolean }).is_active) {
          return json({ error: "Invalid token" }, 401);
        }
        const t = tok as {
          id: string;
          user_id: string;
          default_brand_id: string | null;
          use_count: number;
        };

        const kind = str(payload.kind, 20) ?? "idea";
        const url = str(payload.url, 2000);
        const title = str(payload.title, 300);
        const image = str(payload.image_url, 2000);
        const note = str(payload.note, 2000);
        const priceRaw = Number(payload.price);
        const price = Number.isFinite(priceRaw) && priceRaw > 0 ? priceRaw : null;

        if (!title && !url) return json({ error: "title or url required" }, 400);

        let inserted: { id: string } | null = null;

        if (kind === "competitor") {
          const { data, error } = await supabaseAdmin
            .from("hub_competitor_assets")
            .insert({
              brand_id: t.default_brand_id,
              asset_type: str(payload.asset_type, 20) ?? "ad",
              platform: str(payload.platform, 40),
              title,
              url,
              image_url: image,
              price,
              offer: str(payload.offer, 300),
              note,
              captured_by: t.user_id,
            })
            .select("id")
            .single();
          if (error) return json({ error: error.message }, 400);
          inserted = data as { id: string };
        } else {
          const { data, error } = await supabaseAdmin
            .from("hub_product_ideas")
            .insert({
              brand_id: t.default_brand_id,
              title: title ?? url ?? "Untitled idea",
              source_url: url,
              image_url: image,
              notes: note,
              est_sell_price: price ?? 0,
              status: "idea",
              created_by: t.user_id,
            })
            .select("id")
            .single();
          if (error) return json({ error: error.message }, 400);
          inserted = data as { id: string };
        }

        await supabaseAdmin
          .from("hub_capture_tokens")
          .update({ last_used_at: new Date().toISOString(), use_count: (t.use_count ?? 0) + 1 })
          .eq("id", t.id);

        return json({ ok: true, kind, id: inserted?.id });
      },
    },
  },
});
