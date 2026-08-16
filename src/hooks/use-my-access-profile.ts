import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAccessProfile } from "@/lib/erp/access-profile.functions";

export const MY_ACCESS_QUERY_KEY = ["my-access-profile"] as const;

export function useMyAccessProfile(enabled = true) {
  const getProfile = useServerFn(getMyAccessProfile);
  return useQuery({
    queryKey: MY_ACCESS_QUERY_KEY,
    queryFn: () => getProfile(),
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: "always",
    refetchInterval: 30_000,
    retry: false,
  });
}
