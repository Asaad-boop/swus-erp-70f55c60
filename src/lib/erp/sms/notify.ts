import { sendOrderSms } from "./sms.functions";
import type { SmsTemplateKey } from "./templates";

/**
 * Fire-and-forget SMS trigger. Never throws — SMS problems must not break
 * order/pre-order flows.
 */
export function fireOrderSms(orderId: string, template: Exclude<SmsTemplateKey, "custom">) {
  void sendOrderSms({ data: { orderId, template } }).catch((e) => {
    console.warn("[sms] send failed", template, e);
  });
}

export function fireOrderSmsMany(orderIds: string[], template: Exclude<SmsTemplateKey, "custom">) {
  for (const id of orderIds) fireOrderSms(id, template);
}