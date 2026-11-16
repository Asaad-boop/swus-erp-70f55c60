import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarHeart, Check, Palmtree, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataPanel, EmptyState } from "@/components/erp/ui";
import { HrPage, NoAccess, useHrRole } from "@/components/erp/hr/hr-shell";
import { cn } from "@/lib/utils";
import {
  addHoliday,
  decideLeave,
  deleteLeave,
  listEmployees,
  listHolidays,
  listLeaves,
  removeHoliday,
  saveLeave,
} from "@/lib/erp/hr/api";
import { addDays, dayLabel, dhakaToday, errorText } from "@/lib/erp/hr/format";

export const Route = createFileRoute("/_authenticated/erp/hr/leaves")({
  head: () => ({ meta: [{ title: "Leave & Holidays — HRM" }] }),
  component: LeavesPage,
});

const fmt = (d: string) => dayLabel(d, { day: "numeric", month: "short", year: "numeric" });

function LeavesPage() {
  const { isManager, isLoading } = useHrRole();
  const qc = useQueryClient();
  const today = dhakaToday();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["hr"] });

  const emps = useQuery({
    queryKey: ["hr", "employees"],
    enabled: isManager,
    queryFn: listEmployees,
  });
  const leaves = useQuery({
    queryKey: ["hr", "leaves"],
    enabled: isManager,
    queryFn: () => listLeaves(addDays(today, -120)),
  });
  const holidays = useQuery({
    queryKey: ["hr", "holidays"],
    enabled: isManager,
    queryFn: listHolidays,
  });
  const nameOf = useMemo(
    () => new Map((emps.data ?? []).map((e) => [e.id, e.full_name])),
    [emps.data],
  );

  const [emp, setEmp] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [paid, setPaid] = useState(true);
  const [reason, setReason] = useState("");
  const [hDate, setHDate] = useState(today);
  const [hTitle, setHTitle] = useState("");

  const add = useMutation({
    mutationFn: () => {
      if (!emp) throw new Error("Employee বাছাই করুন");
      return saveLeave({ id: null, employeeId: emp, start, end, paid, reason });
    },
    onSuccess: () => {
      toast.success("Leave added");
      setReason("");
      refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const decide = useMutation({
    mutationFn: (v: { id: string; approve: boolean }) => decideLeave(v.id, v.approve),
    onSuccess: (_d, v) => {
      toast.success(v.approve ? "Approved" : "Rejected");
      refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const del = useMutation({
    mutationFn: deleteLeave,
    onSuccess: refresh,
    onError: (e) => toast.error(errorText(e)),
  });
  const addH = useMutation({
    mutationFn: () => {
      if (!hTitle.trim()) throw new Error("ছুটির নাম দিন");
      return addHoliday(hDate, hTitle.trim());
    },
    onSuccess: () => {
      toast.success("Holiday added");
      setHTitle("");
      refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const delH = useMutation({
    mutationFn: removeHoliday,
    onSuccess: refresh,
    onError: (e) => toast.error(errorText(e)),
  });

  if (isLoading)
    return (
      <div className="p-6">
        <Skeleton className="h-40" />
      </div>
    );
  if (!isManager) return <NoAccess what="leave management" />;

  const pending = (leaves.data ?? []).filter((l) => l.status === "pending");
  const others = (leaves.data ?? []).filter((l) => l.status !== "pending");
  const upcomingHolidays = (holidays.data ?? []).filter(
    (h) => h.holiday_date >= addDays(today, -31),
  );

  return (
    <HrPage
      title="Leave & Holidays"
      subtitle="Approved paid leave বেতন কাটে না, unpaid leave কাটে। Holiday সবার জন্য paid ছুটি।"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <DataPanel
            title={`Pending requests${pending.length ? ` (${pending.length})` : ""}`}
            icon={<Palmtree className="size-4" />}
            flush
          >
            {pending.length === 0 ? (
              <EmptyState compact title="No pending leave requests" />
            ) : (
              <ul className="divide-y text-sm">
                {pending.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <div className="font-medium">{nameOf.get(l.employee_id) ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {fmt(l.start_date)}
                        {l.end_date !== l.start_date && ` → ${fmt(l.end_date)}`} ·{" "}
                        {l.paid ? "Paid" : "Unpaid"}
                        {l.reason ? ` · ${l.reason}` : ""}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-emerald-700"
                        onClick={() => decide.mutate({ id: l.id, approve: true })}
                      >
                        <Check className="size-3.5" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1 text-rose-700"
                        onClick={() => decide.mutate({ id: l.id, approve: false })}
                      >
                        <X className="size-3.5" /> Reject
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DataPanel>

          <DataPanel title="Add leave for an employee">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label className="text-xs">Employee</Label>
                <Select value={emp} onValueChange={setEmp}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {(emps.data ?? [])
                      .filter((e) => e.status === "active" || e.status === "probation")
                      .map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.full_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
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
                <Input
                  type="date"
                  min={start}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Reason</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={paid} onCheckedChange={setPaid} /> Paid leave
              </label>
              <div className="text-right">
                <Button
                  size="sm"
                  disabled={add.isPending}
                  onClick={() => add.mutate()}
                  className="gap-1.5"
                >
                  <Plus className="size-4" /> Add leave
                </Button>
              </div>
            </div>
          </DataPanel>

          <DataPanel title="Recent leave" flush>
            {leaves.isLoading ? (
              <div className="p-4">
                <Skeleton className="h-24" />
              </div>
            ) : others.length === 0 ? (
              <EmptyState compact title="No leave yet" />
            ) : (
              <ul className="divide-y text-sm">
                {others.slice(0, 30).map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div>
                      <div className="font-medium">{nameOf.get(l.employee_id) ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {fmt(l.start_date)}
                        {l.end_date !== l.start_date && ` → ${fmt(l.end_date)}`} ·{" "}
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
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {l.status}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={() => {
                          if (confirm("Delete this leave?")) del.mutate(l.id);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DataPanel>
        </div>

        <DataPanel
          title="Public holidays"
          icon={<CalendarHeart className="size-4" />}
          description="এই দিনগুলোতে কেউ absent হবে না। কাজ করলে পুরোটা overtime।"
        >
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={hDate} onChange={(e) => setHDate(e.target.value)} />
            </div>
            <div className="min-w-[180px] flex-1">
              <Label className="text-xs">Name</Label>
              <Input
                placeholder="Victory Day"
                value={hTitle}
                onChange={(e) => setHTitle(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              disabled={addH.isPending}
              onClick={() => addH.mutate()}
              className="gap-1.5"
            >
              <Plus className="size-4" /> Add
            </Button>
          </div>
          <ul className="mt-4 divide-y rounded-lg border text-sm">
            {upcomingHolidays.length === 0 && (
              <li className="px-3 py-6 text-center text-muted-foreground">No holidays added</li>
            )}
            {upcomingHolidays.map((h) => (
              <li
                key={h.id}
                className={cn(
                  "flex items-center justify-between px-3 py-2",
                  h.holiday_date < today && "opacity-60",
                )}
              >
                <div>
                  <span className="font-medium">{h.title}</span>{" "}
                  <span className="text-muted-foreground">
                    ·{" "}
                    {dayLabel(h.holiday_date, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={() => delH.mutate(h.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </DataPanel>
      </div>
    </HrPage>
  );
}
