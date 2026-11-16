import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Clock, Coffee, LogIn, ScanLine, UserX, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { DataPanel, EmptyState, StatCard } from "@/components/erp/ui";
import { HrPage, NoAccess, useHrRole } from "@/components/erp/hr/hr-shell";
import { DayStatusBadge } from "@/components/erp/hr/day-status-badge";
import { PunchCard } from "@/components/erp/hr/punch-card";
import { cn } from "@/lib/utils";
import {
  getActivity,
  getAttendanceDays,
  type AttendanceDay,
  type DayStatus,
} from "@/lib/erp/hr/api";
import { clock, dhakaToday, dhakaToIso, addDays, hm } from "@/lib/erp/hr/format";
import { statusBadge } from "@/lib/erp/orders";

export const Route = createFileRoute("/_authenticated/erp/hr/")({
  head: () => ({ meta: [{ title: "Team Today — HRM" }] }),
  component: TeamTodayPage,
});

const ORDER: DayStatus[] = [
  "working",
  "on_break",
  "late",
  "present",
  "not_yet",
  "absent",
  "leave",
  "holiday",
  "off",
];

function TeamTodayPage() {
  const { isManager, isLoading } = useHrRole();
  const today = dhakaToday();
  const [filter, setFilter] = useState<"all" | DayStatus>("all");

  const days = useQuery({
    queryKey: ["hr", "team-today", today],
    enabled: isManager,
    queryFn: () => getAttendanceDays(today, today),
    refetchInterval: 30_000,
  });
  const feed = useQuery({
    queryKey: ["hr", "feed-today", today],
    enabled: isManager,
    queryFn: () =>
      getActivity(dhakaToIso(today, "00:00"), dhakaToIso(addDays(today, 1), "00:00"), null, 40),
    refetchInterval: 30_000,
  });

  const rows = useMemo(
    () =>
      (days.data ?? [])
        .filter((r) => r.status !== "not_employed")
        .sort(
          (a, b) =>
            ORDER.indexOf(a.status) - ORDER.indexOf(b.status) ||
            a.employee_name.localeCompare(b.employee_name),
        ),
    [days.data],
  );
  const count = (s: DayStatus[]) => rows.filter((r) => s.includes(r.status)).length;
  const shown =
    filter === "all"
      ? rows
      : rows.filter((r) => r.status === filter || (filter === "present" && r.status === "late"));

  if (isLoading)
    return (
      <div className="p-6">
        <Skeleton className="h-40" />
      </div>
    );
  if (!isManager) {
    return (
      <HrPage title="Attendance">
        <PunchCard />
      </HrPage>
    );
  }

  const chips: { key: "all" | DayStatus; label: string; n: number }[] = [
    { key: "all", label: "All", n: rows.length },
    { key: "working", label: "Working", n: count(["working"]) },
    { key: "on_break", label: "On break", n: count(["on_break"]) },
    { key: "present", label: "Checked out", n: count(["present", "late"]) },
    { key: "not_yet", label: "Not in yet", n: count(["not_yet"]) },
    { key: "absent", label: "Absent", n: count(["absent"]) },
    { key: "leave", label: "Leave", n: count(["leave"]) },
  ];

  return (
    <HrPage
      live
      title="Team Today"
      subtitle="কে এসেছে, কে break-এ, কে late — live, প্রতি ৩০ সেকেন্ডে আপডেট।"
      actions={
        <Button asChild size="sm" variant="outline">
          <Link to={"/erp/hr/attendance" as never}>Full attendance log</Link>
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard
          icon={<LogIn className="size-3.5" />}
          label="Working now"
          value={count(["working"])}
        />
        <StatCard
          icon={<Coffee className="size-3.5" />}
          label="On break"
          value={count(["on_break"])}
        />
        <StatCard
          icon={<Clock className="size-3.5" />}
          label="Late today"
          value={rows.filter((r) => r.late_min > 0).length}
        />
        <StatCard
          icon={<UserX className="size-3.5" />}
          label="Absent / not in"
          value={count(["absent", "not_yet"])}
        />
        <StatCard
          icon={<Users className="size-3.5" />}
          label="Scheduled today"
          value={rows.filter((r) => r.day_type === "workday").length}
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === c.key
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:bg-muted",
            )}
          >
            {c.label} <span className="tabular-nums opacity-70">{c.n}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        <div>
          {days.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : shown.length === 0 ? (
            <DataPanel>
              <EmptyState
                icon={<Users className="size-5" />}
                title={rows.length ? "No one in this filter" : "No employees yet"}
                description={rows.length ? undefined : "Add your staff from HR → Employees."}
                action={
                  rows.length ? undefined : (
                    <Button asChild size="sm">
                      <Link to={"/erp/hr/employees" as never}>Add employee</Link>
                    </Button>
                  )
                }
              />
            </DataPanel>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {shown.map((r) => (
                <PersonCard key={r.employee_id} r={r} />
              ))}
            </div>
          )}
        </div>

        <DataPanel
          title="Live activity"
          icon={<Activity className="size-4" />}
          flush
          actions={
            <Link
              to={"/erp/hr/performance" as never}
              className="text-xs text-primary hover:underline"
            >
              Performance →
            </Link>
          }
        >
          {feed.isLoading ? (
            <div className="p-4">
              <Skeleton className="h-32" />
            </div>
          ) : !(feed.data ?? []).length ? (
            <EmptyState compact title="আজ এখনো কোনো order action নেই" />
          ) : (
            <ul className="max-h-[560px] divide-y overflow-y-auto text-sm">
              {feed.data!.map((a, i) => (
                <li key={`${a.order_id}-${a.at}-${i}`} className="flex items-start gap-3 px-4 py-2">
                  <span className="mt-0.5 w-16 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {clock(a.at)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">
                      <span className="font-medium">{a.name}</span>
                      <span className="text-muted-foreground"> → </span>
                      <span className="font-mono text-xs">
                        {a.invoice_no ?? a.order_id.slice(0, 8)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      {a.from_status ? `${statusBadge(a.from_status as never).label} → ` : ""}
                      {statusBadge(a.to_status as never).label}
                      {a.via === "scan" && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 text-primary">
                          <ScanLine className="size-3" /> scan
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DataPanel>
      </div>
    </HrPage>
  );
}

function PersonCard({ r }: { r: AttendanceDay }) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3.5 transition-shadow hover:shadow-sm",
        r.status === "working" && "border-emerald-500/30",
        r.status === "on_break" && "border-sky-500/30",
        r.status === "absent" && "border-rose-500/25",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold">{r.employee_name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {r.designation ?? r.employee_code}
          </div>
        </div>
        <DayStatusBadge status={r.status} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-muted-foreground">In</div>
          <div className="font-medium tabular-nums">{clock(r.first_in)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Worked</div>
          <div className="font-medium tabular-nums">{r.session_count ? hm(r.worked_min) : "—"}</div>
        </div>
        <div>
          <div className="text-muted-foreground">{r.is_open ? "Break" : "Out"}</div>
          <div className="font-medium tabular-nums">
            {r.is_open ? hm(r.break_min) : clock(r.last_out)}
          </div>
        </div>
      </div>
      {(r.late_min > 0 || r.ot_min > 0 || r.holiday_title) && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          {r.late_min > 0 && (
            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-700">
              Late {r.late_min}m
            </span>
          )}
          {r.ot_min > 0 && (
            <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700">
              OT {hm(r.ot_min)}
            </span>
          )}
          {r.holiday_title && (
            <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-violet-700">
              {r.holiday_title}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
