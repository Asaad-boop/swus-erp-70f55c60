import Papa from "papaparse";

// ----- Pathao CSV → normalized groups -----

export type PathaoRow = {
  Consignment_ID?: string;
  Created_Date?: string;
  Invoice_type?: string;
  Collected_Amount?: string;
  Recipient_Name?: string;
  Recipient_Phone?: string;
  Collectable_Amount?: string;
  COD_fee?: string;
  Delivery_Fee?: string;
  Final_Fee?: string;
  Discount?: string;
  Additional_Charge?: string;
  Compensation_Cost?: string;
  Promo_Discount?: string;
  Payout?: string;
  Merchant_Order_ID?: string;
  Store_name?: string;
};

export type NormalizedRow = {
  consignment_id: string | null;
  merchant_order_id: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  invoice_date: string | null;
  collected: number;
  delivery_fee: number;
  cod_fee: number;
  other_fee: number;
  discount: number;
  total_fee: number;
  payout: number;
  store_name: string | null;
  raw: PathaoRow[];
  row_type: "paid" | "return" | "partial";
  return_fee: number;
  partial_amount: number;
  delivery_payout: number;
  insta_fee_amount: number;
  insta_fee_count: number;
  sub_row_count: number;
};

function num(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(String(v).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function cleanPhone(v: string | undefined): string | null {
  if (!v) return null;
  return String(v).replace(/"/g, "").trim() || null;
}

// Pathao often writes "N/A" / "-" when merchant id wasn't passed. Treat as null
// so server-side matching falls back to consignment_id / phone instead.
function cleanId(v: string | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s || /^(n\/?a|na|null|none|-+)$/i.test(s)) return null;
  return s;
}

export function getRowType(invoiceType: string | undefined): "paid" | "return" | "partial" {
  if (!invoiceType) return "paid";
  const t = invoiceType.toLowerCase();
  if (t.includes("return") || t.includes("reverse")) return "return";
  if (t.includes("partial")) return "partial";
  // `delivery` and `insta_fee` (extra delivery fee row, grouped with its
  // delivery row by Consignment_ID) both count as paid.
  return "paid";
}

export function parsePathaoCsv(text: string): NormalizedRow[] {
  const result = Papa.parse<PathaoRow>(text, {
    header: true,
    skipEmptyLines: true,
    // Real Pathao headers: "Consignment_ID, Created_Date, Invoice type,
    // Collected_Amount, Recipient_Name, Recipient_Phone, Collectable_Amount,
    // COD_fee, Delivery_Fee, Final_Fee, Discount, Additional_Charge,
    // Compensation_Cost, Promo_Discount, Payout, Merchant_Order_ID, Store_name".
    // "Invoice type" has a space — normalize to underscore for the typed shape.
    transformHeader: (h) => h.trim().replace(/\s+/g, "_"),
  });
  const rows = (result.data ?? []).filter(
    (r) => r && (r.Consignment_ID || r.Merchant_Order_ID),
  );

  // Group by consignment id (fallback: merchant order id)
  const groups = new Map<string, PathaoRow[]>();
  for (const r of rows) {
    const key = r.Consignment_ID || r.Merchant_Order_ID || Math.random().toString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const out: NormalizedRow[] = [];
  for (const [, rs] of groups) {
    // Prefer a "delivery" row, else fall back to the first
    const primary = rs.find((r) => (r.Invoice_type ?? "").toLowerCase() === "delivery") ?? rs[0];
    // Row type: detect from any row in the group (return/partial dominates)
    const types = rs.map((r) => getRowType(r.Invoice_type));
    let rowType: "paid" | "return" | "partial" =
      types.find((t) => t === "return") ?? types.find((t) => t === "partial") ?? "paid";
    // Aggregate across all sub-rows for this consignment (delivery + insta_fee, etc).
    const collected = rs.reduce((s, r) => s + num(r.Collected_Amount), 0);
    const payout = rs.reduce((s, r) => s + num(r.Payout), 0);
    const collectable = rs.reduce((s, r) => s + num(r.Collectable_Amount), 0);
    // Signal-based fallback: Pathao's Invoice_type label is inconsistent
    // (blank / "Delivery" for actual returns and partials). Trust the money
    // signals when the text says "paid" but the numbers say otherwise.
    //   collected == 0 AND payout < 0 → return (courier deducted a fee, no
    //     money collected from customer)
    //   0 < collected < collectable   → partial (customer paid less than
    //     the invoice amount)
    if (rowType === "paid") {
      if (collected <= 0 && payout < 0) rowType = "return";
      else if (collectable > 0 && collected > 0 && collected < collectable) rowType = "partial";
    }
    const deliveryFee = rs.reduce((s, r) => s + num(r.Delivery_Fee), 0);
    const codFee = rs.reduce((s, r) => s + num(r.COD_fee), 0);
    const discount = rs.reduce((s, r) => s + num(r.Discount) + num(r.Promo_Discount), 0);
    // insta_fee rows post their charge through Delivery_Fee / Final_Fee + negative
    // Payout, so `collected - payout` already captures every fee Pathao took.
    const otherFee = rs.reduce(
      (s, r) => s + num(r.Additional_Charge) + num(r.Compensation_Cost),
      0,
    );
    const totalFee = collected - payout;
    const dateStr = primary.Created_Date ? primary.Created_Date.slice(0, 10) : null;

    const returnFee = rowType === "return"
      ? rs.reduce(
          (s, r) => s + num(r.Final_Fee) + num(r.Delivery_Fee) + num(r.Additional_Charge),
          0,
        )
      : 0;
    const partialAmount = rowType === "partial" ? collected : 0;

    // Per-sub-row split: delivery vs insta_fee (Pathao posts insta as a
    // separate row under the same consignment with negative Payout).
    const deliveryPayout = rs
      .filter((r) => (r.Invoice_type ?? "").toLowerCase() === "delivery")
      .reduce((s, r) => s + num(r.Payout), 0);
    const instaRows = rs.filter((r) => (r.Invoice_type ?? "").toLowerCase().includes("insta"));
    const instaFeeAmount = instaRows.reduce((s, r) => s + Math.abs(num(r.Payout)), 0);

    out.push({
      consignment_id: cleanId(primary.Consignment_ID),
      merchant_order_id: cleanId(primary.Merchant_Order_ID),
      recipient_name: primary.Recipient_Name || null,
      recipient_phone: cleanPhone(primary.Recipient_Phone),
      invoice_date: dateStr,
      collected,
      delivery_fee: deliveryFee,
      cod_fee: codFee,
      other_fee: otherFee,
      discount,
      total_fee: totalFee,
      payout,
      store_name: primary.Store_name || null,
      raw: rs,
      row_type: rowType,
      return_fee: returnFee,
      partial_amount: partialAmount,
      delivery_payout: deliveryPayout,
      insta_fee_amount: instaFeeAmount,
      insta_fee_count: instaRows.length,
      sub_row_count: rs.length,
    });
  }
  return out;
}
