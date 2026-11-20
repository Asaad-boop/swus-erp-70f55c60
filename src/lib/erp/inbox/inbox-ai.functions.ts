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

// ── text helpers ──────────────────────────────────────────────────────
type ChatMsg = { role: "system" | "user"; content: string };

async function aiJson<T>(messages: ChatMsg[], fast = true): Promise<T | null> {
  const ai = aiEndpoint();
  if (!ai) return null;
  const model = fast ? ai.model.replace("gemini-2.5-flash", "gemini-2.5-flash-lite") : ai.model;
  try {
    const res = await fetch(ai.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ai.key}` },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages,
      }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = j?.choices?.[0]?.message?.content ?? "";
    return JSON.parse(content.replace(/^```(?:json)?|```$/g, "").trim()) as T;
  } catch {
    return null;
  }
}

type ConvRow = {
  id: string;
  brand_id: string;
  platform: string;
  contact_name: string | null;
  contact_phone: string | null;
};
type MsgRow = {
  direction: "in" | "out";
  body: string | null;
  attachments: Array<{ type: string }> | null;
  created_at: string;
  meta: { product_id?: string } | null;
};

async function loadChat(supabase: any, conversationId: string, limit = 25) {
  const { data: conv } = await supabase
    .from("inbox_conversations")
    .select("id, brand_id, platform, contact_name, contact_phone")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) throw new Error("Conversation not found");
  const { data: msgs } = await supabase
    .from("inbox_messages")
    .select("direction, body, attachments, created_at, meta")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const { data: brand } = await supabase
    .from("brands")
    .select("name")
    .eq("id", (conv as ConvRow).brand_id)
    .maybeSingle();
  const list = ((msgs ?? []) as MsgRow[]).reverse();
  const transcript = list
    .map((m) => {
      const who = m.direction === "in" ? "Customer" : "Shop";
      const att = (m.attachments ?? []).length
        ? ` [${(m.attachments ?? []).map((a) => a.type).join(", ")}]`
        : "";
      return `${who}: ${(m.body ?? "").slice(0, 600)}${att}`;
    })
    .join("\n");
  return {
    conv: conv as ConvRow,
    msgs: list,
    transcript,
    brandName: (brand?.name as string) ?? "the shop",
  };
}

/** 3 short reply suggestions in the shop's voice (Bangla). */
export const suggestRepliesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!aiEndpoint()) return { replies: [] as string[], reason: "AI key nai" };
    const { transcript, brandName, conv } = await loadChat(context.supabase, data.conversationId);
    const { data: qrs } = await context.supabase
      .from("inbox_quick_replies" as never)
      .select("title, body")
      .limit(30);
    const kb = ((qrs ?? []) as Array<{ title: string; body: string }>)
      .map((q) => `- ${q.title}: ${q.body}`)
      .join("\n");
    const out = await aiJson<{ replies?: string[] }>([
      {
        role: "system",
        content:
          `You are a friendly, sales-minded customer-service agent for "${brandName}", a Bangladeshi online shop (cash on delivery). ` +
          "Write the shop's NEXT reply to the customer. Use natural Bangla (Bangla script), polite (আপনি), short (1-3 sentences), " +
          "a light emoji is fine. Never invent prices, delivery charges or stock — if needed, ask for a product photo or say you'll check. " +
          "Guide toward an order (ask for name, phone, full address) when the customer seems interested. " +
          'Return JSON {"replies":[3 different options: 1 direct answer, 1 warmer, 1 that moves to the order]}. ' +
          `The shop's saved replies (use their facts/tone):\n${kb}`,
      },
      {
        role: "user",
        content: `Customer name: ${conv.contact_name ?? "unknown"}\nChat (oldest first):\n${transcript || "(empty)"}`,
      },
    ]);
    const replies = (out?.replies ?? [])
      .filter((r) => typeof r === "string" && r.trim())
      .slice(0, 3);
    return { replies, reason: replies.length ? null : "AI reply dite pareni" };
  });

const REWRITE: Record<string, string> = {
  polite: "Make it more polite and warm (আপনি form), keep the meaning.",
  short: "Make it shorter and clearer, keep every fact.",
  sales: "Make it more persuasive and sales-oriented, gently push to order, keep every fact.",
  fix: "Fix spelling, grammar and punctuation only. Keep the language and wording otherwise.",
  bangla: "Translate/convert it into natural Bangla script (Banglish → Bangla).",
  english: "Translate it into simple, friendly English.",
};

/** Rewrite a draft reply in a given style. */
export const rewriteReplyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        text: z.string().min(1).max(2000),
        mode: z.enum(["polite", "short", "sales", "fix", "bangla", "english"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    if (!aiEndpoint()) return { text: null, reason: "AI key nai" };
    const out = await aiJson<{ text?: string }>([
      {
        role: "system",
        content:
          "You edit customer-service replies for a Bangladeshi online shop. " +
          REWRITE[data.mode] +
          " Never add prices, numbers or promises that are not in the original. " +
          'Return JSON {"text": "..."}.',
      },
      { role: "user", content: data.text },
    ]);
    return out?.text ? { text: out.text, reason: null } : { text: null, reason: "AI error" };
  });

/** Pull order details (name, phone, address, products) out of the chat for the order form. */
export const extractOrderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { transcript, msgs, conv } = await loadChat(context.supabase, data.conversationId, 40);
    // Products we already quoted with "দাম দাও" — newest first, unique.
    const quoted = Array.from(
      new Set(
        [...msgs]
          .reverse()
          .map((m) => m.meta?.product_id)
          .filter((x): x is string => !!x),
      ),
    ).slice(0, 10);
    const phoneRe = /(?:\+?88)?0?1[3-9]\d{8}/;
    const fromText = [...msgs]
      .reverse()
      .filter((m) => m.direction === "in")
      .map((m) => (m.body ?? "").replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))))
      .find((b) => phoneRe.test(b))
      ?.match(phoneRe)?.[0];
    const norm = (p?: string | null) => {
      const d = (p ?? "").replace(/\D/g, "").slice(-11);
      return d.length === 11 && d.startsWith("01")
        ? d
        : d.length === 10 && d.startsWith("1")
          ? `0${d}`
          : "";
    };
    let name = conv.contact_name ?? "";
    let phone = norm(fromText) || norm(conv.contact_phone);
    let address = "";
    let note = "";
    const ai = await aiJson<{ name?: string; phone?: string; address?: string; note?: string }>(
      [
        {
          role: "system",
          content:
            "Extract the customer's delivery details from this shop chat (Bangla/English mixed). " +
            "name = recipient's name as the customer wrote it (else empty); phone = 11-digit BD mobile starting 01; " +
            "address = full delivery address on one line (house/road, area, thana, district) exactly as given, else empty; " +
            "note = special instructions (size, colour, delivery time) in short, else empty. " +
            'Return JSON {"name":"","phone":"","address":"","note":""}. Never guess.',
        },
        { role: "user", content: transcript || "(empty)" },
      ],
      false,
    );
    if (ai) {
      if (ai.name?.trim()) name = ai.name.trim();
      phone = norm(ai.phone) || phone;
      address = (ai.address ?? "").trim();
      note = (ai.note ?? "").trim();
    }
    return {
      name,
      phone,
      address,
      note,
      productIds: quoted,
      brandId: conv.brand_id,
      platform: conv.platform,
    };
  });
