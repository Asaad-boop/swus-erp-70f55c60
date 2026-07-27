import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Plus, Trash2, Package, Boxes, Wallet, Truck, AlertTriangle,
  Loader2, FileText, Sparkles, SplitSquareHorizontal, Save,
} from "lucide-react";
import { toast } from "sonner";
import { useBrand } from "@/contexts/brand-context";
import { useAccounts } from "@/hooks/erp/use-finance-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  createImportPo, listImportSuppliers, updatePoLandedCost,
  listCargoAgents, setPoCargoAgent,
} from "@/lib/erp/imports/imports.functions";
import { fmtBdt, newIdemKey } from "@/lib/erp/imports/types";
import { ProductPicker, type PickedProduct } from "@/components/erp/imports/product-picker";
import { supabase } from "@/integrations/supabase/client";
import { Palette } from "lucide-react";
import { AmountPercentInput } from "@/components/erp/amount-percent-input";

export const Route = createFileRoute("/_authenticated/erp/imports/orders/new")({
  head: () => ({ meta: [{ title: "New Purchase Order — Imports" }] }),
  component: NewPoPage,
});

type ItemDraft = {
  id: string;
  picked: PickedProduct;
  quantity: number;
  unit_cost_foreign: number;
  allocations?: Record<string, number>; // variant_id -> qty
};

type CartonDraft = {
  id: string;
  carton_number: number;
  weight_kg: number;
  // key = `${itemId}|${variantId ?? ''}`
  allocations: Record<string, number>;
};

type VariantMeta = { id: string; color_name: string | null; color_hex: string | null; image: string | null; sku?: string | null; stock?: number | null };

const leafKey = (itemId: string, variantId: string | null) => `${itemId}|${variantId ?? ""}`;
const variantLabel = (v: VariantMeta) => v.color_name || v.sku || `Variant ${v.id.slice(0, 4)}`;

const uid = () => Math.random().toString(36).slice(2, 10);
const emptyPick = (): PickedProduct => ({ id: null, title: "", sku: null, image: null });

function NewPoPage() {
  const { activeBrand, brands } = useBrand();
  const navigate = useNavigate();
  const [formBrandId, setFormBrandId] = useState<string>(() => activeBrand?.id ?? "");
  const effectiveBrand = useMemo(
    () => brands.find((b) => b.id === formBrandId) ?? null,
    [brands, formBrandId],
  );
  const brandId = effectiveBrand?.id ?? null;

  const suppliersFn = useServerFn(listImportSuppliers);
  const createFn = useServerFn(createImportPo);
  const landedFn = useServerFn(updatePoLandedCost);
  const agentsFn = useServerFn(listCargoAgents);
  const setAgentFn = useServerFn(setPoCargoAgent);

  const { data: suppliers = [] } = useQuery({
    queryKey: ["imp-suppliers", brandId], enabled: !!brandId,
    queryFn: () => suppliersFn({ data: { brandId: brandId! } }),
  });
  const { data: cargoAgents = [] } = useQuery({
    queryKey: ["imp-cargo-agents", brandId, "active"], enabled: !!brandId,
    queryFn: () => agentsFn({ data: { brandId: brandId!, activeOnly: true } }),
  });
  const { data: wallets = [] } = useAccounts(brandId ? [brandId] : []);

  // form state
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplierId, setSupplierId] = useState<string>("");
  const [cargoAgentId, setCargoAgentId] = useState<string>("");
  const [currency, setCurrency] = useState("CNY");
  const [fxRate, setFxRate] = useState<number>(14);
  const [notes, setNotes] = useState("");
  const [agentCommissionCny, setAgentCommissionCny] = useState<number>(0);
  const [receiveMode, setReceiveMode] = useState<"carton" | "quantity">("carton");

  const [items, setItems] = useState<ItemDraft[]>([
    { id: uid(), picked: emptyPick(), quantity: 1, unit_cost_foreign: 0 },
  ]);
  const [cartons, setCartons] = useState<CartonDraft[]>([
    { id: uid(), carton_number: 1, weight_kg: 0, allocations: {} },
  ]);

  // Variants meta populated by ImportColorAllocator; used by carton allocator for labels.
  const [variantsByProduct, setVariantsByProduct] = useState<Record<string, VariantMeta[]>>({});
  const registerVariants = (productId: string, vs: VariantMeta[]) =>
    setVariantsByProduct((m) => {
      const prev = m[productId];
      if (prev && prev.length === vs.length && prev.every((x, i) => x.id === vs[i].id)) return m;
      return { ...m, [productId]: vs };
    });

  // initial payment
  const [payEnabled, setPayEnabled] = useState(false);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payWalletId, setPayWalletId] = useState<string>("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payRef, setPayRef] = useState("");

  // computed
  const productSubtotalForeign = items.reduce((s, i) => s + i.quantity * i.unit_cost_foreign, 0);
  const productSubtotalBdt = productSubtotalForeign * (fxRate || 0);

  type Leaf = {
    key: string;
    itemId: string;
    variantId: string | null;
    title: string;
    image: string | null;
    variantLabel: string | null;
    variantHex: string | null;
    qty: number;
  };
  const leaves: Leaf[] = useMemo(() => {
    const out: Leaf[] = [];
    for (const it of items) {
      const allocs = it.allocations ? Object.entries(it.allocations).filter(([, q]) => q > 0) : [];
      if (allocs.length > 0) {
        const vmap = new Map((variantsByProduct[it.picked.id ?? ""] ?? []).map((v) => [v.id, v]));
        for (const [vid, q] of allocs) {
          const v = vmap.get(vid);
          out.push({
            key: leafKey(it.id, vid),
            itemId: it.id,
            variantId: vid,
            title: it.picked.title || "—",
            image: v?.image || it.picked.image || null,
            variantLabel: v ? variantLabel(v) : `Variant ${vid.slice(0, 4)}`,
            variantHex: v?.color_hex ?? null,
            qty: Number(q) || 0,
          });
        }
      } else {
        out.push({
          key: leafKey(it.id, null),
          itemId: it.id,
          variantId: null,
          title: it.picked.title || "—",
          image: it.picked.image || null,
          variantLabel: null,
          variantHex: null,
          qty: it.quantity,
        });
      }
    }
    return out;
  }, [items, variantsByProduct]);

  const totalAllocated = useMemo(() => {
    const map: Record<string, number> = {};
    leaves.forEach((l) => { map[l.key] = 0; });
    cartons.forEach((c) => {
      Object.entries(c.allocations).forEach(([k, q]) => {
        if (map[k] !== undefined) map[k] += Number(q) || 0;
      });
    });
    return map;
  }, [leaves, cartons]);

  const reconciliationErrors = useMemo(() => {
    return leaves.flatMap((l) => {
      const allocated = totalAllocated[l.key] ?? 0;
      if (allocated !== l.qty) {
        const label = l.variantLabel ? `${l.title} — ${l.variantLabel}` : l.title;
        return [`${label}: allocated ${allocated} / ${l.qty}`];
      }
      return [];
    });
  }, [leaves, totalAllocated]);

  const selectedWallet = wallets.find((w) => w.id === payWalletId);
  const walletAfter = selectedWallet ? Number(selectedWallet.current_balance) - payAmount : null;

  // actions
  const addItem = () => setItems((xs) => [...xs, { id: uid(), picked: emptyPick(), quantity: 1, unit_cost_foreign: 0 }]);
  const removeItem = (id: string) => setItems((xs) => xs.filter((x) => x.id !== id));
  const updItem = (id: string, patch: Partial<ItemDraft>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const addCarton = () => setCartons((cs) => [...cs, { id: uid(), carton_number: cs.length + 1, weight_kg: 0, allocations: {} }]);
  const removeCarton = (id: string) => setCartons((cs) => cs.filter((c) => c.id !== id).map((c, idx) => ({ ...c, carton_number: idx + 1 })));
  const updCarton = (id: string, patch: Partial<CartonDraft>) => setCartons((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const setAlloc = (cartonId: string, leaf: string, q: number) =>
    setCartons((cs) => cs.map((c) => {
      if (c.id !== cartonId) return c;
      const next = { ...c.allocations };
      if (q > 0) next[leaf] = q; else delete next[leaf];
      return { ...c, allocations: next };
    }));

  const autoSplit = () => {
    if (cartons.length === 0) return;
    setCartons((cs) =>
      cs.map((c, ci) => {
        const newAlloc: Record<string, number> = {};
        leaves.forEach((l) => {
          const base = Math.floor(l.qty / cs.length);
          const rem = l.qty - base * cs.length;
          const share = base + (ci < rem ? 1 : 0);
          if (share > 0) newAlloc[l.key] = share;
        });
        return { ...c, allocations: newAlloc };
      }),
    );
  };

  const submitMut = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("No brand");
      if (items.some((i) => !i.picked.title.trim() || i.quantity <= 0)) throw new Error("Each item needs a name & quantity > 0");
      if (receiveMode === "carton" && reconciliationErrors.length > 0) throw new Error("Carton allocations don't match item quantities");
      if (payEnabled && (payAmount <= 0 || !payWalletId)) throw new Error("Payment amount & wallet required");

      // Build itemList (one entry per leaf) and leafKey -> item_index map.
      const itemList: any[] = [];
      const leafIndex: Record<string, number> = {};
      for (const it of items) {
        const allocs = it.allocations ? Object.entries(it.allocations).filter(([, q]) => q > 0) : [];
        if (allocs.length > 0) {
          for (const [variant_id, qty] of allocs) {
            leafIndex[leafKey(it.id, variant_id)] = itemList.length;
            itemList.push({
              product_id: it.picked.id ?? undefined,
              variant_id,
              name_snapshot: it.picked.title.trim(),
              sku_snapshot: it.picked.sku ?? undefined,
              image_snapshot: it.picked.image ?? undefined,
              quantity: qty,
              unit_cost_foreign: it.unit_cost_foreign,
            });
          }
        } else {
          leafIndex[leafKey(it.id, null)] = itemList.length;
          itemList.push({
            product_id: it.picked.id ?? undefined,
            name_snapshot: it.picked.title.trim(),
            sku_snapshot: it.picked.sku ?? undefined,
            image_snapshot: it.picked.image ?? undefined,
            quantity: it.quantity,
            unit_cost_foreign: it.unit_cost_foreign,
          });
        }
      }

      const cartonList = cartons.map((c) => {
        const allocs: { item_index: number; quantity: number }[] = [];
        for (const [k, qty] of Object.entries(c.allocations)) {
          const q = Number(qty) || 0;
          if (q <= 0) continue;
          const idx = leafIndex[k];
          if (idx === undefined) continue;
          allocs.push({ item_index: idx, quantity: q });
        }
        return {
          carton_number: c.carton_number,
          weight_kg: c.weight_kg || 0,
          allocations: allocs,
        };
      });

      const payload: any = {
        brand_id: brandId,
        order_date: orderDate,
        currency,
        fx_rate: fxRate,
        notes: notes || undefined,
        items: itemList,
        cartons: receiveMode === "carton" ? cartonList : [],
        receive_mode: receiveMode,
        idempotency_key: newIdemKey("po"),
      };
      if (supplierId) payload.supplier = { id: supplierId };

      if (payEnabled && payAmount > 0 && payWalletId) {
        payload.initial_payment = {
          amount_bdt: payAmount,
          wallet_id: payWalletId,
          payment_date: payDate,
          reference: payRef || undefined,
          payment_type: "supplier_advance",
          idempotency_key: newIdemKey("pay"),
        };
      }

      const res: any = await createFn({ data: payload });
      // Persist optional cargo agent
      if (res?.po_id && cargoAgentId) {
        try {
          await setAgentFn({ data: { po_id: res.po_id, cargo_agent_id: cargoAgentId } });
        } catch (e) {
          console.warn("Failed to set cargo agent", e);
        }
      }
      // Persist agent commission (CNY/pcs) on the PO if provided
      if (res?.po_id && agentCommissionCny > 0 && fxRate > 0) {
        try {
          await landedFn({
            data: {
              po_id: res.po_id,
              fx_rate_cny_bdt: fxRate,
              fx_rate_source: "manual",
              freight_cost_bdt: 0,
              customs_duty_bdt: 0,
              other_charges_bdt: 0,
              agent_commission_cny: agentCommissionCny,
              items: [],
              lock_rate: false,
            },
          });
        } catch (e) {
          console.warn("Failed to save agent commission", e);
        }
      }
      return res;
    },
    onSuccess: (res: any) => {
      toast.success(`PO ${res?.po_number ?? "created"} successfully`);
      if (res?.po_id) navigate({ to: "/erp/imports/orders/$orderId", params: { orderId: res.po_id } });
      else navigate({ to: "/erp/imports/orders" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create PO"),
  });

  const totalCartonWeight = cartons.reduce((s, c) => s + (Number(c.weight_kg) || 0), 0);
  const totalUnits = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const itemsValid = items.length > 0 && items.every((i) => i.picked.title.trim() && i.quantity > 0);
  const canSubmit = !!brandId && itemsValid && (receiveMode === "quantity" || reconciliationErrors.length === 0) && !submitMut.isPending && (!payEnabled || (payAmount > 0 && !!payWalletId));

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1600px] mx-auto pb-24">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-background/95 backdrop-blur border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link to="/erp/imports/orders"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Back</Button></Link>
          <div>
            <h2 className="text-lg md:text-xl font-bold flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />New Purchase Order</h2>
            <p className="text-[11px] text-muted-foreground">Brand: {effectiveBrand?.name ?? "— select below —"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5"><Sparkles className="h-3 w-3" />Draft</Badge>
          <Button size="sm" disabled={!canSubmit} onClick={() => submitMut.mutate()}>
            {submitMut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</> : <><Save className="h-4 w-4 mr-2" />Create PO</>}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">
        <div className="space-y-5 min-w-0">

          {/* Header card */}
          <Card className="p-4 md:p-5">
            <SectionTitle icon={Package} title="Order info" />
            <div className="grid md:grid-cols-3 gap-3 mt-3">
              <div>
                <Label className="text-xs">Brand <span className="text-red-500">*</span></Label>
                <Select value={formBrandId} onValueChange={setFormBrandId}>
                  <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                  <SelectContent>
                    {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Order date</Label>
                <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Supplier <span className="text-muted-foreground">(optional)</span></Label>
                <Select value={supplierId || "__none"} onValueChange={(v) => setSupplierId(v === "__none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="No supplier" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— None —</SelectItem>
                    {(suppliers as any[]).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Cargo Agent <span className="text-muted-foreground">(optional)</span></Label>
                <Select value={cargoAgentId || "__none"} onValueChange={(v) => setCargoAgentId(v === "__none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="No cargo agent" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— None —</SelectItem>
                    {(cargoAgents as any[]).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Currency</Label>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={8} />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">FX rate (1 {currency} = ? BDT)</Label>
                <Input type="number" step="0.0001" value={fxRate} onChange={(e) => setFxRate(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Agent commission ({currency}/pcs)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={agentCommissionCny}
                  onChange={(e) => setAgentCommissionCny(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="0.00"
                />
                {agentCommissionCny > 0 && (
                  fxRate > 0 ? (
                    <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                      = {fmtBdt(agentCommissionCny * fxRate)}/pcs · total {fmtBdt(agentCommissionCny * fxRate * totalUnits)}
                    </div>
                  ) : (
                    <div className="text-[11px] text-orange-600 mt-1">Set FX rate first</div>
                  )
                )}
              </div>
              <div className="md:col-span-3">
                <Label className="text-xs">Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" rows={2} />
              </div>
              <div className="md:col-span-3">
                <Label className="text-xs">Receive mode</Label>
                <div className="mt-1 grid sm:grid-cols-2 gap-2">
                  {([
                    { v: "carton" as const, title: "Carton based", desc: "Carton banaye allocation korbo, carton dhore receive hobe." },
                    { v: "quantity" as const, title: "Quantity based", desc: "Sudhu total piece order — BD te ese joto piece chai toto release korbo." },
                  ]).map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setReceiveMode(o.v)}
                      className={cn(
                        "text-left rounded-lg border p-3 transition",
                        receiveMode === o.v ? "border-primary ring-1 ring-primary/40 bg-primary/5" : "border-border hover:border-primary/40",
                      )}
                    >
                      <div className="text-sm font-semibold">{o.title}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{o.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Items */}
          <Card className="p-4 md:p-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <SectionTitle icon={Boxes} title={`Items (${items.length})`} />
              <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" />Add item</Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Pick from inventory or create new. PO confirm korle inventory-te "Incoming" hisebe dekhabe.
            </p>
            <div className="mt-3 space-y-2">
              {items.map((it) => {
                const subBdt = it.quantity * it.unit_cost_foreign * (fxRate || 0);
                const unitBdt = it.unit_cost_foreign * (fxRate || 0);
                return (
                  <div
                    key={it.id}
                    className="group relative rounded-lg border border-border bg-gradient-to-br from-card to-muted/20 p-3 md:p-4 hover:border-primary/40 hover:shadow-sm transition-all"
                  >
                    <div className="flex flex-col md:flex-row gap-3 md:gap-4 md:items-stretch">
                      {/* Thumbnail */}
                      <div className="flex-shrink-0 self-start">
                        {it.picked.image ? (
                          <img
                            src={it.picked.image}
                            alt={it.picked.title}
                            className="h-16 w-16 md:h-20 md:w-20 rounded-md object-cover border border-border bg-muted"
                          />
                        ) : (
                          <div className="h-16 w-16 md:h-20 md:w-20 rounded-md bg-muted border border-dashed border-border flex items-center justify-center">
                            <Package className="h-7 w-7 text-muted-foreground/60" />
                          </div>
                        )}
                      </div>

                      {/* Picker + meta */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Product</Label>
                        <ProductPicker
                          brandId={brandId!}
                          value={it.picked}
                          onChange={(p) => updItem(it.id, { picked: p })}
                        />
                        {(it.picked.sku || it.picked.id) && (
                          <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground pt-0.5">
                            {it.picked.sku && (
                              <span className="font-mono px-1.5 py-0.5 rounded bg-muted">{it.picked.sku}</span>
                            )}
                            {it.picked.id && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900">
                                Inventory linked
                              </Badge>
                            )}
                            {!it.picked.id && it.picked.title && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5">Ad-hoc</Badge>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Numeric inputs */}
                      <div className="grid grid-cols-3 gap-2 md:gap-3 md:w-[360px] flex-shrink-0">
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Qty</Label>
                          <Input
                            type="number" min={1} value={it.quantity}
                            disabled={!!it.allocations}
                            onChange={(e) => updItem(it.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                            className="h-9 text-center font-semibold tabular-nums"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Unit ({currency})</Label>
                          <Input
                            type="number" step="0.01" value={it.unit_cost_foreign}
                            onChange={(e) => updItem(it.id, { unit_cost_foreign: Number(e.target.value) || 0 })}
                            className="h-9 text-right tabular-nums"
                          />
                          {unitBdt > 0 && (
                            <div className="text-[10px] text-muted-foreground mt-0.5 text-right tabular-nums">
                              ≈ {fmtBdt(unitBdt)}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Subtotal</Label>
                          <div className="h-9 flex items-center justify-end font-bold tabular-nums text-sm text-primary">
                            {fmtBdt(subBdt)}
                          </div>
                          <div className="text-[10px] text-muted-foreground text-right tabular-nums">
                            {(it.quantity * it.unit_cost_foreign).toFixed(2)} {currency}
                          </div>
                        </div>
                      </div>

                      {/* Delete */}
                      <div className="absolute top-2 right-2 md:static md:self-start">
                        <Button
                          size="icon" variant="ghost"
                          className="h-7 w-7 opacity-60 hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-950/30"
                          disabled={items.length === 1}
                          onClick={() => removeItem(it.id)}
                          title="Remove item"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      </div>
                    </div>
                    {it.picked.id && (
                      <div className="px-3 pb-3">
                        <ImportColorAllocator
                          productId={it.picked.id}
                          allocations={it.allocations}
                          onChange={(allocs) => {
                            const total = Object.values(allocs).reduce((s, n) => s + n, 0);
                            updItem(it.id, {
                              allocations: Object.keys(allocs).length ? allocs : undefined,
                              quantity: total > 0 ? total : it.quantity,
                            });
                          }}
                          onVariantsLoaded={(vs) => registerVariants(it.picked.id!, vs)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex justify-end text-sm">
              <div className="space-y-1 text-right">
                <div><span className="text-muted-foreground">Total ({currency}): </span><span className="font-semibold tabular-nums">{productSubtotalForeign.toFixed(2)}</span></div>
                <div className="text-base"><span className="text-muted-foreground">Product subtotal: </span><span className="font-bold tabular-nums">{fmtBdt(productSubtotalBdt)}</span></div>
              </div>
            </div>
          </Card>

          {/* Cartons */}
          {receiveMode === "carton" ? (
          <Card className="p-4 md:p-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <SectionTitle icon={Truck} title={`Cartons (${cartons.length})`} />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={autoSplit}><SplitSquareHorizontal className="h-3.5 w-3.5 mr-1" />Auto-split</Button>
                <Button size="sm" variant="outline" onClick={addCarton}><Plus className="h-3.5 w-3.5 mr-1" />Add carton</Button>
              </div>
            </div>
            {reconciliationErrors.length > 0 && (
              <div className="mt-3 flex items-start gap-2 p-3 rounded-md bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 text-xs">
                <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-orange-700 dark:text-orange-300 mb-1">Carton allocation mismatch</div>
                  {reconciliationErrors.map((e, i) => <div key={i} className="text-orange-700 dark:text-orange-400">• {e}</div>)}
                </div>
              </div>
            )}
            <div className="mt-3 space-y-3">
              {cartons.map((c) => (
                <div key={c.id} className="rounded-md border border-border bg-card/50 p-3">
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    <div className="font-mono text-sm font-semibold px-2 py-1 rounded bg-primary/10 text-primary">CTN-{c.carton_number}</div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs whitespace-nowrap">Weight (kg)</Label>
                      <Input type="number" step="0.1" className="w-24 h-8" value={c.weight_kg}
                        onChange={(e) => updCarton(c.id, { weight_kg: Number(e.target.value) || 0 })} />
                    </div>
                    <div className="ml-auto">
                      <Button size="icon" variant="ghost" disabled={cartons.length === 1} onClick={() => removeCarton(c.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {leaves.map((l) => {
                      const alloc = c.allocations[l.key] ?? 0;
                      const over = alloc > l.qty;
                      return (
                        <div
                          key={l.key}
                          className={cn(
                            "flex items-center gap-2 text-xs p-1.5 rounded border bg-background/60",
                            over ? "border-red-300" : "border-border/60",
                          )}
                        >
                          {l.image ? (
                            <img src={l.image} alt="" className="h-9 w-9 rounded object-cover flex-shrink-0 border border-border" />
                          ) : (
                            <div className="h-9 w-9 rounded bg-muted flex items-center justify-center flex-shrink-0 border border-dashed border-border">
                              <Package className="h-4 w-4 text-muted-foreground/60" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="truncate font-medium flex items-center gap-1.5">
                              {l.variantLabel && (
                                <span
                                  className="h-3 w-3 rounded-sm border border-border shrink-0"
                                  style={{ background: l.variantHex || "#e5e7eb" }}
                                />
                              )}
                              <span className="truncate">{l.title}</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground tabular-nums truncate">
                              {l.variantLabel ? `${l.variantLabel} · ` : ""}of {l.qty}
                            </div>
                          </div>
                          <Input
                            type="number" min={0} max={l.qty}
                            className={cn("w-16 h-8 text-right tabular-nums", over && "border-red-400 text-red-600")}
                            value={alloc || ""}
                            placeholder="0"
                            onChange={(e) => setAlloc(c.id, l.key, Number(e.target.value) || 0)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>
          ) : (
            <Card className="p-4 md:p-5">
              <SectionTitle icon={Truck} title="Quantity based receiving" />
              <p className="text-xs text-muted-foreground mt-2">
                Kono carton allocation lagbe na. Total <span className="font-semibold tabular-nums">{totalUnits}</span> pcs order hocche.
                BD te arrive korar por PO detail page theke joto piece dorkar toto release kore stock e nite parben (partial release supported).
              </p>
            </Card>
          )}

          {/* Initial payment */}
          <Card className="p-4 md:p-5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <SectionTitle icon={Wallet} title="Advance payment (optional)" />
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={payEnabled} onChange={(e) => setPayEnabled(e.target.checked)} className="rounded" />
                Pay supplier advance now
              </label>
            </div>
            {payEnabled && (
              <div className="grid md:grid-cols-2 gap-4 mt-3">
                <AmountPercentInput
                  total={productSubtotalBdt}
                  amount={payAmount}
                  onChange={setPayAmount}
                  label={`Amount (BDT) — of ${fmtBdt(productSubtotalBdt)} subtotal`}
                />
                <div className="space-y-1.5">
                  <Label className="text-xs">Wallet</Label>
                  <Select value={payWalletId} onValueChange={setPayWalletId}>
                    <SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger>
                    <SelectContent>
                      {wallets.filter((w) => w.is_active).map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.name} ({fmtBdt(w.current_balance)})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {walletAfter !== null && (
                    <div className={`text-[11px] ${walletAfter < 0 ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                      After: {fmtBdt(walletAfter)}{walletAfter < 0 ? " ⚠ negative" : ""}
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Reference</Label>
                  <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Optional" />
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Sticky sidebar */}
        <div className="lg:sticky lg:top-24 space-y-3">
          <Card className="p-4 bg-gradient-to-br from-primary/5 to-card border-primary/20">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Grand total</div>
            <div className="text-2xl font-bold tabular-nums">{fmtBdt(productSubtotalBdt)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{productSubtotalForeign.toFixed(2)} {currency} @ {fxRate}</div>
          </Card>

          <Card className="p-4 space-y-2.5 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Summary</div>
            <SideRow label="Supplier" value={supplierId ? ((suppliers as any[]).find((s) => s.id === supplierId)?.name ?? "—") : <span className="text-muted-foreground italic">None</span>} />
            <SideRow label="Order date" value={orderDate} />
            <SideRow label="Currency" value={`${currency} @ ${fxRate}`} />
            <div className="border-t border-border my-2" />
            <SideRow label="Items" value={`${items.length}`} />
            <SideRow label="Total units" value={totalUnits.toLocaleString()} />
            <SideRow label="Cartons" value={`${cartons.length}`} />
            <SideRow label="Total weight" value={`${totalCartonWeight.toFixed(1)} kg`} />
            <div className="border-t border-border my-2" />
            <SideRow label="Subtotal" value={fmtBdt(productSubtotalBdt)} bold />
            {payEnabled && payAmount > 0 && (
              <>
                <SideRow label="Advance" value={`− ${fmtBdt(payAmount)}`} accent="text-emerald-600" />
                <SideRow label="Due after" value={fmtBdt(Math.max(0, productSubtotalBdt - payAmount))} bold accent={productSubtotalBdt - payAmount > 0 ? "text-orange-600" : "text-emerald-600"} />
              </>
            )}
          </Card>

          {reconciliationErrors.length > 0 && (
            <Card className="p-3 border-orange-500/30 bg-orange-500/5">
              <div className="flex items-start gap-2 text-xs">
                <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-orange-700 dark:text-orange-300 mb-1">Carton mismatch</div>
                  <div className="text-orange-700/80 dark:text-orange-400/80">Fix carton allocations before submit.</div>
                </div>
              </div>
            </Card>
          )}

          <Button size="lg" className="w-full" disabled={!canSubmit} onClick={() => submitMut.mutate()}>
            {submitMut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</> : <><Save className="h-4 w-4 mr-2" />Create Purchase Order</>}
          </Button>

          <Card className="p-3 text-[11px] text-muted-foreground leading-relaxed">
            <div className="font-semibold text-foreground mb-1 text-xs">Tips</div>
            <ul className="space-y-1 list-disc ml-4">
              <li>Item picker theke existing product link koro, qty inventory-te "Incoming" hisebe dekhabe.</li>
              <li>Auto-split items kore cartons-e shoman ke distribute kore.</li>
              <li>Percent box-e type korle amount auto fillup hobe.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SideRow({ label, value, bold, accent }: { label: string; value: React.ReactNode; bold?: boolean; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-sm tabular-nums text-right truncate", bold && "font-bold", accent)}>{value}</span>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: any; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      <h3 className="font-semibold">{title}</h3>
    </div>
  );
}

function ImportColorAllocator({
  productId, allocations, onChange, onVariantsLoaded,
}: {
  productId: string;
  allocations?: Record<string, number>;
  onChange: (a: Record<string, number>) => void;
  onVariantsLoaded?: (variants: VariantMeta[]) => void;
}) {
  const { data: variants = [], isLoading } = useQuery({
    queryKey: ["product-variants-active", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id,color_name,color_hex,image,stock,sku")
        .eq("product_id", productId)
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  useEffect(() => {
    if (variants.length > 0) onVariantsLoaded?.(variants as VariantMeta[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants]);

  if (isLoading || variants.length === 0) return null;

  const set = (vid: string, qty: number) => {
    const next: Record<string, number> = { ...(allocations ?? {}) };
    if (qty > 0) next[vid] = qty;
    else delete next[vid];
    onChange(next);
  };

  const totalAlloc = Object.values(allocations ?? {}).reduce((s: number, n: number) => s + n, 0);

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-2.5 space-y-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground">
          <Palette className="h-3.5 w-3.5" />
          Allocate by color
        </span>
        {totalAlloc > 0 && <Badge variant="secondary" className="tabular-nums">Total: {totalAlloc}</Badge>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {variants.map((v: any) => {
          const cur = allocations?.[v.id] ?? 0;
          const label = v.color_name || v.sku || `Variant ${v.id.slice(0, 4)}`;
          return (
            <div
              key={v.id}
              className={cn(
                "flex items-center gap-2 rounded-md border bg-card/70 p-1.5 transition",
                cur > 0 && "ring-1 ring-primary/50 border-primary/40",
              )}
            >
              <div className="h-8 w-8 rounded shrink-0 border" style={{ background: v.color_hex || "#e5e7eb" }} />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{label}</div>
                <div className="text-[10px] text-muted-foreground tabular-nums">Stock: {v.stock ?? 0}</div>
              </div>
              <Input
                type="number"
                min={0}
                value={cur || ""}
                placeholder="0"
                onChange={(e) => set(v.id, Math.max(0, Number(e.target.value) || 0))}
                className="h-7 w-14 text-xs text-center tabular-nums"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}