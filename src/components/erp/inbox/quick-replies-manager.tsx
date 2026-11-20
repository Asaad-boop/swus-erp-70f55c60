import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BrandBadge } from "@/components/erp/brand-badge";
import { useBrand } from "@/contexts/brand-context";
import {
  deleteQuickReply,
  QR_CATEGORIES,
  saveQuickReply,
  uploadInboxMedia,
  type QuickReply,
} from "@/lib/erp/inbox/inbox";

type Draft = Partial<QuickReply> & { shortcut: string; title: string; body: string };

const EMPTY: Draft = {
  shortcut: "/",
  title: "",
  body: "",
  brand_id: null,
  image_url: null,
  sort_order: 0,
  category: "general",
};

const catLabel = (k: string) => QR_CATEGORIES.find((c) => c.key === k)?.label ?? k;

export function QuickRepliesManager({ replies }: { replies: QuickReply[] }) {
  const qc = useQueryClient();
  const { brands } = useBrand();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [uploading, setUploading] = useState(false);

  const save = useMutation({
    mutationFn: (d: Draft) => saveQuickReply(d),
    onSuccess: () => {
      toast.success("Quick reply saved");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["inbox", "quick-replies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteQuickReply(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox", "quick-replies"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const onImage = async (file: File | undefined) => {
    if (!file || !draft) return;
    setUploading(true);
    try {
      const r = await uploadInboxMedia(file, draft.brand_id ?? brands[0]?.id ?? "shared");
      if (r.type !== "image") throw new Error("Shudhu photo dewa jabe");
      setDraft({ ...draft, image_url: r.url });
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Quick replies</h2>
          <p className="text-sm text-muted-foreground">
            Chat er niche chip hisebe ashe — click korlei customer er kache chole jay. Composer e{" "}
            <span className="font-mono">/</span> likhleo khuje paba.
            <span className="font-mono"> {"{name}"}</span> likhle customer er naam boshe jabe.
          </p>
        </div>
        <Button onClick={() => setDraft({ ...EMPTY })} className="shrink-0 gap-1.5">
          <Plus className="h-4 w-4" /> New
        </Button>
      </div>

      <div className="divide-y rounded-xl border">
        {replies.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Ekhono kono quick reply nai
          </div>
        )}
        {[...replies]
          .sort(
            (a, b) =>
              QR_CATEGORIES.findIndex((c) => c.key === a.category) -
                QR_CATEGORIES.findIndex((c) => c.key === b.category) || a.sort_order - b.sort_order,
          )
          .map((q) => (
            <div key={q.id} className="flex items-start gap-3 p-3">
              <Zap className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-primary">{q.shortcut}</span>
                  <span className="text-sm font-medium">{q.title}</span>
                  <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
                    {catLabel(q.category)}
                  </span>
                  {q.brand_id ? (
                    <BrandBadge brandId={q.brand_id} variant="compact" />
                  ) : (
                    <span className="text-[10px] text-muted-foreground">All brands</span>
                  )}
                  <span className="text-[10px] text-muted-foreground">· used {q.use_count}×</span>
                </div>
                <div className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                  {q.body}
                </div>
                {q.image_url && (
                  <img src={q.image_url} alt="" className="mt-2 h-16 w-16 rounded object-cover" />
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setDraft({ ...q })}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={() => {
                  if (confirm(`Delete "${q.title}"?`)) del.mutate(q.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit quick reply" : "New quick reply"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Shortcut</Label>
                  <Input
                    value={draft.shortcut}
                    onChange={(e) =>
                      setDraft({ ...draft, shortcut: e.target.value.replace(/\s/g, "") })
                    }
                    placeholder="/price"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Brand</Label>
                  <Select
                    value={draft.brand_id ?? "all"}
                    onValueChange={(v) => setDraft({ ...draft, brand_id: v === "all" ? null : v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All brands</SelectItem>
                      {brands.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <div className="flex flex-wrap gap-1">
                  {QR_CATEGORIES.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setDraft({ ...draft, category: c.key })}
                      className={
                        "rounded-full border px-2.5 py-0.5 text-xs " +
                        ((draft.category ?? "general") === c.key
                          ? "border-foreground bg-foreground text-background"
                          : "text-muted-foreground hover:bg-muted")
                      }
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Button label</Label>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Price list"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Message</Label>
                <Textarea
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  rows={5}
                  placeholder="আসসালামু আলাইকুম {name}…"
                />
              </div>
              <div className="flex items-center gap-3">
                {draft.image_url ? (
                  <div className="relative">
                    <img src={draft.image_url} alt="" className="h-16 w-16 rounded object-cover" />
                    <button
                      type="button"
                      className="absolute -right-2 -top-2 rounded-full bg-background px-1.5 text-xs shadow"
                      onClick={() => setDraft({ ...draft, image_url: null })}
                    >
                      ×
                    </button>
                  </div>
                ) : null}
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ImagePlus className="h-3.5 w-3.5" />
                  )}
                  {draft.image_url ? "Change photo" : "Add photo (optional)"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onImage(e.target.files?.[0])}
                  />
                </label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              disabled={
                !draft ||
                !draft.title.trim() ||
                !draft.body.trim() ||
                draft.shortcut.length < 2 ||
                save.isPending
              }
              onClick={() => draft && save.mutate(draft)}
            >
              {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
