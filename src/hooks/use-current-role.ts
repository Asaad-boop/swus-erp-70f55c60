import { useMyAccessProfile } from "@/hooks/use-my-access-profile";
import type { AppRole } from "@/lib/erp/access-profile.model";

/**
 * Returns the current user's roles + admin flag.
 * Cached for 5 min. Used to gate sensitive settings sections.
 */
export function useCurrentRole() {
  const q = useMyAccessProfile();
  const roles = q.data?.roles ?? [];
  return {
    userId: q.data?.userId ?? null,
    roles,
    isAdmin: roles.includes("admin") || roles.includes("owner"),
    isOwner: roles.includes("owner"),
    isLoading: q.isLoading,
    hasRole: (r: AppRole) => roles.includes(r),
    hasAnyRole: (rs: AppRole[]) => rs.some((r) => roles.includes(r)),
  };
}
