import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Current user's own allowed pages. null = no override row (use role defaults). */
export const getMyAllowedPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readMyAccessProfile } = await import("@/lib/erp/access-profile.server");
    const profile = await readMyAccessProfile(context.supabase);
    return { allowedPages: profile.pageMode === "custom" ? profile.allowedPages : null };
  });

/** Admin: read every user's allowed pages map. */
export const listAllowedPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import("./page-perms.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("staff_permissions")
      .select("user_id, permissions");
    if (error) throw error;
    const out: Record<string, string[]> = {};
    for (const row of data ?? []) {
      const p = (row as any).permissions as { allowedPages?: string[] } | null;
      if (Array.isArray(p?.allowedPages)) out[(row as any).user_id] = p!.allowedPages!;
    }
    return out;
  });

/** Admin: replace the allowed pages for a user. Empty array = use role defaults. */
export const setUserAllowedPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      userId: z.string().uuid(),
      allowedPages: z.array(z.string()),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("./page-perms.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.allowedPages.length === 0) {
      // Empty = remove override entirely so role defaults take over.
      const { error } = await supabaseAdmin
        .from("staff_permissions")
        .delete()
        .eq("user_id", data.userId);
      if (error) throw error;
      return { ok: true, cleared: true };
    }

    const { error } = await (supabaseAdmin as any)
      .from("staff_permissions")
      .upsert(
        {
          user_id: data.userId,
          permissions: { allowedPages: data.allowedPages },
          updated_by: context.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error) throw error;
    return { ok: true, cleared: false };
  });