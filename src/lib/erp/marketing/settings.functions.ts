import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MARKETING_SETTINGS_KEY,
  marketingSettingsSchema,
  normalizeMarketingSettings,
  type MarketingSettings,
} from "./settings.schema";

/** Phase 8 — read/write the marketing settings hub. */

export const getMarketingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: row, error }, { data: isAdmin }] = await Promise.all([
      context.supabase
        .from("app_settings")
        .select("value, updated_at")
        .eq("key", MARKETING_SETTINGS_KEY)
        .maybeSingle(),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    ]);
    if (error) throw error;
    let raw: unknown = null;
    if (row?.value) {
      try {
        raw = JSON.parse(row.value as string);
      } catch {
        raw = null;
      }
    }
    return {
      settings: normalizeMarketingSettings(raw) as MarketingSettings,
      updated_at: (row?.updated_at as string | null) ?? null,
      canEdit: !!isAdmin,
    };
  });

export const saveMarketingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => marketingSettingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Admin only");
    const { error } = await context.supabase.from("app_settings").upsert(
      {
        key: MARKETING_SETTINGS_KEY,
        value: JSON.stringify(data),
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "key" },
    );
    if (error) throw error;
    return { ok: true };
  });
