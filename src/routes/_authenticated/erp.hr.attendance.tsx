import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Download, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataPanel, EmptyState } from "@/components/erp/ui";
import { HrPage, NoAccess, useHrRole } from "@/components/erp/hr/hr-shell";
import { DayStatusBadge } from "@/components/erp/hr/day-status-badge";
import { cn } from "@/lib/utils";
import {
  deleteSession,
  getAttendanceDays,
  getSessions,
  saveSession,
  type AttendanceDay,
  type Session,
} from "@/lib/erp/hr/api";
import {
  addDays,
  clock,
  dayLabel,
  dhakaToIso,
  dhakaToday,
  errorText,
  hm,
  monthStart,
  toTimeInput,
} from "@/lib/erp/hr/format";

export const Route = createFileRoute("/_authenticated/erp/hr/attendance")({
  head: () => ({ meta: [{ title: "Attendance — HRM" }] }),
  component: AttendancePage,
});

type Summary = {
  employee_id: string;
  name: string;
  code: string;
  designation: string | null;
  scheduled: number;
  present: number;
  late: number;
  absent: number;
  leave: number;
  worked: number;
  ot: number;
  lateMin: number;
  autoClosed: number;
};

function AttendancePage() {
  const { isManager, isLoading } = useHrRole();
  const today = dhakaToday();
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(today);
  const [selected, setSelected] = useState<string | null>(null);

  const days = useQuery({
    queryKey: ["hr", "attendance", from, to],
    enabled: isManager && to >= from,
    queryFn: () => getAttendanceDays(from, to),
  });

  const summary = useMemo<Summary[]>(() => {
    const map = new Map<string, Summary>();
    for (const d of days.data ?? []) {
      if (d.status === "not_employed") continue;
      const s = map.get(d.employee_id) ?? {
        employee_id: d.employee_id,
        name: d.employee_name,
        code: d.employee_code,
        designation: d.designation,
        scheduled: 0,
        present: 0,
        late: 0,
        absent: 0,
        leave: 0,
        worked: 0,
        ot: 0,
        lateMin: 0,
        autoClosed: 0,
      };
      if (["workday", "leave_paid", "leave_unpaid"].includes(d.day_type) && d.status !== "upcoming")
        s.scheduled++;
      if (["present", "late", "working", "on_break"].includes(d.status)) s.present++;
      if (d.late_min > 0) {
        s.late++;
        s.lateMin += d.late_min;
      }
      if (d.status === "absent") s.absent++;
      if (d.status === "leave") s.leave++;
      if (d.auto_closed) s.autoClosed++;
      s.worked += d.worked_min;
      s.ot += d.ot_min;
      map.set(d.employee_id, s);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [days.data]);

  const exportCsv = () => {
    const head = [
      "Employee",
      "Code",
      "Date",
      "Status",
      "In",
      "Out",
      "Worked (min)",
      "Break (min)",
      "Late (min)",
      "OT (min)",
    ];
    const lines = (days.data ?? [])
      .filter((d) => d.status !== "not_employed")
      .map((d) => [
        d.employee_name,
        d.employee_code,
        d.work_date,
        d.status,
        clock(d.first_in),
        d.is_open ? "" : clock(d.last_out),
        d.worked_min,
        d.break_min,
        d.late_min,
        d.ot_min,
      ]);
    const csv = [head, ...lines]
      .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `attendance_${from}_${to}.csv`;
    a.click();
  };

  if (isLoading)
    return (
      <div className="p-6">
        <Skeleton className="h-40" />
      </div>
    );
  if (!isManager) return <NoAccess what="attendance" />;

  const person = selected ? summary.find((s) => s.employee_id === selected) : null;

  return (
    <HrPage
      title="Attendance"
      subtitle="প্রতিদিনের হিসাব — late, absent, overtime। ভুল হলে সময় ঠিক করে দিন।"
      actions={
        <Button size="sm" variant="outline" onClick={exportCsv} className="gap-1.5">
          <Download className="size-4" /> CSV
        </Button>
      }
    >
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-xs">From</Label>
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={to}
            min={from}
            max={addDays(from, 92)}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {[
            ["Today", today, today],
            ["Last 7 days", addDays(today, -6), today],
            ["This month", monthStart(today), today],
          ].map(([l, f, t]) => (
            <Button
              key={l}
              size="sm"
              variant="ghost"
              onClick={() => {
                setFrom(f);
                setTo(t);
              }}
            >
              {l}
            </Button>
          ))}
        </div>
      </div>

      {person ? (
        <PersonDays
          summary={person}
          days={(days.data ?? []).filter(
            (d) => d.employee_id === person.employee_id && d.status !== "not_employed",
          )}
          from={from}
          to={to}
          onBack={() => setSelected(null)}
        />
      ) : (
        <DataPanel flush>
          {days.isLoading ? (
            <div className="p-4">
              <Skeleton className="h-40" />
            </div>
          ) : summary.length === 0 ? (
            <EmptyState title="No attendance in this range" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Employee</th>
                    <th className="px-3 py-2.5 text-right">Work days</th>
                    <th className="px-3 py-2.5 text-right">Present</th>
                    <th className="px-3 py-2.5 text-right">Late</th>
                    <th className="px-3 py-2.5 text-right">Absent</th>
                    <th className="px-3 py-2.5 text-right">Leave</th>
                    <th className="px-3 py-2.5 text-right">Worked</th>
                    <th className="px-3 py-2.5 text-right">Overtime</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {summary.map((s) => (
                    <tr
                      key={s.employee_id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => setSelected(s.employee_id)}
                    >
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.code}
                          {s.designation ? ` · ${s.designation}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{s.scheduled}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">
                        {s.present}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {s.late ? (
                          <span className="text-amber-700">
                            {s.late} <span className="text-xs opacity-70">({hm(s.lateMin)})</span>
                          </span>
                        ) : (
                          0
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {s.absent ? <span className="text-rose-700">{s.absent}</span> : 0}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{s.leave}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{hm(s.worked)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">
                        {s.ot ? hm(s.ot) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {s.autoClosed > 0 && (
                          <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[11px] text-rose-700">
                            {s.autoClosed} auto check-out
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DataPanel>
      )}
    </HrPage>
  );
}

function PersonDays({
  summary,
  days,
  from,
  to,
  onBack,
}: {
  summary: Summary;
  days: AttendanceDay[];
  from: string;
  to: string;
  onBack: () => void;
}) {
  const [edit, setEdit] = useState<string | null>(null); // work_date
  const sessions = useQuery({
    queryKey: ["hr", "sessions", summary.employee_id, from, to],
    queryFn: () => getSessions(summary.employee_id, from, to),
  });
  const byDate = useMemo(() => {
    const m = new Map<string, Session[]>();
    for (const s of sessions.data ?? []) m.set(s.work_date, [...(m.get(s.work_date) ?? []), s]);
    return m;
  }, [sessions.data]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="ghost" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="size-4" /> All employees
        </Button>
        <div className="font-semibold">{summary.name}</div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>
            {summary.present}/{summary.scheduled} present
          </span>
          ·<span>{summary.late} late</span>·<span>{summary.absent} absent</span>·
          <span>{hm(summary.worked)} worked</span>·<span>OT {hm(summary.ot)}</span>
        </div>
      </div>
      <DataPanel flush>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Punches</th>
                <th className="px-3 py-2.5 text-right">Worked</th>
                <th className="px-3 py-2.5 text-right">Break</th>
                <th className="px-3 py-2.5 text-right">Late</th>
                <th className="px-3 py-2.5 text-right">Early out</th>
                <th className="px-3 py-2.5 text-right">OT</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...days].reverse().map((d) => (
                <tr key={d.work_date} className={cn(d.status === "absent" && "bg-rose-500/[0.03]")}>
                  <td className="px-4 py-2 font-medium whitespace-nowrap">
                    {dayLabel(d.work_date)}
                  </td>
                  <td className="px-3 py-2">
                    <DayStatusBadge status={d.status} />{" "}
                    {d.holiday_title && (
                      <span className="text-xs text-muted-foreground">{d.holiday_title}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {(byDate.get(d.work_date) ?? []).map((s) => (
                      <div key={s.id}>
                        {clock(s.check_in)} → {s.check_out ? clock(s.check_out) : "now"}
                        {s.hr_breaks.length > 0 && <span> · {s.hr_breaks.length} break</span>}
                        {s.auto_closed && <span className="text-rose-600"> · auto</span>}
                        {s.source === "admin" || s.edited_at ? (
                          <span className="text-sky-700"> · edited</span>
                        ) : null}
                      </div>
                    ))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {d.worked_min ? hm(d.worked_min) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {d.break_min ? hm(d.break_min) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-700">
                    {d.late_min ? `${d.late_min}m` : ""}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {d.early_min ? `${d.early_min}m` : ""}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                    {d.ot_min ? hm(d.ot_min) : ""}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {d.status !== "upcoming" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={() => setEdit(d.work_date)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataPanel>
      {edit && (
        <DayEditor
          employeeId={summary.employee_id}
          name={summary.name}
          date={edit}
          sessions={byDate.get(edit) ?? []}
          onClose={() => setEdit(null)}
        />
      )}
    </>
  );
}

type DraftBreak = { start: string; end: string };
type Draft = {
  id: string | null;
  in: string;
  out: string;
  outNextDay: boolean;
  breaks: DraftBreak[];
  note: string;
};

function toDraft(s: Session | null): Draft {
  if (!s) return { id: null, in: "10:00", out: "19:00", outNextDay: false, breaks: [], note: "" };
  const outNext =
    !!s.check_out &&
    new Date(s.check_out).toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" }) !== s.work_date;
  return {
    id: s.id,
    in: toTimeInput(s.check_in),
    out: toTimeInput(s.check_out),
    outNextDay: outNext,
    breaks: s.hr_breaks.map((b) => ({
      start: toTimeInput(b.break_start),
      end: toTimeInput(b.break_end),
    })),
    note: s.note ?? "",
  };
}

function DayEditor({
  employeeId,
  name,
  date,
  sessions,
  onClose,
}: {
  employeeId: string;
  name: string;
  date: string;
  sessions: Session[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(sessions.length ? null : toDraft(null));
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["hr"] });
  };

  const save = useMutation({
    mutationFn: (d: Draft) => {
      if (!d.in) throw new Error("Check-in time দিন");
      const checkIn = dhakaToIso(date, d.in);
      const checkOut = d.out ? dhakaToIso(date, d.out, d.outNextDay || d.out <= d.in) : null;
      const breaks = d.breaks
        .filter((b) => b.start)
        .map((b) => ({
          start: dhakaToIso(date, b.start, b.start < d.in),
          end: b.end ? dhakaToIso(date, b.end, b.end < d.in) : null,
        }));
      return saveSession({ id: d.id, employeeId, checkIn, checkOut, breaks, note: d.note || null });
    },
    onSuccess: () => {
      toast.success("Saved");
      done();
      setDraft(null);
      if (!sessions.length) onClose();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteSession(id),
    onSuccess: () => {
      toast.success("Deleted");
      done();
      onClose();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {name} · {dayLabel(date, { weekday: "long", day: "numeric", month: "short" })}
          </DialogTitle>
        </DialogHeader>

        {!draft && (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg border p-3 text-sm"
              >
                <div>
                  <div className="font-medium">
                    {clock(s.check_in)} → {s.check_out ? clock(s.check_out) : "still working"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {s.hr_breaks
                      .map(
                        (b) => `${clock(b.break_start)}–${b.break_end ? clock(b.break_end) : "…"}`,
                      )
                      .join(", ") || "No breaks"}
                    {s.note ? ` · ${s.note}` : ""}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    onClick={() => setDraft(toDraft(s))}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-rose-600"
                    disabled={del.isPending}
                    onClick={() => {
                      if (confirm("Delete this session?")) del.mutate(s.id);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              className="w-full gap-1.5"
              onClick={() => setDraft(toDraft(null))}
            >
              <Plus className="size-4" /> Add session
            </Button>
          </div>
        )}

        {draft && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Check in</Label>
                <Input
                  type="time"
                  value={draft.in}
                  onChange={(e) => setDraft({ ...draft, in: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Check out (empty = still working)</Label>
                <Input
                  type="time"
                  value={draft.out}
                  onChange={(e) => setDraft({ ...draft, out: e.target.value })}
                />
              </div>
            </div>
            {draft.out && draft.out <= draft.in && (
              <p className="text-xs text-muted-foreground">
                Check-out পরের দিন ধরা হবে (overnight)।
              </p>
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Breaks</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      breaks: [...draft.breaks, { start: "14:00", end: "15:00" }],
                    })
                  }
                >
                  <Plus className="size-3" /> Break
                </Button>
              </div>
              {draft.breaks.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={b.start}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        breaks: draft.breaks.map((x, j) =>
                          j === i ? { ...x, start: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <span className="text-muted-foreground">→</span>
                  <Input
                    type="time"
                    value={b.end}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        breaks: draft.breaks.map((x, j) =>
                          j === i ? { ...x, end: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 shrink-0"
                    onClick={() =>
                      setDraft({ ...draft, breaks: draft.breaks.filter((_, j) => j !== i) })
                    }
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div>
              <Label className="text-xs">Reason for correction</Label>
              <Input
                value={draft.note}
                placeholder="Forgot to check out, phone dead…"
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => (sessions.length ? setDraft(null) : onClose())}
              >
                Cancel
              </Button>
              <Button disabled={save.isPending} onClick={() => save.mutate(draft)}>
                Save
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
