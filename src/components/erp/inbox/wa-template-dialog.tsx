import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { displayName, inboxApi, type InboxConversation } from "@/lib/erp/inbox/inbox";

type WaTemplate = {
  name: string;
  language: string;
  category: string;
  body: string;
  params: number;
  headerFormat: string | null;
  headerText: string | null;
  footer: string | null;
};

/** Pick + send an approved WhatsApp template (needed after the 24h window closes). */
export function WaTemplateDialog({
  open,
  onOpenChange,
  conversation: c,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  conversation: InboxConversation;
}) {
  const qc = useQueryClient();
  const tq = useQuery({
    queryKey: ["inbox", "wa-templates", c.channel_id],
    enabled: open,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      ((await inboxApi("wa_templates", { conversationId: c.id })) as { templates: WaTemplate[] })
        .templates,
  });
  const templates = tq.data ?? [];
  const [pick, setPick] = useState<WaTemplate | null>(null);
  const [params, setParams] = useState<string[]>([]);

  useEffect(() => {
    if (!open) setPick(null);
  }, [open]);
  useEffect(() => {
    if (!pick) return;
    const name = displayName(c);
    // {{1}} is usually the customer's name.
    setParams(Array.from({ length: pick.params }, (_, i) => (i === 0 ? name : "")));
  }, [pick, c]);

  const preview = useMemo(
    () => (pick ? pick.body.replace(/\{\{(\d+)\}\}/g, (m, i) => params[Number(i) - 1] || m) : ""),
    [pick, params],
  );

  const send = useMutation({
    mutationFn: () =>
      inboxApi("wa_send_template", {
        conversationId: c.id,
        name: pick!.name,
        language: pick!.language,
        params,
      }),
    onSuccess: () => {
      toast.success("Template pathano hoyeche");
      qc.invalidateQueries({ queryKey: ["inbox", "messages", c.id] });
      qc.invalidateQueries({ queryKey: ["inbox", "conversations"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>WhatsApp template pathao</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-xs text-muted-foreground">
          24 ghonta par hoye gele WhatsApp shudhu Meta-approved template allow kore. Customer reply
          dile abar normal chat kora jabe.
        </p>

        {tq.isLoading ? (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : tq.isError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            {(tq.error as Error).message}
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
            Kono approved template nai. WhatsApp Manager → Message templates e giye template banao
            (Meta approve korte kichu minute lage).
          </div>
        ) : !pick ? (
          <ul className="max-h-80 space-y-1.5 overflow-y-auto">
            {templates.map((t) => (
              <li key={`${t.name}:${t.language}`}>
                <button
                  type="button"
                  onClick={() => setPick(t)}
                  className="w-full rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/60"
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    {t.name}
                    <span className="ml-auto rounded bg-muted px-1.5 text-[10px] uppercase text-muted-foreground">
                      {t.category.toLowerCase()} · {t.language}
                    </span>
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.body}</div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-3">
            {pick.headerFormat && pick.headerFormat !== "TEXT" && (
              <div className="rounded-md bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-400">
                Ei template e {pick.headerFormat.toLowerCase()} header ache — eta ekhono support
                kora hoy nai, onno template nao.
              </div>
            )}
            {params.map((v, i) => (
              <div key={i} className="space-y-1">
                <Label className="text-xs">{`{{${i + 1}}}`}</Label>
                <Input
                  value={v}
                  onChange={(e) =>
                    setParams((ps) => ps.map((x, j) => (j === i ? e.target.value : x)))
                  }
                />
              </div>
            ))}
            <div className="rounded-lg bg-emerald-500/10 p-3 text-sm whitespace-pre-wrap">
              {pick.headerText && <div className="mb-1 font-semibold">{pick.headerText}</div>}
              {preview}
              {pick.footer && (
                <div className="mt-1 text-[11px] text-muted-foreground">{pick.footer}</div>
              )}
            </div>
            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setPick(null)}>
                ← Onno template
              </Button>
              <Button
                onClick={() => send.mutate()}
                disabled={
                  send.isPending ||
                  params.some((x) => !x.trim()) ||
                  (!!pick.headerFormat && pick.headerFormat !== "TEXT")
                }
                className={cn("gap-1.5")}
              >
                {send.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Pathao
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
