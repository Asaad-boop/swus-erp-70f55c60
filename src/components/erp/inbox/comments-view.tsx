import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  MessageCircle,
  MessageSquareReply,
  MessagesSquare,
  RotateCcw,
  Search,
  Send,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BrandBadge } from "@/components/erp/brand-badge";
import { cn } from "@/lib/utils";
import { inboxApi, type QuickReply } from "@/lib/erp/inbox/inbox";
import {
  COMMENT_PAGE,
  commentAuthor,
  commentLink,
  fetchCommentThread,
  fetchComments,
  setCommentStatus,
  type CommentPlatform,
  type InboxComment,
} from "@/lib/erp/inbox/comments";
import { ContactAvatar, PlatformIcon, relTime } from "./shared";

type Props = {
  brandIds: string[];
  platform: CommentPlatform | "all";
  showBrand: boolean;
  quickReplies: QuickReply[];
  onOpenConversation: (id: string) => void;
};

const toInboxPlatform = (p: CommentPlatform): "messenger" | "instagram" =>
  p === "facebook" ? "messenger" : "instagram";

function fill(body: string, c: InboxComment | null) {
  const first = (c?.author_name ?? "").trim().split(/\s+/)[0] ?? "";
  return body.replace(/\s*\{name\}/g, first ? ` ${first}` : "").replace(/^\s+/, "");
}

export function CommentsView({
  brandIds,
  platform,
  showBrand,
  quickReplies,
  onOpenConversation,
}: Props) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"open" | "done" | "all">("open");
  const [unrepliedOnly, setUnrepliedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [limit, setLimit] = useState(COMMENT_PAGE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const filters = { brandIds, platform, status, unrepliedOnly, search: debounced };
  const listQ = useQuery({
    queryKey: ["inbox", "comments", filters, limit],
    queryFn: () => fetchComments(filters, limit),
    enabled: brandIds.length > 0,
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  });
  const comments = listQ.data ?? [];
  const selected = comments.find((c) => c.id === selectedId) ?? null;

  // Keep the selection valid; pick the first item on desktop.
  useEffect(() => {
    if (
      !selectedId &&
      comments.length > 0 &&
      typeof window !== "undefined" &&
      window.innerWidth >= 768
    ) {
      setSelectedId(comments[0]!.id);
    }
  }, [comments, selectedId]);

  return (
    <div className="flex min-h-0 flex-1 gap-2 px-2 pb-2 md:px-3 md:pb-3">
      {/* List */}
      <aside
        className={cn(
          "ib-panel flex w-full shrink-0 flex-col overflow-hidden md:w-[340px] lg:w-[380px]",
          selected ? "hidden md:flex" : "flex",
        )}
      >
        <div className="space-y-2 border-b border-border/70 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Comment, name…"
              className="h-9 pl-8"
            />
          </div>
          <div className="flex items-center gap-1">
            {(["open", "done", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  status === s
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {s === "open" ? "Open" : s === "done" ? "Done" : "All"}
              </button>
            ))}
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setUnrepliedOnly((v) => !v)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                unrepliedOnly
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              No reply
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {listQ.isLoading ? (
            <div className="flex justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-sm text-muted-foreground">
              <MessageCircle className="h-8 w-8 opacity-40" />
              {status === "open" ? "Shob comment er reply deya hoye geche 🎉" : "Kono comment nai"}
            </div>
          ) : (
            <ul>
              {comments.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      "flex w-full gap-3 border-b border-border/40 px-3 py-2.5 text-left transition-colors",
                      c.id === selectedId ? "bg-muted" : "hover:bg-muted/50",
                    )}
                  >
                    <ContactAvatar
                      name={commentAuthor(c)}
                      platform={toInboxPlatform(c.platform)}
                      size={36}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "truncate text-sm",
                            !c.replied_at ? "font-semibold" : "font-medium",
                          )}
                        >
                          {commentAuthor(c)}
                        </span>
                        {c.is_hidden && (
                          <EyeOff className="h-3 w-3 shrink-0 text-muted-foreground" />
                        )}
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                          {relTime(c.created_at)}
                        </span>
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-foreground/80">
                        {c.body || (c.attachment_url ? "📷 Photo" : "…")}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        {c.post?.image_url && (
                          <img
                            src={c.post.image_url}
                            alt=""
                            className="h-5 w-5 rounded object-cover"
                            referrerPolicy="no-referrer"
                          />
                        )}
                        <span className="truncate text-[10px] text-muted-foreground">
                          {c.post?.message?.slice(0, 50) || "Post"}
                        </span>
                        {c.replied_at ? (
                          <span className="ml-auto shrink-0 text-[10px] font-medium text-emerald-600">
                            ✓ Replied
                          </span>
                        ) : (
                          <span className="ml-auto shrink-0 rounded-full bg-amber-500/15 px-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                            No reply
                          </span>
                        )}
                      </div>
                      {showBrand && (
                        <div className="mt-1">
                          <BrandBadge brandId={c.brand_id} variant="compact" />
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {comments.length >= limit && (
            <div className="p-3">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => setLimit((l) => l + COMMENT_PAGE)}
                disabled={listQ.isFetching}
              >
                {listQ.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load more"}
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Detail */}
      <section
        className={cn(
          "ib-panel min-w-0 flex-1 overflow-hidden",
          selected ? "block" : "hidden md:block",
        )}
      >
        {selected ? (
          <CommentDetail
            key={selected.id}
            comment={selected}
            quickReplies={quickReplies}
            onBack={() => setSelectedId(null)}
            onDone={() => {
              // Move to the next comment in the list after finishing one.
              const idx = comments.findIndex((c) => c.id === selected.id);
              const next = comments[idx + 1] ?? comments[idx - 1] ?? null;
              setSelectedId(next?.id ?? null);
              qc.invalidateQueries({ queryKey: ["inbox", "comments"] });
            }}
            onOpenConversation={onOpenConversation}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <MessagesSquare className="h-10 w-10 opacity-30" />
            Ekta comment select koro
          </div>
        )}
      </section>
    </div>
  );
}

function CommentDetail({
  comment: c,
  quickReplies,
  onBack,
  onDone,
  onOpenConversation,
}: {
  comment: InboxComment;
  quickReplies: QuickReply[];
  onBack: () => void;
  onDone: () => void;
  onOpenConversation: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"public" | "private">("public");
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const threadQ = useQuery({
    queryKey: ["inbox", "comment-thread", c.id],
    queryFn: () => fetchCommentThread(c),
  });
  const thread = threadQ.data ?? [];

  const replies = useMemo(
    () =>
      quickReplies
        .filter((q) => !q.brand_id || q.brand_id === c.brand_id)
        .sort((a, b) => b.use_count - a.use_count || a.sort_order - b.sort_order),
    [quickReplies, c.brand_id],
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["inbox", "comment-thread", c.id] });
    qc.invalidateQueries({ queryKey: ["inbox", "comments"] });
    qc.invalidateQueries({ queryKey: ["inbox", "quick-replies"] });
  };

  const send = useMutation({
    mutationFn: async (v: { text: string; mode: "public" | "private"; quickReplyId?: string }) => {
      if (v.mode === "public")
        return inboxApi("comment_reply", {
          commentId: c.id,
          text: v.text,
          quickReplyId: v.quickReplyId,
        });
      return inboxApi<{ conversationId: string | null }>("comment_private_reply", {
        commentId: c.id,
        text: v.text,
        quickReplyId: v.quickReplyId,
      });
    },
    onSuccess: (r: any, v) => {
      setText("");
      refresh();
      if (v.mode === "private") {
        toast.success("Inbox e message pathano hoyeche", {
          action: r?.conversationId
            ? { label: "Chat kholo", onClick: () => onOpenConversation(r.conversationId) }
            : undefined,
        });
      } else {
        toast.success("Reply deya hoyeche");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hide = useMutation({
    mutationFn: () => inboxApi("comment_hide", { commentId: c.id, hidden: !c.is_hidden }),
    onSuccess: () => {
      toast.success(c.is_hidden ? "Comment abar dekha jabe" : "Comment hide kora hoyeche");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleDone = useMutation({
    mutationFn: () => setCommentStatus(c.id, c.status === "done" ? "open" : "done"),
    onSuccess: () => {
      if (c.status !== "done") onDone();
      else refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    const t = text.trim();
    if (!t || send.isPending) return;
    send.mutate({ text: t, mode });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const link = commentLink(c);
  const post = c.post;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2.5 md:px-4">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PlatformIcon
          platform={toInboxPlatform(c.platform)}
          className="h-4 w-4 text-muted-foreground"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{commentAuthor(c)}</div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <BrandBadge brandId={c.brand_id} variant="compact" />
            <span>
              {c.platform === "facebook" ? "Facebook comment" : "Instagram comment"} ·{" "}
              {relTime(c.created_at)}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => hide.mutate()}
          disabled={hide.isPending}
          className="gap-1.5"
          title={c.is_hidden ? "Unhide" : "Hide"}
        >
          {c.is_hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{c.is_hidden ? "Unhide" : "Hide"}</span>
        </Button>
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
        {link && (
          <Button variant="ghost" size="icon" asChild title="Facebook/Instagram e kholo">
            <a href={link} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-6">
        {/* Post preview */}
        <div className="mb-4 flex gap-3 rounded-xl border bg-card p-3">
          {post?.image_url ? (
            <img
              src={post.image_url}
              alt=""
              className="h-20 w-20 shrink-0 rounded-lg object-cover bg-muted"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
              Post
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Post
            </div>
            <div className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-sm">
              {post?.message || "Ei post er caption pawa jay nai (ad post hote pare)"}
            </div>
            {post?.permalink && (
              <a
                href={post.permalink}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-primary"
              >
                Post dekho <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        {/* Thread */}
        {threadQ.isLoading ? (
          <div className="flex justify-center py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <ul className="space-y-3">
            {(thread.length ? thread : [c]).map((m) => {
              const isTop = !m.external_parent_id;
              const isSelected = m.id === c.id;
              return (
                <li key={m.id} className={cn("flex gap-2.5", !isTop && "ml-10")}>
                  <ContactAvatar name={commentAuthor(m)} size={isTop ? 32 : 26} />
                  <div className="min-w-0 max-w-[85%]">
                    <div
                      className={cn(
                        "rounded-2xl px-3.5 py-2 text-sm",
                        m.is_from_page ? "bg-primary text-primary-foreground" : "bg-muted",
                        isSelected && !m.is_from_page && "ring-2 ring-primary/40",
                        m.is_hidden && "opacity-60",
                      )}
                    >
                      <div
                        className={cn(
                          "text-xs font-semibold",
                          m.is_from_page ? "text-primary-foreground/80" : "text-foreground",
                        )}
                      >
                        {commentAuthor(m)}
                      </div>
                      <div className="whitespace-pre-wrap break-words">{m.body}</div>
                      {m.attachment_url && (
                        <img
                          src={m.attachment_url}
                          alt=""
                          className="mt-1.5 max-h-48 rounded-lg"
                          referrerPolicy="no-referrer"
                        />
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 px-1 text-[10px] text-muted-foreground">
                      {relTime(m.created_at)}
                      {m.is_hidden && <span>· Hidden</span>}
                      {m.private_replied_at && (
                        <span className="text-emerald-600">· Inbox e message deya hoyeche</span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border/70 bg-background">
        {replies.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto px-3 pt-2 [scrollbar-width:none]">
            <Zap className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            {replies.slice(0, 12).map((q) => (
              <Tooltip key={q.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={send.isPending}
                    onClick={(e) => {
                      const body = fill(q.body, c);
                      if (e.shiftKey || e.altKey) {
                        setText(body);
                        inputRef.current?.focus();
                        return;
                      }
                      send.mutate({ text: body, mode, quickReplyId: q.id });
                    }}
                    className="shrink-0 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                  >
                    {q.title}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs whitespace-pre-wrap text-xs">
                  {fill(q.body, c)}
                  <div className="mt-1 opacity-60">
                    Click = {mode === "public" ? "public reply" : "inbox e pathao"} · Shift+click =
                    edit
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}
        <div className="p-3">
          <div className="mb-2 inline-flex rounded-lg bg-muted p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode("public")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium",
                mode === "public" ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
            >
              <MessageSquareReply className="h-3.5 w-3.5" /> Public reply
            </button>
            <button
              type="button"
              onClick={() => setMode("private")}
              disabled={Boolean(c.private_replied_at)}
              title={
                c.private_replied_at
                  ? "Ei comment e already inbox message deya hoyeche (Meta 1 bar allow kore)"
                  : "Customer er inbox e message jabe"
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium disabled:opacity-40",
                mode === "private" ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
            >
              <Send className="h-3.5 w-3.5" /> Inbox e message
            </button>
          </div>
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={
                mode === "public"
                  ? "Comment er niche reply likho… (Enter = send)"
                  : "Customer er inbox e message likho… (Enter = send)"
              }
              className="max-h-40 min-h-[40px] resize-none py-2.5"
            />
            <Button
              size="icon"
              className="shrink-0"
              onClick={submit}
              disabled={send.isPending || !text.trim()}
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
