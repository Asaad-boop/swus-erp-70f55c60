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
  created_at: string;
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
};

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
  return (
    c.contact_name ||
    (c.contact_username ? `@${c.contact_username}` : null) ||
    c.contact_phone ||
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

export type ConversationFilters = {
  brandIds: string[];
  platform: InboxPlatform | "all";
  status: "open" | "done" | "all";
  unreadOnly: boolean;
  search: string;
};

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
  if (f.status !== "all") q = q.eq("status", f.status);
  if (f.unreadOnly) q = q.gt("unread_count", 0);
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
      "status" | "unread_count" | "contact_phone" | "contact_name" | "tags" | "assigned_to"
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
