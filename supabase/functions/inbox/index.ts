/**
 * Inbox edge function — everything that needs secrets runs here, with the
 * service role Supabase gives every edge function automatically.
 *
 *   GET/POST /functions/v1/inbox/webhook         Meta webhook (Messenger, Instagram, WhatsApp)
 *   GET      /functions/v1/inbox/oauth-callback  Facebook login return
 *   POST     /functions/v1/inbox                 ERP API: { action, ...payload } with the user's JWT
 *
 * Deployed with verify_jwt = false: the webhook and OAuth return come from Meta,
 * and the API checks the caller's JWT itself.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  graphGet,
  INBOX_GRAPH_VERSION,
  INBOX_SCOPES,
  listManagedPages,
  sendPlatformMessage,
  signState,
  subscribePage,
  verifyMetaSignature,
  verifyState,
} from "./meta.ts";
import { processInboxWebhook } from "./webhook.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const FN_BASE = `${SUPABASE_URL}/functions/v1/inbox`;
const REDIRECT_URI = `${FN_BASE}/oauth-callback`;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

type Settings = {
  meta_app_id: string | null;
  meta_app_secret: string | null;
  verify_token: string;
};

async function loadSettings(): Promise<Settings> {
  const { data, error } = await admin
    .from("inbox_settings")
    .select("meta_app_id, meta_app_secret, verify_token")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("inbox_settings row missing");
  return data as Settings;
}

function requireApp(s: Settings) {
  if (!s.meta_app_id || !s.meta_app_secret)
    throw new Error("Meta App ID / Secret ekhono save kora hoy nai (Channels → Step 1)");
  return { appId: s.meta_app_id, appSecret: s.meta_app_secret };
}

async function graphRaw(path: string, params: Record<string, string>) {
  const r = await fetch(
    `https://graph.facebook.com/${INBOX_GRAPH_VERSION}${path}?${new URLSearchParams(params)}`,
  );
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) throw new Error(j?.error?.message || `Meta ${r.status}`);
  return j;
}

// ════════════════════════════════════════════════════════════════════
// Webhook
// ════════════════════════════════════════════════════════════════════
async function handleWebhook(req: Request, url: URL) {
  const settings = await loadSettings();
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    if (!mode) return new Response("Inbox webhook OK", { status: 200 });
    if (
      mode === "subscribe" &&
      url.searchParams.get("hub.verify_token") === settings.verify_token
    ) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new Response("Forbidden", { status: 403 });
  }

  const raw = await req.text();
  if (!settings.meta_app_secret) return new Response("Not configured", { status: 503 });
  const valid = await verifyMetaSignature(
    raw,
    req.headers.get("x-hub-signature-256"),
    settings.meta_app_secret,
  );
  if (!valid) return new Response("Invalid signature", { status: 401 });

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  try {
    await processInboxWebhook(admin, payload, settings.meta_app_id);
  } catch (e: any) {
    console.error("[inbox webhook]", e?.message ?? e);
    await admin.from("inbox_webhook_events").insert({
      object: payload?.object ?? null,
      payload,
      error: String(e?.message ?? e).slice(0, 1000),
    });
  }
  // Always 200 so Meta keeps the subscription alive; failures are kept for replay.
  return new Response("EVENT_RECEIVED", { status: 200 });
}

// ════════════════════════════════════════════════════════════════════
// OAuth return
// ════════════════════════════════════════════════════════════════════
async function handleOAuthCallback(url: URL) {
  let origin = "";
  const back = (q: string) =>
    origin
      ? Response.redirect(`${origin}/erp/inbox?tab=channels&meta=${q}`, 302)
      : new Response(`Facebook login: ${q}. Ei tab bondho kore ERP te fire jao.`, { status: 200 });
  try {
    const { appId, appSecret } = requireApp(await loadSettings());
    const st = await verifyState(url.searchParams.get("state") ?? "", appSecret);
    origin = st.origin;
    if (url.searchParams.get("error")) return back("cancelled");
    const code = url.searchParams.get("code");
    if (!code) return back("error");
    const short = await graphRaw("/oauth/access_token", {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: REDIRECT_URI,
      code,
    });
    const long = await graphRaw("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: short.access_token,
    });
    const me = await graphRaw("/me", { fields: "name", access_token: long.access_token }).catch(
      () => ({ name: null }),
    );
    const { error } = await admin.from("inbox_oauth_sessions").upsert({
      user_id: st.uid,
      access_token: long.access_token,
      expires_at: long.expires_in
        ? new Date(Date.now() + long.expires_in * 1000).toISOString()
        : null,
      fb_user_name: me?.name ?? null,
      created_at: new Date().toISOString(),
    });
    if (error) throw error;
    return back("connected");
  } catch (e) {
    console.error("[inbox oauth]", e);
    return back("error");
  }
}

// ════════════════════════════════════════════════════════════════════
// ERP API
// ════════════════════════════════════════════════════════════════════
type Caller = { userId: string; isAdmin: boolean; db: any };

async function getCaller(req: Request): Promise<Caller> {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) throw new Error("Unauthorized");
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) throw new Error("Unauthorized");
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", data.user.id);
  const isAdmin = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "owner");
  const db = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { userId: data.user.id, isAdmin, db };
}

function needAdmin(c: Caller) {
  if (!c.isAdmin) throw new Error("Admin or owner only");
}

const isDigits = (v: unknown) => typeof v === "string" && /^\d+$/.test(v);
const isUuid = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

async function upsertChannel(
  row: {
    brand_id: string;
    platform: string;
    external_id: string;
    page_id: string | null;
    name: string;
    username?: string | null;
    avatar_url?: string | null;
    created_by: string;
  },
  token: string,
) {
  const { data, error } = await admin
    .from("inbox_channels")
    .upsert(
      { ...row, is_active: true, last_error: null, updated_at: new Date().toISOString() },
      { onConflict: "platform,external_id" },
    )
    .select("id")
    .single();
  if (error) throw error;
  const { error: sErr } = await admin
    .from("inbox_channel_secrets")
    .upsert({ channel_id: data.id, access_token: token, updated_at: new Date().toISOString() });
  if (sErr) throw sErr;
  return data.id as string;
}

function previewFor(text: string | null, attachmentType?: string | null) {
  const t = (text ?? "").trim();
  if (t) return t.slice(0, 140);
  return attachmentType === "image"
    ? "📷 Photo"
    : attachmentType === "video"
      ? "🎬 Video"
      : attachmentType === "audio"
        ? "🎤 Voice"
        : "📎 File";
}

const actions: Record<string, (c: Caller, p: any) => Promise<unknown>> = {
  async setup_info(c, p) {
    needAdmin(c);
    const s = await loadSettings();
    const [{ data: sess }, { data: lastErr }] = await Promise.all([
      admin
        .from("inbox_oauth_sessions")
        .select("fb_user_name, expires_at")
        .eq("user_id", c.userId)
        .maybeSingle(),
      admin
        .from("inbox_webhook_events")
        .select("error, received_at")
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    void p;
    return {
      appConfigured: Boolean(s.meta_app_id && s.meta_app_secret),
      appId: s.meta_app_id,
      callbackUrl: `${FN_BASE}/webhook`,
      verifyToken: s.verify_token,
      redirectUri: REDIRECT_URI,
      fbSession: sess ? { name: sess.fb_user_name, expiresAt: sess.expires_at } : null,
      lastWebhookError: lastErr ? { error: lastErr.error, at: lastErr.received_at } : null,
    };
  },

  async save_app(c, p) {
    needAdmin(c);
    const appId = String(p?.appId ?? "").trim();
    const appSecret = String(p?.appSecret ?? "").trim();
    if (!isDigits(appId)) throw new Error("App ID shudhu number");
    if (!/^[0-9a-f]{32}$/i.test(appSecret))
      throw new Error("App Secret 32 character er hoy (App settings → Basic)");
    // Proves the pair is valid before saving.
    await graphRaw("/oauth/access_token", {
      client_id: appId,
      client_secret: appSecret,
      grant_type: "client_credentials",
    });
    const { error } = await admin
      .from("inbox_settings")
      .update({
        meta_app_id: appId,
        meta_app_secret: appSecret,
        updated_by: c.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) throw error;
    return { ok: true };
  },

  async login_url(c, p) {
    needAdmin(c);
    const { appId, appSecret } = requireApp(await loadSettings());
    const origin = new URL(String(p?.origin)).origin;
    const state = await signState(
      { uid: c.userId, origin, exp: Date.now() + 10 * 60_000 },
      appSecret,
    );
    const q = new URLSearchParams({
      client_id: appId,
      redirect_uri: REDIRECT_URI,
      state,
      scope: INBOX_SCOPES,
      response_type: "code",
    });
    return { url: `https://www.facebook.com/${INBOX_GRAPH_VERSION}/dialog/oauth?${q}` };
  },

  async list_pages(c) {
    needAdmin(c);
    const { data: sess } = await admin
      .from("inbox_oauth_sessions")
      .select("access_token")
      .eq("user_id", c.userId)
      .maybeSingle();
    if (!sess) return { connected: false, pages: [] };
    const pages = await listManagedPages(sess.access_token);
    const { data: existing } = await admin
      .from("inbox_channels")
      .select("platform, external_id, brand_id, is_active");
    const have = new Map<string, any>(
      (existing ?? []).map((r: any) => [`${r.platform}:${r.external_id}`, r]),
    );
    return {
      connected: true,
      pages: pages.map((pg) => ({
        id: pg.id,
        name: pg.name,
        picture: pg.picture,
        instagram: pg.instagram,
        messengerConnected: have.get(`messenger:${pg.id}`)?.is_active ?? false,
        instagramConnected: pg.instagram
          ? (have.get(`instagram:${pg.instagram.id}`)?.is_active ?? false)
          : false,
        brandId:
          have.get(`messenger:${pg.id}`)?.brand_id ??
          (pg.instagram ? have.get(`instagram:${pg.instagram.id}`)?.brand_id : undefined) ??
          null,
      })),
    };
  },

  async connect_pages(c, p) {
    needAdmin(c);
    const picks: any[] = Array.isArray(p?.pages) ? p.pages.slice(0, 50) : [];
    if (picks.length === 0) throw new Error("Kono page select kora hoy nai");
    const { data: sess } = await admin
      .from("inbox_oauth_sessions")
      .select("access_token")
      .eq("user_id", c.userId)
      .maybeSingle();
    if (!sess) throw new Error("Age Facebook diye login koro");
    // Page tokens always come from Meta here, never from the browser.
    const pages = new Map((await listManagedPages(sess.access_token)).map((pg) => [pg.id, pg]));
    const results: Array<{ pageId: string; ok: boolean; error?: string }> = [];
    for (const pick of picks) {
      if (!isDigits(pick?.pageId) || !isUuid(pick?.brandId)) continue;
      const page = pages.get(pick.pageId);
      if (!page) {
        results.push({
          pageId: pick.pageId,
          ok: false,
          error: "Page not found for this Facebook login",
        });
        continue;
      }
      try {
        if (pick.messenger) {
          await upsertChannel(
            {
              brand_id: pick.brandId,
              platform: "messenger",
              external_id: page.id,
              page_id: page.id,
              name: page.name,
              avatar_url: page.picture,
              created_by: c.userId,
            },
            page.access_token,
          );
        }
        if (pick.instagram && page.instagram) {
          await upsertChannel(
            {
              brand_id: pick.brandId,
              platform: "instagram",
              external_id: page.instagram.id,
              page_id: page.id,
              name: page.instagram.name || page.instagram.username || `${page.name} (IG)`,
              username: page.instagram.username,
              avatar_url: page.instagram.picture,
              created_by: c.userId,
            },
            page.access_token,
          );
        }
        if (pick.messenger || pick.instagram) await subscribePage(page.id, page.access_token);
        results.push({ pageId: pick.pageId, ok: true });
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        await admin
          .from("inbox_channels")
          .update({ last_error: msg.slice(0, 500) })
          .eq("page_id", page.id);
        results.push({ pageId: pick.pageId, ok: false, error: msg });
      }
    }
    return { results };
  },

  async connect_manual(c, p) {
    needAdmin(c);
    const platform = String(p?.platform);
    if (!["messenger", "instagram", "whatsapp"].includes(platform)) throw new Error("Bad platform");
    if (!isUuid(p?.brandId)) throw new Error("Brand select koro");
    const externalId = String(p?.externalId ?? "").trim();
    if (!isDigits(externalId)) throw new Error("ID shudhu number hobe");
    const token = String(p?.token ?? "").trim();
    if (token.length < 20) throw new Error("Token thik nai");
    let name: string | null = String(p?.name ?? "").trim() || null;
    let username: string | null = null;
    let pageId: string | null = String(p?.pageId ?? "").trim() || null;

    if (platform === "whatsapp") {
      const j = await graphGet(`/${externalId}`, token, {
        fields: "display_phone_number,verified_name",
      });
      name =
        name || [j.verified_name, j.display_phone_number].filter(Boolean).join(" · ") || "WhatsApp";
      username = j.display_phone_number ?? null;
      pageId = null;
    } else if (platform === "messenger") {
      const j = await graphGet(`/${externalId}`, token, { fields: "name" });
      name = name || j.name;
      pageId = externalId;
    } else {
      if (!pageId || !isDigits(pageId))
        throw new Error("Instagram er jonno linked Facebook Page ID lagbe");
      const j = await graphGet(`/${externalId}`, token, { fields: "username,name" });
      name = name || j.name || j.username;
      username = j.username ?? null;
    }

    const id = await upsertChannel(
      {
        brand_id: p.brandId,
        platform,
        external_id: externalId,
        page_id: pageId,
        name: name || platform,
        username,
        created_by: c.userId,
      },
      token,
    );
    if (platform !== "whatsapp" && pageId) {
      try {
        await subscribePage(pageId, token);
      } catch (e: any) {
        await admin
          .from("inbox_channels")
          .update({ last_error: String(e?.message ?? e).slice(0, 500) })
          .eq("id", id);
      }
    }
    return { id };
  },

  async disconnect(c, p) {
    needAdmin(c);
    if (!isUuid(p?.channelId)) throw new Error("Bad channel");
    await admin.from("inbox_channel_secrets").delete().eq("channel_id", p.channelId);
    const { error } = await admin
      .from("inbox_channels")
      .update({ is_active: false })
      .eq("id", p.channelId);
    if (error) throw error;
    return { ok: true };
  },

  async send(c, p) {
    if (!isUuid(p?.conversationId)) throw new Error("Bad conversation");
    const text: string | null =
      typeof p?.text === "string" && p.text.trim() ? p.text.trim().slice(0, 2000) : null;
    const att =
      p?.attachment &&
      typeof p.attachment.url === "string" &&
      /^https:\/\//.test(p.attachment.url) &&
      ["image", "video", "audio", "file"].includes(p.attachment.type)
        ? {
            type: p.attachment.type as "image" | "video" | "audio" | "file",
            url: String(p.attachment.url),
          }
        : null;
    if (!text && !att) throw new Error("Message is empty");
    const retryOf = isUuid(p?.retryOfMessageId) ? String(p.retryOfMessageId) : null;

    // RLS on the caller's own client is the access check.
    const { data: conv, error: cErr } = await c.db
      .from("inbox_conversations")
      .select("id, brand_id, channel_id, platform, external_user_id, last_inbound_at")
      .eq("id", p.conversationId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!conv) throw new Error("Conversation not found");

    const [{ data: channel }, { data: secret }] = await Promise.all([
      admin
        .from("inbox_channels")
        .select("id, platform, external_id, page_id, is_active")
        .eq("id", conv.channel_id)
        .maybeSingle(),
      admin
        .from("inbox_channel_secrets")
        .select("access_token")
        .eq("channel_id", conv.channel_id)
        .maybeSingle(),
    ]);
    if (!channel || !channel.is_active)
      throw new Error("Ei channel ta disconnected — Channels tab theke abar connect koro");
    if (!secret?.access_token)
      throw new Error("Channel token nai — Channels tab theke abar connect koro");

    const attachments = att ? [att] : [];
    const msgType = att?.type ?? "text";
    let messageId: string | null = null;
    try {
      const r = await sendPlatformMessage({
        platform: channel.platform,
        senderId:
          channel.platform === "whatsapp"
            ? channel.external_id
            : (channel.page_id ?? channel.external_id),
        token: secret.access_token,
        recipientId: conv.external_user_id,
        text,
        attachment: att,
        lastInboundAt: conv.last_inbound_at,
      });
      messageId = r.messageId;
    } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 500);
      if (retryOf) {
        await admin.from("inbox_messages").update({ error: msg }).eq("id", retryOf);
      } else {
        await admin.from("inbox_messages").insert({
          conversation_id: conv.id,
          brand_id: conv.brand_id,
          direction: "out",
          msg_type: msgType,
          body: text,
          attachments,
          sent_by: c.userId,
          sent_via: "erp",
          status: "failed",
          error: msg,
        });
      }
      throw new Error(msg);
    }

    const { error: insErr } = await admin.from("inbox_messages").insert({
      conversation_id: conv.id,
      brand_id: conv.brand_id,
      direction: "out",
      external_message_id: messageId,
      msg_type: msgType,
      body: text,
      attachments,
      sent_by: c.userId,
      sent_via: "erp",
      status: "sent",
    });
    if (insErr) {
      // The platform echo got here first — claim that row as ours.
      if ((insErr as any).code === "23505" && messageId) {
        await admin
          .from("inbox_messages")
          .update({ sent_by: c.userId, sent_via: "erp" })
          .eq("external_message_id", messageId);
      } else throw insErr;
    }
    if (retryOf)
      await admin.from("inbox_messages").delete().eq("id", retryOf).eq("status", "failed");
    await admin
      .from("inbox_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: previewFor(text, att?.type),
        last_message_direction: "out",
        unread_count: 0,
      })
      .eq("id", conv.id);
    if (isUuid(p?.quickReplyId)) await c.db.rpc("inbox_bump_quick_reply", { _id: p.quickReplyId });
    return { ok: true, messageId };
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const sub = url.pathname.replace(/^.*?\/inbox/, "") || "/";

  try {
    if (sub.startsWith("/webhook")) return await handleWebhook(req, url);
    if (sub.startsWith("/oauth-callback")) return await handleOAuthCallback(url);
    if (req.method !== "POST") return new Response("Inbox OK", { status: 200, headers: CORS });

    const body = await req.json().catch(() => ({}));
    const fn = actions[String(body?.action)];
    if (!fn) return json({ ok: false, error: "Unknown action" }, 400);
    const caller = await getCaller(req);
    const result = await fn(caller, body);
    return json({ ok: true, data: result });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    return json({ ok: false, error: msg }, msg === "Unauthorized" ? 401 : 200);
  }
});
