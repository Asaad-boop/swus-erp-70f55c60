import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const APP_ROLES = [
  "admin",
  "operations",
  "accountant",
  "warehouse_staff",
  "packer",
  "customer_service",
  "marketing_manager",
  "hr_admin",
  "hr_manager",
  "employee",
  "moderator",
  "customer",
] as const;
export type AppRole = (typeof APP_ROLES)[number];

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw error;
  if (!data) throw new Error("Admin only");
}

/* ============= LIST ============= */

export const listAppUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (error) throw error;
    const users = list.users ?? [];
    const ids = users.map((u: any) => u.id);

    const [rolesRes, profilesRes] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("profiles").select("id, display_name").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    ]);
    if (rolesRes.error) throw rolesRes.error;
    if (profilesRes.error) throw profilesRes.error;

    const rolesByUser: Record<string, string[]> = {};
    (rolesRes.data ?? []).forEach((r: any) => {
      (rolesByUser[r.user_id] = rolesByUser[r.user_id] || []).push(r.role);
    });
    const profileByUser: Record<string, string> = {};
    (profilesRes.data ?? []).forEach((p: any) => { profileByUser[p.id] = p.display_name; });

    const mapped = users.map((u: any) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      email_confirmed_at: u.email_confirmed_at,
      banned_until: u.banned_until ?? null,
      phone: u.phone ?? null,
      display_name: profileByUser[u.id] ?? null,
      roles: rolesByUser[u.id] ?? [],
    }));
    // Staff = users with at least one non-customer role. Pure customers are excluded.
    return mapped.filter((u: any) => (u.roles as string[]).some((r) => r !== "customer"));
  });

/* ============= CREATE ============= */

const RoleEnum = z.enum(APP_ROLES);

export const createAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; password: string; displayName?: string; phone?: string; roles: string[]; brandIds?: string[] }) =>
    z.object({
      email: z.string().trim().email().max(255),
      password: z.string().min(6).max(72),
      displayName: z.string().trim().max(100).optional(),
      phone: z.string().trim().max(30).optional(),
      roles: z.array(RoleEnum).max(10),
      brandIds: z.array(z.string().uuid()).max(50).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      phone: data.phone || undefined,
      user_metadata: data.displayName ? { display_name: data.displayName } : undefined,
    });
    if (error) throw error;
    const newUserId = created.user!.id;

    if (data.displayName) {
      await supabaseAdmin.from("profiles").upsert({ id: newUserId, display_name: data.displayName });
    }

    if (data.roles.length) {
      const rows = data.roles.map((r) => ({ user_id: newUserId, role: r }));
      const { error: rErr } = await supabaseAdmin.from("user_roles").insert(rows);
      if (rErr) throw rErr;
    }

    if (data.brandIds && data.brandIds.length) {
      const rows = data.brandIds.map((bid) => ({ user_id: newUserId, brand_id: bid, created_by: context.userId }));
      const { error: bErr } = await supabaseAdmin.from("user_brand_access").insert(rows);
      if (bErr) throw bErr;
    }

    return { id: newUserId };
  });

/* ============= UPDATE ROLES ============= */

export const updateUserRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; roles: string[] }) =>
    z.object({ userId: z.string().uuid(), roles: z.array(RoleEnum).max(10) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId && !data.roles.includes("admin")) {
      throw new Error("Cannot remove your own admin role");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: dErr } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    if (dErr) throw dErr;
    if (data.roles.length) {
      const { error: iErr } = await supabaseAdmin
        .from("user_roles")
        .insert(data.roles.map((r) => ({ user_id: data.userId, role: r })));
      if (iErr) throw iErr;
    }
    return { ok: true };
  });

/* ============= PASSWORD RESET ============= */

export const setUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; password: string }) =>
    z.object({ userId: z.string().uuid(), password: z.string().min(6).max(72) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw error;
    return { ok: true };
  });

/* ============= DELETE ============= */

export const deleteAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("Cannot delete your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw error;
    return { ok: true };
  });

/* ============= BAN / UNBAN ============= */

export const toggleUserBan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; ban: boolean }) =>
    z.object({ userId: z.string().uuid(), ban: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("Cannot disable your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.ban ? "876000h" : "none",
    } as any);
    if (error) throw error;
    return { ok: true };
  });

/* ============= UPDATE PROFILE ============= */

export const updateUserProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; displayName?: string | null; email?: string | null }) =>
    z.object({
      userId: z.string().uuid(),
      displayName: z.string().trim().max(100).nullable().optional(),
      email: z.string().trim().email().max(255).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.email) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { email: data.email });
      if (error) throw error;
    }
    if (data.displayName !== undefined) {
      await supabaseAdmin.from("profiles").upsert({ id: data.userId, display_name: data.displayName ?? null });
    }
    return { ok: true };
  });

/* ============= GENERATE LINKS ============= */

export const generateAuthLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; type: "recovery" | "magiclink" }) =>
    z.object({ email: z.string().email(), type: z.enum(["recovery", "magiclink"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: data.type,
      email: data.email,
    });
    if (error) throw error;
    return { url: link.properties?.action_link ?? null };
  });

/* ============= BULK ============= */

export const bulkDeleteUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userIds: string[] }) =>
    z.object({ userIds: z.array(z.string().uuid()).min(1).max(100) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const ids = data.userIds.filter((id) => id !== context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().in("user_id", ids);
    for (const id of ids) {
      await supabaseAdmin.auth.admin.deleteUser(id);
    }
    return { ok: true, count: ids.length };
  });

export const bulkSetRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userIds: string[]; role: string; action: "add" | "remove" }) =>
    z.object({
      userIds: z.array(z.string().uuid()).min(1).max(100),
      role: RoleEnum,
      action: z.enum(["add", "remove"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.action === "add") {
      const rows = data.userIds.map((uid) => ({ user_id: uid, role: data.role }));
      const { error } = await supabaseAdmin.from("user_roles").upsert(rows, { onConflict: "user_id,role" });
      if (error) throw error;
    } else {
      const safeIds = data.role === "admin" ? data.userIds.filter((id) => id !== context.userId) : data.userIds;
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .in("user_id", safeIds)
        .eq("role", data.role);
      if (error) throw error;
    }
    return { ok: true };
  });
/* ============= CUSTOMER ACCOUNTS (website signups) ============= */

export const listCustomerAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { search?: string; includeStaff?: boolean; page?: number; pageSize?: number }) =>
    z.object({
      search: z.string().trim().max(200).optional(),
      includeStaff: z.boolean().optional(),
      page: z.number().int().min(1).max(500).optional(),
      pageSize: z.number().int().min(10).max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const page = data.page ?? 1;
    const perPage = data.pageSize ?? 100;

    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const authUsers = list.users ?? [];
    const ids = authUsers.map((u: any) => u.id);
    const safeIds = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];

    const [rolesRes, profilesRes, ordersRes] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", safeIds),
      supabaseAdmin.from("profiles").select("id, display_name").in("id", safeIds),
      supabaseAdmin.from("orders").select("user_id, total, created_at").in("user_id", safeIds),
    ]);
    if (rolesRes.error) throw rolesRes.error;
    if (profilesRes.error) throw profilesRes.error;

    const rolesByUser: Record<string, string[]> = {};
    (rolesRes.data ?? []).forEach((r: any) => {
      (rolesByUser[r.user_id] = rolesByUser[r.user_id] || []).push(r.role);
    });
    const profileByUser: Record<string, any> = {};
    (profilesRes.data ?? []).forEach((p: any) => { profileByUser[p.id] = p; });

    const orderStats: Record<string, { count: number; total: number; lastAt: string | null }> = {};
    (ordersRes.data ?? []).forEach((o: any) => {
      if (!o.user_id) return;
      const s = orderStats[o.user_id] || (orderStats[o.user_id] = { count: 0, total: 0, lastAt: null });
      s.count += 1;
      s.total += Number(o.total ?? 0);
      if (!s.lastAt || (o.created_at && o.created_at > s.lastAt)) s.lastAt = o.created_at;
    });

    let rows = authUsers.map((u: any) => {
      const p = profileByUser[u.id] || {};
      const stats = orderStats[u.id] || { count: 0, total: 0, lastAt: null };
      const roles = rolesByUser[u.id] ?? [];
      return {
        id: u.id,
        email: u.email ?? null,
        phone: u.phone ?? null,
        display_name: p.display_name ?? null,
        avatar_url: null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        email_confirmed_at: u.email_confirmed_at,
        banned_until: u.banned_until ?? null,
        roles,
        is_staff: roles.some((r: string) => r !== "customer"),
        order_count: stats.count,
        total_spent: stats.total,
        last_order_at: stats.lastAt,
      };
    });

    if (!data.includeStaff) rows = rows.filter((r) => !r.is_staff);

    if (data.search) {
      const q = data.search.toLowerCase();
      rows = rows.filter((r) =>
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.display_name ?? "").toLowerCase().includes(q) ||
        (r.phone ?? "").toLowerCase().includes(q),
      );
    }

    rows.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

    return { rows, page, perPage, hasMore: authUsers.length === perPage };
  });
