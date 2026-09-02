import { useMemo } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  Legend,
  CartesianGrid,
} from "recharts";

type Row = {
  created_at: string;
  web_status: string | null;
  source_website: string | null;
  attribution?: { utm_source: string | null; utm_medium: string | null } | null;
};

const SOURCE_COLORS: Record<string, string> = {
  Facebook: "#1877F2",
  Instagram: "#E1306C",
  Google: "#34A853",
  Direct: "#94A3B8",
  Other: "#F59E0B",
};

function classifySource(r: Row): string {
  const raw = (r.attribution?.utm_source ?? r.source_website ?? "").toLowerCase();
  if (!raw) return "Direct";
  if (raw.includes("facebook") || raw === "fb" || raw.includes("meta")) return "Facebook";
  if (raw.includes("instagram") || raw === "ig")  return "Instagram";
  if (raw.includes("google")) return "Google";
  if (raw.includes("direct") || raw === "(direct)") return "Direct";
  return "Other";
}

const CONFIRMED_STATUSES = new Set(["complete", "advance_payment", "on_hold"]);

export default function WebOrdersAnalyticsCharts({ rows, todayRows }: { rows: Row[]; todayRows: Row[] }) {
  const sourceData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      const k = classifySource(r);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [rows]);

  const totalSource = sourceData.reduce((s, d) => s + d.value, 0);
  const currentHour = new Date().getHours();

  const hourly = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, created: 0, confirmed: 0 }));
    for (const r of todayRows) {
      const h = new Date(r.created_at).getHours();
      buckets[h].created += 1;
      if (CONFIRMED_STATUSES.has(r.web_status ?? "")) buckets[h].confirmed += 1;
    }
    return buckets.map((b) => ({
      ...b,
      label: b.hour === 0 ? "12AM" : b.hour < 12 ? `${b.hour}AM` : b.hour === 12 ? "12PM" : `${b.hour - 12}PM`,
      isCurrent: b.hour === currentHour,
    }));
  }, [todayRows, currentHour]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Donut */}
      <div className="rounded-lg border bg-background p-3">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Order Sources</div>
        <div className="relative h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={sourceData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
              >
                {sourceData.map((d) => (
                  <Cell key={d.name} fill={SOURCE_COLORS[d.name] ?? "#94A3B8"} />
                ))}
              </Pie>
              <RTooltip
                formatter={(value: number, name: string) => [
                  `${value} (${totalSource ? Math.round((value / totalSource) * 100) : 0}%)`,
                  name,
                ]}
              />
              <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none -mt-6">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</div>
            <div className="text-xl font-bold tabular-nums">{totalSource}</div>
          </div>
        </div>
      </div>

      {/* Hourly bar */}
      <div className="rounded-lg border bg-background p-3">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Orders by Hour — Today
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={28} />
              <RTooltip />
              <Bar dataKey="created" radius={[4, 4, 0, 0]}>
                {hourly.map((b) => (
                  <Cell key={b.hour} fill={b.isCurrent ? "#F59E0B" : "#6366F1"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Created vs Confirmed line */}
      <div className="rounded-lg border bg-background p-3">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Created vs Confirmed — Today
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={hourly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={28} />
              <RTooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const created = Number(payload.find((p) => p.dataKey === "created")?.value ?? 0);
                  const confirmed = Number(payload.find((p) => p.dataKey === "confirmed")?.value ?? 0);
                  const rate = created > 0 ? Math.round((confirmed / created) * 100) : 0;
                  return (
                    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                      <div className="font-semibold mb-1">{label}</div>
                      <div className="text-indigo-600">Created: {created}</div>
                      <div className="text-emerald-600">Confirmed: {confirmed}</div>
                      <div className="text-muted-foreground mt-0.5">Rate: {rate}%</div>
                    </div>
                  );
                }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="created" stroke="#6366F1" strokeWidth={2} dot={false} name="Created" />
              <Line type="monotone" dataKey="confirmed" stroke="#10B981" strokeWidth={2} dot={false} name="Confirmed" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}