import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const checkDeploySync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({ urls: z.array(z.string().url()).max(6).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/erp/permissions/page-perms.server");
    await assertAdmin(context.supabase, context.userId);
    const { runDeploySync } = await import("@/lib/erp/deploy-sync.server");
    return runDeploySync(data.urls ?? []);
  });
