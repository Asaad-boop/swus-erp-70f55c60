import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Owner/admin only — every function below is gated by this. */
async function assertAdmin(context: any) {
  const [{ data: isAdmin }, { data: isOwner }] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "owner" }),
  ]);
  if (!isAdmin && !isOwner) throw new Error("Forbidden");
}

/* ------------------------------ API clients ------------------------------ */

export const listApiClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("api_clients")
      .select("id,name,brand_id,key_prefix,scopes,is_active,last_used_at,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createApiClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; brandId: string | null }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const name = data.name.trim();
    if (!name) throw new Error("Name is required");

    const { generateApiKey, sha256Hex } = await import("@/lib/erp/integrations/webhooks.server");
    const { key, prefix } = generateApiKey();
    const key_hash = await sha256Hex(key);

    const { data: row, error } = await context.supabase
      .from("api_clients")
      .insert({
        name,
        brand_id: data.brandId,
        key_prefix: prefix,
        key_hash,
        created_by: context.userId,
      })
      .select("id,name,key_prefix")
      .single();
    if (error) throw new Error(error.message);
    // Plain key is shown once and never stored.
    return { ...row, api_key: key };
  });

export const setApiClientActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; isActive: boolean }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("api_clients")
      .update({ is_active: data.isActive })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteApiClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("api_clients").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* --------------------------- Webhook endpoints --------------------------- */

export const listWebhookEndpoints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("webhook_endpoints")
      .select("id,name,url,events,is_enabled,brand_id,last_status,last_delivered_at,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { name: string; url: string; events: string[]; brandId: string | null; enabled: boolean }) =>
      input,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const name = data.name.trim();
    const url = data.url.trim();
    if (!name) throw new Error("Name is required");
    if (!/^https:\/\/.+/i.test(url)) throw new Error("URL must start with https://");
    if (!data.events.length) throw new Error("Select at least one event");

    const { generateSigningSecret } = await import("@/lib/erp/integrations/webhooks.server");
    const secret = generateSigningSecret();

    const { data: row, error } = await context.supabase
      .from("webhook_endpoints")
      .insert({
        name,
        url,
        events: data.events,
        secret,
        is_enabled: data.enabled,
        brand_id: data.brandId,
        created_by: context.userId,
      })
      .select("id,name,url")
      .single();
    if (error) throw new Error(error.message);
    // Signing secret is shown once right after creation.
    return { ...row, signing_secret: secret };
  });

export const updateWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; enabled?: boolean; events?: string[]; url?: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const patch: Record<string, unknown> = {};
    if (data.enabled !== undefined) patch.is_enabled = data.enabled;
    if (data.events) patch.events = data.events;
    if (data.url) {
      if (!/^https:\/\/.+/i.test(data.url)) throw new Error("URL must start with https://");
      patch.url = data.url;
    }
    const { error } = await context.supabase
      .from("webhook_endpoints")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("webhook_endpoints").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------ Deliveries ------------------------------- */

export const listWebhookDeliveries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { endpointId?: string | null; limit?: number }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q = context.supabase
      .from("webhook_deliveries")
      .select("id,endpoint_id,event,status,attempts,last_status_code,last_response,payload,created_at,delivered_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(data.limit ?? 50, 200));
    if (data.endpointId) q = q.eq("endpoint_id", data.endpointId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const retryWebhookDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("webhook_deliveries")
      .update({ status: "pending", next_attempt_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    const { tryGetSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = tryGetSupabaseAdmin();
    if (!admin) return { queued: true };
    const { dispatchPendingWebhooks } = await import("@/lib/erp/integrations/webhooks.server");
    return dispatchPendingWebhooks(admin, { deliveryId: data.id });
  });

/** Sends a signed `ping` payload so the other site can verify the connection. */
export const sendTestWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { endpointId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("webhook_deliveries")
      .insert({
        endpoint_id: data.endpointId,
        event: "ping",
        payload: { message: "Test event from SynqWithUs ERP", at: new Date().toISOString() },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { tryGetSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = tryGetSupabaseAdmin();
    if (!admin) return { queued: true };
    const { dispatchPendingWebhooks } = await import("@/lib/erp/integrations/webhooks.server");
    return dispatchPendingWebhooks(admin, { deliveryId: row.id });
  });
