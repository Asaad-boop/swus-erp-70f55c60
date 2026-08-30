import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, PlugZap, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useBrand } from "@/contexts/brand-context";
import {
  createAdAccount,
  updateAdAccount,
  deleteAdAccount,
  testAdAccountConnection,
} from "@/lib/erp/marketing/meta.functions";

export type AdAccountRow = {
  id: string;
  name: string;
  external_id: string;
  status: string;
  app_id?: string | null;
  usd_to_bdt_rate?: number | null;
  auto_post_to_finance?: boolean | null;
  finance_wallet_id?: string | null;
  brand_ids: string[];
  primary_brand_id: string | null;
  has_access_token: boolean;
  last_error?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** null = create mode */
  account: AdAccountRow | null;
};

export function AdAccountDialog({ open, onOpenChange, account }: Props) {
  const qc = useQueryClient();
  const { brands } = useBrand();
  const createFn = useServerFn(createAdAccount);
  const updateFn = useServerFn(updateAdAccount);
  const deleteFn = useServerFn(deleteAdAccount);
  const testFn = useServerFn(testAdAccountConnection);

  const isEdit = !!account;
  const [name, setName] = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [rate, setRate] = useState(125);
  const [active, setActive] = useState(true);
  const [autoPost, setAutoPost] = useState(true);
  const [brandIds, setBrandIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? "");
    setAdAccountId(account?.external_id ?? "");
    setAccessToken("");
    setAppId(account?.app_id ?? "");
    setAppSecret("");
    setRate(account?.usd_to_bdt_rate ?? 125);
    setActive(account ? account.status === "active" : true);
    setAutoPost(account?.auto_post_to_finance ?? true);
    setBrandIds(account?.brand_ids?.length ? account.brand_ids : (brands[0] ? [brands[0].id] : []));
  }, [open, account, brands]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["mkt-settings-accounts"] });

  const saveM = useMutation({
    mutationFn: async () => {
      if (brandIds.length === 0) throw new Error("Kompokkho ekta brand select korun");
      if (isEdit) {
        return updateFn({
          data: {
            accountId: account!.id,
            brandIds,
            name: name.trim(),
            adAccountId: adAccountId.trim(),
            accessToken: accessToken.trim() || null,
            appId: appId.trim() || null,
            appSecret: appSecret.trim() || null,
            usdToBdtRate: rate,
            active,
            autoPostToFinance: autoPost,
          } as never,
        });
      }
      if (!accessToken.trim()) throw new Error("Access token dite hobe");
      return createFn({
        data: {
          brandIds,
          name: name.trim(),
          adAccountId: adAccountId.trim(),
          accessToken: accessToken.trim(),
          appId: appId.trim() || null,
          appSecret: appSecret.trim() || null,
          usdToBdtRate: rate,
          active,
          autoPostToFinance: autoPost,
        } as never,
      });
    },
    onSuccess: () => {
      toast.success(isEdit ? "Ad account update hoyeche" : "Ad account add hoyeche");
      invalidate();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Save fail"),
  });

  const testM = useMutation({
    mutationFn: async () => {
      if (isEdit && !accessToken.trim()) {
        return testFn({ data: { accountId: account!.id } as never });
      }
      return testFn({
        data: { accessToken: accessToken.trim(), adAccountId: adAccountId.trim() } as never,
      });
    },
    onSuccess: (r: any) => {
      toast.success(`Connection OK — ${r?.info?.name ?? "Meta account"}`);
      invalidate();
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "Connection failed");
      invalidate();
    },
  });

  const deleteM = useMutation({
    mutationFn: () => deleteFn({ data: { accountId: account!.id } as never }),
    onSuccess: () => {
      toast.success("Ad account delete hoyeche");
      invalidate();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete fail"),
  });

  const toggleBrand = (id: string, on: boolean) =>
    setBrandIds((prev) => (on ? [...new Set([...prev, id])] : prev.filter((b) => b !== id)));

  const busy = saveM.isPending || testM.isPending || deleteM.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit ad account" : "Add ad account"}</DialogTitle>
          <DialogDescription className="text-xs">
            Meta Ads account connect koro — token, brand mapping ar auto-post settings ekhanei.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Account name</Label>
              <Input className="h-8 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ad Account ID (act_ chara)</Label>
              <Input
                className="h-8 font-mono text-sm"
                placeholder="7195819611…"
                value={adAccountId}
                onChange={(e) => setAdAccountId(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">
              Access token {isEdit && <span className="text-muted-foreground">(faka rakhle agertai thakbe)</span>}
            </Label>
            <Input
              className="h-8 font-mono text-xs"
              type="password"
              placeholder={isEdit && account?.has_access_token ? "•••••• saved token ache" : "EAA…"}
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">App ID (optional)</Label>
              <Input className="h-8 text-sm" value={appId} onChange={(e) => setAppId(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">App secret (optional)</Label>
              <Input
                className="h-8 text-sm"
                type="password"
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">USD → BDT rate</Label>
              <Input
                className="h-8 text-sm"
                type="number"
                step={0.5}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Brands (prothom ta primary)</Label>
            <div className="flex flex-wrap gap-2">
              {brands.map((b) => (
                <label
                  key={b.id}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs"
                >
                  <Checkbox
                    checked={brandIds.includes(b.id)}
                    onCheckedChange={(v) => toggleBrand(b.id, !!v)}
                  />
                  {b.name}
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
              <div>
                <p className="text-xs font-medium">Active</p>
                <p className="text-[11px] text-muted-foreground">Sync cholbe</p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
              <div>
                <p className="text-xs font-medium">Auto-post to finance</p>
                <p className="text-[11px] text-muted-foreground">Spend wallet theke katbe</p>
              </div>
              <Switch checked={autoPost} onCheckedChange={setAutoPost} />
            </div>
          </div>

          {isEdit && account?.last_error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
              Last error: {account.last_error}
            </p>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex gap-2">
            {isEdit && (
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Ei ad account delete korte chan? Sync history thakbe na.")) {
                    deleteM.mutate();
                  }
                }}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={busy || (!isEdit && !accessToken.trim())}
              onClick={() => testM.mutate()}
            >
              {testM.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlugZap className="mr-1 h-3.5 w-3.5" />
              )}
              Test connection
            </Button>
          </div>
          <Button
            size="sm"
            disabled={busy || !name.trim() || !adAccountId.trim() || brandIds.length === 0}
            onClick={() => saveM.mutate()}
          >
            {saveM.isPending ? "Saving…" : isEdit ? "Save changes" : "Add account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
