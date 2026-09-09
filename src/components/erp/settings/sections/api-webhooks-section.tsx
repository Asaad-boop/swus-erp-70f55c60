import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Copy,
  KeyRound,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Webhook as WebhookIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBrand } from "@/contexts/brand-context";
import { cn } from "@/lib/utils";
import {
  createApiClient,
  createWebhookEndpoint,
  deleteApiClient,
  deleteWebhookEndpoint,
  listApiClients,
  listWebhookDeliveries,
  listWebhookEndpoints,
  retryWebhookDelivery,
  sendTestWebhook,
  setApiClientActive,
  updateWebhookEndpoint,
} from "@/lib/erp/integrations/integrations.functions";

const EVENT_GROUPS: Array<{
  title: string;
  description: string;
  events: Array<{ id: string; label: string }>;
}> = [
  {
    title: "Orders",
    description: "Order lifecycle, status, and fulfillment events.",
    events: [
      { id: "order.created", label: "Order created" },
      { id: "order.updated", label: "Order updated (any watched field)" },
      { id: "order.status_changed", label: "Order status changed" },
      { id: "order.payment_status_changed", label: "Order payment status changed" },
      { id: "order.delivery_status_changed", label: "Order delivery status changed" },
      { id: "order.cancelled", label: "Order cancelled" },
      { id: "order.refunded", label: "Order refunded" },
    ],
  },
  {
    title: "Products & Inventory",
    description: "Catalog changes, price changes, stock movements.",
    events: [
      { id: "product.created", label: "Product created" },
      { id: "product.updated", label: "Product updated (any watched field)" },
      { id: "product.price_changed", label: "Product price changed" },
      { id: "inventory.stock_changed", label: "Stock changed" },
    ],
  },
  {
    title: "Purchase",
    description: "Goods received into inventory.",
    events: [{ id: "purchase.received", label: "Purchase received" }],
  },
];

const ALL_EVENTS = EVENT_GROUPS.flatMap((g) => g.events.map((e) => e.id));

function copy(text: string, label = "Copied") {
  navigator.clipboard.writeText(text).then(
    () => toast.success(label),
    () => toast.error("Copy failed"),
  );
}

const BASE_URL =
  typeof window !== "undefined" ? window.location.origin : "https://swus-erp.lovable.app";

export function ApiWebhooksSection() {
  const qc = useQueryClient();
  const { brands } = useBrand();

  const fetchClients = useServerFn(listApiClients);
  const fetchEndpoints = useServerFn(listWebhookEndpoints);
  const fetchDeliveries = useServerFn(listWebhookDeliveries);

  const clients = useQuery({ queryKey: ["api-clients"], queryFn: () => fetchClients({}) });
  const endpoints = useQuery({ queryKey: ["webhook-endpoints"], queryFn: () => fetchEndpoints({}) });
  const deliveries = useQuery({
    queryKey: ["webhook-deliveries"],
    queryFn: () => fetchDeliveries({ data: { limit: 30 } }),
    refetchInterval: 30_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["api-clients"] });
    qc.invalidateQueries({ queryKey: ["webhook-endpoints"] });
    qc.invalidateQueries({ queryKey: ["webhook-deliveries"] });
  };

  const [endpointOpen, setEndpointOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [revealed, setRevealed] = useState<{ title: string; value: string; note: string } | null>(null);

  const addKey = useMutation({
    mutationFn: (v: { name: string; brandId: string | null }) => createApiClient({ data: v }),
    onSuccess: (res: any) => {
      invalidate();
      setKeyOpen(false);
      setRevealed({
        title: "API key created",
        value: res.api_key,
        note: "এই key শুধু এখনই দেখা যাবে। কপি করে তোমার সাইটে সেভ করে রাখো।",
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addEndpoint = useMutation({
    mutationFn: (v: { name: string; url: string; events: string[]; brandId: string | null; enabled: boolean }) =>
      createWebhookEndpoint({ data: v }),
    onSuccess: (res: any) => {
      invalidate();
      setEndpointOpen(false);
      setRevealed({
        title: "Endpoint created",
        value: res.signing_secret,
        note: "Signing secret শুধু একবারই দেখানো হয়। তোমার সাইটে এটা দিয়ে signature যাচাই করবে।",
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleEndpoint = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => updateWebhookEndpoint({ data: v }),
    onSuccess: invalidate,
  });
  const removeEndpoint = useMutation({
    mutationFn: (id: string) => deleteWebhookEndpoint({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("Endpoint removed"); },
  });
  const testEndpoint = useMutation({
    mutationFn: (id: string) => sendTestWebhook({ data: { endpointId: id } }),
    onSuccess: (r: any) => {
      invalidate();
      toast[r?.sent ? "success" : "error"](r?.sent ? "Test event delivered" : "Test event failed — check the log");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const retry = useMutation({
    mutationFn: (id: string) => retryWebhookDelivery({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("Retried"); },
  });
  const toggleKey = useMutation({
    mutationFn: (v: { id: string; isActive: boolean }) => setApiClientActive({ data: v }),
    onSuccess: invalidate,
  });
  const removeKey = useMutation({
    mutationFn: (id: string) => deleteApiClient({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("API key revoked"); },
  });

  const brandName = (id: string | null) => brands.find((b) => b.id === id)?.name ?? "All brands";
  const endpointName = (id: string) =>
    (endpoints.data as any[] | undefined)?.find((e) => e.id === id)?.name ?? "—";

  return (
    <div className="space-y-4">
      {/* ---------- Incoming: how the other site sends orders ---------- */}
      <div className="rounded-xl border bg-card p-4 md:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" /> API keys (incoming orders)
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              তোমার অন্য সাইট এই key দিয়ে ERP-তে অর্ডার পাঠাবে ও stock পড়বে।
            </p>
          </div>
          <Button size="sm" onClick={() => setKeyOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New key
          </Button>
        </div>

        <div className="mt-3 grid gap-2 text-xs font-mono rounded-lg bg-muted/50 border p-3">
          <div><span className="text-muted-foreground">POST</span> {BASE_URL}/api/public/orders/create</div>
          <div><span className="text-muted-foreground">GET&nbsp;&nbsp;</span> {BASE_URL}/api/public/inventory</div>
          <div className="text-muted-foreground">header: x-api-key: &lt;your key&gt;</div>
        </div>

        <div className="mt-3 divide-y rounded-lg border">
          {(clients.data as any[] | undefined)?.length ? (
            (clients.data as any[]).map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{c.name}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {c.key_prefix}••••••  ·  {brandName(c.brand_id)}
                    {c.last_used_at ? ` · last used ${new Date(c.last_used_at).toLocaleString()}` : " · never used"}
                  </div>
                </div>
                <Switch
                  checked={c.is_active}
                  onCheckedChange={(v) => toggleKey.mutate({ id: c.id, isActive: v })}
                />
                <Button variant="ghost" size="icon" onClick={() => removeKey.mutate(c.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))
          ) : (
            <div className="px-3 py-6 text-sm text-muted-foreground text-center">
              এখনো কোনো key নেই — “New key” দিয়ে শুরু করো।
            </div>
          )}
        </div>
      </div>

      {/* ---------- Outgoing: webhook endpoints ---------- */}
      <div className="rounded-xl border bg-card p-4 md:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <WebhookIcon className="h-4 w-4 text-primary" /> Webhook endpoints (outgoing)
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              ERP-তে অর্ডার/প্রোডাক্ট/স্টক বদলালে তোমার সাইটে সাথে সাথে POST যাবে।
            </p>
          </div>
          <Button size="sm" onClick={() => setEndpointOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add endpoint
          </Button>
        </div>

        <div className="mt-3 divide-y rounded-lg border">
          {(endpoints.data as any[] | undefined)?.length ? (
            (endpoints.data as any[]).map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-3 py-2.5 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{e.name}</div>
                  <div className="text-[11px] text-muted-foreground font-mono truncate">{e.url}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {e.events.length} events
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">{brandName(e.brand_id)}</Badge>
                    {e.last_status && (
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded",
                          e.last_status === "success"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-destructive/10 text-destructive",
                        )}
                      >
                        {e.last_status}
                      </span>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => testEndpoint.mutate(e.id)}>
                  <Send className="h-3.5 w-3.5 mr-1" /> Test
                </Button>
                <Switch
                  checked={e.is_enabled}
                  onCheckedChange={(v) => toggleEndpoint.mutate({ id: e.id, enabled: v })}
                />
                <Button variant="ghost" size="icon" onClick={() => removeEndpoint.mutate(e.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))
          ) : (
            <div className="px-3 py-6 text-sm text-muted-foreground text-center">
              কোনো endpoint যোগ করা হয়নি।
            </div>
          )}
        </div>
      </div>

      {/* ---------- Delivery log ---------- */}
      {(deliveries.data as any[] | undefined)?.length ? (
        <div className="rounded-xl border bg-card p-4 md:p-5">
          <h3 className="text-base font-semibold">Recent deliveries</h3>
          <div className="mt-3 divide-y rounded-lg border text-sm">
            {(deliveries.data as any[]).map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-3 py-2 flex-wrap">
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded font-medium",
                    d.status === "success"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      : d.status === "pending"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                        : "bg-destructive/10 text-destructive",
                  )}
                >
                  {d.status}
                </span>
                <span className="font-mono text-xs">{d.event}</span>
                <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
                  {endpointName(d.endpoint_id)} · {new Date(d.created_at).toLocaleString()}
                  {d.last_status_code ? ` · HTTP ${d.last_status_code}` : ""}
                  {d.attempts ? ` · ${d.attempts} try` : ""}
                </span>
                {d.status !== "success" && (
                  <Button variant="ghost" size="sm" onClick={() => retry.mutate(d.id)}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <NewKeyDialog
        open={keyOpen}
        onOpenChange={setKeyOpen}
        brands={brands}
        pending={addKey.isPending}
        onSubmit={(v) => addKey.mutate(v)}
      />
      <AddEndpointDialog
        open={endpointOpen}
        onOpenChange={setEndpointOpen}
        brands={brands}
        pending={addEndpoint.isPending}
        onSubmit={(v) => addEndpoint.mutate(v)}
      />

      <Dialog open={!!revealed} onOpenChange={(o) => !o && setRevealed(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{revealed?.title}</DialogTitle>
            <DialogDescription>{revealed?.note}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono break-all">
              {revealed?.value}
            </code>
            <Button size="icon" variant="outline" onClick={() => copy(revealed?.value ?? "")}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setRevealed(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------- dialogs -------------------------------- */

function NewKeyDialog({
  open,
  onOpenChange,
  brands,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  brands: Array<{ id: string; name: string }>;
  pending: boolean;
  onSubmit: (v: { name: string; brandId: string | null }) => void;
}) {
  const [name, setName] = useState("");
  const [brandId, setBrandId] = useState<string>(brands[0]?.id ?? "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New API key</DialogTitle>
          <DialogDescription>
            যে সাইট অর্ডার পাঠাবে তার জন্য key তৈরি করো। অর্ডারগুলো নিচের brand-এ ঢুকবে।
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My storefront" />
          </div>
          <div className="space-y-1.5">
            <Label>Brand</Label>
            <div className="flex flex-wrap gap-1">
              {brands.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBrandId(b.id)}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-semibold border transition-colors",
                    brandId === b.id ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                  )}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={pending || !name.trim() || !brandId} onClick={() => onSubmit({ name, brandId })}>
            Create key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddEndpointDialog({
  open,
  onOpenChange,
  brands,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  brands: Array<{ id: string; name: string }>;
  pending: boolean;
  onSubmit: (v: {
    name: string;
    url: string;
    events: string[];
    brandId: string | null;
    enabled: boolean;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [brandId, setBrandId] = useState<string>("");
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const selectGroup = (ids: string[]) =>
    setSelected((prev) => {
      const all = ids.every((i) => prev.includes(i));
      return all ? prev.filter((p) => !ids.includes(p)) : Array.from(new Set([...prev, ...ids]));
    });

  const count = useMemo(() => selected.length, [selected]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add endpoint</DialogTitle>
          <DialogDescription>
            Webhook events will POST to this URL. The signing secret is shown once after creation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ERP sync, Google Sheets…" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhooks/erp"
              className="font-mono text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(!!v)} />
            Enabled — endpoint receives events
          </label>

          {brands.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Brand</Label>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setBrandId("")}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-semibold border transition-colors",
                    brandId === "" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                  )}
                >
                  All brands
                </button>
                {brands.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBrandId(b.id)}
                    className={cn(
                      "px-3 py-1 rounded-md text-xs font-semibold border transition-colors",
                      brandId === b.id ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                    )}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Subscribed events
              </Label>
              <span className="text-[11px] text-muted-foreground">{count} selected</span>
            </div>
            <div className="mt-2 max-h-[260px] overflow-y-auto space-y-3 pr-1">
              {EVENT_GROUPS.map((g) => {
                const ids = g.events.map((e) => e.id);
                return (
                  <div key={g.title} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">{g.title}</div>
                        <div className="text-[11px] text-muted-foreground">{g.description}</div>
                      </div>
                      <button
                        type="button"
                        className="text-[11px] text-primary hover:underline shrink-0"
                        onClick={() => selectGroup(ids)}
                      >
                        Select all
                      </button>
                    </div>
                    <div className="mt-2 grid sm:grid-cols-2 gap-2">
                      {g.events.map((e) => (
                        <label key={e.id} className="flex items-start gap-2 cursor-pointer">
                          <Checkbox
                            checked={selected.includes(e.id)}
                            onCheckedChange={() => toggle(e.id)}
                            className="mt-0.5"
                          />
                          <span className="min-w-0">
                            <span className="block text-[13px] leading-tight">{e.label}</span>
                            <span className="block text-[10px] font-mono text-muted-foreground">{e.id}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="mt-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setSelected(selected.length === ALL_EVENTS.length ? [] : ALL_EVENTS)}
            >
              {selected.length === ALL_EVENTS.length ? "Clear all" : "Select every event"}
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={pending || !name.trim() || !url.trim() || selected.length === 0}
            onClick={() => onSubmit({ name, url, events: selected, brandId: brandId || null, enabled })}
          >
            Create endpoint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
