import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PresencePeer = { userId: string; name: string; typing: boolean };

/**
 * Who else has this conversation open, and whether they're typing.
 * Uses Supabase Realtime presence — nothing is stored.
 */
export function useConversationPresence(
  conversationId: string,
  me: { userId: string | null; name: string },
  typing: boolean,
) {
  const [peers, setPeers] = useState<PresencePeer[]>([]);
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const joined = useRef(false);

  useEffect(() => {
    if (!me.userId) return;
    joined.current = false;
    const ch = supabase.channel(`inbox-presence:${conversationId}`, {
      config: { presence: { key: me.userId } },
    });
    chRef.current = ch;
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<{ userId: string; name: string; typing: boolean }>();
      const list: PresencePeer[] = [];
      for (const [key, metas] of Object.entries(state)) {
        if (key === me.userId) continue;
        const last = metas[metas.length - 1];
        if (last) list.push({ userId: key, name: last.name, typing: !!last.typing });
      }
      setPeers(list);
    }).subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        joined.current = true;
        await ch.track({ userId: me.userId, name: me.name, typing: false });
      }
    });
    return () => {
      joined.current = false;
      chRef.current = null;
      void supabase.removeChannel(ch);
      setPeers([]);
    };
  }, [conversationId, me.userId, me.name]);

  useEffect(() => {
    const ch = chRef.current;
    if (!ch || !joined.current || !me.userId) return;
    void ch.track({ userId: me.userId, name: me.name, typing });
  }, [typing, me.userId, me.name]);

  return peers;
}
