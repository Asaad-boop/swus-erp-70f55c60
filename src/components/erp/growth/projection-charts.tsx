import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type PacePoint = {
  label: string;
  revenue: number | null;
  spend: number | null;
  cum: number | null;
  pace: number | null;
  forecast: number | null;
};

const short = (n: number) =>
  Math.abs(n) >= 100000
    ? `${(n / 100000).toFixed(1)}L`
    : Math.abs(n) >= 1000
      ? `${Math.round(n / 1000)}k`
      : String(Math.round(n));

const bdt = (n: number) => `৳${Math.round(n).toLocaleString("en-BD")}`;

/** Cumulative revenue vs required pace vs forecast. */
export function PaceChart({ data }: { data: PacePoint[] }) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366F1" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#6366F1" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tickFormatter={short} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            formatter={(v: number | string, n: string) => [bdt(Number(v) || 0), n]}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area
            type="monotone"
            dataKey="cum"
            name="Cumulative actual"
            stroke="#6366F1"
            strokeWidth={2}
            fill="url(#cumFill)"
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="pace"
            name="Target pace"
            stroke="#f59e0b"
            strokeDasharray="5 4"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="forecast"
            name="Forecast"
            stroke="#10b981"
            strokeDasharray="2 4"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Daily revenue bars + ad spend line. */
export function DailyChart({ data }: { data: PacePoint[] }) {
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tickFormatter={short} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            formatter={(v: number | string, n: string) => [bdt(Number(v) || 0), n]}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="revenue" name="Delivered revenue" fill="#6366F1" radius={[3, 3, 0, 0]} maxBarSize={22} />
          <Line type="monotone" dataKey="spend" name="Ad spend" stroke="#ef4444" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default PaceChart;
