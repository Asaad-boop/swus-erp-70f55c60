import {
  Activity,
  ArrowRight,
  CheckCircle2,
  FileText,
  Package,
  ShoppingCart,
  Target,
  Trash2,
  UserCheck,
  CalendarClock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { STAGE_META, type SourcingStage } from "@/components/erp/hub/sourcing-track";
import { EVENT_LABEL, type HubSourcingEvent } from "@/lib/erp/hub/sourcing-events";

const ICONS: Record<string, LucideIcon> = {
  stage_change: ArrowRight,
  quote_added: FileText,
  quote_updated: FileText,
  quote_removed: Trash2,
  supplier_selected: UserCheck,
  target_updated: Target,
  sample_updated: Package,
  followup_set: CalendarClock,
  po_created: ShoppingCart,
  note: CheckCircle2,
};

function when(iso: string) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "এইমাত্র";
  if (mins < 60) return `${mins}m আগে`;
  if (mins < 1440) return `${Math.round(mins / 60)}h আগে`;
  return d.toLocaleDateString();
}

function label(e: HubSourcingEvent) {
  if (e.event_type === "stage_change") {
    const to = STAGE_META[e.to_stage as SourcingStage]?.label ?? e.to_stage;
    const from = e.from_stage ? STAGE_META[e.from_stage as SourcingStage]?.label ?? e.from_stage : null;
    return from ? `${from} → ${to}` : `Stage: ${to}`;
  }
  return EVENT_LABEL[e.event_type] ?? e.event_type;
}

export function SourcingActivity({
  events,
  loading,
}: {
  events: HubSourcingEvent[];
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-3.5">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Activity className="h-3.5 w-3.5 text-primary" /> Activity
          <span className="text-[11px] font-normal text-muted-foreground">
            ({events.length})
          </span>
        </p>
        {loading && <p className="text-xs text-muted-foreground">লোড হচ্ছে…</p>}
        {!loading && events.length === 0 && (
          <p className="text-xs text-muted-foreground">
            এখনো কোনো activity নেই — quote add বা stage change করলে এখানে জমা হবে।
          </p>
        )}
        <div className="max-h-[320px] space-y-0 overflow-y-auto pr-1">
          {events.map((e, i) => {
            const Icon = ICONS[e.event_type] ?? Activity;
            return (
              <div key={e.id} className="flex gap-2.5">
                <div className="flex flex-col items-center">
                  <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground">
                    <Icon className="h-3 w-3" />
                  </span>
                  {i < events.length - 1 && <span className="w-px flex-1 bg-border" />}
                </div>
                <div className="min-w-0 flex-1 pb-3 pt-1">
                  <p className="text-xs font-medium">{label(e)}</p>
                  {e.note && (
                    <p className="truncate text-[11px] text-muted-foreground">{e.note}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    {e.actor_name ?? "unknown"} · {when(e.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
