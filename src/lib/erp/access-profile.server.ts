import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppRole, MyAccessProfile } from "@/lib/erp/access-profile.model";

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
