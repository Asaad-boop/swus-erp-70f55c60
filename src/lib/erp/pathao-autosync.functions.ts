import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertFinanceRole(supabase: any, userId: string) {
  const [{ data: admin }, { data: acct }, { data: owner }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "accountant" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "owner" }),
  ]);
  if (!admin && !acct && !owner) throw new Error("Not authorized");
}

export const getPathaoAutoSyncStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertFinanceRole(supabase, userId);
    const { readAutoSyncConfig } = await import("./pathao-autosync.server");
    return await readAutoSyncConfig(supabase);
  });

export const setPathaoAutoSyncConfigFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        enabled: z.boolean().optional(),
        autoApply: z.boolean().optional(),
        lookbackDays: z.number().int().min(1).max(60).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceRole(supabase, userId);
    const { writeAutoSyncConfig } = await import("./pathao-autosync.server");
    return await writeAutoSyncConfig(supabase, data);
  });

export const runPathaoAutoSyncNowFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ lookbackDays: z.number().int().min(1).max(60).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceRole(supabase, userId);
    const { runPathaoAutoSync } = await import("./pathao-autosync.server");
    return await runPathaoAutoSync(supabase, { force: true, lookbackDays: data.lookbackDays, userId });
  });
