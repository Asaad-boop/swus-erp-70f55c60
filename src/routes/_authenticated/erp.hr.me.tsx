import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Palmtree, Printer, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { DataPanel, StatCard } from "@/components/erp/ui";
import { HrPage } from "@/components/erp/hr/hr-shell";
import { PunchCard, MY_STATUS_KEY } from "@/components/erp/hr/punch-card";
import { DayStatusBadge } from "@/components/erp/hr/day-status-badge";
import { printPayslip } from "@/components/erp/hr/payslip-print";
import { cn } from "@/lib/utils";
import {
  cancelMyLeave,
  getAttendanceDays,
  getMyStatus,
  listLeaves,
  listMyPayslips,
  requestLeave,
} from "@/lib/erp/hr/api";
import {
  addDays,
  clock,
  dayLabel,
  dhakaToday,
  errorText,
  hm,
  money,
  monthEnd,
  monthLabel,
  monthStart,
} from "@/lib/erp/hr/format";

export const Route = createFileRoute("/_authenticated/erp/hr/me")({
  head: () => ({ meta: [{ title: "My Attendance — HRM" }] }),
  component: MyAttendancePage,
});

function MyAttendancePage() {
  const today = dhakaToday();
  const [month, setMonth] = useState(monthStart(today));
  const from = month;
  const to = monthEnd(month) > today ? today : monthEnd(month);

  const status = useQuery({ queryKey: MY_STATUS_KEY, queryFn: getMyStatus });
  const employeeId = status.data?.linked ? status.data.employee.id : null;

  const days = useQuery({
    queryKey: ["hr", "my-days", from, to, employeeId],
    enabled: Boolean(employeeId) && to >= from,
    queryFn: () => getAttendanceDays(from, to, employeeId),
  });

  const rows = useMemo(() => [...(days.data ?? [])].reverse(), [days.data]);
  const sum = useMemo(() => {
    const d = days.data ?? [];
    return {
      present: d.filter((x) => ["present", "late", "working", "on_break"].includes(x.status))
        .length,
      late: d.filter((x) => x.late_min > 0).length,
      absent: d.filter((x) => x.status === "absent").length,
      worked: d.reduce((s, x) => s + x.worked_min, 0),
      ot: d.reduce((s, x) => s + x.ot_min, 0),
    };
  }, [days.data]);

  const shiftMonth = (n: number) => {
    const d = new Date(`${month}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 10));
  };

  return (
    <HrPage
      title="My Attendance"
      subtitle="Check in, take breaks, check out — and see your full history."
    >
      <PunchCard showHistoryLink={false} />

      {status.data?.linked && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" onClick={() => shiftMonth(-1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <div className="min-w-[140px] text-center text-sm font-semibold">
                {monthLabel(month)}
              </div>
              <Button
                size="icon"
                variant="ghost"
                disabled={month >= monthStart(today)}
                onClick={() => shiftMonth(1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard label="Present days" value={sum.present} />
            <StatCard label="Late days" value={sum.late} />
            <StatCard label="Absent" value={sum.absent} />
            <StatCard label="Worked" value={hm(sum.worked)} />
            <StatCard label="Overtime" value={hm(sum.ot)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
            <DataPanel title="Daily log" flush>
              {days.isLoading ? (
                <div className="p-4">
                  <Skeleton className="h-40 w-full" />
                </div>
              ) : (
                <div className="divide-y">
                  {rows
                    .filter((r) => r.status !== "not_employed")
                    .map((r) => (
                      <div
                        key={r.work_date}
                        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm"
                      >
                        <div className="w-28 shrink-0 font-medium">{dayLabel(r.work_date)}</div>
                        <DayStatusBadge status={r.status} />
                        <div className="text-muted-foreground">
                          {r.first_in ? (
                            <>
                              {clock(r.first_in)} → {r.is_open ? "now" : clock(r.last_out)}
                            </>
                          ) : (
                            (r.holiday_title ?? "")
                          )}
                        </div>
                        <div className="ml-auto flex gap-3 text-xs tabular-nums text-muted-foreground">
                          {r.worked_min > 0 && (
                            <span className="text-foreground">{hm(r.worked_min)}</span>
                          )}
                          {r.break_min > 0 && <span>break {hm(r.break_min)}</span>}
                          {r.late_min > 0 && (
                            <span className="text-amber-700">late {r.late_min}m</span>
                          )}
                          {r.ot_min > 0 && (
                            <span className="text-emerald-700">OT {hm(r.ot_min)}</span>
                          )}
                          {r.auto_closed && <span className="text-rose-600">auto check-out</span>}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </DataPanel>

            <div className="space-y-4">
              <LeaveBox />
              <PayslipBox />
            </div>
          </div>
        </>
      )}
    </HrPage>
  );
}

function LeaveBox() {
  const qc = useQueryClient();
  const today = dhakaToday();
  const [start, setStart] = useState(addDays(today, 1));
  const [end, setEnd] = useState(addDays(today, 1));
  const [paid, setPaid] = useState(true);
  const [reason, setReason] = useState("");
  const leaves = useQuery({
    queryKey: ["hr", "my-leaves"],
    queryFn: () => listLeaves(addDays(today, -90)),
  });

  const req = useMutation({
    mutationFn: () => requestLeave(start, end, paid, reason),
    onSuccess: () => {
      toast.success("Leave request পাঠানো হয়েছে");
      setReason("");
      void qc.invalidateQueries({ queryKey: ["hr"] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelMyLeave(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr"] }),
    onError: (e) => toast.error(errorText(e)),
  });

  return (
    <DataPanel title="Leave" icon={<Palmtree className="size-4" />}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (e.target.value > end) setEnd(e.target.value);
              }}
            />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <Textarea
          rows={2}
          placeholder="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={paid} onCheckedChange={setPaid} /> Paid leave
          </label>
          <Button
            size="sm"
            disabled={req.isPending}
            onClick={() => req.mutate()}
            className="gap-1.5"
          >
            <Send className="size-3.5" /> Request
          </Button>
        </div>
        {(leaves.data ?? []).length > 0 && (
          <ul className="divide-y rounded-lg border text-sm">
            {leaves.data!.slice(0, 6).map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div>
                  <div className="font-medium">
                    {dayLabel(l.start_date, { day: "numeric", month: "short" })}
                    {l.end_date !== l.start_date &&
                      ` – ${dayLabel(l.end_date, { day: "numeric", month: "short" })}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {l.paid ? "Paid" : "Unpaid"}
                    {l.reason ? ` · ${l.reason}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
                      l.status === "approved"
                        ? "bg-emerald-500/10 text-emerald-700"
                        : l.status === "pending"
                          ? "bg-amber-500/10 text-amber-700"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {l.status}
                  </span>
                  {l.status === "pending" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      onClick={() => cancel.mutate(l.id)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DataPanel>
  );
}

function PayslipBox() {
  const slips = useQuery({ queryKey: ["hr", "my-payslips"], queryFn: listMyPayslips });
  if (!slips.data?.length) return null;
  return (
    <DataPanel title="My payslips" flush>
      <ul className="divide-y text-sm">
        {slips.data.map((p) => (
          <li key={p.id} className="flex items-center justify-between px-4 py-2.5">
            <div>
              <div className="font-medium">{p.run?.title ?? "Payslip"}</div>
              <div className="text-xs text-muted-foreground capitalize">
                {p.run?.status}
                {p.run?.paid_on ? ` · ${p.run.paid_on}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold tabular-nums">{money(p.net_pay)}</span>
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                onClick={() => p.run && printPayslip(p, p.run)}
              >
                <Printer className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </DataPanel>
  );
}
