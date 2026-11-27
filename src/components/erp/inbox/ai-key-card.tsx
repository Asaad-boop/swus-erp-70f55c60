/** Admin card: save the Gemini key for the inbox AI (never shown again after saving). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, KeyRound, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status = { set?: boolean; last4?: string | null; updated_at?: string };

export function AiKeyCard() {
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const statusQ = useQuery({
    queryKey: ["ai-key-status"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("ai_key_status");
      if (error) throw error;
      return (data ?? {}) as Status;
    },
  });
  const save = useMutation({
    mutationFn: async (k: string) => {
      const { data, error } = await (supabase as any).rpc("ai_set_key", { _key: k });
      if (error) throw error;
      return data as Status;
    },
    onSuccess: (s) => {
      setKey("");
      qc.setQueryData(["ai-key-status"], s);
      toast.success(s.set ? "AI key save holo" : "AI key sorano holo");
      if (s.set) test.mutate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const test = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ai-proxy", { body: { test: true } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error === "no_key" ? "Key save kora nai" : data.error);
      return data;
    },
    onSuccess: () => toast.success("AI kaj korche ✓"),
    onError: (e: Error) => toast.error(`AI test fail: ${e.message}`),
  });
  const s = statusQ.data ?? {};
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-600" />
        <h3 className="text-sm font-semibold">AI key (Google Gemini)</h3>
        {s.set ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11.5px] font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" /> Set · …{s.last4}
          </span>
        ) : (
          <span className="ml-auto rounded-full bg-amber-500/10 px-2 py-0.5 text-[11.5px] font-medium text-amber-700 dark:text-amber-300">
            Key nai
          </span>
        )}
      </div>
      <p className="text-[12.5px] text-muted-foreground">
        Chat theke order, AI reply suggestion, chobi theke product chena — egulo ei key diye chole.{" "}
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
        >
          AI Studio theke free key nao <ExternalLink className="h-3 w-3" />
        </a>
        . Save korar por key ar dekhano hoy na.
      </p>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (key.trim()) save.mutate(key.trim());
        }}
      >
        <div className="relative min-w-[240px] flex-1">
          <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={s.set ? "Notun key dile purono ta bodlabe" : "AIza… key paste koro"}
            className="pl-8"
          />
        </div>
        <Button type="submit" disabled={!key.trim() || save.isPending}>
          {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Save
        </Button>
        {s.set && (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={test.isPending}
              onClick={() => test.mutate()}
            >
              {test.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Test
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-rose-600"
              disabled={save.isPending}
              onClick={() => {
                if (confirm("AI key sorabe? AI feature gulo bondho hoye jabe.")) save.mutate("");
              }}
            >
              Sorao
            </Button>
          </>
        )}
      </form>
    </section>
  );
}
