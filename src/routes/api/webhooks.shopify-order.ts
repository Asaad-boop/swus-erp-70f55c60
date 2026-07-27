import { createFileRoute } from "@tanstack/react-router";
import { handleShopifyOrderWebhook } from "@/lib/shopify-order-webhook.server";

export const Route = createFileRoute("/api/webhooks/shopify-order")({
  server: {
    handlers: {
      GET: async () => new Response("Shopify order webhook OK", { status: 200 }),
      POST: async ({ request }) => handleShopifyOrderWebhook(request),
    },
  },
});