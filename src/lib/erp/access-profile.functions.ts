import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  authLinkSchema,
  banSchema,
  createAccessUserSchema,
  passwordSchema,
  replaceAccessProfileSchema,
  userIdSchema,
} from "@/lib/erp/access-profile.model";

export const getMyAccessProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readMyAccessProfile } = await import("@/lib/erp/access-profile.server");
    return readMyAccessProfile(context.supabase);
  });

export const getAccessWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listAccessWorkspace } = await import("@/lib/erp/access-profile.server");
    return listAccessWorkspace(context.supabase, context.userId);
  });

export const saveAccessProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => replaceAccessProfileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertAccessAdmin, replaceAccessProfile } =
      await import("@/lib/erp/access-profile.server");
    await assertAccessAdmin(context.supabase, context.userId);
    return replaceAccessProfile(context.supabase, data);
  });

export const createAccessUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createAccessUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertAccessAdmin, replaceAccessProfile } =
      await import("@/lib/erp/access-profile.server");
    await assertAccessAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.displayName },
    });
    if (error || !created.user) throw error ?? new Error("User could not be created");
    try {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .upsert({ id: created.user.id, display_name: data.displayName });
      if (profileError) throw profileError;
      await replaceAccessProfile(context.supabase, { ...data, userId: created.user.id });
      return { id: created.user.id };
    } catch (cause) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw cause;
    }
  });

export const setAccessUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => passwordSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertAccessAdmin } = await import("@/lib/erp/access-profile.server");
    await assertAccessAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw error;
    return { ok: true };
  });

export const setAccessUserBan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => banSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertAccessAdmin } = await import("@/lib/erp/access-profile.server");
    await assertAccessAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("Cannot disable your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.ban ? "876000h" : "none",
    } as never);
    if (error) throw error;
    return { ok: true };
  });

export const deleteAccessUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => userIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertAccessAdmin } = await import("@/lib/erp/access-profile.server");
    await assertAccessAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("Cannot delete your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: targetIsAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: data.userId,
      _role: "admin",
    });
    if (targetIsAdmin) {
      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "admin");
      if ((count ?? 0) <= 1) throw new Error("Cannot delete the last admin");
    }
    await supabaseAdmin.from("hr_employees").update({ user_id: null }).eq("user_id", data.userId);
    await supabaseAdmin.from("staff_permissions").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("user_brand_access").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw error;
    return { ok: true };
  });

export const generateAccessAuthLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => authLinkSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertAccessAdmin } = await import("@/lib/erp/access-profile.server");
    await assertAccessAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink(data);
    if (error) throw error;
    return { url: link.properties?.action_link ?? null };
  });
