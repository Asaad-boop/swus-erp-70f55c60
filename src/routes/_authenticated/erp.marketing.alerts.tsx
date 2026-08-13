import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
  Undo2,, BellRing as PageIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBrand } from "@/contexts/brand-context";
import {
  getAlerts,
  evaluateAlerts,
  setAlertStatus,
  type MktAlert,
} from "@/lib/erp/marketing/alerts.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/alerts")({
  head: () => ({
    meta: [
      { title: "Marketing Alerts & Intelligence — Marketing ERP" },
      {
        name: "description",
        content:
          "Automatic marketing warnings: ROAS drop, CPA spike, spend without orders, creative fatigue, budget overspend, low stock and high return on advertised products.",
      },
      { property: "og:title", content: "Marketing Alerts — Marketing ERP" },
      {
        property: "og:description",
        content: "Rule-based marketing intelligence with scale, hold and kill recommendations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AlertsPage,
});

const RULE_LABEL: Record<string, string> = {
  zero_orders: "Spend, no orders",
  roas_drop: "ROAS below target",
  cpa_spike: "CPA above target",
  creative_fatigue: "Creative fatigue",
  budget_overspend: "Budget exceeded",
  low_stock_active_ad: "Low stock + active ad",
  high_return_active_ad: "High return + active ad",
};

const SEV_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

const sevClass = (s: string) =>
  s === "high"
    ? "bg-destructive/10 text-destructive border-destructive/30"
    : s === "medium"
      ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
      : "bg-muted text-muted-foreground border-border";

function entityLink(a: MktAlert): { to: string; label: string } | null {
  if (a.entity_type === "campaign") return { to: "/erp/marketing/campaigns", label: "Open campaigns" };
  if (a.entity_type === "creative") return { to: "/erp/marketing/creatives", label: "Open creatives" };
  if (a.entity_type === "product") return { to: "/erp/marketing/products", label: "Open product P&L" };
  if (a.entity_type === "budget") return { to: "/erp/marketing/planning", label: "Open budgets" };
  return null;
}

function AlertsPage() {
  const { brands, isLoading: brandsLoading } = useBrand();
  const [brandKey, setBrandKey] = useState("all");
  const [statusTab, setStatusTab] = useState<"open" | "ack" | "resolved">("open");
  const [lookback, setLookback] = useState("7");
  const qc = useQueryClient();

  const brandIds = useMemo(() => {
    if (brandKey === "all") return brands.map((b) => b.id);
    const b = brands.find((x) => x.slug === brandKey || x.id === brandKey);
    return b ? [b.id] : [];
  }, [brandKey, brands]);

  const fetchAlerts = useServerFn(getAlerts);
  const runEval = useServerFn(evaluateAlerts);
  const patchStatus = useServerFn(setAlertStatus);

  const q = useQuery({
    queryKey: ["mkt-alerts", brandIds.slice().sort().join(","), statusTab],
    queryFn: () => fetchAlerts({ data: { brandIds, status: statusTab } }),
    enabled: brandIds.length > 0,
    staleTime: 30_000,
  });

  const evalM = useMutation({
    mutationFn: () => runEval({ data: { brandIds, lookback: Number(lookback) } }),
    onSuccess: (r: any) => {
      toast.success(`${r?.triggered ?? 0} alert refresh, ${r?.resolved ?? 0} auto-resolved`);
      qc.invalidateQueries({ queryKey: ["mkt-alerts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Evaluate fail"),
  });

  const statusM = useMutation({
    mutationFn: (v: { ids: string[]; status: "open" | "ack" | "resolved" }) =>
      patchStatus({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mkt-alerts"] }),
    onError: (e: any) => toast.error(e?.message ?? "Update fail"),
  });

  const rows = useMemo(
    () =>
      ((q.data ?? []) as MktAlert[])
        .slice()
        .sort(
          (a, b) =>
            (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3) ||
            a.rule.localeCompare(b.rule),
        ),
    [q.data],
  );

  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0 };
    for (const r of rows) c[r.severity as keyof typeof c] = (c[r.severity as keyof typeof c] ?? 0) + 1;
    return c;
  }, [rows]);

  const brandName = (id: string | null) => brands.find((b) => b.id === id)?.name ?? "—";

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight flex items-center gap-2">
            <BellRing className="h-5 w-5 text-primary" />
            Marketing Intelligence
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Rule engine — ROAS, CPA, fatigue, budget, stock ar return signal ek jaygay
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={brandKey} onValueChange={setBrandKey}>
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue placeholder="Brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All brands</SelectItem>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.slug}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={lookback} onValueChange={setLookback}>
            <SelectTrigger className="h-9 w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Last 3 days</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={() => evalM.mutate()}
            disabled={evalM.isPending || brandIds.length === 0}
          >
            <RefreshCcw className={`h-3.5 w-3.5 mr-1.5 ${evalM.isPending ? "animate-spin" : ""}`} />
            Run checks
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Critical"
          value={counts.high}
          icon={<ShieldAlert className="h-4 w-4 text-destructive" />}
          tone="border-destructive/30"
        />
        <SummaryCard
          label="Warning"
          value={counts.medium}
          icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
          tone="border-amber-500/30"
        />
        <SummaryCard
          label="Info"
          value={counts.low}
          icon={<Sparkles className="h-4 w-4 text-muted-foreground" />}
          tone=""
        />
      </div>

      <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as typeof statusTab)}>
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="ack">Acknowledged</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
        </TabsList>
      </Tabs>

      {brandsLoading || q.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-emerald-500" />
            {statusTab === "open"
              ? "Kono open alert nei — sob rule clear."
              : "Ei tab-e kichu nei."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((a: MktAlert) => {
            const link = entityLink(a);
            return (
              <Card key={a.id} className={`border ${sevClass(a.severity).split(" ").pop()}`}>
                <CardContent className="py-3 flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={sevClass(a.severity)}>
                        {a.severity}
                      </Badge>
                      <Badge variant="secondary">{RULE_LABEL[a.rule] ?? a.rule}</Badge>
                      <span className="text-sm font-medium">{a.title}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {brandName(a.brand_id)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground break-words">{a.message}</p>
                    {a.recommendation && (
                      <p className="text-xs text-primary/90">→ {a.recommendation}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      First seen {new Date(a.first_seen_at).toLocaleDateString()} · last{" "}
                      {new Date(a.last_seen_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {link && (
                      <Link to={link.to}>
                        <Button size="sm" variant="outline">
                          {link.label}
                        </Button>
                      </Link>
                    )}
                    {a.status !== "ack" && a.status !== "resolved" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => statusM.mutate({ ids: [a.id], status: "ack" })}
                      >
                        Ack
                      </Button>
                    )}
                    {a.status !== "resolved" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => statusM.mutate({ ids: [a.id], status: "resolved" })}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        Resolve
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => statusM.mutate({ ids: [a.id], status: "open" })}
                      >
                        <Undo2 className="h-3.5 w-3.5 mr-1" />
                        Reopen
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {q.error && (
        <Card className="border-destructive/40">
          <CardContent className="py-3 text-sm text-destructive">
            Alerts load fail: {(q.error as Error).message}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <Card className={tone}>
      <CardContent className="py-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
        </div>
        {icon}
      </CardContent>
    </Card>
  );
}
