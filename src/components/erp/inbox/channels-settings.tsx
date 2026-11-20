import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Copy, Facebook, Loader2, Plug, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BrandBadge } from "@/components/erp/brand-badge";
import { useBrand } from "@/contexts/brand-context";
import { db, inboxApi, type InboxChannel, type InboxPlatform } from "@/lib/erp/inbox/inbox";

type SetupInfo = {
  appConfigured: boolean;
  appId: string | null;
  callbackUrl: string;
  verifyToken: string;
  redirectUri: string;
  fbSession: { name: string | null; expiresAt: string | null } | null;
  lastWebhookError: { error: string | null; at: string } | null;
};
type MetaPage = {
  id: string;
  name: string;
  picture: string | null;
  instagram: {
    id: string;
    username: string | null;
    name: string | null;
    picture: string | null;
  } | null;
  messengerConnected: boolean;
  instagramConnected: boolean;
  brandId: string | null;
};
type PagesResult = { connected: boolean; pages: MetaPage[] };
type ConnectResult = { results: Array<{ pageId: string; ok: boolean; error?: string }> };
import { ContactAvatar, PlatformChip } from "./shared";

function CopyRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs">
          {value ?? "—"}
        </code>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={!value}
          onClick={() => {
            navigator.clipboard.writeText(value ?? "");
            toast.success("Copied");
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

type PagePick = { brandId: string; messenger: boolean; instagram: boolean };

export function ChannelsSettings({
  channels,
  metaParam,
}: {
  channels: InboxChannel[];
  metaParam?: string;
}) {
  const qc = useQueryClient();
  const { brands } = useBrand();
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const setupQ = useQuery({
    queryKey: ["inbox", "setup"],
    queryFn: () => inboxApi<SetupInfo>("setup_info"),
  });
  const pagesQ = useQuery({
    queryKey: ["inbox", "meta-pages"],
    queryFn: () => inboxApi<PagesResult>("list_pages"),
    enabled: !!setupQ.data?.fbSession,
    retry: false,
  });

  useEffect(() => {
    if (metaParam === "connected")
      toast.success("Facebook connected — ekhon page gula select koro");
    else if (metaParam === "error") toast.error("Facebook login fail korse, abar try koro");
    else if (metaParam === "cancelled") toast("Facebook login cancel kora hoyeche");
    else if (metaParam === "whatsapp_connected")
      toast.success("WhatsApp number connected ✅ Brand thik ache kina niche check koro");
    else if (metaParam === "whatsapp_none")
      toast.error("WhatsApp signup hoyeche, kintu kono number pawa jay nai");
    else if (metaParam === "whatsapp_error")
      toast.error("WhatsApp connect fail korse — Step 1 er 'Last webhook error' dekho");
  }, [metaParam]);

  const [picks, setPicks] = useState<Record<string, PagePick>>({});
  useEffect(() => {
    if (!pagesQ.data?.connected) return;
    setPicks((prev) => {
      const next = { ...prev };
      for (const p of pagesQ.data.pages) {
        if (!next[p.id]) {
          next[p.id] = {
            brandId: p.brandId ?? "",
            messenger: p.messengerConnected,
            instagram: p.instagramConnected,
          };
        }
      }
      return next;
    });
  }, [pagesQ.data]);

  const login = useMutation({
    mutationFn: () => inboxApi<{ url: string }>("login_url", { origin }),
    onSuccess: (r) => {
      window.location.href = r.url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const connect = useMutation({
    mutationFn: () => {
      const pages = Object.entries(picks)
        .filter(([, v]) => v.brandId && (v.messenger || v.instagram))
        .map(([pageId, v]) => ({ pageId, ...v }));
      if (pages.length === 0)
        throw new Error("Kono page select kora hoy nai (brand + Messenger/IG tick dao)");
      return inboxApi<ConnectResult>("connect_pages", { pages });
    },
    onSuccess: (r) => {
      const failed = r.results.filter((x) => !x.ok);
      if (failed.length)
        toast.error(`${failed.length}ta page connect hoy nai: ${failed[0]!.error}`);
      else toast.success("Pages connected ✅ Ekhon theke message inbox e ashbe");
      qc.invalidateQueries({ queryKey: ["inbox"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnect = useMutation({
    mutationFn: (channelId: string) => inboxApi("disconnect", { channelId }),
    onSuccess: () => {
      toast.success("Disconnected");
      qc.invalidateQueries({ queryKey: ["inbox"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveBrand = useMutation({
    mutationFn: async (v: { id: string; brandId: string }) => {
      const { error } = await db
        .from("inbox_channels")
        .update({ brand_id: v.brandId })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Brand updated");
      qc.invalidateQueries({ queryKey: ["inbox"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Manual connect (WhatsApp, or a page token pasted by hand)
  const [manual, setManual] = useState<null | {
    platform: InboxPlatform;
    brandId: string;
    externalId: string;
    pageId: string;
    wabaId: string;
    name: string;
    token: string;
  }>(null);
  const saveManual = useMutation({
    mutationFn: () =>
      inboxApi("connect_manual", {
        platform: manual!.platform,
        brandId: manual!.brandId,
        externalId: manual!.externalId.trim(),
        pageId: manual!.pageId.trim() || null,
        wabaId: manual!.wabaId.trim() || null,
        name: manual!.name.trim() || null,
        token: manual!.token.trim(),
      }),
    onSuccess: () => {
      toast.success("Channel connected ✅");
      setManual(null);
      qc.invalidateQueries({ queryKey: ["inbox"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setup = setupQ.data;
  const [editApp, setEditApp] = useState(false);
  const active = channels.filter((c) => c.is_active);
  const inactive = channels.filter((c) => !c.is_active);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <div>
        <h2 className="font-display text-lg font-semibold">Channels</h2>
        <p className="text-sm text-muted-foreground">
          Kon page / Instagram / WhatsApp number theke message ashbe, ar seta kon brand er.
        </p>
      </div>

      {/* Connected */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Connected ({active.length})</h3>
        <div className="divide-y rounded-xl border">
          {active.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Ekhono kichu connect kora hoy nai
            </div>
          )}
          {active.map((ch) => (
            <div key={ch.id} className="flex flex-wrap items-center gap-3 p-3">
              <ContactAvatar name={ch.name} src={ch.avatar_url} platform={ch.platform} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {ch.name}
                  {ch.username ? (
                    <span className="text-muted-foreground"> · {ch.username}</span>
                  ) : null}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <PlatformChip platform={ch.platform} />
                  {ch.last_error && (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] text-destructive"
                      title={ch.last_error}
                    >
                      <AlertTriangle className="h-3 w-3" /> {ch.last_error.slice(0, 60)}
                    </span>
                  )}
                </div>
              </div>
              <Select
                value={ch.brand_id}
                onValueChange={(v) => moveBrand.mutate({ id: ch.id, brandId: v })}
              >
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => {
                  if (confirm(`Disconnect ${ch.name}?`)) disconnect.mutate(ch.id);
                }}
              >
                <Unplug className="mr-1 h-3.5 w-3.5" /> Disconnect
              </Button>
            </div>
          ))}
        </div>
        {inactive.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Disconnected: {inactive.map((c) => c.name).join(", ")} (purono chat thakbe; abar connect
            korle cholbe)
          </div>
        )}
      </section>

      {/* Step 1: Meta app */}
      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
            1
          </span>
          <h3 className="text-sm font-semibold">Meta App webhook setup (ekbar)</h3>
          {setup?.appConfigured ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : null}
        </div>
        {setupQ.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : setupQ.error ? (
          <div className="text-sm text-destructive">{(setupQ.error as Error).message}</div>
        ) : !setup?.appConfigured ? (
          <AppCredsForm onSaved={() => qc.invalidateQueries({ queryKey: ["inbox", "setup"] })} />
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              Meta App ID: <code>{setup.appId}</code>
              <button
                type="button"
                className="text-primary underline"
                onClick={() => setEditApp((v) => !v)}
              >
                {editApp ? "Cancel" : "Change"}
              </button>
            </div>
            {editApp && (
              <AppCredsForm
                onSaved={() => {
                  setEditApp(false);
                  qc.invalidateQueries({ queryKey: ["inbox", "setup"] });
                }}
              />
            )}
            <CopyRow label="Callback URL" value={setup.callbackUrl} />
            <CopyRow label="Verify token" value={setup.verifyToken} />
            <CopyRow label="Valid OAuth redirect URI" value={setup.redirectUri} />
            <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
              <li>
                developers.facebook.com → tomar app → <b>Webhooks</b> → <b>Page</b> select →
                Callback URL + Verify token boshao →{" "}
                <b>messages, message_echoes, message_reads, messaging_postbacks</b> subscribe koro.
              </li>
              <li>
                Same jaygay <b>Instagram</b> select kore same URL/token diye <b>messages</b>{" "}
                subscribe koro.
              </li>
              <li>
                WhatsApp use korle: WhatsApp → Configuration → same URL/token → <b>messages</b>{" "}
                field subscribe.
              </li>
              <li>
                <b>Facebook Login for Business</b> product add koro → Settings → Valid OAuth
                Redirect URIs e upore redirect URI ta add koro.
              </li>
              <li>
                Live customer der message pete app ke <b>Live mode</b> e nite hobe ar{" "}
                <code>pages_messaging</code>, <code>instagram_manage_messages</code> er Advanced
                Access (App Review) lagbe. Review er age shudhu app er admin/tester der message
                ashbe.
              </li>
            </ol>
            {setup.lastWebhookError && (
              <div className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
                Last webhook error ({new Date(setup.lastWebhookError.at).toLocaleString()}):{" "}
                {setup.lastWebhookError.error}
              </div>
            )}
          </>
        )}
      </section>

      {/* Step 2: Facebook pages + Instagram */}
      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
            2
          </span>
          <h3 className="text-sm font-semibold">Facebook Page + Instagram connect</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => login.mutate()}
            disabled={login.isPending || !setup?.appConfigured}
            className="gap-2 bg-[#1877F2] text-white hover:bg-[#1877F2]/90"
          >
            {login.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Facebook className="h-4 w-4" />
            )}
            {setup?.fbSession ? "Abar Facebook login" : "Continue with Facebook"}
          </Button>
          {setup?.fbSession?.name && (
            <span className="text-xs text-muted-foreground">
              Logged in as {setup.fbSession.name}
            </span>
          )}
        </div>

        {pagesQ.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {pagesQ.error && (
          <div className="text-sm text-destructive">{(pagesQ.error as Error).message}</div>
        )}
        {pagesQ.data?.connected && (
          <>
            <div className="divide-y rounded-lg border">
              {pagesQ.data.pages.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground">
                  Ei account e kono page paoa jay nai
                </div>
              )}
              {pagesQ.data.pages.map((p) => {
                const pick = picks[p.id] ?? { brandId: "", messenger: false, instagram: false };
                const set = (patch: Partial<PagePick>) =>
                  setPicks((s) => ({ ...s, [p.id]: { ...pick, ...patch } }));
                return (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 p-3">
                    <ContactAvatar name={p.name} src={p.picture} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {p.instagram
                          ? `IG: @${p.instagram.username ?? p.instagram.id}`
                          : "Kono Instagram link kora nai"}
                      </div>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs">
                      <Checkbox
                        checked={pick.messenger}
                        onCheckedChange={(v) => set({ messenger: v === true })}
                      />{" "}
                      Messenger
                    </label>
                    <label className="flex items-center gap-1.5 text-xs">
                      <Checkbox
                        checked={pick.instagram}
                        disabled={!p.instagram}
                        onCheckedChange={(v) => set({ instagram: v === true })}
                      />{" "}
                      Instagram
                    </label>
                    <Select value={pick.brandId} onValueChange={(v) => set({ brandId: v })}>
                      <SelectTrigger className="h-8 w-36 text-xs">
                        <SelectValue placeholder="Brand…" />
                      </SelectTrigger>
                      <SelectContent>
                        {brands.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
            <Button onClick={() => connect.mutate()} disabled={connect.isPending} className="gap-2">
              {connect.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plug className="h-4 w-4" />
              )}{" "}
              Connect selected
            </Button>
          </>
        )}
      </section>

      {/* Step 3: WhatsApp */}
      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
            3
          </span>
          <h3 className="text-sm font-semibold">WhatsApp Business (Cloud API)</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Business Settings → WhatsApp accounts theke <b>WhatsApp Business Account ID</b> ar
          System users theke <b>permanent token</b> (whatsapp_business_messaging +
          whatsapp_business_management) niye ekhane dao. Coexistence number (WhatsApp Business app
          + RepliBee) o kaj kore — phone e app cholte thakbe.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              setManual({
                platform: "whatsapp",
                brandId: brands[0]?.id ?? "",
                externalId: "",
                pageId: "",
                wabaId: "",
                name: "",
                token: "",
              })
            }
          >
            + Add WhatsApp number
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setManual({
                platform: "messenger",
                brandId: brands[0]?.id ?? "",
                externalId: "",
                pageId: "",
                wabaId: "",
                name: "",
                token: "",
              })
            }
          >
            Page token manually add
          </Button>
        </div>
      </section>

      <Dialog open={!!manual} onOpenChange={(o) => !o && setManual(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect channel manually</DialogTitle>
          </DialogHeader>
          {manual && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Platform</Label>
                  <Select
                    value={manual.platform}
                    onValueChange={(v) => setManual({ ...manual, platform: v as InboxPlatform })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="messenger">Messenger</SelectItem>
                      <SelectItem value="instagram">Instagram</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Brand</Label>
                  <Select
                    value={manual.brandId}
                    onValueChange={(v) => setManual({ ...manual, brandId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Brand…" />
                    </SelectTrigger>
                    <SelectContent>
                      {brands.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>
                  {manual.platform === "whatsapp"
                    ? "Phone number ID (optional — WABA ID dile auto)"
                    : manual.platform === "messenger"
                      ? "Facebook Page ID"
                      : "Instagram account ID"}
                </Label>
                <Input
                  value={manual.externalId}
                  onChange={(e) => setManual({ ...manual, externalId: e.target.value })}
                  placeholder="1234567890"
                />
              </div>
              {manual.platform === "whatsapp" && (
                <div className="space-y-1.5">
                  <Label>WhatsApp Business Account ID</Label>
                  <Input
                    value={manual.wabaId}
                    onChange={(e) => setManual({ ...manual, wabaId: e.target.value })}
                    placeholder="API Setup page e Phone number ID er niche thake"
                  />
                </div>
              )}
              {manual.platform === "instagram" && (
                <div className="space-y-1.5">
                  <Label>Linked Facebook Page ID</Label>
                  <Input
                    value={manual.pageId}
                    onChange={(e) => setManual({ ...manual, pageId: e.target.value })}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Display name (optional)</Label>
                <Input
                  value={manual.name}
                  onChange={(e) => setManual({ ...manual, name: e.target.value })}
                  placeholder="Toyora WhatsApp"
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Access token
                  {manual.platform === "whatsapp" && " (optional — khali rakhle Facebook login use hobe)"}
                </Label>
                <Input
                  value={manual.token}
                  onChange={(e) => setManual({ ...manual, token: e.target.value })}
                  type="password"
                  placeholder="EAAG…"
                />
              </div>
              <div className="flex items-center gap-2">
                <BrandBadge brandId={manual.brandId} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setManual(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveManual.mutate()}
              disabled={
                !manual?.brandId ||
                !(manual?.externalId || (manual?.platform === "whatsapp" && manual?.wabaId)) ||
                !(manual?.token || manual?.platform === "whatsapp") ||
                saveManual.isPending
              }
            >
              {saveManual.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AppCredsForm({ onSaved }: { onSaved: () => void }) {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const save = useMutation({
    mutationFn: () => inboxApi("save_app", { appId: appId.trim(), appSecret: appSecret.trim() }),
    onSuccess: () => {
      toast.success("Meta App saved ✅");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        developers.facebook.com → My Apps → tomar app (Business type) → <b>App settings → Basic</b>{" "}
        theke App ID ar App Secret copy kore dao. Secret ta shudhu server e thakbe, browser e
        kokhono ashbe na.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>App ID</Label>
          <Input
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder="1234567890123456"
            inputMode="numeric"
          />
        </div>
        <div className="space-y-1.5">
          <Label>App Secret</Label>
          <Input
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            type="password"
            placeholder="32 character"
          />
        </div>
      </div>
      <Button
        size="sm"
        onClick={() => save.mutate()}
        disabled={!appId.trim() || !appSecret.trim() || save.isPending}
      >
        {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save & verify
      </Button>
    </div>
  );
}
