import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Coffee, LogIn, LogOut, Play, CalendarDays, Clock, Loader2, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { getMyStatus, punch, type MyStatus, type PunchAction } from "@/lib/erp/hr/api";
import { clock, errorText, hm, hms, time12 } from "@/lib/erp/hr/format";

export const MY_STATUS_KEY = ["hr", "my-status"] as const;

const TOAST: Record<PunchAction, string> = {
  check_in: "Check in হয়েছে — ভালো একটা দিন কাটুক!",
  break_start: "Break শুরু",
  break_end: "আবার কাজে ফিরেছেন",
  check_out: "Check out হয়েছে",
};

/**
 * One-tap attendance: Check in → Break / Resume → Check out.
 * The server clock is the only clock; the timer here just interpolates between polls.
 */
export function PunchCard({
  compact = false,
  showHistoryLink = true,
  hideIfUnlinked = false,
}: {
  compact?: boolean;
  showHistoryLink?: boolean;
  hideIfUnlinked?: boolean;
}) {
  const qc = useQueryClient();
  const [confirmOut, setConfirmOut] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: MY_STATUS_KEY,
    queryFn: getMyStatus,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Server-time offset so the live timer matches the server, not the phone clock.
  const offsetRef = useRef(0);
  const receivedRef = useRef(Date.now());
  useEffect(() => {
    if (data?.server_now) {
      offsetRef.current = Date.parse(data.server_now) - Date.now();
      receivedRef.current = Date.now();
    }
  }, [data]);

  const [, setTick] = useState(0);
  const live = data?.linked && data.state !== "off";
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [live]);

  const m = useMutation({
    mutationFn: (a: PunchAction) => punch(a),
    onSuccess: (next, a) => {
      qc.setQueryData(MY_STATUS_KEY, next);
      void qc.invalidateQueries({ queryKey: ["hr"] });
      toast.success(TOAST[a]);
      navigator.vibrate?.(40);
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const elapsed = (Date.now() - receivedRef.current) / 1000;
  const worked = data?.linked ? data.worked_seconds + (data.state === "working" ? elapsed : 0) : 0;
  const onBreakSecs = data?.linked
    ? data.break_seconds + (data.state === "on_break" ? elapsed : 0)
    : 0;

  const currentBreakStart = useMemo(() => {
    if (!data?.linked || data.state !== "on_break") return null;
    const open = data.sessions.find((s) => !s.check_out);
    return open?.breaks.find((b) => !b.end)?.start ?? null;
  }, [data]);

  if (isLoading)
    return hideIfUnlinked ? null : (
      <Skeleton className={cn("w-full rounded-2xl", compact ? "h-28" : "h-56")} />
    );
  if (error && hideIfUnlinked) return null;
  if (error)
    return (
      <div className="rounded-2xl border bg-card p-5 text-sm text-destructive">
        {errorText(error)}
      </div>
    );
  if (!data) return null;

  if (!data.linked) {
    if (hideIfUnlinked) return null;
    return (
      <section className="rounded-2xl border border-dashed bg-card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Clock className="size-4" /> Attendance
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          আপনার login এখনো কোনো employee profile-এর সাথে যুক্ত নয়। HR-কে বলুন HR → Employees থেকে
          আপনাকে যুক্ত করতে।
        </p>
      </section>
    );
  }

  const { employee: emp, today, state } = data;
  const sched = emp.sched_minutes * 60;
  const pct = sched > 0 ? Math.min(100, (worked / sched) * 100) : 0;
  const breakLeft = emp.break_minutes * 60 - onBreakSecs;
  const firstIn = data.sessions[0]?.check_in ?? null;
  const busy = m.isPending;

  const tone =
    state === "working"
      ? "from-emerald-500/15 via-emerald-500/5 border-emerald-500/30"
      : state === "on_break"
        ? "from-sky-500/15 via-sky-500/5 border-sky-500/30"
        : "from-muted/60 via-transparent border-border";

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-gradient-to-br to-card",
        tone,
        compact ? "p-4" : "p-5 md:p-6",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
                state === "working"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : state === "on_break"
                    ? "bg-sky-500/15 text-sky-700 dark:text-sky-400"
                    : "bg-muted text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  state === "working"
                    ? "bg-emerald-500 animate-pulse"
                    : state === "on_break"
                      ? "bg-sky-500 animate-pulse"
                      : "bg-muted-foreground/50",
                )}
              />
              {state === "working" ? "Working" : state === "on_break" ? "On break" : "Off duty"}
            </span>
            {today.holiday && (
              <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                {today.holiday}
              </span>
            )}
            {!today.holiday && today.on_leave && (
              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                On leave
              </span>
            )}
            {!today.holiday && !today.on_leave && !today.is_workday && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                <Sun className="size-3" /> Weekly off
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Shift {time12(emp.shift_start)} – {time12(emp.shift_end)}
            {emp.break_start && emp.break_end
              ? ` · Break ${time12(emp.break_start)} – ${time12(emp.break_end)}`
              : ` · Break ${emp.break_minutes}m`}
          </p>
        </div>
        {showHistoryLink && (
          <Button asChild size="sm" variant="ghost" className="h-8 gap-1.5 text-xs">
            <Link to={"/erp/hr/me" as never}>
              <CalendarDays className="size-3.5" /> My attendance
            </Link>
          </Button>
        )}
      </div>

      <div className={cn("mt-4 flex flex-wrap items-end justify-between gap-4", compact && "mt-3")}>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {state === "on_break" ? "Break time" : "Worked today"}
          </div>
          <div
            className={cn(
              "font-mono font-bold tabular-nums leading-none tracking-tight",
              compact ? "text-3xl" : "text-5xl",
            )}
          >
            {state === "on_break" && currentBreakStart
              ? hms((Date.now() + offsetRef.current - Date.parse(currentBreakStart)) / 1000)
              : hms(worked)}
          </div>
          <div className="mt-1.5 text-xs text-muted-foreground">
            {firstIn ? <>In {clock(firstIn)}</> : "Not checked in yet"}
            {state === "on_break" && <> · Worked {hm(worked / 60)}</>}
            {onBreakSecs > 0 && state !== "on_break" && <> · Break {hm(onBreakSecs / 60)}</>}
            {breakLeft < 0 && (
              <span className="text-rose-600"> · {hm(-breakLeft / 60)} over break</span>
            )}
          </div>
        </div>

        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {state === "off" && (
            <Button
              size="lg"
              disabled={busy}
              onClick={() => m.mutate("check_in")}
              className="h-14 flex-1 gap-2 rounded-xl bg-emerald-600 px-8 text-base font-semibold text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 sm:flex-none"
            >
              {busy ? <Loader2 className="size-5 animate-spin" /> : <LogIn className="size-5" />}{" "}
              Check in
            </Button>
          )}
          {state === "working" && (
            <>
              <Button
                size="lg"
                variant="outline"
                disabled={busy}
                onClick={() => m.mutate("break_start")}
                className="h-14 flex-1 gap-2 rounded-xl border-sky-500/40 px-6 text-base font-semibold sm:flex-none"
              >
                {busy ? <Loader2 className="size-5 animate-spin" /> : <Coffee className="size-5" />}{" "}
                Break
              </Button>
              <Button
                size="lg"
                variant="outline"
                disabled={busy}
                onClick={() => setConfirmOut(true)}
                className="h-14 flex-1 gap-2 rounded-xl border-rose-500/40 px-6 text-base font-semibold text-rose-700 hover:bg-rose-50 sm:flex-none dark:text-rose-400"
              >
                <LogOut className="size-5" /> Check out
              </Button>
            </>
          )}
          {state === "on_break" && (
            <>
              <Button
                size="lg"
                disabled={busy}
                onClick={() => m.mutate("break_end")}
                className="h-14 flex-1 gap-2 rounded-xl bg-sky-600 px-8 text-base font-semibold text-white shadow-lg shadow-sky-600/25 hover:bg-sky-700 sm:flex-none"
              >
                {busy ? <Loader2 className="size-5 animate-spin" /> : <Play className="size-5" />}{" "}
                Resume work
              </Button>
              <Button
                size="lg"
                variant="ghost"
                disabled={busy}
                onClick={() => setConfirmOut(true)}
                className="h-14 gap-2 rounded-xl px-4 text-rose-700"
              >
                <LogOut className="size-5" /> Check out
              </Button>
            </>
          )}
        </div>
      </div>

      {!compact && sched > 0 && (
        <div className="mt-5">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                pct >= 100 ? "bg-emerald-600" : "bg-emerald-500/80",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span>
              {Math.round(pct)}% of {hm(emp.sched_minutes)}
            </span>
            {worked > sched && (
              <span className="font-medium text-emerald-700">
                +{hm((worked - sched) / 60)} extra
              </span>
            )}
          </div>
        </div>
      )}

      {!compact && data.sessions.length > 0 && (
        <ol className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {data.sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-2">
              <span>
                <span className="text-foreground">In</span> {clock(s.check_in)}
              </span>
              {s.breaks.map((b, i) => (
                <span key={i}>
                  · <span className="text-sky-700">Break</span> {clock(b.start)}
                  {b.end ? `–${clock(b.end)}` : "…"}
                </span>
              ))}
              {s.check_out && (
                <span>
                  · <span className="text-foreground">Out</span> {clock(s.check_out)}
                  {s.auto_closed ? " (auto)" : ""}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      <AlertDialog open={confirmOut} onOpenChange={setConfirmOut}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Check out করবেন?</AlertDialogTitle>
            <AlertDialogDescription>
              আজ কাজ করেছেন {hm(worked / 60)}। পরে আবার আসলে আবার Check in দিতে পারবেন।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>না</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => m.mutate("check_out")}
              className="bg-rose-600 hover:bg-rose-700"
            >
              হ্যাঁ, Check out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export type { MyStatus };
