import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAccessProfile } from "@/lib/erp/access-profile.functions";
import { supabase } from "@/integrations/supabase/client";

export const MY_ACCESS_QUERY_KEY = ["my-access-profile"] as const;

export function useMyAccessProfile(enabled = true) {
  const getProfile = useServerFn(getMyAccessProfile);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const query = useQuery({
    queryKey: MY_ACCESS_QUERY_KEY,
    // Re-check the session at call time: the tab may have signed out between
    // the `enabled` gate and the actual fetch, which would 401 the server fn.
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) return null;
      return getProfile();
    },
    enabled: enabled && hasSession === true,

    staleTime: 0,
    refetchOnWindowFocus: "always",
    refetchInterval: 30_000,
    retry: false,
  });

  return Object.assign(query, { hasSession });
}
