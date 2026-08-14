import { supabase } from "@/integrations/supabase/client";

export type SourcingEventType =
  | "stage_change"
  | "quote_added"
  | "quote_updated"
  | "quote_removed"
  | "supplier_selected"
  | "target_updated"
  | "sample_updated"
  | "followup_set"
  | "po_created"
  | "note";

export type HubSourcingEvent = {
  id: string;
  idea_id: string;
  quote_id: string | null;
  event_type: SourcingEventType | string;
  from_stage: string | null;
  to_stage: string | null;
  note: string | null;
  meta: Record<string, unknown>;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
};

let actorCache: { id: string | null; name: string | null } | null = null;

async function currentActor() {
  if (actorCache) return actorCache;
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;
  let name = auth.user?.email ?? null;
  if (uid) {
    const { data } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", uid)
      .maybeSingle();
    const dn = (data as { display_name?: string | null } | null)?.display_name;
    if (dn) name = dn;
  }
  actorCache = { id: uid, name };
  return actorCache;
}

/** Fire-and-forget audit write — never blocks or breaks the main mutation. */
export async function logSourcingEvent(input: {
  ideaId: string;
  type: SourcingEventType;
  quoteId?: string | null;
  fromStage?: string | null;
  toStage?: string | null;
  note?: string | null;
  meta?: Record<string, unknown>;
}) {
  try {
    const actor = await currentActor();
    await supabase.from("hub_sourcing_events").insert({
      idea_id: input.ideaId,
      quote_id: input.quoteId ?? null,
      event_type: input.type,
      from_stage: input.fromStage ?? null,
      to_stage: input.toStage ?? null,
      note: input.note ?? null,
      meta: input.meta ?? {},
      actor_id: actor.id,
      actor_name: actor.name,
    } as never);
  } catch {
    /* audit log must never break the flow */
  }
}

export async function fetchSourcingEvents(ideaId: string) {
  const { data, error } = await supabase
    .from("hub_sourcing_events")
    .select("*")
    .eq("idea_id", ideaId)
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) throw error;
  return (data ?? []) as unknown as HubSourcingEvent[];
}

/** First time each stage was reached, from the event log. */
export function stageDates(events: HubSourcingEvent[]) {
  const m = new Map<string, string>();
  for (const e of [...events].reverse()) {
    if (e.event_type === "stage_change" && e.to_stage && !m.has(e.to_stage)) {
      m.set(e.to_stage, e.created_at);
    }
  }
  return m;
}

export const EVENT_LABEL: Record<string, string> = {
  stage_change: "Stage change",
  quote_added: "Quote added",
  quote_updated: "Quote updated",
  quote_removed: "Quote removed",
  supplier_selected: "Supplier selected",
  target_updated: "Target price updated",
  sample_updated: "Sample updated",
  followup_set: "Follow-up set",
  po_created: "Purchase order created",
  note: "Note",
};
