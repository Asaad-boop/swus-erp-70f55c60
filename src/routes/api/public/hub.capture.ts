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
function strArr(v: unknown, max = 8) {
  return Array.isArray(v)
    ? (v.map((x) => str(x, 2000)).filter(Boolean) as string[]).slice(0, max)
    : [];
}
function hostOf(u: string | null) {
  if (!u) return null;
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
function faviconFor(u: string | null) {
  const h = hostOf(u);
  return h ? `https://www.google.com/s2/favicons?sz=64&domain=${h}` : null;
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

        const action = str(payload.action, 20);

        /* ------------------------------- login ------------------------------ */
        // Email + password sign-in for the Synq extension. Mints a capture
        // token for the authenticated user so no manual token copy is needed.
        if (action === "login") {
          const email = str(payload.email, 200);
          const password = str(payload.password, 200);
          if (!email || !password) return json({ error: "Email ও password দাও" }, 400);

          const { createClient } = await import("@supabase/supabase-js");
          const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
          const anon =
            process.env["SUPABASE_PUBLISHABLE_KEY"] ||
            process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
            process.env["SUPABASE_ANON_KEY"];
          if (!url || !anon) return json({ error: "Server misconfigured" }, 500);

          const authClient = createClient(url, anon, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: signIn, error: signErr } = await authClient.auth.signInWithPassword({
            email,
            password,
          });
          if (signErr || !signIn?.user) {
            return json({ error: "ভুল email বা password" }, 401);
          }
          const userId = signIn.user.id;

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Brands this user can use.
          const { data: brandIdsRaw } = await supabaseAdmin.rpc("get_user_brand_ids", {
            _user_id: userId,
          } as never);
          const ids = (brandIdsRaw ?? []) as string[];
          const { data: brands } = await supabaseAdmin
            .from("brands")
            .select("id,name")
            .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
            .eq("is_active", true)
            .order("name");

          // Reuse a single device token per user for the extension.
          const raw = Array.from(crypto.getRandomValues(new Uint8Array(24)))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          const hash = createHash("sha256").update(raw).digest("hex");
          const { error: insErr } = await supabaseAdmin.from("hub_capture_tokens").insert({
            user_id: userId,
            label: "Synq extension",
            token_hash: hash,
            token_hint: `${raw.slice(0, 4)}…${raw.slice(-4)}`,
            default_brand_id: (brands ?? [])[0]?.id ?? null,
          } as never);
          if (insErr) return json({ error: insErr.message }, 400);

          return json({
            ok: true,
            token: raw,
            email: signIn.user.email,
            brands: brands ?? [],
            default_brand_id: (brands ?? [])[0]?.id ?? null,
          });
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

        /* ------------------------------ logout ------------------------------ */
        if (action === "logout") {
          await supabaseAdmin
            .from("hub_capture_tokens")
            .update({ is_active: false })
            .eq("id", t.id);
          return json({ ok: true });
        }

        // Brands this token's owner can use.
        const { data: brandIdsRaw } = await supabaseAdmin.rpc("get_user_brand_ids", {
          _user_id: t.user_id,
        } as never);
        const allowedBrandIds = (brandIdsRaw ?? []) as string[];

        /* ------------------------------- meta ------------------------------- */
        if (action === "meta") {
          const [{ data: brands }, { data: comps }] = await Promise.all([
            supabaseAdmin
              .from("brands")
              .select("id,name")
              .in("id", allowedBrandIds.length ? allowedBrandIds : ["00000000-0000-0000-0000-000000000000"])
              .eq("is_active", true)
              .order("name"),
            supabaseAdmin
              .from("hub_competitors")
              .select("id,name")
              .order("name")
              .limit(200),
          ]);
          return json({
            ok: true,
            brands: brands ?? [],
            competitors: comps ?? [],
            default_brand_id: t.default_brand_id,
          });
        }

        /* ------------------------------- save ------------------------------- */
        const kind = str(payload.kind, 20) ?? "idea";
        const url = str(payload.url, 2000);
        const title = str(payload.title, 300);
        const image = str(payload.image_url, 2000);
        const images = strArr(payload.images, 8);
        const note = str(payload.note, 2000);
        const tags = strArr(payload.tags, 12).map((x) => x.slice(0, 40));
        const platform = str(payload.platform, 40);
        const priceRaw = Number(payload.price);
        const price = Number.isFinite(priceRaw) && priceRaw > 0 ? priceRaw : null;

        const requestedBrand = str(payload.brand_id, 60);
        const brandId =
          requestedBrand && allowedBrandIds.includes(requestedBrand)
            ? requestedBrand
            : t.default_brand_id;

        if (!title && !url) return json({ error: "title or url required" }, 400);

        /** Find or create the rival page for this site. */
        async function resolveCompetitor(): Promise<string | null> {
          const given = str(payload.competitor_id, 60);
          if (given) return given;
          const cUrl = str(payload.competitor_url, 2000) ?? url;
          const host = hostOf(cUrl);
          const name = str(payload.competitor_name, 160) ?? host;
          if (!name) return null;

          const { data: existing } = await supabaseAdmin
            .from("hub_competitors")
            .select("id")
            .ilike("name", name)
            .limit(1)
            .maybeSingle();
          if (existing) return (existing as { id: string }).id;

          const social =
            platform === "facebook"
              ? { facebook_url: cUrl }
              : platform === "instagram"
                ? { instagram_url: cUrl }
                : platform === "tiktok"
                  ? { tiktok_url: cUrl }
                  : { website_url: cUrl };

          const { data: created } = await supabaseAdmin
            .from("hub_competitors")
            .insert({
              brand_id: brandId,
              name,
              favicon_url: faviconFor(cUrl),
              tags,
              created_by: t.user_id,
              ...social,
            } as never)
            .select("id")
            .single();
          return created ? (created as { id: string }).id : null;
        }

        let inserted: { id: string } | null = null;
        let savedKind = kind;

        if (kind === "competitor" || kind === "rival") {
          savedKind = "competitor";
          const name = str(payload.name, 160) ?? str(payload.competitor_name, 160) ?? hostOf(url);
          if (!name) return json({ error: "name required" }, 400);
          const social =
            platform === "facebook"
              ? { facebook_url: url }
              : platform === "instagram"
                ? { instagram_url: url }
                : platform === "tiktok"
                  ? { tiktok_url: url }
                  : { website_url: url };
          const { data, error } = await supabaseAdmin
            .from("hub_competitors")
            .insert({
              brand_id: brandId,
              name,
              note,
              tags,
              favicon_url: faviconFor(url),
              logo_url: image,
              created_by: t.user_id,
              ...social,
            } as never)
            .select("id")
            .single();
          if (error) return json({ error: error.message }, 400);
          inserted = data as { id: string };
        } else if (kind === "swipe" || kind === "content" || kind === "competitor_asset") {
          savedKind = "swipe";
          const competitorId = await resolveCompetitor();
          const { data, error } = await supabaseAdmin
            .from("hub_competitor_assets")
            .insert({
              brand_id: brandId,
              competitor_id: competitorId,
              asset_type: str(payload.asset_type, 20) ?? "ad",
              platform,
              title,
              url,
              image_url: image,
              thumbnail_url: image,
              price,
              offer: str(payload.offer, 300),
              hook: str(payload.hook, 300),
              note,
              tags,
              captured_by: t.user_id,
            } as never)
            .select("id")
            .single();
          if (error) return json({ error: error.message }, 400);
          inserted = data as { id: string };
        } else {
          savedKind = "idea";
          const gallery = images.length ? images : image ? [image] : [];
          const { data, error } = await supabaseAdmin
            .from("hub_product_ideas")
            .insert({
              brand_id: brandId,
              title: title ?? url ?? "Untitled idea",
              source_url: url,
              supplier_url: platform === "supplier" ? url : null,
              image_url: image ?? gallery[0] ?? null,
              images: gallery,
              notes: note,
              tags,
              est_sell_price: price ?? 0,
              status: "idea",
              created_by: t.user_id,
            } as never)
            .select("id")
            .single();
          if (error) return json({ error: error.message }, 400);
          inserted = data as { id: string };
        }

        await supabaseAdmin
          .from("hub_capture_tokens")
          .update({ last_used_at: new Date().toISOString(), use_count: (t.use_count ?? 0) + 1 })
          .eq("id", t.id);

        return json({ ok: true, kind: savedKind, id: inserted?.id });
      },
    },
  },
});
