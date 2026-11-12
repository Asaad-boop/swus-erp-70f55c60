import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Facebook, Loader2, LogOut, RefreshCw, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBrand } from "@/contexts/brand-context";
import {
  getMetaLoginUrl,
  getMetaOAuthAccounts,
  importMetaOAuthAccounts,
  disconnectMetaLogin,
} from "@/lib/erp/marketing/meta-oauth.functions";

export function MetaLoginConnect({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { brands } = useBrand();
  const loginFn = useServerFn(getMetaLoginUrl);
  const listFn = useServerFn(getMetaOAuthAccounts);
  const importFn = useServerFn(importMetaOAuthAccounts);
  const outFn = useServerFn(disconnectMetaLogin);
  const [picked, setPicked] = useState<string[]>([]);
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [rate, setRate] = useState(125);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("meta");
    if (p === "connected") toast.success("Facebook login hoyeche — ad account select koro");
    else if (p === "error") toast.error("Facebook login fail hoyeche, abar try koro");
    else if (p === "cancelled") toast.message("Facebook login cancel kora hoyeche");
    if (p) {
      const u = new URL(window.location.href);
      u.searchParams.delete("meta");
      window.history.replaceState(null, "", u.toString());
    }
  }, []);
  useEffect(() => {
    if (!brandIds.length && brands[0]) setBrandIds([brands[0].id]);
  }, [brands, brandIds.length]);

  const q = useQuery({ queryKey: ["meta-oauth-accounts"], queryFn: () => listFn(), enabled: canEdit, retry: false });

  const loginM = useMutation({
    mutationFn: () => loginFn({ data: { origin: window.location.origin } }),
    onSuccess: (r) => { window.location.href = r.url; },
    onError: (e: any) => toast.error(e?.message ?? "Login start hoy nai"),
  });
  const importM = useMutation({
    mutationFn: () => {
      const list = (q.data?.accounts ?? []).filter((a) => picked.includes(a.id)).map((a) => ({ id: a.id, name: a.name }));
      return importFn({ data: { accounts: list, brandIds, usdToBdtRate: rate, syncNow: true } as never });
    },
    onSuccess: (r: any) => {
      const ok = r.results.filter((x: any) => x.ok).length;
      const bad = r.results.filter((x: any) => !x.ok);
      if (ok) toast.success(`${ok} ta ad account add + data fetch hoyeche`);
      bad.forEach((b: any) => toast.error(`act_${b.id}: ${b.error}`));
      setPicked([]);
      qc.invalidateQueries({ queryKey: ["mkt-settings-accounts"] });
      qc.invalidateQueries({ queryKey: ["meta-oauth-accounts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Add fail"),
  });
  const outM = useMutation({
    mutationFn: () => outFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meta-oauth-accounts"] }),
  });

  const data = q.data;
  const toggle = (arr: string[], id: string, on: boolean) => (on ? [...new Set([...arr, id])] : arr.filter((x) => x !== id));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Facebook className="h-4 w-4 text-primary" /> Facebook diye connect
        </CardTitle>
        {data?.connected ? (
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px]">
              <CheckCircle2 className="mr-1 h-3 w-3" /> {data.fbName ?? "Connected"}
            </Badge>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => loginM.mutate()} disabled={!canEdit}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Re-login
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => outM.mutate()}>
              <LogOut className="mr-1 h-3.5 w-3.5" /> Logout
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : !data?.connected ? (
          <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border p-4">
            <p className="text-xs text-muted-foreground">
              Nijer Facebook ID diye login koro — tomar sob ad account auto list hobe, tick diye add korle data fetch shuru hobe. Token/ID copy-paste lagbe na.
            </p>
            <Button size="sm" disabled={!canEdit || loginM.isPending} onClick={() => loginM.mutate()}>
              {loginM.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Facebook className="mr-1 h-4 w-4" />}
              Login with Facebook
            </Button>
            {q.error && <p className="text-[11px] text-destructive">{(q.error as any).message}</p>}
          </div>
        ) : (
          <>
            {data.expiresAt && (
              <p className="text-[11px] text-muted-foreground">
                Login valid: {new Date(data.expiresAt).toLocaleDateString("en-GB")} porjonto — tar age Re-login korle sob account-er token update hobe.
              </p>
            )}
            <div className="max-h-64 overflow-y-auto rounded-lg border border-border/60">
              {data.accounts.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">Ei Facebook ID-te kono ad account nai.</p>
              ) : (
                data.accounts.map((a) => (
                  <label key={a.id} className="flex cursor-pointer items-center gap-2 border-b border-border/40 px-3 py-2 text-xs last:border-0">
                    <Checkbox checked={picked.includes(a.id)} onCheckedChange={(v) => setPicked((p) => toggle(p, a.id, !!v))} />
                    <div className="flex-1">
                      <p className="font-medium">{a.name}</p>
                      <p className="text-[11px] text-muted-foreground">act_{a.id} · {a.currency}{a.business ? ` · ${a.business}` : ""}</p>
                    </div>
                    {a.alreadyAdded && <Badge variant="outline" className="text-[10px]">Added — token refresh hobe</Badge>}
                    {a.status !== 1 && <Badge variant="destructive" className="text-[10px]">Inactive</Badge>}
                  </label>
                ))
              )}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Brands (prothom ta primary)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {brands.map((b) => (
                    <label key={b.id} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border/60 px-2 py-1 text-xs">
                      <Checkbox checked={brandIds.includes(b.id)} onCheckedChange={(v) => setBrandIds((p) => toggle(p, b.id, !!v))} />
                      {b.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="w-28 space-y-1">
                <Label className="text-xs">USD → BDT</Label>
                <Input className="h-8 text-sm" type="number" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
              </div>
              <Button
                size="sm"
                className="ml-auto"
                disabled={!canEdit || !picked.length || !brandIds.length || importM.isPending}
                onClick={() => importM.mutate()}
              >
                {importM.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {importM.isPending ? "Data fetch hocche…" : `Add ${picked.length || ""} account & fetch data`}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
