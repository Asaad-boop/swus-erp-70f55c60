import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Printer, X, Package, LayoutList, Barcode, Image as ImageIcon, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useBrand } from "@/contexts/brand-context";
import { useInvoiceConfig } from "@/hooks/erp/use-invoice-config";
import { PrintableInvoice } from "@/components/erp/orders/order-invoice";
import { customerName, customerPhone, invoiceDisplay } from "@/lib/erp/orders";
import { DEFAULT_INVOICE_CONFIG, formatMoney, type InvoiceConfig } from "@/lib/erp/invoice-config";
import { markOrdersPrinted } from "@/lib/erp/mark-printed";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  PackSheet, PickSheet, DEFAULT_SHEET_OPTIONS,
  type SheetMode, type SheetOptions, type SheetOrder,
} from "@/components/erp/dispatch/pack-pick-sheet";

export type PrintMode = "invoice" | "sticker" | "picking" | "sheet";

const MODE_LABEL: Record<PrintMode, string> = {
  invoice: "Invoices",
  sticker: "Shipping stickers",
  picking: "Pack & Pick",
  sheet: "Order sheet",
};

const SHEET_TOGGLES: { key: SheetMode; label: string; hint: string; icon: React.ElementType }[] = [
  { key: "order", label: "Order-wise", hint: "Pack list — এক অর্ডার এক ব্লক, প্যাকারদের জন্য", icon: Package },
  { key: "product", label: "Product-wise", hint: "Pick list — প্রোডাক্ট ধরে গ্রুপ, গুদাম থেকে তোলার জন্য", icon: LayoutList },
  { key: "sku", label: "SKU-wise", hint: "শুধু SKU + মোট পিস — সবচেয়ে কমপ্যাক্ট", icon: Barcode },
];

function SheetOptionChip({
  checked, onChange, icon: Icon, label,
}: { checked: boolean; onChange: (v: boolean) => void; icon?: React.ElementType; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-1.5 h-7 rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
        checked
          ? "border-primary bg-primary/10 text-primary"
          : "bg-background text-muted-foreground hover:border-foreground/30"
      }`}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {label}
      {checked && <CheckCheck className="h-3 w-3" />}
    </button>
  );
}

export function BulkPrintDialog({
  open,
  onOpenChange,
  mode,
  orderIds,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: PrintMode;
  orderIds: string[];
}) {
  const { activeBrand, brands } = useBrand();
  const { data: cfg } = useInvoiceConfig(activeBrand?.id);
  const config = cfg ?? DEFAULT_INVOICE_CONFIG;
  const qc = useQueryClient();
  const [sheets, setSheets] = useState<Record<SheetMode, boolean>>({ order: false, product: true, sku: false });
  const [sheetOpts, setSheetOpts] = useState<SheetOptions>(DEFAULT_SHEET_OPTIONS);

  const { data, isLoading } = useQuery({
    queryKey: ["bulk-print", mode, orderIds.sort().join(",")],
    enabled: open && orderIds.length > 0,
    queryFn: async () => {
      const [oRes, iRes] = await Promise.all([
        supabase.from("orders").select("*").in("id", orderIds),
        supabase.from("order_items").select("*").in("order_id", orderIds),
      ]);
      if (oRes.error) throw oRes.error;
      if (iRes.error) throw iRes.error;
      const orders = oRes.data ?? [];
      const items = iRes.data ?? [];
      // fetch SKUs for variants present in these items
      const variantIds = Array.from(new Set(items.map((i) => i.variant_id).filter(Boolean))) as string[];
      const skuByVariant = new Map<string, string>();
      if (variantIds.length) {
        const { data: vrows } = await supabase
          .from("product_variants")
          .select("id,sku")
          .in("id", variantIds);
        for (const v of vrows ?? []) skuByVariant.set(v.id, v.sku ?? "");
      }
      const itemsByOrder = new Map<string, any[]>();
      for (const it of items) {
        const enriched = { ...it, sku: it.variant_id ? skuByVariant.get(it.variant_id) ?? "" : "" };
        const arr = itemsByOrder.get(it.order_id) ?? [];
        arr.push(enriched);
        itemsByOrder.set(it.order_id, arr);
      }
      // preserve original selection order
      orders.sort((a, b) => orderIds.indexOf(a.id) - orderIds.indexOf(b.id));
      return { orders, itemsByOrder };
    },
  });

  const orders = data?.orders ?? [];
  const itemsByOrder = data?.itemsByOrder ?? new Map<string, any[]>();
  const ready = !isLoading && orders.length > 0;

  // Per-brand breakdown of selected orders (works across "All brands" view too)
  const brandBreakdown = (() => {
    const counts = new Map<string, number>();
    for (const o of orders) {
      const key = (o as any).brand_id ?? "unknown";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([id, count]) => ({
      id,
      count,
      name: brands.find((b) => b.id === id)?.name ?? "Unknown",
    })).sort((a, b) => b.count - a.count);
  })();

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-4 w-4" /> Print {MODE_LABEL[mode]}
            </DialogTitle>
            <DialogDescription>
              {orderIds.length} order{orderIds.length === 1 ? "" : "s"} selected.
              {mode === "invoice" && " Each invoice prints on its own page using the active brand's invoice settings."}
              {mode === "sticker" && " 4 stickers per A4 page — fold and attach to parcel."}
              {mode === "picking" && " Pack list + picking list — choose one or more views below."}
              {mode === "sheet" && " One condensed table of all selected orders."}
            </DialogDescription>
          </DialogHeader>
          {mode === "picking" && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-3 gap-1.5">
                {SHEET_TOGGLES.map((t) => {
                  const on = sheets[t.key];
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setSheets((s) => ({ ...s, [t.key]: !s[t.key] }))}
                      title={t.hint}
                      className={`rounded-xl border px-2 py-2.5 text-left transition-colors ${
                        on
                          ? "border-primary bg-primary/10"
                          : "bg-card hover:border-foreground/30"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <t.icon className={`h-4 w-4 ${on ? "text-primary" : "text-muted-foreground"}`} />
                        {on && <CheckCheck className="h-3.5 w-3.5 text-primary" />}
                      </div>
                      <div className={`mt-1.5 text-[11px] font-semibold ${on ? "text-primary" : ""}`}>{t.label}</div>
                      <div className="text-[9.5px] leading-tight text-muted-foreground mt-0.5">{t.hint}</div>
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-0.5">Options</span>
                <SheetOptionChip checked={sheetOpts.showImages} onChange={(v) => setSheetOpts((o) => ({ ...o, showImages: v }))} icon={ImageIcon} label="Images" />
                <SheetOptionChip checked={sheetOpts.showBarcodes} onChange={(v) => setSheetOpts((o) => ({ ...o, showBarcodes: v }))} icon={Barcode} label="Barcodes" />
                <SheetOptionChip checked={sheetOpts.showBins} onChange={(v) => setSheetOpts((o) => ({ ...o, showBins: v }))} label="Bin line" />
                <SheetOptionChip checked={sheetOpts.paper === "a5"} onChange={(v) => setSheetOpts((o) => ({ ...o, paper: v ? "a5" : "a4" }))} label="A5 paper" />
              </div>
              {!sheets.order && !sheets.product && !sheets.sku && (
                <p className="text-[11px] text-rose-600 dark:text-rose-400">কমপক্ষে একটা view সিলেক্ট করো।</p>
              )}
            </div>
          )}
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs space-y-2">
            <div className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground pt-0.5">Brands</span>
              <div className="flex flex-wrap justify-end gap-1.5">
                {isLoading && <span className="text-muted-foreground">…</span>}
                {!isLoading && brandBreakdown.length === 0 && <span className="font-medium">—</span>}
                {!isLoading && brandBreakdown.map((b) => (
                  <span
                    key={b.id}
                    className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 font-medium"
                  >
                    {b.name}
                    <span className="tabular-nums text-muted-foreground">× {b.count}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className="font-medium">
                {isLoading ? "Loading order data…" : `${orders.length} order${orders.length === 1 ? "" : "s"} ready`}
              </span>
            </div>
            {!isLoading && brandBreakdown.length > 1 && (
              <div className="text-[10px] text-muted-foreground pt-1 border-t">
                Each invoice uses its own brand's invoice settings.
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
            <Button size="sm" disabled={!ready || (mode === "picking" && !sheets.order && !sheets.product && !sheets.sku)} onClick={() => {
              window.print();
              void markOrdersPrinted(orders.map((o: { id: string }) => o.id)).then(() => {
                qc.invalidateQueries({ queryKey: ["orders"] });
              });
            }}>
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
              Print {orders.length || ""}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden print payload — only visible at print time via .print-area CSS */}
      {open && ready && (
        <div className="print-area" style={{ display: "none" }}>
          {mode === "invoice" && orders.map((o) => (
            <div key={o.id} className="print-page">
              <PrintableInvoice
                order={o as any}
                items={(itemsByOrder.get(o.id) ?? []) as any}
                visible
                bulk
              />
            </div>
          ))}
          {mode === "sticker" && (
            <StickerSheet orders={orders} brandName={activeBrand?.name ?? ""} cfg={config} />
          )}
          {mode === "picking" && (() => {
            const sheetOrders: SheetOrder[] = orders.map((o) => ({
              ...(o as object),
              items: (itemsByOrder.get(o.id) ?? []).map((it: any) => ({
                name: it.name ?? "",
                variant_label: it.variant_label ?? null,
                quantity: Number(it.quantity || 0),
                price: it.price ?? null,
                image: it.image ?? null,
                sku: it.sku || null,
              })),
            })) as SheetOrder[];
            const onlyBrandId = brandBreakdown.length === 1 ? brandBreakdown[0].id : null;
            const sheetBrand = activeBrand ?? (onlyBrandId ? brands.find((b) => b.id === onlyBrandId) ?? null : null);
            const brandName = sheetBrand?.name ?? null;
            const brandLogo = sheetBrand?.logo_url ?? null;
            return (
              <>
                {sheets.order && (
                  <div className="print-page"><PackSheet orders={sheetOrders} options={sheetOpts} brandName={brandName} brandLogo={brandLogo} /></div>
                )}
                {sheets.product && (
                  <div className="print-page"><PickSheet orders={sheetOrders} by="product" options={sheetOpts} brandName={brandName} brandLogo={brandLogo} /></div>
                )}
                {sheets.sku && (
                  <div className="print-page"><PickSheet orders={sheetOrders} by="sku" options={sheetOpts} brandName={brandName} brandLogo={brandLogo} /></div>
                )}
              </>
            );
          })()}
          {mode === "sheet" && (
            <OrderSheet orders={orders} itemsByOrder={itemsByOrder} brandName={activeBrand?.name ?? ""} cfg={config} />
          )}
        </div>
      )}
    </>
  );
}

/* ---------------------------- Sticker Sheet ---------------------------- */

function StickerSheet({ orders, brandName, cfg }: { orders: any[]; brandName: string; cfg: InvoiceConfig }) {
  // 2 columns × 2 rows per A4 page (4 stickers / page)
  const pages: any[][] = [];
  for (let i = 0; i < orders.length; i += 4) pages.push(orders.slice(i, i + 4));
  return (
    <>
      <style>{`@media print { @page { size: A4; margin: 8mm; } }`}</style>
      {pages.map((pageOrders, idx) => (
        <div
          key={idx}
          className="print-page"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 6, width: "100%", minHeight: "270mm" }}
        >
          {pageOrders.map((o) => (
            <div key={o.id} style={{ border: "1.5px dashed #444", padding: 10, fontSize: 11, color: "#000", background: "#fff", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `2px solid ${cfg.accentColor}`, paddingBottom: 4, marginBottom: 6 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: cfg.accentColor }}>{brandName}</div>
                <div style={{ fontFamily: "monospace", fontSize: 11 }}>#{invoiceDisplay(o)}</div>
              </div>
              <div style={{ fontSize: 10, color: "#555", marginBottom: 2 }}>DELIVER TO</div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{customerName(o)}</div>
              <div style={{ fontSize: 12 }}>{customerPhone(o)}</div>
              <div style={{ fontSize: 11, marginTop: 2 }}>{o.shipping_address}</div>
              <div style={{ fontSize: 11 }}>{[o.shipping_thana, o.shipping_city, o.shipping_district].filter(Boolean).join(", ")}</div>
              <div style={{ marginTop: "auto", paddingTop: 6, borderTop: "1px dashed #999", display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                <span>{o.courier_name ?? "Courier"}</span>
                <span>COD: <strong>{formatMoney(Number(o.total ?? 0) - Number(o.advance_amount ?? 0), cfg.items)}</strong></span>
              </div>
              {o.shipping_note && (
                <div style={{ fontSize: 9, fontStyle: "italic", marginTop: 3, color: "#b45309" }}>Note: {o.shipping_note}</div>
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

/* ---------------------------- Order Sheet ---------------------------- */

function OrderSheet({ orders, itemsByOrder, brandName, cfg }: { orders: any[]; itemsByOrder: Map<string, any[]>; brandName: string; cfg: InvoiceConfig }) {
  return (
    <>
      <style>{`@media print { @page { size: A4 landscape; margin: 10mm; } }`}</style>
      <div style={{ color: "#000", background: "#fff", padding: 12, fontSize: 11 }}>
        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `2px solid ${cfg.accentColor}`, paddingBottom: 6, marginBottom: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: cfg.accentColor }}>{brandName} — Order Sheet</div>
          <div style={{ fontSize: 11, color: "#555" }}>{orders.length} orders · {format(new Date(), "dd MMM yyyy HH:mm")}</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: cfg.accentColor, color: "#fff" }}>
              <th style={th}>#</th>
              <th style={th}>Invoice</th>
              <th style={th}>Date</th>
              <th style={th}>Customer</th>
              <th style={th}>Phone</th>
              <th style={th}>Address</th>
              <th style={{ ...th, textAlign: "center" }}>Qty</th>
              <th style={{ ...th, textAlign: "right" }}>Total</th>
              <th style={{ ...th, textAlign: "right" }}>Advance</th>
              <th style={{ ...th, textAlign: "right" }}>COD</th>
              <th style={th}>Courier</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o, i) => {
              const items = itemsByOrder.get(o.id) ?? [];
              const qty = items.reduce((s, it) => s + Number(it.quantity || 0), 0);
              const total = Number(o.total ?? 0);
              const adv = Number(o.advance_amount ?? 0);
              return (
                <tr key={o.id} style={{ borderBottom: "1px solid #ddd" }}>
                  <td style={td}>{i + 1}</td>
                  <td style={{ ...td, fontFamily: "monospace" }}>#{invoiceDisplay(o)}</td>
                  <td style={td}>{format(new Date(o.created_at), "dd MMM")}</td>
                  <td style={td}>{customerName(o)}</td>
                  <td style={td}>{customerPhone(o)}</td>
                  <td style={{ ...td, maxWidth: 220 }}>
                    {[o.shipping_address, o.shipping_thana, o.shipping_city].filter(Boolean).join(", ")}
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>{qty}</td>
                  <td style={{ ...td, textAlign: "right" }}>{formatMoney(total, cfg.items)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{formatMoney(adv, cfg.items)}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formatMoney(total - adv, cfg.items)}</td>
                  <td style={td}>{o.courier_name ?? "—"}</td>
                  <td style={td}>{String(o.status ?? "").replace(/_/g, " ")}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${cfg.accentColor}`, background: "#f3f4f6" }}>
              <td style={td} colSpan={6}><strong>Total ({orders.length} orders)</strong></td>
              <td style={{ ...td, textAlign: "center", fontWeight: 700 }}>{orders.reduce((s, o) => s + (itemsByOrder.get(o.id) ?? []).reduce((x, it) => x + Number(it.quantity || 0), 0), 0)}</td>
              <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formatMoney(orders.reduce((s, o) => s + Number(o.total ?? 0), 0), cfg.items)}</td>
              <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formatMoney(orders.reduce((s, o) => s + Number(o.advance_amount ?? 0), 0), cfg.items)}</td>
              <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formatMoney(orders.reduce((s, o) => s + Number(o.total ?? 0) - Number(o.advance_amount ?? 0), 0), cfg.items)}</td>
              <td style={td} colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "5px 6px", fontSize: 11, fontWeight: 700, borderBottom: "1px solid #999" };
const td: React.CSSProperties = { textAlign: "left", padding: "4px 6px", fontSize: 11, verticalAlign: "top" };