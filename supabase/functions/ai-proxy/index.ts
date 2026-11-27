/**
 * AI proxy — staff-only. Uses the Gemini key saved in the ERP (ai_settings,
 * readable only with the service role) so the key never reaches a browser.
 *
 *   POST /functions/v1/ai-proxy  { messages, model?, temperature?, json? }
 *   POST /functions/v1/ai-proxy  { test: true }
 * → { content } | { error }
 */
import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MODELS = new Set(["gemini-2.5-flash", "gemini-2.5-flash-lite"]);
const URL_ = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

let cached: { at: number; key: string | null } | null = null;
async function loadKey() {
  if (cached && Date.now() - cached.at < 60_000) return cached.key;
  const { data } = await admin.from("ai_settings").select("gemini_api_key").eq("id", 1).maybeSingle();
  cached = { at: Date.now(), key: (data?.gemini_api_key as string | null) ?? null };
  return cached.key;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return json({ error: "Unauthorized" }, 401);
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user.id)
      .neq("role", "customer")
      .limit(1);
    if (!roles?.length) return json({ error: "Staff only" }, 403);

    const body = await req.json().catch(() => ({}));
    const key = await loadKey();
    if (!key) return json({ error: "no_key" });

    const messages = body?.test
      ? [{ role: "user", content: 'Reply with JSON {"ok":true}' }]
      : Array.isArray(body?.messages)
        ? body.messages
        : null;
    if (!messages?.length) return json({ error: "No messages" }, 400);
    if (JSON.stringify(messages).length > 400_000) return json({ error: "Too long" }, 413);
    const model = MODELS.has(body?.model) ? body.model : "gemini-2.5-flash";

    const res = await fetch(URL_, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: typeof body?.temperature === "number" ? body.temperature : 0.3,
        ...(body?.json !== false ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = j?.error?.message ?? j?.[0]?.error?.message ?? `Gemini ${res.status}`;
      if (res.status === 400 || res.status === 401 || res.status === 403) cached = null;
      return json({ error: String(msg).slice(0, 300) });
    }
    return json({ content: j?.choices?.[0]?.message?.content ?? "" });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e).slice(0, 300) });
  }
});
