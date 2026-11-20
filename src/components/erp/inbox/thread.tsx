import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCheck,
  CheckCircle2,
  ExternalLink,
  Clock,
  FileText,
  Loader2,
  Paperclip,
  PanelRight,
  RotateCcw,
  Send,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BrandBadge } from "@/components/erp/brand-badge";
import { cn } from "@/lib/utils";
import {
  displayName,
  fetchMessages,
  fillTemplate,
  inboxApi,
  profileLinks,
  updateConversation,
  uploadInboxMedia,
  windowHoursLeft,
  type InboxChannel,
  type InboxConversation,
  type InboxMessage,
  type QuickReply,
} from "@/lib/erp/inbox/inbox";
import { ContactAvatar, PlatformChip } from "./shared";

type Props = {
  conversation: InboxConversation;
  channel: InboxChannel | undefined;
  quickReplies: QuickReply[];
  onBack: () => void;
  onTogglePanel: () => void;
};

function dayLabel(d: Date) {
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a
        key={i}
        href={p}
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2 break-all"
      >
        {p}
      </a>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

function StatusTick({ m }: { m: InboxMessage }) {
  if (m.direction !== "out") return null;
  if (m.status === "failed") return <AlertCircle className="h-3 w-3 text-destructive" />;
  if (m.status === "pending") return <Clock className="h-3 w-3" />;
  if (m.status === "read") return <CheckCheck className="h-3 w-3 text-sky-300" />;
  if (m.status === "delivered") return <CheckCheck className="h-3 w-3" />;
  return <Check className="h-3 w-3" />;
}

function Bubble({
  m,
  onRetry,
  retrying,
}: {
  m: InboxMessage;
  onRetry: (m: InboxMessage) => void;
  retrying: boolean;
}) {
  const out = m.direction === "out";
  const atts = Array.isArray(m.attachments) ? m.attachments : [];
  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div className={cn("flex max-w-[78%] flex-col gap-1", out ? "items-end" : "items-start")}>
        {atts.map((a, i) => (
          <div key={i} className="overflow-hidden rounded-2xl">
            {a.type === "image" || a.type === "sticker" ? (
              <a href={a.url} target="_blank" rel="noreferrer">
                <img
                  src={a.url}
                  alt=""
                  className={cn(
                    "max-h-72 max-w-full rounded-2xl object-cover bg-muted",
                    a.type === "sticker" && "max-h-28 bg-transparent",
                  )}
                  referrerPolicy="no-referrer"
                />
              </a>
            ) : a.type === "video" ? (
              <video src={a.url} controls className="max-h-72 max-w-full rounded-2xl bg-black" />
            ) : a.type === "audio" ? (
              <audio src={a.url} controls className="max-w-[260px]" />
            ) : (
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-2xl border bg-card px-3 py-2 text-sm"
              >
                <FileText className="h-4 w-4" /> {a.name || "File"}
              </a>
            )}
          </div>
        ))}
        {m.body && (
          <div
            className={cn(
              "whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
              out
                ? m.status === "failed"
                  ? "rounded-br-md bg-destructive/10 text-foreground ring-1 ring-destructive/30"
                  : "rounded-br-md bg-primary text-primary-foreground"
                : "rounded-bl-md bg-muted text-foreground",
            )}
          >
            {linkify(m.body)}
          </div>
        )}
        <div className={cn("flex items-center gap-1 px-1 text-[10px] text-muted-foreground")}>
          {out && m.sent_via === "platform" && (
            <span title="Sent from Meta inbox / phone">via app ·</span>
          )}
          <span>{timeLabel(m.created_at)}</span>
          <StatusTick m={m} />
        </div>
        {m.status === "failed" && (
          <div className="flex max-w-full items-center gap-2 px-1 text-[11px] text-destructive">
            <span className="truncate" title={m.error ?? ""}>
              {m.error ?? "Failed"}
            </span>
            <button
              type="button"
              onClick={() => onRetry(m)}
              disabled={retrying}
              className="inline-flex shrink-0 items-center gap-1 font-medium underline"
            >
              <RotateCcw className="h-3 w-3" /> Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Thread({ conversation: c, channel, quickReplies, onBack, onTogglePanel }: Props) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<{
    url: string;
    type: "image" | "video" | "audio" | "file";
    name: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const name = displayName(c);

  const msgsQ = useQuery({
    queryKey: ["inbox", "messages", c.id],
    queryFn: () => fetchMessages(c.id),
    refetchInterval: 60_000,
  });
  const messages = useMemo(() => msgsQ.data ?? [], [msgsQ.data]);

  // Opening a thread clears its unread badge.
  useEffect(() => {
    if (c.unread_count > 0) {
      updateConversation(c.id, { unread_count: 0 })
        .then(() => qc.invalidateQueries({ queryKey: ["inbox", "conversations"] }))
        .catch(() => {});
    }
  }, [c.id, c.unread_count, qc]);

  // Reset composer when switching conversations.
  useEffect(() => {
    setText("");
    setAttachment(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [c.id]);

  // Stick to the bottom when new messages arrive.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, c.id]);

  const brandReplies = useMemo(
    () =>
      quickReplies
        .filter((q) => !q.brand_id || q.brand_id === c.brand_id)
        .sort((a, b) => b.use_count - a.use_count || a.sort_order - b.sort_order),
    [quickReplies, c.brand_id],
  );

  // "/" autocomplete
  const slashQuery =
    text.startsWith("/") && !text.includes("\n") ? text.slice(1).toLowerCase() : null;
  const slashMatches = useMemo(() => {
    if (slashQuery === null) return [];
    return brandReplies
      .filter(
        (q) =>
          q.shortcut.toLowerCase().includes(slashQuery) ||
          q.title.toLowerCase().includes(slashQuery),
      )
      .slice(0, 8);
  }, [brandReplies, slashQuery]);
  useEffect(() => setSlashIndex(0), [slashQuery]);

  const send = useMutation({
    mutationFn: (v: {
      text: string | null;
      attachment?: { url: string; type: "image" | "video" | "audio" | "file" } | null;
      quickReplyId?: string | null;
      retryOfMessageId?: string | null;
    }) => inboxApi("send", { conversationId: c.id, ...v }),
    onMutate: async (v) => {
      // Optimistic bubble
      await qc.cancelQueries({ queryKey: ["inbox", "messages", c.id] });
      if (v.retryOfMessageId) return;
      const temp: InboxMessage = {
        id: `temp-${Date.now()}`,
        conversation_id: c.id,
        brand_id: c.brand_id,
        direction: "out",
        external_message_id: null,
        msg_type: v.attachment?.type ?? "text",
        body: v.text,
        attachments: v.attachment ? [v.attachment] : [],
        sent_by: null,
        sent_via: "erp",
        status: "pending",
        error: null,
        created_at: new Date().toISOString(),
      };
      qc.setQueryData<InboxMessage[]>(["inbox", "messages", c.id], (old) => [...(old ?? []), temp]);
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["inbox", "messages", c.id] });
      qc.invalidateQueries({ queryKey: ["inbox", "conversations"] });
      qc.invalidateQueries({ queryKey: ["inbox", "quick-replies"] });
    },
  });

  const submit = () => {
    const t = text.trim();
    if (!t && !attachment) return;
    send.mutate({
      text: t || null,
      attachment: attachment ? { url: attachment.url, type: attachment.type } : null,
    });
    setText("");
    setAttachment(null);
  };

  const sendQuick = (q: QuickReply) => {
    const body = fillTemplate(q.body, c);
    send.mutate({
      text: body,
      attachment: q.image_url ? { url: q.image_url, type: "image" } : null,
      quickReplyId: q.id,
    });
  };

  const insertQuick = (q: QuickReply) => {
    setText(fillTemplate(q.body, c));
    if (q.image_url) setAttachment({ url: q.image_url, type: "image", name: "image" });
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % slashMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertQuick(slashMatches[slashIndex]!);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setText("");
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const r = await uploadInboxMedia(file, c.brand_id);
      setAttachment({ ...r, name: file.name });
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const file = Array.from(e.clipboardData.files ?? [])[0];
    if (file && file.type.startsWith("image/")) {
      e.preventDefault();
      onPickFile(file);
    }
  };

  const toggleDone = useMutation({
    mutationFn: () => updateConversation(c.id, { status: c.status === "done" ? "open" : "done" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox", "conversations"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const hoursLeft = windowHoursLeft(c.last_inbound_at);
  const windowNote =
    hoursLeft !== null
      ? hoursLeft < 3
        ? `Reply window: ${Math.max(1, Math.round(hoursLeft * 60))}m left`
        : null
      : c.platform === "whatsapp"
        ? "24h window closed — customer reply na dile WhatsApp-e message jabe na"
        : "24h window closed — Human Agent tag diye pathano hobe (7 din porjonto)";

  // Group messages by day
  const grouped = useMemo(() => {
    const out: Array<{ day: string; items: InboxMessage[] }> = [];
    for (const m of messages) {
      const d = dayLabel(new Date(m.created_at));
      const last = out[out.length - 1];
      if (last && last.day === d) last.items.push(m);
      else out.push({ day: d, items: [m] });
    }
    return out;
  }, [messages]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/70 px-3 py-2.5 md:px-4">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <ContactAvatar name={name} src={c.contact_avatar} platform={c.platform} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{name}</div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <PlatformChip platform={c.platform} />
            <BrandBadge brandId={c.brand_id} variant="compact" />
            {channel && <span className="hidden truncate sm:inline">· {channel.name}</span>}
          </div>
        </div>
        <Button
          variant={c.status === "done" ? "outline" : "default"}
          size="sm"
          onClick={() => toggleDone.mutate()}
          disabled={toggleDone.isPending}
          className="gap-1.5"
        >
          {c.status === "done" ? (
            <RotateCcw className="h-3.5 w-3.5" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">{c.status === "done" ? "Reopen" : "Done"}</span>
        </Button>
        {profileLinks(c, channel)[0] && (
          <Button variant="ghost" size="icon" asChild title={profileLinks(c, channel)[0]!.label}>
            <a href={profileLinks(c, channel)[0]!.url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={onTogglePanel} title="Customer info">
          <PanelRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-6">
        {msgsQ.isLoading ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-2">
            {grouped.map((g) => (
              <Fragment key={g.day}>
                <div className="sticky top-0 z-[1] flex justify-center py-1">
                  <span className="rounded-full bg-background/90 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm ring-1 ring-border/60">
                    {g.day}
                  </span>
                </div>
                {g.items.map((m) => (
                  <Bubble
                    key={m.id}
                    m={m}
                    retrying={send.isPending}
                    onRetry={(fm) =>
                      send.mutate({
                        text: fm.body,
                        attachment:
                          fm.attachments?.[0] && fm.attachments[0].type !== "sticker"
                            ? {
                                url: fm.attachments[0].url,
                                type: fm.attachments[0].type as
                                  "image" | "video" | "audio" | "file",
                              }
                            : null,
                        retryOfMessageId: fm.id,
                      })
                    }
                  />
                ))}
              </Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border/70 bg-background">
        {windowNote && (
          <div className="flex items-center gap-1.5 bg-amber-500/10 px-4 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
            <Clock className="h-3 w-3" /> {windowNote}
          </div>
        )}

        {brandReplies.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto px-3 pt-2 [scrollbar-width:none]">
            <Zap className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            {brandReplies.slice(0, 12).map((q) => (
              <Tooltip key={q.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={send.isPending}
                    onClick={(e) => (e.shiftKey || e.altKey ? insertQuick(q) : sendQuick(q))}
                    className="shrink-0 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                  >
                    {q.title}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs whitespace-pre-wrap text-xs">
                  {fillTemplate(q.body, c)}
                  <div className="mt-1 opacity-60">Click = send · Shift+click = edit first</div>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}

        <div className="relative p-3">
          {slashMatches.length > 0 && (
            <div className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden rounded-xl border bg-popover shadow-lg">
              {slashMatches.map((q, i) => (
                <button
                  key={q.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertQuick(q);
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-2 text-left text-sm",
                    i === slashIndex ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <span className="shrink-0 font-mono text-xs text-primary">{q.shortcut}</span>
                  <span className="min-w-0">
                    <span className="block font-medium">{q.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {fillTemplate(q.body, c)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {attachment && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border bg-muted/40 p-2 text-xs">
              {attachment.type === "image" ? (
                <img src={attachment.url} alt="" className="h-12 w-12 rounded object-cover" />
              ) : (
                <FileText className="h-5 w-5" />
              )}
              <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="rounded p-1 hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept="image/*,video/mp4,audio/*,application/pdf"
              onChange={(e) => onPickFile(e.target.files?.[0])}
            />
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              title="Photo / file"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
            </Button>
            <Textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              rows={1}
              placeholder="Reply likho… ( / = quick reply, Enter = send, Shift+Enter = new line )"
              className="max-h-40 min-h-[40px] resize-none py-2.5"
            />
            <Button
              size="icon"
              className="shrink-0"
              onClick={submit}
              disabled={send.isPending || uploading || (!text.trim() && !attachment)}
            >
              {send.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
