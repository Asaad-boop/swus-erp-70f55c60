import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, MessagesSquare, Plug, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { useCurrentRole } from "@/hooks/use-current-role";
import { cn } from "@/lib/utils";
import { beepSuccess } from "@/lib/erp/audio-feedback";
import {
  CONV_PAGE,
  fetchChannels,
  fetchConversations,
  fetchInboxStaff,
  fetchQuickReplies,
  updateConversation,
  type InboxView,
  PLATFORM_LABEL,
  type InboxConversation,
  type InboxPlatform,
} from "@/lib/erp/inbox/inbox";
import { ConversationList } from "@/components/erp/inbox/conversation-list";
import { Thread } from "@/components/erp/inbox/thread";
import { ContactPanel } from "@/components/erp/inbox/contact-panel";
import { QuickRepliesManager } from "@/components/erp/inbox/quick-replies-manager";
import { ChannelsSettings } from "@/components/erp/inbox/channels-settings";
import { PlatformIcon } from "@/components/erp/inbox/shared";
import { CommentsView } from "@/components/erp/inbox/comments-view";
import { db } from "@/lib/erp/inbox/inbox";
import { Sheet, SheetContent } from "@/components/ui/sheet";

type Tab = "inbox" | "comments" | "replies" | "channels";
type InboxSearch = { tab?: Tab; c?: string; meta?: string };

export const Route = createFileRoute("/_authenticated/erp/inbox")({
  head: () => ({ meta: [{ title: "Inbox — ERP" }] }),
  validateSearch: (s: Record<string, unknown>): InboxSearch => ({
    tab: s.tab === "replies" || s.tab === "channels" || s.tab === "comments" ? s.tab : undefined,
    c: typeof s.c === "string" ? s.c : undefined,
    meta: typeof s.meta === "string" ? s.meta : undefined,
  }),
  component: InboxPage,
});

function InboxPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/erp/inbox" });
  const qc = useQueryClient();
  const { brands, brandIds: scopedBrandIds } = useBrand();
  const { isAdmin, userId } = useCurrentRole();
  const tab: Tab = search.tab ?? "inbox";

  // ── filters ─────────────────────────────────────────────────────────
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [platform, setPlatform] = useState<InboxPlatform | "all">("all");
  const [view, setViewState] = useState<InboxView>(() => {
    try {
      return (localStorage.getItem("inbox.view") as InboxView) || "open";
    } catch {
      return "open";
    }
  });
  const setView = (v: InboxView) => {
    setViewState(v);
    setLimit(CONV_PAGE);
    try {
      localStorage.setItem("inbox.view", v);
    } catch {
      /* storage blocked */
    }
  };
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchText, setSearchText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [limit, setLimit] = useState(CONV_PAGE);
  const [panelOpen, setPanelOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(searchText), 250);
    return () => clearTimeout(t);
  }, [searchText]);

  const allBrandIds = useMemo(() => brands.map((b) => b.id), [brands]);
  const brandIds = brandFilter === "all" ? allBrandIds : [brandFilter];

  const filters = { brandIds, platform, view, userId, search: debounced };
  const convQ = useQuery({
    queryKey: ["inbox", "conversations", filters, limit],
    queryFn: () => fetchConversations(filters, limit),
    enabled: brandIds.length > 0,
    refetchInterval: 30_000,
    placeholderData: (prev, prevQuery) =>
      // keep the list while typing / paging, never across a brand switch
      prevQuery &&
      JSON.stringify((prevQuery.queryKey[2] as any)?.brandIds) === JSON.stringify(brandIds)
        ? prev
        : undefined,
  });
  const conversations = convQ.data ?? [];

  const channelsQ = useQuery({ queryKey: ["inbox", "channels"], queryFn: fetchChannels });
  const repliesQ = useQuery({ queryKey: ["inbox", "quick-replies"], queryFn: fetchQuickReplies });
  const staffQ = useQuery({
    queryKey: ["inbox", "staff"],
    queryFn: fetchInboxStaff,
    staleTime: 5 * 60_000,
  });
  const staff = staffQ.data ?? [];
  const { data: openComments } = useQuery({
    queryKey: ["inbox", "comment-count", brandIds],
    enabled: brandIds.length > 0,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await db
        .from("inbox_comments")
        .select("id", { count: "exact", head: true })
        .in("brand_id", brandIds)
        .eq("is_from_page", false)
        .eq("is_deleted", false)
        .eq("status", "open")
        .is("replied_at", null);
      if (error) return 0;
      return count ?? 0;
    },
  });
  const channels = channelsQ.data ?? [];

  // Selected conversation may be outside the current filter (e.g. just marked done) — fetch it on its own.
  const selectedId = search.c ?? null;
  const selectedFromList = conversations.find((c) => c.id === selectedId) ?? null;
  const selectedQ = useQuery({
    queryKey: ["inbox", "conversations", "one", selectedId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("inbox_conversations")
        .select("*")
        .eq("id", selectedId)
        .maybeSingle();
      if (error) throw error;
      return data as InboxConversation | null;
    },
    enabled: !!selectedId && !selectedFromList,
  });
  const selected = selectedFromList ?? selectedQ.data ?? null;

  const select = (id: string | null) =>
    navigate({ search: (s: InboxSearch) => ({ ...s, c: id ?? undefined }) });

  // ── keyboard shortcuts ──────────────────────────────────────────────
  // j/k or ↓/↑ move · / search · r reply box · e done/reopen · Esc back
  const kbd = useRef({ conversations, selected, select });
  kbd.current = { conversations, selected, select };
  useEffect(() => {
    if (tab !== "inbox") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const typing =
        !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      const { conversations: list, selected: cur, select: go } = kbd.current;
      if (e.key === "Escape") {
        if (typing) (t as HTMLElement).blur();
        return;
      }
      if (typing) return;
      const idx = cur ? list.findIndex((c) => c.id === cur.id) : -1;
      const move = (d: number) => {
        const next = list[Math.min(list.length - 1, Math.max(0, idx + d))];
        if (next) {
          e.preventDefault();
          go(next.id);
          document
            .querySelector(`[data-conv-id="${next.id}"]`)
            ?.scrollIntoView({ block: "nearest" });
        }
      };
      if (e.key === "j" || e.key === "ArrowDown") move(1);
      else if (e.key === "k" || e.key === "ArrowUp") move(-1);
      else if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "r" && cur) {
        e.preventDefault();
        (document.getElementById("inbox-composer") as HTMLTextAreaElement | null)?.focus();
      } else if (e.key === "e" && cur) {
        e.preventDefault();
        const nextStatus = cur.status === "done" ? "open" : "done";
        void updateConversation(cur.id, { status: nextStatus }).then(() =>
          qc.invalidateQueries({ queryKey: ["inbox", "conversations"] }),
        );
        if (nextStatus === "done") {
          const next = list[idx + 1] ?? list[idx - 1];
          if (next && next.id !== cur.id) go(next.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, qc]);

  // ── realtime ────────────────────────────────────────────────────────
  const selectedRef = useRef<string | null>(selectedId);
  selectedRef.current = selectedId;
  useEffect(() => {
    const ch = supabase
      .channel("inbox-live")
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "inbox_messages" },
        (payload: any) => {
          const m = payload.new;
          qc.invalidateQueries({ queryKey: ["inbox", "messages", m.conversation_id] });
          qc.invalidateQueries({ queryKey: ["inbox", "conversations"] });
          if (
            m.direction === "in" &&
            (document.hidden || selectedRef.current !== m.conversation_id)
          ) {
            try {
              beepSuccess();
            } catch {
              /* audio blocked */
            }
          }
        },
      )
      .on(
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "inbox_messages" },
        (payload: any) => {
          qc.invalidateQueries({ queryKey: ["inbox", "messages", payload.new.conversation_id] });
        },
      )
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "inbox_comments" },
        (payload: any) => {
          qc.invalidateQueries({ queryKey: ["inbox", "comments"] });
          qc.invalidateQueries({ queryKey: ["inbox", "comment-count"] });
          if (payload.eventType === "INSERT" && payload.new && !payload.new.is_from_page) {
            try {
              beepSuccess();
            } catch {
              /* audio blocked */
            }
          }
        },
      )
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "inbox_conversations" },
        () => {
          qc.invalidateQueries({ queryKey: ["inbox", "conversations"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  // Unread count in the browser tab title
  const unreadTotal = conversations.reduce((n, c) => n + (c.unread_count > 0 ? 1 : 0), 0);
  useEffect(() => {
    const base = "Inbox — ERP";
    document.title = unreadTotal > 0 ? `(${unreadTotal}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [unreadTotal]);

  const noChannels = channelsQ.isSuccess && channels.filter((c) => c.is_active).length === 0;
  const channelFor = (id: string) => channels.find((c) => c.id === id);

  const tabs: Array<{ key: Tab; label: string; icon: typeof Zap; show: boolean }> = [
    { key: "inbox", label: "Messages", icon: MessagesSquare, show: true },
    { key: "comments", label: "Comments", icon: MessageCircle, show: true },
    { key: "replies", label: "Quick replies", icon: Zap, show: true },
    { key: "channels", label: "Channels", icon: Plug, show: isAdmin },
  ];

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2 md:px-4">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
          {tabs
            .filter((t) => t.show)
            .map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() =>
                  navigate({
                    search: (s: InboxSearch) => ({
                      ...s,
                      tab: t.key === "inbox" ? undefined : t.key,
                      meta: undefined,
                    }),
                  })
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  tab === t.key
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <t.icon className="h-3.5 w-3.5" /> {t.label}
                {t.key === "comments" && (openComments ?? 0) > 0 && (
                  <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                    {openComments! > 99 ? "99+" : openComments}
                  </span>
                )}
                {t.key === "inbox" && unreadTotal > 0 && (
                  <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                    {unreadTotal > 99 ? "99+" : unreadTotal}
                  </span>
                )}
              </button>
            ))}
        </div>

        {(tab === "inbox" || tab === "comments") && (
          <>
            <div className="mx-1 hidden h-5 w-px bg-border md:block" />
            <div className="flex items-center gap-1 overflow-x-auto">
              <FilterChip
                active={brandFilter === "all"}
                onClick={() => {
                  setBrandFilter("all");
                  setLimit(CONV_PAGE);
                }}
              >
                All brands
              </FilterChip>
              {brands.map((b) => (
                <FilterChip
                  key={b.id}
                  active={brandFilter === b.id}
                  onClick={() => {
                    setBrandFilter(b.id);
                    setLimit(CONV_PAGE);
                  }}
                >
                  {b.name}
                </FilterChip>
              ))}
            </div>
            <div className="mx-1 hidden h-5 w-px bg-border md:block" />
            <div className="flex items-center gap-1">
              <FilterChip active={platform === "all"} onClick={() => setPlatform("all")}>
                All
              </FilterChip>
              {(tab === "comments"
                ? (["messenger", "instagram"] as const)
                : (["messenger", "instagram", "whatsapp"] as const)
              ).map((p) => (
                <FilterChip
                  key={p}
                  active={platform === p}
                  onClick={() => setPlatform(p)}
                  title={PLATFORM_LABEL[p]}
                >
                  <PlatformIcon platform={p} className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">
                    {tab === "comments" && p === "messenger" ? "Facebook" : PLATFORM_LABEL[p]}
                  </span>
                </FilterChip>
              ))}
            </div>
          </>
        )}
      </div>

      {tab === "comments" ? (
        <CommentsView
          brandIds={brandIds}
          platform={
            platform === "messenger" ? "facebook" : platform === "instagram" ? "instagram" : "all"
          }
          showBrand={brandFilter === "all" && brands.length > 1}
          quickReplies={repliesQ.data ?? []}
          onOpenConversation={(id) => navigate({ search: { c: id } })}
        />
      ) : tab === "replies" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <QuickRepliesManager replies={repliesQ.data ?? []} />
        </div>
      ) : tab === "channels" && isAdmin ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ChannelsSettings channels={channels} metaParam={search.meta} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* List */}
          <aside
            className={cn(
              "w-full shrink-0 border-r border-border/70 md:w-[320px] lg:w-[340px]",
              selected ? "hidden md:block" : "block",
            )}
          >
            {noChannels && (
              <div className="m-3 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                Kono page connect kora nai.{" "}
                {isAdmin ? (
                  <button
                    type="button"
                    className="font-medium text-primary underline"
                    onClick={() => navigate({ search: { tab: "channels" } })}
                  >
                    Channels e giye connect koro
                  </button>
                ) : (
                  "Admin ke bolo Channels connect korte."
                )}
              </div>
            )}
            <ConversationList
              conversations={conversations}
              isLoading={convQ.isLoading}
              selectedId={selectedId}
              onSelect={(id) => select(id)}
              search={searchText}
              onSearch={setSearchText}
              view={view}
              onView={setView}
              staff={staff}
              searchRef={searchRef}
              showBrand={brandFilter === "all" && brands.length > 1}
              canLoadMore={conversations.length >= limit}
              onLoadMore={() => setLimit((l) => l + CONV_PAGE)}
              isFetchingMore={convQ.isFetching}
            />
          </aside>

          {/* Thread */}
          <section className={cn("min-w-0 flex-1", selected ? "block" : "hidden md:block")}>
            {selected ? (
              <Thread
                conversation={selected}
                channel={channelFor(selected.channel_id)}
                quickReplies={repliesQ.data ?? []}
                staff={staff}
                currentUserId={userId}
                onBack={() => select(null)}
                onTogglePanel={() => {
                  if (typeof window !== "undefined" && window.innerWidth < 1280) setSheetOpen(true);
                  else setPanelOpen((v) => !v);
                }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <MessagesSquare className="h-10 w-10 opacity-30" />
                Bam pash theke ekta conversation select koro
                <div className="text-xs opacity-70">
                  {scopedBrandIds.length > 0 && `${conversations.length} conversation · `}Messenger
                  · Instagram · WhatsApp ek jaygay
                </div>
                <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] opacity-70">
                  {[
                    ["J / K", "next / prev"],
                    ["/", "search"],
                    ["R", "reply"],
                    ["E", "done"],
                  ].map(([k, l]) => (
                    <span key={k}>
                      <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">{k}</kbd>{" "}
                      {l}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {selected && (
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetContent side="right" className="w-[320px] p-0 xl:hidden [&>button]:hidden">
                <ContactPanel
                  conversation={selected}
                  channel={channelFor(selected.channel_id)}
                  onClose={() => setSheetOpen(false)}
                />
              </SheetContent>
            </Sheet>
          )}

          {/* Customer panel */}
          {selected && panelOpen && (
            <aside className="hidden w-[300px] shrink-0 border-l border-border/70 xl:block">
              <ContactPanel
                conversation={selected}
                channel={channelFor(selected.channel_id)}
                onClose={() => setPanelOpen(false)}
              />
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
