/**
 * Create an order straight from an inbox chat. Mirrors the New Order page's
 * insert (same columns, statuses and triggers) so both paths behave the same.
 */
import { supabase } from "@/integrations/supabase/client";
import { bdPhoneError, normalizeBdPhone } from "@/lib/erp/orders";

export type QuickLine = {
  key: string;
  productId: string;
  title: string;
  price: number;
  quantity: number;
  image: string | null;
  stock: number | null;
  variantId: string | null;
  variantLabel: string | null;
  /** product has colours: one must be picked */
  needsVariant: boolean;
  /** colour the customer asked for (from the chat), used to pre-pick a variant */
  wantedColor?: string | null;
};

export type QuickOrderDraft = {
  brandId: string;
  conversationId: string;
  source: string;
  name: string;
  phone: string;
  address: string;
  city: { id: number; name: string } | null;
  zone: { id: number; name: string } | null;
  area: { id: number; name: string } | null;
  lines: QuickLine[];
  shippingFee: number;
  discount: number;
  advance: number;
  advanceSource: string;
  advanceNumber: string;
  note: string;
  /** keep it waiting for a confirmation call instead of confirming now */
  awaiting: boolean;
};

export const SHIPPING_NOTE =
  "🙏 মার্চেন্টের অনুমতি ছাড়া প্রোডাক্ট খোলা সম্পূর্ণ নিষিদ্ধ। খুলে দেখতে চাইলে আগে কল করুন।";

export function draftProblems(d: QuickOrderDraft): string[] {
  const m: string[] = [];
  if (!d.name.trim()) m.push("name");
  if (bdPhoneError(d.phone)) m.push("phone");
  if (d.address.trim().length < 6) m.push("address");
  if (d.lines.length === 0) m.push("product");
  if (d.lines.some((l) => l.needsVariant && !l.variantId)) m.push("color");
  if (d.advance > 0 && (!d.advanceSource || d.advanceNumber.replace(/\D/g, "").length < 4))
    m.push("advance");
  return m;
}

export function draftTotals(
  d: Pick<QuickOrderDraft, "lines" | "shippingFee" | "discount" | "advance">,
) {
  const subtotal = d.lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const total = Math.max(0, subtotal + (d.shippingFee || 0) - (d.discount || 0));
  const cod = Math.max(0, total - (d.advance || 0));
  const qty = d.lines.reduce((s, l) => s + l.quantity, 0);
  return { subtotal, total, cod, qty };
}

export async function createInboxOrder(d: QuickOrderDraft) {
  const problems = draftProblems(d);
  if (problems.length) throw new Error(`Baki: ${problems.join(", ")}`);
  const { subtotal, total } = draftTotals(d);
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;
  const phone = normalizeBdPhone(d.phone);
  const awaiting = d.awaiting;

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      brand_id: d.brandId,
      status: awaiting ? "new" : "confirmed",
      confirmation_status: awaiting ? "pending" : "confirmed",
      ...(awaiting
        ? {
            call_status: "not_called" as const,
            web_status: "processing",
            confirmed_by: null,
            confirmed_at: null,
          }
        : { confirmed_by: uid, confirmed_at: new Date().toISOString() }),
      source: "manual",
      source_platform: d.source,
      is_guest_order: true,
      guest_name: d.name.trim(),
      guest_phone: phone,
      shipping_name: d.name.trim(),
      shipping_phone: phone,
      shipping_address: d.address.trim(),
      shipping_city: d.city?.name ?? null,
      shipping_thana: d.zone?.name ?? null,
      shipping_district: d.area?.name ?? null,
      pathao_city_id: d.city?.id ?? null,
      pathao_city_name: d.city?.name ?? null,
      pathao_zone_id: d.zone?.id ?? null,
      pathao_zone_name: d.zone?.name ?? null,
      pathao_area_id: d.area?.id ?? null,
      pathao_area_name: d.area?.name ?? null,
      payment_method: "COD",
      subtotal,
      shipping_fee: d.shippingFee || 0,
      discount_amount: d.discount || 0,
      advance_amount: d.advance || 0,
      advance_source: d.advance > 0 ? d.advanceSource : null,
      advance_payment_number: d.advance > 0 ? d.advanceNumber : null,
      total,
      shipping_note: SHIPPING_NOTE,
      customer_note: d.note.trim() || null,
      is_preorder: false,
      courier_name: "pathao",
      // Links the order to its chat; the DB copies the chat's ad onto the order.
      ...({ inbox_conversation_id: d.conversationId } as Record<string, string>),
    })
    .select("id, invoice_no")
    .single();
  if (error) throw error;

  const { error: itemsErr } = await supabase.from("order_items").insert(
    d.lines.map((l) => ({
      order_id: order.id,
      product_id: l.productId,
      name: l.title,
      image: l.image,
      price: l.price,
      unit_price: l.price,
      quantity: l.quantity,
      line_total: l.price * l.quantity,
      variant_id: l.variantId,
      variant_label: l.variantLabel,
    })),
  );
  if (itemsErr) throw itemsErr;
  return {
    id: order.id as string,
    invoiceNo: (order as { invoice_no?: string | null }).invoice_no ?? null,
  };
}

/** Chat message telling the customer what we booked. */
export function confirmationText(d: QuickOrderDraft, invoiceNo: string | null) {
  const { total, cod } = draftTotals(d);
  const tk = (n: number) => `৳${Math.round(n).toLocaleString("en-IN")}`;
  const lines = d.lines
    .map((l) => `• ${l.title}${l.variantLabel ? ` (${l.variantLabel})` : ""} × ${l.quantity}`)
    .join("\n");
  const head = d.awaiting
    ? "✅ আপনার অর্ডারটি নেওয়া হয়েছে। আমাদের টিম কল করে কনফার্ম করবে।"
    : "✅ আপনার অর্ডার কনফার্ম হয়েছে!";
  return [
    head,
    invoiceNo ? `🧾 ইনভয়েস: ${invoiceNo}` : null,
    "",
    lines,
    "",
    `🚚 ডেলিভারি চার্জ: ${tk(d.shippingFee)}`,
    d.discount > 0 ? `🎁 ছাড়: ${tk(d.discount)}` : null,
    d.advance > 0 ? `💳 অগ্রিম: ${tk(d.advance)}` : null,
    `💰 মোট: ${tk(total)}${d.advance > 0 ? ` — ডেলিভারিতে দিবেন ${tk(cod)}` : " (ক্যাশ অন ডেলিভারি)"}`,
    "",
    `👤 ${d.name.trim()} · ${normalizeBdPhone(d.phone)}`,
    `📍 ${d.address.trim()}`,
    "",
    "ধন্যবাদ আমাদের সাথে থাকার জন্য ❤️",
  ]
    .filter((x) => x !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** Bangla / Banglish colour words → English, to match a variant's colour name. */
const COLOR_WORDS: Record<string, string> = {
  পিংক: "pink",
  গোলাপি: "pink",
  golapi: "pink",
  লাল: "red",
  lal: "red",
  নীল: "blue",
  neel: "blue",
  সবুজ: "green",
  sobuj: "green",
  কালো: "black",
  kalo: "black",
  সাদা: "white",
  sada: "white",
  হলুদ: "yellow",
  holud: "yellow",
  বেগুনি: "purple",
  beguni: "purple",
  কমলা: "orange",
  komla: "orange",
  বাদামি: "brown",
  badami: "brown",
  ধূসর: "grey",
  ছাই: "grey",
  আকাশি: "sky",
  akashi: "sky",
  গোল্ডেন: "gold",
  সোনালি: "gold",
  সিলভার: "silver",
  রুপালি: "silver",
};

export function matchColor<T extends { color_name: string | null }>(
  wanted: string | null | undefined,
  variants: T[],
): T | null {
  if (!wanted) return null;
  const w = wanted.trim().toLowerCase();
  const en = Object.entries(COLOR_WORDS).find(([k]) => w.includes(k.toLowerCase()))?.[1] ?? w;
  return (
    variants.find((v) => (v.color_name ?? "").toLowerCase() === en) ??
    variants.find((v) => (v.color_name ?? "").toLowerCase().includes(en)) ??
    variants.find(
      (v) => en.includes((v.color_name ?? "").toLowerCase()) && (v.color_name ?? "").length > 2,
    ) ??
    null
  );
}
