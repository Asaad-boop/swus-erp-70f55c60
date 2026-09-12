import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Printer, X, Package, LayoutList, Barcode, Image as ImageIcon, CheckCheck, RotateCcw } from "lucide-react";

/** Live preview shows only the first few orders to stay fast. */
const PREVIEW_LIMIT = 6;
/** A4 (210mm) scaled down to fit the preview pane. */
const PREVIEW_SCALE = 0.62;
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
  PackSheet, PickSheet, DEFAULT_SHEET_OPTIONS, sortOrdersForDispatch, dispatchSerialMap,
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
  // Invoice mode: attach the packing paperwork in the exact same serial flow.
  const [withPack, setWithPack] = useState(true);
  const [withPick, setWithPick] = useState(true);
  // Orders the user removed from this print batch inside the dialog.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

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

  const allOrders = data?.orders ?? [];
  const itemsByOrder = data?.itemsByOrder ?? new Map<string, any[]>();
  const orders = allOrders.filter((o: any) => !excluded.has(o.id));
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

  // One canonical flow: dominant-SKU groups first, extras stacked, serial shared
  // by the invoices and by every sheet.
  const dispatchRows = sortOrdersForDispatch(sheetOrders);
  const serialMap = dispatchSerialMap(dispatchRows);
  const flowOrders = dispatchRows.map((r) => r.order);
  const metaById = new Map(dispatchRows.map((r) => [r.order.id, r]));

  const fallbackBrandId = activeBrand?.id ?? brandBreakdown[0]?.id ?? null;
  const groupBrand = (list: SheetOrder[]) => {
    const groups = new Map<string, SheetOrder[]>();
    for (const o of list) {
      const key = (o as any).brand_id ?? fallbackBrandId ?? "unknown";
      const arr = groups.get(key) ?? [];
      arr.push(o);
      groups.set(key, arr);
    }
    return Array.from(groups.entries()).map(([id, gOrders]) => {
      const b = brands.find((x) => x.id === id) ?? activeBrand ?? null;
      return { id, orders: gOrders, name: b?.name ?? null, logo: b?.logo_url ?? null };
    });
  };

  const totalUnits = dispatchRows.reduce((s, r) => s + r.units, 0);
  const multiCount = dispatchRows.filter((r) => r.isMulti).length;
  const canPrint = ready && !(mode === "picking" && !sheets.order && !sheets.product && !sheets.sku);

  const payload = (limit?: number) => {
    const flow = typeof limit === "number" ? flowOrders.slice(0, limit) : flowOrders;
    return (
      <>
        {mode === "invoice" && (
          <>
            {flow.map((so) => {
              const o = orders.find((x) => x.id === so.id)!;
              const meta = metaById.get(so.id)!;
              return (
                <div key={o.id} className="print-page">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6, paddingBottom: 4, borderBottom: "1px solid #111113", color: "#111113" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                      <span style={{ display: "inline-block", minWidth: 24, padding: "1px 5px", border: "1px solid #111113", borderRadius: 4, fontSize: 12, fontWeight: 700, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                        {meta.serial}
                      </span>
                      <span style={{ fontSize: 8.5, letterSpacing: 1.2, fontWeight: 700, textTransform: "uppercase", color: "#76767e" }}>
                        Pack serial · {meta.groupLabel}
                      </span>
                    </span>
                    {meta.isMulti && (
                      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, border: "1.4px solid #111113", borderRadius: 3, padding: "1px 7px" }}>
                        {meta.distinct > 1 ? `${meta.distinct} ITEMS · ` : ""}× {meta.units} PCS
                      </span>
                    )}
                  </div>
                  <PrintableInvoice
                    order={o as any}
                    items={(itemsByOrder.get(o.id) ?? []) as any}
                    visible
                    bulk
                  />
                </div>
              );
            })}
            {groupBrand(flow).map((g) => (
              <div key={`att-${g.id}`}>
                {withPack && (
                  <div className="print-page"><PackSheet orders={g.orders} options={sheetOpts} brandName={g.name} brandLogo={g.logo} serials={serialMap} /></div>
                )}
                {withPick && (
                  <div className="print-page"><PickSheet orders={g.orders} by="product" options={sheetOpts} brandName={g.name} brandLogo={g.logo} /></div>
                )}
              </div>
            ))}
          </>
        )}
        {mode === "sticker" && (
          <StickerSheet orders={typeof limit === "number" ? orders.slice(0, limit) : orders} brandName={activeBrand?.name ?? ""} cfg={config} />
        )}
        {mode === "picking" && groupBrand(flow).map((g) => (
          <div key={g.id}>
            {sheets.order && (
              <div className="print-page"><PackSheet orders={g.orders} options={sheetOpts} brandName={g.name} brandLogo={g.logo} serials={serialMap} /></div>
            )}
            {sheets.product && (
              <div className="print-page"><PickSheet orders={g.orders} by="product" options={sheetOpts} brandName={g.name} brandLogo={g.logo} /></div>
            )}
            {sheets.sku && (
              <div className="print-page"><PickSheet orders={g.orders} by="sku" options={sheetOpts} brandName={g.name} brandLogo={g.logo} /></div>
            )}
          </div>
        ))}
        {mode === "sheet" && (
          <OrderSheet orders={typeof limit === "number" ? orders.slice(0, limit) : orders} itemsByOrder={itemsByOrder} brandName={activeBrand?.name ?? ""} cfg={config} />
        )}
      </>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[1100px] w-[95vw] p-0 gap-0 overflow-hidden">
          <div className="grid md:grid-cols-[380px_1fr] max-h-[86vh]">
            {/* ── Left: controls ── */}
            <div className="flex flex-col min-h-0 border-r">
              <DialogHeader className="px-5 pt-5 pb-3 space-y-1">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Printer className="h-4 w-4" /> Print {MODE_LABEL[mode]}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {mode === "invoice" && "Invoices print in packing flow order (highest-demand SKU first) with a matching pack & picking list."}
                  {mode === "sticker" && "4 stickers per A4 page — fold and attach to parcel."}
                  {mode === "picking" && "Pack list + picking list — choose one or more views below."}
                  {mode === "sheet" && "One condensed table of all selected orders."}
                </DialogDescription>
              </DialogHeader>

              <div className="px-5 pb-4 space-y-4 overflow-y-auto min-h-0">
                {/* KPI strip */}
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { label: "Orders", value: orders.length },
                    { label: "Pieces", value: totalUnits },
                    { label: "Multi-qty", value: multiCount },
                  ].map((k) => (
                    <div key={k.label} className="rounded-lg border bg-muted/30 px-2.5 py-2">
                      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{k.label}</div>
                      <div className="text-lg font-semibold tabular-nums leading-tight">{isLoading ? "…" : k.value}</div>
                    </div>
                  ))}
                </div>

                {mode === "invoice" && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-0.5">Attach</span>
                    <SheetOptionChip checked={withPack} onChange={setWithPack} icon={Package} label="Pack list" />
                    <SheetOptionChip checked={withPick} onChange={setWithPick} icon={LayoutList} label="Picking list" />
                  </div>
                )}

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
                              on ? "border-primary bg-primary/10" : "bg-card hover:border-foreground/30"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <t.icon className={`h-4 w-4 ${on ? "text-primary" : "text-muted-foreground"}`} />
                              {on && <CheckCheck className="h-3.5 w-3.5 text-primary" />}
                            </div>
                            <div className={`mt-1.5 text-[11px] font-semibold ${on ? "text-primary" : ""}`}>{t.label}</div>
                          </button>
                        );
                      })}
                    </div>
                    {!sheets.order && !sheets.product && !sheets.sku && (
                      <p className="text-[11px] text-rose-600 dark:text-rose-400">কমপক্ষে একটা view সিলেক্ট করো।</p>
                    )}
                  </div>
                )}

                {(mode === "picking" || mode === "invoice") && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-0.5">Options</span>
                    <SheetOptionChip checked={sheetOpts.showImages} onChange={(v) => setSheetOpts((o) => ({ ...o, showImages: v }))} icon={ImageIcon} label="Images" />
                    <SheetOptionChip checked={sheetOpts.showBarcodes} onChange={(v) => setSheetOpts((o) => ({ ...o, showBarcodes: v }))} icon={Barcode} label="Barcodes" />
                    <SheetOptionChip checked={sheetOpts.showBins} onChange={(v) => setSheetOpts((o) => ({ ...o, showBins: v }))} label="Bin line" />
                    <SheetOptionChip checked={sheetOpts.paper === "a5"} onChange={(v) => setSheetOpts((o) => ({ ...o, paper: v ? "a5" : "a4" }))} label="A5 paper" />
                  </div>
                )}

                {/* Brands */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-0.5">Brands</span>
                  {isLoading && <span className="text-xs text-muted-foreground">…</span>}
                  {!isLoading && brandBreakdown.length === 0 && <span className="text-xs">—</span>}
                  {!isLoading && brandBreakdown.map((b) => (
                    <span key={b.id} className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium">
                      {b.name}
                      <span className="tabular-nums text-muted-foreground">× {b.count}</span>
                    </span>
                  ))}
                </div>

                {/* Selected orders list */}
                <div className="rounded-xl border overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Selected orders</span>
                    {excluded.size > 0 && (
                      <button type="button" className="text-[10px] text-primary hover:underline inline-flex items-center gap-1" onClick={() => setExcluded(new Set())}>
                        <RotateCcw className="h-3 w-3" /> Restore {excluded.size}
                      </button>
                    )}
                  </div>
                  <div className="max-h-52 overflow-y-auto divide-y">
                    {isLoading && <div className="px-3 py-3 text-xs text-muted-foreground">Loading…</div>}
                    {!isLoading && allOrders.map((o: any) => {
                      const off = excluded.has(o.id);
                      const meta = metaById.get(o.id);
                      return (
                        <div key={o.id} className={`flex items-center gap-2 px-3 py-1.5 text-xs ${off ? "opacity-40" : ""}`}>
                          <span className="w-6 shrink-0 tabular-nums text-[10px] text-muted-foreground">{meta?.serial ?? "—"}</span>
                          <span className="font-medium truncate">{invoiceDisplay(o)}</span>
                          <span className="truncate text-muted-foreground">{customerName(o)}</span>
                          {meta?.isMulti && (
                            <span className="ml-auto shrink-0 rounded border px-1 text-[9px] font-bold tabular-nums">×{meta.units}</span>
                          )}
                          <button
                            type="button"
                            aria-label={off ? "Restore order" : "Remove order"}
                            className={`shrink-0 rounded p-1 hover:bg-muted ${meta?.isMulti ? "" : "ml-auto"}`}
                            onClick={() => setExcluded((s) => {
                              const n = new Set(s);
                              if (n.has(o.id)) n.delete(o.id); else n.add(o.id);
                              return n;
                            })}
                          >
                            {off ? <RotateCcw className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t px-5 py-3 bg-muted/20">
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  <X className="h-3.5 w-3.5" /> Cancel
                </Button>
                <Button size="sm" disabled={!canPrint} onClick={() => {
                  runBulkPrint();
                  void markOrdersPrinted(orders.map((o: { id: string }) => o.id)).then(() => {
                    qc.invalidateQueries({ queryKey: ["orders"] });
                  });
                }}>

                  {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                  Print {orders.length || ""}
                </Button>
              </div>
            </div>

            {/* ── Right: live preview ── */}
            <div className="hidden md:flex flex-col min-h-0 bg-muted/40">
              <div className="flex items-center justify-between px-4 py-2 border-b bg-background/60">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Live preview</span>
                <span className="text-[10px] text-muted-foreground">
                  {ready ? `প্রথম ${Math.min(PREVIEW_LIMIT, orders.length)} টা দেখানো হচ্ছে` : "—"}
                </span>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {!ready ? (
                  <div className="h-full grid place-items-center text-xs text-muted-foreground">
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "কোনো অর্ডার নেই"}
                  </div>
                ) : (
                  <div style={{ width: 210 * 3.78 * PREVIEW_SCALE, margin: "0 auto" }}>
                    <div
                      className="bg-white text-black shadow-sm rounded-sm"
                      style={{ width: "210mm", transform: `scale(${PREVIEW_SCALE})`, transformOrigin: "top left", padding: "10mm" }}
                    >
                      {payload(PREVIEW_LIMIT)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden print payload — portalled to <body> so no scroll container or
          dialog body-lock can clip the batch to a single page. */}
      {open && ready && typeof document !== "undefined" && createPortal(
        <div
          className="print-area print-root"
          style={{ position: "fixed", left: -10000, top: 0, width: "210mm", pointerEvents: "none", opacity: 0 }}
          aria-hidden
        >
          {payload()}
        </div>,
        document.body,
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