import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Search, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  displayName,
  fillTemplate,
  runPool,
  sendReply,
  updateConversation,
  uploadInboxMedia,
  windowHoursLeft,
  type InboxConversation,
  type OutgoingAttachment,
  type QuickReply,
} from "@/lib/erp/inbox/inbox";
import { BrandTag, ContactAvatar } from "./shared";

type Pending = {
  key: string;
  preview: string;
  url?: string;
  type: OutgoingAttachment["type"];
  failed?: boolean;
};

/** Send one reply (text + photos, {name} filled per customer) to many chats at once. */
export function BulkReplyDialog({
  open,
  onOpenChange,
  conversations,
  quickReplies,
  onFinished,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  conversations: InboxConversation[];
  quickReplies: QuickReply[];
  onFinished: () => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Pending[]>([]);
  const [qrId, setQrId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [markDone, setMarkDone] = useState(false);
  const [progress, setProgress] = useState<{ done: number; failed: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setText("");
    setFiles([]);
    setQrId(null);
    setQ("");
    setProgress(null);
  }, [open]);

  const brandIds = useMemo(() => new Set(conversations.map((c) => c.brand_id)), [conversations]);
  const templates = useMemo(
    () =>
      quickReplies
        .filter((r) => !r.brand_id || brandIds.has(r.brand_id))
        .filter((r) => {
          const s = q.trim().toLowerCase();
          return (
            !s ||
            r.title.toLowerCase().includes(s) ||
            r.body.toLowerCase().includes(s) ||
            r.shortcut.includes(s)
          );
        })
        .sort((a, b) => b.use_count - a.use_count),
    [quickReplies, brandIds, q],
  );

  // WhatsApp can't be messaged outside 24h without a template — skip those.
  const blocked = conversations.filter(
    (c) => c.platform === "whatsapp" && windowHoursLeft(c.last_inbound_at) === null,
  );
  const targets = conversations.filter((c) => !blocked.includes(c));
  const uploading = files.some((f) => !f.url && !f.failed);
  const ready = files.filter((f) => f.url);
  const sending = progress !== null && progress.done < targets.length;
  const canSend = !sending && !uploading && targets.length > 0 && (text.trim() || ready.length > 0);

  const addFiles = (list: FileList | File[]) => {
    const arr = Array.from(list).slice(0, 10 - files.length);
    const brand = conversations[0]?.brand_id ?? "shared";
    for (const file of arr) {
      const key = crypto.randomUUID();
      const preview = URL.createObjectURL(file);
      const type: OutgoingAttachment["type"] = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : "file";
      setFiles((f) => [...f, { key, preview, type }]);
      uploadInboxMedia(file, brand)
        .then((r) =>
          setFiles((f) => f.map((x) => (x.key === key ? { ...x, url: r.url, type: r.type } : x))),
        )
        .catch((e) => {
          toast.error(e?.message ?? "Upload failed");
          setFiles((f) => f.map((x) => (x.key === key ? { ...x, failed: true } : x)));
        });
    }
  };

  const pickTemplate = (r: QuickReply) => {
    setQrId(r.id);
    setText(r.body);
    setFiles(
      r.image_url ? [{ key: r.id, preview: r.image_url, url: r.image_url, type: "image" }] : [],
    );
  };

  const send = async () => {
    const attachments = ready.map((f) => ({ url: f.url!, type: f.type }));
    setProgress({ done: 0, failed: 0 });
    const res = await runPool(
      targets,
      4,
      async (c) => {
        await sendReply(c.id, {
          text: text.trim() ? fillTemplate(text.trim(), c) : null,
          attachments,
          quickReplyId: qrId,
        });
        if (markDone) await updateConversation(c.id, { status: "done" });
      },
      (done, failed) => setProgress({ done, failed }),
    );
    qc.invalidateQueries({ queryKey: ["inbox"] });
    const ok = res.done - res.failed;
    if (res.failed === 0) toast.success(`${ok} jon ke reply gese`);
    else
      toast.warning(`${ok} jon ke gese, ${res.failed}ta jay nai`, {
        description: res.errors[0]?.error,
      });
    onFinished();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="inbox-studio max-w-3xl gap-0 overflow-hidden p-0 !bg-[var(--ib-panel)]">
        <DialogHeader className="border-b border-[var(--ib-line)] px-5 py-3.5">
          <DialogTitle className="flex items-center gap-2 text-[15px] font-semibold">
            Ekshathe reply
            <span className="ib-ink-2 text-[13px] font-normal">
              — {targets.length} jon customer
              {blocked.length > 0 && ` (${blocked.length} WhatsApp bad: 24h par)`}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid min-h-[420px] grid-cols-1 md:grid-cols-[240px_1fr]">
          {/* Templates */}
          <div className="flex min-h-0 flex-col border-b border-[var(--ib-line)] bg-[var(--ib-canvas)] md:border-b-0 md:border-r">
            <div className="relative p-2">
              <Search className="ib-ink-3 pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Template khojo"
                className="h-8 w-full rounded-md border border-[var(--ib-line)] bg-[var(--ib-panel)] pl-7 pr-2 text-[12.5px] outline-none"
              />
            </div>
            <div className="ib-scroll max-h-48 min-h-0 flex-1 overflow-y-auto px-1.5 pb-2 md:max-h-[440px]">
              {templates.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => pickTemplate(r)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                    qrId === r.id
                      ? "bg-[var(--ib-panel)] shadow-sm ring-1 ring-primary/30"
                      : "hover:bg-[var(--ib-panel)]",
                  )}
                >
                  {r.image_url && (
                    <img
                      src={r.image_url}
                      alt=""
                      className="mt-0.5 h-8 w-8 shrink-0 rounded object-cover"
                    />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-medium">{r.title}</span>
                    <span className="ib-ink-2 line-clamp-2 text-[11.5px] leading-snug">
                      {r.body}
                    </span>
                  </span>
                </button>
              ))}
              {templates.length === 0 && (
                <div className="ib-ink-3 px-2 py-6 text-center text-[12px]">Kono template nai</div>
              )}
            </div>
          </div>

          {/* Message */}
          <div className="flex min-h-0 flex-col p-4">
            <div className="mb-2 flex -space-x-1.5">
              {targets.slice(0, 12).map((c) => (
                <span
                  key={c.id}
                  title={displayName(c)}
                  className="rounded-full ring-2 ring-[var(--ib-panel)]"
                >
                  <ContactAvatar name={displayName(c)} src={c.contact_avatar} size={24} />
                </span>
              ))}
              {targets.length > 12 && (
                <span className="ib-ink-2 flex h-6 items-center rounded-full bg-[var(--ib-canvas)] px-2 text-[11px] ring-2 ring-[var(--ib-panel)]">
                  +{targets.length - 12}
                </span>
              )}
              <span className="ml-3 flex items-center gap-1">
                {[...brandIds].map((b) => (
                  <BrandTag key={b} brandId={b} size="xs" />
                ))}
              </span>
            </div>

            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setQrId(null);
              }}
              placeholder="Message likho… {name} likhle protita customer er naam boshbe"
              rows={7}
              className="min-h-[150px] w-full flex-1 resize-none rounded-lg border border-[var(--ib-line)] bg-[var(--ib-panel)] p-3 text-[13.5px] leading-relaxed outline-none focus:border-primary/40"
            />
            {text.includes("{name}") && targets[0] && (
              <p className="ib-ink-3 mt-1 truncate text-[11.5px]">
                Udahoron: {fillTemplate(text, targets[0]).slice(0, 90)}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {files.map((f) => (
                <div
                  key={f.key}
                  className="group relative h-14 w-14 overflow-hidden rounded-lg border border-[var(--ib-line)]"
                >
                  {f.type === "image" ? (
                    <img src={f.preview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="ib-ink-2 flex h-full items-center justify-center text-[10px]">
                      {f.type}
                    </div>
                  )}
                  {!f.url && !f.failed && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    </div>
                  )}
                  {f.failed && <div className="absolute inset-0 bg-rose-500/40" />}
                  <button
                    type="button"
                    onClick={() => setFiles((x) => x.filter((y) => y.key !== f.key))}
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {files.length < 10 && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="ib-ink-2 flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-[var(--ib-line)] text-[10px] hover:bg-[var(--ib-hover)]"
                >
                  <ImagePlus className="h-4 w-4" />
                  Chobi
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,video/mp4,application/pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="mt-auto flex items-center gap-3 pt-4">
              <label className="ib-ink-2 flex items-center gap-2 text-[12.5px]">
                <Switch checked={markDone} onCheckedChange={setMarkDone} />
                Pathanor por Done
              </label>
              {progress && (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--ib-canvas)]">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${(progress.done / Math.max(1, targets.length)) * 100}%` }}
                    />
                  </div>
                  <span className="ib-ink-2 tabular text-[11.5px]">
                    {progress.done}/{targets.length}
                    {progress.failed > 0 && (
                      <span className="text-rose-600"> · {progress.failed} fail</span>
                    )}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => void send()}
                disabled={!canSend}
                className="ml-auto flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                {targets.length} jon ke pathao
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
