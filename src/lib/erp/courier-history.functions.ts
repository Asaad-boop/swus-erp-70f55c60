import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const fetchCourierHistoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        phones: z.array(z.string().min(3).max(20)).min(1).max(1000),
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
