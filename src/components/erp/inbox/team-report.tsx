import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Trophy, Zap } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  fetchStaffReplies,
  fetchTeamReport,
  initials,
  type StaffStat,
} from "@/lib/erp/inbox/inbox";
import { BrandTag, PlatformIcon } from "./shared";

type Period = "month" | "last_month" | "7d" | "30d";
const PERIODS: Array<{ key: Period; label: string }> = [
  { key: "month", label: "Ei mash" },
  { key: "last_month", label: "Gotomash" },
  { key: "7d", label: "7 din" },
  { key: "30d", label: "30 din" },
];

const DHAKA = 6 * 3_600_000;
function bounds(p: Period): { from: Date; to: Date; label: string } {
  const now = new Date(Date.now() + DHAKA); // Dhaka wall-clock as UTC fields
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const dhakaMidnight = (yy: number, mm: number, dd: number) =>
    new Date(Date.UTC(yy, mm, dd) - DHAKA);
  const monthName = (yy: number, mm: number) =>
    new Date(Date.UTC(yy, mm, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  switch (p) {
    case "month":
      return {
        from: dhakaMidnight(y, m, 1),
        to: new Date(Date.now() + 60_000),
        label: monthName(y, m),
      };
    case "last_month":
      return {
        from: dhakaMidnight(y, m - 1, 1),
        to: dhakaMidnight(y, m, 1),
        label: monthName(y, m - 1),
      };
    case "7d":
      return {
        from: dhakaMidnight(y, m, now.getUTCDate() - 6),
        to: new Date(Date.now() + 60_000),
        label: "Shesh 7 din",
      };
    case "30d":
      return {
        from: dhakaMidnight(y, m, now.getUTCDate() - 29),
        to: new Date(Date.now() + 60_000),
        label: "Shesh 30 din",
      };
  }
}

const bdt = (n: number) => `৳${Math.round(n).toLocaleString("en-IN")}`;
const mins = (m: number | null | undefined) =>
  m == null
    ? "—"
    : m < 1
      ? "<1 min"
      : m < 60
        ? `${Math.round(m)} min`
        : `${(m / 60).toFixed(1)} ghonta`;
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

export function TeamReport({ brandIds, showBrand }: { brandIds: string[]; showBrand: boolean }) {
  const [period, setPeriod] = useState<Period>("month");
  const range = useMemo(() => bounds(period), [period]);
  const [open, setOpen] = useState<StaffStat | null>(null);
  const q = useQuery({
    queryKey: ["inbox", "team-report", brandIds, period],
    queryFn: () => fetchTeamReport(brandIds, range.from, range.to),
    enabled: brandIds.length > 0,
    staleTime: 60_000,
  });
  const r = q.data;
  const t = r?.totals;

  const ranked = useMemo(() => {
    const staff = (r?.staff ?? []).filter((s) => s.replies > 0 || s.orders > 0);
    const eligible = staff.filter((s) => s.first_responses >= 10 && s.median_min != null);
    const fastest = eligible.sort((a, b) => a.median_min! - b.median_min!)[0]?.user_id;
    const topSeller = [...staff].sort((a, b) => b.order_value - a.order_value)[0];
    return {
      staff: [...staff].sort((a, b) => b.replies - a.replies),
      fastest,
      topSeller: topSeller && topSeller.order_value > 0 ? topSeller.user_id : undefined,
      maxReplies: Math.max(1, ...staff.map((s) => s.replies)),
    };
  }, [r]);

  const maxHour = Math.max(1, ...(r?.hourly ?? []).map((h) => h.inbound));

  return (
    <div className="ib-scroll min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-4 px-1 pb-6">
        <div className="flex flex-wrap items-end gap-3 pt-1">
          <div>
            <h2 className="text-[18px] font-semibold tracking-[-0.015em]">Team report</h2>
            <p className="ib-ink-2 text-[12.5px]">
              {range.label} — ke koto reply dilo, koto druto, inbox theke koto order.
            </p>
          </div>
          <div className="ib-seg ml-auto flex items-center gap-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                data-on={period === p.key}
                onClick={() => setPeriod(p.key)}
                className="ib-ink-2 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:text-[var(--ib-ink)]"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {q.isLoading || !t ? (
          <div className="ib-panel flex h-64 items-center justify-center">
            <Loader2 className="ib-ink-3 h-5 w-5 animate-spin" />
          </div>
        ) : (
          <>
            {/* Headline numbers: one strip, hairline dividers */}
            <div className="ib-panel grid grid-cols-2 divide-y divide-[var(--ib-line)] md:grid-cols-5 md:divide-x md:divide-y-0">
              <Kpi
                label="Notun chat"
                value={t.new_chats.toLocaleString()}
                sub={`${t.ad_chats} ad theke`}
              />
              <Kpi
                label="Staff reply"
                value={t.replies.toLocaleString()}
                sub={`+${t.auto_replies} auto · ${t.app_replies} page app theke`}
              />
              <Kpi
                label="Prothom reply (median)"
                value={mins(t.median_min)}
                sub={`${t.within5_pct ?? 0}% 5 minute er moddhe · ${t.unanswered} reply pay nai`}
                tone={(t.median_min ?? 0) > 15 ? "warn" : "good"}
              />
              <Kpi
                label="Inbox theke order"
                value={t.orders.toLocaleString()}
                sub={`${bdt(t.order_value)} · ${pct(t.chats_with_order, t.new_chats)} chat → order`}
              />
              <Kpi
                label="Complaint"
                value={t.complaints.toLocaleString()}
                sub={t.complaints_open ? `${t.complaints_open}ta ekhono khola` : "Shob shomadhan"}
                tone={t.complaints_open ? "bad" : undefined}
              />
            </div>

            {/* Leaderboard */}
            <div className="ib-panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--ib-line)] px-4 py-3">
                <h3 className="text-[14px] font-semibold">Staff</h3>
                <span className="ib-ink-3 text-[11.5px]">Naam e click = tar reply gula dekho</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-[13px]">
                  <thead>
                    <tr className="ib-ink-3 text-left text-[11.5px]">
                      <th className="px-4 py-2.5 font-medium">Staff</th>
                      <th className="px-2 py-2.5 font-medium">Reply</th>
                      <th className="px-2 py-2.5 text-right font-medium">Chat</th>
                      <th className="px-2 py-2.5 text-right font-medium">Prothom reply</th>
                      <th className="px-2 py-2.5 text-right font-medium">5 min e</th>
                      <th className="px-2 py-2.5 text-right font-medium">Order</th>
                      <th className="px-2 py-2.5 text-right font-medium">Bikri</th>
                      <th className="px-4 py-2.5 text-right font-medium">Chat → order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.staff.length === 0 && (
                      <tr>
                        <td colSpan={8} className="ib-ink-2 px-4 py-10 text-center">
                          Ei shomoye kono staff reply nai.
                        </td>
                      </tr>
                    )}
                    {ranked.staff.map((s, i) => (
                      <tr
                        key={s.user_id}
                        onClick={() => setOpen(s)}
                        className="cursor-pointer border-t border-[var(--ib-line)] transition-colors hover:bg-[var(--ib-hover)]"
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <span className="ib-ink-3 tabular w-4 text-[11px]">{i + 1}</span>
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ib-accent-soft)] text-[10px] font-semibold text-primary">
                              {initials(s.name)}
                            </span>
                            <span className="font-medium">{s.name}</span>
                            {ranked.fastest === s.user_id && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-sky-500/10 px-1.5 text-[10.5px] font-medium leading-5 text-sky-700 dark:text-sky-300">
                                <Zap className="h-3 w-3" /> Shobcheye druto
                              </span>
                            )}
                            {ranked.topSeller === s.user_id && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 text-[10.5px] font-medium leading-5 text-amber-700 dark:text-amber-300">
                                <Trophy className="h-3 w-3" /> Top bikri
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="tabular w-10 font-medium">{s.replies}</span>
                            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--ib-canvas)]">
                              <span
                                className="block h-full rounded-full bg-primary/70"
                                style={{ width: `${(s.replies / ranked.maxReplies) * 100}%` }}
                              />
                            </span>
                          </div>
                        </td>
                        <td className="tabular px-2 py-2.5 text-right">{s.chats}</td>
                        <td
                          className={cn(
                            "tabular px-2 py-2.5 text-right",
                            (s.median_min ?? 0) > 30 && "text-rose-600 dark:text-rose-400",
                            (s.median_min ?? 99) <= 5 && "text-emerald-600 dark:text-emerald-400",
                          )}
                        >
                          {mins(s.median_min)}
                        </td>
                        <td className="tabular px-2 py-2.5 text-right">
                          {s.within5_pct == null ? "—" : `${s.within5_pct}%`}
                        </td>
                        <td className="tabular px-2 py-2.5 text-right font-medium">{s.orders}</td>
                        <td className="tabular px-2 py-2.5 text-right">
                          {s.order_value ? bdt(s.order_value) : "—"}
                        </td>
                        <td className="tabular px-4 py-2.5 text-right">{pct(s.orders, s.chats)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="ib-ink-3 border-t border-[var(--ib-line)] px-4 py-2 text-[11px] leading-relaxed">
                Prothom reply = customer message dewar por prothom uttor ashte koto shomoy (median —
                majhamajhi man, rater message o dhora). Order = inbox chat er sathe jora order; ke
                banalo seta dhora hoy, na thakle chat ta kar kache assign chilo.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-5">
              {/* Daily trend */}
              <div className="ib-panel p-4 lg:col-span-3">
                <div className="mb-3 flex items-center gap-4">
                  <h3 className="text-[14px] font-semibold">Protidin</h3>
                  <Legend color="bg-slate-300 dark:bg-slate-600" label="Customer message" />
                  <Legend color="bg-primary" label="Staff reply" />
                  <Legend color="bg-emerald-500" label="Order" line />
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={r!.daily}
                      margin={{ top: 4, right: 4, left: -18, bottom: 0 }}
                      barGap={1}
                    >
                      <CartesianGrid vertical={false} stroke="var(--ib-line)" />
                      <XAxis
                        dataKey="day"
                        tickFormatter={(d) => String(new Date(d).getDate())}
                        tick={{ fontSize: 10, fill: "var(--ib-ink-3)" }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        yAxisId="m"
                        tick={{ fontSize: 10, fill: "var(--ib-ink-3)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis yAxisId="o" orientation="right" hide />
                      <RTooltip
                        cursor={{ fill: "var(--ib-hover)" }}
                        contentStyle={{
                          borderRadius: 8,
                          border: "1px solid var(--ib-line)",
                          fontSize: 12,
                        }}
                        labelFormatter={(d) =>
                          new Date(d).toLocaleDateString("en-GB", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })
                        }
                        formatter={(v: number, name: string) => [
                          v,
                          name === "inbound"
                            ? "Customer message"
                            : name === "replies"
                              ? "Staff reply"
                              : "Order",
                        ]}
                      />
                      <Bar
                        yAxisId="m"
                        dataKey="inbound"
                        fill="var(--ib-line-strong)"
                        radius={[3, 3, 0, 0]}
                        maxBarSize={14}
                      />
                      <Bar
                        yAxisId="m"
                        dataKey="replies"
                        fill="var(--primary)"
                        radius={[3, 3, 0, 0]}
                        maxBarSize={14}
                      />
                      <Line
                        yAxisId="o"
                        dataKey="orders"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={false}
                        type="monotone"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Busy hours */}
              <div className="ib-panel p-4 lg:col-span-2">
                <h3 className="text-[14px] font-semibold">Kon shomoy beshi message ashe</h3>
                <p className="ib-ink-3 mb-3 text-[11.5px]">
                  Rong gaar = beshi message. Niche = oi ghontay reply ashte koto shomoy.
                </p>
                <div className="grid grid-cols-12 gap-1">
                  {r!.hourly.map((h) => {
                    const a = h.inbound / maxHour;
                    return (
                      <div
                        key={h.hour}
                        title={`${h.hour}:00 — ${h.inbound} message, reply ${mins(h.median_min)}`}
                        className="flex flex-col items-center gap-0.5"
                      >
                        <div
                          className="h-9 w-full rounded"
                          style={{
                            background: `color-mix(in oklch, var(--primary) ${Math.round(8 + a * 82)}%, var(--ib-canvas))`,
                          }}
                        />
                        <span className="ib-ink-3 tabular text-[9.5px]">{h.hour}</span>
                        <span
                          className={cn(
                            "tabular text-[9px]",
                            (h.median_min ?? 0) > 60 ? "text-rose-600" : "ib-ink-3",
                          )}
                        >
                          {h.median_min == null
                            ? ""
                            : h.median_min < 60
                              ? `${Math.round(h.median_min)}m`
                              : `${Math.round(h.median_min / 60)}h`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent
          side="right"
          className="inbox-studio w-full !bg-[var(--ib-panel)] p-0 sm:max-w-lg"
        >
          {open && (
            <StaffReplies
              staff={open}
              brandIds={brandIds}
              from={range.from}
              to={range.to}
              showBrand={showBrand}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <div className="px-4 py-3.5">
      <div className="ib-ink-2 text-[12px]">{label}</div>
      <div
        className={cn(
          "tabular mt-1 text-[24px] font-semibold leading-7 tracking-[-0.02em]",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "bad" && "text-rose-600 dark:text-rose-400",
        )}
      >
        {value}
      </div>
      <div className="ib-ink-3 mt-1 text-[11.5px] leading-snug">{sub}</div>
    </div>
  );
}

function Legend({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="ib-ink-2 flex items-center gap-1.5 text-[11.5px]">
      <span className={cn(line ? "h-0.5 w-3" : "h-2.5 w-2.5 rounded-sm", color)} />
      {label}
    </span>
  );
}

function StaffReplies({
  staff,
  brandIds,
  from,
  to,
  showBrand,
}: {
  staff: StaffStat;
  brandIds: string[];
  from: Date;
  to: Date;
  showBrand: boolean;
}) {
  const q = useQuery({
    queryKey: ["inbox", "staff-replies", staff.user_id, brandIds, from.toISOString()],
    queryFn: () => fetchStaffReplies(brandIds, staff.user_id, from, to),
  });
  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="border-b border-[var(--ib-line)] px-5 py-4 text-left">
        <SheetTitle className="flex items-center gap-2.5 text-[16px]">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ib-accent-soft)] text-[11px] font-semibold text-primary">
            {initials(staff.name)}
          </span>
          {staff.name}
        </SheetTitle>
        <div className="ib-ink-2 grid grid-cols-4 gap-2 pt-2 text-[11.5px]">
          <Mini label="Reply" value={String(staff.replies)} />
          <Mini label="Prothom reply" value={mins(staff.median_min)} />
          <Mini label="Order" value={String(staff.orders)} />
          <Mini label="Bikri" value={staff.order_value ? bdt(staff.order_value) : "—"} />
        </div>
      </SheetHeader>
      <div className="ib-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {q.isLoading && <Loader2 className="ib-ink-3 mx-auto mt-10 h-5 w-5 animate-spin" />}
        {(q.data ?? []).map((m) => (
          <a
            key={m.id}
            href={`/erp/inbox?c=${m.conversation_id}`}
            className="block rounded-lg border border-[var(--ib-line)] p-3 transition-colors hover:bg-[var(--ib-hover)]"
          >
            <div className="ib-ink-3 mb-1 flex items-center gap-1.5 text-[11px]">
              <PlatformIcon platform={m.platform} className="h-3 w-3" />
              <span className="font-medium text-[var(--ib-ink-2)]">
                {m.contact_name ?? "Customer"}
              </span>
              {showBrand && <BrandTag brandId={m.brand_id} size="xs" />}
              <span className="ml-auto tabular">
                {new Date(m.created_at).toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              {m.response_min != null && (
                <span
                  className={cn(
                    "tabular rounded px-1",
                    m.response_min <= 5
                      ? "bg-emerald-500/10 text-emerald-700"
                      : m.response_min > 60
                        ? "bg-rose-500/10 text-rose-700"
                        : "bg-[var(--ib-canvas)]",
                  )}
                >
                  {mins(m.response_min)}
                </span>
              )}
            </div>
            {m.attachments?.some((a) => a.type === "image") && (
              <div className="mb-1 flex gap-1">
                {m.attachments
                  .filter((a) => a.type === "image")
                  .slice(0, 4)
                  .map((a, i) => (
                    <img key={i} src={a.url} alt="" className="h-10 w-10 rounded object-cover" />
                  ))}
              </div>
            )}
            <p className="line-clamp-3 whitespace-pre-wrap text-[13px] leading-snug">
              {m.body || "📷 Chobi"}
            </p>
          </a>
        ))}
        {q.data?.length === 0 && (
          <p className="ib-ink-3 py-10 text-center text-[12.5px]">Kono reply nai</p>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[var(--ib-canvas)] px-2 py-1.5">
      <div className="ib-ink-3 text-[10.5px]">{label}</div>
      <div className="tabular text-[13px] font-semibold text-[var(--ib-ink)]">{value}</div>
    </div>
  );
}
