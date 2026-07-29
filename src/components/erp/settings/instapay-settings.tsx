import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

const WEBHOOK_URL = "https://swus-erp.lovable.app/api/public/webhook/pathao";

export function InstapaySettings({ brandId }: { brandId: string }) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["instapay-settings", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const [{ data: s }, { data: acc }] = await Promise.all([
        supabase.from("erp_settings").select("config").eq("brand_id", brandId).maybeSingle(),
        supabase
          .from("erp_accounts")
          .select("id,name,current_balance")
          .eq("brand_id", brandId)
          .ilike("name", "INSTAPAY PATHAO")
          .maybeSingle(),
      ]);
      const cfg = (s?.config as any) ?? {};
      return {
        auto: cfg.instapay_auto_apply === undefined || cfg.instapay_auto_apply === null ? true : Boolean(cfg.instapay_auto_apply),
        wallet: acc ?? null,
      };
    },
  });

  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (data) setAuto(data.auto);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: cur } = await supabase.from("erp_settings").select("config").eq("brand_id", brandId).maybeSingle();
      const nextConfig = { ...((cur?.config as any) ?? {}), instapay_auto_apply: auto };
      const { error } = await supabase
        .from("erp_settings")
        .upsert({ brand_id: brandId, config: nextConfig }, { onConflict: "brand_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("InstaPay setting save hoyeche");
      qc.invalidateQueries({ queryKey: ["instapay-settings", brandId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Pathao InstaPay
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Pathao payment-invoice webhook ashle payout automatic “INSTAPAY PATHAO” wallet-e credit hobe, order settle hobe.
            Auto off korle run-gulo pending thakbe — Reconciliation page theke manually Apply / CSV upload korte parben.
          </p>
        </div>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
          Save
        </Button>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <Label className="text-sm">Auto-apply invoice</Label>
          <p className="text-xs text-muted-foreground">Webhook theke asha invoice sathe sathe wallet-e post hobe.</p>
        </div>
        <Switch checked={auto} onCheckedChange={setAuto} />
      </div>

      <div className="rounded-lg border p-3 text-xs space-y-1">
        <div className="text-muted-foreground">Webhook URL (Pathao merchant panel-e set korun):</div>
        <code className="block break-all rounded bg-muted px-2 py-1">{WEBHOOK_URL}</code>
      </div>

      {data?.wallet ? (
        <div className="rounded-lg border p-3 text-sm flex items-center justify-between">
          <span>{data.wallet.name}</span>
          <span className="font-semibold">৳{Number(data.wallet.current_balance ?? 0).toLocaleString("en-BD")}</span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Wallet ekhono toiri hoyni — prothom invoice ashlei “INSTAPAY PATHAO” account automatic toiri hobe.
        </p>
      )}
    </div>
  );
}