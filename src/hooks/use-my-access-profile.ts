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
    queryFn: () => getProfile(),
    enabled: enabled && hasSession === true,
    staleTime: 0,
    refetchOnWindowFocus: "always",
    refetchInterval: 30_000,
    retry: false,
  });

  return Object.assign(query, { hasSession });
}
