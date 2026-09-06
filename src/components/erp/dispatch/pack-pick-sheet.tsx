import * as React from "react";
import { format } from "date-fns";
import { code128Bars } from "@/lib/erp/utils/barcode";
import { getDocBranding } from "@/lib/erp/utils/doc-branding";

/* ------------------------------------------------------------------ types */

export type SheetItem = {
  name: string;
  variant_label?: string | null;
  quantity: number;
  price?: number | null;
  image?: string | null;
  sku?: string | null;
  product?: { sku: string | null } | null;
  variant?: { sku: string | null } | null;
};

export type SheetOrder = {
  id: string;
  invoice_no: string | null;
  brand_id?: string | null;
  shipping_name?: string | null;
  guest_name?: string | null;
  shipping_phone?: string | null;
  guest_phone?: string | null;
  shipping_address?: string | null;
  shipping_thana?: string | null;
  shipping_city?: string | null;
  payment_method?: string | null;
  courier_name?: string | null;
  tracking_number?: string | null;
  total?: number | null;
  advance_amount?: number | null;
  shipping_note?: string | null;
  customer_note?: string | null;
  printed_at?: string | null;
  status?: string | null;
  items?: SheetItem[];
};

export type SheetMode = "order" | "product" | "sku";

export type SheetOptions = {
  showImages: boolean;
  showBarcodes: boolean;
  showBins: boolean;
  paper: "a4" | "a5";
};

export const DEFAULT_SHEET_OPTIONS: SheetOptions = {
  showImages: true,
  showBarcodes: true,
  showBins: true,
  paper: "a4",
};

/* -------------------------------------------------------------- utilities */

export function itemSku(it: SheetItem): string | null {
  return it.sku ?? it.variant?.sku ?? it.product?.sku ?? null;
}

function orderName(o: SheetOrder) {
  return o.shipping_name ?? o.guest_name ?? "—";
}
function orderPhone(o: SheetOrder) {
  return o.shipping_phone ?? o.guest_phone ?? "";
}
function orderNote(o: SheetOrder) {
  return [o.shipping_note, o.customer_note].map((n) => (n ?? "").trim()).filter(Boolean).join(" · ");
}
function isCod(o: SheetOrder) {
  const m = (o.payment_method ?? "").toLowerCase();
  return !m || m.includes("cod") || m.includes("cash");
}
function codDue(o: SheetOrder) {
  const total = Number(o.total ?? 0);
  const adv = Number(o.advance_amount ?? 0);
  return Math.max(0, total - adv);
}
function money(n: number) {
  return `৳${Math.round(n).toLocaleString("en-BD")}`;
}

export function sheetNo(mode: SheetMode) {
  const p = mode === "order" ? "PACK" : mode === "product" ? "PICK" : "SKU";
  return `${p}-${format(new Date(), "yyMMdd-HHmm")}`;
}

/** Order-wise ordering: multi-SKU first → noted → rest. */
export function sortOrdersForPacking(orders: SheetOrder[]): SheetOrder[] {
  const rank = (o: SheetOrder) => {
    const distinct = new Set((o.items ?? []).map((i) => `${i.name}|${i.variant_label ?? ""}`)).size;
    if (distinct > 1) return 0;
    if (orderNote(o)) return 1;
    return 2;
  };
  return [...orders].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    const ua = (a.items ?? []).reduce((s, i) => s + i.quantity, 0);
    const ub = (b.items ?? []).reduce((s, i) => s + i.quantity, 0);
    if (ub !== ua) return ub - ua;
    return (a.invoice_no ?? "").localeCompare(b.invoice_no ?? "");
  });
}

/* ------------------------------------------------- unified dispatch ordering */

export type DispatchRow = {
  order: SheetOrder;
  serial: number;
  groupKey: string;
  groupLabel: string;
  distinct: number;
  units: number;
  isMulti: boolean;
};

function itemKey(it: SheetItem) {
  return itemSku(it) ?? `${it.name}|${it.variant_label ?? ""}`;
}
function itemLabel(it: SheetItem) {
  return itemSku(it) ?? [it.name, it.variant_label].filter(Boolean).join(" · ");
}

/**
 * Canonical print flow shared by invoices + pack list + picking list.
 * Orders are grouped by their dominant SKU (the SKU with the most orders prints
 * first). Inside a group, single-piece orders come first and every multi-piece /
 * multi-product order stacks together at the end. Mixed-product orders form a
 * final group so packers handle them in one go.
 */
export function sortOrdersForDispatch(orders: SheetOrder[]): DispatchRow[] {
  const skuOrders = new Map<string, number>();
  const skuUnits = new Map<string, number>();
  for (const o of orders) {
    const seen = new Set<string>();
    for (const it of o.items ?? []) {
      const k = itemKey(it);
      skuUnits.set(k, (skuUnits.get(k) ?? 0) + it.quantity);
      if (!seen.has(k)) {
        seen.add(k);
        skuOrders.set(k, (skuOrders.get(k) ?? 0) + 1);
      }
    }
  }

  const MIXED = "\uffffMIXED";
  const meta = orders.map((o) => {
    const items = o.items ?? [];
    const keys = new Set(items.map(itemKey));
    const distinct = keys.size;
    const units = items.reduce((s, i) => s + i.quantity, 0);
    let primary = items[0] ? itemKey(items[0]) : "";
    let label = items[0] ? itemLabel(items[0]) : "—";
    let best = -1;
    for (const it of items) {
      const k = itemKey(it);
      const c = skuOrders.get(k) ?? 0;
      if (c > best) {
        best = c;
        primary = k;
        label = itemLabel(it);
      }
    }
    const mixed = distinct > 1;
    return {
      order: o,
      groupKey: mixed ? MIXED : primary,
      groupLabel: mixed ? "Mixed / multi-product" : label,
      distinct,
      units,
      isMulti: mixed || units > 1,
    };
  });

  const groupRank = (key: string) => (key === MIXED ? -1 : (skuOrders.get(key) ?? 0));
  const groupUnits = (key: string) => (key === MIXED ? -1 : (skuUnits.get(key) ?? 0));

  meta.sort((a, b) => {
    if (a.groupKey !== b.groupKey) {
      if (a.groupKey === MIXED) return 1;
      if (b.groupKey === MIXED) return -1;
      const r = groupRank(b.groupKey) - groupRank(a.groupKey);
      if (r !== 0) return r;
      const u = groupUnits(b.groupKey) - groupUnits(a.groupKey);
      if (u !== 0) return u;
      return a.groupKey.localeCompare(b.groupKey);
    }
    if (a.units !== b.units) return a.units - b.units; // singles first, extras stacked at the end
    return (a.order.invoice_no ?? "").localeCompare(b.order.invoice_no ?? "");
  });

  return meta.map((m, i) => ({ ...m, serial: i + 1 }));
}

/** Serial lookup keyed by order id — keeps invoices and sheets in one flow. */
export function dispatchSerialMap(rows: DispatchRow[]): Map<string, number> {
  return new Map(rows.map((r) => [r.order.id, r.serial]));
}


type PickRow = {
  name: string;
  variant: string | null;
  sku: string | null;
  image: string | null;
  qty: number;
  orders: number;
};

/** Product/SKU-wise aggregation: most demanded first. */
export function aggregateRows(orders: SheetOrder[], by: "product" | "sku"): PickRow[] {
  const map = new Map<string, PickRow>();
  for (const o of orders) {
    const seen = new Set<string>();
    for (const it of o.items ?? []) {
      const sku = itemSku(it);
      const key =
        by === "sku" ? (sku ?? `${it.name}|${it.variant_label ?? ""}`) : `${it.name}|${it.variant_label ?? ""}`;
      const row =
        map.get(key) ??
        ({ name: it.name, variant: it.variant_label ?? null, sku, image: it.image ?? null, qty: 0, orders: 0 } as PickRow);
      row.qty += it.quantity;
      if (!row.image && it.image) row.image = it.image;
      if (!row.sku && sku) row.sku = sku;
      if (!seen.has(key)) {
        row.orders += 1;
        seen.add(key);
      }
      map.set(key, row);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.qty - a.qty || b.orders - a.orders || a.name.localeCompare(b.name));
}

/* -------------------------------------------------------------- primitives */

const INK = "#111113";
const LINE = "#dcdce1";
const SOFT = "#f6f6f7";
const MUTE = "#76767e";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

/** Tick box — clean hairline square, generous for a pen tick. */
export function TickBox({ size = 16 }: { size?: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: `1.2px solid ${INK}`,
        borderRadius: 3,
        background: "#fff",
      }}
    />
  );
}

/** Serial — quiet outlined numeral, tabular so columns line up. */
export function SerialChip({ n, size = 24 }: { n: number; size?: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        minWidth: size,
        height: size,
        lineHeight: `${size - 2}px`,
        padding: "0 4px",
        textAlign: "center",
        border: `1px solid ${INK}`,
        borderRadius: 4,
        fontSize: size * 0.5,
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
        background: "#fff",
      }}
    >
      {n}
    </span>
  );
}

function Tag({ text, tone = "plain" }: { text: string; tone?: "plain" | "alert" | "note" | "good" }) {
  const map = {
    plain: { border: LINE, color: MUTE, bg: "#fff" },
    alert: { border: INK, color: INK, bg: "#fff" },
    note: { border: "#c8a600", color: "#7a5c00", bg: "#fffbe8" },
    good: { border: "#1f8a4c", color: "#166534", bg: "#f2fbf5" },
  }[tone];
  return (
    <span
      style={{
        fontSize: 8.5,
        fontWeight: 700,
        letterSpacing: 0.8,
        padding: "1px 6px",
        borderRadius: 3,
        border: `1px solid ${map.border}`,
        color: map.color,
        background: map.bg,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function Barcode({ value, height = 24 }: { value: string; height?: number }) {
  const bars = React.useMemo(() => code128Bars(value), [value]);
  if (bars.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", height, gap: 0 }}>
      {bars.map((w, i) => (
        <span
          key={i}
          style={{ width: w, height: "100%", background: i % 2 === 0 ? INK : "transparent", display: "inline-block" }}
        />
      ))}
    </div>
  );
}

function Header({
  title,
  kicker,
  no,
  kpis,
  brandName,
  brandLogo,
}: {
  title: string;
  kicker: string;
  no: string;
  kpis: Array<{ label: string; value: number | string }>;
  brandName?: string | null;
  brandLogo?: string | null;
}) {
  const b = getDocBranding();
  const logo = brandLogo ?? b.logoUrl ?? "";
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 24 }}>
            {logo ? (
              <img
                src={logo}
                alt=""
                style={{ height: 22, maxWidth: 110, objectFit: "contain", objectPosition: "left center" }}
              />
            ) : null}
            <div style={{ fontSize: 8, letterSpacing: 2.6, fontWeight: 700, color: MUTE }}>
              {(brandName || b.company || "SWUS").toUpperCase()} · {kicker}
            </div>
          </div>
          <h1 style={{ fontSize: 19, fontWeight: 700, margin: "3px 0 0", letterSpacing: -0.5, lineHeight: 1.1 }}>
            {title}
          </h1>
          <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
            <Tag text={format(new Date(), "dd MMM yyyy · p").toUpperCase()} />
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 12.5, letterSpacing: 0.4 }}>{no}</div>
          <div style={{ fontSize: 9, color: MUTE, marginTop: 3 }}>Picker ____________</div>
          <div style={{ fontSize: 9, color: MUTE, marginTop: 2 }}>Checker ___________</div>
        </div>
      </div>

      <div
        style={{
          marginTop: 9,
          paddingTop: 6,
          borderTop: `1.5px solid ${INK}`,
          display: "flex",
          alignItems: "baseline",
          gap: 18,
          flexWrap: "wrap",
        }}
      >
        {kpis.map((k) => (
          <span key={k.label} style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}>
            <span style={{ fontSize: 8, letterSpacing: 1.4, color: MUTE, fontWeight: 700 }}>
              {k.label.toUpperCase()}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{k.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Signatures({ sheetNoText }: { sheetNoText?: string }) {
  return (
    <div style={{ marginTop: 22, pageBreakInside: "avoid" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 26, fontSize: 9.5 }}>
        {["Picked by", "Checked by", "Dispatched by"].map((l) => (
          <div key={l}>
            <div style={{ height: 22 }} />
            <div style={{ borderTop: `1px solid ${INK}`, paddingTop: 3, fontWeight: 600, letterSpacing: 0.4 }}>{l}</div>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 12,
          paddingTop: 5,
          borderTop: `1px solid ${LINE}`,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 8,
          color: "#a1a1aa",
          letterSpacing: 0.6,
        }}
      >
        <span>{sheetNoText ?? ""}</span>
        <span>SWUS ERP · {format(new Date(), "PP p")}</span>
      </div>
    </div>
  );
}

const pageStyle = (paper: "a4" | "a5"): React.CSSProperties => ({
  padding: paper === "a4" ? "14mm 12mm" : "9mm 8mm",
  fontSize: paper === "a4" ? 11.5 : 10,
  lineHeight: 1.35,
  color: INK,
});

const th = (w?: number, align: "left" | "right" | "center" = "center"): React.CSSProperties => ({
  padding: "5px 8px",
  textAlign: align,
  fontSize: 8,
  letterSpacing: 1.4,
  fontWeight: 700,
  color: MUTE,
  width: w,
  borderBottom: `1px solid ${INK}`,
  whiteSpace: "nowrap",
});
const td = (align: "left" | "right" | "center" = "left"): React.CSSProperties => ({
  padding: "7px 8px",
  textAlign: align,
  verticalAlign: "middle",
});

/** Big boxed quantity — the number pickers actually read. */
function QtyBox({ n, size = 18 }: { n: number; size?: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        minWidth: size + 14,
        padding: "1px 7px",
        border: `1.2px solid ${INK}`,
        borderRadius: 4,
        fontSize: size,
        fontWeight: 700,
        lineHeight: 1.25,
        fontVariantNumeric: "tabular-nums",
        textAlign: "center",
      }}
    >
      {n}
    </span>
  );
}

function BinLine({ w = 52 }: { w?: number }) {
  return <span style={{ display: "inline-block", minWidth: w, borderBottom: `1px solid ${LINE}`, height: 13 }} />;
}

/* ------------------------------------------------------- product / sku sheet */

export function PickSheet({
  orders,
  by = "product",
  options = DEFAULT_SHEET_OPTIONS,
  brandName,
  brandLogo,
}: {
  orders: SheetOrder[];
  by?: "product" | "sku";
  options?: SheetOptions;
  brandName?: string | null;
  brandLogo?: string | null;
}) {
  const rows = aggregateRows(orders, by);
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const no = sheetNo(by === "sku" ? "sku" : "product");
  const isSku = by === "sku";
  const showImages = options.showImages && !isSku;

  return (
    <div className="bg-white text-black font-sans" style={pageStyle(options.paper)}>
      <Header
        kicker={isSku ? "SKU PICK SHEET" : "WAREHOUSE PICK SHEET"}
        title={isSku ? "SKU-wise Picking List" : "Product-wise Picking List"}
        no={no}
        brandName={brandName}
        brandLogo={brandLogo}
        kpis={[
          { label: "Orders", value: orders.length },
          { label: isSku ? "SKUs" : "Products", value: rows.length },
          { label: "Units", value: totalQty },
        ]}
      />

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
        <thead>
          <tr>
            <th style={th(26)}>✓</th>
            <th style={th(30)}>#</th>
            {showImages && <th style={th(42)} />}
            <th style={th(undefined, "left")}>{isSku ? "SKU" : "Product / Variant"}</th>
            {!isSku && <th style={th(options.showBarcodes ? 140 : 104, "left")}>SKU</th>}
            {isSku && options.showBarcodes && <th style={th(150, "left")}>Barcode</th>}
            <th style={th(52)}>Orders</th>
            <th style={th(58, "right")}>Qty</th>
            {options.showBins && <th style={th(60, "left")}>Bin</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={`${r.sku ?? r.name}-${i}`}
              style={{
                borderBottom: `1px solid ${LINE}`,
                background: i % 2 === 1 ? SOFT : "#fff",
                pageBreakInside: "avoid",
              }}
            >
              <td style={td("center")}>
                <TickBox />
              </td>
              <td style={td("center")}>
                <SerialChip n={i + 1} size={21} />
              </td>
              {showImages && (
                <td style={td("center")}>
                  {r.image ? (
                    <img
                      src={r.image}
                      alt=""
                      style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 3, border: `1px solid ${LINE}` }}
                    />
                  ) : (
                    <span
                      style={{ display: "inline-block", width: 32, height: 32, border: `1px dashed ${LINE}`, borderRadius: 3 }}
                    />
                  )}
                </td>
              )}
              <td style={td()}>
                {isSku ? (
                  <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 13, letterSpacing: 0.3 }}>
                    {r.sku ?? "—"}
                    <span style={{ fontFamily: "inherit", fontWeight: 500, color: MUTE, fontSize: 10, marginLeft: 8 }}>
                      {r.name}
                      {r.variant ? ` · ${r.variant}` : ""}
                    </span>
                  </div>
                ) : (
                  <>
                    <div style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.25 }}>{r.name}</div>
                    {r.variant && <div style={{ color: MUTE, fontSize: 10, marginTop: 1 }}>{r.variant}</div>}
                  </>
                )}
              </td>
              {!isSku && (
                <td style={{ ...td(), fontFamily: MONO, fontSize: 10 }}>
                  <div>{r.sku ?? "—"}</div>
                  {options.showBarcodes && r.sku && <Barcode value={r.sku} height={20} />}
                </td>
              )}
              {isSku && options.showBarcodes && (
                <td style={td()}>{r.sku ? <Barcode value={r.sku} height={22} /> : null}</td>
              )}
              <td style={{ ...td("center"), fontVariantNumeric: "tabular-nums", color: MUTE }}>{r.orders}</td>
              <td style={td("right")}>
                <QtyBox n={r.qty} size={isSku ? 19 : 17} />
              </td>
              {options.showBins && (
                <td style={td()}>
                  <BinLine />
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: `1.5px solid ${INK}` }}>
            <td
              colSpan={2 + (showImages ? 1 : 0) + 1 + (isSku ? (options.showBarcodes ? 1 : 0) : 1) + 1}
              style={{ ...td("right"), fontWeight: 700, letterSpacing: 1.4, fontSize: 9, color: MUTE }}
            >
              GRAND TOTAL
            </td>
            <td style={td("right")}>
              <QtyBox n={totalQty} size={19} />
            </td>
            {options.showBins && <td style={td()} />}
          </tr>
        </tfoot>
      </table>

      <Signatures sheetNoText={no} />
    </div>
  );
}

/* --------------------------------------------------------------- pack sheet */

function GroupBar({ label, count, units }: { label: string; count: number; units: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 10,
        marginTop: 3,
        paddingBottom: 3,
        borderBottom: `1px solid ${INK}`,
        pageBreakAfter: "avoid",
      }}
    >
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 8.5, color: MUTE, fontWeight: 700, letterSpacing: 1 }}>
        {count} ORDER{count === 1 ? "" : "S"} · {units} PCS
      </span>
    </div>
  );
}

export function PackSheet({
  orders,
  options = DEFAULT_SHEET_OPTIONS,
  brandName,
  brandLogo,
  serials,
}: {
  orders: SheetOrder[];
  options?: SheetOptions;
  brandName?: string | null;
  brandLogo?: string | null;
  serials?: Map<string, number>;
}) {
  const rows = sortOrdersForDispatch(orders);
  const totalUnits = rows.reduce((s, r) => s + r.units, 0);
  const multi = rows.filter((r) => r.isMulti).length;
  const noted = rows.filter((r) => !!orderNote(r.order)).length;
  const no = sheetNo("order");

  return (
    <div className="bg-white text-black font-sans" style={pageStyle(options.paper)}>
      <Header
        kicker="PACKING FLOOR · PACK LIST"
        title="Order-wise Pack List"
        no={no}
        brandName={brandName}
        brandLogo={brandLogo}
        kpis={[
          { label: "Orders", value: rows.length },
          { label: "Multi / extra qty", value: multi },
          { label: "Noted", value: noted },
          { label: "Units", value: totalUnits },
        ]}
      />

      <div style={{ display: "grid", gap: 7 }}>
        {rows.map((r, i) => {
          const o = r.order;
          const items = o.items ?? [];
          const units = r.units;
          const distinct = r.distinct;
          const note = orderNote(o);
          const inv = o.invoice_no ?? o.id.slice(0, 8);
          const place = [o.shipping_thana, o.shipping_city].filter(Boolean).join(", ");
          const serial = serials?.get(o.id) ?? r.serial;
          const newGroup = i === 0 || rows[i - 1]!.groupKey !== r.groupKey;
          const groupRows = newGroup ? rows.filter((x) => x.groupKey === r.groupKey) : [];
          return (
            <React.Fragment key={o.id}>
            {newGroup && (
              <GroupBar
                label={r.groupLabel}
                count={groupRows.length}
                units={groupRows.reduce((s, x) => s + x.units, 0)}
              />
            )}
            <div
              style={{
                border: `1px solid ${r.isMulti ? INK : LINE}`,
                borderLeft: r.isMulti ? `4px solid ${INK}` : `1px solid ${LINE}`,
                borderRadius: 5,
                overflow: "hidden",
                pageBreakInside: "avoid",
                position: "relative",
              }}
            >
              {/* head */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 11px 6px" }}>
                <SerialChip n={serial} size={26} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 12.5 }}>#{inv}</span>
                    {units > 1 && <Tag text={`× ${units} PCS`} tone="alert" />}
                    {distinct > 1 && <Tag text={`${distinct} ITEMS`} tone="alert" />}
                    {Number(o.advance_amount ?? 0) > 0 && (
                      <Tag text={`ADVANCE ${money(Number(o.advance_amount))}`} tone="good" />
                    )}
                    {(o.status ?? "").includes("exchange") && <Tag text="EXCHANGE" tone="note" />}
                    {o.printed_at && <Tag text="REPRINT" tone="note" />}
                  </div>
                  <div style={{ fontSize: 10.5, marginTop: 2, fontWeight: 600 }}>{orderName(o)}</div>
                  <div style={{ fontSize: 9.5, color: MUTE, marginTop: 1 }}>
                    {[orderPhone(o), place, o.courier_name].filter(Boolean).join("  ·  ")}
                  </div>
                </div>

                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 8, letterSpacing: 1.4, color: MUTE, fontWeight: 700 }}>
                    {isCod(o) ? "COD DUE" : "PREPAID"}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1.25 }}>
                    {isCod(o) ? money(codDue(o)) : money(0)}
                  </div>
                  {options.showBarcodes && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 3 }}>
                      <Barcode value={inv} height={20} />
                    </div>
                  )}
                </div>
              </div>

              {note && (
                <div
                  style={{
                    margin: "0 11px 6px",
                    padding: "4px 8px",
                    background: "#fffbe8",
                    border: "1px solid #eddda0",
                    borderRadius: 4,
                    fontSize: 10,
                    color: "#7a5c00",
                    fontWeight: 600,
                  }}
                >
                  NOTE · {note}
                </div>
              )}

              {/* items */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <tbody>
                  {items.map((it, ii) => (
                    <tr key={ii} style={{ borderTop: `1px solid ${LINE}`, background: ii % 2 === 1 ? SOFT : "#fff" }}>
                      <td style={{ ...td("center"), width: 26 }}>
                        <TickBox size={15} />
                      </td>
                      {options.showImages && (
                        <td style={{ ...td("center"), width: 40 }}>
                          {it.image ? (
                            <img
                              src={it.image}
                              alt=""
                              style={{
                                width: 28,
                                height: 28,
                                objectFit: "cover",
                                borderRadius: 3,
                                border: `1px solid ${LINE}`,
                              }}
                            />
                          ) : (
                            <span
                              style={{
                                display: "inline-block",
                                width: 28,
                                height: 28,
                                border: `1px dashed ${LINE}`,
                                borderRadius: 3,
                              }}
                            />
                          )}
                        </td>
                      )}
                      <td style={td()}>
                        <div style={{ fontWeight: 600 }}>{it.name}</div>
                        {it.variant_label && <div style={{ fontSize: 9.5, color: MUTE }}>{it.variant_label}</div>}
                      </td>
                      <td style={{ ...td(), width: 116, fontFamily: MONO, fontSize: 9.5, color: MUTE }}>
                        {itemSku(it) ?? "—"}
                      </td>
                      <td style={{ ...td("right"), width: 54 }}>
                        <QtyBox n={it.quantity} size={15} />
                      </td>
                      {options.showBins && (
                        <td style={{ ...td(), width: 56 }}>
                          <BinLine w={44} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "5px 11px",
                  borderTop: `1px solid ${INK}`,
                  fontSize: 9.5,
                  color: MUTE,
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  Packed ____________ · Verified <TickBox size={13} />
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, letterSpacing: 1 }}>
                  TOTAL PIECES <QtyBox n={units} size={14} />
                </span>
              </div>
            </div>
            </React.Fragment>
          );
        })}
      </div>

      <Signatures sheetNoText={no} />
    </div>
  );
}
