import type { SupabaseClient } from "@supabase/supabase-js";
import { ALL_PAGE_PATHS } from "@/lib/erp/permissions/page-catalog";
import type { AccessWorkspaceUser, AppRole, MyAccessProfile } from "@/lib/erp/access-profile.model";

type AccessInput = {
  userId: string;
  roles: AppRole[];
  brandMode: "all" | "selected";
  brandIds: string[];
  pageMode: "role_default" | "custom";
  allowedPages: string[];
  employeeId: string | null;
};

export async function assertAccessAdmin(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw error;
  if (!data) throw new Error("Admin only");
}

export function normalizeAccessInput(input: AccessInput): AccessInput {
  const known = new Set(ALL_PAGE_PATHS);
  const roles = [...new Set(input.roles)].filter((role) => role !== "customer");
  const brandIds = input.brandMode === "selected" ? [...new Set(input.brandIds)] : [];
  const allowedPages = input.pageMode === "custom"
    ? [...new Set(input.allowedPages)].filter((path) => known.has(path))
    : [];
  if (roles.length === 0) throw new Error("At least one staff role is required");
  if (input.brandMode === "selected" && brandIds.length === 0) throw new Error("Select at least one brand");
  if (input.pageMode === "custom" && allowedPages.length === 0) throw new Error("Select at least one page");
  if (input.pageMode === "custom" && allowedPages.length !== new Set(input.allowedPages).size) {
    throw new Error("One or more selected pages no longer exist");
  }
  return { ...input, roles, brandIds, allowedPages };
}

export async function replaceAccessProfile(supabase: SupabaseClient, input: AccessInput) {
  const data = normalizeAccessInput(input);
  const { data: result, error } = await supabase.rpc("admin_replace_access_profile", {
    _target_user_id: data.userId,
    _roles: data.roles,
    _brand_mode: data.brandMode,
    _brand_ids: data.brandIds,
    _page_mode: data.pageMode,
    _allowed_pages: data.allowedPages,
    _employee_id: data.employeeId,
  });
  if (error) throw error;
  return result;
}

export async function readMyAccessProfile(supabase: SupabaseClient): Promise<MyAccessProfile> {
  const { data, error } = await supabase.rpc("get_my_access_profile");
  if (error) throw error;
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    userId: String(raw.userId ?? ""),
    roles: (Array.isArray(raw.roles) ? raw.roles : []) as AppRole[],
    pageMode: raw.pageMode === "custom" ? "custom" : "role_default",
    allowedPages: Array.isArray(raw.allowedPages) ? raw.allowedPages.map(String) : [],
    brandMode: raw.brandMode === "selected" ? "selected" : "all",
    brandIds: Array.isArray(raw.brandIds) ? raw.brandIds.map(String) : [],
    accessVersion: Number(raw.accessVersion ?? 1),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
  };
}

export async function listAccessWorkspace(supabase: SupabaseClient, actorId: string) {
  await assertAccessAdmin(supabase, actorId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const allAuthUsers = [] as Array<Record<string, any>>;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    allAuthUsers.push(...(data.users as Array<Record<string, any>>));
    if (data.users.length < 200) break;
  }
  const ids = allAuthUsers.map((user) => user.id as string);
  const safeIds = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
  const [rolesRes, profilesRes, permsRes, brandsRes, employeesRes] = await Promise.all([
    supabaseAdmin.from("user_roles").select("user_id,role").in("user_id", safeIds),
    supabaseAdmin.from("profiles").select("id,display_name").in("id", safeIds),
    supabaseAdmin.from("staff_permissions").select("user_id,permissions,updated_at").in("user_id", safeIds),
    supabaseAdmin.from("user_brand_access").select("user_id,brand_id").in("user_id", safeIds),
    supabaseAdmin.from("hr_employees").select("id,user_id,full_name,employee_code,status").order("full_name"),
  ]);
  for (const result of [rolesRes, profilesRes, permsRes, brandsRes, employeesRes]) if (result.error) throw result.error;

  const roles = new Map<string, AppRole[]>();
  for (const row of rolesRes.data ?? []) roles.set(row.user_id, [...(roles.get(row.user_id) ?? []), row.role as AppRole]);
  const profiles = new Map((profilesRes.data ?? []).map((row) => [row.id, row.display_name]));
  const permissions = new Map((permsRes.data ?? []).map((row) => [row.user_id, row]));
  const brands = new Map<string, string[]>();
  for (const row of brandsRes.data ?? []) brands.set(row.user_id, [...(brands.get(row.user_id) ?? []), row.brand_id]);
  const employees = new Map((employeesRes.data ?? []).filter((row) => row.user_id).map((row) => [row.user_id as string, row]));

  const users: AccessWorkspaceUser[] = allAuthUsers.map((authUser) => {
    const userRoles = roles.get(authUser.id) ?? [];
    const permissionRow = permissions.get(authUser.id);
    const document = (permissionRow?.permissions ?? {}) as Record<string, unknown>;
    const employee = employees.get(authUser.id);
    const brandIds = brands.get(authUser.id) ?? [];
    const allowedPages = Array.isArray(document.allowedPages)
      ? document.allowedPages.map(String).filter((path) => ALL_PAGE_PATHS.includes(path))
      : [];
    const pageMode: AccessWorkspaceUser["pageMode"] = document.pageMode === "custom" ? "custom" : "role_default";
    const brandMode: AccessWorkspaceUser["brandMode"] = document.brandMode === "selected" ? "selected" : "all";
    return {
      id: authUser.id,
      email: authUser.email ?? null,
      displayName: profiles.get(authUser.id) ?? null,
      createdAt: authUser.created_at,
      lastSignInAt: authUser.last_sign_in_at ?? null,
      emailConfirmedAt: authUser.email_confirmed_at ?? null,
      bannedUntil: authUser.banned_until ?? null,
      roles: userRoles,
      pageMode,
      allowedPages,
      brandMode,
      brandIds,
      employeeId: employee?.id ?? null,
      employeeName: employee?.full_name ?? null,
      employeeCode: employee?.employee_code ?? null,
      employeeStatus: employee?.status ?? null,
      updatedAt: permissionRow?.updated_at ?? null,
    };
  }).filter((user) => user.roles.some((role) => role !== "customer") || user.brandIds.length > 0 || user.pageMode === "custom");

  return { users, employees: employeesRes.data ?? [] };
}