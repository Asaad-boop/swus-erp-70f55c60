import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Save, MessageSquare, Send, Wallet, RefreshCcw, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentRole } from "@/hooks/use-current-role";
import { MaskedSecretInput } from "@/components/erp/settings/masked-secret-input";
import { saveAppSetting } from "@/lib/erp/settings/app-settings.functions";
import { getSmsConfig, checkSmsBalance, sendCustomSms, listSmsLogs } from "@/lib/erp/sms/sms.functions";
import {
  SMS_DEFAULTS, SMS_PLACEHOLDERS, SMS_TEMPLATE_LABELS, smsConfigKey, smsSegments, type SmsConfig,
} from "@/lib/erp/sms/templates";

export function SmsSection({ brandId }: { brandId: string }) {
  const { isAdmin } = useCurrentRole();
  const qc = useQueryClient();

  const getCfg = useServerFn(getSmsConfig);
  const saveFn = useServerFn(saveAppSetting);
  const balanceFn = useServerFn(checkSmsBalance);
  const sendFn = useServerFn(sendCustomSms);
  const logsFn = useServerFn(listSmsLogs);

  const cfgQ = useQuery({
    queryKey: ["sms-config", brandId],
    queryFn: () => getCfg({ data: { brandId } }),
    enabled: !!brandId,
  });
  const logsQ = useQuery({
    queryKey: ["sms-logs", brandId],
    queryFn: () => logsFn({ data: { brandId, limit: 30 } }),
    enabled: !!brandId,
  });

  const [form, setForm] = useState<SmsConfig>(SMS_DEFAULTS);
  useEffect(() => {
    if (cfgQ.data) {
      const { is_admin: _ignored, ...rest } = cfgQ.data as SmsConfig & { is_admin: boolean };
      setForm({ ...SMS_DEFAULTS, ...rest, templates: { ...SMS_DEFAULTS.templates, ...rest.templates } });
    }
  }, [cfgQ.data]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { key: smsConfigKey(brandId), value: form } }),
    onSuccess: () => {
      toast.success("SMS settings save hoyeche");
      qc.invalidateQueries({ queryKey: ["sms-config", brandId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const balance = useMutation({
    mutationFn: () => balanceFn({ data: { brandId } }),
    onSuccess: (r) => toast.success(r.balance !== null ? `Balance: ৳${r.balance}` : `Response: ${r.raw}`),
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- Custom SMS composer ----
  const [numbers, setNumbers] = useState("");
  const [message, setMessage] = useState("");
  const numberList = useMemo(
    () => numbers.split(/[\s,;\n]+/).map((s) => s.trim()).filter(Boolean),
    [numbers],
  );
  const segs = smsSegments(message);

  const sendCustom = useMutation({
    mutationFn: () => sendFn({ data: { brandId, numbers: numberList, message } }),
    onSuccess: (r) => {
      if (r.ok) toast.success(`${r.sent} ta number e SMS gelo`);
      else toast.error(r.message || "SMS pathano jayni");
      if (r.invalid?.length) toast.warning(`Invalid: ${r.invalid.join(", ")}`);
      setMessage("");
      qc.invalidateQueries({ queryKey: ["sms-logs", brandId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (cfgQ.isLoading) {
    return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  const set = <K extends keyof SmsConfig>(k: K, v: SmsConfig[K]) => setForm({ ...form, [k]: v });

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold">SMS (BulkSMSBD)</h2>
        <p className="text-xs text-muted-foreground">
          bulksmsbd.net diye order confirm, pre-order o custom SMS pathan.
        </p>
      </div>

      {/* CREDENTIALS */}
      <Card title="API credentials" icon={<MessageSquare className="h-4 w-4" />}>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">SMS enabled</Label>
              <p className="text-xs text-muted-foreground">Off thakle kono automatic SMS jabe na.</p>
            </div>
            <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} disabled={!isAdmin} />
          </div>
          <Field label="API key">
            <MaskedSecretInput
              value={form.api_key}
              onChange={(v) => set("api_key", v)}
              isAdmin={isAdmin}
              placeholder="bulksmsbd API key"
            />
          </Field>
          <Field label="Sender ID (approved mask / number)">
            <Input
              value={form.sender_id}
              onChange={(e) => set("sender_id", e.target.value)}
              placeholder="8809617XXXXXX"
              className="font-mono text-xs"
              disabled={!isAdmin}
            />
          </Field>
          <div className="flex justify-between gap-2">
            <Button variant="outline" size="sm" onClick={() => balance.mutate()} disabled={balance.isPending}>
              {balance.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />} Check balance
            </Button>
            {isAdmin && (
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* TEMPLATES + AUTO TOGGLES */}
      <Card title="Templates & auto-send" icon={<Send className="h-4 w-4" />}>
        <p className="text-[11px] text-muted-foreground mb-3">
          Placeholder: {SMS_PLACEHOLDERS.join(" ")}
        </p>
        <div className="space-y-4">
          {(Object.keys(SMS_TEMPLATE_LABELS) as Array<keyof typeof SMS_TEMPLATE_LABELS>).map((key) => {
            const autoKey = (
              {
                order_confirm: "auto_order_confirm",
                preorder_placed: "auto_preorder_placed",
                preorder_ready: "auto_preorder_ready",
                preorder_confirmed: "auto_preorder_confirmed",
              } as const
            )[key];
            const body = form.templates[key] ?? "";
            return (
              <div key={key} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">{SMS_TEMPLATE_LABELS[key]}</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">Auto</span>
                    <Switch
                      checked={form[autoKey]}
                      onCheckedChange={(v) => setForm({ ...form, [autoKey]: v })}
                      disabled={!isAdmin}
                    />
                  </div>
                </div>
                <Textarea
                  value={body}
                  onChange={(e) => setForm({ ...form, templates: { ...form.templates, [key]: e.target.value } })}
                  rows={3}
                  disabled={!isAdmin}
                  className="text-xs"
                />
                <div className="text-[11px] text-muted-foreground">
                  {body.length} chars · {smsSegments(body)} SMS
                </div>
              </div>
            );
          })}
          {isAdmin && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="h-4 w-4" /> Save templates
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* CUSTOM SMS */}
      <Card title="Custom SMS pathan" icon={<Send className="h-4 w-4" />}>
        <div className="space-y-3">
          <Field label="Number (comma / newline separated)">
            <Textarea
              value={numbers}
              onChange={(e) => setNumbers(e.target.value)}
              rows={2}
              placeholder="01712345678, 01898765432"
              className="font-mono text-xs"
            />
          </Field>
          <Field label="Message">
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Apnar message…" />
          </Field>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {numberList.length} number · {message.length} chars · {segs} SMS/number
            </span>
            <Button
              size="sm"
              onClick={() => sendCustom.mutate()}
              disabled={sendCustom.isPending || numberList.length === 0 || !message.trim()}
            >
              {sendCustom.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
            </Button>
          </div>
        </div>
      </Card>

      {/* LOGS */}
      <Card title="Recent SMS" icon={<History className="h-4 w-4" />}>
        <div className="flex justify-end mb-2">
          <Button variant="ghost" size="sm" onClick={() => logsQ.refetch()}>
            <RefreshCcw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
        {logsQ.data && logsQ.data.length > 0 ? (
          <div className="divide-y rounded-md border">
            {logsQ.data.map((l) => (
              <div key={l.id} className="p-2.5 text-xs flex items-start gap-2">
                <Badge variant={l.status === "sent" ? "secondary" : "destructive"} className="shrink-0">
                  {l.status}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="font-mono">{l.phone} · {l.template_key}</div>
                  <div className="text-muted-foreground truncate">{l.message}</div>
                  {l.status !== "sent" && l.provider_response && (
                    <div className="text-destructive">{l.provider_response}</div>
                  )}
                </div>
                <div className="shrink-0 text-muted-foreground">
                  {new Date(l.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Ekhono kono SMS pathano hoyni.</p>
        )}
      </Card>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <h3 className="font-semibold flex items-center gap-2 mb-3">{icon}{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-sm font-medium">{label}</Label>{children}</div>;
}