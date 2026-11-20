import { createFileRoute } from "@tanstack/react-router";

/** Facebook login return for Inbox → Channels → "Connect Facebook pages". */
export const Route = createFileRoute("/api/public/inbox/oauth-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const back = (origin: string, q: string) =>
          Response.redirect(`${origin}/erp/inbox?tab=channels&meta=${q}`, 302);
        const { verifyState } = await import("@/lib/erp/marketing/meta-oauth.server");
        const { inboxAppCreds, inboxRedirectUri, INBOX_GRAPH_VERSION } =
          await import("@/lib/erp/inbox/meta.server");
        let origin = url.origin;
        try {
          const { appId, appSecret } = inboxAppCreds();
          const st = await verifyState(url.searchParams.get("state") ?? "", appSecret);
          origin = st.origin;
          if (url.searchParams.get("error")) return back(origin, "cancelled");
          const code = url.searchParams.get("code");
          if (!code) return back(origin, "error");

          const g = async (path: string, params: Record<string, string>) => {
            const r = await fetch(
              `https://graph.facebook.com/${INBOX_GRAPH_VERSION}${path}?${new URLSearchParams(params)}`,
            );
            const j: any = await r.json();
            if (!r.ok || j?.error) throw new Error(j?.error?.message || `Meta ${r.status}`);
            return j;
          };
          const short = await g("/oauth/access_token", {
            client_id: appId,
            client_secret: appSecret,
            redirect_uri: inboxRedirectUri(origin),
            code,
          });
          const long = await g("/oauth/access_token", {
            grant_type: "fb_exchange_token",
            client_id: appId,
            client_secret: appSecret,
            fb_exchange_token: short.access_token,
          });
          const me = await g("/me", { fields: "name", access_token: long.access_token }).catch(
            () => ({ name: null }),
          );

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await (supabaseAdmin as any).from("inbox_oauth_sessions").upsert({
            user_id: st.uid,
            access_token: long.access_token,
            expires_at: long.expires_in
              ? new Date(Date.now() + long.expires_in * 1000).toISOString()
              : null,
            fb_user_name: me?.name ?? null,
            created_at: new Date().toISOString(),
          });
          if (error) throw error;
          return back(origin, "connected");
        } catch (e) {
          console.error("Inbox Meta OAuth callback failed", e);
          return back(origin, "error");
        }
      },
    },
  },
});
