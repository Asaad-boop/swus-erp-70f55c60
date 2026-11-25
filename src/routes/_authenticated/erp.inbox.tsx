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
import { displayName, labelInfo } from "@/lib/erp/inbox/inbox";
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
  type InboxMessage,
  type InboxPlatform,
} from "@/lib/erp/inbox/inbox";
import { ConversationList, type OwnerFilter } from "@/components/erp/inbox/conversation-list";
import { Thread } from "@/components/erp/inbox/thread";
import { ContactPanel } from "@/components/erp/inbox/contact-panel";
import { QuickRepliesManager } from "@/components/erp/inbox/quick-replies-manager";
import { ChannelsSettings } from "@/components/erp/inbox/channels-settings";
import { BrandTag, PlatformIcon } from "@/components/erp/inbox/shared";
import { BulkReplyDialog } from "@/components/erp/inbox/bulk-reply-dialog";
import { toast } from "sonner";
import { CommentsView } from "@/components/erp/inbox/comments-view";
import { AdsView } from "@/components/erp/inbox/ads-view";
type InboxTab = "inbox" | "comments" | "ads" | "report" | "replies" | "channels";
const VIEWS: InboxView[] = [
  "awaiting",
  "mine",
  "ads",
  "complaint",
  "followup",
  "unassigned",
  "open",
  "unread",
  "ordered",
  "done",
  "all",
];
import { TeamReport } from "@/components/erp/inbox/team-report";
import { db } from "@/lib/erp/inbox/inbox";
import { Sheet, SheetContent } from "@/components/ui/sheet";

type Tab = InboxTab;
type InboxSearch = { tab?: Tab; c?: string; meta?: string; view?: InboxView };

export const Route = createFileRoute("/_authenticated/erp/inbox")({
  head: () => ({ meta: [{ title: "Inbox — ERP" }] }),
  validateSearch: (s: Record<string, unknown>): InboxSearch => ({
    tab:
      s.tab === "replies" ||
      s.tab === "channels" ||
      s.tab === "comments" ||
      s.tab === "ads" ||
      s.tab === "report"
        ? s.tab
        : undefined,
    c: typeof s.c === "string" ? s.c : undefined,
    meta: typeof s.meta === "string" ? s.meta : undefined,
    view: VIEWS.includes(s.view as InboxView) ? (s.view as InboxView) : undefined,
  }),
  component: InboxPage,
});

function InboxPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/erp/inbox" });
  const qc = useQueryClient();
  const { brands, brandIds: ctxBrandIds, isAllBrands } = useBrand();
  const { isAdmin, userId } = useCurrentRole();
  const tab: Tab = search.tab ?? "inbox";

  // ── filters ─────────────────────────────────────────────────────────
  const [platform, setPlatform] = useState<InboxPlatform | "all">("all");
  const [label, setLabel] = useState<string | null>(null);
  const [owner, setOwner] = useState<OwnerFilter>("all");
  // The queue lives in the URL so the main sidebar can link straight to it.
  const view: InboxView = search.view ?? "awaiting";
  const setView = (v: InboxView) => {
    setLimit(CONV_PAGE);
    setPicked(new Set());
    setLabel(null);
    navigate({ search: (s: InboxSearch) => ({ ...s, view: v, tab: undefined }) });
  };
  useEffect(() => {
    setLimit(CONV_PAGE);
    setPicked(new Set());
  }, [view]);
  // Plain /erp/inbox → open the default queue so the sidebar can highlight it.
  useEffect(() => {
    if (!search.view && !search.tab)
      navigate({ search: (s: InboxSearch) => ({ ...s, view: "awaiting" }), replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.view, search.tab]);
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

  const brandIds = ctxBrandIds;
  const showBrand = isAllBrands && brands.length > 1;

  const filters = { brandIds, platform, view, label, userId, search: debounced, owner };
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
  useEffect(() => setPicked(new Set()), [brandIds.join(","), platform]);
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

  const markAllRead = async () => {
    const ids = conversations.filter((x) => x.unread_count > 0).map((x) => x.id);
    if (!ids.length) return;
    qc.setQueriesData({ queryKey: ["inbox", "conversations"] }, (old: any) =>
      Array.isArray(old)
        ? old.map((x) => (ids.includes(x?.id) ? { ...x, unread_count: 0 } : x))
        : old,
    );
    const { error } = await db
      .from("inbox_conversations")
      .update({ unread_count: 0 })
      .in("id", ids);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["inbox", "counts"] });
    qc.invalidateQueries({ queryKey: ["inbox", "conversations"] });
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
    // Write realtime rows straight into the cache (no refetch round trip), so a
    // customer's message shows the instant it lands. Lists are re-pulled at
    // most once a second to keep order and counts right.
    let listTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshLists = () => {
      if (listTimer) return;
      listTimer = setTimeout(() => {
        listTimer = null;
        qc.invalidateQueries({ queryKey: ["inbox", "conversations"] });
        qc.invalidateQueries({ queryKey: ["inbox", "counts"] });
        qc.invalidateQueries({ queryKey: ["inbox", "unread-badge"] });
      }, 900);
    };
    const upsertMsg = (m: InboxMessage) =>
      qc.setQueryData<InboxMessage[]>(["inbox", "messages", m.conversation_id], (old) => {
        if (!old) return old;
        const i = old.findIndex((x) => x.id === m.id);
        if (i >= 0) {
          const next = old.slice();
          next[i] = { ...old[i]!, ...m };
          return next;
        }
        if (m.direction === "out") {
          // Our own send coming back: swap out its placeholder bubble.
          const j = old.findIndex(
            (x) =>
              x.id.startsWith("temp-") &&
              x.msg_type === m.msg_type &&
              (x.body ?? null) === (m.body ?? null),
          );
          if (j >= 0) {
            const next = old.slice();
            next.splice(j, 1, m);
            return next;
          }
        }
        return [...old, m];
      });
    const patchConv = (row: any) =>
      qc.setQueriesData({ queryKey: ["inbox", "conversations"] }, (old: any) => {
        if (Array.isArray(old))
          return old.some((x) => x?.id === row.id)
            ? old.map((x) => (x?.id === row.id ? { ...x, ...row } : x))
            : old;
        if (old && typeof old === "object" && old.id === row.id) return { ...old, ...row };
        return old;
      });
    const ch = supabase
      .channel("inbox-live")
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "inbox_messages" },
        (payload: any) => {
          const m = payload.new;
          upsertMsg(m);
          refreshLists();
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
        (payload: any) => upsertMsg(payload.new),
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
        (payload: any) => {
          if (payload.new?.id) patchConv(payload.new);
          refreshLists();
        },
      )
      .subscribe();
    return () => {
      if (listTimer) clearTimeout(listTimer);
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

  const VIEW_TITLE: Record<InboxView, string> = {
    awaiting: "Reply baki",
    mine: "Amar chat",
    ads: "Ad theke",
    complaint: "Complaint",
    followup: "Follow-up",
    unassigned: "Karo na",
    open: "Open",
    unread: "Unread",
    ordered: "Order hoyeche",
    done: "Done",
    all: "Shob chat",
  };
  const listTitle = label ? labelInfo(label).label : VIEW_TITLE[view];
  const listCount = label ? countsQ.data?.labels?.[label] : (countsQ.data as any)?.[view];
  const goTab = (t: Tab) =>
    navigate({
      search: (s: InboxSearch) => ({ ...s, tab: t === "inbox" ? undefined : t, meta: undefined }),
    });

  return (
    <div className="inbox-studio flex h-[calc(100dvh-3.5rem)] min-h-0">
      <main className="flex min-w-0 flex-1 flex-col p-2 md:p-3">
        {tab === "ads" ? (
          <AdsView
            brandIds={brandIds}
            showBrand={showBrand}
            onOpenAdQueue={() => {
              setView("ads");
              goTab("inbox");
            }}
          />
        ) : tab === "report" ? (
          <TeamReport brandIds={brandIds} showBrand={showBrand} />
        ) : tab === "comments" ? (
          <CommentsView
            brandIds={brandIds}
            platform={
              platform === "messenger" ? "facebook" : platform === "instagram" ? "instagram" : "all"
            }
            showBrand={showBrand}
            quickReplies={repliesQ.data ?? []}
            onOpenConversation={(id) => navigate({ search: { c: id } })}
          />
        ) : tab === "replies" ? (
          <div className="ib-panel ib-scroll min-h-0 flex-1 overflow-y-auto">
            <QuickRepliesManager replies={repliesQ.data ?? []} />
          </div>
        ) : tab === "channels" && isAdmin ? (
          <div className="ib-panel ib-scroll min-h-0 flex-1 overflow-y-auto">
            <ChannelsSettings channels={channels} metaParam={search.meta} />
          </div>
        ) : (
          <div className="ib-panel ib-shell flex min-h-0 flex-1 overflow-hidden">
            {/* List */}
            <aside
              className={cn(
                "w-full shrink-0 overflow-hidden border-[var(--ib-line)] md:w-[360px] md:border-r 2xl:w-[390px]",
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
                title={listTitle}
                platform={platform}
                onPlatform={(pl) => {
                  setPlatform(pl);
                  setLimit(CONV_PAGE);
                }}
                label={label}
                onLabel={(l) => {
                  setLabel(l);
                  setLimit(CONV_PAGE);
                  setPicked(new Set());
                }}
                subtitle={listCount ? String(listCount) : undefined}
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
                showBrand={showBrand}
                canLoadMore={conversations.length >= limit}
                onLoadMore={() => setLimit((l) => l + CONV_PAGE)}
                isFetchingMore={convQ.isFetching}
                owner={owner}
                onOwner={(o) => {
                  setOwner(o);
                  setLimit(CONV_PAGE);
                  setPicked(new Set());
                }}
                currentUserId={userId ?? null}
                onMarkAllRead={() => void markAllRead()}
              />
            </aside>

            {/* Thread */}
            <section
              className={cn(
                "min-w-0 flex-1 overflow-hidden",
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
                    if (typeof window !== "undefined" && window.innerWidth < 1536)
                      setSheetOpen(true);
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
                      {(countsQ.data?.awaiting ?? awaitingTotal) > 0
                        ? `${countsQ.data?.awaiting ?? awaitingTotal}ta chat e reply baki`
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
                <SheetContent side="right" className="w-[320px] p-0 2xl:hidden [&>button]:hidden">
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
              <aside className="hidden w-[300px] shrink-0 overflow-hidden border-l border-[var(--ib-line)] 2xl:block">
                <ContactPanel
                  conversation={selected}
                  channel={channelFor(selected.channel_id)}
                  onClose={() => setPanelOpen(false)}
                />
              </aside>
            )}
          </div>
        )}
      </main>
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
