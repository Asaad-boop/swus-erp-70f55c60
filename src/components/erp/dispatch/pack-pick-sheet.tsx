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

/** Clean tick box — rounded square with a faint inner ✓ guide for the pen. */
export function TickBox({ size = 15 }: { size?: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        border: "1.5px solid #3f3f46",
        borderRadius: 4,
        background: "#fff",
        color: "#d4d4d8",
        fontSize: size - 5,
        fontWeight: 900,
        lineHeight: 1,
      }}
    >
      ✓
    </span>
  );
}

/** Serial number chip — calm black rounded square, consistent sizing. */
export function SerialChip({ n, size = 28 }: { n: number; size?: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        minWidth: size,
        height: size,
        lineHeight: `${size}px`,
        textAlign: "center",
        background: "#18181b",
        color: "#fff",
        borderRadius: 7,
        fontSize: size * 0.52,
        fontWeight: 800,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {n}
    </span>
  );
}

function Barcode({ value, height = 26 }: { value: string; height?: number }) {
  const bars = React.useMemo(() => code128Bars(value), [value]);
  if (bars.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", height, gap: 0 }}>
      {bars.map((w, i) => (
        <span
          key={i}
          style={{ width: w, height: "100%", background: i % 2 === 0 ? "#000" : "transparent", display: "inline-block" }}
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
}: {
  title: string;
  kicker: string;
  no: string;
  kpis: Array<{ label: string; value: number | string }>;
  brandName?: string | null;
}) {
  const b = getDocBranding();
  const initial = (b.company || "S").trim().charAt(0).toUpperCase();
  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "stretch",
          gap: 14,
          paddingBottom: 10,
          marginBottom: 10,
          borderBottom: "2px solid #18181b",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 9,
              background: "#18181b",
              color: "#fff",
              fontSize: 19,
              fontWeight: 900,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {initial}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 8.5, letterSpacing: 3, fontWeight: 800, color: "#4F46E5" }}>
              {b.company.toUpperCase()} · {kicker}
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: "2px 0 0", letterSpacing: -0.4, lineHeight: 1.15 }}>
              {title}
            </h1>
            {brandName && (
              <div
                style={{
                  display: "inline-block",
                  marginTop: 4,
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: 1,
                  padding: "1px 8px",
                  borderRadius: 999,
                  border: "1px solid #111",
                }}
              >
                BRAND · {brandName.toUpperCase()}
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: 10.5, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div
              style={{
                display: "inline-block",
                fontFamily: "ui-monospace, Menlo, monospace",
                fontWeight: 800,
                fontSize: 12,
                padding: "3px 10px",
                border: "1.5px solid #111",
                borderRadius: 6,
              }}
            >
              {no}
            </div>
            <div style={{ color: "#555", marginTop: 4 }}>{format(new Date(), "PPP · p")}</div>
          </div>
          <div style={{ fontSize: 9.5, color: "#555" }}>Picker: __________ · Checker: __________</div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 12,
          border: "1px solid #e4e4e7",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        {kpis.map((k, i) => (
          <div
            key={k.label}
            style={{
              flex: 1,
              padding: "5px 12px 6px",
              background: "#fafafa",
              borderLeft: i === 0 ? undefined : "1px solid #e4e4e7",
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 8.5, letterSpacing: 1.4, color: "#71717a", fontWeight: 700 }}>
              {k.label.toUpperCase()}
            </span>
            <span style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              {k.value}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function Signatures({ sheetNoText }: { sheetNoText?: string }) {
  return (
    <div style={{ marginTop: 26, pageBreakInside: "avoid" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 28,
          fontSize: 10,
          color: "#444",
        }}
      >
        {["Picked by", "Checked by", "Dispatched by"].map((l) => (
          <div key={l} style={{ textAlign: "center" }}>
            <div style={{ borderTop: "1.5px solid #111", paddingTop: 4, fontWeight: 700, letterSpacing: 0.5 }}>
              {l}
            </div>
            <div style={{ fontSize: 8.5, color: "#888", marginTop: 1 }}>Name & signature</div>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 14,
          paddingTop: 6,
          borderTop: "1px dashed #bbb",
          display: "flex",
          justifyContent: "space-between",
          fontSize: 8.5,
          color: "#999",
          letterSpacing: 0.5,
        }}
      >
        <span>{sheetNoText ?? ""}</span>
        <span>Generated by SWUS ERP · {format(new Date(), "PP p")}</span>
      </div>
    </div>
  );
}

const pageStyle = (paper: "a4" | "a5"): React.CSSProperties => ({
  padding: paper === "a4" ? "16mm 13mm" : "10mm 9mm",
  fontSize: paper === "a4" ? 12 : 10.5,
  lineHeight: 1.35,
});

const th = (w?: number): React.CSSProperties => ({
  padding: "7px 8px",
  textAlign: "center",
  fontSize: 9.5,
  letterSpacing: 1,
  fontWeight: 700,
  width: w,
});
const td = (align: "left" | "right" | "center" = "left"): React.CSSProperties => ({
  padding: "7px 8px",
  textAlign: align,
  verticalAlign: "top",
});

/* ------------------------------------------------------- product / sku sheet */

export function PickSheet({
  orders,
  by = "product",
  options = DEFAULT_SHEET_OPTIONS,
  brandName,
}: {
  orders: SheetOrder[];
  by?: "product" | "sku";
  options?: SheetOptions;
  brandName?: string | null;
}) {
  const rows = aggregateRows(orders, by);
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const no = sheetNo(by === "sku" ? "sku" : "product");

  return (
    <div className="bg-white text-black font-sans" style={pageStyle(options.paper)}>
      <Header
        kicker={by === "sku" ? "SKU PICK SHEET" : "WAREHOUSE PICK SHEET"}
        title={by === "sku" ? "SKU-wise Picking List" : "Product-wise Picking List"}
        no={no}
        brandName={brandName}
        kpis={[
          { label: "Orders", value: orders.length },
          { label: by === "sku" ? "SKUs" : "Products", value: rows.length },
          { label: "Total Units", value: totalQty },
        ]}
      />

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, border: "1px solid #d4d4d8" }}>
        <thead>
          <tr style={{ background: "#18181b", color: "#fff" }}>
            <th style={th(30)}>✓</th>
            <th style={th(34)}>#</th>
            {options.showImages && <th style={th(46)} />}
            <th style={{ ...th(), textAlign: "left" }}>Product / Variant</th>
            <th style={{ ...th(options.showBarcodes ? 150 : 110), textAlign: "left" }}>SKU</th>
            <th style={th(60)}>Orders</th>
            <th style={{ ...th(60), textAlign: "right" }}>Qty</th>
            {options.showBins && <th style={{ ...th(64), textAlign: "left" }}>Bin</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={`${r.sku ?? r.name}-${i}`}
              style={{
                background: i % 2 === 0 ? "#fff" : "#fafafa",
                borderBottom: "1px solid #e4e4e7",
                pageBreakInside: "avoid",
              }}
            >
              <td style={td("center")}>
                <TickBox />
              </td>
              <td style={td("center")}>
                <SerialChip n={i + 1} size={22} />
              </td>
              {options.showImages && (
                <td style={td("center")}>
                  {r.image ? (
                    <img
                      src={r.image}
                      alt=""
                      style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 4, border: "1px solid #ddd" }}
                    />
                  ) : (
                    <span style={{ display: "inline-block", width: 34, height: 34, border: "1px dashed #ccc", borderRadius: 4 }} />
                  )}
                </td>
              )}
              <td style={td()}>
                <div style={{ fontWeight: 700, fontSize: 12.5, lineHeight: 1.25 }}>{r.name}</div>
                {r.variant && <div style={{ color: "#444", fontSize: 10.5, marginTop: 1 }}>↳ {r.variant}</div>}
              </td>
              <td style={{ ...td(), fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10.5 }}>
                <div>{r.sku ?? "—"}</div>
                {options.showBarcodes && r.sku && <Barcode value={r.sku} height={22} />}
              </td>
              <td style={{ ...td("center"), fontVariantNumeric: "tabular-nums" }}>{r.orders}</td>
              <td style={{ ...td("right"), fontSize: 17, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                {r.qty}
              </td>
              {options.showBins && (
                <td style={td()}>
                  <span style={{ display: "inline-block", minWidth: 48, borderBottom: "1px solid #999", height: 14 }} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid #18181b", background: "#fafafa" }}>
            <td colSpan={options.showImages ? 6 : 5} style={{ ...td("right"), fontWeight: 800, letterSpacing: 1.5, fontSize: 10, color: "#3f3f46" }}>
              GRAND TOTAL
            </td>
            <td style={{ ...td("right"), fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
              {totalQty}
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

export function PackSheet({
  orders,
  options = DEFAULT_SHEET_OPTIONS,
  brandName,
}: {
  orders: SheetOrder[];
  options?: SheetOptions;
  brandName?: string | null;
}) {
  const sorted = sortOrdersForPacking(orders);
  const totalUnits = sorted.reduce((s, o) => s + (o.items ?? []).reduce((t, i) => t + i.quantity, 0), 0);
  const multi = sorted.filter((o) => new Set((o.items ?? []).map((i) => `${i.name}|${i.variant_label ?? ""}`)).size > 1).length;
  const noted = sorted.filter((o) => !!orderNote(o)).length;
  const no = sheetNo("order");

  return (
    <div className="bg-white text-black font-sans" style={pageStyle(options.paper)}>
      <Header
        kicker="PACKING FLOOR · PACK LIST"
        title="Order-wise Pack List"
        no={no}
        brandName={brandName}
        kpis={[
          { label: "Orders", value: sorted.length },
          { label: "Multi-item", value: multi },
          { label: "With note", value: noted },
          { label: "Total Units", value: totalUnits },
        ]}
      />

      <div style={{ display: "grid", gap: 8 }}>
        {sorted.map((o, i) => {
          const items = o.items ?? [];
          const units = items.reduce((s, it) => s + it.quantity, 0);
          const distinct = new Set(items.map((it) => `${it.name}|${it.variant_label ?? ""}`)).size;
          const note = orderNote(o);
          const inv = o.invoice_no ?? o.id.slice(0, 8);
          return (
            <div
              key={o.id}
              style={{
                border: "1.5px solid #111",
                borderLeft: "5px solid #111",
                borderRadius: 8,
                overflow: "hidden",
                pageBreakInside: "avoid",
                position: "relative",
              }}
            >
              {o.printed_at && (
                <span
                  style={{
                    position: "absolute",
                    right: 10,
                    top: 30,
                    fontSize: 30,
                    fontWeight: 900,
                    color: "rgba(0,0,0,0.06)",
                    letterSpacing: 4,
                  }}
                >
                  REPRINT
                </span>
              )}
              {/* order head */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "7px 12px",
                  background: "#f4f4f5",
                  borderBottom: "1.5px solid #111",
                }}
              >
                <span
                  style={{
                    fontSize: 17,
                    fontWeight: 900,
                    minWidth: 32,
                    height: 32,
                    lineHeight: "32px",
                    textAlign: "center",
                    background: "#111",
                    color: "#fff",
                    borderRadius: 8,
                  }}
                >
                  {i + 1}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 800, fontSize: 13 }}>
                      #{inv}
                    </span>
                    {distinct > 1 && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          padding: "1px 6px",
                          borderRadius: 999,
                          background: "#fee2e2",
                          border: "1px solid #ef4444",
                          color: "#991b1b",
                        }}
                      >
                        ⚠ {distinct} ITEMS
                      </span>
                    )}
                    {Number(o.advance_amount ?? 0) > 0 && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          padding: "1px 6px",
                          borderRadius: 999,
                          background: "#dcfce7",
                          border: "1px solid #16a34a",
                          color: "#166534",
                        }}
                      >
                        ADVANCE {money(Number(o.advance_amount))}
                      </span>
                    )}
                    {(o.status ?? "").includes("exchange") && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          padding: "1px 6px",
                          borderRadius: 999,
                          background: "#fef9c3",
                          border: "1px solid #ca8a04",
                          color: "#854d0e",
                        }}
                      >
                        EXCHANGE
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10.5, color: "#333", marginTop: 1 }}>
                    {orderName(o)} · {orderPhone(o)} · {[o.shipping_thana, o.shipping_city].filter(Boolean).join(", ")}
                    {o.courier_name ? ` · ${o.courier_name}` : ""}
                  </div>
                </div>
                <div
                  style={{
                    textAlign: "center",
                    border: "1.5px solid #111",
                    borderRadius: 8,
                    padding: "3px 12px",
                    background: isCod(o) ? "#fff" : "#dcfce7",
                  }}
                >
                  <div style={{ fontSize: 8, letterSpacing: 1.4, color: "#555", fontWeight: 800 }}>
                    {isCod(o) ? "COD DUE" : "PREPAID"}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1.15 }}>
                    {isCod(o) ? money(codDue(o)) : money(0)}
                  </div>
                </div>
                {options.showBarcodes && <Barcode value={inv} height={26} />}
              </div>

              {note && (
                <div
                  style={{
                    padding: "4px 10px",
                    background: "#fefce8",
                    borderBottom: "1px solid #fde68a",
                    fontSize: 10.5,
                    color: "#713f12",
                    fontWeight: 600,
                  }}
                >
                  📝 {note}
                </div>
              )}

              {/* items */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                <tbody>
                  {items.map((it, ii) => (
                    <tr key={ii} style={{ borderBottom: ii === items.length - 1 ? undefined : "1px dashed #e5e5e5" }}>
                      <td style={{ ...td("center"), width: 26 }}>
                        <span
                          style={{ display: "inline-block", width: 13, height: 13, border: "1.5px solid #111", borderRadius: 3 }}
                        />
                      </td>
                      {options.showImages && (
                        <td style={{ ...td("center"), width: 42 }}>
                          {it.image ? (
                            <img
                              src={it.image}
                              alt=""
                              style={{ width: 30, height: 30, objectFit: "cover", borderRadius: 4, border: "1px solid #ddd" }}
                            />
                          ) : (
                            <span style={{ display: "inline-block", width: 30, height: 30, border: "1px dashed #ccc", borderRadius: 4 }} />
                          )}
                        </td>
                      )}
                      <td style={td()}>
                        <div style={{ fontWeight: 700 }}>{it.name}</div>
                        {it.variant_label && <div style={{ fontSize: 10, color: "#444" }}>↳ {it.variant_label}</div>}
                      </td>
                      <td style={{ ...td(), width: 120, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10 }}>
                        {itemSku(it) ?? "—"}
                      </td>
                      <td style={{ ...td("right"), width: 54, fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                        ×{it.quantity}
                      </td>
                      {options.showBins && (
                        <td style={{ ...td(), width: 60 }}>
                          <span style={{ display: "inline-block", minWidth: 44, borderBottom: "1px solid #999", height: 12 }} />
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
                  padding: "5px 12px",
                  borderTop: "1.5px solid #111",
                  background: "#fafafa",
                  fontSize: 10.5,
                }}
              >
                <span style={{ color: "#555" }}>Packed by ____________ · Verified ☐</span>
                <span style={{ fontWeight: 800, letterSpacing: 0.5 }}>
                  TOTAL PIECES{" "}
                  <span
                    style={{
                      display: "inline-block",
                      marginLeft: 6,
                      fontSize: 15,
                      fontWeight: 900,
                      border: "1.5px solid #111",
                      borderRadius: 6,
                      padding: "0 8px",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {units}
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <Signatures sheetNoText={no} />
    </div>
  );
}
