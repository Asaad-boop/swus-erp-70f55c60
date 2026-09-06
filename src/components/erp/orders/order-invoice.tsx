import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import { customerName, customerPhone, invoiceDisplay } from "@/lib/erp/orders";
import { useBrand } from "@/contexts/brand-context";
import { useInvoiceConfig } from "@/hooks/erp/use-invoice-config";
import {
  DEFAULT_INVOICE_CONFIG, FONT_FAMILY_MAP, FONT_SIZE_MAP, MARGIN_MAP, amountInWords, formatMoney, pageCss,
  type InvoiceConfig,
} from "@/lib/erp/invoice-config";

type Item = {
  name: string;
  quantity: number;
  unit_price: number | null;
  price: number;
  variant_label: string | null;
  line_total: number | null;
  sku?: string | null;
  image?: string | null;
};

export function PrintableInvoice({
  order,
  items: itemsRaw,
  configOverride,
  visible,
  bulk,
}: {
  order: Record<string, any>;
  items: Item[];
  configOverride?: InvoiceConfig;
  visible?: boolean; // when true, render visibly (for live preview)
  bulk?: boolean; // when true, omit #print-invoice id so multiple copies don't stack via the single-print CSS
}) {
  const { activeBrand, brands } = useBrand();
  // Combo children are stock-only rows (unit_price = 0). Never show them on
  // the printed invoice — the parent combo line already carries the full price.
  const items = itemsRaw.filter((it) => !(it as any).is_combo_child);
  // Prefer the order's own brand so invoices print correctly even when no brand
  // is selected in the header (e.g. "All brands" or bulk print across brands).
  const orderBrand =
    (order?.brand_id ? brands.find((b) => b.id === order.brand_id) : null) ??
    activeBrand ??
    null;
  const { data: cfgData } = useInvoiceConfig(orderBrand?.id);
  const cfg: InvoiceConfig = configOverride ?? cfgData ?? DEFAULT_INVOICE_CONFIG;

  const isPos = cfg.paper === "80mm" || cfg.paper === "58mm";
  const themeKey = isPos ? "pos" : cfg.theme;

  // Auto-fit: shrink content with transform-scale at print time so any invoice
  // fits on exactly ONE page regardless of length. POS/roll paper is auto-height
  // so we skip scaling there.
  const innerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (isPos) return;
    const PAPER_H_MM: Record<string, number> = { A4: 297, A5: 210 };
    const PAPER_W_MM: Record<string, number> = { A4: 210, A5: 148 };
    const landscape = cfg.orientation === "landscape";
    const paperH = landscape ? (PAPER_W_MM[cfg.paper] ?? 210) : (PAPER_H_MM[cfg.paper] ?? 297);
    const marginMm = parseFloat(MARGIN_MAP[cfg.margin]);
    const availMm = paperH - 2 * marginMm;
    const availPx = availMm * (96 / 25.4);

    const fit = () => {
      const el = innerRef.current;
      if (!el) return;
      (el.style as any).zoom = "";
      el.style.maxHeight = "";
      el.style.overflow = "";
      // measure natural height
      const h = el.scrollHeight;
      // Not measurable (hidden container) → leave the invoice untouched, otherwise
      // the clamp below would clip a still-unlaid-out invoice into a blank page.
      if (!h) return;
      // Always leave a tiny safety gap so sub-pixel rounding can't spill to a 2nd page.
      const target = availPx - 2;
      if (h > target) {
        const scale = Math.max(0.4, target / h);
        // `zoom` affects layout (unlike transform:scale) so the print page-box
        // actually shrinks and content fits on one A4/A5 page.
        (el.style as any).zoom = String(scale);
      }
      // Hard cap: clip any residual overflow so it never pushes a blank next page.
      el.style.maxHeight = `${availMm}mm`;
      el.style.overflow = "hidden";
    };
    const reset = () => {
      const el = innerRef.current;
      if (!el) return;
      (el.style as any).zoom = "";
      el.style.maxHeight = "";
      el.style.overflow = "";
    };
    window.addEventListener("beforeprint", fit);
    window.addEventListener("afterprint", reset);
    return () => {
      window.removeEventListener("beforeprint", fit);
      window.removeEventListener("afterprint", reset);
    };
  }, [cfg, isPos, order, items]);

  // QR
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  useEffect(() => {
    if (!cfg.meta.qr.enabled) { setQrDataUrl(""); return; }
    const target = cfg.meta.qr.target;
    let value = "";
    if (target === "tracking" && order.tracking_number) {
      value = `https://google.com/search?q=${encodeURIComponent(String(order.tracking_number))}`;
    } else if (target === "phone") value = `tel:${customerPhone(order as any)}`;
    else if (target === "website") value = cfg.business.website || "";
    else value = cfg.meta.qr.customUrl || "";
    if (!value) { setQrDataUrl(""); return; }
    QRCode.toDataURL(value, { width: 120, margin: 0 }).then(setQrDataUrl).catch(() => setQrDataUrl(""));
  }, [cfg, order]);

  const wrapperBase = visible
    ? "bg-white text-black"
    : "hidden print:block bg-white text-black";

  const fontFamily = FONT_FAMILY_MAP[cfg.font.family];
  const fontSize = FONT_SIZE_MAP[cfg.font.size];

  const styleVars: React.CSSProperties = {
    fontFamily,
    fontSize,
    ["--invoice-accent" as any]: cfg.accentColor,
  };

  const containerStyle: React.CSSProperties = visible
    ? { ...styleVars, width: isPos ? "80mm" : "100%", margin: "0 auto", padding: isPos ? 8 : 24 }
    : { ...styleVars, padding: isPos ? 8 : 24 };

  const wmText =
    String(order.status).toLowerCase() === "cancelled" ? "CANCELLED"
      : Number(order.advance_amount || 0) >= Number(order.total || 0) ? "PAID"
      : Number(order.advance_amount || 0) > 0 ? "PARTIAL"
      : "DUE";

  const ThemeBody =
    themeKey === "pos" ? PosInvoice
    : themeKey === "minimal" ? MinimalInvoice
    : themeKey === "classic" ? ClassicInvoice
    : themeKey === "modern" ? ModernInvoice
    : TemplateInvoice;

  return (
    <div {...(bulk ? {} : { id: "print-invoice" })} className={`${wrapperBase} invoice-page`}>
      <style>{`@media print {
        ${pageCss(cfg)}
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .invoice-page { width: 100% !important; padding: 0 !important; margin: 0 !important; box-sizing: border-box; break-inside: avoid; page-break-inside: avoid; overflow: hidden; }
        .invoice-page .invoice-inner { padding: 0 !important; width: 100% !important; }
        .invoice-page + .invoice-page { page-break-before: always; break-before: page; }
        .invoice-page:last-child { page-break-after: auto; break-after: auto; }
      }`}</style>
      <div ref={innerRef} style={containerStyle} className="relative invoice-inner">
        {cfg.header.showWatermark && !isPos && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            style={{ transform: "rotate(-22deg)", opacity: 0.07, fontSize: 120, fontWeight: 900, color: cfg.accentColor }}
          >
            {wmText}
          </div>
        )}
        <ThemeBody order={order} items={items} cfg={cfg} brandName={orderBrand?.name ?? "Invoice"} brandLogo={orderBrand?.logo_url ?? null} qrDataUrl={qrDataUrl} />
      </div>
    </div>
  );
}

/* ============================== Shared bits ============================== */

type ThemeProps = {
  order: Record<string, any>;
  items: Item[];
  cfg: InvoiceConfig;
  brandName: string;
  brandLogo: string | null;
  qrDataUrl: string;
};

function computeTotals(order: Record<string, any>, cfg: InvoiceConfig) {
  const subtotal = Number(order.subtotal || 0);
  const shipping = Number(order.shipping_fee || 0);
  const discount = Number(order.discount_amount || 0);
  const advance = Number(order.advance_amount || 0);
  const taxRate = Number(cfg.totals.tax.rate || 0);
  const taxable = subtotal - discount;
  const tax = cfg.totals.tax.inclusive
    ? (taxable * taxRate) / (100 + taxRate)
    : (taxable * taxRate) / 100;
  const rawTotal = cfg.totals.tax.inclusive
    ? subtotal - discount + shipping
    : subtotal - discount + shipping + tax;
  const total = cfg.totals.roundOff ? Math.round(rawTotal) : rawTotal;
  const due = Math.max(0, total - advance);
  return { subtotal, shipping, discount, advance, tax, total, due };
}

function HeaderBlock({ cfg, brandName, brandLogo }: { cfg: InvoiceConfig; brandName: string; brandLogo: string | null }) {
  const align = cfg.header.layout === "logo-center" ? "items-center text-center"
    : cfg.header.layout === "logo-right" ? "items-end text-right"
    : "items-start text-left";
  return (
    <div className={`flex flex-col ${align} gap-1`}>
      {brandLogo
        ? <img src={brandLogo} alt={brandName} style={{ height: cfg.header.logoHeight, objectFit: "contain" }} />
        : <h1 className="font-extrabold tracking-tight" style={{ fontSize: 22, color: cfg.accentColor }}>{brandName}</h1>}
      {cfg.header.tagline && <p className="text-[11px] text-gray-600">{cfg.header.tagline}</p>}
      <div className="text-[10px] text-gray-600 leading-tight">
        {cfg.business.address && <div>{cfg.business.address}</div>}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {cfg.business.hotline && <span>📞 {cfg.business.hotline}</span>}
          {cfg.business.whatsapp && <span>WhatsApp: {cfg.business.whatsapp}</span>}
          {cfg.business.email && <span>✉ {cfg.business.email}</span>}
          {cfg.business.website && <span>🌐 {cfg.business.website}</span>}
        </div>
        {(cfg.business.bin || cfg.business.trade_license) && (
          <div className="flex flex-wrap gap-x-3">
            {cfg.business.bin && <span>BIN: {cfg.business.bin}</span>}
            {cfg.business.trade_license && <span>TL: {cfg.business.trade_license}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function MetaBlock({ order, cfg, qrDataUrl }: { order: Record<string, any>; cfg: InvoiceConfig; qrDataUrl: string }) {
  return (
    <div className="text-right text-[11px] space-y-0.5">
      <div className="font-bold text-base" style={{ color: cfg.accentColor }}>INVOICE</div>
      <div><strong>#</strong> {invoiceDisplay(order as any)}</div>
      {cfg.meta.showDate && <div><strong>Date:</strong> {format(new Date(order.created_at), "dd MMM yyyy")}</div>}
      {cfg.meta.showCourier && order.courier_name && <div><strong>Courier:</strong> {order.courier_name}</div>}
      {cfg.meta.showTracking && order.tracking_number && <div><strong>Tracking:</strong> {order.tracking_number}</div>}
      {cfg.meta.showPayment && order.payment_method && <div><strong>Payment:</strong> {order.payment_method}</div>}
      {qrDataUrl && <img src={qrDataUrl} alt="QR" className="ml-auto mt-1" style={{ width: 70, height: 70 }} />}
    </div>
  );
}

function BillTo({ order }: { order: Record<string, any> }) {
  return (
    <div className="text-[11px]">
      <div className="font-semibold mb-0.5 text-gray-500 uppercase text-[10px] tracking-wider">Bill To</div>
      <div className="font-semibold text-[13px]">{customerName(order as any)}</div>
      <div>{customerPhone(order as any)}</div>
      <div>{order.shipping_address}</div>
      <div>{[order.shipping_thana, order.shipping_city, order.shipping_district].filter(Boolean).join(", ")}</div>
    </div>
  );
}

function ItemsTable({ items, cfg, accentBand }: { items: Item[]; cfg: InvoiceConfig; accentBand: boolean }) {
  const headBg = accentBand ? cfg.accentColor : "transparent";
  const headColor = accentBand ? "#fff" : "inherit";
  return (
    <table className="w-full border-collapse" style={{ marginTop: 12 }}>
      <thead>
        <tr style={{ background: headBg, color: headColor, borderBottom: `2px solid ${cfg.accentColor}` }}>
          <th className="text-left py-1.5 px-2 text-[11px]">#</th>
          <th className="text-left py-1.5 px-2 text-[11px]">Item</th>
          {cfg.items.showSku && <th className="text-left py-1.5 px-2 text-[11px]">SKU</th>}
          <th className="text-center py-1.5 px-2 text-[11px]">Qty</th>
          <th className="text-right py-1.5 px-2 text-[11px]">Price</th>
          {cfg.items.showDiscount && <th className="text-right py-1.5 px-2 text-[11px]">Disc</th>}
          <th className="text-right py-1.5 px-2 text-[11px]">Total</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, i) => {
          const up = Number(it.unit_price ?? it.price ?? 0);
          const lt = Number(it.line_total ?? up * Number(it.quantity || 0));
          return (
            <tr key={i} style={{ background: cfg.items.zebra && i % 2 ? "rgba(0,0,0,0.025)" : "transparent", borderBottom: "1px solid #e5e7eb" }}>
              <td className="py-1.5 px-2 text-[11px] align-top">{i + 1}</td>
              <td className="py-1.5 px-2 text-[11px] align-top">
                <div className="flex items-start gap-2">
                  {cfg.items.showImage && it.image && <img src={it.image} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 3 }} />}
                  <div>
                    <div className="font-medium">{it.name}</div>
                    {cfg.items.showVariant && it.variant_label && <div className="text-[10px] text-gray-500">{it.variant_label}</div>}
                  </div>
                </div>
              </td>
              {cfg.items.showSku && <td className="py-1.5 px-2 text-[10px] font-mono align-top">{it.sku ?? "—"}</td>}
              <td className="py-1.5 px-2 text-[11px] text-center align-top">{it.quantity}</td>
              <td className="py-1.5 px-2 text-[11px] text-right align-top">{formatMoney(up, cfg.items)}</td>
              {cfg.items.showDiscount && <td className="py-1.5 px-2 text-[11px] text-right align-top">—</td>}
              <td className="py-1.5 px-2 text-[11px] text-right align-top font-medium">{formatMoney(lt, cfg.items)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TotalsBlock({ order, cfg }: { order: Record<string, any>; cfg: InvoiceConfig }) {
  const t = computeTotals(order, cfg);
  const row = (label: string, value: string, strong = false) => (
    <tr>
      <td className="py-0.5 pr-3 text-[11px]" style={{ fontWeight: strong ? 700 : 400 }}>{label}</td>
      <td className="py-0.5 text-right text-[11px]" style={{ fontWeight: strong ? 700 : 400 }}>{value}</td>
    </tr>
  );
  return (
    <div className="flex justify-end mt-3">
      <table style={{ minWidth: 260 }}>
        <tbody>
          {cfg.totals.showSubtotal && row("Subtotal", formatMoney(t.subtotal, cfg.items))}
          {cfg.totals.showDiscount && t.discount > 0 && row("Discount", "− " + formatMoney(t.discount, cfg.items))}
          {cfg.totals.tax.rate > 0 && row(`VAT (${cfg.totals.tax.rate}%${cfg.totals.tax.inclusive ? " incl." : ""})`, formatMoney(t.tax, cfg.items))}
          {cfg.totals.showShipping && row("Shipping", formatMoney(t.shipping, cfg.items))}
          <tr style={{ borderTop: `2px solid ${cfg.accentColor}` }}>
            <td className="py-1 pr-3 text-[13px] font-bold" style={{ color: cfg.accentColor }}>Total</td>
            <td className="py-1 text-right text-[13px] font-bold" style={{ color: cfg.accentColor }}>{formatMoney(t.total, cfg.items)}</td>
          </tr>
          {cfg.totals.showAdvance && t.advance > 0 && row("Advance Paid", "− " + formatMoney(t.advance, cfg.items))}
          {cfg.totals.showDue && row("Amount Due", formatMoney(t.due, cfg.items), true)}
        </tbody>
      </table>
    </div>
  );
}

function FooterBlock({ order, cfg }: { order: Record<string, any>; cfg: InvoiceConfig }) {
  const t = computeTotals(order, cfg);
  const inWords = amountInWords(t.total, cfg.totals.amountInWords);
  return (
    <div className="mt-4 space-y-2 text-[10.5px]">
      {inWords && (
        <div className="border-y border-dashed py-1.5">
          <strong>In words: </strong>{inWords}
        </div>
      )}
      {(order.shipping_note || order.customer_note) && (
        <div className="rounded border border-gray-300 p-2 space-y-0.5">
          {order.shipping_note && <div><strong>Shipping Note:</strong> {order.shipping_note}</div>}
          {order.customer_note && <div><strong>Customer Note:</strong> {order.customer_note}</div>}
        </div>
      )}
      {cfg.footer.terms && <div><strong>Terms:</strong> {cfg.footer.terms}</div>}
      {cfg.footer.returnPolicy && <div><strong>Return:</strong> {cfg.footer.returnPolicy}</div>}
      <div className="flex justify-between items-end pt-6">
        <div className="text-[10px] text-gray-500">{cfg.footer.thankYou}</div>
        <div className="text-center">
          {cfg.footer.signatureUrl && <img src={cfg.footer.signatureUrl} alt="signature" style={{ height: 36, marginLeft: "auto" }} />}
          <div className="border-t border-black/70 pt-1 px-4 text-[10px]">{cfg.footer.signatureLabel}</div>
        </div>
      </div>
    </div>
  );
}

/* ================================ Themes ================================= */

function ModernInvoice(p: ThemeProps) {
  return (
    <>
      <div className="rounded-md overflow-hidden" style={{ background: p.cfg.accentColor, color: "#fff", padding: "10px 14px" }}>
        <div className="flex justify-between items-start">
          <div className="text-white">
            {p.brandLogo
              ? <img src={p.brandLogo} alt={p.brandName} style={{ height: p.cfg.header.logoHeight, filter: "brightness(0) invert(1)" }} />
              : <div className="font-extrabold text-xl">{p.brandName}</div>}
            {p.cfg.header.tagline && <div className="text-[11px] opacity-80">{p.cfg.header.tagline}</div>}
          </div>
          <div className="text-right text-[11px]">
            <div className="font-bold text-base">INVOICE</div>
            <div># {invoiceDisplay(p.order as any)}</div>
            {p.cfg.meta.showDate && <div>{format(new Date(p.order.created_at), "dd MMM yyyy")}</div>}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <div className="text-[10px] text-gray-700 leading-tight">
          {p.cfg.business.address && <div>{p.cfg.business.address}</div>}
          {p.cfg.business.hotline && <div>📞 {p.cfg.business.hotline}</div>}
          {p.cfg.business.email && <div>✉ {p.cfg.business.email}</div>}
          {p.cfg.business.website && <div>🌐 {p.cfg.business.website}</div>}
        </div>
        <div className="flex justify-end">
          {p.qrDataUrl && <img src={p.qrDataUrl} alt="QR" style={{ width: 70, height: 70 }} />}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <BillTo order={p.order} />
        <div className="text-right text-[11px] space-y-0.5">
          {p.cfg.meta.showCourier && p.order.courier_name && <div><strong>Courier:</strong> {p.order.courier_name}</div>}
          {p.cfg.meta.showTracking && p.order.tracking_number && <div><strong>Tracking:</strong> {p.order.tracking_number}</div>}
          {p.cfg.meta.showPayment && p.order.payment_method && <div><strong>Payment:</strong> {p.order.payment_method}</div>}
        </div>
      </div>
      <ItemsTable items={p.items} cfg={p.cfg} accentBand />
      <TotalsBlock order={p.order} cfg={p.cfg} />
      <FooterBlock order={p.order} cfg={p.cfg} />
    </>
  );
}

function ClassicInvoice(p: ThemeProps) {
  return (
    <>
      <div className="flex justify-between items-start border-b-2 border-black pb-3">
        <HeaderBlock cfg={p.cfg} brandName={p.brandName} brandLogo={p.brandLogo} />
        <MetaBlock order={p.order} cfg={p.cfg} qrDataUrl={p.qrDataUrl} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <BillTo order={p.order} />
      </div>
      <ItemsTable items={p.items} cfg={p.cfg} accentBand={false} />
      <TotalsBlock order={p.order} cfg={p.cfg} />
      <FooterBlock order={p.order} cfg={p.cfg} />
    </>
  );
}

function MinimalInvoice(p: ThemeProps) {
  return (
    <>
      <div className="flex justify-between items-baseline">
        <div className="font-bold tracking-tight" style={{ fontSize: 18, color: p.cfg.accentColor }}>{p.brandName}</div>
        <div className="text-[11px]">#{invoiceDisplay(p.order as any)} · {format(new Date(p.order.created_at), "dd MMM yyyy")}</div>
      </div>
      <div className="text-[10px] text-gray-500 mt-0.5">{p.cfg.business.address}</div>
      <hr className="my-3 border-gray-300" />
      <BillTo order={p.order} />
      <ItemsTable items={p.items} cfg={p.cfg} accentBand={false} />
      <TotalsBlock order={p.order} cfg={p.cfg} />
      <FooterBlock order={p.order} cfg={p.cfg} />
    </>
  );
}

function PosInvoice(p: ThemeProps) {
  const t = computeTotals(p.order, p.cfg);
  return (
    <div className="text-[10px]" style={{ fontFamily: "ui-monospace, monospace" }}>
      <div className="text-center font-bold text-[13px]">{p.brandName}</div>
      {p.cfg.business.address && <div className="text-center text-[9px]">{p.cfg.business.address}</div>}
      {p.cfg.business.hotline && <div className="text-center text-[9px]">{p.cfg.business.hotline}</div>}
      <div className="text-center my-1">━━━━━━━━━━━━━━━━━━━━━━━</div>
      <div>Inv #: {invoiceDisplay(p.order as any)}</div>
      <div>Date: {format(new Date(p.order.created_at), "dd MMM yyyy HH:mm")}</div>
      <div>To: {customerName(p.order as any)} ({customerPhone(p.order as any)})</div>
      <div className="text-center my-1">━━━━━━━━━━━━━━━━━━━━━━━</div>
      {p.items.map((it, i) => (
        <div key={i} className="mb-1">
          <div className="truncate">{it.name}</div>
          <div className="flex justify-between">
            <span>{it.quantity} × {formatMoney(Number(it.unit_price ?? it.price), p.cfg.items)}</span>
            <span>{formatMoney(Number(it.line_total ?? it.price * it.quantity), p.cfg.items)}</span>
          </div>
        </div>
      ))}
      <div className="text-center my-1">━━━━━━━━━━━━━━━━━━━━━━━</div>
      {p.cfg.totals.showSubtotal && <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(t.subtotal, p.cfg.items)}</span></div>}
      {p.cfg.totals.showDiscount && t.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>−{formatMoney(t.discount, p.cfg.items)}</span></div>}
      {p.cfg.totals.showShipping && <div className="flex justify-between"><span>Shipping</span><span>{formatMoney(t.shipping, p.cfg.items)}</span></div>}
      <div className="flex justify-between font-bold border-t border-black mt-1 pt-1"><span>TOTAL</span><span>{formatMoney(t.total, p.cfg.items)}</span></div>
      {p.cfg.totals.showAdvance && t.advance > 0 && <div className="flex justify-between"><span>Paid</span><span>{formatMoney(t.advance, p.cfg.items)}</span></div>}
      {p.cfg.totals.showDue && <div className="flex justify-between font-bold"><span>Due</span><span>{formatMoney(t.due, p.cfg.items)}</span></div>}
      <div className="text-center mt-2">{p.cfg.footer.thankYou}</div>
      {p.qrDataUrl && <div className="flex justify-center mt-2"><img src={p.qrDataUrl} alt="QR" style={{ width: 60, height: 60 }} /></div>}
    </div>
  );
}

/* ============================== Template ================================= */

function Barcode({ value }: { value: string }) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    if (!value) return;
    try {
      const canvas = document.createElement("canvas");
      JsBarcode(canvas, value, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        height: 50,
        width: 1.6,
      });
      setSrc(canvas.toDataURL("image/png"));
    } catch {
      setSrc("");
    }
  }, [value]);
  if (!src) return null;
  return <img src={src} alt={value} style={{ width: "100%", maxWidth: 280, height: 56 }} />;
}

function TemplateInvoice(p: ThemeProps) {
  const t = computeTotals(p.order, p.cfg);
  const inv = invoiceDisplay(p.order as any);
  const itemCount = p.items.reduce((s, it) => s + Number(it.quantity || 0), 0);
  const inWords = amountInWords(t.total, p.cfg.totals.amountInWords || "en");
  const accent = p.cfg.accentColor || "#0f172a";
  const callout = "#e11d48";
  const addr = [p.order.shipping_thana, p.order.shipping_city, p.order.shipping_district]
    .filter(Boolean).join(", ");
  const wm =
    String(p.order.status).toLowerCase() === "cancelled" ? "CANCELLED"
      : Number(p.order.advance_amount || 0) >= Number(p.order.total || 0) ? "PAID"
      : Number(p.order.advance_amount || 0) > 0 ? "PARTIAL"
      : "DUE";
  return (
    <div className="relative text-[13px] text-slate-900" style={{ fontFamily: "inherit" }}>
      {/* WATERMARK */}
      <div aria-hidden className="absolute inset-0 flex items-center justify-center pointer-events-none select-none" style={{ opacity: 0.04 }}>
        <span className="font-black tracking-widest" style={{ fontSize: 180, transform: "rotate(-35deg)", color: "#0f172a" }}>{wm}</span>
      </div>

      {/* HEADER */}
      <header className="relative z-10 flex justify-between items-start pb-5 mb-7" style={{ borderBottom: "2px solid #0f172a" }}>
        <div className="flex items-center gap-3">
          {p.brandLogo
            ? <img src={p.brandLogo} alt={p.brandName} style={{ height: p.cfg.header.logoHeight, objectFit: "contain" }} />
            : <div className="font-extrabold tracking-tighter uppercase text-[22px] leading-none" style={{ color: accent }}>{p.brandName}</div>}
          {p.cfg.header.tagline && <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold">{p.cfg.header.tagline}</span>}
        </div>
        <div className="text-right">
          <div className="text-[13px] font-bold tracking-widest uppercase">HQ</div>
          {p.cfg.business.hotline && (
            <div className="text-[11px] text-slate-500 mt-0.5">Hotline: <span className="text-slate-900 font-medium">{p.cfg.business.hotline}</span></div>
          )}
          {p.cfg.business.address && <div className="text-[11px] text-slate-500">{p.cfg.business.address}</div>}
        </div>
      </header>

      {/* META + ADDRESS */}
      <div className="relative z-10 grid grid-cols-12 gap-8 mb-9">
        <div className="col-span-7">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: callout }}>Delivery Address</div>
          <div className="font-black text-[26px] leading-tight tracking-tight uppercase mb-1">{customerName(p.order as any)} —</div>
          {p.order.shipping_address && <div className="text-[13px] text-slate-600 leading-relaxed">{p.order.shipping_address}</div>}
          {addr && <div className="text-[13px] text-slate-600 leading-relaxed mb-3">{addr}</div>}
          <div className="mt-2">
            <span className="inline-block px-3 py-1 text-[13px] font-bold tracking-wider" style={{ background: "#0f172a", color: "#fff" }}>
              {customerPhone(p.order as any)}
            </span>
          </div>
          <div className="mt-5">
            <div className="inline-block p-2 border border-slate-200">
              <Barcode value={inv} />
              <div className="text-[10px] font-mono mt-1 text-center tracking-[0.3em] text-slate-500">{inv}</div>
            </div>
          </div>
        </div>

        <div className="col-span-5 pl-7" style={{ borderLeft: "2px solid #f1f5f9" }}>
          <div className="text-right font-black italic uppercase tracking-tighter leading-none mb-5" style={{ fontSize: 42, color: "#e2e8f0" }}>Invoice</div>
          <div className="space-y-2.5">
            <MetaLine k="Invoice ID" v={<span className="font-bold">{inv}</span>} />
            {p.cfg.meta.showDate && <MetaLine k="Date" v={<span className="font-bold">{format(new Date(p.order.created_at), "yyyy-MM-dd")}</span>} />}
            <MetaLine k="Item Count" v={<span className="font-bold">{itemCount}</span>} />
            {p.cfg.meta.showPayment && (
              <MetaLine k="Payment" v={
                <span className="px-2 py-0.5 rounded font-bold uppercase text-[10px]" style={{ background: "#dcfce7", color: "#166534" }}>
                  {p.order.payment_method || "COD"}
                </span>
              } />
            )}
            {(p.cfg.meta.showCourier || p.cfg.meta.showTracking) && <div className="pt-2" style={{ borderTop: "1px solid #f1f5f9" }} />}
            {p.cfg.meta.showCourier && <MetaLine k="Partner" v={<span className="font-bold capitalize">{p.order.courier_name || "—"}</span>} />}
            {p.cfg.meta.showTracking && <MetaLine k="Tracking ID" v={<span className="font-mono font-medium">{p.order.tracking_number || "—"}</span>} />}
          </div>
        </div>
      </div>

      {/* ITEMS TABLE */}
      <div className="relative z-10">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr style={{ borderTop: "2px solid #0f172a", borderBottom: "2px solid #0f172a" }}>
              <th className="py-3 px-2 text-[10px] font-bold uppercase tracking-widest w-10">#</th>
              <th className="py-3 px-2 text-[10px] font-bold uppercase tracking-widest">Item Description</th>
              <th className="py-3 px-2 text-[10px] font-bold uppercase tracking-widest text-center w-20">Details</th>
              <th className="py-3 px-2 text-[10px] font-bold uppercase tracking-widest text-right w-24">Price</th>
              <th className="py-3 px-2 text-[10px] font-bold uppercase tracking-widest text-center w-12">Qty</th>
              <th className="py-3 px-2 text-[10px] font-bold uppercase tracking-widest text-right w-24">Total</th>
            </tr>
          </thead>
          <tbody>
            {p.items.map((it, i) => {
              const up = Number(it.unit_price ?? it.price ?? 0);
              const lt = Number(it.line_total ?? up * Number(it.quantity || 0));
              return (
                <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td className="py-5 px-2 align-top text-[13px] text-slate-400 font-medium">{String(i + 1).padStart(2, "0")}</td>
                  <td className="py-5 px-2 align-top">
                    <div className="flex gap-3">
                      {it.image && (
                        <img src={it.image} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 4 }} className="flex-shrink-0" />
                      )}
                      <div className="space-y-1">
                        <div className="text-[13px] font-bold leading-tight">{it.name}</div>
                        {it.variant_label && <div className="text-[11px] text-slate-500">{it.variant_label}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="py-5 px-2 align-top text-center text-[11px] font-bold text-slate-400">—</td>
                  <td className="py-5 px-2 align-top text-right text-[13px] font-medium">{p.cfg.items.currency} {Number(up).toFixed(1)}</td>
                  <td className="py-5 px-2 align-top text-center text-[13px]">{it.quantity}</td>
                  <td className="py-5 px-2 align-top text-right text-[13px] font-bold">{p.cfg.items.currency} {Number(lt).toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {p.order.shipping_note && (
          <div className="text-[11px] py-2 px-2 flex gap-2 items-start" style={{ borderBottom: "1px solid #f1f5f9" }}>
            <span className="font-bold" style={{ color: callout }}>Note:</span>
            <span className="text-slate-700">{p.order.shipping_note}</span>
          </div>
        )}
      </div>

      {/* TOTALS */}
      <div className="relative z-10 flex justify-end mt-7">
        <div className="w-80 space-y-2.5">
          {p.cfg.totals.showSubtotal && (
            <div className="flex justify-between text-[13px]">
              <span className="text-slate-500">Sub Total</span>
              <span className="font-medium">{p.cfg.items.currency} {Number(t.subtotal).toFixed(1)}</span>
            </div>
          )}
          {p.cfg.totals.showDiscount && t.discount > 0 && (
            <div className="flex justify-between text-[13px]">
              <span className="text-slate-500">Discount</span>
              <span className="font-medium">− {p.cfg.items.currency} {Number(t.discount).toFixed(1)}</span>
            </div>
          )}
          {p.cfg.totals.showShipping && (
            <div className="flex justify-between text-[13px]">
              <span className="text-slate-500">Shipping Fee</span>
              <span className="font-medium">+ {p.cfg.items.currency} {Number(t.shipping).toFixed(1)}</span>
            </div>
          )}
          {p.cfg.totals.tax.rate > 0 && (
            <div className="flex justify-between text-[13px]">
              <span className="text-slate-500">VAT ({p.cfg.totals.tax.rate}%)</span>
              <span className="font-medium">{p.cfg.items.currency} {Number(t.tax).toFixed(1)}</span>
            </div>
          )}
          <div className="flex justify-between items-center py-2" style={{ borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9" }}>
            <span className="text-[13px] font-black uppercase tracking-wider">Total</span>
            <span className="text-[22px] font-black">{p.cfg.items.currency} {Number(t.total).toFixed(1)}</span>
          </div>
          {p.cfg.totals.showAdvance && t.advance > 0 && (
            <div className="flex justify-between text-[13px] text-slate-500 italic">
              <span>Advance Paid</span>
              <span>− {p.cfg.items.currency} {Number(t.advance).toFixed(1)}</span>
            </div>
          )}
          {p.cfg.totals.showDue && t.due > 0 && (
            <div className="flex justify-between items-center p-3 mt-1" style={{ background: "#0f172a", color: "#fff" }}>
              <span className="text-[11px] font-bold uppercase tracking-widest">Amount Due</span>
              <span className="text-[22px] font-black">{p.cfg.items.currency} {Number(t.due).toFixed(1)}</span>
            </div>
          )}
          {inWords && (
            <div className="text-right text-[10px] text-slate-400 font-medium italic mt-2">
              In Words: {inWords}
            </div>
          )}
        </div>
      </div>

      {/* RIDER NOTE */}
      {(p.order.customer_note || p.cfg.business.whatsapp) && (
        <div className="relative z-10 mt-10 flex gap-4 p-4" style={{ background: "#fef2f2", borderLeft: `4px solid ${callout}` }}>
          <div style={{ color: callout }} className="pt-0.5">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div>
            <div className="text-[11px] font-black uppercase tracking-widest mb-1" style={{ color: "#b91c1c" }}>
              Note for Rider / রাইডারের জন্য নির্দেশনা:
            </div>
            {p.order.customer_note && <div className="text-[12px] font-medium" style={{ color: callout }}>{p.order.customer_note}</div>}
            {p.cfg.business.whatsapp && <div className="text-[12px] font-medium" style={{ color: callout }}>WhatsApp: {p.cfg.business.whatsapp}</div>}
          </div>
        </div>
      )}

      {/* CALLOUTS */}
      <div className="relative z-10 grid grid-cols-2 gap-4 mt-6">
        <div className="p-4 rounded-lg flex items-center justify-between" style={{ border: "2px solid #f1f5f9" }}>
          <div>
            <div className="font-bold text-[14px] tracking-tight">আমাদের মতামত দিন</div>
            <div className="text-[11px] text-slate-500 mt-0.5">আপনার মতামত আমাদের সাহায্য করে</div>
          </div>
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400" style={{ background: "#f8fafc" }}>
            <svg width="18" height="18" fill="currentColor" viewBox="0 0 20 20"><path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"/></svg>
          </div>
        </div>
        <div className="p-4 rounded-lg flex items-center justify-between" style={{ border: "2px solid #f1f5f9" }}>
          <div>
            <div className="font-bold text-[14px] tracking-tight">আমাদের সাথে থাকুন</div>
            <div className="text-[11px] text-slate-500 mt-0.5">গ্রুপে যোগ দিন এক্সক্লুসিভ অফার পেতে</div>
          </div>
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400" style={{ background: "#f8fafc" }}>
            <svg width="18" height="18" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/></svg>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="relative z-10 mt-10 pt-7" style={{ borderTop: "1px solid #f1f5f9" }}>
        <div className="flex justify-between items-end text-[10px] uppercase tracking-widest text-slate-400">
          <div className="space-y-2">
            <div className="font-black text-slate-900">Thank you for choosing us</div>
            {p.cfg.footer.returnPolicy && (
              <ol className="list-decimal pl-4 normal-case tracking-normal space-y-0.5 text-slate-500">
                {p.cfg.footer.returnPolicy.split(/\n+/).filter(Boolean).map((line, i) => (
                  <li key={i} className="text-[10px]">{line.replace(/^\d+\.\s*/, "")}</li>
                ))}
              </ol>
            )}
          </div>
          <div className="text-right space-y-1.5">
            {p.cfg.business.website && <div>Visit: <span className="font-bold text-slate-900">{p.cfg.business.website}</span></div>}
            {p.cfg.business.hotline && <div>Support: <span className="font-bold text-slate-900">{p.cfg.business.hotline}</span></div>}
            <div>© {new Date().getFullYear()} {p.brandName}. All Rights Reserved</div>
          </div>
        </div>
        <div className="mt-6 text-[9px] text-center text-slate-300 normal-case italic leading-tight max-w-lg mx-auto">
          This document &amp; any information transmitted with it are confidential &amp; intended solely for the use of the individual or entity to whom they are addressed.
        </div>
      </footer>
    </div>
  );
}

function MetaLine({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center text-[11.5px]">
      <span className="text-slate-500 uppercase tracking-wider font-semibold">{k}</span>
      <span>{v}</span>
    </div>
  );
}
