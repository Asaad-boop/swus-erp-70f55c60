import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  LogIn, LogOut, Clock, CalendarDays, ArrowRight, ListChecks, Coffee,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCurrentRole } from "@/hooks/use-current-role";
import { useMyAllowedPages } from "@/hooks/use-my-allowed-pages";
import { resolveAccess } from "@/lib/erp/access";
import { NAV_PAGES } from "@/lib/erp/nav";
import { useBrand } from "@/contexts/brand-context";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import {
  getMyAttendanceToday, punchIn, punchOut,
} from "@/lib/erp/hr/attendance.functions";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const hhmm = (mins: number) =>
  `${Math.floor(mins / 60)}h ${String(Math.round(mins % 60)).padStart(2, "0")}m`;

/** Personal, money-free dashboard for non-admin staff. */
export function EmployeeDashboard() {
  const { roles } = useCurrentRole();
  const { allowedPages, pageMode } = useMyAllowedPages();
  const { brandIds } = useBrand();
  const qc = useQueryClient();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const fetchToday = useServerFn(getMyAttendanceToday);
  const inFn = useServerFn(punchIn);
  const outFn = useServerFn(punchOut);

  const { data: att, isLoading: attLoading } = useQuery({
    queryKey: ["hr-my-attendance"],
    queryFn: () => fetchToday(),
    refetchInterval: 60_000,
  });

  const punch = useMutation<unknown, Error, "in" | "out">({
    mutationFn: async (kind) => (kind === "in" ? await inFn() : await outFn()),
    onSuccess: (_d, kind) => {
      toast.success(kind === "in" ? "Check in hoyeche" : "Check out hoyeche");
      void qc.invalidateQueries({ queryKey: ["hr-my-attendance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const entries = att?.entries ?? [];
  const open = entries.find((e: any) => !e.check_out);
  const workMins = useMemo(() => {
    void tick;
    const now = Date.now();
    let ms = 0;
    for (const e of entries as any[]) {
      ms += (e.check_out ? Date.parse(e.check_out) : now) - Date.parse(e.check_in);
      for (const b of e.breaks ?? []) {
        ms -= (b.break_end ? Date.parse(b.break_end) : now) - Date.parse(b.break_start);
      }
    }
    return Math.max(0, ms / 60000);
  }, [entries, tick]);

  // ---- role-scoped work queues (counts only, no money) ----
  const can = (p: string) => resolveAccess(roles, allowedPages, p, pageMode);
  const { data: queues } = useQuery({
    queryKey: ["emp-queues", brandIds.join(","), roles.join(",")],
    enabled: brandIds.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [toConfirm, toPack, inTransit] = await Promise.all([
        applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds)
          .in("status", ["new" as any, "processing" as any]),
        applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds)
          .in("status", ["confirmed" as any, "packaging" as any]),
        applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds)
          .in("status", ["shipped" as any, "in_transit" as any]),
      ]);
      return {
        toConfirm: toConfirm.count ?? 0,
        toPack: toPack.count ?? 0,
        inTransit: inTransit.count ?? 0,
      };
    },
  });

  const tasks = [
    { label: "Orders to confirm", v: queues?.toConfirm ?? 0, to: "/erp/orders/list", show: can("/erp/orders/list") },
    { label: "Ready to pack", v: queues?.toPack ?? 0, to: "/erp/dispatch", show: can("/erp/dispatch") },
    { label: "In transit", v: queues?.inTransit ?? 0, to: "/erp/courier", show: can("/erp/courier") },
  ].filter((t) => t.show);

  const quickLinks = useMemo(
    () =>
      NAV_PAGES.filter((p) => p.path !== "/erp" && resolveAccess(roles, allowedPages, p.path, pageMode)).slice(0, 12),
    [roles, allowedPages, pageMode],
  );

  const employeeLinked = Boolean(att?.employee);
  const employeeId = att?.employee?.id as string | undefined;

  // Personal month summary (no money): present days, late, OT, pending leaves.
  const { data: mine } = useQuery({
    queryKey: ["emp-month-summary", employeeId],
    enabled: Boolean(employeeId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const [{ data: rows }, { data: leaves }] = await Promise.all([
        supabase
          .from("hr_attendance")
          .select("work_minutes, late_minutes, overtime_minutes, status, work_date")
          .eq("employee_id", employeeId!)
          .gte("work_date", start),
        supabase
          .from("hr_leaves")
          .select("id, status, start_date, end_date, days")
          .eq("employee_id", employeeId!)
          .order("start_date", { ascending: false })
          .limit(20),
      ]);
      const list = rows ?? [];
      return {
        present: list.filter((r) => String(r.status) === "present").length,
        lateDays: list.filter((r) => Number(r.late_minutes ?? 0) > 0).length,
        otMins: list.reduce((s, r) => s + Number(r.overtime_minutes ?? 0), 0),
        workedMins: list.reduce((s, r) => s + Number(r.work_minutes ?? 0), 0),
        pendingLeaves: (leaves ?? []).filter((l) => String(l.status) === "pending").length,
        approvedDays: (leaves ?? [])
          .filter((l) => String(l.status) === "approved")
          .reduce((s, l) => s + Number(l.days ?? 0), 0),
      };
    },
  });

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="border-b border-border/60 bg-background/90 sticky top-0 z-20 backdrop-blur">
        <div className="px-4 md:px-6 py-3 max-w-[1200px] mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold tracking-tight truncate">
              {greeting()}, {att?.employee?.full_name ?? "there"}
            </h1>
            <p className="text-[12px] text-muted-foreground">
              {new Date().toLocaleDateString("en-GB", { weekday: "long", month: "short", day: "numeric" })}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
            My workspace
          </span>
        </div>
      </div>

      <div className="px-4 md:px-6 py-4 max-w-[1200px] mx-auto space-y-4">
        {/* MY DAY */}
        <section className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
            My day
          </div>
          {attLoading ? (
            <Skeleton className="mt-3 h-20 w-full" />
          ) : !employeeLinked ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Tomar account kono employee profile er sathe link kora nei. HR ke bolo.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  <Clock className="size-3.5" /> Worked today
                </div>
                <div className="font-bold text-3xl tabular-nums leading-tight">{hhmm(workMins)}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  <Coffee className="size-3.5" /> Status
                </div>
                <div className={cn("font-semibold text-sm", open ? "text-emerald-600" : "text-muted-foreground")}>
                  {open ? "Checked in" : entries.length ? "Checked out" : "Not started"}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={punch.isPending}
                  variant={open ? "outline" : "default"}
                  onClick={() => punch.mutate(open ? "out" : "in")}
                  className="gap-1.5"
                >
                  {open ? <LogOut className="size-4" /> : <LogIn className="size-4" />}
                  {open ? "Check out" : "Check in"}
                </Button>
                <Button asChild size="sm" variant="ghost" className="gap-1.5">
                  <Link to={"/erp/hr/my-attendance" as any}>
                    <CalendarDays className="size-4" /> Attendance
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* MY TASKS */}
        {employeeLinked && (
          <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Present days", v: String(mine?.present ?? 0) },
              { label: "Worked (month)", v: hhmm(mine?.workedMins ?? 0) },
              { label: "Overtime", v: hhmm(mine?.otMins ?? 0) },
              { label: "Late days", v: String(mine?.lateDays ?? 0) },
              { label: "Leave pending", v: String(mine?.pendingLeaves ?? 0) },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-border/60 bg-card p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
                <div className="mt-1 text-lg font-bold tabular-nums">{s.v}</div>
              </div>
            ))}
          </section>
        )}

        {tasks.length > 0 && (
          <section className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border/60 flex items-center gap-2">
              <ListChecks className="size-4 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
                My work queue
              </span>
            </div>
            <ul className="divide-y divide-border/60">
              {tasks.map((t) => (
                <li key={t.label}>
                  <Link
                    to={t.to as any}
                    className="flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors"
                  >
                    <span className="text-sm">{t.label}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-bold tabular-nums">{t.v}</span>
                      <ArrowRight className="size-3.5 text-muted-foreground" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* QUICK LINKS */}
        <section className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold mb-3">
            My pages
          </div>
          <div className="flex flex-wrap gap-2">
            {quickLinks.map((p) => (
              <Link
                key={p.path}
                to={p.path as any}
                className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs font-medium hover:bg-muted transition-colors"
              >
                {p.label}
              </Link>
            ))}
            {quickLinks.length === 0 && (
              <p className="text-sm text-muted-foreground">Kono page assign kora nei.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}