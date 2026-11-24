import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Megaphone, MessageCircle, MessagesSquare, Plug, Zap } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { displayName } from "@/lib/erp/inbox/inbox";
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
  fetchViewCounts,
  runPool,
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
import { BrandTag, PlatformIcon } from "@/components/erp/inbox/shared";
import { BulkReplyDialog } from "@/components/erp/inbox/bulk-reply-dialog";
import { toast } from "sonner";
import { CommentsView } from "@/components/erp/inbox/comments-view";
import { AdsView } from "@/components/erp/inbox/ads-view";
import { db } from "@/lib/erp/inbox/inbox";
import { Sheet, SheetContent } from "@/components/ui/sheet";

type Tab = "inbox" | "comments" | "ads" | "replies" | "channels";
type InboxSearch = { tab?: Tab; c?: string; meta?: string };

export const Route = createFileRoute("/_authenticated/erp/inbox")({
  head: () => ({ meta: [{ title: "Inbox — ERP" }] }),
  validateSearch: (s: Record<string, unknown>): InboxSearch => ({
    tab:
      s.tab === "replies" || s.tab === "channels" || s.tab === "comments" || s.tab === "ads"
        ? s.tab
        : undefined,
    c: typeof s.c === "string" ? s.c : undefined,
    meta: typeof s.meta === "string" ? s.meta : undefined,
  }),
  component: InboxPage,
});

function InboxPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/erp/inbox" });
  const qc = useQueryClient();
  const { brands } = useBrand();
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
    setPicked(new Set());
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

  const countsQ = useQuery({
    queryKey: ["inbox", "counts", brandIds, platform, userId],
    queryFn: () => fetchViewCounts(brandIds, platform, userId),
    enabled: brandIds.length > 0,
    refetchInterval: 30_000,
    staleTime: 5_000,
  });

  // ── bulk selection ──────────────────────────────────────────────────
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const lastPick = useRef<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  useEffect(() => setPicked(new Set()), [brandFilter, platform]);
  const onPick = (id: string, on: boolean, range?: boolean) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (range && lastPick.current) {
        const a = conversations.findIndex((x) => x.id === lastPick.current);
        const b = conversations.findIndex((x) => x.id === id);
        if (a >= 0 && b >= 0) {
          for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(conversations[i]!.id);
          return next;
        }
      }
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    lastPick.current = id;
  };
  const onPickAll = (on: boolean) =>
    setPicked(on ? new Set(conversations.map((x) => x.id)) : new Set());
  const pickedConvs = conversations.filter((x) => picked.has(x.id));
  const bulkUpdate = async (patch: Parameters<typeof updateConversation>[1], label: string) => {
    const list = [...picked];
    setBulkBusy(true);
    const r = await runPool(list, 6, (id) => updateConversation(id, patch));
    setBulkBusy(false);
    setPicked(new Set());
    qc.invalidateQueries({ queryKey: ["inbox"] });
    if (r.failed) toast.warning(`${r.done - r.failed}ta ${label}, ${r.failed}ta hoy nai`);
    else toast.success(`${r.done}ta chat ${label}`);
  };

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
        else setPicked(new Set());
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

  // ── alert prefs ─────────────────────────────────────────────────────
  const readPref = (k: string, d: boolean) => {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : v === "1";
    } catch {
      return d;
    }
  };
  const [soundOn, setSoundOn] = useState(() => readPref("inbox.sound", true));
  const [desktopOn, setDesktopOn] = useState(
    () =>
      readPref("inbox.desktop", false) &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted",
  );
  const savePref = (k: string, v: boolean) => {
    try {
      localStorage.setItem(k, v ? "1" : "0");
    } catch {
      /* storage blocked */
    }
  };
  const toggleDesktop = async () => {
    if (typeof Notification === "undefined") return;
    if (desktopOn) {
      setDesktopOn(false);
      savePref("inbox.desktop", false);
      return;
    }
    const perm =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    const ok = perm === "granted";
    setDesktopOn(ok);
    savePref("inbox.desktop", ok);
  };
  const alertRef = useRef({ soundOn, desktopOn, conversations });
  alertRef.current = { soundOn, desktopOn, conversations };

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
          qc.invalidateQueries({ queryKey: ["inbox", "unread-badge"] });
          if (
            m.direction === "in" &&
            (document.hidden || selectedRef.current !== m.conversation_id)
          ) {
            const prefs = alertRef.current;
            if (prefs.soundOn) {
              try {
                beepSuccess();
              } catch {
                /* audio blocked */
              }
            }
            if (prefs.desktopOn && document.hidden && typeof Notification !== "undefined") {
              const conv = prefs.conversations.find((x) => x.id === m.conversation_id);
              const title = conv ? displayName(conv) : "Notun message";
              const body =
                m.body?.slice(0, 120) || (m.attachments?.length ? "📷 Chobi pathiyeche" : "");
              try {
                const n = new Notification(title, {
                  body,
                  tag: m.conversation_id,
                  icon: conv?.contact_avatar ?? undefined,
                });
                n.onclick = () => {
                  window.focus();
                  navigate({ search: { c: m.conversation_id } });
                  n.close();
                };
              } catch {
                /* notifications blocked */
              }
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
          if (
            alertRef.current.soundOn &&
            payload.eventType === "INSERT" &&
            payload.new &&
            !payload.new.is_from_page
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
        { event: "*", schema: "public", table: "inbox_conversations" },
        () => {
          qc.invalidateQueries({ queryKey: ["inbox", "conversations"] });
          qc.invalidateQueries({ queryKey: ["inbox", "counts"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  // Unread count in the browser tab title
  const awaitingTotal = conversations.filter(
    (c) => c.status === "open" && c.last_message_direction === "in",
  ).length;
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
    { key: "ads", label: "Ad report", icon: Megaphone, show: true },
    { key: "replies", label: "Quick replies", icon: Zap, show: true },
    { key: "channels", label: "Channels", icon: Plug, show: isAdmin },
  ];

  return (
    <div className="inbox-studio flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 px-3 pb-2 pt-3 md:px-4">
        <div className="ib-seg flex items-center gap-0.5">
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
                data-on={tab === t.key}
                className="ib-ink-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors hover:text-[var(--ib-ink)]"
              >
                <t.icon className="h-3.5 w-3.5" /> {t.label}
                {t.key === "comments" && (openComments ?? 0) > 0 && (
                  <span className="tabular ml-0.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground">
                    {openComments! > 99 ? "99+" : openComments}
                  </span>
                )}
                {t.key === "inbox" && unreadTotal > 0 && (
                  <span className="tabular ml-0.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground">
                    {unreadTotal > 99 ? "99+" : unreadTotal}
                  </span>
                )}
              </button>
            ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Notification settings"
              className="ib-ink-2 order-last ml-auto flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[var(--ib-panel)] hover:text-[var(--ib-ink)] hover:shadow-sm"
            >
              {soundOn || desktopOn ? (
                <Bell className="h-4 w-4" />
              ) : (
                <BellOff className="h-4 w-4" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs">Notun message ashle</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={soundOn}
              onCheckedChange={(v) => {
                setSoundOn(!!v);
                savePref("inbox.sound", !!v);
              }}
            >
              Sound
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={desktopOn}
              onCheckedChange={() => void toggleDesktop()}
              disabled={typeof Notification === "undefined"}
            >
              Desktop notification (onno tab e thakleo)
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {(tab === "inbox" || tab === "comments" || tab === "ads") && (
          <>
            <div className="mx-1 hidden h-5 w-px bg-[var(--ib-line)] md:block" />
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
                  <BrandTag brandId={b.id} size="xs" />
                </FilterChip>
              ))}
            </div>
            {tab !== "ads" && (
              <>
                <div className="mx-1 hidden h-5 w-px bg-[var(--ib-line)] md:block" />
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
          </>
        )}
      </div>

      {tab === "ads" ? (
        <AdsView
          brandIds={brandIds}
          showBrand={brandFilter === "all" && brands.length > 1}
          onOpenAdQueue={() => {
            setView("ads");
            navigate({ search: {} });
          }}
        />
      ) : tab === "comments" ? (
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
        <div className="ib-panel ib-scroll mx-2 mb-2 min-h-0 flex-1 overflow-y-auto md:mx-3 md:mb-3">
          <QuickRepliesManager replies={repliesQ.data ?? []} />
        </div>
      ) : tab === "channels" && isAdmin ? (
        <div className="ib-panel ib-scroll mx-2 mb-2 min-h-0 flex-1 overflow-y-auto md:mx-3 md:mb-3">
          <ChannelsSettings channels={channels} metaParam={search.meta} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-2 px-2 pb-2 md:px-3 md:pb-3">
          {/* List */}
          <aside
            className={cn(
              "ib-panel w-full shrink-0 overflow-hidden md:w-[330px] lg:w-[350px]",
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
              counts={countsQ.data ?? {}}
              picked={picked}
              onPick={onPick}
              onPickAll={onPickAll}
              onBulkReply={() => setBulkOpen(true)}
              onBulkDone={() => void bulkUpdate({ status: "done" }, "Done")}
              onBulkAssign={(uid) =>
                void bulkUpdate({ assigned_to: uid }, uid ? "assign holo" : "unassign holo")
              }
              bulkBusy={bulkBusy}
              staff={staff}
              searchRef={searchRef}
              showBrand={brandFilter === "all" && brands.length > 1}
              canLoadMore={conversations.length >= limit}
              onLoadMore={() => setLimit((l) => l + CONV_PAGE)}
              isFetchingMore={convQ.isFetching}
            />
          </aside>

          {/* Thread */}
          <section
            className={cn(
              "ib-panel min-w-0 flex-1 overflow-hidden",
              selected ? "block" : "hidden md:block",
            )}
          >
            {selected ? (
              <Thread
                conversation={selected}
                channel={channelFor(selected.channel_id)}
                quickReplies={repliesQ.data ?? []}
                staff={staff}
                currentUserId={userId}
                onBack={() => select(null)}
                onNext={() => {
                  const idx = conversations.findIndex((x) => x.id === selected.id);
                  const waiting = (x: InboxConversation) =>
                    x.id !== selected.id &&
                    x.status === "open" &&
                    x.last_message_direction === "in";
                  const next =
                    conversations.slice(idx + 1).find(waiting) ??
                    conversations.find(waiting) ??
                    null;
                  if (next) {
                    select(next.id);
                    document
                      .querySelector(`[data-conv-id="${next.id}"]`)
                      ?.scrollIntoView({ block: "nearest" });
                  } else toast.success("Shob reply deya shesh 🎉");
                }}
                onTogglePanel={() => {
                  if (typeof window !== "undefined" && window.innerWidth < 1280) setSheetOpen(true);
                  else setPanelOpen((v) => !v);
                }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ib-accent-soft)] text-primary">
                  <MessagesSquare className="h-6 w-6" />
                </div>
                <div>
                  <div className="font-display text-base font-semibold">
                    {awaitingTotal > 0
                      ? `${awaitingTotal}ta chat e reply baki`
                      : unreadTotal > 0
                        ? `${unreadTotal}ta chat e notun message`
                        : "Kono chat kholo"}
                  </div>
                  <div className="ib-ink-2 mt-1 text-sm">
                    Bam pash theke ekta conversation kholo. Messenger, Instagram ar WhatsApp
                    ekhanei.
                  </div>
                </div>
                <div className="ib-ink-3 mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs">
                  {[
                    ["J / K", "next / prev"],
                    ["/", "search"],
                    ["R", "reply"],
                    ["E", "done"],
                  ].map(([k, l]) => (
                    <span key={k}>
                      <kbd className="rounded-md border border-[var(--ib-line)] bg-[var(--ib-panel)] px-1.5 py-0.5 text-[10px] font-semibold shadow-sm">
                        {k}
                      </kbd>{" "}
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

          <BulkReplyDialog
            open={bulkOpen}
            onOpenChange={setBulkOpen}
            conversations={pickedConvs}
            quickReplies={repliesQ.data ?? []}
            onFinished={() => setPicked(new Set())}
          />

          {/* Customer panel */}
          {selected && panelOpen && (
            <aside className="ib-panel hidden w-[310px] shrink-0 overflow-hidden xl:block">
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
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-all",
        active
          ? "bg-[var(--ib-panel)] text-[var(--ib-ink)] shadow-[var(--ib-shadow)] ring-1 ring-[var(--ib-line)]"
          : "ib-ink-2 hover:bg-[var(--ib-panel)]/60 hover:text-[var(--ib-ink)]",
      )}
    >
      {children}
    </button>
  );
}
