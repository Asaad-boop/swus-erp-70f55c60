import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAllowedPages } from "@/lib/erp/permissions/page-perms.functions";
import { supabase } from "@/integrations/supabase/client";

/**
 * Current user's allowed page paths (null = no override, use role defaults).
 * Cached 5 min — invalidate `["my-allowed-pages"]` after admin updates.
 */
export function useMyAllowedPages() {
  const fn = useServerFn(getMyAllowedPages);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setHasSession(!!session);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const q = useQuery({
    queryKey: ["my-allowed-pages"],
    enabled: hasSession,
    retry: false,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      try {
        return await fn();
      } catch {
        return { allowedPages: null as string[] | null };
      }
    },
    staleTime: 30 * 1000,
  });
  return {
    allowedPages: q.data?.allowedPages ?? null,
    isLoading: hasSession && q.isLoading,
  };
}