import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PackageSearch,
  Plus,
  ExternalLink,
  Trash2,
  Pencil,
  Target,
  Truck,
  CheckCircle2,
  ShoppingCart,
  Crown,
  Timer,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { HubPageHeader } from "@/components/erp/hub/hub-shell";
import { IdeaGallery, StarRating } from "@/components/erp/hub/idea-visuals";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchIdeaSummaries,
  fetchIdeas,
  fetchSourcingQuotes,
  fmtValue,
  quoteLandedCost,
  type HubIdea,
  type HubSourcingQuote,
} from "@/lib/erp/hub/hub-data";

export const Route = createFileRoute("/_authenticated/erp/hub/sourcing")({
  head: () => ({
    meta: [
      { title: "Sourcing Desk — Growth Hub" },
      {
        name: "description",
        content:
          "Approved product ideas এর supplier quote collect করো, target price এর সাথে compare করো আর order place করো।",
      },
      { property: "og:title", content: "Sourcing Desk — Growth Hub" },
      {
        property: "og:description",
        content: "Supplier quotes, landed cost comparison and order placement for approved ideas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SourcingPage,
});

const SOURCING_STATUSES = ["approved", "sourcing", "ordered"] as const;

type QDraft = {
  id?: string;
  supplier_name: string;
  supplier_url: string;
  contact: string;
  platform: string;
  unit_price_cny: string;
  cny_rate: string;
  moq: string;
  lead_time_days: string;
  shipping_mode: string;
  shipping_cost_per_unit: string;
  sample_status: string;
  quality_rating: string;
  notes: string;
};

const emptyQuote = (): QDraft => ({
  supplier_name: "",
  supplier_url: "",
  contact: "",
  platform: "1688",
  unit_price_cny: "",
  cny_rate: "17",
  moq: "",
  lead_time_days: "",
  shipping_mode: "air",
  shipping_cost_per_unit: "",
  sample_status: "none",
  quality_rating: "",
  notes: "",
});

function SourcingPage() {
  const { brandIds, activeBrand, isLoading: brandLoading } = useBrand();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qOpen, setQOpen] = useState(false);
  const [qDraft, setQDraft] = useState<QDraft>(emptyQuote());
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderQty, setOrderQty] = useState("");
  const [orderPrice, setOrderPrice] = useState("");
  const [tMin, setTMin] = useState("");
  const [tMax, setTMax] = useState("");

  const ideasQ = useQuery({
    queryKey: ["hub-ideas", brandIds],
    queryFn: () => fetchIdeas(brandIds),
    enabled: brandIds.length > 0,
  });
  const sumQ = useQuery({
    queryKey: ["hub-idea-summary", brandIds],
    queryFn: () => fetchIdeaSummaries(brandIds),
    enabled: brandIds.length > 0,
  });

  const pipeline = useMemo(
    () =>
      (ideasQ.data ?? []).filter((i) =>
        (SOURCING_STATUSES as readonly string[]).includes(i.status),
      ),
    [ideasQ.data],
  );

  const quotesQ = useQuery({
    queryKey: ["hub-quotes", pipeline.map((i) => i.id)],
    queryFn: () => fetchSourcingQuotes(pipeline.map((i) => i.id)),
    enabled: pipeline.length > 0,
  });

  useEffect(() => {
    if (!selectedId && pipeline.length > 0) setSelectedId(pipeline[0]!.id);
  }, [pipeline, selectedId]);

  const selected: HubIdea | null = useMemo(
    () => pipeline.find((i) => i.id === selectedId) ?? null,
    [pipeline, selectedId],
  );

  useEffect(() => {
    setTMin(selected?.target_price_min != null ? String(selected.target_price_min) : "");
    setTMax(selected?.target_price_max != null ? String(selected.target_price_max) : "");
  }, [selected?.id, selected?.target_price_min, selected?.target_price_max]);

  const quotes = (selectedId && quotesQ.data?.get(selectedId)) || [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["hub-ideas"] });
    qc.invalidateQueries({ queryKey: ["hub-idea-summary"] });
    qc.invalidateQueries({ queryKey: ["hub-quotes"] });
  };

  const saveQuote = useMutation({
    mutationFn: async (d: QDraft) => {
      if (!selected) throw new Error("Select a product first");
      const { data: auth } = await supabase.auth.getUser();
      const row = {
        idea_id: selected.id,
        supplier_name: d.supplier_name.trim(),
        supplier_url: d.supplier_url.trim() || null,
        contact: d.contact.trim() || null,
        platform: d.platform,
        unit_price_cny: Number(d.unit_price_cny || 0),
        cny_rate: Number(d.cny_rate || 0),
        moq: d.moq ? Number(d.moq) : null,
        lead_time_days: d.lead_time_days ? Number(d.lead_time_days) : null,
        shipping_mode: d.shipping_mode,
        shipping_cost_per_unit: Number(d.shipping_cost_per_unit || 0),
        sample_status: d.sample_status,
        quality_rating: d.quality_rating ? Number(d.quality_rating) : null,
        notes: d.notes.trim() || null,
        created_by: auth.user?.id ?? null,
        updated_at: new Date().toISOString(),
      };
      const { error } = d.id
        ? await supabase.from("hub_sourcing_quotes").update(row as never).eq("id", d.id)
        : await supabase.from("hub_sourcing_quotes").insert(row as never);
      if (error) throw error;
      if (selected.status === "approved") {
        await supabase
          .from("hub_product_ideas")
          .update({ status: "sourcing" } as never)
          .eq("id", selected.id);
      }
    },
    onSuccess: () => {
      toast.success("Quote saved");
      setQOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeQuote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hub_sourcing_quotes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Quote removed");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const chooseQuote = useMutation({
    mutationFn: async (q: HubSourcingQuote) => {
      const { error } = await supabase
        .from("hub_sourcing_quotes")
        .update({ status: "selected" } as never)
        .eq("id", q.id);
      if (error) throw error;
      await supabase
        .from("hub_sourcing_quotes")
        .update({ status: "quoted" } as never)
        .eq("idea_id", q.idea_id)
        .neq("id", q.id)
        .eq("status", "selected");
      const { error: e2 } = await supabase
        .from("hub_product_ideas")
        .update({
          selected_quote_id: q.id,
          status: "sourcing",
          supplier_name: q.supplier_name,
          supplier_url: q.supplier_url,
          est_unit_cost: quoteLandedCost(q),
        } as never)
        .eq("id", q.idea_id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Supplier selected");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveTarget = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const { error } = await supabase
        .from("hub_product_ideas")
        .update({
          target_price_min: tMin ? Number(tMin) : null,
          target_price_max: tMax ? Number(tMax) : null,
        } as never)
        .eq("id", selected.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Target price saved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const placeOrder = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const { error } = await supabase
        .from("hub_product_ideas")
        .update({
          status: "ordered",
          ordered_at: new Date().toISOString(),
          order_qty: orderQty ? Number(orderQty) : null,
          order_unit_price: orderPrice ? Number(orderPrice) : null,
        } as never)
        .eq("id", selected.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order placed 🎉");
      setOrderOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bestQuote = useMemo(() => {
    if (quotes.length === 0) return null;
    return [...quotes]
      .filter((q) => q.status !== "rejected")
      .sort((a, b) => quoteLandedCost(a) - quoteLandedCost(b))[0] ?? null;
  }, [quotes]);

  const inTarget = (cost: number) => {
    if (!selected) return null;
    const max = selected.target_price_max;
    if (max == null) return null;
    return cost <= max;
  };

  const openNewQuote = () => {
    setQDraft(emptyQuote());
    setQOpen(true);
  };
  const openEditQuote = (q: HubSourcingQuote) => {
    setQDraft({
      id: q.id,
      supplier_name: q.supplier_name,
      supplier_url: q.supplier_url ?? "",
      contact: q.contact ?? "",
      platform: q.platform,
      unit_price_cny: String(q.unit_price_cny || ""),
      cny_rate: String(q.cny_rate || ""),
      moq: q.moq ? String(q.moq) : "",
      lead_time_days: q.lead_time_days ? String(q.lead_time_days) : "",
      shipping_mode: q.shipping_mode,
      shipping_cost_per_unit: String(q.shipping_cost_per_unit || ""),
      sample_status: q.sample_status,
      quality_rating: q.quality_rating ? String(q.quality_rating) : "",
      notes: q.notes ?? "",
    });
    setQOpen(true);
  };

  const draftLanded =
    Number(qDraft.unit_price_cny || 0) * Number(qDraft.cny_rate || 0) +
    Number(qDraft.shipping_cost_per_unit || 0);

  const selImages = selected
    ? selected.images?.length
      ? selected.images
      : selected.image_url
        ? [selected.image_url]
        : []
    : [];
  const selSummary = selected ? sumQ.data?.get(selected.id) : undefined;

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-3 md:p-6">
      <HubPageHeader
        icon={PackageSearch}
        title="Sourcing Desk"
        subtitle={
          activeBrand
            ? `${activeBrand.name} — approved product এর supplier quote আর order`
            : "Approved products এর pricing, quote আর order placement"
        }
        actions={
          selected ? (
            <>
              <Button size="sm" variant="outline" onClick={openNewQuote}>
                <Plus className="mr-1.5 h-4 w-4" /> Add quote
              </Button>
              <Button
                size="sm"
                disabled={selected.status === "ordered"}
                onClick={() => {
                  setOrderQty(selected.order_qty ? String(selected.order_qty) : "");
                  setOrderPrice(
                    selected.order_unit_price
                      ? String(selected.order_unit_price)
                      : bestQuote
                        ? String(Math.round(quoteLandedCost(bestQuote)))
                        : "",
                  );
                  setOrderOpen(true);
                }}
              >
                <ShoppingCart className="mr-1.5 h-4 w-4" />
                {selected.status === "ordered" ? "Ordered" : "Place order"}
              </Button>
            </>
          ) : null
        }
      />

      {(ideasQ.isLoading || brandLoading) && <Skeleton className="h-64 w-full rounded-xl" />}

      {!ideasQ.isLoading && pipeline.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            এখনো approved product নেই। Product Pipeline-এ admin approve করলেই এখানে চলে আসবে।
          </CardContent>
        </Card>
      )}

      {pipeline.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          {/* Queue */}
          <div className="space-y-2">
            {pipeline.map((i) => {
              const on = i.id === selectedId;
              const imgs = i.images?.length ? i.images : i.image_url ? [i.image_url] : [];
              const qs = quotesQ.data?.get(i.id) ?? [];
              return (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setSelectedId(i.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all ${
                    on
                      ? "border-primary/40 bg-primary/5 shadow-sm"
                      : "border-border/70 hover:bg-muted/50"
                  }`}
                >
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg">
                    <IdeaGallery images={imgs.slice(0, 1)} title={i.title} className="h-14" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{i.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {qs.length} quote{qs.length === 1 ? "" : "s"}
                      {i.target_price_max ? ` · target ≤ ${fmtValue(i.target_price_max, "bdt")}` : ""}
                    </p>
                  </div>
                  <Badge
                    variant={i.status === "ordered" ? "default" : "secondary"}
                    className="shrink-0 text-[10px] capitalize"
                  >
                    {i.status}
                  </Badge>
                </button>
              );
            })}
          </div>

          {/* Detail */}
          {selected && (
            <div className="space-y-4">
              <Card className="overflow-hidden">
                <div className="grid gap-0 md:grid-cols-[280px_1fr]">
                  <IdeaGallery images={selImages} title={selected.title} className="aspect-[4/3]" />
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="font-display text-lg font-bold">{selected.title}</h2>
                        <p className="text-xs text-muted-foreground">
                          {selected.category || "uncategorised"}
                          {selected.moq ? ` · MOQ ${selected.moq}` : ""}
                          {selected.approved_at
                            ? ` · approved ${new Date(selected.approved_at).toLocaleDateString()}`
                            : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <StarRating value={selSummary?.avg_rating ?? 0} />
                        <p className="text-[10px] text-muted-foreground">
                          {selSummary?.up_votes ?? 0} likes · {selSummary?.rating_count ?? 0} ratings
                        </p>
                      </div>
                    </div>

                    {selected.description && (
                      <p className="text-xs text-muted-foreground">{selected.description}</p>
                    )}

                    <div className="flex flex-wrap gap-1.5 text-xs">
                      <Badge variant="outline">
                        Planned sell {fmtValue(selected.est_sell_price, "bdt")}
                      </Badge>
                      <Badge variant="outline">
                        Est. cost {fmtValue(selected.est_unit_cost, "bdt")}
                      </Badge>
                      {selected.source_url && (
                        <a
                          href={selected.source_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          source <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>

                    <div className="rounded-lg border bg-muted/40 p-3">
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                        <Target className="h-3.5 w-3.5 text-primary" /> Target landed price (৳/unit)
                      </p>
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="grid gap-1">
                          <Label className="text-[11px]">Min</Label>
                          <Input
                            className="h-8 w-24"
                            type="number"
                            value={tMin}
                            onChange={(e) => setTMin(e.target.value)}
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-[11px]">Max</Label>
                          <Input
                            className="h-8 w-24"
                            type="number"
                            value={tMax}
                            onChange={(e) => setTMax(e.target.value)}
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => saveTarget.mutate()}
                          disabled={saveTarget.isPending}
                        >
                          Save target
                        </Button>
                        {bestQuote && (
                          <span className="ml-auto text-xs">
                            Best quote:{" "}
                            <span
                              className={
                                inTarget(quoteLandedCost(bestQuote)) === false
                                  ? "font-semibold text-destructive"
                                  : "font-semibold text-emerald-600"
                              }
                            >
                              {fmtValue(Math.round(quoteLandedCost(bestQuote)), "bdt")}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    {selected.status === "ordered" && (
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          Order placed
                        </span>{" "}
                        — {selected.order_qty ?? 0} pcs @{" "}
                        {fmtValue(selected.order_unit_price ?? 0, "bdt")} ·{" "}
                        {selected.ordered_at
                          ? new Date(selected.ordered_at).toLocaleDateString()
                          : ""}
                      </div>
                    )}
                  </CardContent>
                </div>
              </Card>

              {/* Quotes */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Supplier quotes ({quotes.length})</h3>
                  <Button size="sm" variant="outline" onClick={openNewQuote}>
                    <Plus className="mr-1.5 h-4 w-4" /> Add quote
                  </Button>
                </div>

                {quotes.length === 0 && (
                  <Card>
                    <CardContent className="p-8 text-center text-sm text-muted-foreground">
                      কোনো quote নেই। 1688 / Alibaba supplier থেকে price নিয়ে "Add quote" করো।
                    </CardContent>
                  </Card>
                )}

                <div className="grid gap-2 md:grid-cols-2">
                  {[...quotes]
                    .sort((a, b) => quoteLandedCost(a) - quoteLandedCost(b))
                    .map((q) => {
                      const landed = quoteLandedCost(q);
                      const ok = inTarget(landed);
                      const isSelected = selected.selected_quote_id === q.id;
                      return (
                        <Card
                          key={q.id}
                          className={`transition-all ${
                            isSelected ? "border-primary/50 shadow-sm shadow-primary/10" : ""
                          }`}
                        >
                          <CardContent className="space-y-2 p-3.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                                  {isSelected && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                                  {q.supplier_name}
                                </p>
                                <p className="text-[11px] uppercase text-muted-foreground">
                                  {q.platform}
                                  {q.contact ? ` · ${q.contact}` : ""}
                                </p>
                              </div>
                              <div className="flex shrink-0 gap-1">
                                <Button size="icon" variant="ghost" onClick={() => openEditQuote(q)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => removeQuote.mutate(q.id)}
                                  disabled={removeQuote.isPending}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <Info label="Unit price" value={`¥${q.unit_price_cny} @ ${q.cny_rate}`} />
                              <Info
                                label="Shipping/unit"
                                value={`${fmtValue(q.shipping_cost_per_unit, "bdt")} · ${q.shipping_mode}`}
                              />
                              <Info label="MOQ" value={q.moq ? String(q.moq) : "—"} />
                              <Info
                                label="Lead time"
                                value={q.lead_time_days ? `${q.lead_time_days}d` : "—"}
                              />
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                              <div>
                                <p className="text-[10px] text-muted-foreground">Landed / unit</p>
                                <p
                                  className={`font-display text-lg font-bold ${
                                    ok === false
                                      ? "text-destructive"
                                      : ok === true
                                        ? "text-emerald-600"
                                        : ""
                                  }`}
                                >
                                  {fmtValue(Math.round(landed), "bdt")}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {q.quality_rating ? <StarRating value={q.quality_rating} /> : null}
                                <Badge variant="outline" className="text-[10px] capitalize">
                                  <Timer className="mr-1 h-3 w-3" /> {q.sample_status}
                                </Badge>
                                {q.supplier_url && (
                                  <a
                                    href={q.supplier_url}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="text-primary"
                                    aria-label="Open supplier link"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                )}
                              </div>
                            </div>

                            {q.notes && (
                              <p className="text-[11px] text-muted-foreground">{q.notes}</p>
                            )}

                            <Button
                              size="sm"
                              variant={isSelected ? "secondary" : "outline"}
                              className="w-full"
                              onClick={() => chooseQuote.mutate(q)}
                              disabled={chooseQuote.isPending}
                            >
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                              {isSelected ? "Selected supplier" : "Select this supplier"}
                            </Button>
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quote dialog */}
      <Dialog open={qOpen} onOpenChange={setQOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{qDraft.id ? "Edit quote" : "New supplier quote"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Supplier name">
                <Input
                  value={qDraft.supplier_name}
                  onChange={(e) => setQDraft({ ...qDraft, supplier_name: e.target.value })}
                />
              </Field>
              <Field label="Platform">
                <Select
                  value={qDraft.platform}
                  onValueChange={(v) => setQDraft({ ...qDraft, platform: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["1688", "Alibaba", "Taobao", "Direct factory", "Local"].map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Supplier link">
              <Input
                value={qDraft.supplier_url}
                onChange={(e) => setQDraft({ ...qDraft, supplier_url: e.target.value })}
                placeholder="https://detail.1688.com/..."
              />
            </Field>
            <Field label="Contact (WeChat / phone)">
              <Input
                value={qDraft.contact}
                onChange={(e) => setQDraft({ ...qDraft, contact: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Unit price (¥)">
                <Input
                  type="number"
                  value={qDraft.unit_price_cny}
                  onChange={(e) => setQDraft({ ...qDraft, unit_price_cny: e.target.value })}
                />
              </Field>
              <Field label="৳ per ¥">
                <Input
                  type="number"
                  value={qDraft.cny_rate}
                  onChange={(e) => setQDraft({ ...qDraft, cny_rate: e.target.value })}
                />
              </Field>
              <Field label="Ship/unit (৳)">
                <Input
                  type="number"
                  value={qDraft.shipping_cost_per_unit}
                  onChange={(e) =>
                    setQDraft({ ...qDraft, shipping_cost_per_unit: e.target.value })
                  }
                />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="MOQ">
                <Input
                  type="number"
                  value={qDraft.moq}
                  onChange={(e) => setQDraft({ ...qDraft, moq: e.target.value })}
                />
              </Field>
              <Field label="Lead time (days)">
                <Input
                  type="number"
                  value={qDraft.lead_time_days}
                  onChange={(e) => setQDraft({ ...qDraft, lead_time_days: e.target.value })}
                />
              </Field>
              <Field label="Shipping mode">
                <Select
                  value={qDraft.shipping_mode}
                  onValueChange={(v) => setQDraft({ ...qDraft, shipping_mode: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["air", "sea", "express"].map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sample status">
                <Select
                  value={qDraft.sample_status}
                  onValueChange={(v) => setQDraft({ ...qDraft, sample_status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["none", "requested", "shipped", "received", "approved"].map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Quality rating (1-5)">
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={qDraft.quality_rating}
                  onChange={(e) => setQDraft({ ...qDraft, quality_rating: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea
                rows={2}
                value={qDraft.notes}
                onChange={(e) => setQDraft({ ...qDraft, notes: e.target.value })}
              />
            </Field>
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3 text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Truck className="h-4 w-4" /> Landed cost / unit
              </span>
              <span className="font-display text-lg font-bold">
                {fmtValue(Math.round(draftLanded), "bdt")}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveQuote.mutate(qDraft)}
              disabled={!qDraft.supplier_name.trim() || saveQuote.isPending}
            >
              Save quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order dialog */}
      <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Place order — {selected?.title}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Quantity (pcs)">
              <Input
                type="number"
                value={orderQty}
                onChange={(e) => setOrderQty(e.target.value)}
              />
            </Field>
            <Field label="Unit landed price (৳)">
              <Input
                type="number"
                value={orderPrice}
                onChange={(e) => setOrderPrice(e.target.value)}
              />
            </Field>
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total order value</span>
                <span className="font-display text-lg font-bold">
                  {fmtValue(
                    Math.round(Number(orderQty || 0) * Number(orderPrice || 0)),
                    "bdt",
                  )}
                </span>
              </div>
              {selected?.target_price_max != null &&
                Number(orderPrice || 0) > selected.target_price_max && (
                  <p className="mt-1 text-xs text-destructive">
                    Target price ({fmtValue(selected.target_price_max, "bdt")}) এর উপরে যাচ্ছে।
                  </p>
                )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrderOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => placeOrder.mutate()}
              disabled={!orderQty || !orderPrice || placeOrder.isPending}
            >
              Confirm order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
