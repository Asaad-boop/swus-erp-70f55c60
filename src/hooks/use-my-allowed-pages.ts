import { useMyAccessProfile } from "@/hooks/use-my-access-profile";

/**
 * Current user's allowed page paths (null = no override, use role defaults).
 * Cached 5 min — invalidate `["my-allowed-pages"]` after admin updates.
 */
export function useMyAllowedPages() {
  const q = useMyAccessProfile();
  return {
    allowedPages: q.data?.pageMode === "custom" ? q.data.allowedPages : null,
    pageMode: q.data?.pageMode ?? "role_default",
    isLoading: q.isLoading,
  };
}