import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Printer, X } from "lucide-react";
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

const SHEET_TOGGLES: { key: SheetMode; label: string; hint: string }[] = [
  { key: "order", label: "Order-wise", hint: "Pack list — per order" },
  { key: "product", label: "Product-wise", hint: "Pick list — per product" },
  { key: "sku", label: "SKU-wise", hint: "Compact — SKU + qty only" },
];

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
              {mode === "picking" && " Packer-friendly list grouped per order."}
              {mode === "sheet" && " One condensed table of all selected orders."}
            </DialogDescription>
          </DialogHeader>
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
            <Button size="sm" disabled={!ready} onClick={() => {
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
          {mode === "picking" && (
            <PickingList orders={orders} itemsByOrder={itemsByOrder} brandName={activeBrand?.name ?? ""} />
          )}
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

/* ---------------------------- Picking List ---------------------------- */

function PickingList({ orders, itemsByOrder, brandName }: { orders: any[]; itemsByOrder: Map<string, any[]>; brandName: string }) {
  // Build flat lines: one per order_item, enriched with order context
  type Line = { sku: string; name: string; variant: string; qty: number; image: string | null; order: any };
  const lines: Line[] = [];
  for (const o of orders) {
    for (const it of itemsByOrder.get(o.id) ?? []) {
      lines.push({
        sku: (it.sku || "").trim(),
        name: it.name ?? "",
        variant: it.variant_label ?? "",
        qty: Number(it.quantity || 0),
        image: it.image ?? null,
        order: o,
      });
    }
  }

  // Group by product name, then split into variant sub-groups
  type Variant = { sku: string; variant: string; lines: Line[]; qty: number; image: string | null };
  type Group = { name: string; variants: Map<string, Variant>; totalQty: number; orderIds: Set<string>; image: string | null };
  const groups = new Map<string, Group>();
  for (const l of lines) {
    let g = groups.get(l.name);
    if (!g) { g = { name: l.name, variants: new Map(), totalQty: 0, orderIds: new Set(), image: l.image }; groups.set(l.name, g); }
    if (!g.image && l.image) g.image = l.image;
    const vKey = `${l.sku}::${l.variant}`;
    let v = g.variants.get(vKey);
    if (!v) { v = { sku: l.sku, variant: l.variant, lines: [], qty: 0, image: l.image }; g.variants.set(vKey, v); }
    if (!v.image && l.image) v.image = l.image;
    v.lines.push(l);
    v.qty += l.qty;
    g.totalQty += l.qty;
    g.orderIds.add(l.order.id);
  }
  const sortedGroups = Array.from(groups.values()).sort((a, b) => b.totalQty - a.totalQty);
  for (const g of sortedGroups) {
    for (const v of g.variants.values()) v.lines.sort((a, b) => b.qty - a.qty);
  }
  const grandQty = sortedGroups.reduce((s, g) => s + g.totalQty, 0);
  const totalSkus = sortedGroups.reduce((s, g) => s + g.variants.size, 0);
  const genId = `PICK-${format(new Date(), "yyMMdd-HHmm")}`;
  let serial = 0;

  return (
    <>
      <style>{`@media print { @page { size: A4; margin: 12mm; } .pk-row,.pk-group{break-inside:avoid;} img{-webkit-print-color-adjust:exact;print-color-adjust:exact;} }`}</style>
      <div style={{ color: "#000", background: "#fff", padding: "18mm 14mm", fontSize: 12, lineHeight: 1.35, fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid #000", paddingBottom: 10, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 3, fontWeight: 700, color: "#555" }}>
              {brandName ? `${brandName.toUpperCase()} · ` : ""}WAREHOUSE · PICK SHEET
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: "4px 0 0", letterSpacing: -0.5 }}>Picking List</h1>
          </div>
          <div style={{ textAlign: "right", fontSize: 11 }}>
            <div style={{ fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 700 }}>{genId}</div>
            <div style={{ color: "#555" }}>{format(new Date(), "PPP · p")}</div>
            <div style={{ marginTop: 6, fontSize: 10, color: "#555" }}>
              Picker: ______________ &nbsp;·&nbsp; Checker: ______________
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
          {[
            { label: "Orders", value: orders.length },
            { label: "Products", value: sortedGroups.length },
            { label: "Unique SKUs", value: totalSkus },
            { label: "Total Units", value: grandQty },
          ].map((k) => (
            <div key={k.label} style={{ border: "1px solid #ddd", borderRadius: 6, padding: "8px 10px" }}>
              <div style={{ fontSize: 9, letterSpacing: 1.5, color: "#666", fontWeight: 700 }}>{k.label.toUpperCase()}</div>
              <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Groups */}
        {sortedGroups.map((g, gi) => {
          const variants = Array.from(g.variants.values()).sort((a, b) => b.qty - a.qty);
          return (
            <div key={g.name} className="pk-group" style={{ marginBottom: 14, border: "1px solid #bbb", borderRadius: 6, overflow: "hidden" }}>
              {/* Product header */}
              <div style={{ background: "#111", color: "#fff", padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                  {g.image ? (
                    <img src={g.image} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4, background: "#fff", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 40, height: 40, borderRadius: 4, background: "#333", flexShrink: 0 }} />
                  )}
                  <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, color: "#9ca3af", fontWeight: 700 }}>
                    {String(gi + 1).padStart(2, "0")}
                  </span>
                  <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: -0.2 }}>{g.name}</span>
                </div>
                <div style={{ display: "flex", gap: 14, alignItems: "baseline", fontSize: 11, whiteSpace: "nowrap" }}>
                  <span style={{ opacity: 0.8 }}>{g.orderIds.size} order{g.orderIds.size === 1 ? "" : "s"}</span>
                  <span style={{ opacity: 0.8 }}>{variants.length} SKU{variants.length === 1 ? "" : "s"}</span>
                  <span style={{ fontWeight: 800, fontSize: 16, fontVariantNumeric: "tabular-nums" }}>{g.totalQty} pc</span>
                </div>
              </div>

              {variants.map((v, vi) => (
                <div key={vi}>
                  {/* Variant subheader */}
                  <div style={{ background: "#f3f4f6", padding: "6px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: vi === 0 ? undefined : "1px solid #ddd", gap: 10 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, minWidth: 0 }}>
                      {v.image ? (
                        <img src={v.image} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 3, border: "1px solid #ddd", background: "#fff", flexShrink: 0 }} />
                      ) : null}
                      <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 700, color: "#111" }}>{v.sku || "—"}</span>
                      {v.variant && <span style={{ color: "#444" }}>↳ {v.variant}</span>}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {v.lines.length} line{v.lines.length === 1 ? "" : "s"} · {v.qty} pc
                    </div>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#fafafa" }}>
                        <th style={{ ...th, width: 26, textAlign: "center" }}>✓</th>
                        <th style={{ ...th, width: 32 }}>#</th>
                        <th style={{ ...th, width: 110 }}>Invoice</th>
                        <th style={th}>Customer</th>
                        <th style={{ ...th, width: 110 }}>Phone</th>
                        <th style={th}>Area</th>
                        <th style={{ ...th, textAlign: "right", width: 50 }}>Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {v.lines.map((l, li) => {
                        serial += 1;
                        return (
                          <tr key={`${l.order.id}-${li}`} className="pk-row" style={{ borderTop: "1px dashed #eee", background: li % 2 === 0 ? "#fff" : "#fcfcfc" }}>
                            <td style={{ ...td, textAlign: "center" }}>
                              <span style={{ display: "inline-block", width: 12, height: 12, border: "1.5px solid #111", borderRadius: 2, verticalAlign: "middle" }} />
                            </td>
                            <td style={{ ...td, fontFamily: "ui-monospace, Menlo, monospace", color: "#666" }}>{serial}</td>
                            <td style={{ ...td, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11 }}>#{invoiceDisplay(l.order)}</td>
                            <td style={{ ...td, fontWeight: 600 }}>{customerName(l.order)}</td>
                            <td style={{ ...td, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11 }}>{customerPhone(l.order)}</td>
                            <td style={{ ...td, fontSize: 10, color: "#555" }}>
                              {[l.order.shipping_thana, l.order.shipping_city].filter(Boolean).join(", ")}
                            </td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 800, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{l.qty}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          );
        })}

        {/* Grand total */}
        <div style={{ marginTop: 6, padding: "10px 12px", borderTop: "2px solid #000", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, fontWeight: 700, color: "#333" }}>GRAND TOTAL</div>
          <div style={{ fontSize: 22, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{grandQty} pc</div>
        </div>

        {/* Signatures */}
        <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, fontSize: 10, color: "#555" }}>
          {["Picked by", "Checked by", "Dispatched by"].map((l) => (
            <div key={l} style={{ borderTop: "1px solid #000", paddingTop: 4, textAlign: "center" }}>{l}</div>
          ))}
        </div>
      </div>
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