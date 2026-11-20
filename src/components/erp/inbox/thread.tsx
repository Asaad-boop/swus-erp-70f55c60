import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  Check,
  CheckCheck,
  CheckCircle2,
  ExternalLink,
  Clock,
  FileText,
  Loader2,
  Mic,
  Paperclip,
  PanelRight,
  RotateCcw,
  Send,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BrandBadge } from "@/components/erp/brand-badge";
import { cn } from "@/lib/utils";
import {
  displayName,
  fetchMessages,
  fillTemplate,
  inboxApi,
  initials,
  PLATFORM_LABEL,
  QR_CATEGORIES,
  profileLinks,
  updateConversation,
  uploadInboxMedia,
  windowHoursLeft,
  type InboxChannel,
  type InboxConversation,
  type InboxMessage,
  type InboxStaff,
  type QuickReply,
} from "@/lib/erp/inbox/inbox";
import { ContactAvatar, PlatformIcon } from "./shared";
import { WaTemplateDialog } from "./wa-template-dialog";
import { PriceReplyDialog, type PriceImage } from "./price-reply-dialog";
import { useConversationPresence } from "./use-conversation-presence";
import { useVoiceTyping } from "./use-voice-typing";
import { EmojiPicker } from "./emoji-picker";
import { rewriteReplyFn, suggestRepliesFn } from "@/lib/erp/inbox/inbox-ai.functions";

const QUICK_REACTIONS = ["❤️", "👍", "😊", "🙏", "😂", "😮"];

type Props = {
  conversation: InboxConversation;
  channel: InboxChannel | undefined;
  quickReplies: QuickReply[];
  staff: InboxStaff[];
  currentUserId: string | null;
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
  author,
  quoted,
  onPrice,
  onReact,
  onReply,
  first = true,
  last = true,
  avatar,
  fresh,
}: {
  m: InboxMessage;
  onRetry: (m: InboxMessage) => void;
  retrying: boolean;
  /** who sent an outgoing message */
  author?: string | null;
  /** the message this one quotes */
  quoted?: InboxMessage | null;
  onPrice?: (m: InboxMessage, attachmentIndex: number) => void;
  onReact?: (m: InboxMessage, emoji: string | null) => void;
  onReply?: (m: InboxMessage) => void;
  /** position inside a run of messages from the same side */
  first?: boolean;
  last?: boolean;
  /** customer avatar, shown beside the last bubble of a run */
  avatar?: React.ReactNode;
  /** arrived while the thread was open → animate in */
  fresh?: boolean;
}) {
  const out = m.direction === "out";
  const reactions = Array.isArray(m.reactions) ? m.reactions : [];
  const pageReaction = reactions.find((r) => r.by === "page")?.emoji ?? null;
  const canReact = !out && !!onReact && !!m.external_message_id;
  const atts = Array.isArray(m.attachments) ? m.attachments : [];
  const failed = m.status === "failed";
  const quotedImg =
    quoted && (quoted.attachments ?? [])[m.meta?.attachment_index ?? 0]?.type === "image"
      ? quoted.attachments[m.meta?.attachment_index ?? 0]!.url
      : quoted?.attachments?.find((a) => a.type === "image")?.url;
  // Corners tighten on the side where a run of bubbles stacks.
  const shape = out
    ? cn("rounded-[18px]", !first && "rounded-tr-[6px]", !last && "rounded-br-[6px]")
    : cn("rounded-[18px]", !first && "rounded-tl-[6px]", !last && "rounded-bl-[6px]");
  const showMeta = last || failed;
  return (
    <div
      className={cn(
        "group/msg flex items-end gap-2",
        out ? "justify-end" : "justify-start",
        first ? "mt-3" : "mt-[3px]",
        fresh && "ib-msg-enter",
      )}
    >
      {!out && <div className="w-7 shrink-0">{last ? avatar : null}</div>}
      <div
        className={cn(
          "relative flex max-w-[min(78%,560px)] flex-col gap-1",
          out ? "items-end" : "items-start",
          reactions.length > 0 && "mb-2.5",
        )}
      >
        {quoted && (
          <div
            className={cn(
              "flex max-w-full items-center gap-2 rounded-xl border-l-[3px] px-2 py-1 text-[11.5px]",
              out
                ? "border-primary/50 bg-[var(--ib-accent-soft)] text-[var(--ib-ink-2)]"
                : "border-[var(--ib-ink-3)] bg-[var(--ib-in)] text-[var(--ib-ink-2)]",
            )}
          >
            {quotedImg && (
              <img
                src={quotedImg}
                alt=""
                referrerPolicy="no-referrer"
                className="h-8 w-8 rounded-md object-cover"
              />
            )}
            <span className="truncate">
              {quoted.body?.slice(0, 60) || (quotedImg ? "Customer er chobi" : "Message")}
            </span>
          </div>
        )}
        {atts.map((a, i) => (
          <div key={i} className={cn("group/att relative overflow-hidden", shape)}>
            {!out && onPrice && a.type === "image" && (
              <button
                type="button"
                onClick={() => onPrice(m, i)}
                className="absolute bottom-2 left-2 z-[1] flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-neutral-900 shadow-lg ring-1 ring-black/5 backdrop-blur transition-all hover:bg-white md:translate-y-1 md:opacity-0 md:group-hover/att:translate-y-0 md:group-hover/att:opacity-100"
              >
                <span className="text-primary">৳</span> Dam dao
              </button>
            )}
            {a.type === "image" || a.type === "sticker" ? (
              <a href={a.url} target="_blank" rel="noreferrer" className="block">
                <img
                  src={a.url}
                  alt=""
                  className={cn(
                    "max-h-80 max-w-full bg-[var(--ib-in)] object-cover",
                    shape,
                    a.type === "sticker" && "max-h-28 bg-transparent",
                  )}
                  referrerPolicy="no-referrer"
                />
              </a>
            ) : a.type === "video" ? (
              <video src={a.url} controls className={cn("max-h-80 max-w-full bg-black", shape)} />
            ) : a.type === "audio" ? (
              <audio src={a.url} controls className="max-w-[260px]" />
            ) : (
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "flex items-center gap-2 border border-[var(--ib-line)] bg-[var(--ib-panel)] px-3 py-2.5 text-sm",
                  shape,
                )}
              >
                <FileText className="ib-ink-2 h-4 w-4" /> {a.name || "File"}
              </a>
            )}
          </div>
        ))}
        {m.body && (
          <div
            className={cn(
              "whitespace-pre-wrap break-words px-3.5 py-2 text-[14px] leading-[1.45]",
              shape,
              out
                ? failed
                  ? "bg-rose-500/8 text-[var(--ib-ink)] ring-1 ring-rose-500/30"
                  : m.status === "pending"
                    ? "ib-bubble-out opacity-70"
                    : "ib-bubble-out"
                : "ib-bubble-in",
            )}
          >
            {linkify(m.body)}
          </div>
        )}
        {reactions.length > 0 && (
          <div
            className={cn(
              "absolute -bottom-3 flex gap-0.5 rounded-full bg-[var(--ib-panel)] px-1.5 py-0.5 text-[13px] leading-none shadow-[var(--ib-shadow-lift)] ring-1 ring-[var(--ib-line)]",
              out ? "right-2" : "left-2",
              showMeta && "bottom-3",
            )}
          >
            {reactions.map((r, i) => (
              <button
                key={i}
                type="button"
                title={
                  r.by === "page" ? "Amader reaction (click = remove)" : "Customer er reaction"
                }
                disabled={r.by !== "page" || !canReact}
                onClick={() => onReact?.(m, null)}
              >
                {r.emoji}
              </button>
            ))}
          </div>
        )}
        {showMeta && (
          <div className="ib-ink-3 flex items-center gap-1 px-1.5 text-[10.5px]">
            {out &&
              (m.sent_via === "platform" ? (
                <span title="Meta inbox / phone app theke pathano">
                  {m.msg_type === "template" ? "Template" : "Page/Phone app"} ·
                </span>
              ) : author ? (
                <span className="font-medium text-[var(--ib-ink-2)]">{author} ·</span>
              ) : null)}
            <span className="tabular">{timeLabel(m.created_at)}</span>
            <StatusTick m={m} />
          </div>
        )}
        {failed && (
          <div className="flex max-w-full items-center gap-2 px-1 text-[11px] text-rose-600 dark:text-rose-400">
            <span className="truncate" title={m.error ?? ""}>
              {m.error ?? "Pathano jay nai"}
            </span>
            <button
              type="button"
              onClick={() => onRetry(m)}
              disabled={retrying}
              className="inline-flex shrink-0 items-center gap-1 font-semibold underline underline-offset-2"
            >
              <RotateCcw className="h-3 w-3" /> Abar pathao
            </button>
          </div>
        )}
        {canReact && (
          <div className="pointer-events-none absolute bottom-full left-0 z-[2] mb-1 flex translate-y-1 items-center gap-0.5 rounded-full border border-[var(--ib-line)] bg-[var(--ib-panel)] px-1 py-0.5 opacity-0 shadow-[var(--ib-shadow-lift)] transition-all duration-150 focus-within:pointer-events-auto focus-within:translate-y-0 focus-within:opacity-100 group-hover/msg:pointer-events-auto group-hover/msg:translate-y-0 group-hover/msg:opacity-100">
            {QUICK_REACTIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onReact!(m, pageReaction === e ? null : e)}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-[15px] transition-transform hover:scale-125",
                  pageReaction === e && "bg-[var(--ib-accent-soft)]",
                )}
                title={pageReaction === e ? "Remove" : "React"}
              >
                {e}
              </button>
            ))}
            {onReply && (
              <button
                type="button"
                onClick={() => onReply(m)}
                className="ib-ink-2 ml-0.5 flex h-7 items-center whitespace-nowrap rounded-full px-2 text-[11.5px] font-medium hover:bg-[var(--ib-hover)] hover:text-[var(--ib-ink)]"
                title="Ei message er reply"
              >
                ↩ Reply
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function Thread({
  conversation: c,
  channel,
  quickReplies,
  staff,
  currentUserId,
  onBack,
  onTogglePanel,
}: Props) {
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
  const [qrCat, setQrCat] = useState("top");
  const qrCats = useMemo(
    () =>
      QR_CATEGORIES.filter((k) => brandReplies.some((q) => (q.category || "general") === k.key)),
    [brandReplies],
  );
  const visibleReplies = useMemo(
    () =>
      qrCat === "top"
        ? [...brandReplies]
            .sort((a, b) => b.use_count - a.use_count || a.sort_order - b.sort_order)
            .slice(0, 10)
        : brandReplies.filter((q) => (q.category || "general") === qrCat),
    [brandReplies, qrCat],
  );

  const send = useMutation({
    mutationFn: (v: {
      text: string | null;
      attachment?: { url: string; type: "image" | "video" | "audio" | "file" } | null;
      quickReplyId?: string | null;
      retryOfMessageId?: string | null;
      replyToMessageId?: string | null;
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
        reply_to: v.replyToMessageId ?? null,
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
      replyToMessageId: replyTo?.id ?? null,
    });
    setText("");
    setAttachment(null);
    setReplyTo(null);
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

  const assign = useMutation({
    mutationFn: (userId: string | null) => updateConversation(c.id, { assigned_to: userId }),
    onSuccess: (_d, userId) => {
      qc.invalidateQueries({ queryKey: ["inbox", "conversations"] });
      const who = staff.find((s) => s.id === userId)?.display_name;
      toast.success(userId ? `Assigned: ${who ?? "staff"}` : "Unassigned");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const assignee = c.assigned_to ? staff.find((s) => s.id === c.assigned_to) : undefined;
  const [tplOpen, setTplOpen] = useState(false);
  const [priceImages, setPriceImages] = useState<PriceImage[] | null>(null);
  const [replyTo, setReplyTo] = useState<InboxMessage | null>(null);
  const [aiReplies, setAiReplies] = useState<string[] | null>(null);
  useEffect(() => {
    setReplyTo(null);
    setAiReplies(null);
  }, [c.id]);
  const suggest = useMutation({
    mutationFn: () => suggestRepliesFn({ data: { conversationId: c.id } }),
    onSuccess: (r) => {
      if (!r.replies.length) toast.error(r.reason ?? "AI kichu dite pareni");
      setAiReplies(r.replies);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const rewrite = useMutation({
    mutationFn: (mode: "polite" | "short" | "sales" | "fix" | "bangla" | "english") =>
      rewriteReplyFn({ data: { text, mode } }),
    onSuccess: (r) => {
      if (r.text) setText(r.text);
      else toast.error(r.reason ?? "AI error");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const react = useMutation({
    mutationFn: ({ m, emoji }: { m: InboxMessage; emoji: string | null }) =>
      inboxApi("react", { messageId: m.id, emoji }),
    onMutate: ({ m, emoji }) => {
      qc.setQueryData<InboxMessage[]>(["inbox", "messages", c.id], (old) =>
        (old ?? []).map((x) =>
          x.id === m.id
            ? {
                ...x,
                reactions: [
                  ...(x.reactions ?? []).filter((r) => r.by !== "page"),
                  ...(emoji ? [{ by: "page" as const, emoji }] : []),
                ],
              }
            : x,
        ),
      );
    },
    onError: (e: Error) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["inbox", "messages", c.id] });
    },
  });
  const insertAtCursor = (str: string) => {
    const el = inputRef.current;
    if (!el) {
      setText((t) => t + str);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + str + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + str.length, start + str.length);
    });
  };
  const [typingNow, setTypingNow] = useState(false);
  useEffect(() => {
    if (!text.trim()) {
      setTypingNow(false);
      return;
    }
    setTypingNow(true);
    const t = setTimeout(() => setTypingNow(false), 5000);
    return () => clearTimeout(t);
  }, [text]);
  const voice = useVoiceTyping((t) =>
    setText((cur) => (cur && !cur.endsWith(" ") && !cur.endsWith("\n") ? `${cur} ${t}` : cur + t)),
  );
  useEffect(() => {
    if (voice.error) toast.error(voice.error);
  }, [voice.error]);
  const myName = staff.find((s) => s.id === currentUserId)?.display_name ?? "Staff";
  const peers = useConversationPresence(c.id, { userId: currentUserId, name: myName }, typingNow);
  const staffName = (id: string | null) =>
    id
      ? id === currentUserId
        ? "You"
        : (staff.find((s) => s.id === id)?.display_name ?? null)
      : null;

  const hoursLeft = windowHoursLeft(c.last_inbound_at);
  const windowNote =
    hoursLeft !== null
      ? hoursLeft < 3
        ? `Reply window: ${Math.max(1, Math.round(hoursLeft * 60))}m left`
        : null
      : c.platform === "whatsapp"
        ? "24h window closed — ekhon shudhu approved template pathano jabe"
        : "24h window closed — Human Agent tag diye pathano hobe (7 din porjonto)";

  // Messages that arrive while the thread is open slide in; history doesn't.
  const seenRef = useRef<{ conv: string; ids: Set<string> } | null>(null);
  const freshIds = useMemo(() => {
    if (!msgsQ.data) return new Set<string>();
    if (!seenRef.current || seenRef.current.conv !== c.id) {
      seenRef.current = { conv: c.id, ids: new Set(messages.map((m) => m.id)) };
      return new Set<string>();
    }
    const fresh = new Set<string>();
    for (const m of messages) {
      if (seenRef.current.ids.has(m.id)) continue;
      // Our own sends animate once as the optimistic bubble, not again when confirmed.
      if (m.direction === "in" || m.id.startsWith("temp-")) fresh.add(m.id);
    }
    return fresh;
  }, [messages, msgsQ.data, c.id]);

  const msgById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const imageFor = (m: InboxMessage, i: number): PriceImage => ({
    messageId: m.id,
    attachmentIndex: i,
    url: m.attachments[i]!.url,
    hint: m.body,
  });
  // Customer photos since our last reply that haven't been priced yet.
  const pendingImages = useMemo(() => {
    const out: PriceImage[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!;
      if (m.direction === "out") break;
      const near = messages
        .slice(Math.max(0, i - 2), i + 3)
        .find((x) => x.direction === "in" && x.body)?.body;
      (m.attachments ?? []).forEach((a, j) => {
        if (a.type === "image")
          out.unshift({ messageId: m.id, attachmentIndex: j, url: a.url, hint: m.body || near });
      });
    }
    return out.slice(-10);
  }, [messages]);

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

  const iconBtn =
    "ib-ink-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--ib-hover)] hover:text-[var(--ib-ink)] disabled:opacity-40";
  const typingPeers = peers.filter((x) => x.typing);
  const link = profileLinks(c, channel)[0];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-[var(--ib-line)] px-3 md:px-5">
        <button type="button" className={cn(iconBtn, "md:hidden")} onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </button>
        <ContactAvatar name={name} src={c.contact_avatar} platform={c.platform} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-[15px] font-semibold leading-5">
              {name}
            </span>
            {c.status === "done" && (
              <span className="shrink-0 rounded-md bg-emerald-500/10 px-1.5 py-px text-[10.5px] font-medium text-emerald-700 dark:text-emerald-400">
                Done
              </span>
            )}
          </div>
          {peers.length > 0 ? (
            <div
              className={cn(
                "mt-0.5 flex items-center gap-1.5 truncate text-[12px] font-medium",
                typingPeers.length
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-sky-600 dark:text-sky-400",
              )}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
              </span>
              {typingPeers.length
                ? `${typingPeers.map((x) => x.name).join(", ")} reply likhche…`
                : `${peers.map((x) => x.name).join(", ")} ei chat dekhche`}
            </div>
          ) : (
            <div className="ib-ink-2 mt-0.5 flex items-center gap-1.5 text-[12px]">
              <PlatformIcon platform={c.platform} className="h-3.5 w-3.5" />
              <span className="truncate">{channel?.name ?? PLATFORM_LABEL[c.platform]}</span>
              <BrandBadge brandId={c.brand_id} variant="compact" />
            </div>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ib-ink-2 flex h-9 items-center gap-1.5 rounded-lg border border-[var(--ib-line)] px-2.5 text-[13px] font-medium transition-colors hover:bg-[var(--ib-hover)] hover:text-[var(--ib-ink)]"
              title={assignee ? `Assigned: ${assignee.display_name}` : "Assign"}
            >
              {assignee ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ib-accent-soft)] text-[9px] font-bold text-primary">
                  {initials(assignee.display_name)}
                </span>
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              <span className="hidden max-w-[96px] truncate lg:inline">
                {assignee ? assignee.display_name.split(" ")[0] : "Assign"}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
            <DropdownMenuLabel className="text-xs">Kar kache dibe?</DropdownMenuLabel>
            {currentUserId && c.assigned_to !== currentUserId && (
              <DropdownMenuItem onClick={() => assign.mutate(currentUserId)}>
                Amake dao
              </DropdownMenuItem>
            )}
            {staff
              .filter((x) => x.id !== currentUserId)
              .map((x) => (
                <DropdownMenuItem key={x.id} onClick={() => assign.mutate(x.id)}>
                  <span className="mr-2 flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-bold">
                    {initials(x.display_name)}
                  </span>
                  <span className="truncate">{x.display_name}</span>
                  {x.id === c.assigned_to && <Check className="ml-auto h-3.5 w-3.5" />}
                </DropdownMenuItem>
              ))}
            {c.assigned_to && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => assign.mutate(null)}>Unassign</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          title="Done / Reopen (E)"
          onClick={() => toggleDone.mutate()}
          disabled={toggleDone.isPending}
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-colors disabled:opacity-60",
            c.status === "done"
              ? "ib-ink-2 border border-[var(--ib-line)] hover:bg-[var(--ib-hover)]"
              : "bg-[var(--ib-ink)] text-[var(--ib-panel)] hover:opacity-90",
          )}
        >
          {c.status === "done" ? (
            <RotateCcw className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">{c.status === "done" ? "Reopen" : "Done"}</span>
        </button>
        <div className="mx-0.5 hidden h-6 w-px bg-[var(--ib-line)] sm:block" />
        {link && (
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className={iconBtn}
            title={link.label}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
        <button type="button" className={iconBtn} onClick={onTogglePanel} title="Customer info">
          <PanelRight className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="ib-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-6 pt-2 md:px-6"
      >
        {msgsQ.isLoading ? (
          <div className="mx-auto max-w-3xl space-y-4 py-6" aria-hidden>
            {[60, 40, 70, 30, 55].map((w, i) => (
              <div key={i} className={cn("flex", i % 2 ? "justify-end" : "justify-start")}>
                <div
                  className="skeleton h-9 rounded-[18px] bg-[var(--ib-in)]"
                  style={{ width: `${w}%` }}
                />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="ib-ink-2 flex h-full items-center justify-center text-sm">
            Ekhono kono message nai
          </div>
        ) : (
          <div className="mx-auto max-w-3xl">
            {grouped.map((g) => (
              <Fragment key={g.day}>
                <div className="sticky top-0 z-[3] flex items-center gap-3 py-3">
                  <div className="h-px flex-1 bg-[var(--ib-line)]" />
                  <span className="ib-ink-3 rounded-full bg-[var(--ib-panel)] px-2 text-[11px] font-medium">
                    {g.day}
                  </span>
                  <div className="h-px flex-1 bg-[var(--ib-line)]" />
                </div>
                {g.items.map((m, i) => {
                  const prev = g.items[i - 1];
                  const next = g.items[i + 1];
                  const gap = (a?: InboxMessage, b?: InboxMessage) =>
                    !!a &&
                    !!b &&
                    a.direction === b.direction &&
                    (a.sent_by ?? "") === (b.sent_by ?? "") &&
                    Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) <
                      5 * 60_000;
                  const first = !gap(prev, m);
                  const last = !gap(m, next);
                  return (
                    <Bubble
                      key={m.id}
                      m={m}
                      first={first}
                      last={last}
                      fresh={freshIds.has(m.id)}
                      avatar={<ContactAvatar name={name} src={c.contact_avatar} size={28} />}
                      author={staffName(m.sent_by)}
                      quoted={m.reply_to ? (msgById.get(m.reply_to) ?? null) : null}
                      onPrice={(pm, idx) => setPriceImages([imageFor(pm, idx)])}
                      onReact={(rm, emoji) => react.mutate({ m: rm, emoji })}
                      onReply={(rm) => {
                        setReplyTo(rm);
                        inputRef.current?.focus();
                      }}
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
                  );
                })}
              </Fragment>
            ))}
          </div>
        )}
      </div>

      {c.platform === "whatsapp" && (
        <WaTemplateDialog open={tplOpen} onOpenChange={setTplOpen} conversation={c} />
      )}
      <PriceReplyDialog
        open={!!priceImages}
        onOpenChange={(o) => !o && setPriceImages(null)}
        conversation={c}
        images={priceImages ?? []}
      />

      {/* Composer */}
      <div className="shrink-0 px-3 pb-3 md:px-5 md:pb-4">
        <div className="mx-auto max-w-3xl">
          {brandReplies.length > 0 && (
            <div className="mb-2 flex items-center gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="ib-ink-2 flex h-7 shrink-0 items-center gap-1 rounded-lg bg-[var(--ib-canvas)] px-2.5 text-[12px] font-medium hover:text-[var(--ib-ink)]"
                    title="Quick reply category"
                  >
                    <span className="text-amber-500">⚡</span>
                    {qrCat === "top"
                      ? "Top"
                      : (qrCats.find((x) => x.key === qrCat)?.label ?? "Top")}
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-44">
                  {[{ key: "top", label: "Top (beshi use)" }, ...qrCats].map((cat) => (
                    <DropdownMenuItem key={cat.key} onClick={() => setQrCat(cat.key)}>
                      {cat.label}
                      {qrCat === cat.key && <Check className="ml-auto h-3.5 w-3.5" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto py-0.5 [mask-image:linear-gradient(to_right,black_92%,transparent)] [scrollbar-width:none]">
                {visibleReplies.map((q) => (
                  <Tooltip key={q.id}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={send.isPending}
                        onClick={(e) => (e.shiftKey || e.altKey ? insertQuick(q) : sendQuick(q))}
                        className="ib-chip h-7 shrink-0 px-3 text-[12.5px] font-medium disabled:opacity-50"
                      >
                        {q.title}
                        {q.image_url && <span className="ib-ink-3 ml-1">· chobi</span>}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs whitespace-pre-wrap text-xs">
                      {fillTemplate(q.body, c)}
                      <div className="mt-1 opacity-60">Click = pathao · Shift+click = age edit</div>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>
          )}

          <div className="ib-dock relative">
            {slashMatches.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 z-10 mb-2 overflow-hidden rounded-2xl border border-[var(--ib-line)] bg-[var(--ib-panel)] p-1 shadow-[var(--ib-shadow-lift)]">
                {slashMatches.map((q, i) => (
                  <button
                    key={q.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertQuick(q);
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left text-sm",
                      i === slashIndex
                        ? "bg-[var(--ib-accent-soft)]"
                        : "hover:bg-[var(--ib-hover)]",
                    )}
                  >
                    <span className="shrink-0 pt-px text-xs font-semibold text-primary">
                      {q.shortcut}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">{q.title}</span>
                      <span className="ib-ink-2 block truncate text-xs">
                        {fillTemplate(q.body, c)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {(windowNote || pendingImages.length > 0) && (
              <div className="space-y-px overflow-hidden rounded-t-[17px] border-b border-[var(--ib-line)]">
                {windowNote && (
                  <div className="flex items-center gap-2 bg-[var(--ib-amber-soft)] px-4 py-2 text-[12px] text-amber-800 dark:text-amber-300">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1">{windowNote}</span>
                    {c.platform === "whatsapp" && hoursLeft === null && (
                      <button
                        type="button"
                        onClick={() => setTplOpen(true)}
                        className="shrink-0 rounded-md bg-amber-600 px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-amber-700"
                      >
                        Template pathao
                      </button>
                    )}
                  </div>
                )}
                {pendingImages.length > 0 && (
                  <div className="flex items-center gap-3 bg-[var(--ib-accent-soft)] px-3 py-2">
                    <div className="flex -space-x-2">
                      {pendingImages.slice(0, 4).map((im) => (
                        <img
                          key={`${im.messageId}:${im.attachmentIndex}`}
                          src={im.url}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="h-8 w-8 rounded-lg object-cover ring-2 ring-[var(--ib-panel)]"
                        />
                      ))}
                    </div>
                    <span className="ib-ink-2 min-w-0 flex-1 truncate text-[12.5px]">
                      Customer {pendingImages.length}ta chobi diyeche
                    </span>
                    <button
                      type="button"
                      onClick={() => setPriceImages(pendingImages)}
                      className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground shadow-sm hover:opacity-90"
                    >
                      ৳ {pendingImages.length > 1 ? "Shob chobir dam dao" : "Dam dao"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {(aiReplies?.length || replyTo || attachment || voice.listening) && (
              <div className="space-y-2 px-3 pt-3">
                {aiReplies && aiReplies.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[12px] font-medium text-violet-700 dark:text-violet-300">
                      <Sparkles className="h-3.5 w-3.5" /> AI er 3ta uttor — ekta bechhe edit kore
                      pathao
                      <button
                        type="button"
                        onClick={() => setAiReplies(null)}
                        className="ib-ink-3 ml-auto rounded-md p-1 hover:bg-[var(--ib-hover)]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {aiReplies.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setText(r);
                          setAiReplies(null);
                          requestAnimationFrame(() => inputRef.current?.focus());
                        }}
                        className="block w-full rounded-xl border border-violet-500/20 bg-violet-500/[0.04] px-3 py-2 text-left text-[13.5px] leading-snug transition-colors hover:border-violet-500/50 hover:bg-violet-500/[0.08]"
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                )}
                {replyTo && (
                  <div className="flex items-center gap-2 rounded-xl border-l-[3px] border-primary bg-[var(--ib-canvas)] px-2.5 py-1.5 text-[12.5px]">
                    {replyTo.attachments?.find((a) => a.type === "image") && (
                      <img
                        src={replyTo.attachments.find((a) => a.type === "image")!.url}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="h-8 w-8 rounded-md object-cover"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">Reply: </span>
                      <span className="ib-ink-2">{replyTo.body || "Chobi"}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setReplyTo(null)}
                      className="ib-ink-3 rounded-md p-1 hover:bg-[var(--ib-hover)]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {attachment && (
                  <div className="inline-flex max-w-full items-center gap-2 rounded-xl border border-[var(--ib-line)] bg-[var(--ib-canvas)] p-1.5 pr-2 text-[12.5px]">
                    {attachment.type === "image" ? (
                      <img
                        src={attachment.url}
                        alt=""
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                    ) : (
                      <FileText className="ib-ink-2 m-2 h-5 w-5" />
                    )}
                    <span className="min-w-0 truncate">{attachment.name}</span>
                    <button
                      type="button"
                      onClick={() => setAttachment(null)}
                      className="ib-ink-3 rounded-md p-1 hover:bg-[var(--ib-hover)]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {voice.listening && (
                  <div className="ib-ink-2 flex items-center gap-2 text-[12.5px]">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
                    {voice.interim || "Bolo, ami likhchi…"}
                  </div>
                )}
              </div>
            )}

            <textarea
              id="inbox-composer"
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              rows={1}
              placeholder={`${name.split(" ")[0]} ke reply likho…`}
              className="block max-h-44 min-h-[52px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[14.5px] leading-relaxed outline-none placeholder:text-[var(--ib-ink-3)]"
            />

            <div className="flex items-center gap-0.5 px-2 pb-2">
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept="image/*,video/mp4,audio/*,application/pdf"
                onChange={(e) => onPickFile(e.target.files?.[0])}
              />
              <button
                type="button"
                className={iconBtn}
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                title="Chobi / file"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
              </button>
              <EmojiPicker onPick={insertAtCursor} />
              {voice.supported && (
                <button
                  type="button"
                  className={cn(
                    iconBtn,
                    voice.listening &&
                      "bg-rose-500/10 text-rose-600 hover:bg-rose-500/15 hover:text-rose-600",
                  )}
                  onClick={() => (voice.listening ? voice.stop() : voice.start())}
                  title={voice.listening ? "Thamao" : "Bangla voice typing"}
                >
                  <Mic className="h-4 w-4" />
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-violet-700 transition-colors hover:bg-violet-500/10 disabled:opacity-50 dark:text-violet-300"
                    title="AI"
                    disabled={suggest.isPending || rewrite.isPending}
                  >
                    {suggest.isPending || rewrite.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    AI
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-56">
                  <DropdownMenuItem onClick={() => suggest.mutate()}>
                    Reply suggest koro
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    {text.trim() ? "Lekha ta bodlao" : "Age kichu likho, tarpor bodlate parbe"}
                  </DropdownMenuLabel>
                  {(
                    [
                      ["polite", "Aro bhodro"],
                      ["short", "Choto koro"],
                      ["sales", "Bikri-mukhi"],
                      ["fix", "Banan thik koro"],
                      ["bangla", "Banglish theke বাংলা"],
                      ["english", "English e"],
                    ] as const
                  ).map(([mode, label]) => (
                    <DropdownMenuItem
                      key={mode}
                      disabled={!text.trim()}
                      onClick={() => rewrite.mutate(mode)}
                    >
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="ib-ink-3 ml-auto hidden pr-2 text-[11px] lg:inline">
                Enter pathao · Shift+Enter notun line · / quick reply
              </span>
              <button
                type="button"
                onClick={submit}
                disabled={send.isPending || uploading || (!text.trim() && !attachment)}
                className="ml-auto flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-40 lg:ml-0"
              >
                {send.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Pathao
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
