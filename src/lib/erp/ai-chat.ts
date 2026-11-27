/**
 * One way to ask the AI from server functions.
 * Uses GEMINI_API_KEY / LOVABLE_API_KEY from the server environment when set;
 * otherwise the key saved in ERP settings, through the `ai-proxy` edge function.
 */
type Msg = { role: "system" | "user" | "assistant"; content: unknown };

export async function aiChat(
  supabase: any,
  messages: Msg[],
  opts: { fast?: boolean; temperature?: number; timeoutMs?: number } = {},
): Promise<string | null> {
  const gemini = process.env.GEMINI_API_KEY;
  const envKey = gemini || process.env.LOVABLE_API_KEY;
  const model = opts.fast ? "gemini-2.5-flash-lite" : "gemini-2.5-flash";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);
  try {
    if (envKey) {
      const res = await fetch(
        gemini
          ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
          : "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${envKey}` },
          body: JSON.stringify({
            model: gemini ? model : `google/${model}`,
            temperature: opts.temperature ?? 0.3,
            response_format: { type: "json_object" },
            messages,
          }),
          signal: ctrl.signal,
        },
      );
      if (!res.ok) return null;
      const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return j?.choices?.[0]?.message?.content ?? null;
    }
    if (!supabase) return null;
    const { data, error } = await supabase.functions.invoke("ai-proxy", {
      body: { messages, model, temperature: opts.temperature ?? 0.3 },
    });
    if (error || !data || data.error) return null;
    return typeof data.content === "string" ? data.content : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function parseAiJson<T>(content: string | null): T | null {
  if (!content) return null;
  try {
    return JSON.parse(content.replace(/^```(?:json)?|```$/g, "").trim()) as T;
  } catch {
    return null;
  }
}
