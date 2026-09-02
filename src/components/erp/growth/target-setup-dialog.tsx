import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Target,
  Sun,
  CalendarDays,
  Wallet,
  TrendingUp,
  PackageCheck,
  Megaphone,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Metric keys the Vision board reads as auto-tracked targets. */
export const TARGET_FIELDS = [
  {
    key: "daily_orders",
    label: "দৈনিক order",
    unit: "number",
    hint: "প্রতিদিন কয়টা order",
    group: "daily",
    icon: Sun,
    presets: [30, 60, 100, 150],
  },
  {
    key: "daily_revenue",
    label: "দৈনিক delivered revenue",
    unit: "bdt",
    hint: "প্রতিদিন কত ৳ deliver",
    group: "daily",
    icon: Wallet,
    presets: [50000, 100000, 200000],
  },
  {
    key: "daily_profit",
    label: "দৈনিক net profit",
    unit: "bdt",
    hint: "ads + courier + COGS বাদে",
    group: "daily",
    icon: TrendingUp,
    presets: [10000, 25000, 50000],
  },
  {
    key: "orders",
    label: "মাসিক order",
    unit: "number",
    hint: "এই মাসে মোট order",
    group: "month",
    icon: CalendarDays,
    presets: [1000, 2000, 3000],
  },
  {
    key: "delivered_revenue",
    label: "মাসিক delivered revenue",
    unit: "bdt",
    hint: "এই মাসে ৳",
    group: "month",
    icon: Wallet,
    presets: [1500000, 3000000, 5000000],
  },
  {
    key: "delivered_orders",
    label: "মাসিক delivered order",
    unit: "number",
    hint: "এই মাসে delivered",
    group: "month",
    icon: PackageCheck,
    presets: [800, 1500, 2500],
  },
  {
    key: "ad_spend",
    label: "মাসিক ad spend সীমা",
    unit: "bdt",
    hint: "সর্বোচ্চ খরচ",
    group: "month",
    icon: Megaphone,
    presets: [200000, 400000, 800000],
  },
] as const;

type Key = (typeof TARGET_FIELDS)[number]["key"];

const bdt = (n: number) =>
  n >= 1e7
    ? `৳${(n / 1e7).toFixed(2)} কোটি`
    : n >= 1e5
      ? `৳${(n / 1e5).toFixed(2)} লাখ`
      : `৳${Math.round(n).toLocaleString("en-IN")}`;
const fmt = (n: number, unit: string) =>
  unit === "bdt" ? bdt(n) : `${Math.round(n).toLocaleString("en-IN")} টি`;

function monthRange() {
  const now = new Date(Date.now() + 6 * 3600_000);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return {
    start: `${y}-${pad(m + 1)}-01`,
    end: `${y}-${pad(m + 1)}-${pad(last)}`,
    days: last,
  };
}

/** Quick monthly + daily target editor writing to hub_goals. */
export function TargetSetupDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { activeBrand, brandIds } = useBrand();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const { start, end, days } = monthRange();

  const existing = useQuery({
    queryKey: ["vision-targets", brandIds, start],
    enabled: open && brandIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hub_goals")
        .select("id,metric_key,target_value,brand_id,period_start,period_end")
        .not("metric_key", "is", null)
        .lte("period_start", end)
        .gte("period_end", start);
      if (error) throw error;
      return (data ?? []).filter(
        (g) => !g.brand_id || brandIds.includes(String(g.brand_id)),
      );
    },
  });

  useEffect(() => {
    if (!existing.data) return;
    const next: Record<string, string> = {};
    for (const f of TARGET_FIELDS) {
      const rows = existing.data.filter((g) => g.metric_key === f.key);
      const sum = rows.reduce((a, b) => a + Number(b.target_value ?? 0), 0);
      if (sum > 0) next[f.key] = String(sum);
    }
    setVals(next);
  }, [existing.data]);

  const num = (k: Key) => {
    const v = Number(vals[k] ?? "");
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  const filled = TARGET_FIELDS.filter((f) => num(f.key) > 0).length;

  /** Fill monthly numbers from the daily ones (or vice versa). */
  const autoFill = () => {
    const next = { ...vals };
    const map: [Key, Key][] = [
      ["daily_orders", "orders"],
      ["daily_revenue", "delivered_revenue"],
    ];
    for (const [d, m] of map) {
      if (num(d) > 0 && num(m) === 0) next[m] = String(Math.round(num(d) * days));
      else if (num(m) > 0 && num(d) === 0) next[d] = String(Math.round(num(m) / days));
    }
    setVals(next);
    toast.success("দৈনিক ↔ মাসিক মিলিয়ে দিলাম");
  };

  const derivedNote = useMemo(() => {
    const parts: string[] = [];
    if (num("daily_orders") > 0)
      parts.push(`মাসে ~${(num("daily_orders") * days).toLocaleString("en-IN")} order`);
    if (num("daily_revenue") > 0) parts.push(`মাসে ~${bdt(num("daily_revenue") * days)}`);
    if (num("delivered_revenue") > 0 && num("ad_spend") > 0)
      parts.push(`target ROAS ${(num("delivered_revenue") / num("ad_spend")).toFixed(2)}x`);
    return parts.join(" · ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vals, days]);

  const save = useMutation({
    mutationFn: async () => {
      for (const f of TARGET_FIELDS) {
        const raw = vals[f.key];
        const value = Number(raw ?? "");
        const rows = (existing.data ?? []).filter((g) => g.metric_key === f.key);
        if (!raw || !Number.isFinite(value) || value <= 0) {
          if (rows.length) {
            const { error } = await supabase
              .from("hub_goals")
              .delete()
              .in("id", rows.map((r) => r.id));
            if (error) throw error;
          }
          continue;
        }
        if (rows.length > 1) {
          const { error } = await supabase
            .from("hub_goals")
            .delete()
            .in("id", rows.slice(1).map((r) => r.id));
          if (error) throw error;
        }
        if (rows.length) {
          const { error } = await supabase
            .from("hub_goals")
            .update({ target_value: value, period_start: start, period_end: end } as never)
            .eq("id", rows[0].id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("hub_goals").insert({
            brand_id: activeBrand?.id ?? null,
            title: f.label,
            kind: "key_result",
            metric_key: f.key,
            target_value: value,
            current_value: 0,
            unit: f.unit,
            period_start: start,
            period_end: end,
          } as never);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success("Target সেভ হয়েছে");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["growth-vision"] });
      qc.invalidateQueries({ queryKey: ["vision-targets"] });
      qc.invalidateQueries({ queryKey: ["hub-goals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renderField = (f: (typeof TARGET_FIELDS)[number]) => {
    const Icon = f.icon;
    const v = num(f.key);
    return (
      <div
        key={f.key}
        className={cn(
          "rounded-xl border p-3 transition-colors",
          v > 0 ? "border-primary/40 bg-primary/[0.04]" : "border-border/70 bg-muted/20",
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "grid h-7 w-7 shrink-0 place-items-center rounded-lg",
              v > 0 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          <Label className="min-w-0 flex-1 truncate text-xs font-semibold">{f.label}</Label>
          {v > 0 && (
            <Badge variant="secondary" className="shrink-0 text-[10px] tabular-nums">
              {fmt(v, f.unit)}
            </Badge>
          )}
        </div>
        <div className="relative mt-2">
          {f.unit === "bdt" && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              ৳
            </span>
          )}
          <Input
            type="number"
            inputMode="numeric"
            placeholder={f.hint}
            className={cn("h-9 tabular-nums", f.unit === "bdt" && "pl-7")}
            value={vals[f.key] ?? ""}
            onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {f.presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setVals({ ...vals, [f.key]: String(p) })}
              className="rounded-md border border-border/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {f.unit === "bdt" ? bdt(p) : p}
            </button>
          ))}
          {vals[f.key] ? (
            <button
              type="button"
              onClick={() => setVals({ ...vals, [f.key]: "" })}
              className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-destructive"
            >
              মুছো
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Target className="mr-1.5 h-4 w-4" /> Target সেট করো
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto p-0">
        <div className="relative overflow-hidden rounded-t-lg border-b bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_18%,transparent),transparent)] px-5 py-4">
          <DialogHeader className="space-y-1">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-primary" /> Target সেট করো
            </DialogTitle>
            <DialogDescription className="text-xs">
              {activeBrand ? activeBrand.name : "সব brand"} · {start} → {end} ({days} দিন)। খালি
              রাখলে ওই target মুছে যাবে।
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {filled}/{TARGET_FIELDS.length} সেট করা
            </Badge>
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={autoFill}>
              <Sparkles className="mr-1 h-3 w-3" /> দৈনিক ↔ মাসিক মিলাও
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px]"
              onClick={() => setVals({})}
            >
              <RotateCcw className="mr-1 h-3 w-3" /> সব ফাঁকা
            </Button>
          </div>
        </div>

        <div className="space-y-4 px-5 pb-4">
          <section className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Sun className="h-3.5 w-3.5" /> দৈনিক target
            </h4>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {TARGET_FIELDS.filter((f) => f.group === "daily").map(renderField)}
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" /> মাসিক target
            </h4>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {TARGET_FIELDS.filter((f) => f.group === "month").map(renderField)}
            </div>
          </section>

          {derivedNote && (
            <p className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
              {derivedNote}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 border-t px-5 py-3">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            বাতিল
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "সেভ হচ্ছে…" : "সেভ করো"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type TargetKey = Key;
