import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/meta/oauth-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const back = (origin: string, q: string) =>
          Response.redirect(`${origin}/erp/marketing/settings?meta=${q}`, 302);
        const { verifyState, exchangeCode, metaAppCreds } = await import("@/lib/erp/marketing/meta-oauth.server");
        let origin = url.origin;
        try {
          const st = await verifyState(url.searchParams.get("state") ?? "", metaAppCreds().appSecret);
          origin = st.origin;
          if (url.searchParams.get("error")) return back(origin, "cancelled");
          const code = url.searchParams.get("code");
          if (!code) return back(origin, "error");
          const t = await exchangeCode(code, origin);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await (supabaseAdmin as any).from("mkt_meta_oauth_sessions").upsert({
            user_id: st.uid, access_token: t.token, expires_at: t.expiresAt, fb_user_name: t.name, created_at: new Date().toISOString(),
          });
          if (error) throw error;
          return back(origin, "connected");
        } catch (e) {
          console.error("Meta OAuth callback failed", e);
          return back(origin, "error");
        }
      },
    },
  },
});
