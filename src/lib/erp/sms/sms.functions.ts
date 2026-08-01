import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SMS_DEFAULTS, smsConfigKey, smsSegments, normalizeBdPhone, type SmsConfig, type SmsTemplateKey } from "./templates";

type Ctx = { supabase: any; userId: string };

async function loadConfig(ctx: Ctx, brandId: string): Promise<SmsConfig> {
  const { data } = await ctx.supabase
    .from("app_settings")
    .select("value")
    .eq("key", smsConfigKey(brandId))
    .maybeSingle();
  if (!data?.value) return { ...SMS_DEFAULTS };
  try {
    const parsed = JSON.parse(data.value as string) as Partial<SmsConfig>;
    return {
      ...SMS_DEFAULTS,
      ...parsed,
      templates: { ...SMS_DEFAULTS.templates, ...(parsed.templates ?? {}) },
    };
  } catch {
    return { ...SMS_DEFAULTS };
  }
}

async function logSms(ctx: Ctx, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return;
  await ctx.supabase.from("sms_logs").insert(rows.map((r) => ({ ...r, created_by: ctx.userId })));
}

/** Public (to the app) config read — API key is masked for non-admins. */
export const getSmsConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string }) => z.object({ brandId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const cfg = await loadConfig(context as unknown as Ctx, data.brandId);
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    return { ...cfg, api_key: isAdmin ? cfg.api_key : "", is_admin: !!isAdmin };
  });

export const checkSmsBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string }) => z.object({ brandId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const cfg = await loadConfig(context as unknown as Ctx, data.brandId);
    if (!cfg.api_key) throw new Error("API key set kora nei");
    const { getBulkSmsBalance } = await import("./sms.server");
    const r = await getBulkSmsBalance(cfg.api_key);
    return r;
  });

/** Send a free-form message to one or many numbers. */
export const sendCustomSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; numbers: string[]; message: string; orderId?: string | null }) =>
    z
      .object({
        brandId: z.string().uuid(),
        numbers: z.array(z.string()).min(1).max(500),
        message: z.string().min(1).max(1000),
        orderId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const cfg = await loadConfig(ctx, data.brandId);
    if (!cfg.api_key || !cfg.sender_id) throw new Error("BulkSMSBD API key / Sender ID settings e set korun");

    const valid: string[] = [];
    const invalid: string[] = [];
    for (const n of data.numbers) {
      const p = normalizeBdPhone(n);
      if (p) { if (!valid.includes(p)) valid.push(p); } else invalid.push(n);
    }
    if (valid.length === 0) throw new Error("Kono valid BD number pawa jayni");

    const { sendBulkSms } = await import("./sms.server");
    const res = await sendBulkSms({ apiKey: cfg.api_key, senderId: cfg.sender_id, numbers: valid, message: data.message });

    await logSms(ctx, valid.map((phone) => ({
      brand_id: data.brandId,
      order_id: data.orderId ?? null,
      phone,
      message: data.message,
      template_key: "custom",
      status: res.ok ? "sent" : "failed",
      provider_response: `${res.code ?? ""} ${res.message}`.trim(),
      segments: smsSegments(data.message),
    })));

    return { ok: res.ok, message: res.message, code: res.code, sent: valid.length, invalid };
  });

/**
 * Send a template SMS for an order (order confirm / pre-order events).
 * Respects the per-brand enable + auto toggles unless `force` is passed.
 */
export const sendOrderSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string; template: SmsTemplateKey; force?: boolean }) =>
    z
      .object({
        orderId: z.string().uuid(),
        template: z.enum(["order_confirm", "preorder_placed", "preorder_ready", "preorder_confirmed"]),
        force: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: order, error } = await ctx.supabase
      .from("orders")
      .select("id,brand_id,invoice_no,total,advance_amount,shipping_name,shipping_phone,guest_name,guest_phone,courier_name,tracking_number,preorder_expected_date")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order?.brand_id) return { ok: false, skipped: "no_brand" as const };

    const cfg = await loadConfig(ctx, order.brand_id);
    if (!cfg.enabled && !data.force) return { ok: false, skipped: "disabled" as const };
    const autoKey = (
      { order_confirm: "auto_order_confirm", preorder_placed: "auto_preorder_placed", preorder_ready: "auto_preorder_ready", preorder_confirmed: "auto_preorder_confirmed" } as const
    )[data.template as Exclude<SmsTemplateKey, "custom">];
    if (!data.force && !cfg[autoKey]) return { ok: false, skipped: "auto_off" as const };
    if (!cfg.api_key || !cfg.sender_id) return { ok: false, skipped: "not_configured" as const };

    const phone = normalizeBdPhone(order.shipping_phone || order.guest_phone || "");
    if (!phone) return { ok: false, skipped: "no_phone" as const };

    const { data: brand } = await ctx.supabase.from("brands").select("name").eq("id", order.brand_id).maybeSingle();
    const total = Number(order.total || 0);
    const advance = Number(order.advance_amount || 0);

    const { renderTemplate, sendBulkSms } = await import("./sms.server");
    const message = renderTemplate(cfg.templates[data.template as Exclude<SmsTemplateKey, "custom">], {
      name: order.shipping_name || order.guest_name || "Customer",
      phone,
      invoice: order.invoice_no || order.id.slice(0, 8),
      order_id: order.id.slice(0, 8),
      total: total.toLocaleString("en-US"),
      advance: advance.toLocaleString("en-US"),
      due: Math.max(0, total - advance).toLocaleString("en-US"),
      brand: brand?.name ?? "",
      expected: order.preorder_expected_date ?? "",
      courier: order.courier_name ?? "",
      tracking: order.tracking_number ?? "",
      date: new Date().toISOString().slice(0, 10),
    }).trim();
    if (!message) return { ok: false, skipped: "empty_template" as const };

    const res = await sendBulkSms({ apiKey: cfg.api_key, senderId: cfg.sender_id, numbers: [phone], message });

    await logSms(ctx, [{
      brand_id: order.brand_id,
      order_id: order.id,
      phone,
      message,
      template_key: data.template,
      status: res.ok ? "sent" : "failed",
      provider_response: `${res.code ?? ""} ${res.message}`.trim(),
      segments: smsSegments(message),
    }]);

    return { ok: res.ok, message: res.message, code: res.code };
  });

export const listSmsLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string | null; limit?: number }) =>
    z.object({ brandId: z.string().uuid().nullable().optional(), limit: z.number().min(1).max(200).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("sms_logs")
      .select("id,phone,message,template_key,status,provider_response,segments,order_id,created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

/**
 * Bulk-send a pre-order template SMS to every (non-cancelled) pre-order
 * customer of the given brands. `preview: true` only returns the recipients.
 */
export const sendPreorderBlast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandIds: string[]; template?: SmsTemplateKey; stages?: string[]; preview?: boolean }) =>
    z
      .object({
        brandIds: z.array(z.string().uuid()).min(1),
        template: z.enum(["preorder_placed", "preorder_ready", "preorder_confirmed", "order_confirm"]).optional(),
        stages: z.array(z.string()).optional(),
        preview: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const templateKey = (data.template ?? "preorder_placed") as Exclude<SmsTemplateKey, "custom">;
    const stages = data.stages ?? ["open", "advance_paid", "ready", "called"];

    const { data: pres, error } = await ctx.supabase
      .from("preorders")
      .select(
        "order_id,brand_id,advance_amount,due_amount,promise_date," +
          "order:orders!preorders_order_id_fkey(id,invoice_no,total,advance_amount,shipping_name,shipping_phone,guest_name,guest_phone,courier_name,tracking_number)",
      )
      .in("brand_id", data.brandIds)
      .in("stage", stages)
      .limit(1000);
    if (error) throw error;

    const { data: brands } = await ctx.supabase.from("brands").select("id,name").in("id", data.brandIds);
    const brandName = new Map<string, string>((brands ?? []).map((b: { id: string; name: string }) => [b.id, b.name]));

    const { renderTemplate, sendBulkSms } = await import("./sms.server");
    const configs = new Map<string, SmsConfig>();
    for (const b of data.brandIds) configs.set(b, await loadConfig(ctx, b));

    type Target = { brandId: string; orderId: string; phone: string; message: string };
    const targets: Target[] = [];
    const skipped: string[] = [];
    const seen = new Set<string>();

    for (const p of (pres ?? []) as any[]) {
      const o = p.order;
      if (!o || !p.brand_id) continue;
      const phone = normalizeBdPhone(o.shipping_phone || o.guest_phone || "");
      if (!phone || seen.has(phone)) { if (!phone) skipped.push(o.invoice_no || o.id); continue; }
      seen.add(phone);
      const cfg = configs.get(p.brand_id);
      if (!cfg?.api_key || !cfg.sender_id) { skipped.push(o.invoice_no || o.id); continue; }
      const total = Number(o.total || 0);
      const advance = Number(p.advance_amount ?? o.advance_amount ?? 0);
      const message = renderTemplate(cfg.templates[templateKey], {
        name: o.shipping_name || o.guest_name || "Customer",
        phone,
        invoice: o.invoice_no || String(o.id).slice(0, 8),
        order_id: String(o.id).slice(0, 8),
        total: total.toLocaleString("en-US"),
        advance: advance.toLocaleString("en-US"),
        due: Math.max(0, Number(p.due_amount ?? total - advance)).toLocaleString("en-US"),
        brand: brandName.get(p.brand_id) ?? "",
        expected: p.promise_date ?? "",
        courier: o.courier_name ?? "",
        tracking: o.tracking_number ?? "",
        date: new Date().toISOString().slice(0, 10),
      }).trim();
      if (!message) continue;
      targets.push({ brandId: p.brand_id, orderId: o.id, phone, message });
    }

    if (data.preview) {
      return { preview: true as const, total: targets.length, skipped: skipped.length, sample: targets.slice(0, 3) };
    }

    let sent = 0;
    let failed = 0;
    const logs: Array<Record<string, unknown>> = [];
    for (const t of targets) {
      const cfg = configs.get(t.brandId)!;
      const res = await sendBulkSms({ apiKey: cfg.api_key, senderId: cfg.sender_id, numbers: [t.phone], message: t.message });
      if (res.ok) sent += 1; else failed += 1;
      logs.push({
        brand_id: t.brandId,
        order_id: t.orderId,
        phone: t.phone,
        message: t.message,
        template_key: templateKey,
        status: res.ok ? "sent" : "failed",
        provider_response: `${res.code ?? ""} ${res.message}`.trim(),
        segments: smsSegments(t.message),
      });
    }
    await logSms(ctx, logs);
    return { preview: false as const, total: targets.length, sent, failed, skipped: skipped.length };
  });

const _unusedListSmsLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string | null; limit?: number }) =>
    z.object({ brandId: z.string().uuid().nullable().optional(), limit: z.number().min(1).max(200).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("sms_logs")
      .select("id,phone,message,template_key,status,provider_response,segments,order_id,created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });