import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plug, Plus, Trash2, Upload, Plug as PageIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBrand } from "@/contexts/brand-context";
import {
  listChannelAccounts,
  saveChannelAccount,
  deleteChannelAccount,
  importChannelSpend,
} from "@/lib/erp/marketing/channels.functions";
import { PLATFORM_LABEL, parseChannelSpendCsv } from "@/lib/erp/marketing/channels.server";

export const Route = createFileRoute("/_authenticated/erp/marketing/channels")({
  head: () => ({
    meta: [
      { title: "Ad Channels — Google & TikTok — Marketing ERP" },
      {
        name: "description",
        content:
          "Connect Google Ads and TikTok Ads accounts alongside Meta, and import daily campaign spend so every channel feeds the same ROAS and profit reports.",
      },
      { property: "og:title", content: "Ad Channels — Marketing ERP" },
      {
        property: "og:description",
        content: "Multi-channel ad accounts and daily spend import for Google and TikTok.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChannelsPage,
});

const bdt = (n: number) =>
  `৳${Number(n || 0).toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;

const SAMPLE = `date,campaign,spend,impressions,clicks,purchases,purchase_value
2026-08-01,Search - Brand,1500,22000,640,12,18500
2026-08-02,Search - Brand,1720,25100,701,14,21300`;

type FormState = {
  accountId?: string;
  platform: "google" | "tiktok";
  name: string;
  externalId: string;
  currency: string;
  usdToBdtRate: number;
  active: boolean;
  brandIds: string[];
};

const EMPTY_FORM: FormState = {
  platform: "google",
  name: "",
  externalId: "",
  currency: "BDT",
  usdToBdtRate: 120,
  active: true,
  brandIds: [],
};

function ChannelsPage() {
  const { brands, isLoading: brandsLoading } = useBrand();
  const qc = useQueryClient();

  const listFn = useServerFn(listChannelAccounts);
  const saveFn = useServerFn(saveChannelAccount);
  const delFn = useServerFn(deleteChannelAccount);
  const importFn = useServerFn(importChannelSpend);

  const brandIds = useMemo(() => brands.map((b) => b.id), [brands]);
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "—";

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [importAccount, setImportAccount] = useState<string>("");
  const [csv, setCsv] = useState("");

  const accountsQ = useQuery({
    queryKey: ["mkt-channels", brandIds.slice().sort().join(",")],
    queryFn: () => listFn({ data: { brandIds } }),
    enabled: brandIds.length > 0,
    staleTime: 60_000,
  });

  const accounts = accountsQ.data ?? [];
  const channelAccounts = accounts.filter((a: any) => a.platform !== "meta");
  const metaAccounts = accounts.filter((a: any) => a.platform === "meta");

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Account name din");
      if (!form.externalId.trim()) throw new Error("Account ID din");
      if (form.brandIds.length === 0) throw new Error("Kompokkho ekta brand select korun");
      return saveFn({ data: { ...form } });
    },
    onSuccess: () => {
      toast.success("Channel account save hoyeche");
      setForm(EMPTY_FORM);
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["mkt-channels"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (accountId: string) => delFn({ data: { accountId } }),
    onSuccess: () => {
      toast.success("Account delete hoyeche");
      qc.invalidateQueries({ queryKey: ["mkt-channels"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const parsed = useMemo(() => parseChannelSpendCsv(csv), [csv]);

  const doImport = useMutation({
    mutationFn: async () => {
      if (!importAccount) throw new Error("Account select korun");
      if (parsed.rows.length === 0) throw new Error("Kono valid row nei");
      return importFn({ data: { accountId: importAccount, rows: parsed.rows } });
    },
    onSuccess: (r: any) => {
      toast.success(`${r.inserted} din import hoyeche (${r.campaigns} campaign)`);
      setCsv("");
      qc.invalidateQueries({ queryKey: ["mkt-channels"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <PageIcon className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold tracking-tight">Ad Channels</h1>
          <p className="text-xs text-muted-foreground">
            Meta-r pashapashi Google Ads / TikTok Ads account rakho — spend import korle sob
            marketing report, ROAS ar profit calculation-e ek shathe ashbe.
          </p>
          </div>
        </div>
        <Button onClick={() => { setForm(EMPTY_FORM); setShowForm((v) => !v); }}>
          <Plus className="h-4 w-4" /> New channel account
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Channel account</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Platform</Label>
              <Select
                value={form.platform}
                onValueChange={(v) => setForm({ ...form, platform: v as FormState["platform"] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="google">Google Ads</SelectItem>
                  <SelectItem value="tiktok">TikTok Ads</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Account name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="SWUS — Google Search"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Account ID (external)</Label>
              <Input
                value={form.externalId}
                onChange={(e) => setForm({ ...form, externalId: e.target.value })}
                placeholder="123-456-7890"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Currency</Label>
                <Input
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">USD → BDT rate</Label>
                <Input
                  type="number"
                  value={form.usdToBdtRate}
                  onChange={(e) => setForm({ ...form, usdToBdtRate: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Brands</Label>
              <div className="flex flex-wrap gap-2">
                {brandsLoading && <Skeleton className="h-8 w-40" />}
                {brands.map((b) => {
                  const on = form.brandIds.includes(b.id);
                  return (
                    <Button
                      key={b.id}
                      type="button"
                      size="sm"
                      variant={on ? "default" : "outline"}
                      onClick={() =>
                        setForm({
                          ...form,
                          brandIds: on
                            ? form.brandIds.filter((x) => x !== b.id)
                            : [...form.brandIds, b.id],
                        })
                      }
                    >
                      {b.name}
                    </Button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3 md:col-span-2">
              <Label className="text-sm">Active</Label>
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm({ ...form, active: v })}
              />
            </div>
            <div className="flex justify-end gap-2 md:col-span-2">
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Saving..." : "Save account"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plug className="h-4 w-4" /> Connected accounts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {accountsQ.isLoading && <Skeleton className="h-24 w-full rounded-lg" />}
          {!accountsQ.isLoading && accounts.length === 0 && (
            <p className="text-sm text-muted-foreground">Kono ad account nei.</p>
          )}
          {channelAccounts.map((a: any) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{a.name}</span>
                  <Badge variant="secondary">
                    {PLATFORM_LABEL[a.platform as keyof typeof PLATFORM_LABEL] ?? a.platform}
                  </Badge>
                  <Badge variant={a.status === "active" ? "default" : "outline"}>{a.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {a.external_id} · {brandName(a.brand_id)} · {a.days_with_data} din data ·{" "}
                  {bdt(a.total_spend)} spend
                  {a.last_insights_sync_at
                    ? ` · last import ${new Date(a.last_insights_sync_at).toLocaleString()}`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setForm({
                      accountId: a.id,
                      platform: a.platform,
                      name: a.name,
                      externalId: a.external_id,
                      currency: a.currency ?? "BDT",
                      usdToBdtRate: Number(a.usd_to_bdt_rate ?? 120),
                      active: a.status === "active",
                      brandIds: [a.brand_id],
                    });
                    setShowForm(true);
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove.mutate(a.id)}
                  disabled={remove.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {metaAccounts.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {metaAccounts.length} Meta account API theke auto-sync hoy — segulo Marketing
              Settings theke manage koro.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" /> Daily spend import
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Google Ads / TikTok Ads report CSV theke column gulo ei order-e paste koro:{" "}
            <code>date, campaign, spend, impressions, clicks, purchases, purchase_value</code>. Ek
            din + ek campaign er row abar import korle purono row replace hobe.
          </p>
          <div className="grid gap-3 md:grid-cols-[280px_1fr]">
            <div className="space-y-1.5">
              <Label className="text-xs">Account</Label>
              <Select value={importAccount} onValueChange={setImportAccount}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {channelAccounts.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({PLATFORM_LABEL[a.platform as keyof typeof PLATFORM_LABEL]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">CSV / TSV data</Label>
              <Textarea
                rows={8}
                className="font-mono text-xs"
                placeholder={SAMPLE}
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
              />
            </div>
          </div>
          {csv.trim() && (
            <div className="rounded-lg border bg-muted/40 p-3 text-xs">
              <p>
                {parsed.rows.length} valid row ·{" "}
                {bdt(parsed.rows.reduce((s, r) => s + r.spend, 0))} total spend
              </p>
              {parsed.errors.slice(0, 5).map((e) => (
                <p key={e} className="text-destructive">{e}</p>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <Button
              onClick={() => doImport.mutate()}
              disabled={doImport.isPending || parsed.rows.length === 0 || !importAccount}
            >
              {doImport.isPending ? "Importing..." : "Import spend"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}