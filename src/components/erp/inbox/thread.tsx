import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useInboxT } from "@/lib/erp/inbox/i18n";
import { staffColor } from "./conversation-list";
import { QuickOrderSheet } from "./quick-order-sheet";
import {
  AlarmClock,
  ChevronDown,
  AlertTriangle,
  ShoppingBag,
  Tag,
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  Copy,
  CornerUpLeft,
  ExternalLink,
  FileText,
  ImagePlus,
  Loader2,
  Mic,
  PanelRight,
  RotateCcw,
  Search,
  Send,
  SkipForward,
  Smile,
  Sparkles,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  displayName,
  fetchMessages,
  fillTemplate,
  inboxApi,
  initials,
  INBOX_LABELS,
  labelInfo,
  PLATFORM_LABEL,
  profileLinks,
  sendReply,
  updateConversation,
  uploadInboxMedia,
  attachmentKind,
  windowHoursLeft,
  type InboxChannel,
  type InboxConversation,
  type InboxMessage,
  type InboxStaff,
  type OutgoingAttachment,
  type QuickReply,
} from "@/lib/erp/inbox/inbox";
import { BrandTag, ContactAvatar, Lightbox, PlatformIcon } from "./shared";
import { snoozeLabel } from "./conversation-list";
import { WaTemplateDialog } from "./wa-template-dialog";
import { PriceReplyDialog, type PriceImage } from "./price-reply-dialog";
import { useConversationPresence } from "./use-conversation-presence";
import { useVoiceTyping } from "./use-voice-typing";
import { EmojiPicker } from "./emoji-picker";
import { rewriteReplyFn, suggestRepliesFn } from "@/lib/erp/inbox/inbox-ai.functions";

const QUICK_REACTIONS = ["❤️", "👍", "😊", "🙏", "😂", "😮"];
const MAX_FILES = 20;

type Props = {
  conversation: InboxConversation;
  channel: InboxChannel | undefined;
  quickReplies: QuickReply[];
  staff: InboxStaff[];
  currentUserId: string | null;
  onBack: () => void;
  onTogglePanel: () => void;
  /** open the next chat waiting for a reply (after "send & next") */
  onNext?: () => void;
};

type Draft = {
  key: string;
  name: string;
  preview: string;
  type: OutgoingAttachment["type"];
  url?: string;
  failed?: boolean;
};

type PendingAtt = {
  preview: string;
  type: OutgoingAttachment["type"];
  ready: Promise<OutgoingAttachment>;
};

function dayLabel(d: Date) {
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Aaj";
  if (d.toDateString() === y.toDateString()) return "Gotokal";
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
        className="break-all underline underline-offset-2"
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
  if (m.status === "read") return <CheckCheck className="h-3 w-3 text-sky-500" />;
  if (m.status === "delivered") return <CheckCheck className="h-3 w-3" />;
  return <Check className="h-3 w-3" />;
}

function readPref(k: string, d: boolean) {
  try {
    const v = localStorage.getItem(k);
    return v == null ? d : v === "1";
  } catch {
    return d;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Message bubble
// ═══════════════════════════════════════════════════════════════════
function Bubble({
  m,
  onRetry,
  retrying,
  author,
  quoted,
  onPrice,
  onReact,
  onReply,
  onOpenImage,
  onJumpTo,
  first = true,
  last = true,
  avatar,
  fresh,
}: {
  m: InboxMessage;
  onRetry: (m: InboxMessage) => void;
  retrying: boolean;
  author?: string | null;
  quoted?: InboxMessage | null;
  onPrice?: (m: InboxMessage, attachmentIndex: number) => void;
  onReact?: (m: InboxMessage, emoji: string | null) => void;
  onReply: (m: InboxMessage) => void;
  onOpenImage: (url: string) => void;
  onJumpTo: (id: string) => void;
  first?: boolean;
  last?: boolean;
  avatar?: React.ReactNode;
  fresh?: boolean;
}) {
  const out = m.direction === "out";
  const reactions = Array.isArray(m.reactions) ? m.reactions : [];
  const pageReaction = reactions.find((r) => r.by === "page")?.emoji ?? null;
  const canReact = !out && !!onReact && !!m.external_message_id;
  const atts = Array.isArray(m.attachments) ? m.attachments : [];
  const images = atts.filter((a) => a.type === "image");
  const others = atts.filter((a) => a.type !== "image");
  const failed = m.status === "failed";
  const temp = m.id.startsWith("temp-");
  const quotedImg =
    quoted && (quoted.attachments ?? [])[m.meta?.attachment_index ?? 0]?.type === "image"
      ? quoted.attachments[m.meta?.attachment_index ?? 0]!.url
      : quoted?.attachments?.find((a) => a.type === "image")?.url;
  const R = "rounded-[16px]";
  const shape = out
    ? cn(R, !first && "rounded-tr-[5px]", !last && "rounded-br-[5px]")
    : cn(R, !first && "rounded-tl-[5px]", !last && "rounded-bl-[5px]");
  const showMeta = last || failed;
  const copy = () => {
    if (!m.body) return;
    void navigator.clipboard?.writeText(m.body).then(() => toast.success("Copy hoyeche"));
  };

  const actions = !temp && (
    <div
      className={cn(
        "flex shrink-0 items-center gap-0.5 self-center opacity-0 transition-opacity duration-100 focus-within:opacity-100 group-hover/msg:opacity-100",
        out ? "order-first" : "",
      )}
    >
      <button
        type="button"
        onClick={() => onReply(m)}
        className="ib-ink-3 flex h-7 w-7 items-center justify-center rounded-full hover:bg-[var(--ib-hover)] hover:text-[var(--ib-ink)]"
        title="Reply (ei message ta quote kore)"
      >
        <CornerUpLeft className="h-3.5 w-3.5" />
      </button>
      {canReact && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="ib-ink-3 flex h-7 w-7 items-center justify-center rounded-full hover:bg-[var(--ib-hover)] hover:text-[var(--ib-ink)]"
              title="React"
            >
              <Smile className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" className="flex w-auto gap-0.5 rounded-full p-1">
            {QUICK_REACTIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onReact!(m, pageReaction === e ? null : e)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-[17px] transition-transform hover:scale-125",
                  pageReaction === e && "bg-muted",
                )}
              >
                {e}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}
      {m.body && (
        <button
          type="button"
          onClick={copy}
          className="ib-ink-3 flex h-7 w-7 items-center justify-center rounded-full hover:bg-[var(--ib-hover)] hover:text-[var(--ib-ink)]"
          title="Copy"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );

  return (
    <div
      id={`msg-${m.id}`}
      className={cn(
        "group/msg flex items-end gap-1.5",
        out ? "justify-end" : "justify-start",
        first ? "mt-2.5" : "mt-[2px]",
        fresh && "ib-msg-enter",
      )}
    >
      {!out && <div className="w-6 shrink-0">{last ? avatar : null}</div>}
      {out && actions}
      <div
        onDoubleClick={() => !temp && onReply(m)}
        className={cn(
          "relative flex max-w-[min(72%,520px)] flex-col gap-[3px]",
          out ? "items-end" : "items-start",
          reactions.length > 0 && "mb-2.5",
        )}
      >
        {quoted && (
          <button
            type="button"
            onClick={() => onJumpTo(quoted.id)}
            className={cn(
              "flex max-w-full items-center gap-2 rounded-lg border-l-2 px-2 py-1 text-left text-[11.5px]",
              "border-[var(--ib-ink-3)] bg-[var(--ib-canvas)] text-[var(--ib-ink-2)] hover:text-[var(--ib-ink)]",
            )}
          >
            {quotedImg && (
              <img
                src={quotedImg}
                alt=""
                referrerPolicy="no-referrer"
                className="h-7 w-7 rounded object-cover"
              />
            )}
            <span className="truncate">
              {quoted.body?.slice(0, 70) || (quotedImg ? "Chobi" : "Message")}
            </span>
          </button>
        )}

        {atts.length === 0 && ["image", "video", "audio", "file"].includes(m.msg_type) && (
          <div
            className={cn(
              "flex h-28 w-40 animate-pulse items-center justify-center bg-[var(--ib-in)] text-[11px] text-[var(--ib-ink-3)]",
              shape,
            )}
          >
            {m.msg_type === "video"
              ? "Video ashche…"
              : m.msg_type === "image"
                ? "Chobi ashche…"
                : "File ashche…"}
          </div>
        )}

        {images.length > 0 && (
          <div
            className={cn(
              "grid gap-[3px] overflow-hidden",
              shape,
              images.length === 1 ? "grid-cols-1" : "grid-cols-2",
            )}
          >
            {images.map((a, i) => {
              const idx = atts.indexOf(a);
              return (
                <div key={i} className="group/att relative">
                  <button type="button" onClick={() => onOpenImage(a.url)} className="block">
                    <img
                      src={a.url}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className={cn(
                        "bg-[var(--ib-in)] object-cover",
                        images.length === 1 ? "max-h-72 max-w-[300px]" : "h-32 w-32",
                        temp && "opacity-60",
                      )}
                    />
                  </button>
                  {!out && onPrice && (
                    <button
                      type="button"
                      onClick={() => onPrice(m, idx)}
                      className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-neutral-900 shadow ring-1 ring-black/5 transition-opacity md:opacity-0 md:group-hover/att:opacity-100"
                    >
                      <span className="text-primary">৳</span> Dam
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {others.map((a, i) =>
          a.type === "sticker" ? (
            <img key={i} src={a.url} alt="" referrerPolicy="no-referrer" className="max-h-24" />
          ) : a.type === "video" ? (
            <video
              key={i}
              src={a.url}
              controls
              playsInline
              preload="metadata"
              className={cn("max-h-80 max-w-[300px] bg-black", shape, temp && "opacity-70")}
            />
          ) : a.type === "audio" ? (
            <audio key={i} src={a.url} controls className="h-9 max-w-[250px]" />
          ) : (
            <a
              key={i}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "flex items-center gap-2 border border-[var(--ib-line)] bg-[var(--ib-panel)] px-3 py-2 text-[13px]",
                shape,
              )}
            >
              <FileText className="ib-ink-2 h-4 w-4" /> {a.name || "File"}
            </a>
          ),
        )}

        {m.body && (
          <div
            className={cn(
              "whitespace-pre-wrap break-words px-3 py-[7px] text-[13.5px] leading-[1.45]",
              shape,
              out
                ? failed
                  ? "bg-rose-500/[0.07] text-[var(--ib-ink)] ring-1 ring-rose-500/30"
                  : m.sent_via === "auto"
                    ? "ib-bubble-auto"
                    : cn("ib-bubble-out", temp && "opacity-70")
                : "ib-bubble-in",
            )}
          >
            {linkify(m.body)}
          </div>
        )}

        {reactions.length > 0 && (
          <div
            className={cn(
              "absolute -bottom-2.5 flex gap-0.5 rounded-full bg-[var(--ib-panel)] px-1 py-px text-[12px] leading-none shadow-[var(--ib-shadow-lift)] ring-1 ring-[var(--ib-line)]",
              out ? "right-2" : "left-2",
              showMeta && "bottom-2.5",
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
          <div className="ib-ink-3 flex items-center gap-1 px-1 text-[10px]">
            {out &&
              (m.sent_via === "platform" ? (
                <span title="Meta inbox / phone app theke pathano">
                  {m.msg_type === "template" ? "Template" : "Page app"} ·
                </span>
              ) : m.sent_via === "auto" ? (
                <span
                  className="text-violet-600 dark:text-violet-400"
                  title="Ad chat er instant auto-reply"
                >
                  ⚡ Auto ·
                </span>
              ) : author ? (
                <span className="text-[var(--ib-ink-2)]">{author} ·</span>
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
              className="inline-flex shrink-0 items-center gap-1 font-medium underline underline-offset-2"
            >
              <RotateCcw className="h-3 w-3" /> Abar
            </button>
          </div>
        )}
      </div>
      {!out && actions}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Thread
// ═══════════════════════════════════════════════════════════════════
export function Thread({
  conversation: c,
  channel,
  quickReplies,
  staff,
  currentUserId,
  onBack,
  onTogglePanel,
  onNext,
}: Props) {
  const qc = useQueryClient();
  const { t: tr } = useInboxT();
  const [orderOpen, setOrderOpen] = useState(false);
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [slashIndex, setSlashIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [autoNext, setAutoNext] = useState(() => readPref("inbox.autoNext", false));
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const name = displayName(c);
  const firstName = name.split(" ")[0];

  const msgsQ = useQuery({
    queryKey: ["inbox", "messages", c.id],
    queryFn: () => fetchMessages(c.id),
    // Realtime keeps it fresh; don't re-download 200 messages on every visit.
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const messages = useMemo(() => msgsQ.data ?? [], [msgsQ.data]);

  // Missing photo → ask the server to try Meta again (it rate-limits itself).
  useEffect(() => {
    if (c.contact_avatar || c.platform === "whatsapp") return;
    inboxApi<{ avatar: string | null }>("refresh_contact", { conversationId: c.id })
      .then((r) => {
        if (r?.avatar) qc.invalidateQueries({ queryKey: ["inbox", "conversations"] });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id]);

  // Opening a thread clears its unread badge.
  useEffect(() => {
    if (c.unread_count > 0) {
      updateConversation(c.id, { unread_count: 0 })
        .then(() => qc.invalidateQueries({ queryKey: ["inbox", "conversations"] }))
        .catch(() => {});
    }
  }, [c.id, c.unread_count, qc]);

  // ── keep the newest message in view ──────────────────────────────────
  // New chat → jump to the bottom; stay pinned while photos load, unless the
  // user has scrolled up to read history.
  const toBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);
  useLayoutEffect(() => {
    stickRef.current = true;
    setAtBottom(true);
    toBottom();
  }, [c.id, toBottom]);
  useLayoutEffect(() => {
    if (stickRef.current) toBottom();
  }, [messages.length, toBottom]);
  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (stickRef.current) toBottom();
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [toBottom, msgsQ.isLoading]);
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickRef.current = near;
    setAtBottom(near);
  };

  // Reset composer when switching conversations.
  useEffect(() => {
    setText("");
    setDrafts([]);
    setLightbox(null);
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [c.id]);

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

  // ── sending ──────────────────────────────────────────────────────────
  const [replyTo, setReplyTo] = useState<InboxMessage | null>(null);
  const send = useMutation({
    // Photos may still be uploading when Send is pressed: the bubble shows at
    // once with the local preview, and goes out the moment the upload lands.
    mutationFn: async (v: {
      text: string | null;
      attachments: PendingAtt[];
      quickReplyId?: string | null;
      replyToMessageId?: string | null;
    }) => {
      const settled = await Promise.allSettled(v.attachments.map((a) => a.ready));
      const ok = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      if (ok.length < settled.length && ok.length === 0 && !v.text)
        throw new Error("Chobi upload hoyni — abar try koro");
      if (ok.length < settled.length)
        toast.error(`${settled.length - ok.length}ta file upload hoyni`);
      return sendReply(c.id, { ...v, attachments: ok });
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["inbox", "messages", c.id] });
      const now = Date.now();
      const base = {
        conversation_id: c.id,
        brand_id: c.brand_id,
        direction: "out" as const,
        external_message_id: null,
        sent_by: currentUserId,
        sent_via: "erp",
        status: "pending" as const,
        error: null,
      };
      const temps: InboxMessage[] =
        v.attachments.length === 0
          ? [
              {
                ...base,
                id: `temp-${now}`,
                msg_type: "text",
                body: v.text,
                attachments: [],
                created_at: new Date(now).toISOString(),
                reply_to: v.replyToMessageId ?? null,
              },
            ]
          : v.attachments.map((a, i) => ({
              ...base,
              id: `temp-${now}-${i}`,
              msg_type: a.type,
              body: i === v.attachments.length - 1 ? v.text : null,
              attachments: [{ url: a.preview, type: a.type }],
              created_at: new Date(now + i).toISOString(),
              reply_to: i === 0 ? (v.replyToMessageId ?? null) : null,
            }));
      stickRef.current = true;
      qc.setQueryData<InboxMessage[]>(["inbox", "messages", c.id], (old) => [
        ...(old ?? []),
        ...temps,
      ]);
      return { convId: c.id };
    },
    onError: (e: Error, _v, ctx) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["inbox", "messages", ctx?.convId ?? c.id] });
    },
    onSuccess: (_d, v, ctx) => {
      const convId = ctx?.convId ?? c.id;
      // The sent rows arrive by realtime and replace the bubbles in place — no
      // reload. Only if they haven't shown up after a while (bad network,
      // dropped socket) fetch the thread once.
      setTimeout(() => {
        const left = (qc.getQueryData<InboxMessage[]>(["inbox", "messages", convId]) ?? []).some(
          (m) => m.id.startsWith("temp-"),
        );
        if (left) qc.invalidateQueries({ queryKey: ["inbox", "messages", convId] });
      }, 6000);
      if (v.quickReplyId) qc.invalidateQueries({ queryKey: ["inbox", "quick-replies"] });
    },
  });
  const retry = useMutation({
    mutationFn: (fm: InboxMessage) =>
      inboxApi("send", {
        conversationId: c.id,
        text: fm.body,
        attachment:
          fm.attachments?.[0] && fm.attachments[0].type !== "sticker"
            ? { url: fm.attachments[0].url, type: fm.attachments[0].type }
            : null,
        retryOfMessageId: fm.id,
      }),
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: ["inbox", "messages", c.id] }),
  });

  const uploadsRef = useRef(new Map<string, Promise<OutgoingAttachment>>());
  const liveDrafts = drafts.filter((d) => !d.failed);
  const canSubmit = text.trim().length > 0 || liveDrafts.length > 0;
  const pendingFromDrafts = (): PendingAtt[] =>
    liveDrafts.map((d) => ({
      preview: d.url ?? d.preview,
      type: d.type,
      ready: d.url
        ? Promise.resolve({ url: d.url, type: d.type })
        : (uploadsRef.current.get(d.key) ?? Promise.reject(new Error("upload missing"))),
    }));

  const afterSend = () => {
    if (autoNext && onNext) setTimeout(onNext, 120);
  };

  const submit = () => {
    if (!canSubmit) return;
    const t = text.trim();
    send.mutate({
      text: t || null,
      attachments: pendingFromDrafts(),
      replyToMessageId: replyTo?.id ?? null,
    });
    setText("");
    setDrafts([]);
    setReplyTo(null);
    afterSend();
  };

  const sendQuick = (q: QuickReply) => {
    send.mutate({
      text: fillTemplate(q.body, c),
      attachments: q.image_url
        ? [
            {
              preview: q.image_url,
              type: "image" as const,
              ready: Promise.resolve({ url: q.image_url, type: "image" as const }),
            },
          ]
        : [],
      quickReplyId: q.id,
      replyToMessageId: replyTo?.id ?? null,
    });
    setReplyTo(null);
    afterSend();
  };

  const insertQuick = (q: QuickReply) => {
    setText(fillTemplate(q.body, c));
    if (q.image_url && !drafts.some((d) => d.url === q.image_url))
      setDrafts((d) => [
        ...d,
        { key: q.id, name: "template", preview: q.image_url!, url: q.image_url!, type: "image" },
      ]);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // ── attachments: pick, paste or drop several at once ─────────────────
  const addFiles = (list: FileList | File[]) => {
    const room = MAX_FILES - drafts.length;
    const arr = Array.from(list).slice(0, Math.max(0, room));
    if (list.length > room) toast.message(`Ekbare ${MAX_FILES}ta porjonto`);
    for (const file of arr) {
      const key = crypto.randomUUID();
      const type = attachmentKind(file.type);
      setDrafts((d) => [...d, { key, name: file.name, preview: URL.createObjectURL(file), type }]);
      const up = uploadInboxMedia(file, c.brand_id);
      uploadsRef.current.set(key, up);
      up.then((r) =>
        setDrafts((d) => d.map((x) => (x.key === key ? { ...x, url: r.url, type: r.type } : x))),
      ).catch((e) => {
        toast.error(e?.message ?? "Upload failed");
        setDrafts((d) => d.map((x) => (x.key === key ? { ...x, failed: true } : x)));
      });
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files ?? []);
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  };
  const dragDepth = useRef(0);
  const dropHandlers = {
    onDragEnter: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      dragDepth.current++;
      setDragging(true);
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes("Files")) e.preventDefault();
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    },
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
    if (e.key === "Escape" && replyTo) {
      e.preventDefault();
      setReplyTo(null);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  // ── header actions ───────────────────────────────────────────────────
  const toggleDone = useMutation({
    mutationFn: () => updateConversation(c.id, { status: c.status === "done" ? "open" : "done" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox", "conversations"] });
      qc.invalidateQueries({ queryKey: ["inbox", "counts"] });
    },
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
  const mine = !!currentUserId && c.assigned_to === currentUserId;
  const patch = useMutation({
    mutationFn: (v: Parameters<typeof updateConversation>[1]) => updateConversation(c.id, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox", "conversations"] });
      qc.invalidateQueries({ queryKey: ["inbox", "counts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const tags = c.tags ?? [];
  const toggleLabel = (k: string) =>
    patch.mutate({ tags: tags.includes(k) ? tags.filter((t) => t !== k) : [...tags, k] });
  const snoozeTo = (d: Date, note?: string) => {
    patch.mutate({ snoozed_until: d.toISOString(), snooze_note: note ?? null });
    toast.success(`Follow-up: ${snoozeLabel(d.toISOString())}`);
  };
  const at = (h: number, m = 0, addDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + addDays);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const complaintOpen = !!c.complaint_at && !c.complaint_resolved_at;

  const [tplOpen, setTplOpen] = useState(false);
  const [priceImages, setPriceImages] = useState<PriceImage[] | null>(null);
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
    setText(text.slice(0, start) + str + text.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + str.length, start + str.length);
    });
  };

  // auto-grow composer
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(176, Math.max(40, el.scrollHeight))}px`;
  }, [text]);

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
        ? "Apni"
        : (staff.find((s) => s.id === id)?.display_name ?? null)
      : null;

  const hoursLeft = windowHoursLeft(c.last_inbound_at);
  const windowNote =
    hoursLeft !== null
      ? hoursLeft < 3
        ? `Reply window: ${Math.max(1, Math.round(hoursLeft * 60))} minute baki`
        : null
      : c.platform === "whatsapp"
        ? "24 ghonta par — ekhon shudhu approved template jabe"
        : "24 ghonta par — Human Agent tag diye jabe (7 din porjonto)";

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
      if (m.direction === "in" || m.id.startsWith("temp-")) fresh.add(m.id);
    }
    return fresh;
  }, [messages, msgsQ.data, c.id]);

  const msgById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const allImages = useMemo(
    () =>
      messages.flatMap((m) =>
        (m.attachments ?? []).filter((a) => a.type === "image").map((a) => a.url),
      ),
    [messages],
  );
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

  const jumpTo = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("ib-flash");
    setTimeout(() => el.classList.remove("ib-flash"), 1200);
  };
  const startReply = (m: InboxMessage) => {
    setReplyTo(m);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const iconBtn =
    "ib-ink-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[var(--ib-hover)] hover:text-[var(--ib-ink)] disabled:opacity-40";
  const typingPeers = peers.filter((x) => x.typing);
  const link = profileLinks(c, channel)[0];

  return (
    <div className="relative flex h-full min-h-0 flex-col" {...dropHandlers}>
      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-30 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/50 bg-[var(--ib-panel)]/90 text-primary backdrop-blur-sm">
          <ImagePlus className="h-7 w-7" />
          <div className="text-[13px] font-medium">
            Chere dao — {firstName} ke pathanor jonno add hobe
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-[var(--ib-line)] px-3 md:px-4">
        <button type="button" className={cn(iconBtn, "md:hidden")} onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </button>
        <ContactAvatar name={name} src={c.contact_avatar} platform={c.platform} size={34} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold leading-5">{name}</span>
            <BrandTag brandId={c.brand_id} size="xs" />
            {c.status === "done" && (
              <span className="shrink-0 rounded bg-emerald-500/10 px-1 text-[10px] font-medium leading-4 text-emerald-700 dark:text-emerald-400">
                Done
              </span>
            )}
          </div>
          {peers.length > 0 ? (
            <div
              className={cn(
                "flex items-center gap-1.5 truncate text-[11.5px]",
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
            <div className="ib-ink-3 flex items-center gap-1 truncate text-[11.5px]">
              <PlatformIcon platform={c.platform} className="h-3 w-3" />
              <span className="truncate">{channel?.name ?? PLATFORM_LABEL[c.platform]}</span>
              {c.contact_phone && <span className="tabular">· {c.contact_phone}</span>}
            </div>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(iconBtn, tags.length && "text-primary")}
              title="Label"
            >
              <Tag className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-xs">Label</DropdownMenuLabel>
            {INBOX_LABELS.map((l) => (
              <DropdownMenuCheckboxItem
                key={l.key}
                checked={tags.includes(l.key)}
                onCheckedChange={() => toggleLabel(l.key)}
                onSelect={(e) => e.preventDefault()}
                className="text-[13px]"
              >
                <span className={cn("mr-2 h-2 w-2 rounded-full", l.dot)} />
                {l.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={complaintOpen}
              onCheckedChange={() =>
                patch.mutate(
                  complaintOpen
                    ? { complaint_resolved_at: new Date().toISOString() }
                    : { complaint_at: new Date().toISOString(), complaint_resolved_at: null },
                )
              }
              className="text-[13px]"
            >
              <AlertTriangle className="mr-2 h-3.5 w-3.5 text-rose-500" />
              Complaint
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(iconBtn, c.snoozed_until && "text-amber-600")}
              title="Follow-up (pore mone koriye dibe)"
            >
              <AlarmClock className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs">Kokhon abar dekhbo?</DropdownMenuLabel>
            {(
              [
                ["1 ghonta pore", () => new Date(Date.now() + 3_600_000)],
                ["3 ghonta pore", () => new Date(Date.now() + 3 * 3_600_000)],
                ["Aaj rat 9 ta", () => at(21)],
                ["Kal sokal 10 ta", () => at(10, 0, 1)],
                ["Kal bikel 4 ta", () => at(16, 0, 1)],
                ["2 din pore", () => at(10, 0, 2)],
                ["1 soptaho pore", () => at(10, 0, 7)],
              ] as Array<[string, () => Date]>
            ).map(([label, fn]) => (
              <DropdownMenuItem key={label} onClick={() => snoozeTo(fn())} className="text-[13px]">
                {label}
              </DropdownMenuItem>
            ))}
            {c.snoozed_until && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => patch.mutate({ snoozed_until: null, snooze_note: null })}
                  className="text-[13px]"
                >
                  Follow-up bad dao
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onClick={() => setOrderOpen(true)}
          title="Chat theke order banao (naam, phone, thikana, product nije bhore dibe)"
          className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-[12px] font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
        >
          <ShoppingBag className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Order</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg border px-1.5 pr-2 text-[12px] font-medium transition-colors",
                mine
                  ? "border-primary/30 bg-[var(--ib-accent-soft)] text-primary"
                  : assignee
                    ? "border-[var(--ib-line)] text-[var(--ib-ink)] hover:bg-[var(--ib-hover)]"
                    : "border-dashed border-[var(--ib-ink-3)] text-[var(--ib-ink-2)] hover:bg-[var(--ib-hover)]",
              )}
              title={assignee ? `${tr("assignedTo")}: ${assignee.display_name}` : tr("takeChat")}
            >
              {assignee ? (
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white"
                  style={{ background: mine ? "var(--primary)" : staffColor(assignee.id) }}
                >
                  {initials(assignee.display_name)}
                </span>
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              <span className="hidden max-w-[130px] truncate sm:inline">
                {mine
                  ? tr("assignedYou")
                  : assignee
                    ? `${tr("assignedTo")}: ${assignee.display_name.split(" ")[0]}`
                    : tr("nobody")}
              </span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
            <DropdownMenuLabel className="text-xs">{tr("handOver")}</DropdownMenuLabel>
            {currentUserId && c.assigned_to !== currentUserId && (
              <DropdownMenuItem onClick={() => assign.mutate(currentUserId)}>
                {tr("takeChat")}
              </DropdownMenuItem>
            )}
            {staff
              .filter((x) => x.id !== currentUserId)
              .map((x) => (
                <DropdownMenuItem key={x.id} onClick={() => assign.mutate(x.id)}>
                  <span
                    className="mr-2 flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white"
                    style={{ background: staffColor(x.id) }}
                  >
                    {initials(x.display_name)}
                  </span>
                  <span className="truncate">{x.display_name}</span>
                  {x.id === c.assigned_to && <Check className="ml-auto h-3.5 w-3.5" />}
                </DropdownMenuItem>
              ))}
            {c.assigned_to && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => assign.mutate(null)}>
                  {tr("unassign")}
                </DropdownMenuItem>
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
            "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors disabled:opacity-60",
            c.status === "done"
              ? "ib-ink-2 hover:bg-[var(--ib-hover)]"
              : "border border-[var(--ib-line)] hover:border-emerald-500/40 hover:bg-emerald-500/5 hover:text-emerald-700",
          )}
        >
          {c.status === "done" ? (
            <RotateCcw className="h-3.5 w-3.5" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">{c.status === "done" ? "Reopen" : "Done"}</span>
        </button>
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

      {(complaintOpen || c.snoozed_until || (c.order_count ?? 0) > 0 || tags.length > 0) && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--ib-line)] px-3 py-1.5 md:px-4">
          {complaintOpen && (
            <div className="flex min-w-0 max-w-full items-center gap-2 rounded-md bg-rose-500/[0.08] py-1 pl-2 pr-1 text-[12px] text-rose-700 dark:text-rose-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 truncate">
                <b className="font-semibold">Complaint</b>
                {c.complaint_text ? ` — “${c.complaint_text.slice(0, 80)}”` : ""}
              </span>
              <button
                type="button"
                onClick={() => {
                  patch.mutate({ complaint_resolved_at: new Date().toISOString() });
                  toast.success("Complaint shomadhan holo");
                }}
                className="shrink-0 rounded bg-white px-2 py-0.5 text-[11px] font-medium text-rose-700 shadow-sm ring-1 ring-rose-500/20 hover:bg-rose-50 dark:bg-rose-950 dark:text-rose-200"
              >
                Shomadhan hoyeche
              </button>
            </div>
          )}
          {c.snoozed_until && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-[12px] text-amber-800 dark:text-amber-300">
              <AlarmClock className="h-3.5 w-3.5" /> Follow-up: {snoozeLabel(c.snoozed_until)}
              <button
                type="button"
                onClick={() => patch.mutate({ snoozed_until: null, snooze_note: null })}
                className="ml-0.5 rounded p-0.5 hover:bg-amber-500/15"
                title="Bad dao"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {(c.order_count ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[12px] text-emerald-700 dark:text-emerald-300">
              <ShoppingBag className="h-3.5 w-3.5" /> {c.order_count}ta order hoyeche
            </span>
          )}
          {tags.map((t) => {
            const l = labelInfo(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleLabel(t)}
                title="Click = label shorao"
                className="ib-ink-2 group inline-flex items-center gap-1.5 rounded-md bg-[var(--ib-canvas)] px-2 py-1 text-[12px] hover:text-[var(--ib-ink)]"
              >
                <span className={cn("h-2 w-2 rounded-full", l.dot)} />
                {l.label}
                <X className="h-3 w-3 opacity-0 group-hover:opacity-60" />
              </button>
            );
          })}
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="ib-scroll relative min-h-0 flex-1 overflow-y-auto px-3 pb-4 md:px-6"
      >
        {msgsQ.isLoading ? (
          <div className="mx-auto max-w-3xl space-y-3 py-6" aria-hidden>
            {[55, 35, 65, 30, 50].map((w, i) => (
              <div key={i} className={cn("flex", i % 2 ? "justify-end" : "justify-start")}>
                <div
                  className="skeleton h-8 rounded-[16px] bg-[var(--ib-in)]"
                  style={{ width: `${w}%` }}
                />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="ib-ink-2 flex h-full items-center justify-center text-[13px]">
            Ekhono kono message nai
          </div>
        ) : (
          <div ref={contentRef} className="mx-auto max-w-3xl">
            {grouped.map((g) => (
              <Fragment key={g.day}>
                <div className="sticky top-0 z-[3] flex justify-center py-2">
                  <span className="ib-ink-2 rounded-full border border-[var(--ib-line)] bg-[var(--ib-panel)] px-2.5 py-0.5 text-[10.5px] font-medium shadow-[var(--ib-shadow)]">
                    {g.day}
                  </span>
                </div>
                {g.items.map((m, i) => {
                  const prev = g.items[i - 1];
                  const next = g.items[i + 1];
                  const same = (a?: InboxMessage, b?: InboxMessage) =>
                    !!a &&
                    !!b &&
                    a.direction === b.direction &&
                    (a.sent_by ?? "") === (b.sent_by ?? "") &&
                    Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) <
                      5 * 60_000;
                  return (
                    <Bubble
                      key={m.id}
                      m={m}
                      first={!same(prev, m)}
                      last={!same(m, next)}
                      fresh={freshIds.has(m.id)}
                      avatar={<ContactAvatar name={name} src={c.contact_avatar} size={24} />}
                      author={staffName(m.sent_by)}
                      quoted={m.reply_to ? (msgById.get(m.reply_to) ?? null) : null}
                      onPrice={(pm, idx) => setPriceImages([imageFor(pm, idx)])}
                      onReact={(rm, emoji) => react.mutate({ m: rm, emoji })}
                      onReply={startReply}
                      onOpenImage={(url) => setLightbox(Math.max(0, allImages.indexOf(url)))}
                      onJumpTo={jumpTo}
                      retrying={retry.isPending}
                      onRetry={(fm) => retry.mutate(fm)}
                    />
                  );
                })}
              </Fragment>
            ))}
          </div>
        )}
      </div>
      {!atBottom && (
        <button
          type="button"
          onClick={() => {
            stickRef.current = true;
            toBottom(true);
          }}
          className="absolute bottom-[150px] left-1/2 z-10 flex h-8 -translate-x-1/2 items-center gap-1 rounded-full border border-[var(--ib-line)] bg-[var(--ib-panel)] px-3 text-[12px] font-medium shadow-[var(--ib-shadow-lift)] hover:bg-[var(--ib-hover)]"
        >
          <ArrowDown className="h-3.5 w-3.5" /> Notun message
        </button>
      )}

      {c.platform === "whatsapp" && (
        <WaTemplateDialog open={tplOpen} onOpenChange={setTplOpen} conversation={c} />
      )}
      <PriceReplyDialog
        open={!!priceImages}
        onOpenChange={(o) => !o && setPriceImages(null)}
        conversation={c}
        images={priceImages ?? []}
      />
      {lightbox !== null && (
        <Lightbox
          images={allImages}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* Composer */}
      <div className="shrink-0 px-3 pb-3 md:px-4">
        <div className="mx-auto max-w-3xl">
          {/* one-tap replies */}
          {brandReplies.length > 0 && (
            <div className="mb-1.5 flex items-center gap-1">
              <TemplatePicker
                replies={brandReplies}
                conversation={c}
                onSend={sendQuick}
                onInsert={insertQuick}
              />
              <div className="flex min-w-0 items-center gap-1 overflow-x-auto py-0.5 [mask-image:linear-gradient(to_right,black_90%,transparent)]">
                {brandReplies.slice(0, 12).map((q) => (
                  <Tooltip key={q.id}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={send.isPending}
                        onClick={(e) => (e.shiftKey || e.altKey ? insertQuick(q) : sendQuick(q))}
                        className="ib-chip flex h-6 shrink-0 items-center gap-1 px-2 text-[11.5px] disabled:opacity-50"
                      >
                        {q.image_url && (
                          <img
                            src={q.image_url}
                            alt=""
                            className="-ml-1 h-4 w-4 rounded-full object-cover"
                          />
                        )}
                        {q.title}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs whitespace-pre-wrap text-xs">
                      {fillTemplate(q.body, c)}
                      <div className="mt-1 opacity-60">
                        Click = pathao · Shift+click = edit kore pathao
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>
          )}

          <div className="ib-dock relative">
            {slashMatches.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 z-10 mb-1.5 overflow-hidden rounded-xl border border-[var(--ib-line)] bg-[var(--ib-panel)] p-1 shadow-[var(--ib-shadow-lift)]">
                {slashMatches.map((q, i) => (
                  <button
                    key={q.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertQuick(q);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left",
                      i === slashIndex
                        ? "bg-[var(--ib-accent-soft)]"
                        : "hover:bg-[var(--ib-hover)]",
                    )}
                  >
                    {q.image_url ? (
                      <img
                        src={q.image_url}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <span className="w-7 shrink-0 text-center text-[11px] font-semibold text-primary">
                        {q.shortcut}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-medium">{q.title}</span>
                      <span className="ib-ink-2 block truncate text-[11.5px]">
                        {fillTemplate(q.body, c)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {(windowNote || pendingImages.length > 0) && (
              <div className="divide-y divide-[var(--ib-line)] overflow-hidden rounded-t-[13px] border-b border-[var(--ib-line)]">
                {windowNote && (
                  <div className="flex items-center gap-2 bg-[var(--ib-amber-soft)] px-3 py-1.5 text-[11.5px] text-amber-800 dark:text-amber-300">
                    <Clock className="h-3 w-3 shrink-0" />
                    <span className="min-w-0 flex-1">{windowNote}</span>
                    {c.platform === "whatsapp" && hoursLeft === null && (
                      <button
                        type="button"
                        onClick={() => setTplOpen(true)}
                        className="shrink-0 rounded bg-amber-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-amber-700"
                      >
                        Template
                      </button>
                    )}
                  </div>
                )}
                {pendingImages.length > 0 && (
                  <div className="flex items-center gap-2.5 bg-[var(--ib-accent-soft)] px-2.5 py-1.5">
                    <div className="flex -space-x-1.5">
                      {pendingImages.slice(0, 4).map((im) => (
                        <img
                          key={`${im.messageId}:${im.attachmentIndex}`}
                          src={im.url}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="h-6 w-6 rounded-md object-cover ring-2 ring-[var(--ib-panel)]"
                        />
                      ))}
                    </div>
                    <span className="ib-ink-2 min-w-0 flex-1 truncate text-[11.5px]">
                      Customer {pendingImages.length}ta chobi diyeche
                    </span>
                    <button
                      type="button"
                      onClick={() => setPriceImages(pendingImages)}
                      className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-[11.5px] font-medium text-primary-foreground hover:opacity-90"
                    >
                      ৳ {pendingImages.length > 1 ? "Shob er dam" : "Dam dao"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {aiReplies && aiReplies.length > 0 && (
              <div className="space-y-1 px-2.5 pt-2.5">
                <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-violet-700 dark:text-violet-300">
                  <Sparkles className="h-3 w-3" /> AI er uttor — bechhe edit kore pathao
                  <button
                    type="button"
                    onClick={() => setAiReplies(null)}
                    className="ib-ink-3 ml-auto rounded p-0.5 hover:bg-[var(--ib-hover)]"
                  >
                    <X className="h-3 w-3" />
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
                    className="block w-full rounded-lg border border-violet-500/20 bg-violet-500/[0.04] px-2.5 py-1.5 text-left text-[12.5px] leading-snug transition-colors hover:border-violet-500/50"
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}

            {replyTo && (
              <div className="mx-2.5 mt-2.5 flex items-center gap-2 rounded-lg border-l-2 border-primary bg-[var(--ib-canvas)] py-1 pl-2 pr-1 text-[12px]">
                <CornerUpLeft className="h-3.5 w-3.5 shrink-0 text-primary" />
                {replyTo.attachments?.find((a) => a.type === "image") && (
                  <img
                    src={replyTo.attachments.find((a) => a.type === "image")!.url}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-7 w-7 rounded object-cover"
                  />
                )}
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">
                    {replyTo.direction === "in" ? firstName : "Apnar message"}:{" "}
                  </span>
                  <span className="ib-ink-2">{replyTo.body || "Chobi"}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className="ib-ink-3 rounded p-1 hover:bg-[var(--ib-hover)]"
                  title="Bad dao (Esc)"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {drafts.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-2.5 pt-2.5">
                {drafts.map((d) => (
                  <div
                    key={d.key}
                    className="group/d relative h-16 w-16 overflow-hidden rounded-lg border border-[var(--ib-line)] bg-[var(--ib-canvas)]"
                  >
                    {d.type === "image" ? (
                      <button
                        type="button"
                        className="h-full w-full"
                        onClick={() => window.open(d.url ?? d.preview, "_blank")}
                        title={d.name}
                      >
                        <img src={d.preview} alt="" className="h-full w-full object-cover" />
                      </button>
                    ) : d.type === "video" ? (
                      <div className="relative h-full w-full bg-black">
                        <video
                          src={d.preview}
                          muted
                          playsInline
                          preload="metadata"
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-[9px] text-black">
                            ▶
                          </span>
                        </span>
                      </div>
                    ) : (
                      <div className="ib-ink-2 flex h-full flex-col items-center justify-center gap-0.5 px-1 text-center text-[9.5px]">
                        <FileText className="h-4 w-4" />
                        <span className="line-clamp-2 break-all">{d.name}</span>
                      </div>
                    )}
                    {!d.url && !d.failed && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                      </div>
                    )}
                    {d.failed && (
                      <div className="absolute inset-0 flex items-center justify-center bg-rose-600/60 text-[10px] font-medium text-white">
                        Fail
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setDrafts((x) => x.filter((y) => y.key !== d.key))}
                      className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/65 text-white opacity-90 hover:opacity-100"
                      title="Shorao"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
                {drafts.length < MAX_FILES && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="ib-ink-3 flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-[var(--ib-line)] hover:bg-[var(--ib-hover)] hover:text-[var(--ib-ink)]"
                    title="Aro chobi"
                  >
                    <ImagePlus className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}

            {voice.listening && (
              <div className="ib-ink-2 flex items-center gap-2 px-3 pt-2 text-[12px]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
                {voice.interim || "Bolo, ami likhchi…"}
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
              placeholder={replyTo ? tr("writeReply") : tr("writeTo", { name: firstName ?? "" })}
              className="block w-full resize-none bg-transparent px-3 pb-1 pt-2.5 text-[13.5px] leading-relaxed outline-none placeholder:text-[var(--ib-ink-3)]"
            />

            <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                accept="image/*,video/mp4,video/quicktime,video/webm,audio/*,application/pdf"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className={iconBtn}
                onClick={() => fileRef.current?.click()}
                title={tr("addFiles")}
              >
                <ImagePlus className="h-4 w-4" />
              </button>
              <EmojiPicker onPick={insertAtCursor} />
              {voice.supported && (
                <button
                  type="button"
                  className={cn(
                    iconBtn,
                    voice.listening && "bg-rose-500/10 text-rose-600 hover:bg-rose-500/15",
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
                    className="flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-violet-700 transition-colors hover:bg-violet-500/10 disabled:opacity-50 dark:text-violet-300"
                    title="AI"
                    disabled={suggest.isPending || rewrite.isPending}
                  >
                    {suggest.isPending || rewrite.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
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
                    {text.trim() ? "Lekha ta bodlao" : "Age kichu likho"}
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

              {onNext && (
                <button
                  type="button"
                  onClick={() => {
                    const v = !autoNext;
                    setAutoNext(v);
                    try {
                      localStorage.setItem("inbox.autoNext", v ? "1" : "0");
                    } catch {
                      /* storage blocked */
                    }
                  }}
                  className={cn(
                    "ml-auto flex h-8 items-center gap-1 rounded-md px-2 text-[11.5px] transition-colors",
                    autoNext
                      ? "bg-[var(--ib-accent-soft)] font-medium text-primary"
                      : "ib-ink-3 hover:bg-[var(--ib-hover)] hover:text-[var(--ib-ink)]",
                  )}
                  title="Chalu thakle pathanor sathe sathe porer 'reply baki' chat khulbe"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Porer chat</span>
                </button>
              )}
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className={cn(
                  "flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[12.5px] font-medium text-primary-foreground transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-35",
                  !onNext && "ml-auto",
                )}
              >
                <Send className="h-3.5 w-3.5" />
                {liveDrafts.length > 1 ? tr("sendN", { n: liveDrafts.length }) : tr("send")}
              </button>
            </div>
          </div>
        </div>
      </div>
      <QuickOrderSheet conversation={c} open={orderOpen} onOpenChange={setOrderOpen} />
    </div>
  );
}

/** Searchable template library (with photos). Click = send, ✎ = edit first. */
function TemplatePicker({
  replies,
  conversation,
  onSend,
  onInsert,
}: {
  replies: QuickReply[];
  conversation: InboxConversation;
  onSend: (q: QuickReply) => void;
  onInsert: (q: QuickReply) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = replies.filter((r) => {
    const s = q.trim().toLowerCase();
    return (
      !s ||
      r.title.toLowerCase().includes(s) ||
      r.body.toLowerCase().includes(s) ||
      r.shortcut.includes(s)
    );
  });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-6 shrink-0 items-center gap-1 rounded-full bg-[var(--ib-canvas)] px-2 text-[11.5px] font-medium hover:bg-[var(--ib-hover)]"
          title="Shob template"
        >
          <Zap className="h-3 w-3 text-amber-500" />
          Template
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-[380px] p-0">
        <div className="relative border-b p-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Template khojo…"
            className="h-8 w-full rounded-md bg-muted/60 pl-7 pr-2 text-[12.5px] outline-none"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {list.map((r) => (
            <div
              key={r.id}
              className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/70"
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-start gap-2 text-left"
                onClick={() => {
                  onSend(r);
                  setOpen(false);
                }}
              >
                {r.image_url ? (
                  <img
                    src={r.image_url}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold text-primary">
                    {r.shortcut}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-medium">{r.title}</span>
                  <span className="line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">
                    {fillTemplate(r.body, conversation)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onInsert(r);
                  setOpen(false);
                }}
                className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground opacity-0 hover:bg-background hover:text-foreground group-hover:opacity-100"
                title="Age edit korbo"
              >
                Edit
              </button>
            </div>
          ))}
          {list.length === 0 && (
            <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
              Kichu pai nai
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
