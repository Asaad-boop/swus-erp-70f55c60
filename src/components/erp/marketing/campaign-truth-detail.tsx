import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
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
import { Check, Save, StickyNote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  getCampaignOrders,
  saveCampaignMeta,
  type CampaignOrderRow,
  type CampaignTrendPoint,
  type CampaignTruthRow,
} from "@/lib/erp/marketing/campaigns.functions";

export const CAMPAIGN_TAGS: { key: string; label: string; tone: string }[] = [
  { key: "test", label: "Test", tone: "border-sky-500/40 bg-sky-500/10 text-sky-600" },
  { key: "scaling", label: "Scaling", tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600" },
  { key: "paused", label: "Paused", tone: "border-slate-500/40 bg-slate-500/10 text-slate-600" },
  { key: "winner", label: "Winner", tone: "border-violet-500/40 bg-violet-500/10 text-violet-600" },
  { key: "watch", label: "Watch", tone: "border-amber-500/40 bg-amber-500/10 text-amber-600" },
  { key: "kill", label: "Kill", tone: "border-rose-500/40 bg-rose-500/10 text-rose-600" },
];

export const tagMeta = (k: string) =>
  CAMPAIGN_TAGS.find((t) => t.key === k) ?? {
    key: k,
    label: k,
    tone: "border-muted bg-muted/40 text-muted-foreground",
  };

const bdt = (n: number) => "৳" + Math.round(n).toLocaleString("en-IN");
const short = (n: number) =>
  Math.abs(n) >= 100000
    ? `${(n / 100000).toFixed(1)}L`
    : Math.abs(n) >= 1000
      ? `${Math.round(n / 1000)}k`
      : String(Math.round(n));

function Stat({ l, v }: { l: string; v: string }) {
  return (
    <div className="rounded-lg border bg-background p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{l}</div>
      <div className="mt-0.5 tabular-nums">{v}</div>
    </div>
  );
}

/** Revenue → net profit bridge. */
function ProfitBridge({ row }: { row: CampaignTruthRow }) {
  const steps = [
    { l: "Delivered line value (projected)", v: row.delivered_revenue, tone: "text-foreground" },
    { l: "− COGS", v: -row.cogs, tone: "text-rose-600" },
    { l: "− Operating cost", v: -row.operating_cost, tone: "text-rose-600" },
    { l: "= Projected gross profit", v: row.gross_profit, tone: "font-semibold text-foreground" },
    { l: "− Ad spend", v: -row.spend, tone: "text-rose-600" },
    {
      l: "= Projected net profit",
      v: row.net_profit,
      tone: row.net_profit >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {steps.map((s) => (
        <div key={s.l} className="rounded-lg border bg-background p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.l}</div>
          <div className={`mt-0.5 text-sm tabular-nums ${s.tone}`}>{bdt(s.v)}</div>
        </div>
      ))}
    </div>
  );
}

/** Where every taka of delivered revenue goes. */
function CostAttribution({ row }: { row: CampaignTruthRow }) {
  const base = row.delivered_revenue || 0;
  const parts = [
    { l: "COGS", v: row.cogs, cls: "bg-amber-500" },
    { l: "Courier", v: row.courier_cost, cls: "bg-sky-500" },
    { l: "Packaging", v: row.packaging_cost, cls: "bg-violet-500" },
    { l: "Refunds", v: row.refund_cost, cls: "bg-rose-500" },
    { l: "Other adj.", v: row.other_cost, cls: "bg-slate-400" },
    { l: "Ad spend", v: row.spend, cls: "bg-fuchsia-500" },
  ];
  const left = base - parts.reduce((a, p) => a + p.v, 0);
  const pct = (v: number) => (base > 0 ? (v / base) * 100 : 0);

  if (base <= 0) {
    return (
      <div className="rounded-lg border bg-background p-3 text-xs text-muted-foreground">
        Delivered line value নেই — cost breakdown দেখানো যাচ্ছে না।
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium">Cost attribution (per ৳100 delivered line value)</span>
        <span className="tabular-nums text-muted-foreground">Base {bdt(base)}</span>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {parts.map((p) =>
          p.v > 0 ? (
            <div
              key={p.l}
              className={p.cls}
              style={{ width: `${Math.max(0, Math.min(100, pct(p.v)))}%` }}
              title={`${p.l}: ${bdt(p.v)} (${pct(p.v).toFixed(1)}%)`}
            />
          ) : null,
        )}
        {left > 0 && (
          <div
            className="bg-emerald-500"
            style={{ width: `${Math.max(0, Math.min(100, pct(left)))}%` }}
            title={`Net profit: ${bdt(left)}`}
          />
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4">
        {[...parts, { l: "Net profit", v: left, cls: left >= 0 ? "bg-emerald-500" : "bg-rose-600" }].map(
          (p) => (
            <div key={p.l} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className={cn("h-2 w-2 rounded-full", p.cls)} />
                {p.l}
              </span>
              <span className="tabular-nums">
                {bdt(p.v)} <span className="text-muted-foreground">({pct(p.v).toFixed(1)}%)</span>
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

/** Spend / revenue / GP / net over time. */
function TrendChart({ points }: { points: CampaignTrendPoint[] }) {
  const data = useMemo(
    () =>
      points
        .slice()
        .sort((a, b) => a.bucket.localeCompare(b.bucket))
        .map((p) => ({
          label: p.bucket.slice(5),
          spend: p.spend,
          revenue: p.delivered_revenue,
          gp: p.gross_profit,
          net: p.net_profit,
        })),
    [points],
  );

  if (data.length === 0) {
    return (
      <div className="rounded-lg border bg-background p-6 text-center text-xs text-muted-foreground">
        এই range-এ trend data নেই।
      </div>
    );
  }

  return (
    <div className="h-[240px] w-full rounded-lg border bg-background p-2">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366F1" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#6366F1" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={short} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            formatter={(v: number | string, n: string) => [bdt(Number(v) || 0), n]}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area
            type="monotone"
            dataKey="revenue"
            name="Delivered line value"
            stroke="#6366F1"
            strokeWidth={2}
            fill="url(#revFill)"
          />
          <Bar dataKey="spend" name="Ad spend" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={18} />
          <Line type="monotone" dataKey="gp" name="Gross profit" stroke="#0ea5e9" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="net" name="Net profit" stroke="#10b981" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function TagNoteEditor({
  row,
  brandId,
  onSaved,
}: {
  row: CampaignTruthRow;
  brandId?: string | null;
  onSaved: () => void;
}) {
  const [tags, setTags] = useState<string[]>(row.tags ?? []);
  const [note, setNote] = useState(row.note ?? "");
  const save = useServerFn(saveCampaignMeta);
  const m = useMutation({
    mutationFn: () =>
      save({ data: { campaignId: row.id, brandId: brandId ?? null, tags, note: note || null } }),
    onSuccess: () => {
      toast.success("Campaign note/tag saved");
      onSaved();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const toggle = (k: string) =>
    setTags((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]));

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
        <StickyNote className="h-3.5 w-3.5" /> Notes & tags
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CAMPAIGN_TAGS.map((t) => {
          const on = tags.includes(t.key);
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => toggle(t.key)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition",
                on ? t.tone : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
              )}
            >
              {on && <Check className="h-3 w-3" />}
              {t.label}
            </button>
          );
        })}
      </div>
      <Textarea
        className="mt-2 min-h-[64px] text-xs"
        placeholder="এই campaign নিয়ে নোট… (creative angle, audience, কেন paused ইত্যাদি)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="mt-2 flex justify-end">
        <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending}>
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {m.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function CashTruth({ row }: { row: CampaignTruthRow }) {
  const rows: { l: string; v: string; tone?: string }[] = [
    { l: "Collected cash", v: row.collected_amount === null ? "Pending reconciliation" : bdt(row.collected_amount) },
    { l: "Expected collectible", v: row.expected_collectible === null ? "Pending" : bdt(row.expected_collectible) },
    {
      l: "Collection variance",
      v: row.collection_variance === null ? "Pending" : bdt(row.collection_variance),
      tone: (row.collection_variance ?? 0) > 0 ? "text-amber-600" : undefined,
    },
    { l: "− COGS (delivered)", v: bdt(row.cogs) },
    ...(row.cogs_recovered > 0
      ? [{ l: "+ COGS recovered (resellable return)", v: bdt(row.cogs_recovered), tone: "text-emerald-600" }]
      : []),
    { l: "− Operating cost", v: bdt(row.operating_cost) },
    {
      l: `− Return / RTO charge${row.return_charge_is_estimate ? " (estimate)" : ""}`,
      v: row.return_charge === null ? "Pending" : bdt(row.return_charge),
    },
    { l: "− Ad spend", v: bdt(row.spend) },
  ];
  return (
    <div className="rounded-xl border">
      <div className="border-b px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        Realized cash ladder
      </div>
      <div className="divide-y text-xs">
        {rows.map((r) => (
          <div key={r.l} className="flex items-center justify-between px-3 py-1.5">
            <span className="text-muted-foreground">{r.l}</span>
            <span className={`tabular-nums ${r.tone ?? ""}`}>{r.v}</span>
          </div>
        ))}
        <div className="flex items-center justify-between px-3 py-2 text-sm font-semibold">
          <span>Realized profit</span>
          <span
            className={`tabular-nums ${row.realized_profit === null ? "text-muted-foreground" : row.realized_profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}
          >
            {row.realized_profit === null ? "Pending reconciliation" : bdt(row.realized_profit)}
          </span>
        </div>
        <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-muted-foreground">
          <span>Projected (pipeline, not cash)</span>
          <span className="tabular-nums">{bdt(row.projected_profit)}</span>
        </div>
      </div>
    </div>
  );
}

function Lifecycle({ row }: { row: CampaignTruthRow }) {
  const steps = [
    { l: "Booked", n: row.orders, v: row.booked_value ?? row.booked_revenue },
    { l: "Confirmed", n: row.confirmed_orders, v: row.confirmed_value ?? 0 },
    { l: "Delivered", n: row.delivered_orders, v: row.delivered_order_value ?? row.delivered_revenue },
    { l: "Returned", n: row.returned_orders, v: null },
    { l: "Cancelled", n: row.cancelled_orders, v: row.cancelled_value ?? 0 },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {steps.map((s) => (
        <div key={s.l} className="rounded-lg border p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.l}</div>
          <div className="text-base font-semibold tabular-nums">{s.n}</div>
          {s.v !== null && (
            <div className="text-[10px] tabular-nums text-muted-foreground">{bdt(s.v)}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function OrderDrill({
  row,
  brandIds,
  range,
}: {
  row: CampaignTruthRow;
  brandIds: string[];
  range: { from: string; to: string };
}) {
  const fetchOrders = useServerFn(getCampaignOrders);
  const q = useQuery({
    queryKey: ["mkt-campaign-orders", row.id, range.from, range.to],
    queryFn: () =>
      fetchOrders({ data: { campaignId: row.id, brandIds, from: range.from, to: range.to, limit: 100 } }),
    enabled: brandIds.length > 0,
    staleTime: 60_000,
  });
  if (q.isLoading) return <div className="p-3 text-xs text-muted-foreground">Order load হচ্ছে…</div>;
  const orders = q.data ?? [];
  if (!orders.length) return null;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 text-[10px] uppercase text-muted-foreground">
          <tr>
            <th className="p-2 text-left">Order</th>
            <th className="p-2 text-left">Status</th>
            <th className="p-2 text-right">Order value</th>
            <th className="p-2 text-right">Collected</th>
            <th className="p-2 text-left">Attribution</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o: CampaignOrderRow) => (
            <tr key={o.order_id} className="border-t">
              <td className="p-2">
                <div className="font-medium">{o.invoice_no ?? o.order_id.slice(0, 8)}</div>
                <div className="text-[10px] text-muted-foreground">{o.customer_name ?? "—"}</div>
              </td>
              <td className="p-2">
                {o.status}
                {o.confirmation_status ? (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    {o.confirmation_status}
                  </span>
                ) : null}
              </td>
              <td className="p-2 text-right tabular-nums">{bdt(o.order_value)}</td>
              <td className="p-2 text-right tabular-nums">
                {o.collected === null ? (
                  <span className="text-muted-foreground">Pending</span>
                ) : (
                  bdt(o.collected)
                )}
              </td>
              <td className="p-2">
                <Badge variant="outline" className="h-4 px-1 text-[10px]">
                  {o.attr_source === "manual" ? "✋ Manual" : o.attr_source}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CampaignTruthDetail({
  row,
  trend,
  brandId,
  brandIds,
  range,
  onSaved,
}: {
  row: CampaignTruthRow;
  trend: CampaignTrendPoint[];
  brandId?: string | null;
  brandIds?: string[];
  range?: { from: string; to: string };
  onSaved: () => void;
}) {
  return (
    <div className="space-y-3">
      <Lifecycle row={row} />
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <CashTruth row={row} />
        <ProfitBridge row={row} />
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <TrendChart points={trend} />
        <div className="space-y-3">
          <CostAttribution row={row} />
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Stat
              l="Break-even ROAS"
              v={row.breakeven_roas ? row.breakeven_roas.toFixed(2) + "x" : "—"}
            />
            <Stat l="CAC (delivered)" v={row.cac ? bdt(row.cac) : "—"} />
            <Stat l="CPA (all orders)" v={row.cpa ? bdt(row.cpa) : "—"} />
            <Stat l="Return / cancel" v={`${row.returned_orders} / ${row.cancelled_orders}`} />
            <Stat l="In progress" v={String(row.in_progress_orders)} />
            <Stat
              l="Settlement coverage"
              v={row.settlement_coverage === null ? "Pending" : `${row.settlement_coverage}%`}
            />
          </div>
        </div>
      </div>
      {brandIds && brandIds.length > 0 && range ? (
        <OrderDrill row={row} brandIds={brandIds} range={range} />
      ) : null}
      <TagNoteEditor row={row} brandId={brandId} onSaved={onSaved} />
    </div>
  );
}


export function TagChips({ tags }: { tags: string[] }) {
  if (!tags?.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {tags.map((t) => {
        const m = tagMeta(t);
        return (
          <Badge key={t} variant="outline" className={`h-4 px-1 text-[10px] ${m.tone}`}>
            {m.label}
          </Badge>
        );
      })}
    </span>
  );
}
