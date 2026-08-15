import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Wand2, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchExistingSkus } from "@/hooks/erp/use-products-catalog";
import { skuPreview, type CatalogProduct, type SkuStyle } from "@/lib/erp/product-catalog";

type Props = {
  products: CatalogProduct[];
  brandName: (id: string | null) => string;
  catName: (id: string | null) => string;
  onClose: () => void;
};

const STYLES: Array<{ value: SkuStyle; label: string; hint: string }> = [
  { value: "brand-title-seq", label: "Brand · Title · No.", hint: "TOY-ROLAU-0001" },
  { value: "brand-cat-seq", label: "Brand · Category · No.", hint: "TOY-CAR-0001" },
  { value: "title-seq", label: "Title · No.", hint: "ROLAU-0001" },
  { value: "compact", label: "Compact", hint: "TOYROLAU0001" },
];

export function SkuGeneratorDialog({ products, brandName, catName, onClose }: Props) {
  const qc = useQueryClient();
  const [style, setStyle] = useState<SkuStyle>("brand-title-seq");
  const [separator, setSeparator] = useState("-");
  const [pad, setPad] = useState(4);
  const [start, setStart] = useState(1);
  const [overwrite, setOverwrite] = useState(false);
  const [taken, setTaken] = useState<Set<string>>(new Set());

  useEffect(() => { fetchExistingSkus().then(setTaken).catch(() => setTaken(new Set())); }, []);

  const targets = useMemo(
    () => products.filter((p) => overwrite || !p.sku || p.sku.trim() === ""),
    [products, overwrite],
  );

  const preview = useMemo(() => {
    const used = new Set(taken);
    let seq = start;
    return targets.map((p) => {
      let sku = "";
      for (let guard = 0; guard < 5000; guard++) {
        sku = skuPreview({ style, brandName: brandName(p.brand_id), categoryName: catName(p.category_id), title: p.title, seq, separator, pad });
        seq += 1;
        if (!used.has(sku.toUpperCase())) break;
      }
      used.add(sku.toUpperCase());
      return { product: p, sku };
    });
  }, [targets, style, separator, pad, start, taken, brandName, catName]);

  const apply = useMutation({
    mutationFn: async () => {
      let ok = 0;
      const fails: string[] = [];
      for (const row of preview) {
        const { error } = await supabase.from("products").update({ sku: row.sku }).eq("id", row.product.id);
        if (error) fails.push(`${row.product.title}: ${error.message}`); else ok += 1;
      }
      return { ok, fails };
    },
    onSuccess: ({ ok, fails }) => {
      qc.invalidateQueries({ queryKey: ["products-catalog"] });
      qc.invalidateQueries({ queryKey: ["products-catalog-stats"] });
      if (fails.length) toast.warning(`${ok} SKU set, ${fails.length} failed`, { description: fails[0] });
      else toast.success(`${ok} SKU generate হয়েছে`);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wand2 className="h-4 w-4 text-violet-500" /> SKU Generator</DialogTitle>
          <DialogDescription>Pattern বেছে নাও — unique SKU auto তৈরি হবে ({products.length} product selected)।</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Pattern</Label>
            <Select value={style} onValueChange={(v) => setStyle(v as SkuStyle)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STYLES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    <span className="flex items-center gap-2">{s.label}<span className="text-xs text-muted-foreground font-mono">{s.hint}</span></span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Separator</Label>
            <Input value={separator} maxLength={2} onChange={(e) => setSeparator(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Digits</Label>
            <Input type="number" min={2} max={8} value={pad} onChange={(e) => setPad(Math.min(8, Math.max(2, Number(e.target.value) || 4)))} />
          </div>
          <div className="space-y-1.5">
            <Label>Start no.</Label>
            <Input type="number" min={1} value={start} onChange={(e) => setStart(Math.max(1, Number(e.target.value) || 1))} />
          </div>
          <div className="sm:col-span-3 flex items-end gap-2 pb-1">
            <Switch id="ow" checked={overwrite} onCheckedChange={setOverwrite} />
            <Label htmlFor="ow" className="cursor-pointer">যাদের SKU আছে তাদেরও overwrite করো</Label>
          </div>
        </div>

        <div className="rounded-lg border">
          <div className="flex items-center justify-between border-b px-3 py-2 text-sm">
            <span className="font-medium">Preview</span>
            <Badge variant="secondary">{preview.length} will change</Badge>
          </div>
          <ScrollArea className="h-64">
            <div className="divide-y">
              {preview.map((r) => (
                <div key={r.product.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate">{r.product.title}</div>
                    <div className="text-xs text-muted-foreground">{brandName(r.product.brand_id)} · {r.product.sku || "no SKU"}</div>
                  </div>
                  <code className="shrink-0 rounded bg-violet-50 px-2 py-1 font-mono text-xs text-violet-700 dark:bg-violet-950 dark:text-violet-300">{r.sku}</code>
                </div>
              ))}
              {preview.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">সবার SKU আছে — overwrite চালু করো নাহলে কিছু হবে না।</div>}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={preview.length === 0 || apply.isPending} onClick={() => apply.mutate()}>
            {apply.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Apply {preview.length} SKU
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
