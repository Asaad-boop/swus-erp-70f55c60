import { dhakaToday } from "@/lib/erp/finance";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Trash2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";

type FX = { id: string; from_ccy: string; to_ccy: string; rate: number; rate_date: string };

export function FxPage() {
  const { brandId, effectiveBrand, picker } = useBrandPicker();
  const qc = useQueryClient();
  const [form, setForm] = useState({ from_ccy: "USD", to_ccy: "BDT", rate: "", rate_date: dhakaToday() });

  const ratesQ = useQuery({
    queryKey: ["fx_rates", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_fx_rates" as never)
        .select("*").eq("brand_id", brandId!).order("rate_date", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as FX[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("erp_fx_rates" as never).upsert({
        brand_id: brandId, from_ccy: form.from_ccy.toUpperCase(), to_ccy: form.to_ccy.toUpperCase(),
        rate: Number(form.rate), rate_date: form.rate_date,
      } as never, { onConflict: "brand_id,from_ccy,to_ccy,rate_date" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("FX rate saved"); qc.invalidateQueries({ queryKey: ["fx_rates"] }); setForm({ ...form, rate: "" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      {picker && <div className="flex justify-end -mb-1">{picker}</div>}
      <header>
        <h1 className="text-2xl font-bold tracking-tight">FX Rates</h1>
        <p className="text-sm text-muted-foreground">Currency conversion rates (BDT base). Used for foreign supplier bills & USD revenue.</p>
      </header>

      <CnyQuickUpdate brandId={brandId} />

      <div className="rounded-md border bg-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div><Label className="text-xs">From CCY</Label><Input value={form.from_ccy} onChange={(e) => setForm({ ...form, from_ccy: e.target.value })} maxLength={3} className="uppercase" /></div>
          <div><Label className="text-xs">To CCY</Label><Input value={form.to_ccy} onChange={(e) => setForm({ ...form, to_ccy: e.target.value })} maxLength={3} className="uppercase" /></div>
          <div><Label className="text-xs">Rate</Label><Input type="number" step="0.0001" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></div>
          <div><Label className="text-xs">Date</Label><Input type="date" value={form.rate_date} onChange={(e) => setForm({ ...form, rate_date: e.target.value })} /></div>
          <Button onClick={() => save.mutate()} disabled={!form.rate || save.isPending}>Save Rate</Button>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead className="text-right">Rate</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(ratesQ.data ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No rates yet.</TableCell></TableRow>}
            {(ratesQ.data ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs">{r.rate_date}</TableCell>
                <TableCell className="font-mono">{r.from_ccy}</TableCell>
                <TableCell className="font-mono">{r.to_ccy}</TableCell>
                <TableCell className="text-right font-mono">{Number(r.rate).toFixed(4)}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={async () => {
                    if (!confirm("Delete this rate?")) return;
                    const { error } = await supabase.from("erp_fx_rates" as never).delete().eq("id", r.id);
                    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["fx_rates"] });
                  }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CnyQuickUpdate({ brandId }: { brandId?: string }) {
  const qc = useQueryClient();
  const [newRate, setNewRate] = useState("");

  const histQ = useQuery({
    queryKey: ["fx_cny_bdt", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_fx_rates" as never)
        .select("rate, rate_date")
        .eq("brand_id", brandId!)
        .eq("from_ccy", "CNY").eq("to_ccy", "BDT")
        .order("rate_date", { ascending: false }).limit(10);
      if (error) throw error;
      return (data ?? []) as unknown as { rate: number; rate_date: string }[];
    },
  });

  const history = histQ.data ?? [];
  const current = history[0];
  const daysOld = current
    ? Math.floor((Date.now() - new Date(current.rate_date).getTime()) / 86400000)
    : null;
  const stale = daysOld !== null && daysOld >= 7;
  const sparkData = [...history].reverse().map((h) => ({ date: h.rate_date, rate: Number(h.rate) }));

  const update = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("Pick brand");
      const r = Number(newRate);
      if (!r || r <= 0) throw new Error("Enter rate");
      const { error } = await supabase.from("erp_fx_rates" as never).upsert({
        brand_id: brandId, from_ccy: "CNY", to_ccy: "BDT",
        rate: r, rate_date: dhakaToday(),
      } as never, { onConflict: "brand_id,from_ccy,to_ccy,rate_date" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("CNY→BDT rate updated");
      setNewRate("");
      qc.invalidateQueries({ queryKey: ["fx_cny_bdt"] });
      qc.invalidateQueries({ queryKey: ["fx_rates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-lg border bg-gradient-to-br from-red-50 to-amber-50 dark:from-red-950/20 dark:to-amber-950/20 p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🇨🇳 → 🇧🇩</span>
            <h2 className="font-semibold">CNY → BDT Rate</h2>
            {stale && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />Stale ({daysOld}d)
              </Badge>
            )}
          </div>
          <div className="text-3xl font-bold tabular-nums">
            {current ? Number(current.rate).toFixed(4) : "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {current
              ? `Last updated: ${current.rate_date}${daysOld !== null ? ` (${daysOld === 0 ? "today" : `${daysOld}d ago`})` : ""}`
              : "No rate set yet"}
          </div>
        </div>

        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">New Rate</Label>
            <Input type="number" step="0.0001" value={newRate} placeholder="e.g. 16.50"
              onChange={(e) => setNewRate(e.target.value)} className="w-32" />
          </div>
          <Button onClick={() => update.mutate()} disabled={!newRate || update.isPending}>
            Update ✓
          </Button>
        </div>

        {sparkData.length > 1 && (
          <div className="w-full md:w-48 h-16">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <Tooltip formatter={(v: any) => Number(v).toFixed(4)} />
                <Line type="monotone" dataKey="rate" stroke="var(--primary)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}