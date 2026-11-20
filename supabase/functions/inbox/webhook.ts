/**
 * Inbox webhook ingestion — one endpoint for Messenger, Instagram and WhatsApp.
 * Called by the `inbox` edge function after the signature is verified.
 */
import {
  copyToStorage,
  copyWhatsAppMedia,
  fetchContactProfile,
  type InboxAttachment,
  type InboxPlatform,
} from "./meta.ts";

type Channel = {
  id: string;
  brand_id: string;
  platform: InboxPlatform;
  external_id: string;
  page_id: string | null;
};

type Ctx = {
  admin: any;
  ownAppId: string | null;
  channels: Map<string, Channel>;
  tokens: Map<string, string | null>;
};

async function getChannel(
  ctx: Ctx,
  platform: InboxPlatform,
  externalId: string,
): Promise<Channel | null> {
  const key = `${platform}:${externalId}`;
  if (ctx.channels.has(key)) return ctx.channels.get(key)!;
  const { data } = await ctx.admin
    .from("inbox_channels")
    .select("id, brand_id, platform, external_id, page_id, is_active")
    .eq("platform", platform)
    .eq("external_id", externalId)
    .maybeSingle();
  const ch = data && data.is_active ? (data as Channel) : null;
  if (ch) ctx.channels.set(key, ch);
  return ch;
}

async function getToken(ctx: Ctx, channelId: string): Promise<string | null> {
  if (ctx.tokens.has(channelId)) return ctx.tokens.get(channelId)!;
  const { data } = await ctx.admin
    .from("inbox_channel_secrets")
    .select("access_token")
    .eq("channel_id", channelId)
    .maybeSingle();
  const t = (data?.access_token as string | undefined) ?? null;
  ctx.tokens.set(channelId, t);
  return t;
}

async function conversationExists(ctx: Ctx, channelId: string, userId: string) {
  const { data } = await ctx.admin
    .from("inbox_conversations")
    .select("id, contact_name")
    .eq("channel_id", channelId)
    .eq("external_user_id", userId)
    .maybeSingle();
  return data as { id: string; contact_name: string | null } | null;
}

async function ingest(
  ctx: Ctx,
  args: {
    channel: Channel;
    userId: string;
    direction: "in" | "out";
    mid: string | null;
    type: string;
    body: string | null;
    attachments: InboxAttachment[];
    at: Date;
    contactName?: string | null;
    contactUsername?: string | null;
    contactAvatar?: string | null;
    contactPhone?: string | null;
    sentVia?: string | null;
  },
) {
  const { error } = await ctx.admin.rpc("inbox_ingest_message", {
    _channel_id: args.channel.id,
    _external_user_id: args.userId,
    _direction: args.direction,
    _external_message_id: args.mid,
    _msg_type: args.type,
    _body: args.body,
    _attachments: args.attachments,
    _created_at: args.at.toISOString(),
    _contact_name: args.contactName ?? null,
    _contact_username: args.contactUsername ?? null,
    _contact_avatar: args.contactAvatar ?? null,
    _contact_phone: args.contactPhone ?? null,
    _sent_via: args.sentVia ?? null,
  });
  if (error) throw error;
}

// ── Messenger / Instagram ─────────────────────────────────────────────
function mapMetaAttachmentType(t: string | undefined, payload: any): InboxAttachment["type"] {
  if (payload?.sticker_id) return "sticker";
  if (t === "image" || t === "video" || t === "audio") return t;
  if (t === "ig_reel" || t === "reel") return "video";
  return "file";
}

async function handleMetaMessaging(ctx: Ctx, platform: "messenger" | "instagram", entry: any) {
  const channel = await getChannel(ctx, platform, String(entry.id));
  if (!channel) return;
  const ownAppId = ctx.ownAppId;

  for (const ev of entry.messaging ?? []) {
    const msg = ev.message;
    const at = new Date(Number(ev.timestamp) || Date.now());

    // Read receipts → mark our outbound messages read.
    if (ev.read?.watermark && ev.sender?.id) {
      const conv = await conversationExists(ctx, channel.id, String(ev.sender.id));
      if (conv) {
        await ctx.admin
          .from("inbox_messages")
          .update({ status: "read" })
          .eq("conversation_id", conv.id)
          .eq("direction", "out")
          .in("status", ["sent", "delivered"])
          .lte("created_at", new Date(Number(ev.read.watermark)).toISOString());
      }
      continue;
    }

    if (ev.postback && ev.sender?.id) {
      await ingest(ctx, {
        channel,
        userId: String(ev.sender.id),
        direction: "in",
        mid: ev.postback.mid ?? null,
        type: "text",
        body: ev.postback.title ?? ev.postback.payload ?? "(button)",
        attachments: [],
        at,
      });
      continue;
    }

    if (!msg || msg.is_deleted || msg.is_unsupported) continue;

    const isEcho = Boolean(msg.is_echo);
    // Our own sends are recorded by the send function; skip their echoes.
    if (isEcho && ownAppId && String(msg.app_id ?? "") === String(ownAppId)) continue;

    const userId = String(isEcho ? ev.recipient?.id : ev.sender?.id);
    if (!userId || userId === "undefined") continue;

    const attachments: InboxAttachment[] = [];
    let shareNote: string | null = null;
    for (const a of msg.attachments ?? []) {
      const url: string | undefined = a?.payload?.url;
      if (
        a?.type === "fallback" ||
        a?.type === "share" ||
        a?.type === "template" ||
        a?.type === "story_mention"
      ) {
        shareNote =
          a?.type === "story_mention"
            ? "📣 Story-te mention korse"
            : a?.payload?.title || a?.title || "🔗 Shared post";
        if (url && a?.type !== "story_mention") shareNote += `\n${url}`;
        if (a?.type !== "story_mention") continue;
      }
      if (!url) continue;
      const type = mapMetaAttachmentType(a?.type, a?.payload);
      const stored =
        type === "sticker"
          ? null
          : await copyToStorage(ctx.admin, url, `${channel.brand_id}/${platform}`);
      attachments.push({ type, url: stored ?? url });
    }

    let body: string | null = msg.text ?? null;
    if (msg.reply_to?.story?.url) body = `↩️ Story reply${body ? `: ${body}` : ""}`;
    if (shareNote) body = body ? `${body}\n${shareNote}` : shareNote;
    const type = attachments[0]?.type ?? "text";

    // First message from a new customer → fetch name/photo once.
    let profile: { name: string | null; username: string | null; avatar: string | null } | null =
      null;
    const existing = await conversationExists(ctx, channel.id, userId);
    if (!existing || !existing.contact_name) {
      const token = await getToken(ctx, channel.id);
      if (token) profile = await fetchContactProfile(platform, userId, token, channel.page_id);
    }

    await ingest(ctx, {
      channel,
      userId,
      direction: isEcho ? "out" : "in",
      mid: msg.mid ?? null,
      type,
      body,
      attachments,
      at,
      contactName: profile?.name,
      contactUsername: profile?.username,
      contactAvatar: profile?.avatar,
      sentVia: isEcho ? "platform" : null,
    });
  }
}

// ── WhatsApp ──────────────────────────────────────────────────────────
function waBody(m: any): {
  type: string;
  body: string | null;
  mediaId: string | null;
  mediaType: InboxAttachment["type"] | null;
} {
  switch (m.type) {
    case "text":
      return { type: "text", body: m.text?.body ?? null, mediaId: null, mediaType: null };
    case "image":
      return {
        type: "image",
        body: m.image?.caption ?? null,
        mediaId: m.image?.id ?? null,
        mediaType: "image",
      };
    case "video":
      return {
        type: "video",
        body: m.video?.caption ?? null,
        mediaId: m.video?.id ?? null,
        mediaType: "video",
      };
    case "audio":
      return { type: "audio", body: null, mediaId: m.audio?.id ?? null, mediaType: "audio" };
    case "voice":
      return { type: "audio", body: null, mediaId: m.voice?.id ?? null, mediaType: "audio" };
    case "document":
      return {
        type: "file",
        body: m.document?.caption ?? m.document?.filename ?? null,
        mediaId: m.document?.id ?? null,
        mediaType: "file",
      };
    case "sticker":
      return { type: "sticker", body: null, mediaId: m.sticker?.id ?? null, mediaType: "sticker" };
    case "location":
      return {
        type: "text",
        body: `📍 Location: ${m.location?.name ?? ""} https://maps.google.com/?q=${m.location?.latitude},${m.location?.longitude}`.trim(),
        mediaId: null,
        mediaType: null,
      };
    case "button":
      return { type: "text", body: m.button?.text ?? null, mediaId: null, mediaType: null };
    case "interactive":
      return {
        type: "text",
        body: m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null,
        mediaId: null,
        mediaType: null,
      };
    case "reaction":
      return {
        type: "text",
        body: m.reaction?.emoji ? `Reacted ${m.reaction.emoji}` : null,
        mediaId: null,
        mediaType: null,
      };
    default:
      return { type: "text", body: `(${m.type} message)`, mediaId: null, mediaType: null };
  }
}

async function handleWhatsApp(ctx: Ctx, entry: any) {
  for (const change of entry.changes ?? []) {
    const v = change.value;
    const phoneNumberId = v?.metadata?.phone_number_id;
    if (!phoneNumberId) continue;
    const channel = await getChannel(ctx, "whatsapp", String(phoneNumberId));
    if (!channel) continue;

    const names = new Map<string, string>();
    for (const c of v.contacts ?? [])
      if (c?.wa_id) names.set(String(c.wa_id), c?.profile?.name ?? null);

    for (const m of v.messages ?? []) {
      const from = String(m.from);
      const parsed = waBody(m);
      const attachments: InboxAttachment[] = [];
      if (parsed.mediaId && parsed.mediaType) {
        const token = await getToken(ctx, channel.id);
        const url = token
          ? await copyWhatsAppMedia(
              ctx.admin,
              parsed.mediaId,
              token,
              `${channel.brand_id}/whatsapp`,
            )
          : null;
        if (url)
          attachments.push({ type: parsed.mediaType, url, name: m.document?.filename ?? null });
      }
      await ingest(ctx, {
        channel,
        userId: from,
        direction: "in",
        mid: m.id ?? null,
        type: parsed.type,
        body: parsed.body,
        attachments,
        at: new Date((Number(m.timestamp) || Date.now() / 1000) * 1000),
        contactName: names.get(from) ?? null,
        contactPhone: from.startsWith("880") ? `0${from.slice(3)}` : from,
      });
    }

    for (const s of v.statuses ?? []) {
      if (!s?.id || !s?.status) continue;
      const status = ["sent", "delivered", "read", "failed"].includes(s.status) ? s.status : null;
      if (!status) continue;
      const patch: Record<string, unknown> = { status };
      if (status === "failed")
        patch.error = s.errors?.[0]?.title ?? s.errors?.[0]?.message ?? "Failed";
      await ctx.admin.from("inbox_messages").update(patch).eq("external_message_id", String(s.id));
    }
  }
}

export async function processInboxWebhook(
  admin: any,
  payload: any,
  ownAppId: string | null = null,
) {
  const ctx: Ctx = { admin, ownAppId, channels: new Map(), tokens: new Map() };
  const object = payload?.object;
  for (const entry of payload?.entry ?? []) {
    if (object === "page") await handleMetaMessaging(ctx, "messenger", entry);
    else if (object === "instagram") await handleMetaMessaging(ctx, "instagram", entry);
    else if (object === "whatsapp_business_account") await handleWhatsApp(ctx, entry);
  }
}
