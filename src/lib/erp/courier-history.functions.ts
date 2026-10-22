import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertIntegrationAdmin } from "./integration-admin";

export const fetchCourierHistoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        phones: z
          .array(z.string().transform((s) => s.trim().slice(0, 40)).pipe(z.string().min(3)))
          .min(1)
          .max(1000),
        brandId: z.string().uuid().optional(),
        force: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { getCourierHistory } = await import("./courier-history.server");
    const results = await getCourierHistory(context.supabase, data.brandId ?? null, data.phones, !!data.force);
    return { results };
  });

export const bdCourierQuotaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getBdCourierQuota } = await import("./bdcourier.server");
    return await getBdCourierQuota(context.supabase);
  });

/** Admin/owner only: save (or clear) the key. Never returns the raw key. */
export const bdCourierSaveKeyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ apiKey: z.string().max(400).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertIntegrationAdmin(context.supabase, context.userId);

    const { saveBdCourierKey, getBdCourierQuota } = await import("./bdcourier.server");
    await saveBdCourierKey(context.supabase, data.apiKey);
    return await getBdCourierQuota(context.supabase);
  });

/** Admin-only: live check that the saved key works (uses 1 BDCourier search). */
export const bdCourierVerifyKeyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ phone: z.string().min(6).max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    const { fetchBdCourierHistory } = await import("./bdcourier.server");
    const rows = await fetchBdCourierHistory(context.supabase, data.phone.replace(/\D/g, ""));
    const failed = rows.find((r) => !r.ok);
    if (rows.length === 0 || failed) {
      return { ok: false, message: failed?.error ?? "Kono data pawa jay nai" };
    }
    return {
      ok: true,
      message: rows.map((r) => `${r.label}: ${r.success}/${r.total}`).join(" · "),
    };
  });
