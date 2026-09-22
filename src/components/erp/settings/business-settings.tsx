import { useEffect, useRef, useState } from "react";
import { Loader2, Save, FileText, Upload, Trash2, ImageIcon, Plus, X, Tag } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

type BrandSettings = {
  business_mobile?: string;
  business_address?: string;
  default_delivery_cost?: number;
  hotline?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  facebook?: string;
  instagram?: string;
  bin?: string;
  trade_license?: string;
  footer_thank_you?: string;
  order_sources?: string[];
};

type FormState = {
  business_name: string;
  business_mobile: string;
  invoice_prefix: string;
  business_address: string;
  default_delivery_cost: string;
  logo_url: string;
  hotline: string;
  whatsapp: string;
  email: string;
  website: string;
  facebook: string;
  instagram: string;
  bin: string;
  trade_license: string;
  footer_thank_you: string;
  order_sources: string[];
};

const EMPTY: FormState = {
  business_name: "",
  business_mobile: "",
  invoice_prefix: "",
  business_address: "",
  default_delivery_cost: "0",
  logo_url: "",
  hotline: "",
  whatsapp: "",
  email: "",
  website: "",
  facebook: "",
  instagram: "",
  bin: "",
  trade_license: "",
  footer_thank_you: "",
  order_sources: [],
};

const DEFAULT_ORDER_SOURCES = [
  "Facebook", "Instagram", "WhatsApp", "Messenger", "TikTok",
  "Phone Call", "Website", "Walk-in", "Referral", "Others",
];

const SLUG_RE = /^[A-Za-z0-9_]+-?$/;

export function BusinessSettings({ brandIdOverride }: { brandIdOverride?: string | null } = {}) {
  const { activeBrand } = useBrand();
  const brandId = brandIdOverride ?? activeBrand?.id;
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["brand-settings", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const [brandRes, settingsRes] = await Promise.all([
        supabase.from("brands").select("id,name,logo_url,settings").eq("id", brandId!).single(),
        supabase.from("erp_settings").select("invoice_prefix,invoice_seq,invoice_pad").eq("brand_id", brandId!).maybeSingle(),
      ]);
      if (brandRes.error) throw brandRes.error;
      const bsettings = (brandRes.data?.settings ?? {}) as BrandSettings;
      return {
        brand: brandRes.data,
        bsettings,
        erp: settingsRes.data,
      };
    },
  });

  const [form, setForm] = useState<FormState>(EMPTY);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!data) return;
    setForm({
      business_name: data.brand?.name ?? "",
      business_mobile: data.bsettings.business_mobile ?? "",
      invoice_prefix: data.erp?.invoice_prefix ?? "INV-",
      business_address: data.bsettings.business_address ?? "",
      default_delivery_cost: String(data.bsettings.default_delivery_cost ?? 0),
      logo_url: data.brand?.logo_url ?? "",
      hotline: data.bsettings.hotline ?? "",
      whatsapp: data.bsettings.whatsapp ?? "",
      email: data.bsettings.email ?? "",
      website: data.bsettings.website ?? "",
      facebook: data.bsettings.facebook ?? "",
      instagram: data.bsettings.instagram ?? "",
      bin: data.bsettings.bin ?? "",
      trade_license: data.bsettings.trade_license ?? "",
      footer_thank_you: data.bsettings.footer_thank_you ?? "",
      order_sources:
        Array.isArray(data.bsettings.order_sources) && data.bsettings.order_sources.length > 0
          ? data.bsettings.order_sources
          : DEFAULT_ORDER_SOURCES,
    });
  }, [data]);

  const slugInvalid = !!form.invoice_prefix && !SLUG_RE.test(form.invoice_prefix);
  const nextPreview = form.invoice_prefix
    ? form.invoice_prefix + String((data?.erp?.invoice_seq ?? 0) + 1).padStart(data?.erp?.invoice_pad ?? 7, "0")
    : "—";

  const save = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("No active brand");
      if (slugInvalid) throw new Error("Invalid invoice slug");

      const settingsJson: BrandSettings = {
        ...(data?.bsettings ?? {}),
        business_mobile: form.business_mobile || undefined,
        business_address: form.business_address || undefined,
        default_delivery_cost: Number(form.default_delivery_cost) || 0,
        hotline: form.hotline || undefined,
        whatsapp: form.whatsapp || undefined,
        email: form.email || undefined,
        website: form.website || undefined,
        facebook: form.facebook || undefined,
        instagram: form.instagram || undefined,
        bin: form.bin || undefined,
        trade_license: form.trade_license || undefined,
        footer_thank_you: form.footer_thank_you || undefined,
        order_sources: form.order_sources.filter((s) => s.trim().length > 0),
      };

      const { error: brandErr } = await supabase
        .from("brands")
        .update({
          name: form.business_name,
          logo_url: form.logo_url || null,
          settings: settingsJson,
        })
        .eq("id", brandId);
      if (brandErr) throw brandErr;

      const prevPrefix = data?.erp?.invoice_prefix ?? "INV-";
      const newPrefix = form.invoice_prefix || "INV-";

      const { error: erpErr } = await supabase
        .from("erp_settings")
        .upsert({
          brand_id: brandId,
          invoice_prefix: newPrefix,
        }, { onConflict: "brand_id" });
      if (erpErr) throw erpErr;

      let updated = 0;
      if (newPrefix !== prevPrefix) {
        const { data: cnt, error: rpcErr } = await supabase.rpc("reapply_invoice_prefix", { _brand_id: brandId });
        if (rpcErr) throw rpcErr;
        updated = Number(cnt ?? 0);
      }
      return { updated, changed: newPrefix !== prevPrefix };
    },
    onSuccess: (res) => {
      if (res?.changed) {
        toast.success(`Settings saved. ${res.updated} invoice${res.updated === 1 ? "" : "s"} re-prefixed.`);
      } else {
        toast.success("Business settings updated");
      }
      qc.invalidateQueries({ queryKey: ["brand-settings", brandId] });
      qc.invalidateQueries({ queryKey: ["brands"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---------------- Logo upload ----------------
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleLogoFile(file: File) {
    if (!brandId) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Logo must be under 4 MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `brands/${brandId}/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type,
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
      set("logo_url", pub.publicUrl);
      toast.success("Logo uploaded — click Update to save");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  if (!brandId) {
    return <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Select a brand to edit its settings.</div>;
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-6 space-y-4 max-w-3xl">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
      className="rounded-xl border bg-card shadow-sm max-w-4xl overflow-hidden"
    >
      <header className="px-5 py-3 border-b bg-muted/30">
        <h2 className="font-bold text-base">Business Setting — {data?.brand?.name}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">These values auto-fill invoices, stickers and order documents.</p>
      </header>

      <div className="p-5 space-y-6">
        {/* ============ LOGO ============ */}
        <Section title="Brand Logo" desc="Used on invoices, stickers and the storefront header.">
          <div className="flex gap-4 items-start">
            <div className="h-24 w-24 rounded-md border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
              {form.logo_url
                ? <img src={form.logo_url} alt="Logo" className="max-h-full max-w-full object-contain" />
                : <ImageIcon className="h-8 w-8 text-muted-foreground/50" />}
            </div>
            <div className="flex-1 space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); e.currentTarget.value = ""; }}
              />
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? "Uploading…" : "Upload Logo"}
                </Button>
                {form.logo_url && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => set("logo_url", "")}>
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                )}
              </div>
              <Input value={form.logo_url} onChange={(e) => set("logo_url", e.target.value)} placeholder="…or paste a URL" className="text-xs" />
              <p className="text-[11px] text-muted-foreground">PNG, JPG, WebP or SVG. Max 4 MB. Transparent PNG recommended.</p>
            </div>
          </div>
        </Section>

        {/* ============ IDENTITY ============ */}
        <Section title="Identity">
          <Field
          label="Business Name"
            hint="Shown as the brand name on every printed document."
          >
            <Input value={form.business_name} onChange={(e) => set("business_name", e.target.value)} required />
          </Field>
          <Field
          label="Invoice Slug"
          hint="This slug is added before the invoice number. Use English letters, digits or underscores, with an optional trailing hyphen."
          error={slugInvalid ? "Only A–Z, a–z, 0–9, _ allowed, optional trailing -" : null}
        >
          <Input
            value={form.invoice_prefix}
            onChange={(e) => set("invoice_prefix", e.target.value)}
            placeholder="HBS-"
            className={slugInvalid ? "border-destructive focus-visible:ring-destructive" : ""}
          />
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            Next invoice will be{" "}
            <span className="font-mono font-semibold text-foreground">{nextPreview}</span>
          </div>
        </Field>
        </Section>

        {/* ============ CONTACT ============ */}
        <Section title="Contact" desc="Customer-facing contact channels.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Business Mobile" hint="Primary phone — appears as the default sender on invoices.">
              <Input value={form.business_mobile} onChange={(e) => set("business_mobile", e.target.value)} inputMode="tel" placeholder="01711-223344" />
            </Field>
            <Field label="Hotline" hint="Customer support number.">
              <Input value={form.hotline} onChange={(e) => set("hotline", e.target.value)} inputMode="tel" placeholder="16263" />
            </Field>
            <Field label="WhatsApp">
              <Input value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} inputMode="tel" placeholder="+8801XXXXXXXXX" />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="hello@brand.com" />
            </Field>
            <Field label="Website">
              <Input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://brand.com" />
            </Field>
            <Field label="Address" className="md:col-span-2">
              <Textarea value={form.business_address} onChange={(e) => set("business_address", e.target.value)} rows={2} placeholder="Shop 12, Road 5, Block C, Bashundhara R/A, Dhaka" />
            </Field>
          </div>
        </Section>

        {/* ============ SOCIAL ============ */}
        <Section title="Social" desc="Shown in the invoice footer & order notifications.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Facebook">
              <Input value={form.facebook} onChange={(e) => set("facebook", e.target.value)} placeholder="fb.com/brand" />
            </Field>
            <Field label="Instagram">
              <Input value={form.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@brand" />
            </Field>
          </div>
        </Section>

        {/* ============ LEGAL ============ */}
        <Section title="Legal & Tax" desc="Government-issued numbers for compliance.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="BIN / VAT Registration">
              <Input value={form.bin} onChange={(e) => set("bin", e.target.value)} placeholder="0001234-5678" />
            </Field>
            <Field label="Trade License">
              <Input value={form.trade_license} onChange={(e) => set("trade_license", e.target.value)} placeholder="TL-2024-12345" />
            </Field>
          </div>
        </Section>

        {/* ============ DEFAULTS ============ */}
        <Section title="Defaults & Footer">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Default Delivery Cost" hint="Pre-filled in the new-order form.">
              <Input
                type="number" min="0" step="1"
                value={form.default_delivery_cost}
                onChange={(e) => set("default_delivery_cost", e.target.value)}
              />
            </Field>
            <Field label="Footer / Thank-you Message" hint="Shown at the bottom of invoices." className="md:col-span-2">
              <Textarea value={form.footer_thank_you} onChange={(e) => set("footer_thank_you", e.target.value)} rows={2} placeholder="Thank you for shopping with us!" />
            </Field>
          </div>
        </Section>

        {/* ============ ORDER SOURCES ============ */}
        <Section
          title="Order Sources"
          desc="Manage where orders come from — shown as dropdown in New Order form."
        >
          <OrderSourcesEditor
            sources={form.order_sources}
            onChange={(next) => set("order_sources", next)}
          />
        </Section>
      </div>

      <footer className="px-5 py-3 border-t bg-muted/20 flex justify-end">
        <Button type="submit" disabled={save.isPending || slugInvalid}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Update Business
        </Button>
      </footer>
    </form>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="border-b pb-1.5">
        <h3 className="text-sm font-bold">{title}</h3>
        {desc && <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string | null; children: React.ReactNode; className?: string }) {
  return (
    <div className={"space-y-1.5 " + (className ?? "")}>
      <Label className="text-sm font-bold">{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive font-medium">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function OrderSourcesEditor({
  sources, onChange,
}: { sources: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (sources.some((s) => s.toLowerCase() === v.toLowerCase())) {
      toast.error("Already added");
      return;
    }
    onChange([...sources, v]);
    setDraft("");
  };
  const remove = (idx: number) => onChange(sources.filter((_, i) => i !== idx));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {sources.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No sources yet — add one below.</p>
        )}
        {sources.map((s, idx) => (
          <span
            key={`${s}-${idx}`}
            className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 pl-3 pr-1 py-1 text-xs font-medium"
          >
            <Tag className="h-3 w-3 text-muted-foreground" />
            {s}
            <button
              type="button"
              onClick={() => remove(idx)}
              className="rounded-full p-0.5 text-muted-foreground hover:bg-rose-100 hover:text-rose-600"
              aria-label={`Remove ${s}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="e.g. Telegram, Live Chat, YouTube…"
          className="max-w-xs"
          maxLength={40}
        />
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={!draft.trim()}>
          <Plus className="h-4 w-4" /> Add Source
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Click <X className="inline h-3 w-3 -mt-0.5" /> to remove. Don't forget to press <b>Update Business</b> below to save.
      </p>
    </div>
  );
}