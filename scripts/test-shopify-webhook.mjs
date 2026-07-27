#!/usr/bin/env node
/**
 * Shopify order webhook local tester.
 *
 * Usage:
 *   SHOPIFY_WEBHOOK_SECRET=xxx node scripts/test-shopify-webhook.mjs
 *   node scripts/test-shopify-webhook.mjs --url https://swus-erp.lovable.app/api/public/webhooks/shopify-order \
 *        --shop toyorakids.myshopify.com --payload ./my-order.json --secret xxx
 *   node scripts/test-shopify-webhook.mjs --bad-sig     # 401 verify korte
 */
import crypto from "node:crypto";
import fs from "node:fs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const url = arg("url", "http://localhost:8080/api/public/webhooks/shopify-order");
const shop = arg("shop", "hobbyshopbd.myshopify.com");
const secret = arg("secret", process.env.SHOPIFY_WEBHOOK_SECRET || "");
const payloadPath = arg("payload");

if (!secret) {
  console.error("❌ Secret missing. SHOPIFY_WEBHOOK_SECRET env set koro ba --secret <value> dao.");
  process.exit(1);
}

const now = new Date().toISOString();
const samplePayload = {
  id: Number(arg("order-id", String(Date.now()))),
  name: "#TEST-" + Math.floor(Math.random() * 9000 + 1000),
  order_number: 1001,
  created_at: now,
  currency: "BDT",
  total_price: "1250.00",
  subtotal_price: "1150.00",
  total_shipping_price_set: { shop_money: { amount: "100.00", currency_code: "BDT" } },
  financial_status: "pending",
  fulfillment_status: null,
  gateway: "Cash on Delivery (COD)",
  note: "Local webhook test order",
  email: "test@example.com",
  customer: { first_name: "Test", last_name: "Customer", phone: "+8801700000000" },
  shipping_address: {
    first_name: "Test",
    last_name: "Customer",
    phone: "+8801700000000",
    address1: "House 12, Road 4, Dhanmondi",
    city: "Dhaka",
    province: "Dhaka",
    country: "Bangladesh",
    zip: "1205",
  },
  line_items: [
    { id: 1, sku: arg("sku", "SKU-TEST-1"), title: "Test Product", variant_title: "Red", quantity: 2, price: "500.00" },
    { id: 2, sku: arg("sku2", "SKU-TEST-2"), title: "Test Product 2", variant_title: "Blue", quantity: 1, price: "150.00" },
  ],
};

const rawBody = payloadPath
  ? fs.readFileSync(payloadPath, "utf8")
  : JSON.stringify(samplePayload);

// HMAC-SHA256 over the EXACT raw bytes, base64 — same as Shopify.
let hmac = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
if (flag("bad-sig")) hmac = crypto.randomBytes(32).toString("base64");

console.log("→ POST", url);
console.log("  shop:", shop);
console.log("  hmac:", hmac.slice(0, 12) + "…", flag("bad-sig") ? "(intentionally INVALID)" : "");
console.log("  body bytes:", Buffer.byteLength(rawBody));

const res = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-shopify-hmac-sha256": hmac,
    "x-shopify-shop-domain": shop,
    "x-shopify-topic": "orders/create",
    "x-shopify-api-version": "2024-10",
  },
  body: rawBody,
});

const text = await res.text();
console.log(`\n← ${res.status} ${res.statusText}`);
console.log(text);

if (flag("bad-sig")) {
  console.log(res.status === 401 ? "\n✅ Signature check kaj korche (401 expected)." : "\n❌ Bad signature accept holo — problem!");
} else {
  console.log(res.ok ? "\n✅ Webhook accepted." : "\n❌ Webhook rejected.");
}
process.exit(res.ok || (flag("bad-sig") && res.status === 401) ? 0 : 1);
