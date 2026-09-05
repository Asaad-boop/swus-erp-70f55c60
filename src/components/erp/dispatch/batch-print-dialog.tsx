import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Printer, Boxes, PackageCheck, Barcode, FileText, Truck } from "lucide-react";
import { PrintableInvoice } from "@/components/erp/orders/order-invoice";
import { PackSheet, PickSheet, DEFAULT_SHEET_OPTIONS, type SheetOptions, type SheetOrder } from "./pack-pick-sheet";
import { PickupManifestPrint } from "./pickup-manifest-print";
import { markOrdersPrinted } from "@/lib/erp/mark-printed";
import { useQueryClient } from "@tanstack/react-query";
import { useBrand } from "@/contexts/brand-context";
import { cn } from "@/lib/utils";

type OrderRow = SheetOrder;

type Mode = "invoice" | "picking" | "manifest" | "both";

type SheetKind = "order" | "product" | "sku";

const SHEETS: Array<{ key: SheetKind; label: string; hint: string; icon: typeof Boxes }> = [
  { key: "order", label: "Order-wise", hint: "Pack list — প্রতি অর্ডারের শিট", icon: PackageCheck },
  { key: "product", label: "Product-wise", hint: "Picking list — প্রোডাক্ট ধরে তোলা", icon: Boxes },
  { key: "sku", label: "SKU-wise", hint: "শুধু SKU + মোট পিস", icon: Barcode },
];

export function BatchPrintDialog({
  open,
  onClose,
  orders,
  onPrinted,
  initialMode,
}: {
  open: boolean;
  onClose: () => void;
  orders: OrderRow[];
  onPrinted?: (count: number, mode: Mode) => void;
  initialMode?: Mode;
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>(
    () => Object.fromEntries(orders.map((o) => [o.id, true])),
  );
  const [sheets, setSheets] = useState<Record<SheetKind, boolean>>({ order: true, product: false, sku: false });
  const [withInvoices, setWithInvoices] = useState(false);
  const [withManifest, setWithManifest] = useState(false);
  const [opts, setOpts] = useState<SheetOptions>(DEFAULT_SHEET_OPTIONS);
  const [splitBrand, setSplitBrand] = useState(true);

  const { brands } = useBrand();

  useEffect(() => {
    setSelected(Object.fromEntries(orders.map((o) => [o.id, true])));
  }, [orders]);

  useEffect(() => {
    if (!initialMode) return;
    setSheets({ order: initialMode === "picking" ? false : true, product: initialMode === "picking" || initialMode === "both", sku: false });
    setWithInvoices(initialMode === "invoice" || initialMode === "both");
    setWithManifest(initialMode === "manifest");
    if (initialMode === "manifest" || initialMode === "invoice") setSheets({ order: false, product: false, sku: false });
  }, [initialMode, open]);

  const chosen = useMemo(() => orders.filter((o) => selected[o.id]), [orders, selected]);
  const qc = useQueryClient();

  const brandName = (id: string | null | undefined) =>
    brands.find((b) => b.id === id)?.name ?? (id ? "Unknown brand" : "Unbranded");

  const brandGroups = useMemo(() => {
    if (!splitBrand) return [{ key: "__all__", name: null as string | null, orders: chosen }];
    const m = new Map<string, OrderRow[]>();
    for (const o of chosen) {
      const k = o.brand_id ?? "__none__";
      m.set(k, [...(m.get(k) ?? []), o]);
    }
    const arr = Array.from(m.entries()).map(([k, list]) => ({
      key: k,
      name: m.size > 1 ? brandName(k === "__none__" ? null : k) : null,
      orders: list,
    }));
    return arr.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [chosen, splitBrand, brands]);

  const anySheet = sheets.order || sheets.product || sheets.sku;
  const canPrint = chosen.length > 0 && (anySheet || withInvoices || withManifest);

  function toggle(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }
  function toggleAll(v: boolean) {
    setSelected(Object.fromEntries(orders.map((o) => [o.id, v])));
  }

  function doPrint() {
    const mode: Mode = sheets.order || sheets.product || sheets.sku ? (withInvoices ? "both" : "picking") : withManifest ? "manifest" : "invoice";
    setTimeout(() => {
      window.print();
      void markOrdersPrinted(chosen.map((o) => o.id)).then(() => {
        qc.invalidateQueries({ queryKey: ["orders"] });
      });
      onPrinted?.(chosen.length, mode);
    }, 50);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pack &amp; Pick — Print</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* sheet modes */}
          <div>
            <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">Sheets</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SHEETS.map((s) => {
                const active = sheets[s.key];
                const Icon = s.icon;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSheets((v) => ({ ...v, [s.key]: !v[s.key] }))}
                    className={cn(
                      "text-left rounded-xl border px-3 py-2.5 transition-colors",
                      active ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                      <span className="text-sm font-semibold">{s.label}</span>
                      {active && <span className="ml-auto text-[10px] font-bold text-primary">ON</span>}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{s.hint}</p>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-2.5">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox checked={withInvoices} onCheckedChange={(v) => setWithInvoices(!!v)} />
                <FileText className="h-3.5 w-3.5 text-muted-foreground" /> Invoices
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox checked={withManifest} onCheckedChange={(v) => setWithManifest(!!v)} />
                <Truck className="h-3.5 w-3.5 text-muted-foreground" /> Pickup manifest
              </label>
            </div>
          </div>

          {/* options */}
          <div className="rounded-xl border p-3">
            <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">Options</Label>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={opts.showImages} onCheckedChange={(v) => setOpts((o) => ({ ...o, showImages: !!v }))} />
                Product images
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={opts.showBarcodes} onCheckedChange={(v) => setOpts((o) => ({ ...o, showBarcodes: !!v }))} />
                Barcodes
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={opts.showBins} onCheckedChange={(v) => setOpts((o) => ({ ...o, showBins: !!v }))} />
                Bin column
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={splitBrand} onCheckedChange={(v) => setSplitBrand(!!v)} />
                Brand-wise pages
              </label>
              <div className="flex items-center gap-1 ml-auto">
                {(["a4", "a5"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setOpts((o) => ({ ...o, paper: p }))}
                    className={cn(
                      "px-2 py-1 rounded-md border text-[11px] font-semibold uppercase",
                      opts.paper === p ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* orders */}
          <div className="flex items-center justify-between">
            <Label>Orders ({chosen.length}/{orders.length})</Label>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => toggleAll(true)}>All</Button>
              <Button size="sm" variant="ghost" onClick={() => toggleAll(false)}>None</Button>
            </div>
          </div>

          <ScrollArea className="h-56 border rounded-xl p-2">
            <div className="space-y-1">
              {orders.map((o) => {
                const distinct = new Set((o.items ?? []).map((i) => `${i.name}|${i.variant_label ?? ""}`)).size;
                const noted = !!((o.shipping_note ?? "").trim() || (o.customer_note ?? "").trim());
                return (
                  <label key={o.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-muted cursor-pointer">
                    <Checkbox checked={!!selected[o.id]} onCheckedChange={() => toggle(o.id)} />
                    <span className="font-mono text-xs w-24">{o.invoice_no ?? o.id.slice(0, 8)}</span>
                    <span className="text-sm flex-1 truncate">{o.shipping_name ?? o.guest_name ?? "—"}</span>
                    {noted && <span className="text-[10px] rounded-full px-1.5 py-0.5 bg-amber-100 text-amber-800">note</span>}
                    {distinct > 1 && (
                      <span className="text-[10px] rounded-full px-1.5 py-0.5 bg-rose-100 text-rose-700">{distinct} items</span>
                    )}
                    <span className="text-xs text-muted-foreground">{(o.items?.length ?? 0)} ln</span>
                  </label>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={doPrint} disabled={!canPrint}>
            <Printer className="h-4 w-4 mr-2" /> Print {chosen.length}
          </Button>
        </DialogFooter>

        {/* Hidden print area — uses global .print-area + .print-page CSS */}
        <div className="print-area" style={{ display: "none" }}>
          {sheets.order &&
            brandGroups.map((g) => (
              <div className="print-page" key={`pack-${g.key}`}>
                <PackSheet orders={g.orders} options={opts} brandName={g.name} />
              </div>
            ))}
          {sheets.product &&
            brandGroups.map((g) => (
              <div className="print-page" key={`pick-${g.key}`}>
                <PickSheet orders={g.orders} by="product" options={opts} brandName={g.name} />
              </div>
            ))}
          {sheets.sku &&
            brandGroups.map((g) => (
              <div className="print-page" key={`sku-${g.key}`}>
                <PickSheet orders={g.orders} by="sku" options={opts} brandName={g.name} />
              </div>
            ))}
          {withManifest && chosen.length > 0 && (
            <div className="print-page">
              <PickupManifestPrint orders={chosen as never} />
            </div>
          )}
          {withInvoices &&
            chosen.map((o) => (
              <div className="print-page" key={o.id}>
                <PrintableInvoice order={o as never} items={(o.items ?? []) as never} visible bulk />
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
