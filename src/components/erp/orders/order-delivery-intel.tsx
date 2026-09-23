import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { MapPin, Truck, Loader2, ShieldCheck, AlertTriangle, Sparkles, PackageCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { fetchCourierHistoryFn } from "@/lib/erp/courier-history.functions";
import { detectAddressFn, detectAddressCached, type AddressDetectionResult } from "@/lib/erp/address-detection";

type Provider = { name: string; label: string; total: number; success: number; cancelled: number; ok?: boolean };

const LABELS: Record<string, string> = {
  pathao: "Pathao",
  steadfast: "Steadfast",
  redx: "RedX",
  paperfly: "Paperfly",
  ecourier: "eCourier",
};

function normPhone(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("880")) return "0" + d.slice(3);
  if (d.length === 10 && d.startsWith("1")) return "0" + d;
  return d;
}

function rateTone(rate: number) {
  if (rate >= 80)
    return {
      text: "text-emerald-700 dark:text-emerald-300",
      bar: "bg-emerald-500",
      ring: "border-emerald-300/70 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/40",
    };
  if (rate >= 50)
    return {
      text: "text-amber-700 dark:text-amber-300",
      bar: "bg-amber-500",
      ring: "border-amber-300/70 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40",
    };
  return {
    text: "text-rose-700 dark:text-rose-300",
    bar: "bg-rose-500",
    ring: "border-rose-300/70 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/40",
  };
}

function useCourierScore(phone: string | null, brandId?: string | null) {
  const digits = phone ? normPhone(phone) : "";
  const fetchHistory = useServerFn(fetchCourierHistoryFn);

  const cachedQ = useQuery({
    queryKey: ["order-intel-courier-cache", digits],
    enabled: digits.length >= 10,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("courier_history_cache")
        .select("phone, data")
        .eq("phone", digits)
        .maybeSingle();
      const hist = data?.data as { providers?: Provider[]; fetched_at?: string } | null;
      return hist?.providers?.length ? { providers: hist.providers, fetched_at: hist.fetched_at ?? null } : null;
    },
  });

  const liveQ = useQuery({
    queryKey: ["order-intel-courier-live", digits],
    enabled: digits.length >= 10 && cachedQ.isFetched && !cachedQ.data,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const res = await fetchHistory({ data: { phones: [digits], brandId: brandId ?? undefined } });
      const hit = res.results[digits] ?? Object.values(res.results)[0];
      return hit?.providers?.length ? { providers: hit.providers as Provider[], fetched_at: hit.fetched_at ?? null } : null;
    },
  });

  const hist = cachedQ.data ?? liveQ.data ?? null;
  const providers = (hist?.providers ?? []).filter((p) => p.ok !== false && (p.total ?? 0) > 0);
  const totals = providers.reduce(
    (a, p) => ({ total: a.total + (p.total ?? 0), success: a.success + (p.success ?? 0) }),
    { total: 0, success: 0 },
  );
  const rate = totals.total > 0 ? Math.round((totals.success / totals.total) * 100) : null;

  return {
    enabled: digits.length >= 10,
    loading: cachedQ.isLoading || liveQ.isLoading,
    providers,
    totals,
    rate,
    fetchedAt: hist?.fetched_at ?? null,
  };
}

/** Colorful courier palette — data-viz colors, one per courier brand. */
const PROVIDER_COLORS: Record<string, string> = {
  pathao: "#10b981",
  steadfast: "#0ea5e9",
  redx: "#f43f5e",
  paperfly: "#f59e0b",
  ecourier: "#8b5cf6",
};
const FALLBACK_COLORS = ["#06b6d4", "#f97316", "#ec4899", "#84cc16"];

function providerColor(name: string, idx: number) {
  return PROVIDER_COLORS[name] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

/** SVG doughnut ring — smooth animated arc, center content via children overlay. */
function DonutRing({
  rate,
  size,
  stroke,
  color,
  children,
}: {
  rate: number;
  size: number;
  stroke: number;
  color: string;
  children?: React.ReactNode;
}) {
  const clamped = Math.min(100, Math.max(0, rate));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - clamped / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" opacity={0.35} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center">{children}</div>}
    </div>
  );
}

/** Courier success-rate card — big overall doughnut + colorful per-courier mini doughnuts. */
export function OrderCourierScoreStrip({ phone, brandId }: { phone: string | null; brandId?: string | null }) {
  const { enabled, loading, providers, totals, rate, fetchedAt } = useCourierScore(phone, brandId);
  if (!enabled) return null;
  const tone = rateTone(rate ?? 0);
  const overallColor = rate !== null ? (rate >= 80 ? "#10b981" : rate >= 50 ? "#f59e0b" : "#f43f5e") : "#94a3b8";

  return (
    <section
      className={cn(
        "rounded-2xl border bg-card p-4 shadow-sm transition-shadow duration-300 hover:shadow-md animate-in fade-in-0 slide-in-from-bottom-1",
        rate !== null && tone.ring,
      )}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {rate !== null && rate >= 80 ? <ShieldCheck className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          Courier success rate
        </span>
        <span className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
          {fetchedAt && <>synced {format(new Date(fetchedAt), "dd MMM, hh:mm a")}</>}
        </span>
      </div>

      {rate === null ? (
        <div className="flex items-center gap-4">
          <DonutRing rate={0} size={104} stroke={11} color="#94a3b8">
            <span className="text-[10px] font-medium text-muted-foreground">No data</span>
          </DonutRing>
          <p className="text-sm text-muted-foreground">
            {loading ? "Courier history আনা হচ্ছে…" : "এই নাম্বারে কোনো courier history নেই।"}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-5">
          {/* Big overall doughnut */}
          <DonutRing rate={rate} size={104} stroke={11} color={overallColor}>
            <div className="text-center leading-none">
              <div className={cn("text-2xl font-bold tabular-nums", tone.text)}>{rate}%</div>
              <div className="mt-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Overall</div>
            </div>
          </DonutRing>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="text-[12px] text-muted-foreground tabular-nums">
              <span className="font-semibold text-foreground">{totals.success}</span>/{totals.total} parcel delivered successfully
            </div>
            <div className="flex flex-wrap gap-2">
              {providers.map((p, i) => {
                const r = p.total > 0 ? Math.round((p.success / p.total) * 100) : 0;
                const color = providerColor(p.name, i);
                return (
                  <div
                    key={p.name}
                    title={`${p.success} success · ${p.cancelled} cancel`}
                    className="flex items-center gap-2 rounded-xl border bg-background/70 px-2.5 py-2 transition-colors hover:bg-muted/50"
                  >
                    <DonutRing rate={r} size={44} stroke={6} color={color}>
                      <span className="text-[9px] font-bold tabular-nums" style={{ color }}>{r}%</span>
                    </DonutRing>
                    <div className="leading-tight">
                      <div className="flex items-center gap-1 text-[11px] font-semibold">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                        {LABELS[p.name] ?? p.label ?? p.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">
                        {p.success}/{p.total} delivered
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Detected city/zone/area + live shipment — sits directly under the customer block. */
export function OrderLocationIntel({
  orderId,
  address,
}: {
  orderId: string | null;
  address: string | null;
}) {
  const detectFn = useServerFn(detectAddressFn);
  const [detected, setDetected] = useState<AddressDetectionResult | null>(null);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    let alive = true;
    const addr = (address ?? "").trim();
    setDetected(null);
    if (addr.length < 5) return;
    setDetecting(true);
    detectAddressCached(detectFn, addr)
      .then((r) => { if (alive) setDetected(r); })
      .catch(() => { /* detection is best-effort */ })
      .finally(() => { if (alive) setDetecting(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const shipmentQ = useQuery({
    queryKey: ["order-intel-shipment", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data } = await supabase
        .from("courier_shipments")
        .select("provider, consignment_id, tracking_code, status, delivery_fee, created_at")
        .eq("order_id", orderId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });
  const shipment = shipmentQ.data;

  const hasAddr = (address ?? "").trim().length >= 5;
  if (!hasAddr && !shipment) return null;

  return (
    <div className="mt-3 space-y-2 rounded-lg border bg-muted/20 p-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <MapPin className="h-3 w-3" /> Detected location
        </span>

        {detected?.city ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {([
              ["City", detected.city?.name],
              ["Zone", detected.zone?.name],
              ["Area", detected.area?.name],
            ] as const)
              .filter(([, v]) => !!v)
              .map(([label, value]) => (
                <span key={label} className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5">
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
                  <span className="font-medium text-foreground">{value}</span>
                </span>
              ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            {detecting ? "Address থেকে city/zone বের করা হচ্ছে…" : "Address থেকে city detect করা যায়নি।"}
          </span>
        )}

        <span className="ml-auto flex items-center gap-1.5">
          {detecting ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : detected?.source && detected.source !== "none" ? (
            <span className="inline-flex items-center gap-1 rounded-full border bg-background px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              {detected.source === "ai" && <Sparkles className="h-2.5 w-2.5" />}
              {detected.source} · {Math.round((detected.confidence ?? 0) * 100)}%
            </span>
          ) : null}
        </span>
      </div>

      {shipment && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed pt-2 text-xs">
          <span className="flex items-center gap-1.5 font-semibold capitalize">
            <PackageCheck className="h-3.5 w-3.5 text-muted-foreground" />
            {LABELS[shipment.provider] ?? shipment.provider}
          </span>
          {shipment.status && (
            <span className="rounded-full border bg-background px-2 py-0.5 text-[10px] font-medium capitalize">
              {String(shipment.status).replace(/_/g, " ")}
            </span>
          )}
          {(shipment.tracking_code || shipment.consignment_id) && (
            <span className="font-mono text-[11px] text-muted-foreground">
              {shipment.tracking_code ?? shipment.consignment_id}
            </span>
          )}
          {shipment.delivery_fee != null && (
            <span className="tabular-nums text-muted-foreground">
              <Truck className="mr-1 inline h-3 w-3" />Fee ৳{Number(shipment.delivery_fee).toLocaleString()}
            </span>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground">
            {format(new Date(shipment.created_at), "dd MMM, hh:mm a")}
          </span>
        </div>
      )}
    </div>
  );
}
