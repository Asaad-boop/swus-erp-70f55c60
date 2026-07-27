import { createFileRoute } from "@tanstack/react-router";
import { handleShopifyOrderWebhook } from "@/lib/shopify-order-webhook.server";

/**
 * Shopify "Order creation" webhook receiver.
 * URL: https://swus-erp.lovable.app/api/public/webhooks/shopify-order
 * (must live under /api/public/* so the published site's auth layer does not block Shopify)
 *
 * Secret: SHOPIFY_WEBHOOK_SECRET (Shopify sends base64 HMAC-SHA256 in x-shopify-hmac-sha256)
 */

export const Route = createFileRoute("/api/public/webhooks/shopify-order")({
  server: {
    handlers: {
      GET: async () => new Response("Shopify order webhook OK", { status: 200 }),
      POST: async ({ request }) => handleShopifyOrderWebhook(request),
    },
  },
});