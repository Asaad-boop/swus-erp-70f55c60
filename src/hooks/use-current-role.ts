import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "admin"
  | "operations"
  | "accountant"
  | "warehouse_staff"
  | "packer"
  | "customer_service"
  | "marketing_manager"
  | "moderator"
  | "customer";

/**
 * Returns the current user's roles + admin flag.
 * Cached for 5 min. Used to gate sensitive settings sections.
 */
export function useCurrentRole() {
  const q = useQuery({
    queryKey: ["current-user-roles"],
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id;
      if (!userId) return { userId: null, roles: [] as AppRole[] };
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (error) return { userId, roles: [] as AppRole[] };
      return {
        userId,
        roles: (data ?? []).map((r: any) => r.role as AppRole),
      };
    },
  });
  const roles = q.data?.roles ?? [];
  return {
    userId: q.data?.userId ?? null,
    roles,
    isAdmin: roles.includes("admin"),
    isLoading: q.isLoading,
    hasRole: (r: AppRole) => roles.includes(r),
    hasAnyRole: (rs: AppRole[]) => rs.some((r) => roles.includes(r)),
  };
}
