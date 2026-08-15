import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, FileText, Printer, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  APPROVAL_STATUSES,
  CONTENT_TYPES,
  bdt,
  labelOf,
  type ContentItem,
} from "@/lib/erp/content/content-data";
import {
  BRIEF_TEMPLATES,
  briefToDraft,
  briefToText,
  deleteBrief,
  fetchItemBrief,
  saveItemBrief,
  type BriefDraft,
} from "@/lib/erp/content/brief-data";
import { Pill } from "@/components/erp/content/content-ui";

const APPROVAL_TONE: Record<string, "good" | "warn" | "bad" | "default"> = {
  pending: "default",
  briefed: "warn",
  in_review: "warn",
  revision: "bad",
  approved: "good",
  rejected: "bad",
};

/**
 * Creative brief editor for a single content item — the Growth Hub
 * "Creative Desk" brief workflow, now living inside Content Studio.
 */
export function BriefPanel({
  item,
  productLabel,
  brandLabel,
  creators,
  agencies,
}: {
  item: ContentItem;
  productLabel: string | null;
  brandLabel: string | null;
  creators: { id: string; name: string }[];
  agencies: { id: string; name: string }[];
}) {
  const qc = useQueryClient();
  const briefQ = useQuery({
    queryKey: ["content-brief", item.id],
    queryFn: () => fetchItemBrief(item.id),
  });

  const [draft, setDraft] = useState<BriefDraft | null>(null);
  const [seed, setSeed] = useState<string>("");
  const loadedKey = `${item.id}:${briefQ.dataUpdatedAt}`;
  if (!briefQ.isLoading && seed !== loadedKey) {
    setSeed(loadedKey);
    setDraft(briefToDraft(briefQ.data ?? null, item));
  }

  const set = (patch: Partial<BriefDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      await saveItemBrief({ existingId: briefQ.data?.id ?? null, item, draft });
    },
    onSuccess: () => {
      toast.success("Brief সেভ হয়েছে");
      qc.invalidateQueries({ queryKey: ["content-brief", item.id] });
      qc.invalidateQueries({ queryKey: ["content-briefs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (briefQ.data?.id) await deleteBrief(briefQ.data.id);
    },
    onSuccess: () => {
      toast.success("Brief মুছে ফেলা হয়েছে");
      qc.invalidateQueries({ queryKey: ["content-brief", item.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const creatorName = useMemo(
    () => creators.find((c) => c.id === draft?.creator_id)?.name ?? null,
    [creators, draft?.creator_id],
  );

  const text = useMemo(
    () =>
      draft
        ? briefToText({
            item,
            product: productLabel,
            brand: brandLabel,
            draft,
            creatorName,
          })
        : "",
    [draft, item, productLabel, brandLabel, creatorName],
  );

  if (briefQ.isLoading || !draft) {
    return (
      <div className="space-y-2 pt-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  const applyTemplate = (key: string) => {
    const t = BRIEF_TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    set(t.apply({ product: productLabel ?? item.title, brand: brandLabel ?? "আমাদের ব্র্যান্ড" }));
    toast.success(`"${t.label}" template বসানো হয়েছে`);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Brief কপি হয়েছে — creator কে পাঠিয়ে দাও");
    } catch {
      toast.error("কপি করা যায়নি");
    }
  };

  const print = () => {
    const w = window.open("", "_blank", "width=820,height=1000");
    if (!w) return;
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    w.document.write(`<!doctype html><html><head><title>Brief — ${esc(item.code)}</title>
<meta charset="utf-8" />
<style>
 body{font-family:ui-sans-serif,system-ui,'Noto Sans Bengali',sans-serif;margin:40px;color:#111}
 h1{font-size:20px;margin:0 0 4px}
 .muted{color:#666;font-size:12px}
 .box{border:1px solid #e5e5e5;border-radius:12px;padding:14px;margin-top:14px}
 .lbl{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#888;margin-bottom:4px}
 pre{white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.6;margin:0}
</style></head><body>
<h1>Creative brief — ${esc(item.title)}</h1>
<p class="muted">${esc(item.code)} · ${esc(productLabel ?? "No product")} · ${esc(brandLabel ?? "")}</p>
<div class="box"><div class="lbl">Brief</div><pre>${esc(text)}</pre></div>
<script>window.onload=()=>window.print()</script>
</body></html>`);
    w.document.close();
  };

  return (
    <div className="space-y-3 pt-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-muted/30 p-2.5">
        <Pill tone={APPROVAL_TONE[draft.approval_status] ?? "default"}>
          <FileText className="h-3 w-3" />
          {labelOf(APPROVAL_STATUSES, draft.approval_status)}
        </Pill>
        {briefQ.data ? (
          <span className="text-[11px] text-muted-foreground">
            Saved brief · {bdt(draft.cost)}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            এখনো brief লেখা হয়নি — item থেকে প্রি-ফিল করা আছে
          </span>
        )}
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" onClick={copy}>
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" onClick={print}>
            <Printer className="h-3.5 w-3.5" /> Print
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-2.5">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold">
          <Wand2 className="h-3.5 w-3.5 text-primary" /> Brief template
        </p>
        <div className="flex flex-wrap gap-1.5">
          {BRIEF_TEMPLATES.map((t) => (
            <button
              key={t.key}
              type="button"
              title={t.hint}
              onClick={() => applyTemplate(t.key)}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-background px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-primary/10"
            >
              <Sparkles className="h-3 w-3 text-primary" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[11px]">Deliverable</Label>
          <Select
            value={draft.deliverable_type}
            onValueChange={(v) => set({ deliverable_type: v })}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTENT_TYPES.map((t) => (
                <SelectItem key={t.key} value={t.key}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px]">Approval</Label>
          <Select
            value={draft.approval_status}
            onValueChange={(v) => set({ approval_status: v })}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APPROVAL_STATUSES.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[11px]">Creator</Label>
          <Select
            value={draft.creator_id ?? "none"}
            onValueChange={(v) => set({ creator_id: v === "none" ? null : v })}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {creators.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px]">Agency</Label>
          <Select
            value={draft.agency_id ?? "none"}
            onValueChange={(v) => set({ agency_id: v === "none" ? null : v })}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {agencies.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-[11px]">Hook</Label>
        <Input value={draft.hook} onChange={(e) => set({ hook: e.target.value })} className="h-9" />
      </div>
      <div>
        <Label className="text-[11px]">Shot-by-shot script</Label>
        <Textarea
          value={draft.script}
          onChange={(e) => set({ script: e.target.value })}
          className="min-h-44 text-sm leading-relaxed"
        />
      </div>
      <div>
        <Label className="text-[11px]">CTA</Label>
        <Input value={draft.cta} onChange={(e) => set({ cta: e.target.value })} className="h-9" />
      </div>
      <div>
        <Label className="text-[11px]">Reference link</Label>
        <Input
          value={draft.reference_url}
          onChange={(e) => set({ reference_url: e.target.value })}
          placeholder="https://..."
          className="h-9"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[11px]">Deadline</Label>
          <Input
            type="date"
            value={draft.due_date}
            onChange={(e) => set({ due_date: e.target.value })}
            className="h-9"
          />
        </div>
        <div>
          <Label className="text-[11px]">Agreed budget (৳)</Label>
          <Input
            type="number"
            value={draft.cost}
            onChange={(e) => set({ cost: Number(e.target.value) || 0 })}
            className="h-9"
          />
        </div>
      </div>
      <div>
        <Label className="text-[11px]">Notes for creator</Label>
        <Textarea
          value={draft.notes}
          onChange={(e) => set({ notes: e.target.value })}
          className="min-h-20 text-sm"
        />
      </div>
      <div>
        <Label className="text-[11px]">Revision note</Label>
        <Textarea
          value={draft.revision_note}
          onChange={(e) => set({ revision_note: e.target.value })}
          className="min-h-16 text-sm"
        />
      </div>

      <div className="flex gap-2">
        {briefQ.data && (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => {
              if (confirm("এই brief মুছে ফেলবে?")) remove.mutate();
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        <Button className="flex-1" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : briefQ.data ? "Update brief" : "Create brief"}
        </Button>
      </div>
    </div>
  );
}
