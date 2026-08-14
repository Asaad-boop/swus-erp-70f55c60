import { useEffect, useState } from "react";
import { CalendarClock, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const PRIORITIES = [
  { key: "low", label: "Low" },
  { key: "normal", label: "Normal" },
  { key: "high", label: "High" },
  { key: "urgent", label: "Urgent" },
] as const;

export const PRIORITY_TONE: Record<string, string> = {
  low: "border-border text-muted-foreground",
  normal: "border-border text-muted-foreground",
  high: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  urgent: "border-destructive/50 text-destructive",
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

export function addDaysISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** true when a follow-up date is today or already passed. */
export function isFollowupDue(date?: string | null) {
  if (!date) return false;
  return date <= todayISO();
}

export function FollowupCard({
  ideaId,
  nextActionAt,
  nextActionNote,
  owner,
  priority,
  saving,
  onSave,
}: {
  ideaId: string;
  nextActionAt: string | null;
  nextActionNote: string | null;
  owner: string | null;
  priority: string;
  saving?: boolean;
  onSave: (v: {
    next_action_at: string | null;
    next_action_note: string | null;
    sourcing_owner: string | null;
    priority: string;
  }) => void;
}) {
  const [date, setDate] = useState(nextActionAt ?? "");
  const [note, setNote] = useState(nextActionNote ?? "");
  const [own, setOwn] = useState(owner ?? "");
  const [prio, setPrio] = useState(priority || "normal");

  useEffect(() => {
    setDate(nextActionAt ?? "");
    setNote(nextActionNote ?? "");
    setOwn(owner ?? "");
    setPrio(priority || "normal");
  }, [ideaId, nextActionAt, nextActionNote, owner, priority]);

  const commit = (over?: Partial<{ date: string; note: string; own: string; prio: string }>) =>
    onSave({
      next_action_at: (over?.date ?? date) || null,
      next_action_note: (over?.note ?? note).trim() || null,
      sourcing_owner: (over?.own ?? own).trim() || null,
      priority: over?.prio ?? prio,
    });

  const due = isFollowupDue(date);

  return (
    <div
      className={`rounded-lg border p-3 ${
        due ? "border-amber-500/40 bg-amber-500/5" : "bg-muted/40"
      }`}
    >
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
        <CalendarClock className={`h-3.5 w-3.5 ${due ? "text-amber-500" : "text-primary"}`} />
        Follow-up & ownership
        {due && <span className="text-[10px] font-normal text-amber-600">আজ/ওভারডিউ</span>}
      </p>
      <div className="grid gap-2 sm:grid-cols-[130px_1fr_140px_120px]">
        <div className="grid gap-1">
          <Label className="text-[11px]">Next action</Label>
          <Input
            type="date"
            className="h-8"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-[11px]">Note</Label>
          <Input
            className="h-8"
            value={note}
            placeholder="Supplier-কে price চাপ দিতে হবে…"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-[11px]">Owner</Label>
          <Input
            className="h-8"
            value={own}
            placeholder="কে dekhbe"
            onChange={(e) => setOwn(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-[11px]">Priority</Label>
          <Select
            value={prio}
            onValueChange={(v) => {
              setPrio(v);
              commit({ prio: v });
            }}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  <span className="flex items-center gap-1.5">
                    <Flag className="h-3 w-3" /> {p.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {[
          { l: "আজ", d: 0 },
          { l: "+1d", d: 1 },
          { l: "+3d", d: 3 },
          { l: "+7d", d: 7 },
        ].map((s) => (
          <Button
            key={s.l}
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px]"
            onClick={() => {
              const v = addDaysISO(s.d);
              setDate(v);
              commit({ date: v });
            }}
          >
            {s.l}
          </Button>
        ))}
        {date && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            onClick={() => {
              setDate("");
              commit({ date: "" });
            }}
          >
            Clear
          </Button>
        )}
        <Button
          size="sm"
          className="ml-auto h-7 px-3 text-[11px]"
          disabled={saving}
          onClick={() => commit()}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
