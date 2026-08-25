import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { fmtBdt } from "@/lib/erp/finance";
import { exportReportPdf, type Aoa } from "@/lib/erp/reports/export";
import { Panel, KpiStrip, EmptyState, ExportMenu, REPORT_QUERY_OPTS, type Kpi } from "@/components/erp/reports/report-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Summary = Record<string, number>;
type CashFlow = { opening: number; cash_in: number; cash_out: number; closing: number };
type Snapshot = {
  id: string;
  period_type: "day" | "month";
  period_start: string;
  period_end: string;
  brand_ids: string[];
  payload: { delivered?: Summary; created?: Summary; cash?: CashFlow };
  generated_at: string;
};
type Subscription = {
  id: string;
  name: string;
  frequency: "daily" | "monthly";
  channel: "sms" | "inapp";
  recipients: string[];
  brand_ids: string[];
  enabled: boolean;
  last_sent_at: string | null;
  last_result: string | null;
};

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dhakaToday = () => iso(new Date(Date.now() + 6 * 3600 * 1000));
const shiftDay = (day: string, delta: number) => iso(new Date(new Date(`${day}T00:00:00Z`).getTime() + delta * 86400000));
const monthOf = (day: string) => `${day.slice(0, 7)}-01`;

function summaryRows(s: Summary, cash?: CashFlow): Aoa {
  const rows: Aoa = [
    ["Metric", "Value"],
    ["Orders placed", n(s.orders_placed)],
    ["Delivered orders", n(s.delivered_orders)],
    ["Returned orders", n(s.returned_orders)],
    ["Cancelled orders", n(s.cancelled_orders)],
    ["Units sold", n(s.units_sold)],
    ["Gross sales", n(s.gross_sales)],
    ["Discounts", n(s.discounts)],
    ["Shipping income", n(s.shipping_income)],
    ["Total revenue", n(s.total_revenue ?? s.net_revenue)],
    ["COGS", n(s.cogs)],
    ["Gross profit", n(s.gross_profit)],
    ["Courier cost", n(s.courier_cost)],
    ["Packaging cost", n(s.packaging_cost)],
    ["Returned value", n(s.returned_value)],
    ["Contribution profit", n(s.contribution_profit)],
    ["AOV", n(s.aov)],
    ["Delivery rate %", n(s.delivery_rate)],
    ["Return rate %", n(s.return_rate)],
  ];
  if (cash) {
    rows.push(
      ["Opening cash", n(cash.opening)],
      ["Cash in", n(cash.cash_in)],
      ["Cash out", n(cash.cash_out)],
      ["Closing cash", n(cash.closing)],
    );
  }
  return rows;
}

function digestText(label: string, s: Summary, cash?: CashFlow) {
  return [
    `${label} summary`,
    `Revenue ${fmtBdt(n(s.total_revenue ?? s.net_revenue))} | Delivered ${n(s.delivered_orders)}`,
    `Orders ${n(s.orders_placed)} | Units ${n(s.units_sold)}`,
    `Profit ${fmtBdt(n(s.contribution_profit))} | Return ${n(s.returned_orders)}`,
    cash ? `Cash in ${fmtBdt(n(cash.cash_in))} | out ${fmtBdt(n(cash.cash_out))}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function ScheduledTab({ brandIds, enabled }: { brandIds: string[]; enabled: boolean }) {
  const qc = useQueryClient();
  const [day, setDay] = useState(() => shiftDay(dhakaToday(), -1));
  const [month, setMonth] = useState(() => monthOf(shiftDay(dhakaToday(), -1)));

  const dailyQ = useQuery({
    queryKey: ["rpt-sched-day", brandIds.join(","), day],
    enabled: enabled && !!day,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const base = { _brand_ids: brandIds, _from: day, _to: day };
      const [a, b, c] = await Promise.all([
        supabase.rpc("rpt_sales_summary", { ...base, _basis: "delivered" } as never),
        supabase.rpc("rpt_sales_summary", { ...base, _basis: "created" } as never),
        supabase.rpc("rpt_cash_flow", base as never),
      ]);
      if (a.error) throw a.error;
      return {
        delivered: (a.data ?? {}) as unknown as Summary,
        created: (b.data ?? {}) as unknown as Summary,
        cash: (c.data ?? {}) as unknown as CashFlow,
      };
    },
  });

  const monthEnd = useMemo(() => {
    const d = new Date(`${month}T00:00:00Z`);
    return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
  }, [month]);

  const monthQ = useQuery({
    queryKey: ["rpt-sched-month", brandIds.join(","), month],
    enabled: enabled && !!month,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const base = { _brand_ids: brandIds, _from: month, _to: monthEnd };
      const [a, c] = await Promise.all([
        supabase.rpc("rpt_sales_summary", { ...base, _basis: "delivered" } as never),
        supabase.rpc("rpt_cash_flow", base as never),
      ]);
      if (a.error) throw a.error;
      return { delivered: (a.data ?? {}) as unknown as Summary, cash: (c.data ?? {}) as unknown as CashFlow };
    },
  });

  const snapsQ = useQuery({
    queryKey: ["rpt-snapshots"],
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rpt_snapshots")
        .select("*")
        .order("period_start", { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data ?? []) as unknown as Snapshot[];
    },
  });

  const subsQ = useQuery({
    queryKey: ["rpt-subscriptions"],
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.from("rpt_subscriptions").select("*").order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Subscription[];
    },
  });

  const buildSnap = useMutation({
    mutationFn: async (v: { type: "day" | "month"; start: string }) => {
      const { error } = await supabase.rpc("rpt_build_snapshot", {
        _period_type: v.type,
        _period_start: v.start,
        _brand_ids: brandIds,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Snapshot archive kora holo");
      qc.invalidateQueries({ queryKey: ["rpt-snapshots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSub = useMutation({
    mutationFn: async (v: Partial<Subscription> & { id?: string }) => {
      if (v.id) {
        const { id, ...rest } = v;
        const { error } = await supabase.from("rpt_subscriptions").update(rest as never).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("rpt_subscriptions").insert(v as never);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rpt-subscriptions"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const delSub = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rpt_subscriptions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Subscription remove kora holo");
      qc.invalidateQueries({ queryKey: ["rpt-subscriptions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [draft, setDraft] = useState({ name: "Daily business summary", frequency: "daily", channel: "sms", recipients: "" });

  const d = dailyQ.data?.delivered;
  const kpis: Kpi[] = d
    ? [
        { label: "Revenue", value: n(d.total_revenue ?? d.net_revenue), hint: `${n(d.delivered_orders)} delivered` },
        { label: "Contribution profit", value: n(d.contribution_profit), tone: n(d.contribution_profit) >= 0 ? "good" : "bad" },
        { label: "Orders placed", value: n(d.orders_placed), kind: "number" },
        { label: "Units sold", value: n(d.units_sold), kind: "number" },
        { label: "Returns", value: n(d.returned_orders), kind: "number", goodWhen: "down" },
        { label: "Cash in", value: n(dailyQ.data?.cash?.cash_in) },
        { label: "Cash out", value: n(dailyQ.data?.cash?.cash_out), goodWhen: "down" },
        { label: "Closing cash", value: n(dailyQ.data?.cash?.closing) },
      ]
    : [];

  if (!enabled) return <EmptyState text="Select at least one brand." />;

  return (
    <div className="space-y-[var(--rpt-gap)]">
      {/* Daily business summary */}
      <Panel
        title="Daily business summary"
        subtitle="Closed-day snapshot — revenue, profit, orders and cash movement for a single Dhaka day."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={day} max={dhakaToday()} onChange={(e) => setDay(e.target.value)} className="h-7 w-[150px] text-xs" />
            <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => dailyQ.refetch()}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
            </Button>
            <Button
              size="sm"
              className="h-7 px-2.5 text-xs"
              disabled={!d || buildSnap.isPending}
              onClick={() => buildSnap.mutate({ type: "day", start: day })}
            >
              <CalendarClock className="mr-1.5 h-3.5 w-3.5" /> Archive day
            </Button>
            <ExportMenu
              disabled={!d}
              aoa={() => summaryRows(d ?? {}, dailyQ.data?.cash)}
              filename={`business-summary-${day}`}
              title="Daily business summary"
              subtitle="Delivered basis · cash on transaction date"
              rangeLabel={day}
              kpis={kpis}
            />
          </div>
        }
      >
        {dailyQ.isLoading ? <Skeleton className="h-28 w-full" /> : d ? <KpiStrip items={kpis} /> : <EmptyState text="No data for this day." />}
        {d && (
          <pre className="mt-4 whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/40 p-3 text-xs leading-relaxed">
            {digestText(day, d, dailyQ.data?.cash)}
          </pre>
        )}
      </Panel>

      {/* Monthly business report */}
      <Panel
        title="Monthly business report"
        subtitle="Official closed-month archive — export as PDF for records."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="month"
              value={month.slice(0, 7)}
              onChange={(e) => setMonth(`${e.target.value}-01`)}
              className="h-7 w-[140px] text-xs"
            />
            <Button
              size="sm"
              className="h-7 px-2.5 text-xs"
              disabled={!monthQ.data || buildSnap.isPending}
              onClick={() => buildSnap.mutate({ type: "month", start: month })}
            >
              <CalendarClock className="mr-1.5 h-3.5 w-3.5" /> Archive month
            </Button>
            <ExportMenu
              disabled={!monthQ.data}
              aoa={() => summaryRows(monthQ.data?.delivered ?? {}, monthQ.data?.cash)}
              filename={`monthly-report-${month.slice(0, 7)}`}
              title="Monthly business report"
              subtitle="Delivered basis · cash on transaction date"
              rangeLabel={`${month} → ${monthEnd}`}
            />
          </div>
        }
      >
        {monthQ.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : monthQ.data?.delivered ? (
          <KpiStrip
            items={[
              { label: "Revenue", value: n(monthQ.data.delivered.total_revenue ?? monthQ.data.delivered.net_revenue) },
              {
                label: "Contribution profit",
                value: n(monthQ.data.delivered.contribution_profit),
                tone: n(monthQ.data.delivered.contribution_profit) >= 0 ? "good" : "bad",
              },
              { label: "Delivered orders", value: n(monthQ.data.delivered.delivered_orders), kind: "number" },
              { label: "Closing cash", value: n(monthQ.data.cash?.closing) },
            ]}
          />
        ) : (
          <EmptyState text="No data for this month." />
        )}
      </Panel>

      {/* Archive */}
      <Panel title="Snapshot archive" subtitle="Locked-in period snapshots generated manually or by the scheduler." flush>
        {snapsQ.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (snapsQ.data ?? []).length === 0 ? (
          <div className="p-4">
            <EmptyState text="No snapshots yet — archive a day or month above." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(snapsQ.data ?? []).map((s) => {
                const sum = s.payload?.delivered ?? {};
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {s.period_type === "month" ? s.period_start.slice(0, 7) : s.period_start}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] uppercase">{s.period_type}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBdt(n(sum.total_revenue ?? sum.net_revenue))}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBdt(n(sum.contribution_profit))}</TableCell>
                    <TableCell className="text-right tabular-nums">{n(sum.delivered_orders)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(s.generated_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs"
                        onClick={() =>
                          exportReportPdf({
                            title: s.period_type === "month" ? "Monthly business report" : "Daily business summary",
                            subtitle: "Archived snapshot",
                            rangeLabel: `${s.period_start} → ${s.period_end}`,
                            aoa: summaryRows(sum, s.payload?.cash),
                          })
                        }
                      >
                        PDF
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>

      {/* Subscriptions */}
      <Panel
        title="Auto delivery"
        subtitle="Scheduler runs every morning (Dhaka) — archives yesterday, and on the 1st archives last month. Enabled subscriptions get an SMS digest."
      >
        <div className="grid gap-2 sm:grid-cols-[1fr_140px_120px_1fr_auto]">
          <Input
            placeholder="Name"
            value={draft.name}
            onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
            className="h-8 text-xs"
          />
          <Select value={draft.frequency} onValueChange={(v) => setDraft((p) => ({ ...p, frequency: v }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
          <Select value={draft.channel} onValueChange={(v) => setDraft((p) => ({ ...p, channel: v }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="inapp">Archive only</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="01XXXXXXXXX, 01XXXXXXXXX"
            value={draft.recipients}
            onChange={(e) => setDraft((p) => ({ ...p, recipients: e.target.value }))}
            className="h-8 text-xs"
          />
          <Button
            size="sm"
            className="h-8 px-3 text-xs"
            disabled={saveSub.isPending || !draft.name.trim()}
            onClick={() => {
              saveSub.mutate(
                {
                  name: draft.name.trim(),
                  frequency: draft.frequency as Subscription["frequency"],
                  channel: draft.channel as Subscription["channel"],
                  recipients: draft.recipients.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean),
                  brand_ids: brandIds,
                  enabled: true,
                },
                { onSuccess: () => setDraft((p) => ({ ...p, recipients: "" })) },
              );
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          {subsQ.isLoading && <Skeleton className="h-16 w-full" />}
          {(subsQ.data ?? []).length === 0 && !subsQ.isLoading && (
            <EmptyState text="No subscription yet — add one above to get the digest automatically." />
          )}
          {(subsQ.data ?? []).map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 p-3">
              <Switch
                checked={s.enabled}
                onCheckedChange={(v) => saveSub.mutate({ id: s.id, enabled: v })}
                aria-label="Enabled"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.frequency} · {s.channel === "sms" ? `SMS → ${s.recipients.join(", ") || "no recipient"}` : "archive only"}
                  {s.last_sent_at ? ` · last ${new Date(s.last_sent_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}` : ""}
                  {s.last_result ? ` · ${s.last_result}` : ""}
                </p>
              </div>
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Send className="h-3 w-3" /> {s.frequency}
              </Badge>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => delSub.mutate(s.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
