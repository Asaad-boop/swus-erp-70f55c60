import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Save, Settings2, ShieldAlert, Plug } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useBrand } from "@/contexts/brand-context";
import {
  getMarketingSettings,
  saveMarketingSettings,
} from "@/lib/erp/marketing/settings.functions";
import {
  DEFAULT_MARKETING_SETTINGS,
  type MarketingSettings,
} from "@/lib/erp/marketing/settings.schema";
import { listConnectedAdAccounts } from "@/lib/erp/marketing/meta.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/settings")({
  head: () => ({
    meta: [
      { title: "Marketing Settings — Marketing ERP" },
      {
        name: "description",
        content:
          "Attribution windows and priority, default ROAS/CPA targets, marketing cost rules, alert thresholds, UTM conventions and connected ad accounts.",
      },
      { property: "og:title", content: "Marketing Settings — Marketing ERP" },
      {
        property: "og:description",
        content: "One place to tune attribution, targets, cost rules and alert thresholds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MarketingSettingsPage,
});

const SOURCE_LABEL: Record<string, string> = {
  utm: "UTM parameters",
  pixel: "Pixel / tracker session",
  product_link: "Product link mapping",
  phone_match: "Phone number match",
  manual: "Manual assignment",
};

function NumField({
  label,
  hint,
  value,
  onChange,
  step = 1,
  suffix,
  disabled,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  suffix?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step={step}
          value={Number.isFinite(value) ? value : 0}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-8 text-sm"
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
      <div>
        <p className="text-xs font-medium">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function MarketingSettingsPage() {
  const qc = useQueryClient();
  const { brands } = useBrand();
  const fetchSettings = useServerFn(getMarketingSettings);
  const saveSettings = useServerFn(saveMarketingSettings);
  const fetchAccounts = useServerFn(listConnectedAdAccounts);

  const settingsQ = useQuery({
    queryKey: ["mkt-settings"],
    queryFn: () => fetchSettings({ data: {} as never }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const brandIds = useMemo(() => brands.map((b) => b.id), [brands]);
  const accountsQ = useQuery({
    queryKey: ["mkt-settings-accounts", brandIds.slice().sort().join(",")],
    queryFn: () => fetchAccounts({ data: { brandIds } }),
    enabled: brandIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const [form, setForm] = useState<MarketingSettings>(DEFAULT_MARKETING_SETTINGS);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settingsQ.data?.settings) {
      setForm(settingsQ.data.settings);
      setDirty(false);
    }
  }, [settingsQ.data]);

  const canEdit = settingsQ.data?.canEdit ?? false;
  const patch = <K extends keyof MarketingSettings>(
    section: K,
    value: Partial<MarketingSettings[K]>,
  ) => {
    setForm((f) => ({ ...f, [section]: { ...f[section], ...value } }));
    setDirty(true);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const list = [...form.attribution.priority];
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    patch("attribution", { priority: list });
  };

  const saveM = useMutation({
    mutationFn: () => saveSettings({ data: form as never }),
    onSuccess: () => {
      toast.success("Marketing settings save hoyeche");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["mkt-settings"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Save fail"),
  });

  const brandName = (id: string | null) => brands.find((b) => b.id === id)?.name ?? "—";

  if (settingsQ.isLoading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Settings2 className="h-4.5 w-4.5" />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight">Marketing Settings</h1>
            <p className="text-xs text-muted-foreground">
              Attribution, target, cost rule, alert threshold ar UTM convention
              {settingsQ.data?.updated_at
                ? ` · last saved ${new Date(settingsQ.data.updated_at).toLocaleString("en-GB")}`
                : ""}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          disabled={!canEdit || !dirty || saveM.isPending}
          onClick={() => saveM.mutate()}
        >
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {saveM.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>

      {!canEdit && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Read-only — sudhu admin ei settings change korte pare.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Attribution rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <NumField
                label="Click window (days)"
                hint="Ad click er por koto din porjonto order oi campaign-e count hobe"
                value={form.attribution.clickWindowDays}
                onChange={(v) => patch("attribution", { clickWindowDays: v })}
                disabled={!canEdit}
              />
              <NumField
                label="View window (days)"
                hint="Click chara sudhu impression dekhle koto din"
                value={form.attribution.viewWindowDays}
                onChange={(v) => patch("attribution", { viewWindowDays: v })}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Source priority (upor = age)</Label>
              <div className="space-y-1">
                {form.attribution.priority.map((s, i) => (
                  <div
                    key={s}
                    className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-1.5"
                  >
                    <span className="text-xs">
                      <Badge variant="outline" className="mr-2 text-[10px]">
                        {i + 1}
                      </Badge>
                      {SOURCE_LABEL[s] ?? s}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={!canEdit || i === 0}
                        onClick={() => move(i, -1)}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={!canEdit || i === form.attribution.priority.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <ToggleRow
              label="Auto-apply high confidence matches"
              hint="Attribution queue-r suggestion confidence threshold par korle apnaap apply hobe"
              checked={form.attribution.autoApply}
              onChange={(v) => patch("attribution", { autoApply: v })}
              disabled={!canEdit}
            />
            <NumField
              label="Minimum confidence"
              hint="0 – 1 (jemon 0.8 = 80%)"
              step={0.05}
              value={form.attribution.autoApplyMinConfidence}
              onChange={(v) => patch("attribution", { autoApplyMinConfidence: v })}
              disabled={!canEdit}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Targets & cost rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <NumField
                label="Default target ROAS"
                hint="Campaign-e alada target na thakle eta use hobe"
                step={0.1}
                value={form.targets.defaultTargetRoas}
                onChange={(v) => patch("targets", { defaultTargetRoas: v })}
                disabled={!canEdit}
              />
              <NumField
                label="Default target CPA"
                suffix="৳"
                value={form.targets.defaultTargetCpa}
                onChange={(v) => patch("targets", { defaultTargetCpa: v })}
                disabled={!canEdit}
              />
            </div>
            <NumField
              label="Agency / management fee"
              suffix="% of spend"
              step={0.5}
              hint="Reports-e marketing cost er upor extra fee dhora hobe"
              value={form.targets.agencyFeePct}
              onChange={(v) => patch("targets", { agencyFeePct: v })}
              disabled={!canEdit}
            />
            <ToggleRow
              label="Manual marketing expense ROAS-e dhorbo"
              hint="Influencer, shoot, print — mkt_manual_expenses total marketing cost-e jog hobe"
              checked={form.targets.includeManualExpenses}
              onChange={(v) => patch("targets", { includeManualExpenses: v })}
              disabled={!canEdit}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Alert thresholds</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <NumField
              label="Default lookback (days)"
              value={form.alerts.defaultLookbackDays}
              onChange={(v) => patch("alerts", { defaultLookbackDays: v })}
              disabled={!canEdit}
            />
            <NumField
              label="ROAS drop trigger"
              suffix="%"
              value={form.alerts.roasDropPct}
              onChange={(v) => patch("alerts", { roasDropPct: v })}
              disabled={!canEdit}
            />
            <NumField
              label="CPA spike trigger"
              suffix="%"
              value={form.alerts.cpaSpikePct}
              onChange={(v) => patch("alerts", { cpaSpikePct: v })}
              disabled={!canEdit}
            />
            <NumField
              label="Creative fatigue frequency"
              step={0.1}
              value={form.alerts.frequencyMax}
              onChange={(v) => patch("alerts", { frequencyMax: v })}
              disabled={!canEdit}
            />
            <NumField
              label="High return rate"
              suffix="%"
              value={form.alerts.returnRatePct}
              onChange={(v) => patch("alerts", { returnRatePct: v })}
              disabled={!canEdit}
            />
            <NumField
              label="Low stock units"
              value={form.alerts.lowStockUnits}
              onChange={(v) => patch("alerts", { lowStockUnits: v })}
              disabled={!canEdit}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">UTM & naming convention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Default utm_source</Label>
                <Input
                  className="h-8 text-sm"
                  value={form.utm.defaultSource}
                  disabled={!canEdit}
                  onChange={(e) => patch("utm", { defaultSource: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Default utm_medium</Label>
                <Input
                  className="h-8 text-sm"
                  value={form.utm.defaultMedium}
                  disabled={!canEdit}
                  onChange={(e) => patch("utm", { defaultMedium: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Campaign naming pattern</Label>
              <Input
                className="h-8 font-mono text-xs"
                value={form.utm.campaignNaming}
                disabled={!canEdit}
                onChange={(e) => patch("utm", { campaignNaming: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">
                Token: {"{brand}"} {"{objective}"} {"{product}"} {"{date}"} — team ke ei convention
                follow korte bolun.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Plug className="h-4 w-4 text-muted-foreground" />
            Connected ad accounts & channels
          </CardTitle>
          <Button asChild variant="outline" size="sm" className="h-7 text-xs">
            <Link to="/erp/settings" search={{ tab: "integrations" } as never}>
              Manage in Integrations
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {accountsQ.isLoading ? (
            <Skeleton className="h-24 w-full rounded-lg" />
          ) : (accountsQ.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Kono ad account connect kora nei.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full text-xs">
                <thead className="bg-muted/60">
                  <tr>
                    {[
                      "Account",
                      "Platform",
                      "Primary brand",
                      "Status",
                      "Token",
                      "Auto-post",
                      "Last insights sync",
                    ].map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-2 text-left font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(accountsQ.data ?? []).map((a: any) => (
                    <tr key={a.id} className="border-t border-border/50">
                      <td className="px-3 py-2">
                        <p className="font-medium">{a.name}</p>
                        <p className="text-[11px] text-muted-foreground">act_{a.external_id}</p>
                      </td>
                      <td className="px-3 py-2">Meta</td>
                      <td className="px-3 py-2">{brandName(a.primary_brand_id)}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={a.status === "active" ? "default" : "secondary"}
                          className="text-[10px]"
                        >
                          {a.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">{a.has_access_token ? "Saved" : "Missing"}</td>
                      <td className="px-3 py-2">{a.auto_post_to_finance ? "On" : "Off"}</td>
                      <td className="px-3 py-2">
                        {a.last_insights_sync_at
                          ? new Date(a.last_insights_sync_at).toLocaleString("en-GB")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Separator className="my-3" />
          <p className="text-[11px] text-muted-foreground">
            Credential, wallet mapping ar sync schedule Settings → Integrations theke control hoy.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
