/** Client-safe SMS constants (no secrets, no server imports). */

export type SmsTemplateKey =
  | "order_confirm"
  | "preorder_placed"
  | "preorder_ready"
  | "preorder_confirmed"
  | "custom";

export type SmsConfig = {
  enabled: boolean;
  api_key: string;
  sender_id: string;
  /** Auto-send toggles */
  auto_order_confirm: boolean;
  auto_preorder_placed: boolean;
  auto_preorder_ready: boolean;
  auto_preorder_confirmed: boolean;
  templates: Record<Exclude<SmsTemplateKey, "custom">, string>;
};

export const SMS_DEFAULTS: SmsConfig = {
  enabled: false,
  api_key: "",
  sender_id: "",
  auto_order_confirm: true,
  auto_preorder_placed: true,
  auto_preorder_ready: true,
  auto_preorder_confirmed: false,
  templates: {
    order_confirm:
      "Dear {name}, apnar order #{invoice} confirm hoyeche. Total: Tk {total}, Due: Tk {due}. Dhonnobad - {brand}",
    preorder_placed:
      "{brand}: প্রিয় {name}, আপনার প্রি-অর্ডার (#{invoice}) নিশ্চিত হয়েছে। খুব শীঘ্রই ডেলিভারি করা হবে। বাকি: ৳{due}।",
    preorder_ready:
      "Dear {name}, apnar pre-order #{invoice} er product stock e eseche. Delivery confirm korte reply din. - {brand}",
    preorder_confirmed:
      "Dear {name}, apnar pre-order #{invoice} confirm kora holo, shiggirei delivery hobe. Due: Tk {due}. - {brand}",
  },
};

export const SMS_PLACEHOLDERS = [
  "{name}", "{phone}", "{invoice}", "{order_id}", "{total}", "{advance}",
  "{due}", "{brand}", "{expected}", "{courier}", "{tracking}", "{date}",
] as const;

export const SMS_TEMPLATE_LABELS: Record<Exclude<SmsTemplateKey, "custom">, string> = {
  order_confirm: "Order confirm",
  preorder_placed: "Pre-order placed",
  preorder_ready: "Pre-order stock ready",
  preorder_confirmed: "Pre-order confirmed",
};

export function smsConfigKey(brandId: string) {
  return `sms:bulksmsbd:${brandId}`;
}

/** GSM-7 vs unicode aware segment estimate. */
export function smsSegments(message: string) {
  const unicode = /[^\u0000-\u007F]/.test(message);
  const len = message.length;
  if (unicode) return len <= 70 ? 1 : Math.ceil(len / 67);
  return len <= 160 ? 1 : Math.ceil(len / 153);
}

/** Normalise a BD number to 8801XXXXXXXXX. Returns null when invalid. */
export function normalizeBdPhone(raw: string): string | null {
  const d = (raw || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 11 && d.startsWith("01")) return `88${d}`;
  if (d.length === 13 && d.startsWith("8801")) return d;
  if (d.length === 14 && d.startsWith("08801")) return d.slice(1);
  if (d.length === 10 && d.startsWith("1")) return `880${d}`;
  return null;
}