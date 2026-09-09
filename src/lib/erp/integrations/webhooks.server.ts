/**
 * Outbound webhook plumbing + inbound API-key verification.
 * Server-only (never import from client code).
 */

export const WEBHOOK_EVENTS = [
  // Orders
  "order.created",
  "order.updated",
  "order.status_changed",
  "order.payment_status_changed",
  "order.delivery_status_changed",
  "order.cancelled",
  "order.refunded",
  // Products & inventory
  "product.created",
  "product.updated",
  "product.price_changed",
  "inventory.stock_changed",
  // Purchase
  "purchase.received",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 hex — used to store API keys hashed. */
export async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(value)));
}

/** HMAC-SHA256 hex — signs outgoing webhook bodies. */
export async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
}

function randomToken(bytes = 24): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Plain API key handed to the external site once (never stored). */
export function generateApiKey(): { key: string; prefix: string } {
  const raw = randomToken(24);
  return { key: `swus_${raw}`, prefix: `swus_${raw.slice(0, 6)}` };
}

export function generateSigningSecret(): string {
  return `whsec_${randomToken(24)}`;
}

export type ApiClient = {
  id: string;
  name: string;
  brand_id: string | null;
  scopes: string[];
  is_active: boolean;
};

/**
 * Verifies `x-api-key` (or `Authorization: Bearer …`) against api_clients.
 * Returns null when the key is missing/unknown/disabled.
 */
export async function verifyApiKey(
  request: Request,
  supabaseAdmin: any,
  scope?: string,
): Promise<ApiClient | null> {
  const raw =
    request.headers.get("x-api-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!raw.trim()) return null;

  const hash = await sha256Hex(raw.trim());
  const { data } = await supabaseAdmin
    .from("api_clients")
    .select("id,name,brand_id,scopes,is_active")
    .eq("key_hash", hash)
    .maybeSingle();

  if (!data || !data.is_active) return null;
  if (scope && Array.isArray(data.scopes) && data.scopes.length && !data.scopes.includes(scope)) {
    return null;
  }

  // best-effort usage stamp
  void supabaseAdmin
    .from("api_clients")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return data as ApiClient;
}

const MAX_ATTEMPTS = 6;
/** Exponential-ish backoff in minutes per attempt. */
const BACKOFF_MIN = [1, 2, 5, 15, 60, 180];

/**
 * Sends queued webhook deliveries that are due. Called by cron and by
 * manual "Retry" from the ERP UI.
 */
export async function dispatchPendingWebhooks(
  supabaseAdmin: any,
  opts: { limit?: number; deliveryId?: string } = {},
): Promise<{ sent: number; failed: number; processed: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);

  let q = supabaseAdmin
    .from("webhook_deliveries")
    .select("id,endpoint_id,event,payload,attempts")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (opts.deliveryId) {
    q = q.eq("id", opts.deliveryId);
  } else {
    q = q.eq("status", "pending").lte("next_attempt_at", new Date().toISOString());
  }

  const { data: rows } = await q;
  const pending = (rows ?? []) as Array<{
    id: string;
    endpoint_id: string;
    event: string;
    payload: Record<string, unknown>;
    attempts: number;
  }>;
  if (pending.length === 0) return { sent: 0, failed: 0, processed: 0 };

  const endpointIds = Array.from(new Set(pending.map((p) => p.endpoint_id)));
  const { data: endpointRows } = await supabaseAdmin
    .from("webhook_endpoints")
    .select("id,url,secret,is_enabled")
    .in("id", endpointIds);
  const endpoints = new Map<string, { id: string; url: string; secret: string; is_enabled: boolean }>(
    ((endpointRows ?? []) as any[]).map((e) => [e.id, e]),
  );

  let sent = 0;
  let failed = 0;

  for (const row of pending) {
    const endpoint = endpoints.get(row.endpoint_id);
    if (!endpoint || !endpoint.is_enabled) {
      await supabaseAdmin
        .from("webhook_deliveries")
        .update({ status: "skipped", last_response: "Endpoint disabled or removed" })
        .eq("id", row.id);
      continue;
    }

    const attempts = row.attempts + 1;
    const timestamp = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      id: row.id,
      event: row.event,
      created_at: new Date().toISOString(),
      data: row.payload,
    });
    const signature = await hmacHex(endpoint.secret, `${timestamp}.${body}`);

    let statusCode = 0;
    let responseText = "";
    try {
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-swus-event": row.event,
          "x-swus-timestamp": String(timestamp),
          "x-swus-signature": `sha256=${signature}`,
          "user-agent": "SWUS-ERP-Webhook/1",
        },
        body,
      });
      statusCode = res.status;
      responseText = (await res.text().catch(() => "")).slice(0, 500);
    } catch (e) {
      responseText = (e as Error).message.slice(0, 500);
    }

    const ok = statusCode >= 200 && statusCode < 300;
    const giveUp = !ok && attempts >= MAX_ATTEMPTS;
    const backoff = BACKOFF_MIN[Math.min(attempts, BACKOFF_MIN.length) - 1] ?? 180;

    await supabaseAdmin
      .from("webhook_deliveries")
      .update({
        attempts,
        status: ok ? "success" : giveUp ? "failed" : "pending",
        last_status_code: statusCode || null,
        last_response: responseText || null,
        delivered_at: ok ? new Date().toISOString() : null,
        next_attempt_at: ok
          ? new Date().toISOString()
          : new Date(Date.now() + backoff * 60_000).toISOString(),
      })
      .eq("id", row.id);

    await supabaseAdmin
      .from("webhook_endpoints")
      .update({
        last_status: ok ? "success" : `error ${statusCode || "network"}`,
        last_delivered_at: new Date().toISOString(),
      })
      .eq("id", endpoint.id);

    if (ok) sent++;
    else failed++;
  }

  return { sent, failed, processed: pending.length };
}
