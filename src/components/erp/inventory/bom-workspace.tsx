import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Copy, CheckCircle2, GitCompare, Boxes, Puzzle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { fetchAllRows } from "@/lib/erp/fetch-all-rows";
import { PRODUCT_KINDS, bomMaterialCost, maxBuildable, marginPct, requiredPerUnit, lineUnitCost } from "@/lib/erp/bom";
import { fmtBdt } from "@/lib/erp/imports/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type P = {
  id: string; title: string; sku: string | null; price: number; stock: number;
  available_stock: number | null; weighted_avg_cost: number | null; cost_price: number | null;
  product_kind: string; brand_id: string | null; reorder_point: number | null; is_active: boolean;
  purchase_unit: string | null; unit_conversion: number | null; lead_time_days: number | null;
  default_supplier_id: string | null; stock_location: string | null; reserved_stock: number | null;
  product_variants: Array<{ id: string; sku: string | null; color_name: string | null; stock: number; available_stock: number | null; weighted_avg_cost: number | null; is_active: boolean }>;
};

const SEL = "id,title,sku,price,stock,available_stock,reserved_stock,weighted_avg_cost,cost_price,product_kind,brand_id,reorder_point,is_active,purchase_unit,unit_conversion,lead_time_days,default_supplier_id,stock_location,product_variants(id,sku,color_name,stock,available_stock,weighted_avg_cost,is_active)";

const unitCost = (p: { weighted_avg_cost: number | null; cost_price?: number | null }) =>
  Number(p.weighted_avg_cost || p.cost_price || 0);

function useAllProducts(brandIds: string[]) {
  return useQuery({
    queryKey: ["bom-products", brandIds.join(",")],
    enabled: brandIds.length > 0,
    queryFn: async () =>
      fetchAllRows<P>((f, t) =>
        applyBrandScope(supabase.from("products").select(SEL), brandIds, "brand_id", { includeNull: true })
          .order("title").range(f, t) as any),
  });
}

export function BomWorkspace() {
  const { brandIds } = useBrand();
  const products = useAllProducts(brandIds);
  const [view, setView] = useState<"components" | "bom">("components");
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
        <Button size="sm" variant={view === "components" ? "default" : "ghost"} onClick={() => setView("components")}><Puzzle className="h-3.5 w-3.5 mr-1.5" />Components</Button>
        <Button size="sm" variant={view === "bom" ? "default" : "ghost"} onClick={() => setView("bom")}><Boxes className="h-3.5 w-3.5 mr-1.5" />BOM Manager</Button>
      </div>
      {products.isLoading ? <div className="text-sm text-muted-foreground p-6">Loading…</div>
        : products.error ? <div className="text-sm text-destructive p-6">{String((products.error as Error).message)}</div>
        : view === "components" ? <ComponentsView rows={products.data ?? []} />
        : <BomManager rows={products.data ?? []} />}
    </div>
  );
}

/* ---------------- Components ---------------- */

function ComponentsView({ rows }: { rows: P[] }) {
  const qc = useQueryClient();
  const { brandIds } = useBrand();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<P | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [markOpen, setMarkOpen] = useState(false);
  const suppliers = useQuery({
    queryKey: ["bom-suppliers", brandIds.join(",")],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      const { data, error } = await applyBrandScope(supabase.from("erp_suppliers").select("id,name").eq("is_active", true).order("name"), brandIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const supName = (id: string | null) => suppliers.data?.find((s) => s.id === id)?.name ?? "—";
  const comps = rows.filter((r) => r.product_kind === "component" && (!q || `${r.title} ${r.sku ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const totalValue = comps.reduce((s, c) => s + unitCost(c) * Number(c.stock || 0), 0);
  const refresh = () => qc.invalidateQueries({ queryKey: ["bom-products"] });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search component / SKU" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs h-9" />
        <div className="text-xs text-muted-foreground">{comps.length} components · value {fmtBdt(totalValue)}</div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setMarkOpen(true)}>Mark existing product</Button>
          <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" />New component</Button>
        </div>
      </div>
      <div className="rounded-xl border border-border overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Component</TableHead><TableHead>Supplier</TableHead>
            <TableHead className="text-right">On hand</TableHead><TableHead className="text-right">Reserved</TableHead>
            <TableHead className="text-right">Available</TableHead><TableHead className="text-right">Unit cost</TableHead>
            <TableHead className="text-right">Value</TableHead><TableHead className="text-right">Reorder</TableHead>
            <TableHead>Status</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {comps.length === 0 && <TableRow><TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-10">No components yet. Create one or mark an existing product as a component.</TableCell></TableRow>}
            {comps.map((c) => {
              const avail = c.available_stock ?? c.stock - Number(c.reserved_stock || 0);
              const rp = Number(c.reorder_point || 0);
              const status = c.stock <= 0 ? { l: "Out", t: "destructive" as const } : rp > 0 && avail <= rp ? { l: "Reorder", t: "secondary" as const } : { l: "OK", t: "outline" as const };
              return (
                <TableRow key={c.id}>
                  <TableCell><div className="font-medium text-sm">{c.title}</div><div className="text-[11px] text-muted-foreground">{c.sku ?? "no SKU"}{c.brand_id ? "" : " · Shared"}{c.product_variants.length ? ` · ${c.product_variants.length} variants` : ""}</div></TableCell>
                  <TableCell className="text-xs">{supName(c.default_supplier_id)}{c.lead_time_days ? <span className="text-muted-foreground"> · {c.lead_time_days}d</span> : null}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.stock}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.reserved_stock ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{avail}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBdt(unitCost(c))}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBdt(unitCost(c) * c.stock)}</TableCell>
                  <TableCell className="text-right tabular-nums">{rp || "—"}</TableCell>
                  <TableCell><Badge variant={status.t}>{c.is_active ? status.l : "Inactive"}</Badge></TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={() => setEdit(c)}>Edit</Button></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-[11px] text-muted-foreground">Component stock uses the same stock ledger — receive via Local/Import PO, adjust via Stock List. Components are hidden from the storefront.</p>
      {edit && <ComponentDialog row={edit} suppliers={suppliers.data ?? []} onClose={() => setEdit(null)} onSaved={refresh} />}
      {newOpen && <ComponentDialog row={null} suppliers={suppliers.data ?? []} onClose={() => setNewOpen(false)} onSaved={refresh} />}
      {markOpen && <MarkDialog rows={rows.filter((r) => r.product_kind !== "component")} onClose={() => setMarkOpen(false)} onSaved={refresh} />}
    </div>
  );
}

function ComponentDialog({ row, suppliers, onClose, onSaved }: { row: P | null; suppliers: Array<{ id: string; name: string }>; onClose: () => void; onSaved: () => void }) {
  const { activeBrand, isAllBrands } = useBrand();
  const [f, setF] = useState({
    title: row?.title ?? "", sku: row?.sku ?? "", shared: row ? row.brand_id == null : false,
    purchase_unit: row?.purchase_unit ?? "pcs", unit_conversion: String(row?.unit_conversion ?? 1),
    lead_time_days: row?.lead_time_days != null ? String(row.lead_time_days) : "",
    default_supplier_id: row?.default_supplier_id ?? "", stock_location: row?.stock_location ?? "",
    reorder_point: row?.reorder_point != null ? String(row.reorder_point) : "",
    cost_price: row ? String(row.cost_price ?? "") : "", is_active: row?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: any) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    if (!f.title.trim()) return toast.error("Name required");
    if (!row && !f.shared && (isAllBrands || !activeBrand)) return toast.error("Select a brand or mark as Shared");
    setBusy(true);
    const patch: any = {
      title: f.title.trim(), sku: f.sku.trim() || null, purchase_unit: f.purchase_unit || null,
      unit_conversion: Number(f.unit_conversion) || 1, lead_time_days: f.lead_time_days ? Number(f.lead_time_days) : null,
      default_supplier_id: f.default_supplier_id || null, stock_location: f.stock_location || null,
      reorder_point: f.reorder_point ? Number(f.reorder_point) : null, is_active: f.is_active,
      product_kind: "component",
    };
    let error;
    if (row) {
      // cost_price only set when empty — never overwrite existing purchase costs silently
      if (f.cost_price && !row.cost_price) patch.cost_price = Number(f.cost_price);
      ({ error } = await supabase.from("products").update(patch).eq("id", row.id));
    } else {
      const slug = `cmp-${f.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Math.random().toString(36).slice(2, 6)}`;
      ({ error } = await supabase.from("products").insert({
        ...patch, slug, price: 0, image: "", stock: 0,
        brand_id: f.shared ? null : activeBrand!.id,
        cost_price: f.cost_price ? Number(f.cost_price) : null,
      }));
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Component saved");
    onSaved(); onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{row ? "Edit component" : "New component"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Name</Label><Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Premium Tube Box - Blue" /></div>
          <div><Label>SKU</Label><Input value={f.sku} onChange={(e) => set("sku", e.target.value)} /></div>
          <div><Label>Supplier</Label>
            <Select value={f.default_supplier_id || "none"} onValueChange={(v) => set("default_supplier_id", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">—</SelectItem>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label>Purchase unit</Label><Input value={f.purchase_unit} onChange={(e) => set("purchase_unit", e.target.value)} placeholder="pcs / box / dozen" /></div>
          <div><Label>Pcs per purchase unit</Label><Input type="number" value={f.unit_conversion} onChange={(e) => set("unit_conversion", e.target.value)} /></div>
          <div><Label>Lead time (days)</Label><Input type="number" value={f.lead_time_days} onChange={(e) => set("lead_time_days", e.target.value)} /></div>
          <div><Label>Reorder point</Label><Input type="number" value={f.reorder_point} onChange={(e) => set("reorder_point", e.target.value)} /></div>
          <div><Label>Stock location</Label><Input value={f.stock_location} onChange={(e) => set("stock_location", e.target.value)} /></div>
          <div><Label>Estimated cost</Label><Input type="number" value={f.cost_price} disabled={!!row?.cost_price} onChange={(e) => set("cost_price", e.target.value)} placeholder="BDT" /></div>
          {!row && <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.shared} onChange={(e) => set("shared", e.target.checked)} /> Shared across brands</label>}
          <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Active</label>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MarkDialog({ rows, onClose, onSaved }: { rows: P[]; onClose: () => void; onSaved: () => void }) {
  const [q, setQ] = useState("");
  const list = rows.filter((r) => !q || `${r.title} ${r.sku ?? ""}`.toLowerCase().includes(q.toLowerCase())).slice(0, 50);
  const [kind, setKind] = useState("component");
  const mark = async (id: string) => {
    const { error } = await supabase.from("products").update({ product_kind: kind } as any).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Updated"); onSaved();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Set product type</DialogTitle></DialogHeader>
        <div className="flex gap-2">
          <Input placeholder="Search product" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select value={kind} onValueChange={setKind}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{PRODUCT_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-border">
          {list.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-2 text-sm">
              <div><div>{r.title}</div><div className="text-[11px] text-muted-foreground">{r.sku ?? ""} · {r.product_kind}</div></div>
              <Button size="sm" variant="outline" onClick={() => mark(r.id)}>Set</Button>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">Component type hides the product from the storefront.</p>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- BOM Manager ---------------- */

type Header = { id: string; product_id: string; variant_id: string | null; version: number; status: string; effective_date: string | null; wastage_pct: number; notes: string | null; brand_id: string | null };
type Line = { id: string; bom_id: string; component_product_id: string; component_variant_id: string | null; quantity: number; uom: string; est_unit_cost: number | null; display_order: number };

function BomManager({ rows }: { rows: P[] }) {
  const qc = useQueryClient();
  const finished = rows.filter((r) => r.product_kind === "assembled" || r.product_kind === "bundle");
  const components = rows.filter((r) => r.product_kind === "component");
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const [productId, setProductId] = useState<string>("");
  const [variantId, setVariantId] = useState<string>("none");
  const product = productId ? byId.get(productId) : undefined;
  const vId = variantId === "none" ? null : variantId;

  const headers = useQuery({
    queryKey: ["bom-headers", productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("bom_headers").select("*").eq("product_id", productId).order("version", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Header[];
    },
  });
  const forVariant = (headers.data ?? []).filter((h) => h.variant_id === vId);
  const [selId, setSelId] = useState<string>("");
  const sel = forVariant.find((h) => h.id === selId) ?? forVariant.find((h) => h.status === "active") ?? forVariant[0];
  const [compareId, setCompareId] = useState<string>("");

  const lines = useQuery({
    queryKey: ["bom-lines", sel?.id, compareId],
    enabled: !!sel,
    queryFn: async () => {
      const ids = [sel!.id, compareId].filter(Boolean);
      const { data, error } = await (supabase as any).from("bom_lines").select("*").in("bom_id", ids).order("display_order");
      if (error) throw error;
      return (data ?? []) as Line[];
    },
  });
  const cur = (lines.data ?? []).filter((l) => l.bom_id === sel?.id);
  const cmp = (lines.data ?? []).filter((l) => l.bom_id === compareId);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["bom-headers"] }); qc.invalidateQueries({ queryKey: ["bom-lines"] }); };

  const compInfo = (l: Line) => {
    const p = byId.get(l.component_product_id);
    const v = l.component_variant_id ? p?.product_variants.find((x) => x.id === l.component_variant_id) : undefined;
    const available = v ? Number(v.available_stock ?? v.stock) : Number(p?.available_stock ?? p?.stock ?? 0);
    const cost = v ? Number(v.weighted_avg_cost || 0) || unitCost(p ?? { weighted_avg_cost: 0 }) : unitCost(p ?? { weighted_avg_cost: 0 });
    return { p, v, available, cost };
  };
  const calc = cur.map((l) => { const i = compInfo(l); return { quantity: Number(l.quantity), est_unit_cost: l.est_unit_cost, current_cost: i.cost, available: i.available }; });
  const wastage = Number(sel?.wastage_pct ?? 0);
  const matCost = bomMaterialCost(calc, wastage);
  const buildable = maxBuildable(calc, wastage);
  const price = Number(product?.price ?? 0);
  const editable = sel?.status === "draft";

  const newVersion = async (cloneFrom?: Header) => {
    if (!product) return;
    const maxV = forVariant.reduce((m, h) => Math.max(m, h.version), 0);
    const { data: h, error } = await (supabase as any).from("bom_headers").insert({
      product_id: product.id, variant_id: vId, brand_id: product.brand_id, version: maxV + 1,
      status: "draft", wastage_pct: cloneFrom?.wastage_pct ?? 0,
    }).select("*").single();
    if (error) return toast.error(error.message);
    if (cloneFrom) {
      const { data: src } = await (supabase as any).from("bom_lines").select("*").eq("bom_id", cloneFrom.id);
      if (src?.length) {
        const { error: e2 } = await (supabase as any).from("bom_lines").insert(src.map((l: Line) => ({
          bom_id: h.id, component_product_id: l.component_product_id, component_variant_id: l.component_variant_id,
          quantity: l.quantity, uom: l.uom, est_unit_cost: l.est_unit_cost, display_order: l.display_order,
        })));
        if (e2) return toast.error(e2.message);
      }
    }
    setSelId(h.id); refresh(); toast.success(`Draft v${h.version} created`);
  };
  const activate = async () => {
    const { error } = await (supabase as any).rpc("bom_activate", { _bom_id: sel!.id });
    if (error) return toast.error(error.message);
    refresh(); toast.success("BOM activated — previous version archived");
  };
  const patchHeader = async (patch: Partial<Header>) => {
    const { error } = await (supabase as any).from("bom_headers").update(patch).eq("id", sel!.id);
    if (error) return toast.error(error.message);
    refresh();
  };
  const addLine = async (compId: string) => {
    const [pid, vid] = compId.split("|");
    const { error } = await (supabase as any).from("bom_lines").insert({ bom_id: sel!.id, component_product_id: pid, component_variant_id: vid || null, quantity: 1, display_order: cur.length });
    if (error) return toast.error(error.message);
    refresh();
  };
  const updLine = async (id: string, patch: Partial<Line>) => {
    const { error } = await (supabase as any).from("bom_lines").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };
  const delLine = async (id: string) => {
    const { error } = await (supabase as any).from("bom_lines").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };

  // Other variants' active BOMs for "clone from variant"
  const otherBoms = (headers.data ?? []).filter((h) => h.variant_id !== vId && h.status !== "archived");
  const compOptions = components.flatMap((c) => c.product_variants.length
    ? c.product_variants.filter((v) => v.is_active).map((v) => ({ key: `${c.id}|${v.id}`, label: `${c.title} · ${v.color_name ?? v.sku ?? "variant"}` }))
    : [{ key: `${c.id}|`, label: `${c.title}${c.sku ? ` (${c.sku})` : ""}` }]);

  if (finished.length === 0) {
    return <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No Assembled or Bundle products yet. Use Components → "Mark existing product" to set a product's type to Assembled.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="min-w-64"><Label className="text-xs">Finished product</Label>
          <Select value={productId} onValueChange={(v) => { setProductId(v); setVariantId("none"); setSelId(""); setCompareId(""); }}>
            <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
            <SelectContent>{finished.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}</SelectContent>
          </Select></div>
        {product && product.product_variants.length > 0 && (
          <div className="min-w-48"><Label className="text-xs">Variant</Label>
            <Select value={variantId} onValueChange={(v) => { setVariantId(v); setSelId(""); setCompareId(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">All variants (product-level)</SelectItem>
                {product.product_variants.map((v) => <SelectItem key={v.id} value={v.id}>{v.color_name ?? v.sku ?? v.id.slice(0, 6)}</SelectItem>)}</SelectContent>
            </Select></div>
        )}
        {product && <Button size="sm" variant="outline" onClick={() => newVersion(sel)}><Plus className="h-3.5 w-3.5 mr-1" />{sel ? "New version (copy)" : "Create BOM"}</Button>}
        {product && otherBoms.length > 0 && (
          <Select value="" onValueChange={(id) => newVersion(otherBoms.find((h) => h.id === id))}>
            <SelectTrigger className="w-52 h-9"><Copy className="h-3.5 w-3.5 mr-1" /><SelectValue placeholder="Clone from variant" /></SelectTrigger>
            <SelectContent>{otherBoms.map((h) => {
              const vn = product.product_variants.find((v) => v.id === h.variant_id);
              return <SelectItem key={h.id} value={h.id}>{vn?.color_name ?? "Product-level"} · v{h.version}</SelectItem>;
            })}</SelectContent>
          </Select>
        )}
      </div>

      {product && forVariant.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {forVariant.map((h) => (
            <button key={h.id} onClick={() => setSelId(h.id)} className={cn("rounded-full border px-3 py-1 text-xs", h.id === sel?.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
              v{h.version} · {h.status}
            </button>
          ))}
        </div>
      )}

      {sel && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Kpi label="Material cost / unit" value={fmtBdt(matCost)} />
            <Kpi label="Selling price" value={fmtBdt(price)} />
            <Kpi label="Est. margin" value={`${marginPct(price, matCost).toFixed(1)}%`} tone={price - matCost >= 0 ? "pos" : "neg"} />
            <Kpi label="Max buildable" value={String(buildable)} />
            <Kpi label="Missing components" value={String(calc.filter((c) => c.available < requiredPerUnit(c.quantity, wastage)).length)} tone={calc.some((c) => c.available < requiredPerUnit(c.quantity, wastage)) ? "neg" : undefined} />
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant={sel.status === "active" ? "default" : "outline"}>{sel.status}</Badge>
            {sel.effective_date && <span className="text-xs text-muted-foreground">Effective {sel.effective_date}</span>}
            <span className="text-xs">Wastage %</span>
            <Input type="number" className="w-20 h-8" defaultValue={sel.wastage_pct} disabled={!editable} key={sel.id} onBlur={(e) => patchHeader({ wastage_pct: Number(e.target.value) || 0 })} />
            {editable && <Button size="sm" onClick={activate}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Activate</Button>}
            {forVariant.length > 1 && (
              <Select value={compareId || "none"} onValueChange={(v) => setCompareId(v === "none" ? "" : v)}>
                <SelectTrigger className="w-44 h-8"><GitCompare className="h-3.5 w-3.5 mr-1" /><SelectValue placeholder="Compare with" /></SelectTrigger>
                <SelectContent><SelectItem value="none">No compare</SelectItem>{forVariant.filter((h) => h.id !== sel.id).map((h) => <SelectItem key={h.id} value={h.id}>v{h.version} · {h.status}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {!editable && <span className="text-[11px] text-muted-foreground">Active/archived versions are locked — create a new version to change.</span>}
          </div>

          <div className="rounded-xl border border-border overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Component</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>UoM</TableHead>
                <TableHead className="text-right">Est. unit cost</TableHead><TableHead className="text-right">Line cost</TableHead>
                <TableHead className="text-right">Available</TableHead>{compareId && <TableHead className="text-right">Compare qty</TableHead>}<TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {cur.map((l, i) => {
                  const info = compInfo(l);
                  const need = requiredPerUnit(Number(l.quantity), wastage);
                  const other = cmp.find((c) => c.component_product_id === l.component_product_id && c.component_variant_id === l.component_variant_id);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="text-sm">{info.p?.title ?? "?"}{info.v ? <span className="text-muted-foreground"> · {info.v.color_name ?? info.v.sku}</span> : null}</TableCell>
                      <TableCell className="text-right"><Input type="number" className="w-20 h-8 ml-auto text-right" defaultValue={l.quantity} disabled={!editable} onBlur={(e) => Number(e.target.value) > 0 && updLine(l.id, { quantity: Number(e.target.value) })} /></TableCell>
                      <TableCell><Input className="w-16 h-8" defaultValue={l.uom} disabled={!editable} onBlur={(e) => updLine(l.id, { uom: e.target.value || "pcs" })} /></TableCell>
                      <TableCell className="text-right"><Input type="number" className="w-24 h-8 ml-auto text-right" defaultValue={l.est_unit_cost ?? ""} placeholder={String(info.cost || "")} disabled={!editable} onBlur={(e) => updLine(l.id, { est_unit_cost: e.target.value ? Number(e.target.value) : null })} /></TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBdt(need * lineUnitCost(calc[i]))}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", info.available < need && "text-destructive font-medium")}>{info.available}</TableCell>
                      {compareId && <TableCell className={cn("text-right tabular-nums", (other?.quantity ?? 0) !== Number(l.quantity) && "text-amber-600")}>{other ? other.quantity : "—"}</TableCell>}
                      <TableCell>{editable && <Button size="icon" variant="ghost" onClick={() => delLine(l.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}</TableCell>
                    </TableRow>
                  );
                })}
                {compareId && cmp.filter((c) => !cur.some((l) => l.component_product_id === c.component_product_id && l.component_variant_id === c.component_variant_id)).map((c) => (
                  <TableRow key={c.id} className="opacity-60"><TableCell className="text-sm line-through">{byId.get(c.component_product_id)?.title}</TableCell><TableCell colSpan={5} className="text-xs">only in compared version</TableCell><TableCell className="text-right">{c.quantity}</TableCell><TableCell /></TableRow>
                ))}
                {cur.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">No components in this BOM.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          {editable && (
            <Select value="" onValueChange={addLine}>
              <SelectTrigger className="w-80"><Plus className="h-3.5 w-3.5 mr-1" /><SelectValue placeholder={compOptions.length ? "Add component" : "No components — create in Components tab"} /></SelectTrigger>
              <SelectContent>{compOptions.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </>
      )}
      {product && forVariant.length === 0 && <div className="text-sm text-muted-foreground">No BOM for this {vId ? "variant" : "product"} yet.</div>}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-semibold tabular-nums", tone === "pos" && "text-primary", tone === "neg" && "text-destructive")}>{value}</div>
    </div>
  );
}
