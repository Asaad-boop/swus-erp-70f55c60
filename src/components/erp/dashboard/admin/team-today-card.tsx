import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getLiveBoard, type LiveEmployee } from "@/lib/erp/hr/attendance.functions";
import { cn } from "@/lib/utils";

const clock = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Dhaka",
      })
    : "—";

const STATE: Record<LiveEmployee["state"], { label: string; cls: string }> = {
  present: { label: "Working", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  on_break: { label: "On break", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  left: { label: "Left", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  not_in: { label: "Not in", cls: "bg-slate-50 text-slate-500 border-slate-200" },
};

/** Admin view: who came to office today and who is actually working right now. */
export function TeamTodayCard() {
  const fetchBoard = useServerFn(getLiveBoard);
  const q = useQuery({
    queryKey: ["dash-team-today"],
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: () => fetchBoard({ data: {} }),
  });

  const rows = q.data?.rows ?? [];
  const counts = {
    checkedIn: rows.filter((r) => r.state !== "not_in").length,
    working: rows.filter((r) => r.state === "present").length,
    onBreak: rows.filter((r) => r.state === "on_break").length,
    notIn: rows.filter((r) => r.state === "not_in").length,
  };
  const ordered = [...rows].sort((a, b) => {
    const rank = (s: LiveEmployee["state"]) =>
      s === "present" ? 0 : s === "on_break" ? 1 : s === "left" ? 2 : 3;
    return rank(a.state) - rank(b.state) || a.full_name.localeCompare(b.full_name);
  });

  return (
    <Card className="border-slate-200 shadow-none">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-[13px] font-semibold flex items-center gap-1.5">
          <Users className="size-3.5 text-indigo-600" /> Team today
        </CardTitle>
        <Link to="/erp/hr/live" className="text-[11px] text-indigo-600 hover:underline">
          Live board
        </Link>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-[12px] text-slate-500">কোনো active employee নেই।</p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2">
              <Metric label="Checked in" value={counts.checkedIn} />
              <Metric label="Working" value={counts.working} tone="emerald" />
              <Metric label="On break" value={counts.onBreak} tone="amber" />
              <Metric label="Not in" value={counts.notIn} tone="slate" />
            </div>
            <ul className="mt-3 max-h-56 overflow-auto divide-y divide-slate-100">
              {ordered.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
                  <span className="truncate text-slate-700">{r.full_name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums text-slate-500">{clock(r.firstIn)}</span>
                    <span
                      className={cn(
                        "rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                        STATE[r.state].cls,
                      )}
                    >
                      {STATE[r.state].label}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "emerald" | "amber" | "slate";
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/60 p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={cn(
          "text-lg font-bold tabular-nums",
          tone === "emerald" && "text-emerald-600",
          tone === "amber" && "text-amber-600",
          tone === "slate" && "text-slate-400",
        )}
      >
        {value}
      </div>
    </div>
  );
}
