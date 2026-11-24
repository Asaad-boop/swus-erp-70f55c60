/**
 * Inbox — browser-side types and queries (RLS-scoped through the user's session).
 * The generated Supabase types don't know the inbox tables yet, so reads go
 * through an untyped handle with local types.
 */
import { supabase } from "@/integrations/supabase/client";

export const db = supabase as any;

export type InboxPlatform = "messenger" | "instagram" | "whatsapp";

export type InboxChannel = {
  id: string;
  brand_id: string;
  platform: InboxPlatform;
  external_id: string;
  page_id: string | null;
  name: string;
  username: string | null;
  avatar_url: string | null;
  is_active: boolean;
  last_error: string | null;
  created_at: string;
};

export type InboxConversation = {
  id: string;
  channel_id: string;
  brand_id: string;
  platform: InboxPlatform;
  external_user_id: string;
  contact_name: string | null;
  contact_username: string | null;
  contact_avatar: string | null;
  contact_phone: string | null;
  status: "open" | "done";
  assigned_to: string | null;
  tags: string[];
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_direction: "in" | "out" | null;
  last_inbound_at: string | null;
  thread_url: string | null;
  created_at: string;
  /** Meta ad that started (or last re-opened) this chat */
  ad_id?: string | null;
  ad_title?: string | null;
  ad_photo?: string | null;
  ad_source?: string | null;
  ad_at?: string | null;
  ad_first_at?: string | null;
  ad_count?: number;
  ad_autoreplied_at?: string | null;
  complaint_at?: string | null;
  complaint_resolved_at?: string | null;
  complaint_text?: string | null;
  snoozed_until?: string | null;
  snooze_note?: string | null;
  order_count?: number;
  last_order_at?: string | null;
};

export type InboxAttachment = {
  type: "image" | "video" | "audio" | "file" | "sticker";
  url: string;
  name?: string | null;
};

export type InboxMessage = {
  id: string;
  conversation_id: string;
  brand_id: string;
  direction: "in" | "out";
  external_message_id: string | null;
  msg_type: string;
  body: string | null;
  attachments: InboxAttachment[];
  sent_by: string | null;
  sent_via: string | null;
  status: "pending" | "sent" | "delivered" | "read" | "failed" | "received";
  error: string | null;
  created_at: string;
  reply_to?: string | null;
  reactions?: Array<{ by: "customer" | "page"; emoji: string; at?: string }>;
  meta?: { product_id?: string; attachment_index?: number } | null;
};

export type QuickReply = {
  id: string;
  brand_id: string | null;
  shortcut: string;
  title: string;
  body: string;
  image_url: string | null;
  sort_order: number;
  use_count: number;
  category: string;
};

export const QR_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: "greeting", label: "Greeting" },
  { key: "price", label: "Dam / Stock" },
  { key: "order", label: "Order" },
  { key: "delivery", label: "Delivery" },
  { key: "payment", label: "Payment" },
  { key: "offer", label: "Offer" },
  { key: "followup", label: "Follow-up" },
  { key: "general", label: "Other" },
];

export type InboxNote = {
  id: string;
  conversation_id: string;
  brand_id: string;
  body: string;
  created_by: string | null;
  created_at: string;
};

export const PLATFORM_LABEL: Record<InboxPlatform, string> = {
  messenger: "Messenger",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
};

/** Tailwind classes for a small platform chip. */
export const PLATFORM_TONE: Record<InboxPlatform, string> = {
  messenger: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  instagram: "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20",
  whatsapp: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
};

export const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Hours left in the platform reply window, or null when closed. */
export function windowHoursLeft(lastInboundAt: string | null): number | null {
  if (!lastInboundAt) return null;
  const left = WINDOW_MS - (Date.now() - new Date(lastInboundAt).getTime());
  return left > 0 ? left / 3_600_000 : null;
}

export function displayName(
  c: Pick<
    InboxConversation,
    "contact_name" | "contact_username" | "contact_phone" | "external_user_id"
  >,
) {
  const n = c.contact_name && !/^(undefined|null)$/i.test(c.contact_name) ? c.contact_name : null;
  return (
    n ||
    (c.contact_username ? `@${c.contact_username}` : null) ||
    (c.contact_phone && c.contact_phone !== "undefined" ? c.contact_phone : null) ||
    `Customer ${c.external_user_id.slice(-4)}`
  );
}

export function firstName(
  c: Pick<
    InboxConversation,
    "contact_name" | "contact_username" | "contact_phone" | "external_user_id"
  >,
) {
  const n = c.contact_name?.trim();
  if (n) return n.split(/\s+/)[0]!;
  return "";
}

/** Fill {name} in a quick reply. */
export function fillTemplate(body: string, c: InboxConversation | null) {
  const name = c ? firstName(c) : "";
  return body.replace(/\s*\{name\}/g, name ? ` ${name}` : "").replace(/^\s+/, "");
}

/** Extract a Bangladeshi mobile number from free text (01XXXXXXXXX). */
export function findBdPhone(text: string | null | undefined): string | null {
  if (!text) return null;
  const digits = text.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)));
  const m = digits.replace(/[\s-]/g, "").match(/(?:\+?88)?(01[3-9]\d{8})/);
  return m ? m[1]! : null;
}

export type InboxView =
  | "open"
  | "awaiting"
  | "mine"
  | "unassigned"
  | "unread"
  | "ads"
  | "complaint"
  | "followup"
  | "ordered"
  | "done"
  | "all";

/** Labels the team puts on chats (stored in inbox_conversations.tags). */
export const INBOX_LABELS: Array<{ key: string; label: string; dot: string }> = [
  { key: "price", label: "Dam jante chay", dot: "bg-sky-500" },
  { key: "confirm", label: "Order confirm", dot: "bg-emerald-500" },
  { key: "hold", label: "Hold / pore nibe", dot: "bg-amber-500" },
  { key: "advance", label: "Advance lagbe", dot: "bg-orange-500" },
  { key: "wholesale", label: "Paikari", dot: "bg-violet-500" },
  { key: "vip", label: "VIP", dot: "bg-fuchsia-500" },
  { key: "return", label: "Return / exchange", dot: "bg-rose-500" },
  { key: "spam", label: "Fake / spam", dot: "bg-zinc-500" },
];
export const labelInfo = (key: string) =>
  INBOX_LABELS.find((l) => l.key === key) ?? { key, label: key, dot: "bg-slate-400" };

export type ConversationFilters = {
  brandIds: string[];
  platform: InboxPlatform | "all";
  view: InboxView;
  label?: string | null;
  userId: string | null;
  search: string;
};

export type InboxStaff = { id: string; display_name: string };

export async function fetchInboxStaff(): Promise<InboxStaff[]> {
  const { data, error } = await db.rpc("inbox_staff");
  if (error) throw error;
  return (data ?? []) as InboxStaff[];
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}

export const CONV_PAGE = 60;

export async function fetchConversations(
  f: ConversationFilters,
  limit: number,
): Promise<InboxConversation[]> {
  if (f.brandIds.length === 0) return [];
  let q = db
    .from("inbox_conversations")
    .select("*")
    .in("brand_id", f.brandIds)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (f.platform !== "all") q = q.eq("platform", f.platform);
  const now = new Date().toISOString();
  const awake = `snoozed_until.is.null,snoozed_until.lte.${now}`;
  switch (f.view) {
    case "open":
      q = q.eq("status", "open").or(awake);
      break;
    case "awaiting":
      q = q
        .eq("status", "open")
        .or(`last_message_direction.eq.in,snoozed_until.lte.${now}`)
        .or(awake);
      break;
    case "mine":
      q = f.userId ? q.eq("status", "open").eq("assigned_to", f.userId).or(awake) : q.limit(0);
      break;
    case "unassigned":
      q = q.eq("status", "open").is("assigned_to", null).or(awake);
      break;
    case "unread":
      q = q.gt("unread_count", 0);
      break;
    case "ads":
      q = q.eq("status", "open").not("ad_id", "is", null).or(awake);
      break;
    case "complaint":
      q = q.not("complaint_at", "is", null).is("complaint_resolved_at", null);
      break;
    case "followup":
      q = q.not("snoozed_until", "is", null);
      break;
    case "ordered":
      q = q.gt("order_count", 0);
      break;
    case "done":
      q = q.eq("status", "done");
      break;
  }
  if (f.label) q = q.contains("tags", [f.label]);
  const s = f.search.trim().replace(/[%,()]/g, "");
  if (s)
    q = q.or(
      `contact_name.ilike.%${s}%,contact_username.ilike.%${s}%,contact_phone.ilike.%${s}%,last_message_preview.ilike.%${s}%`,
    );
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as InboxConversation[];
}

export async function fetchMessages(conversationId: string, limit = 200): Promise<InboxMessage[]> {
  const { data, error } = await db
    .from("inbox_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as InboxMessage[]).reverse();
}

export async function fetchChannels(): Promise<InboxChannel[]> {
  const { data, error } = await db.from("inbox_channels").select("*").order("created_at");
  if (error) throw error;
  return (data ?? []) as InboxChannel[];
}

export async function fetchQuickReplies(): Promise<QuickReply[]> {
  const { data, error } = await db
    .from("inbox_quick_replies")
    .select("*")
    .order("sort_order")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as QuickReply[];
}

export async function fetchNotes(conversationId: string): Promise<InboxNote[]> {
  const { data, error } = await db
    .from("inbox_notes")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as InboxNote[];
}

export async function updateConversation(
  id: string,
  patch: Partial<
    Pick<
      InboxConversation,
      | "status"
      | "unread_count"
      | "contact_phone"
      | "contact_name"
      | "tags"
      | "assigned_to"
      | "snoozed_until"
      | "snooze_note"
      | "complaint_at"
      | "complaint_resolved_at"
    >
  >,
) {
  const { error } = await db.from("inbox_conversations").update(patch).eq("id", id);
  if (error) throw error;
}

export async function addNote(conv: InboxConversation, body: string, userId: string) {
  const { error } = await db.from("inbox_notes").insert({
    conversation_id: conv.id,
    brand_id: conv.brand_id,
    body,
    created_by: userId,
  });
  if (error) throw error;
}

export async function deleteNote(id: string) {
  const { error } = await db.from("inbox_notes").delete().eq("id", id);
  if (error) throw error;
}

export async function saveQuickReply(
  q: Partial<QuickReply> & Pick<QuickReply, "shortcut" | "title" | "body">,
) {
  const row = {
    brand_id: q.brand_id ?? null,
    shortcut: q.shortcut.startsWith("/") ? q.shortcut : `/${q.shortcut}`,
    title: q.title,
    body: q.body,
    image_url: q.image_url ?? null,
    sort_order: q.sort_order ?? 0,
    category: q.category || "general",
    updated_at: new Date().toISOString(),
  };
  const { error } = q.id
    ? await db.from("inbox_quick_replies").update(row).eq("id", q.id)
    : await db.from("inbox_quick_replies").insert(row);
  if (error) throw error;
}

export async function deleteQuickReply(id: string) {
  const { error } = await db.from("inbox_quick_replies").delete().eq("id", id);
  if (error) throw error;
}

/** Upload a file from the composer to the public inbox-media bucket. */
export async function uploadInboxMedia(
  file: File,
  brandId: string,
): Promise<{ url: string; type: "image" | "video" | "audio" | "file" }> {
  if (file.size > 15 * 1024 * 1024) throw new Error("File 15MB er beshi");
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${brandId}/outgoing/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("inbox-media")
    .upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  const url = supabase.storage.from("inbox-media").getPublicUrl(path).data.publicUrl;
  const type = file.type.startsWith("image/")
    ? "image"
    : file.type.startsWith("video/")
      ? "video"
      : file.type.startsWith("audio/")
        ? "audio"
        : "file";
  return { url, type };
}

export type PhoneOrder = {
  id: string;
  invoice_no: string | null;
  status: string;
  total: number | null;
  created_at: string;
  brand_id: string | null;
};

export async function fetchOrdersByPhone(phone: string): Promise<PhoneOrder[]> {
  const p = phone.replace(/\D/g, "").replace(/^88/, "");
  if (p.length < 11) return [];
  const { data, error } = await db
    .from("orders")
    .select("id, invoice_no, status, total, created_at, brand_id")
    .or(`shipping_phone.eq.${p},guest_phone.eq.${p}`)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as PhoneOrder[];
}

/**
 * Call the `inbox` edge function (sending, channel setup). Secrets and the
 * service role only exist there; the browser sends its own session JWT.
 */
export async function inboxApi<T = any>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("inbox", {
    body: { action, ...payload },
  });
  if (error) {
    let msg = error.message;
    try {
      const body = await (error as any).context?.json?.();
      if (body?.error) msg = body.error;
    } catch {
      /* keep generic message */
    }
    throw new Error(msg);
  }
  if (!data?.ok) throw new Error(data?.error ?? "Inbox request failed");
  return data.data as T;
}

export type ProfileLink = { label: string; url: string; kind: "profile" | "thread" };

/**
 * One-click links for a customer. Meta never exposes a Facebook profile URL for a
 * Messenger PSID, so Messenger opens the thread in the page inbox, where the
 * customer's profile is one click away. Instagram has a public profile by username.
 */
export function profileLinks(
  c: InboxConversation,
  channel?: Pick<InboxChannel, "page_id"> | null,
): ProfileLink[] {
  const out: ProfileLink[] = [];
  if (c.platform === "instagram" && c.contact_username) {
    out.push({
      kind: "profile",
      label: "Instagram profile",
      url: `https://www.instagram.com/${encodeURIComponent(c.contact_username)}/`,
    });
  }
  if (c.platform === "whatsapp") {
    out.push({
      kind: "profile",
      label: "WhatsApp e kholo",
      url: `https://wa.me/${c.external_user_id.replace(/\D/g, "")}`,
    });
  }
  if (c.thread_url) {
    out.push({
      kind: "thread",
      label: c.platform === "instagram" ? "Meta inbox e chat" : "Facebook e chat + profile",
      url: c.thread_url,
    });
  } else if (channel?.page_id && c.platform !== "whatsapp") {
    out.push({
      kind: "thread",
      label: "Page inbox kholo",
      url: `https://business.facebook.com/latest/inbox/all?asset_id=${channel.page_id}`,
    });
  }
  return out;
}

// ── message ads ───────────────────────────────────────────────────────
export type AdReportRow = {
  ad_id: string | null;
  ad_name: string;
  campaign_name: string | null;
  thumbnail: string | null;
  brand_id: string;
  chats: number;
  replied: number;
  unreplied: number;
  median_reply_min: number | null;
  orders: number;
  delivered: number;
  revenue: number;
  spend: number;
  meta_chats: number;
};

export async function fetchAdReport(
  brandIds: string[],
  from: Date,
  to: Date,
): Promise<AdReportRow[]> {
  if (brandIds.length === 0) return [];
  const { data, error } = await db.rpc("inbox_ad_report", {
    _brand_ids: brandIds,
    _from: from.toISOString(),
    _to: to.toISOString(),
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    revenue: Number(r.revenue ?? 0),
    spend: Number(r.spend ?? 0),
    median_reply_min: r.median_reply_min == null ? null : Number(r.median_reply_min),
  })) as AdReportRow[];
}

export type AdAutoReply = {
  id: string;
  brand_id: string;
  ad_id: string | null;
  ad_name: string | null;
  body: string;
  image_url: string | null;
  is_active: boolean;
  sent_count: number;
  updated_at: string;
};

export async function fetchAdAutoReplies(brandIds: string[]): Promise<AdAutoReply[]> {
  if (brandIds.length === 0) return [];
  const { data, error } = await db
    .from("inbox_ad_autoreplies")
    .select("*")
    .in("brand_id", brandIds)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as AdAutoReply[];
}

export async function saveAdAutoReply(
  r: Partial<AdAutoReply> & { brand_id: string; body: string },
) {
  const row = {
    brand_id: r.brand_id,
    ad_id: r.ad_id || null,
    ad_name: r.ad_name || null,
    body: r.body,
    image_url: r.image_url || null,
    is_active: r.is_active ?? true,
    updated_at: new Date().toISOString(),
  };
  const { error } = r.id
    ? await db.from("inbox_ad_autoreplies").update(row).eq("id", r.id)
    : await db.from("inbox_ad_autoreplies").insert(row);
  if (error) throw error;
}

export async function deleteAdAutoReply(id: string) {
  const { error } = await db.from("inbox_ad_autoreplies").delete().eq("id", id);
  if (error) throw error;
}

/** Ad-type ads the brand has run recently, for picking a per-ad auto-reply. */
export async function fetchBrandAds(brandId: string) {
  const { data, error } = await db
    .from("mkt_ads")
    .select("external_id, name, effective_status, creative_thumbnail, updated_at")
    .eq("brand_id", brandId)
    .order("updated_at", { ascending: false })
    .limit(150);
  if (error) throw error;
  return (data ?? []) as Array<{
    external_id: string;
    name: string | null;
    effective_status: string | null;
    creative_thumbnail: string | null;
  }>;
}

// ── view counts + bulk reply ──────────────────────────────────────────
export type ViewCounts = Partial<
  Record<InboxView | "ads_waiting" | "urgent" | "mine_waiting" | "followup_due", number>
> & { labels?: Record<string, number> };

export async function fetchViewCounts(
  brandIds: string[],
  platform: InboxPlatform | "all",
  userId: string | null,
): Promise<ViewCounts> {
  if (brandIds.length === 0) return {};
  const { data, error } = await db.rpc("inbox_view_counts", {
    _brand_ids: brandIds,
    _platform: platform === "all" ? null : platform,
    _user: userId,
  });
  if (error) throw error;
  return (data ?? {}) as ViewCounts;
}

export type OutgoingAttachment = { url: string; type: "image" | "video" | "audio" | "file" };

/**
 * Send one reply (text and/or several attachments) to a conversation.
 * Each attachment goes as its own message (Meta allows one per message);
 * the text rides on the last one so the customer sees photos then words.
 */
export async function sendReply(
  conversationId: string,
  v: {
    text: string | null;
    attachments: OutgoingAttachment[];
    replyToMessageId?: string | null;
    quickReplyId?: string | null;
  },
) {
  const atts = v.attachments;
  if (atts.length === 0) {
    return inboxApi("send", {
      conversationId,
      text: v.text,
      replyToMessageId: v.replyToMessageId ?? null,
      quickReplyId: v.quickReplyId ?? null,
    });
  }
  for (let i = 0; i < atts.length; i++) {
    const lastOne = i === atts.length - 1;
    await inboxApi("send", {
      conversationId,
      text: lastOne ? v.text : null,
      attachment: atts[i],
      replyToMessageId: i === 0 ? (v.replyToMessageId ?? null) : null,
      quickReplyId: lastOne ? (v.quickReplyId ?? null) : null,
    });
  }
}

/** Run `fn` over items with limited parallelism, reporting progress. */
export async function runPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
  onProgress?: (done: number, failed: number) => void,
) {
  let i = 0;
  let done = 0;
  let failed = 0;
  const errors: Array<{ item: T; error: string }> = [];
  const worker = async () => {
    while (i < items.length) {
      const item = items[i++]!;
      try {
        await fn(item);
      } catch (e: any) {
        failed++;
        errors.push({ item, error: String(e?.message ?? e) });
      }
      done++;
      onProgress?.(done, failed);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return { done, failed, errors };
}

// ── team report ───────────────────────────────────────────────────────
export type StaffStat = {
  user_id: string;
  name: string;
  replies: number;
  chats: number;
  first_responses: number;
  median_min: number | null;
  avg_min: number | null;
  within5_pct: number | null;
  orders: number;
  order_value: number;
  complaint_chats: number;
};
export type TeamReport = {
  totals: {
    new_chats: number;
    ad_chats: number;
    inbound: number;
    replies: number;
    auto_replies: number;
    app_replies: number;
    waits: number;
    unanswered: number;
    median_min: number | null;
    within5_pct: number | null;
    orders: number;
    order_value: number;
    ad_orders: number;
    chats_with_order: number;
    complaints: number;
    complaints_open: number;
  };
  staff: StaffStat[];
  daily: Array<{ day: string; inbound: number; replies: number; orders: number; value: number }>;
  hourly: Array<{ hour: number; inbound: number; median_min: number | null }>;
};

const num = (v: unknown) => (v == null ? null : Number(v));

export async function fetchTeamReport(
  brandIds: string[],
  from: Date,
  to: Date,
): Promise<TeamReport | null> {
  if (brandIds.length === 0) return null;
  const { data, error } = await db.rpc("inbox_team_report", {
    _brand_ids: brandIds,
    _from: from.toISOString(),
    _to: to.toISOString(),
  });
  if (error) throw error;
  const r = data as any;
  return {
    totals: Object.fromEntries(
      Object.entries(r.totals ?? {}).map(([k, v]) => [k, num(v)]),
    ) as TeamReport["totals"],
    staff: (r.staff ?? []).map((x: any) => ({
      ...x,
      median_min: num(x.median_min),
      avg_min: num(x.avg_min),
      within5_pct: num(x.within5_pct),
      order_value: Number(x.order_value ?? 0),
    })),
    daily: (r.daily ?? []).map((d: any) => ({ ...d, value: Number(d.value ?? 0) })),
    hourly: (r.hourly ?? []).map((h: any) => ({ ...h, median_min: num(h.median_min) })),
  };
}

export type StaffReply = {
  id: string;
  conversation_id: string;
  body: string | null;
  attachments: InboxAttachment[];
  created_at: string;
  contact_name: string | null;
  platform: InboxPlatform;
  brand_id: string;
  response_min: number | null;
};

export async function fetchStaffReplies(
  brandIds: string[],
  userId: string,
  from: Date,
  to: Date,
): Promise<StaffReply[]> {
  const { data, error } = await db.rpc("inbox_staff_replies", {
    _brand_ids: brandIds,
    _user: userId,
    _from: from.toISOString(),
    _to: to.toISOString(),
    _limit: 150,
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({ ...r, response_min: num(r.response_min) }));
}
