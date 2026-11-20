import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Candidate = { id: string; title: string; sku: string | null; price: number | null };

function aiEndpoint() {
  const gemini = process.env.GEMINI_API_KEY;
  const key = gemini || process.env.LOVABLE_API_KEY;
  if (!key) return null;
  return gemini
    ? {
        key,
        url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        model: "gemini-2.5-flash",
      }
    : {
        key,
        url: "https://ai.gateway.lovable.dev/v1/chat/completions",
        model: "google/gemini-2.5-flash",
      };
}

/**
 * Look at a customer's photo and pick the matching products from the brand's catalog.
 * Returns up to 3 product ids, best first. Empty list when unsure or AI is not configured.
 */
export const suggestProductsForImageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        imageUrl: z.string().url().max(2000),
        brandId: z.string().uuid(),
        hint: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ai = aiEndpoint();
    if (!ai) return { ids: [] as string[], reason: "AI key nai" };
    if (!/^https:\/\//.test(data.imageUrl)) return { ids: [], reason: "Bad image" };

    // RLS on the caller's client decides which products they can see.
    const { data: rows, error } = await context.supabase
      .from("products")
      .select("id, title, sku, price")
      .eq("brand_id", data.brandId)
      .eq("is_active", true)
      .neq("product_kind", "component")
      .order("display_order", { ascending: true, nullsFirst: false })
      .limit(500);
    if (error || !rows?.length) return { ids: [], reason: "Catalog e product nai" };
    const list = rows as Candidate[];

    const catalog = list
      .map((p, i) => `${i + 1}. ${p.title}${p.sku ? ` [${p.sku}]` : ""}`)
      .join("\n");
    const system =
      "You help a Bangladeshi online shop reply to customers. The customer sent a product photo " +
      "(often a screenshot of a Facebook ad or post). Identify which catalog products it shows. " +
      "Use visible text, packaging, shape, colour and any price/name in the screenshot. " +
      'Reply ONLY with JSON: {"matches":[{"n":<catalog number>,"confidence":<0..1>}]} ' +
      "with at most 3 matches, best first. Return an empty list if nothing fits.";

    let content = "";
    try {
      const res = await fetch(ai.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ai.key}` },
        body: JSON.stringify({
          model: ai.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Catalog:\n${catalog}${data.hint ? `\n\nCustomer's message: ${data.hint}` : ""}`,
                },
                { type: "image_url", image_url: { url: data.imageUrl } },
              ],
            },
          ],
        }),
      });
      if (!res.ok) return { ids: [], reason: `AI ${res.status}` };
      const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      content = j?.choices?.[0]?.message?.content ?? "";
    } catch {
      return { ids: [], reason: "AI error" };
    }
    let matches: Array<{ n: number; confidence?: number }> = [];
    try {
      matches = JSON.parse(content.replace(/^```(?:json)?|```$/g, "").trim())?.matches ?? [];
    } catch {
      matches = [];
    }
    const ids = matches
      .filter((m) => Number.isInteger(m.n) && (m.confidence ?? 1) >= 0.35)
      .map((m) => list[m.n - 1]?.id)
      .filter((x): x is string => !!x)
      .slice(0, 3);
    return { ids, reason: ids.length ? null : "Match pai nai" };
  });
