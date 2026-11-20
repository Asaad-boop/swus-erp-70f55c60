import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function adminClient(): Promise<any> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

async function assertAdmin(supabase: any, userId: string) {
  const { assertIntegrationAdmin } = await import("@/lib/erp/integration-admin");
  await assertIntegrationAdmin(supabase, userId);
}

const attachmentSchema = z.object({
  type: z.enum(["image", "video", "audio", "file"]),
  url: z.string().url(),
});

function previewFor(text: string | null | undefined, attachmentType?: string | null) {
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

// ════════════════════════════════════════════════════════════════════
// Send a reply
// ════════════════════════════════════════════════════════════════════
export const inboxSendFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        conversationId: z.string().uuid(),
        text: z.string().max(2000).optional().nullable(),
        attachment: attachmentSchema.optional().nullable(),
        quickReplyId: z.string().uuid().optional().nullable(),
        retryOfMessageId: z.string().uuid().optional().nullable(),
      })
      .refine((v) => Boolean(v.text?.trim()) || Boolean(v.attachment), "Message is empty")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // RLS on the caller's client is the access check: no row → no access.
    const { data: conv, error: cErr } = await (context.supabase as any)
      .from("inbox_conversations")
      .select("id, brand_id, channel_id, platform, external_user_id, last_inbound_at")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!conv) throw new Error("Conversation not found");

    const admin = await adminClient();
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

    const { sendPlatformMessage } = await import("./meta.server");
    const text = data.text?.trim() || null;
    const attachments = data.attachment
      ? [{ type: data.attachment.type, url: data.attachment.url }]
      : [];
    const msgType = data.attachment?.type ?? "text";

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
        attachment: data.attachment ?? null,
        lastInboundAt: conv.last_inbound_at,
      });
      messageId = r.messageId;
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (!data.retryOfMessageId) {
        await admin.from("inbox_messages").insert({
          conversation_id: conv.id,
          brand_id: conv.brand_id,
          direction: "out",
          msg_type: msgType,
          body: text,
          attachments,
          sent_by: context.userId,
          sent_via: "erp",
          status: "failed",
          error: msg.slice(0, 500),
        });
      } else {
        await admin
          .from("inbox_messages")
          .update({ error: msg.slice(0, 500) })
          .eq("id", data.retryOfMessageId);
      }
      throw new Error(msg);
    }

    const row = {
      conversation_id: conv.id,
      brand_id: conv.brand_id,
      direction: "out",
      external_message_id: messageId,
      msg_type: msgType,
      body: text,
      attachments,
      sent_by: context.userId,
      sent_via: "erp",
      status: "sent",
    };
    const { error: insErr } = await admin.from("inbox_messages").insert(row);
    if (insErr) {
      // The platform echo got here first — claim that row as ours.
      if (insErr.code === "23505" && messageId) {
        await admin
          .from("inbox_messages")
          .update({ sent_by: context.userId, sent_via: "erp" })
          .eq("external_message_id", messageId);
      } else {
        throw insErr;
      }
    }
    if (data.retryOfMessageId) {
      await admin
        .from("inbox_messages")
        .delete()
        .eq("id", data.retryOfMessageId)
        .eq("status", "failed");
    }
    await admin
      .from("inbox_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: previewFor(text, data.attachment?.type),
        last_message_direction: "out",
        unread_count: 0,
      })
      .eq("id", conv.id);

    if (data.quickReplyId) {
      await (context.supabase as any).rpc("inbox_bump_quick_reply", { _id: data.quickReplyId });
    }
    return { ok: true, messageId };
  });

// ════════════════════════════════════════════════════════════════════
// Channels (admin / owner)
// ════════════════════════════════════════════════════════════════════
export const inboxSetupInfoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ origin: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const origin = new URL(data.origin).origin;
    const { serverEnv, inboxVerifyToken, inboxRedirectUri } = await import("./meta.server");
    const appConfigured = Boolean(serverEnv("META_APP_ID") && serverEnv("META_APP_SECRET"));
    const admin = await adminClient();
    const { data: sess } = await admin
      .from("inbox_oauth_sessions")
      .select("fb_user_name, expires_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    const { data: lastErr } = await admin
      .from("inbox_webhook_events")
      .select("error, received_at")
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      appConfigured,
      callbackUrl: `${origin}/api/public/inbox/webhook`,
      redirectUri: inboxRedirectUri(origin),
      verifyToken: appConfigured ? await inboxVerifyToken() : null,
      fbSession: sess
        ? { name: sess.fb_user_name as string | null, expiresAt: sess.expires_at as string | null }
        : null,
      lastWebhookError: lastErr
        ? { error: lastErr.error as string | null, at: lastErr.received_at as string }
        : null,
    };
  });

export const inboxMetaLoginUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ origin: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { signState } = await import("@/lib/erp/marketing/meta-oauth.server");
    const { inboxAppCreds, inboxRedirectUri, INBOX_SCOPES, INBOX_GRAPH_VERSION } =
      await import("./meta.server");
    const { appId, appSecret } = inboxAppCreds();
    const origin = new URL(data.origin).origin;
    const state = await signState(
      { uid: context.userId, origin, exp: Date.now() + 10 * 60_000 },
      appSecret,
    );
    const q = new URLSearchParams({
      client_id: appId,
      redirect_uri: inboxRedirectUri(origin),
      state,
      scope: INBOX_SCOPES,
      response_type: "code",
    });
    return { url: `https://www.facebook.com/${INBOX_GRAPH_VERSION}/dialog/oauth?${q}` };
  });

export const inboxListMetaPagesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const admin = await adminClient();
    const { data: sess } = await admin
      .from("inbox_oauth_sessions")
      .select("access_token")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!sess) return { connected: false as const, pages: [] };
    const { listManagedPages } = await import("./meta.server");
    const pages = await listManagedPages(sess.access_token);
    const { data: existing } = await admin
      .from("inbox_channels")
      .select("platform, external_id, brand_id, is_active");
    const have = new Map<string, { brand_id: string; is_active: boolean }>(
      (existing ?? []).map((r: any) => [`${r.platform}:${r.external_id}`, r]),
    );
    return {
      connected: true as const,
      pages: pages.map((p) => ({
        id: p.id,
        name: p.name,
        picture: p.picture,
        instagram: p.instagram,
        messengerConnected: have.get(`messenger:${p.id}`)?.is_active ?? false,
        instagramConnected: p.instagram
          ? (have.get(`instagram:${p.instagram.id}`)?.is_active ?? false)
          : false,
        brandId:
          have.get(`messenger:${p.id}`)?.brand_id ??
          (p.instagram ? have.get(`instagram:${p.instagram.id}`)?.brand_id : undefined) ??
          null,
      })),
    };
  });

async function upsertChannel(
  admin: any,
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

export const inboxConnectPagesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        pages: z
          .array(
            z.object({
              pageId: z.string().regex(/^\d+$/),
              brandId: z.string().uuid(),
              messenger: z.boolean(),
              instagram: z.boolean(),
            }),
          )
          .min(1)
          .max(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const admin = await adminClient();
    const { data: sess } = await admin
      .from("inbox_oauth_sessions")
      .select("access_token")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!sess) throw new Error("Age Facebook diye login koro");
    const { listManagedPages, subscribePage } = await import("./meta.server");
    // Tokens always come from Meta server-side, never from the browser.
    const pages = new Map((await listManagedPages(sess.access_token)).map((p) => [p.id, p]));

    const results: Array<{ pageId: string; ok: boolean; error?: string }> = [];
    for (const pick of data.pages) {
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
            admin,
            {
              brand_id: pick.brandId,
              platform: "messenger",
              external_id: page.id,
              page_id: page.id,
              name: page.name,
              avatar_url: page.picture,
              created_by: context.userId,
            },
            page.access_token,
          );
        }
        if (pick.instagram && page.instagram) {
          await upsertChannel(
            admin,
            {
              brand_id: pick.brandId,
              platform: "instagram",
              external_id: page.instagram.id,
              page_id: page.id,
              name: page.instagram.name || page.instagram.username || `${page.name} (IG)`,
              username: page.instagram.username,
              avatar_url: page.instagram.picture,
              created_by: context.userId,
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
  });

export const inboxConnectManualFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        platform: z.enum(["messenger", "instagram", "whatsapp"]),
        brandId: z.string().uuid(),
        externalId: z.string().regex(/^\d+$/, "ID shudhu number hobe"),
        pageId: z.string().regex(/^\d+$/).optional().nullable(),
        name: z.string().max(120).optional().nullable(),
        token: z.string().min(20).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const admin = await adminClient();
    const { graphGet, subscribePage } = await import("./meta.server");
    let name = data.name?.trim() || null;
    let username: string | null = null;
    let pageId: string | null = data.pageId ?? null;

    if (data.platform === "whatsapp") {
      const j = await graphGet(`/${data.externalId}`, data.token, {
        fields: "display_phone_number,verified_name",
      });
      name =
        name || [j.verified_name, j.display_phone_number].filter(Boolean).join(" · ") || "WhatsApp";
      username = j.display_phone_number ?? null;
    } else if (data.platform === "messenger") {
      const j = await graphGet(`/${data.externalId}`, data.token, { fields: "name" });
      name = name || j.name;
      pageId = data.externalId;
    } else {
      if (!pageId) throw new Error("Instagram er jonno linked Facebook Page ID lagbe");
      const j = await graphGet(`/${data.externalId}`, data.token, { fields: "username,name" });
      name = name || j.name || j.username;
      username = j.username ?? null;
    }

    const id = await upsertChannel(
      admin,
      {
        brand_id: data.brandId,
        platform: data.platform,
        external_id: data.externalId,
        page_id: pageId,
        name: name || data.platform,
        username,
        created_by: context.userId,
      },
      data.token,
    );
    if (data.platform !== "whatsapp" && pageId) {
      try {
        await subscribePage(pageId, data.token);
      } catch (e: any) {
        await admin
          .from("inbox_channels")
          .update({ last_error: String(e?.message ?? e).slice(0, 500) })
          .eq("id", id);
      }
    }
    return { id };
  });

export const inboxDisconnectFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ channelId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const admin = await adminClient();
    await admin.from("inbox_channel_secrets").delete().eq("channel_id", data.channelId);
    const { error } = await admin
      .from("inbox_channels")
      .update({ is_active: false })
      .eq("id", data.channelId);
    if (error) throw error;
    return { ok: true };
  });
