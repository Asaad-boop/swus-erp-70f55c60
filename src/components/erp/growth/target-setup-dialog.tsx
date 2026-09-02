import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  { key: "daily_orders", label: "দৈনিক order target", unit: "number", hint: "প্রতিদিন কয়টা order" },
  { key: "daily_revenue", label: "দৈনিক delivered revenue", unit: "bdt", hint: "প্রতিদিন কত ৳ deliver" },
  { key: "daily_profit", label: "দৈনিক net profit", unit: "bdt", hint: "ads + courier বাদে" },
  { key: "orders", label: "মাসিক order target", unit: "number", hint: "এই মাসে মোট order" },
  { key: "delivered_revenue", label: "মাসিক delivered revenue", unit: "bdt", hint: "এই মাসে ৳" },
  { key: "delivered_orders", label: "মাসিক delivered order", unit: "number", hint: "এই মাসে delivered" },
  { key: "ad_spend", label: "মাসিক ad spend সীমা", unit: "bdt", hint: "সর্বোচ্চ খরচ" },
] as const;

type Key = (typeof TARGET_FIELDS)[number]["key"];

function monthRange() {
  const now = new Date(Date.now() + 6 * 3600_000);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return { start: `${y}-${pad(m + 1)}-01`, end: `${y}-${pad(m + 1)}-${pad(last)}` };
}

/** Quick monthly + daily target editor writing to hub_goals. */
export function TargetSetupDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { activeBrand, brandIds } = useBrand();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const { start, end } = monthRange();

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <Target className="mr-1.5 h-4 w-4" /> Target সেট করো
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Target সেট করো</DialogTitle>
          <DialogDescription>
            {activeBrand ? activeBrand.name : "সব brand"} · {start} → {end}. খালি রাখলে target মুছে যাবে।
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {TARGET_FIELDS.map((f) => (
            <div key={f.key} className="grid gap-1.5">
              <Label className="text-xs">{f.label}</Label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder={f.hint}
                value={vals[f.key] ?? ""}
                onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
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
