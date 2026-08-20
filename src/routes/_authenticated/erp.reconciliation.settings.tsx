import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, Settings2, Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountCombobox } from "@/components/erp/finance/account-combobox";

export const Route = createFileRoute("/_authenticated/erp/reconciliation/settings")({
  head: () => ({
    meta: [
      { title: "COD Wallet Defaults — Reconciliation" },
      {
        name: "description",
        content:
          "Set the default COD wallet and courier fee category for each brand so invoice reconciliation posts payouts automatically.",
      },
      { property: "og:title", content: "COD Wallet Defaults — Reconciliation" },
      {
        property: "og:description",
        content: "Per-brand default COD wallet used by automatic courier invoice settlement.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReconciliationSettingsPage,
});

type SettingRow = {
  brand_id: string;
  default_cod_wallet_id: string | null;
  default_cod_fee_category_id: string | null;
};

type AccountRow = {
  id: string;
  name: string;
  brand_id: string | null;
  account_type: string | null;
  current_balance: number | string | null;
  is_active: boolean | null;
};

function ReconciliationSettingsPage() {
  const { brands } = useBrand();
  const qc = useQueryClient();

  const settingsQ = useQuery({
    queryKey: ["recon_settings_all_brands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_settings")
        .select("brand_id, default_cod_wallet_id, default_cod_fee_category_id");
      if (error) throw error;
      return (data ?? []) as SettingRow[];
    },
  });

  const accountsQ = useQuery({
    queryKey: ["recon_settings_accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_accounts")
        .select("id,name,brand_id,account_type,current_balance,is_active")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as AccountRow[];
    },
  });

  const catsQ = useQuery({
    queryKey: ["recon_settings_fee_cats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_expense_categories")
        .select("id,name,brand_id,is_active")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; brand_id: string | null }>;
    },
  });

  const settingsByBrand = useMemo(() => {
    const m = new Map<string, SettingRow>();
    (settingsQ.data ?? []).forEach((s) => m.set(s.brand_id, s));
    return m;
  }, [settingsQ.data]);

  const accountsByBrand = useMemo(() => {
    const m = new Map<string, AccountRow[]>();
    (accountsQ.data ?? []).forEach((a) => {
      const key = a.brand_id ?? "__shared__";
      const list = m.get(key) ?? [];
      list.push(a);
      m.set(key, list);
    });
    return m;
  }, [accountsQ.data]);

  const brandNames = useMemo(() => {
    const o: Record<string, string> = {};
    brands.forEach((b) => (o[b.id] = b.name));
    return o;
  }, [brands]);

  const saveMut = useMutation({
    mutationFn: async (patch: {
      brandId: string;
      default_cod_wallet_id?: string | null;
      default_cod_fee_category_id?: string | null;
    }) => {
      const { brandId, ...rest } = patch;
      const { error } = await supabase
        .from("erp_settings")
        .upsert({ brand_id: brandId, ...rest }, { onConflict: "brand_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Default saved — reconciliation will use it automatically");
      void qc.invalidateQueries({ queryKey: ["recon_settings_all_brands"] });
      void qc.invalidateQueries({ queryKey: ["erp_settings_cod_wallet"] });
      void qc.invalidateQueries({ queryKey: ["recon_brand_wallet_map"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const configured = brands.filter((b) => settingsByBrand.get(b.id)?.default_cod_wallet_id).length;
  const loading = settingsQ.isLoading || accountsQ.isLoading;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings2 className="h-6 w-6 text-primary" />
            Reconciliation Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Prottek brand-er default COD wallet set koro — courier invoice-er puro payout automatic ei wallet-e post hobe.
          </p>
        </div>
        <Badge variant={configured === brands.length ? "secondary" : "outline"} className="gap-1">
          {configured === brands.length ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
          )}
          {configured}/{brands.length} brand configured
        </Badge>
      </header>

      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          <strong>Invoice-first settlement:</strong> apply / auto-sync-er shomoy invoice-er net payout ek line-e ei wallet-e
          jabe (idempotent). Default set thakle apply dialog ar wallet jiggesh korbe na. Set na thakle settlement fail kore
          &quot;Default COD wallet is not set&quot; error dibe.
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Per-brand defaults
          </CardTitle>
          <CardDescription>
            Wallet = jekhane courier-er taka dhukbe. Fee category = courier charge kon expense head-e dekhabe (reporting only).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : brands.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6">Kono brand access nei.</p>
          ) : (
            brands.map((b) => {
              const s = settingsByBrand.get(b.id);
              const wallets = [
                ...(accountsByBrand.get(b.id) ?? []),
                ...(accountsByBrand.get("__shared__") ?? []),
              ];
              const cats = (catsQ.data ?? []).filter((c) => !c.brand_id || c.brand_id === b.id);
              const hasWallet = !!s?.default_cod_wallet_id;
              return (
                <div key={b.id} className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{b.name}</span>
                    {hasWallet ? (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Default set
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[10px] gap-1 border-amber-500/50 text-amber-700 dark:text-amber-300"
                      >
                        <AlertTriangle className="h-3 w-3" /> Not set
                      </Badge>
                    )}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Default COD wallet</Label>
                      <AccountCombobox
                        accounts={wallets.map((w) => ({
                          id: w.id,
                          name: w.name,
                          account_type: w.account_type,
                          current_balance: w.current_balance,
                          brand_id: w.brand_id,
                        }))}
                        brandNames={brandNames}
                        value={s?.default_cod_wallet_id ?? ""}
                        onChange={(id) => saveMut.mutate({ brandId: b.id, default_cod_wallet_id: id || null })}
                        placeholder="Pick COD wallet…"
                        disabled={saveMut.isPending}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Courier fee expense category</Label>
                      <Select
                        value={s?.default_cod_fee_category_id ?? ""}
                        onValueChange={(v) =>
                          saveMut.mutate({ brandId: b.id, default_cod_fee_category_id: v || null })
                        }
                        disabled={saveMut.isPending}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Pick category…" />
                        </SelectTrigger>
                        <SelectContent>
                          {cats.length === 0 ? (
                            <div className="px-2 py-1.5 text-xs text-muted-foreground">No category</div>
                          ) : (
                            cats.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
