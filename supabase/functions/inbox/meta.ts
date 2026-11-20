/**
 * Inbox ↔ Meta Graph API (Messenger, Instagram DM, WhatsApp Cloud API).
 * Runtime-neutral (Deno edge function + vitest). Tokens live in `inbox_channel_secrets` (service role only).
 */
export const INBOX_GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${INBOX_GRAPH_VERSION}`;
const enc = new TextEncoder();

export type InboxPlatform = "messenger" | "instagram" | "whatsapp";

export type InboxAttachment = {
  type: "image" | "video" | "audio" | "file" | "sticker";
  url: string;
  name?: string | null;
};

async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Validate Meta's X-Hub-Signature-256 header against the raw body. */
export async function verifyMetaSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = await hmacHex(appSecret, rawBody);
  return timingSafeEqual(header.slice(7), expected);
}

/** Signed OAuth state: {uid, origin, exp}. */
export type OAuthState = { uid: string; origin: string; exp: number };
function b64url(s: string) {
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function fromB64url(s: string) {
  return decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));
}
export async function signState(st: OAuthState, secret: string) {
  const body = b64url(JSON.stringify(st));
  return `${body}.${await hmacHex(secret, body)}`;
}
export async function verifyState(token: string, secret: string): Promise<OAuthState> {
  const [body, sig] = token.split(".");
  if (!body || !sig || !timingSafeEqual(await hmacHex(secret, body), sig))
    throw new Error("Invalid state");
  const st = JSON.parse(fromB64url(body)) as OAuthState;
  if (Date.now() > st.exp) throw new Error("Login link expired");
  return st;
}

export async function graphGet(path: string, token: string, params: Record<string, string> = {}) {
  const res = await fetch(
    `${GRAPH}${path}?${new URLSearchParams({ ...params, access_token: token })}`,
  );
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || j?.error) throw new Error(j?.error?.message || `Meta ${res.status}`);
  return j;
}

export async function graphPost(path: string, token: string, body: unknown) {
  const res = await fetch(`${GRAPH}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || j?.error) {
    const e = j?.error;
    const msg = e?.error_user_msg || e?.message || `Meta ${res.status}`;
    const err = new Error(msg) as Error & { code?: number; subcode?: number };
    err.code = e?.code;
    err.subcode = e?.error_subcode;
    throw err;
  }
  return j;
}

// ── OAuth (Connect Facebook pages) ────────────────────────────────────
export const INBOX_SCOPES = [
  "pages_show_list",
  "pages_messaging",
  "pages_manage_metadata",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_manage_messages",
  "business_management",
].join(",");

/** Pages the logged-in FB user manages, each with a never-expiring page token + linked IG account. */
export async function listManagedPages(userToken: string) {
  const out: Array<{
    id: string;
    name: string;
    access_token: string;
    picture: string | null;
    instagram: {
      id: string;
      username: string | null;
      name: string | null;
      picture: string | null;
    } | null;
  }> = [];
  let url: string | null = `${GRAPH}/me/accounts?${new URLSearchParams({
    fields:
      "id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}",
    limit: "100",
    access_token: userToken,
  })}`;
  while (url) {
    const res: Response = await fetch(url);
    const j: any = await res.json();
    if (!res.ok || j?.error) throw new Error(j?.error?.message || `Meta ${res.status}`);
    for (const p of j.data ?? []) {
      const ig = p.instagram_business_account;
      out.push({
        id: String(p.id),
        name: p.name,
        access_token: p.access_token,
        picture: p.picture?.data?.url ?? null,
        instagram: ig
          ? {
              id: String(ig.id),
              username: ig.username ?? null,
              name: ig.name ?? null,
              picture: ig.profile_picture_url ?? null,
            }
          : null,
      });
    }
    url = j.paging?.next ?? null;
  }
  return out;
}

/** Subscribe our app to a page's message webhooks (covers Messenger + the linked Instagram account). */
export async function subscribePage(pageId: string, pageToken: string) {
  const res = await fetch(
    `${GRAPH}/${pageId}/subscribed_apps?${new URLSearchParams({
      subscribed_fields: "messages,message_echoes,message_reads,messaging_postbacks",
      access_token: pageToken,
    })}`,
    { method: "POST" },
  );
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || j?.error) throw new Error(j?.error?.message || `Subscribe failed (${res.status})`);
  return j;
}

// ── contact profiles ──────────────────────────────────────────────────
/**
 * Contact name/photo. Tries the user profile first (needs the "Business Asset User
 * Profile Access" feature for non-app users), then falls back to the page's
 * conversation participants, which only needs pages_messaging.
 */
export async function fetchContactProfile(
  platform: InboxPlatform,
  userId: string,
  token: string,
  pageId?: string | null,
) {
  try {
    if (platform === "messenger") {
      const j = await graphGet(`/${userId}`, token, { fields: "first_name,last_name,profile_pic" });
      const name = [j.first_name, j.last_name].filter(Boolean).join(" ") || null;
      if (name) return { name, username: null, avatar: j.profile_pic ?? null };
    }
    if (platform === "instagram") {
      const j = await graphGet(`/${userId}`, token, { fields: "name,username,profile_pic" });
      if (j.name || j.username) {
        return {
          name: j.name ?? j.username ?? null,
          username: j.username ?? null,
          avatar: j.profile_pic ?? null,
        };
      }
    }
  } catch {
    // fall through to the conversation lookup
  }
  if (!pageId || (platform !== "messenger" && platform !== "instagram")) return null;
  try {
    const j = await graphGet(`/${pageId}/conversations`, token, {
      platform,
      user_id: userId,
      fields: "participants",
    });
    const people: any[] = j?.data?.[0]?.participants?.data ?? [];
    const me = people.find((x) => String(x?.id) === String(userId));
    if (!me) return null;
    const name = me.name ?? me.username ?? null;
    return { name, username: me.username ?? null, avatar: null };
  } catch {
    return null;
  }
}

// ── sending ───────────────────────────────────────────────────────────
export type SendInput = {
  platform: InboxPlatform;
  /** FB page id for messenger/instagram, phone_number_id for whatsapp */
  senderId: string;
  token: string;
  recipientId: string;
  text?: string | null;
  attachment?: { type: "image" | "video" | "audio" | "file"; url: string } | null;
  /** last customer message time — decides the 24h window */
  lastInboundAt?: string | null;
};

export const WINDOW_MS = 24 * 60 * 60 * 1000;

export async function sendPlatformMessage(input: SendInput): Promise<{ messageId: string | null }> {
  const outsideWindow =
    !input.lastInboundAt || Date.now() - new Date(input.lastInboundAt).getTime() > WINDOW_MS;

  if (input.platform === "whatsapp") {
    if (outsideWindow) {
      throw new Error(
        "WhatsApp-e 24 ghonta par hoye geche — customer age message na dile template chara reply jabe na.",
      );
    }
    const base = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.recipientId,
    };
    const body = input.attachment
      ? {
          ...base,
          type: input.attachment.type === "file" ? "document" : input.attachment.type,
          [input.attachment.type === "file" ? "document" : input.attachment.type]: {
            link: input.attachment.url,
            ...(input.text && input.attachment.type !== "audio" ? { caption: input.text } : {}),
          },
        }
      : { ...base, type: "text", text: { body: input.text ?? "", preview_url: true } };
    const j = await graphPost(`/${input.senderId}/messages`, input.token, body);
    return { messageId: j?.messages?.[0]?.id ?? null };
  }

  // Messenger + Instagram both go through the page's /messages edge.
  // Outside 24h: HUMAN_AGENT tag (allowed up to 7 days, needs the Human Agent permission).
  const envelope = (message: unknown) => ({
    recipient: { id: input.recipientId },
    ...(outsideWindow
      ? { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" }
      : { messaging_type: "RESPONSE" }),
    message,
  });

  let lastId: string | null = null;
  if (input.attachment) {
    const j = await graphPost(
      `/${input.senderId}/messages`,
      input.token,
      envelope({
        attachment: {
          type: input.attachment.type,
          payload: { url: input.attachment.url, is_reusable: true },
        },
      }),
    );
    lastId = j?.message_id ?? null;
  }
  if (input.text && input.text.trim()) {
    const j = await graphPost(
      `/${input.senderId}/messages`,
      input.token,
      envelope({ text: input.text }),
    );
    lastId = j?.message_id ?? lastId;
  }
  return { messageId: lastId };
}

// ── media ─────────────────────────────────────────────────────────────
const MAX_MEDIA_BYTES = 15 * 1024 * 1024;

function extFor(contentType: string | null, fallback: string) {
  const ct = (contentType ?? "").split(";")[0]!.trim();
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "application/pdf": "pdf",
  };
  return map[ct] ?? fallback;
}

/** Copy a remote file into the public inbox-media bucket so it never expires. Returns the public URL or null. */
export async function copyToStorage(
  admin: any,
  sourceUrl: string,
  pathPrefix: string,
  headers?: Record<string, string>,
): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl, { headers });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_MEDIA_BYTES) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_MEDIA_BYTES) return null;
    const ct = res.headers.get("content-type");
    const path = `${pathPrefix}/${crypto.randomUUID()}.${extFor(ct, "bin")}`;
    const { error } = await admin.storage.from("inbox-media").upload(path, buf, {
      contentType: ct ?? "application/octet-stream",
      upsert: false,
    });
    if (error) return null;
    return admin.storage.from("inbox-media").getPublicUrl(path).data.publicUrl as string;
  } catch {
    return null;
  }
}

/** WhatsApp media arrives as an id: resolve to a temporary URL, then download with the token. */
export async function copyWhatsAppMedia(
  admin: any,
  mediaId: string,
  token: string,
  pathPrefix: string,
) {
  try {
    const meta = await graphGet(`/${mediaId}`, token);
    if (!meta?.url) return null;
    return await copyToStorage(admin, meta.url, pathPrefix, { Authorization: `Bearer ${token}` });
  } catch {
    return null;
  }
}
