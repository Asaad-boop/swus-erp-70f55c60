/**
 * Inbox webhook ingestion — one endpoint for Messenger, Instagram and WhatsApp.
 * Called by the `inbox` edge function after the signature is verified.
 */
import {
  copyToStorage,
  copyWhatsAppMedia,
  fetchContactProfile,
  fetchPostInfo,
  sendPlatformMessage,
  type ContactProfile,
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
    .select("id, contact_name, thread_url, contact_avatar, avatar_checked_at")
    .eq("channel_id", channelId)
    .eq("external_user_id", userId)
    .maybeSingle();
  return data as {
    id: string;
    contact_name: string | null;
    thread_url: string | null;
    contact_avatar: string | null;
    avatar_checked_at: string | null;
  } | null;
}

const AVATAR_RETRY_MS = 12 * 60 * 60 * 1000;

/** Store a profile photo in our bucket (Meta's CDN links expire) and remember we tried. */
export async function saveAvatar(
  admin: any,
  conversationId: string,
  brandId: string,
  platform: string,
  avatarUrl: string | null,
) {
  const stored = avatarUrl
    ? await copyToStorage(admin, avatarUrl, `${brandId}/${platform}/avatars`)
    : null;
  await admin
    .from("inbox_conversations")
    .update({
      avatar_checked_at: new Date().toISOString(),
      ...(stored || avatarUrl ? { contact_avatar: stored ?? avatarUrl } : {}),
    })
    .eq("id", conversationId);
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

// ── reactions ─────────────────────────────────────────────────────────
/** Set (or clear, emoji=null) one side's reaction on a stored message, found by platform id. */
export async function applyReaction(
  admin: any,
  channelId: string,
  externalMessageId: string,
  by: "customer" | "page",
  emoji: string | null,
) {
  const { data: row } = await admin
    .from("inbox_messages")
    .select("id, reactions, conversation_id, inbox_conversations!inner(channel_id)")
    .eq("external_message_id", externalMessageId)
    .eq("inbox_conversations.channel_id", channelId)
    .maybeSingle();
  if (!row) return false;
  const list = (Array.isArray(row.reactions) ? row.reactions : []).filter((r: any) => r?.by !== by);
  if (emoji) list.push({ by, emoji, at: new Date().toISOString() });
  await admin.from("inbox_messages").update({ reactions: list }).eq("id", row.id);
  return true;
}

// ── message ads (click-to-Messenger / Instagram / WhatsApp) ───────────
type AdReferral = {
  adId: string | null;
  title: string | null;
  photo: string | null;
  postId: string | null;
  source: string;
  ref: string | null;
  ctwaClid: string | null;
  payload: any;
};

function metaReferral(ev: any): AdReferral | null {
  const r = ev?.referral ?? ev?.message?.referral ?? ev?.postback?.referral;
  if (!r) return null;
  const ctx = r.ads_context_data ?? {};
  if (r.source !== "ADS" && !r.ad_id) return null;
  return {
    adId: r.ad_id ? String(r.ad_id) : null,
    title: ctx.ad_title ?? null,
    photo: ctx.photo_url ?? ctx.video_url ?? null,
    postId: ctx.post_id ? String(ctx.post_id) : null,
    source: String(r.source ?? "ADS"),
    ref: r.ref ?? null,
    ctwaClid: null,
    payload: r,
  };
}

function waReferral(m: any): AdReferral | null {
  const r = m?.referral;
  if (!r) return null;
  return {
    adId: r.source_type === "ad" && r.source_id ? String(r.source_id) : null,
    title: r.headline ?? r.body ?? null,
    photo: r.image_url ?? r.thumbnail_url ?? null,
    postId: r.source_type === "post" && r.source_id ? String(r.source_id) : null,
    source: r.source_type === "ad" ? "CTWA" : String(r.source_type ?? "CTWA"),
    ref: r.source_url ?? null,
    ctwaClid: r.ctwa_clid ?? null,
    payload: r,
  };
}

async function recordReferral(ctx: Ctx, channel: Channel, userId: string, r: AdReferral, at: Date) {
  const { error } = await ctx.admin.rpc("inbox_record_referral", {
    _channel_id: channel.id,
    _external_user_id: userId,
    _ad_id: r.adId,
    _ad_title: r.title,
    _photo: r.photo,
    _post_id: r.postId,
    _source: r.source,
    _ref: r.ref,
    _ctwa_clid: r.ctwaClid,
    _payload: r.payload,
    _at: at.toISOString(),
  });
  if (error) console.error("inbox_record_referral", error.message);
}

/** First message after an ad click → send the brand's instant ad reply (once per click). */
async function maybeAdAutoReply(ctx: Ctx, channel: Channel, userId: string) {
  const { data: conv } = await ctx.admin
    .from("inbox_conversations")
    .select("id, brand_id, ad_at, contact_name")
    .eq("channel_id", channel.id)
    .eq("external_user_id", userId)
    .maybeSingle();
  if (!conv?.ad_at || Date.now() - new Date(conv.ad_at).getTime() > 30 * 60 * 1000) return;
  const { data: rows, error } = await ctx.admin.rpc("inbox_claim_ad_autoreply", {
    _conversation_id: conv.id,
  });
  if (error) return console.error("inbox_claim_ad_autoreply", error.message);
  const rule = (rows ?? [])[0] as { body: string; image_url: string | null } | undefined;
  if (!rule) return;
  const token = await getToken(ctx, channel.id);
  if (!token) return;
  const senderId =
    channel.platform === "whatsapp"
      ? channel.external_id
      : (channel.page_id ?? channel.external_id);
  const now = new Date().toISOString();
  const first =
    String(conv.contact_name ?? "")
      .trim()
      .split(/\s+/)[0] ?? "";
  const text = (rule.body ?? "")
    .replace(/\s*\{name\}/g, first ? ` ${first}` : "")
    .replace(/^\s+/, "");
  const parts: { text: string | null; image: string | null }[] = [];
  if (rule.image_url) parts.push({ text: null, image: rule.image_url });
  if (text.trim()) parts.push({ text, image: null });
  for (const part of parts) {
    let messageId: string | null = null;
    let err: string | null = null;
    try {
      const r = await sendPlatformMessage({
        platform: channel.platform,
        senderId,
        token,
        recipientId: userId,
        text: part.text,
        attachment: part.image ? { type: "image", url: part.image } : null,
        lastInboundAt: now,
      });
      messageId = r.messageId;
    } catch (e: any) {
      err = String(e?.message ?? e).slice(0, 500);
    }
    await ctx.admin.from("inbox_messages").insert({
      conversation_id: conv.id,
      brand_id: conv.brand_id,
      direction: "out",
      external_message_id: messageId,
      msg_type: part.image ? "image" : "text",
      body: part.text,
      attachments: part.image ? [{ type: "image", url: part.image }] : [],
      sent_via: "auto",
      status: err ? "failed" : "sent",
      error: err,
    });
    if (err) break;
  }
  await ctx.admin
    .from("inbox_conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: text.slice(0, 140) || "📷 Photo",
      last_message_direction: "out",
    })
    .eq("id", conv.id);
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

    // Customer reacted / unreacted to a message.
    if (ev.reaction?.mid && ev.sender?.id) {
      const r = ev.reaction;
      const fromPage = String(ev.sender.id) === String(entry.id);
      await applyReaction(
        ctx.admin,
        channel.id,
        String(r.mid),
        fromPage ? "page" : "customer",
        r.action === "unreact" ? null : (r.emoji ?? (r.reaction === "love" ? "❤️" : "👍")),
      );
      continue;
    }

    const referral = metaReferral(ev);

    // Ad click that opened the chat without a message yet (messaging_referrals).
    if (referral && !msg && !ev.postback && ev.sender?.id) {
      await recordReferral(ctx, channel, String(ev.sender.id), referral, at);
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
      if (referral) await recordReferral(ctx, channel, String(ev.sender.id), referral, at);
      await maybeAdAutoReply(ctx, channel, String(ev.sender.id));
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
    let profile: ContactProfile | null = null;
    const existing = await conversationExists(ctx, channel.id, userId);
    const avatarDue =
      !!existing &&
      !existing.contact_avatar &&
      (!existing.avatar_checked_at ||
        Date.now() - new Date(existing.avatar_checked_at).getTime() > AVATAR_RETRY_MS);
    if (!existing || !existing.contact_name || !existing.thread_url || avatarDue) {
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
      sentVia: isEcho ? "platform" : null,
    });
    if (!isEcho) {
      if (referral) await recordReferral(ctx, channel, userId, referral, at);
      await maybeAdAutoReply(ctx, channel, userId);
    }
    if (profile && (!existing || avatarDue || !existing.contact_avatar)) {
      const conv = await conversationExists(ctx, channel.id, userId);
      if (conv && !conv.contact_avatar)
        await saveAvatar(ctx.admin, conv.id, channel.brand_id, platform, profile.avatar);
    }
    if (profile?.threadUrl || profile?.username) {
      const patch: Record<string, string> = {};
      if (profile.threadUrl) patch.thread_url = profile.threadUrl;
      if (profile.username) patch.contact_username = profile.username;
      await ctx.admin
        .from("inbox_conversations")
        .update(patch)
        .eq("channel_id", channel.id)
        .eq("external_user_id", userId);
    }
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
      if (!m?.from) continue; // system / unsupported events carry no sender
      const from = String(m.from);
      if (m.type === "reaction" && m.reaction?.message_id) {
        await applyReaction(
          ctx.admin,
          channel.id,
          String(m.reaction.message_id),
          "customer",
          m.reaction.emoji || null,
        );
        continue;
      }
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
      const ref = waReferral(m);
      const at = new Date((Number(m.timestamp) || Date.now() / 1000) * 1000);
      if (ref) await recordReferral(ctx, channel, from, ref, at);
      await maybeAdAutoReply(ctx, channel, from);
    }

    // Coexistence: replies typed in the WhatsApp Business app on the phone.
    for (const m of v.message_echoes ?? []) {
      const to = m?.to ? String(m.to) : null;
      if (!to) continue;
      const parsed = waBody(m);
      await ingest(ctx, {
        channel,
        userId: to,
        direction: "out",
        mid: m.id ?? null,
        type: parsed.type,
        body: parsed.body,
        attachments: [],
        at: new Date((Number(m.timestamp) || Date.now() / 1000) * 1000),
        contactPhone: to.startsWith("880") ? `0${to.slice(3)}` : to,
        sentVia: "platform",
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

// ── Comments (Facebook feed + Instagram comments) ─────────────────────
type CommentInput = {
  channel: Channel;
  platform: "facebook" | "instagram";
  ownerId: string; // page id / IG account id — comments from it are the page's own
  postId: string | null;
  commentId: string;
  parentId: string | null;
  authorId: string | null;
  authorName: string | null;
  authorUsername: string | null;
  body: string | null;
  attachmentUrl: string | null;
  createdAt: Date;
};

async function ensurePost(
  ctx: Ctx,
  platform: "facebook" | "instagram",
  channel: Channel,
  postId: string,
) {
  const { data: existing } = await ctx.admin
    .from("inbox_posts")
    .select("id, fetched_at")
    .eq("platform", platform)
    .eq("external_post_id", postId)
    .maybeSingle();
  if (existing?.fetched_at) return existing.id as string;
  const token = await getToken(ctx, channel.id);
  const info = token ? await fetchPostInfo(platform, postId, token) : null;
  const { data, error } = await ctx.admin
    .from("inbox_posts")
    .upsert(
      {
        channel_id: channel.id,
        brand_id: channel.brand_id,
        platform,
        external_post_id: postId,
        message: info?.message ?? null,
        permalink: info?.permalink ?? null,
        image_url: info?.imageUrl ?? null,
        fetched_at: info ? new Date().toISOString() : null,
      },
      { onConflict: "platform,external_post_id" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function upsertComment(ctx: Ctx, c: CommentInput) {
  const isFromPage = Boolean(c.authorId) && c.authorId === c.ownerId;
  const postRowId = c.postId ? await ensurePost(ctx, c.platform, c.channel, c.postId) : null;
  const { error } = await ctx.admin.from("inbox_comments").upsert(
    {
      channel_id: c.channel.id,
      brand_id: c.channel.brand_id,
      platform: c.platform,
      post_id: postRowId,
      external_comment_id: c.commentId,
      external_parent_id: c.parentId,
      author_id: c.authorId,
      author_name: c.authorName,
      author_username: c.authorUsername,
      is_from_page: isFromPage,
      body: c.body,
      attachment_url: c.attachmentUrl,
      status: isFromPage ? "done" : "open",
      created_at: c.createdAt.toISOString(),
    },
    { onConflict: "external_comment_id", ignoreDuplicates: false },
  );
  if (error) throw error;
  // A reply from the page (made here or anywhere else) answers the thread.
  if (isFromPage && c.parentId) {
    await ctx.admin
      .from("inbox_comments")
      .update({ replied_at: c.createdAt.toISOString(), status: "done" })
      .eq("external_comment_id", c.parentId)
      .is("replied_at", null);
  }
}

async function handleFacebookFeed(ctx: Ctx, entry: any) {
  const pageId = String(entry.id);
  const changes = (entry.changes ?? []).filter(
    (ch: any) => ch?.field === "feed" && ch?.value?.item === "comment",
  );
  if (changes.length === 0) return;
  const channel = await getChannel(ctx, "messenger", pageId);
  if (!channel) return;
  for (const ch of changes) {
    const v = ch.value;
    const commentId = v.comment_id ? String(v.comment_id) : null;
    if (!commentId) continue;
    if (v.verb === "remove") {
      await ctx.admin
        .from("inbox_comments")
        .update({ is_deleted: true })
        .eq("external_comment_id", commentId);
      continue;
    }
    if (v.verb === "hide" || v.verb === "unhide") {
      await ctx.admin
        .from("inbox_comments")
        .update({ is_hidden: v.verb === "hide" })
        .eq("external_comment_id", commentId);
      continue;
    }
    const postId = v.post_id ? String(v.post_id) : null;
    const parentId = v.parent_id && String(v.parent_id) !== postId ? String(v.parent_id) : null;
    await upsertComment(ctx, {
      channel,
      platform: "facebook",
      ownerId: pageId,
      postId,
      commentId,
      parentId,
      authorId: v.from?.id ? String(v.from.id) : null,
      authorName: v.from?.name ?? null,
      authorUsername: null,
      body: v.message ?? null,
      attachmentUrl: v.photo ?? v.video ?? null,
      createdAt: new Date((Number(v.created_time) || Date.now() / 1000) * 1000),
    });
  }
}

async function handleInstagramComments(ctx: Ctx, entry: any) {
  const igId = String(entry.id);
  const changes = (entry.changes ?? []).filter(
    (ch: any) => ch?.field === "comments" || ch?.field === "live_comments",
  );
  if (changes.length === 0) return;
  const channel = await getChannel(ctx, "instagram", igId);
  if (!channel) return;
  for (const ch of changes) {
    const v = ch.value;
    if (!v?.id) continue;
    await upsertComment(ctx, {
      channel,
      platform: "instagram",
      ownerId: igId,
      postId: v.media?.id ? String(v.media.id) : null,
      commentId: String(v.id),
      parentId: v.parent_id ? String(v.parent_id) : null,
      authorId: v.from?.id ? String(v.from.id) : null,
      authorName: v.from?.username ?? null,
      authorUsername: v.from?.username ?? null,
      body: v.text ?? null,
      attachmentUrl: null,
      createdAt: new Date(),
    });
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
    if (object === "page") {
      await handleMetaMessaging(ctx, "messenger", entry);
      await handleFacebookFeed(ctx, entry);
    } else if (object === "instagram") {
      await handleMetaMessaging(ctx, "instagram", entry);
      await handleInstagramComments(ctx, entry);
    } else if (object === "whatsapp_business_account") await handleWhatsApp(ctx, entry);
  }
}
