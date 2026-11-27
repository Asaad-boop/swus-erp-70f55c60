import {
  AlarmClock,
  AlertTriangle,
  CheckCheck,
  CircleDot,
  CornerUpLeft,
  List,
  Megaphone,
  MoreHorizontal,
  User,
  Users,
  ShoppingBag,
  SlidersHorizontal,
  Check,
  CheckCircle2,
  ChevronDown,
  Inbox as InboxIcon,
  Loader2,
  Search,
  Send,
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
import { cn } from "@/lib/utils";
import {
  displayName,
  fetchMessages,
  initials,
  INBOX_LABELS,
  labelInfo,
  PLATFORM_LABEL,
  type InboxPlatform,
  type InboxConversation,
  type InboxStaff,
  type InboxView,
  type ViewCounts,
} from "@/lib/erp/inbox/inbox";
import { BrandTag, ContactAvatar, PlatformIcon, relTime } from "./shared";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

/** Start loading a chat when the pointer reaches it, so it opens instantly. */
export function prefetchThread(qc: QueryClient, id: string) {
  void qc.prefetchQuery({
    queryKey: ["inbox", "messages", id],
    queryFn: () => fetchMessages(id),
    staleTime: 60_000,
  });
}
import { LANG_OPTIONS, useInboxT, type InboxStrKey } from "@/lib/erp/inbox/i18n";

type ViewDef = {
  key: InboxView;
  label: InboxStrKey;
  hint: InboxStrKey;
  icon: typeof AlarmClock;
  /** colour carries the meaning: staff learn queues by colour + icon + word */
  tone: string;
  count?: Exclude<keyof ViewCounts, "labels">;
};

/** Always visible — the queues people actually work from. */
const PRIMARY: ViewDef[] = [
  {
    key: "awaiting",
    label: "q_awaiting",
    hint: "h_awaiting",
    icon: CornerUpLeft,
    tone: "#E11D48",
    count: "awaiting",
  },
  {
    key: "unread",
    label: "q_unread",
    hint: "h_unread",
    icon: CircleDot,
    tone: "#2563EB",
    count: "unread",
  },
  { key: "mine", label: "q_mine", hint: "h_mine", icon: User, tone: "#4F46E5", count: "mine" },
  {
    key: "complaint",
    label: "q_complaint",
    hint: "h_complaint",
    icon: AlertTriangle,
    tone: "#EA580C",
    count: "complaint",
  },
  {
    key: "followup",
    label: "q_followup",
    hint: "h_followup",
    icon: AlarmClock,
    tone: "#CA8A04",
    count: "followup_due",
  },
  { key: "all", label: "q_all", hint: "h_all", icon: List, tone: "#64748B" },
];
const MORE: ViewDef[] = [
  { key: "ads", label: "q_ads", hint: "h_ads", icon: Megaphone, tone: "#9333EA", count: "ads" },
  {
    key: "unassigned",
    label: "q_unassigned",
    hint: "h_unassigned",
    icon: Users,
    tone: "#64748B",
    count: "unassigned",
  },
  { key: "ordered", label: "q_ordered", hint: "h_ordered", icon: ShoppingBag, tone: "#059669" },
  { key: "open", label: "q_open", hint: "h_open", icon: InboxIcon, tone: "#64748B" },
  { key: "done", label: "q_done", hint: "h_done", icon: CheckCircle2, tone: "#64748B" },
];
const ALL_VIEWS = [...PRIMARY, ...MORE];

export type OwnerFilter = "all" | "me" | "none" | string;

function waitLabel(iso: string | null) {
  if (!iso) return null;
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "ekhon";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Waiting longer than this turns the "reply baki" marker from calm to urgent. */
const URGENT_MIN = 30;

const fmtCount = (n?: number) =>
  n == null ? "" : n > 999 ? `${Math.floor(n / 1000)}k` : String(n);

type Props = {
  conversations: InboxConversation[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (v: string) => void;
  view: InboxView;
  onView: (v: InboxView) => void;
  counts: ViewCounts;
  title: string;
  subtitle?: string;
  platform: InboxPlatform | "all";
  onPlatform: (p: InboxPlatform | "all") => void;
  label: string | null;
  onLabel: (l: string | null) => void;
  staff: InboxStaff[];
  searchRef?: React.Ref<HTMLInputElement>;
  showBrand: boolean;
  canLoadMore: boolean;
  onLoadMore: () => void;
  isFetchingMore: boolean;
  /** bulk selection */
  picked: Set<string>;
  onPick: (id: string, on: boolean, range?: boolean) => void;
  onPickAll: (on: boolean) => void;
  onBulkReply: () => void;
  onBulkDone: () => void;
  onBulkAssign: (userId: string | null) => void;
  bulkBusy: boolean;
  owner: OwnerFilter;
  onOwner: (o: OwnerFilter) => void;
  currentUserId: string | null;
  onMarkAllRead?: () => void;
};

export function ConversationList(p: Props) {
  const { t, num } = useInboxT();
  const picking = p.picked.size > 0;
  const allPicked = p.conversations.length > 0 && p.conversations.every((c) => p.picked.has(c.id));
  const activeView = ALL_VIEWS.find((v) => v.key === p.view) ?? PRIMARY[0]!;
  const moreActive = MORE.some((v) => v.key === p.view);
  const ownerStaff =
    p.owner !== "all" && p.owner !== "me" && p.owner !== "none"
      ? p.staff.find((s) => s.id === p.owner)
      : undefined;
  const ownerLabel =
    p.owner === "all"
      ? t("everyone")
      : p.owner === "me"
        ? t("me")
        : p.owner === "none"
          ? t("nobody")
          : (ownerStaff?.display_name.split(" ")[0] ?? t("everyone"));
  const hasUnread = p.conversations.some((c) => c.unread_count > 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 px-2.5 pb-2 pt-2.5">
        <div className="flex items-center gap-1.5">
          <label className="group relative block min-w-0 flex-1">
            <Search className="ib-ink-3 pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
            <input
              ref={p.searchRef}
              value={p.search}
              onChange={(e) => p.onSearch(e.target.value)}
              placeholder={t("search")}
              className="h-8 w-full rounded-lg border border-transparent bg-[var(--ib-canvas)] pl-8 pr-8 text-[13px] outline-none transition-colors placeholder:text-[var(--ib-ink-3)] focus:border-[var(--ib-line)] focus:bg-[var(--ib-panel)]"
            />
            {p.search ? (
              <button
                type="button"
                onClick={() => p.onSearch("")}
                className="ib-ink-3 absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 hover:text-[var(--ib-ink)]"
              >
                <X className="h-3 w-3" />
              </button>
            ) : (
              <kbd className="ib-ink-3 pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-[var(--ib-line)] bg-[var(--ib-panel)] px-1 text-[10px] group-focus-within:hidden">
                /
              </kbd>
            )}
          </label>
          <LangSwitch />
        </div>

        {picking ? (
          <BulkBar {...p} allPicked={allPicked} />
        ) : (
          <div className="flex h-7 items-center gap-1">
            {(["all", "messenger", "instagram", "whatsapp"] as const).map((pl) => {
              const on = p.platform === pl;
              return (
                <button
                  key={pl}
                  type="button"
                  onClick={() => p.onPlatform(pl)}
                  title={pl === "all" ? t("allChannels") : PLATFORM_LABEL[pl]}
                  aria-pressed={on}
                  className={cn(
                    "flex h-7 shrink-0 items-center justify-center rounded-full border text-[11.5px] font-medium transition-colors",
                    pl === "all" ? "px-2.5" : "w-7",
                    on
                      ? pl === "all"
                        ? "border-[var(--ib-ink)] bg-[var(--ib-ink)] text-[var(--ib-panel)]"
                        : "border-[var(--ib-ink)] bg-[var(--ib-panel)] ring-1 ring-[var(--ib-ink)]"
                      : "border-[var(--ib-line)] bg-[var(--ib-panel)] hover:bg-[var(--ib-hover)]",
                  )}
                >
                  {pl === "all" ? (
                    t("allChannels")
                  ) : (
                    <PlatformIcon platform={pl} className="h-4 w-4" />
                  )}
                </button>
              );
            })}
            <div className="ml-auto" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title={t("showChatsOf")}
                  className={cn(
                    "flex h-7 max-w-[110px] items-center gap-1 rounded-full border px-2 text-[11.5px] font-medium transition-colors",
                    p.owner !== "all"
                      ? "border-primary/40 bg-[var(--ib-accent-soft)] text-primary"
                      : "border-[var(--ib-line)] bg-[var(--ib-panel)] hover:bg-[var(--ib-hover)]",
                  )}
                >
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{ownerLabel}</span>
                  <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 w-52 overflow-y-auto">
                <DropdownMenuLabel className="text-xs">{t("showChatsOf")}</DropdownMenuLabel>
                {(
                  [
                    ["all", t("everyone")],
                    ["me", t("me")],
                    ["none", t("nobody")],
                  ] as const
                ).map(([k, l]) => (
                  <DropdownMenuItem key={k} onClick={() => p.onOwner(k)} className="text-[13px]">
                    <span className="flex-1">{l}</span>
                    {p.owner === k && <Check className="h-3.5 w-3.5" />}
                  </DropdownMenuItem>
                ))}
                {p.staff.filter((s) => s.id !== p.currentUserId).length > 0 && (
                  <DropdownMenuSeparator />
                )}
                {p.staff
                  .filter((s) => s.id !== p.currentUserId)
                  .map((s) => (
                    <DropdownMenuItem
                      key={s.id}
                      onClick={() => p.onOwner(s.id)}
                      className="text-[13px]"
                    >
                      <span
                        className="mr-2 flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white"
                        style={{ background: staffColor(s.id) }}
                      >
                        {initials(s.display_name)}
                      </span>
                      <span className="flex-1 truncate">{s.display_name}</span>
                      {p.owner === s.id && <Check className="h-3.5 w-3.5" />}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border transition-colors",
                    p.label
                      ? "border-primary/40 bg-[var(--ib-accent-soft)] text-primary"
                      : "border-[var(--ib-line)] bg-[var(--ib-panel)] hover:bg-[var(--ib-hover)]",
                  )}
                  title={p.label ? `${t("label")}: ${labelInfo(p.label).label}` : t("label")}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs">{t("label")}</DropdownMenuLabel>
                {INBOX_LABELS.map((l) => (
                  <DropdownMenuItem
                    key={l.key}
                    onClick={() => p.onLabel(p.label === l.key ? null : l.key)}
                    className="text-[13px]"
                  >
                    <span className={cn("mr-2.5 ml-1 h-2 w-2 rounded-full", l.dot)} />
                    <span className="flex-1">{l.label}</span>
                    {!!p.counts.labels?.[l.key] && (
                      <span className="ib-ink-3 tabular mr-1 text-[11px]">
                        {num(p.counts.labels[l.key]!)}
                      </span>
                    )}
                    {p.label === l.key && <Check className="h-3.5 w-3.5" />}
                  </DropdownMenuItem>
                ))}
                {(p.platform !== "all" || p.label || p.owner !== "all") && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        p.onPlatform("all");
                        p.onLabel(null);
                        p.onOwner("all");
                      }}
                      className="text-[13px]"
                    >
                      {t("clearFilter")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {p.conversations.length > 0 && (
              <button
                type="button"
                onClick={() => p.onPickAll(true)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--ib-line)] bg-[var(--ib-panel)] hover:bg-[var(--ib-hover)]"
                title={t("selectHint")}
              >
                <CheckCheck className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* queue tabs */}
      <div
        role="tablist"
        className="ib-scroll flex shrink-0 items-stretch overflow-x-auto border-b border-[var(--ib-line)] px-1"
      >
        {PRIMARY.map((v) => (
          <QueueTab
            key={v.key}
            v={v}
            on={p.view === v.key}
            count={v.count ? p.counts[v.count] : undefined}
            onClick={() => p.onView(v.key)}
          />
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex min-w-[46px] shrink-0 flex-col items-center justify-center gap-[3px] px-1.5 py-1.5 text-[10.5px] transition-colors",
                moreActive
                  ? "font-semibold text-[var(--ib-ink)] shadow-[inset_0_-2px_0_var(--ib-ink)]"
                  : "ib-ink-3 hover:text-[var(--ib-ink)]",
              )}
            >
              {moreActive ? (
                <activeView.icon className="h-[15px] w-[15px]" style={{ color: activeView.tone }} />
              ) : (
                <MoreHorizontal className="h-[15px] w-[15px]" />
              )}
              <span className="whitespace-nowrap">
                {moreActive ? t(activeView.label) : t("more")}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {MORE.map((v) => (
              <DropdownMenuItem key={v.key} onClick={() => p.onView(v.key)} className="text-[13px]">
                <v.icon className="mr-2 h-3.5 w-3.5" style={{ color: v.tone }} />
                <span className="flex-1">{t(v.label)}</span>
                {v.count && !!p.counts[v.count] && (
                  <span className="ib-ink-3 tabular text-[11px]">
                    {num(fmtCount(p.counts[v.count]))}
                  </span>
                )}
                {p.view === v.key && <Check className="ml-2 h-3.5 w-3.5" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div
        className="flex shrink-0 items-center gap-2 border-b border-[var(--ib-line)] px-3 py-1.5 text-[11.5px] leading-snug"
        style={{ background: `${activeView.tone}0D`, color: "var(--ib-ink-2)" }}
      >
        <activeView.icon className="h-3 w-3 shrink-0" style={{ color: activeView.tone }} />
        <span className="min-w-0 flex-1">
          <span className="font-semibold" style={{ color: activeView.tone }}>
            {t(activeView.label)}
          </span>
          {" — "}
          {t(activeView.hint)}
        </span>
        {p.onMarkAllRead && hasUnread && (
          <button
            type="button"
            onClick={p.onMarkAllRead}
            className="shrink-0 whitespace-nowrap font-semibold text-primary hover:underline"
          >
            {t("markAllRead")}
          </button>
        )}
      </div>

      <div className="ib-scroll min-h-0 flex-1 overflow-y-auto px-1.5 py-1">
        {p.isLoading ? (
          <ListSkeleton />
        ) : p.conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ib-canvas)]">
              <InboxIcon className="ib-ink-3 h-4 w-4" />
            </div>
            <div className="text-[13px] font-medium">
              {p.view === "awaiting" && !p.search
                ? t("emptyAwaiting")
                : p.search
                  ? `${t("noMatch")}: "${p.search}"`
                  : t("emptyList")}
            </div>
            <div className="ib-ink-2 text-[12px]">
              {p.view === "awaiting" && !p.search ? t("emptyAwaitingSub") : t("emptyListSub")}
            </div>
          </div>
        ) : (
          <ul>
            {p.conversations.map((c) => (
              <Row
                key={c.id}
                c={c}
                active={c.id === p.selectedId}
                picked={p.picked.has(c.id)}
                picking={picking}
                onSelect={p.onSelect}
                onPick={p.onPick}
                showBrand={p.showBrand}
                assignee={c.assigned_to ? p.staff.find((s) => s.id === c.assigned_to) : undefined}
                isMine={!!p.currentUserId && c.assigned_to === p.currentUserId}
              />
            ))}
          </ul>
        )}
        {p.canLoadMore && !p.isLoading && (
          <button
            type="button"
            onClick={p.onLoadMore}
            disabled={p.isFetchingMore}
            className="ib-ink-2 mx-auto my-2 flex h-7 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium hover:bg-[var(--ib-hover)]"
          >
            {p.isFetchingMore && <Loader2 className="h-3 w-3 animate-spin" />}
            {t("loadMore")}
          </button>
        )}
      </div>
    </div>
  );
}

function LangSwitch() {
  const { lang, setLang, t } = useInboxT();
  return (
    <div
      role="group"
      aria-label={t("language")}
      title={t("language")}
      className="flex h-8 shrink-0 items-center rounded-lg bg-[var(--ib-canvas)] p-0.5"
    >
      {LANG_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={lang === o.value}
          onClick={() => setLang(o.value)}
          className={cn(
            "h-7 rounded-md px-1.5 text-[11px] font-semibold transition-colors",
            lang === o.value
              ? "bg-[var(--ib-panel)] text-[var(--ib-ink)] shadow-sm"
              : "text-[var(--ib-ink-3)] hover:text-[var(--ib-ink)]",
          )}
        >
          {o.value === "bn" ? "বাং" : o.label}
        </button>
      ))}
    </div>
  );
}

const STAFF_COLORS = [
  "#0D9488",
  "#D97706",
  "#DB2777",
  "#0891B2",
  "#7C3AED",
  "#65A30D",
  "#DC2626",
  "#2563EB",
];
/** Same colour for the same person everywhere in the inbox. */
export function staffColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return STAFF_COLORS[h % STAFF_COLORS.length]!;
}

function QueueTab({
  v,
  on,
  count,
  onClick,
}: {
  v: ViewDef;
  on: boolean;
  count?: number;
  onClick: () => void;
}) {
  const { t, num } = useInboxT();
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      title={t(v.hint)}
      className={cn(
        "flex min-w-0 flex-1 shrink-0 flex-col items-center justify-center gap-[3px] px-1 py-1.5 transition-colors",
        on ? "text-[var(--ib-ink)]" : "ib-ink-3 hover:text-[var(--ib-ink)]",
      )}
      style={on ? { boxShadow: `inset 0 -2px 0 ${v.tone}` } : undefined}
    >
      <span className="flex items-center gap-1">
        <span
          className="flex h-[17px] w-[17px] items-center justify-center rounded-[5px]"
          style={{ background: `${v.tone}1F`, color: v.tone }}
        >
          <v.icon className="h-[11px] w-[11px]" strokeWidth={2.4} />
        </span>
        {!!count && (
          <span
            className="tabular text-[12px] font-bold"
            style={{ color: on ? v.tone : "var(--ib-ink)" }}
          >
            {num(fmtCount(count))}
          </span>
        )}
      </span>
      <span className={cn("whitespace-nowrap text-[10.5px]", on ? "font-semibold" : "font-medium")}>
        {t(v.label)}
      </span>
    </button>
  );
}

function BulkBar(p: Props & { allPicked: boolean }) {
  return (
    <div className="flex h-7 items-center gap-1">
      <button
        type="button"
        onClick={() => p.onPickAll(!p.allPicked)}
        className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[12px] font-medium hover:bg-[var(--ib-hover)]"
        title={p.allPicked ? "Shob bad dao" : "List er shob select koro"}
      >
        <Box on={p.allPicked} partial={!p.allPicked} />
        <span className="tabular">{p.picked.size}</span>
      </button>
      <button
        type="button"
        disabled={p.bulkBusy}
        onClick={p.onBulkReply}
        className="flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {p.bulkBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
        Reply
      </button>
      <button
        type="button"
        disabled={p.bulkBusy}
        onClick={p.onBulkDone}
        className="ib-ink-2 flex h-7 items-center gap-1 rounded-md px-2 text-[12px] hover:bg-[var(--ib-hover)] hover:text-[var(--ib-ink)] disabled:opacity-50"
        title="Shob Done"
      >
        <CheckCircle2 className="h-3.5 w-3.5" /> Done
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={p.bulkBusy}
            className="ib-ink-2 flex h-7 items-center rounded-md px-1.5 hover:bg-[var(--ib-hover)] hover:text-[var(--ib-ink)] disabled:opacity-50"
            title="Assign"
          >
            <UserPlus className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-72 w-52 overflow-y-auto">
          <DropdownMenuLabel className="text-xs">
            {p.picked.size}ta chat kar kache?
          </DropdownMenuLabel>
          {p.staff.map((s) => (
            <DropdownMenuItem
              key={s.id}
              onClick={() => p.onBulkAssign(s.id)}
              className="text-[13px]"
            >
              {s.display_name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => p.onBulkAssign(null)} className="text-[13px]">
            Unassign
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        onClick={() => p.onPickAll(false)}
        className="ib-ink-3 ml-auto rounded-md p-1.5 hover:bg-[var(--ib-hover)] hover:text-[var(--ib-ink)]"
        title="Selection bondho (Esc)"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function Box({ on, partial }: { on: boolean; partial?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : partial
            ? "border-primary bg-primary/15 text-primary"
            : "border-[var(--ib-ink-3)] bg-[var(--ib-panel)]",
      )}
    >
      {on ? (
        <Check className="h-3 w-3" strokeWidth={3} />
      ) : partial ? (
        <span className="h-0.5 w-2 rounded bg-current" />
      ) : null}
    </span>
  );
}

function Row({
  c,
  active,
  picked,
  picking,
  onSelect,
  onPick,
  showBrand,
  assignee,
  isMine,
}: {
  c: InboxConversation;
  active: boolean;
  picked: boolean;
  picking: boolean;
  onSelect: (id: string) => void;
  onPick: (id: string, on: boolean, range?: boolean) => void;
  showBrand: boolean;
  assignee?: InboxStaff;
  isMine: boolean;
}) {
  const { t, num } = useInboxT();
  const qc = useQueryClient();
  const name = displayName(c);
  const unread = c.unread_count > 0;
  const awaiting = c.status === "open" && c.last_message_direction === "in";
  const waitedMin = c.last_message_at
    ? (Date.now() - new Date(c.last_message_at).getTime()) / 60000
    : 0;
  const urgent = awaiting && waitedMin >= URGENT_MIN;
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        data-conv-id={c.id}
        data-active={active}
        data-picked={picked}
        onMouseEnter={() => prefetchThread(qc, c.id)}
        onTouchStart={() => prefetchThread(qc, c.id)}
        onClick={(e) => {
          if (picking || e.metaKey || e.ctrlKey) onPick(c.id, !picked, e.shiftKey);
          else if (e.shiftKey) onPick(c.id, true, true);
          else onSelect(c.id);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSelect(c.id);
          if (e.key === " ") {
            e.preventDefault();
            onPick(c.id, !picked);
          }
        }}
        className="ib-row group/row relative flex w-full cursor-pointer items-center gap-2.5 py-[7px] pl-3 pr-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {unread && (
          <span
            className="absolute left-[3px] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-blue-600"
            aria-label={t("q_unread")}
          />
        )}
        <div className="relative">
          <div
            className={cn(
              "transition-opacity",
              (picking || picked) && "opacity-0",
              "group-hover/row:opacity-0",
            )}
          >
            <ContactAvatar name={name} src={c.contact_avatar} platform={c.platform} size={36} />
          </div>
          <button
            type="button"
            aria-label={picked ? "Bad dao" : "Select"}
            onClick={(e) => {
              e.stopPropagation();
              onPick(c.id, !picked, e.shiftKey);
            }}
            className={cn(
              "absolute inset-0 flex items-center justify-center rounded-full transition-opacity",
              picking || picked ? "opacity-100" : "opacity-0 group-hover/row:opacity-100",
            )}
          >
            <Box on={picked} />
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "truncate text-[13px] leading-[18px]",
                unread ? "font-semibold" : "font-medium text-[var(--ib-ink)]/90",
              )}
            >
              {name}
            </span>
            {c.complaint_at && !c.complaint_resolved_at && (
              <AlertTriangle className="h-3 w-3 shrink-0 text-rose-500" aria-label="Complaint" />
            )}
            {(c.order_count ?? 0) > 0 && (
              <ShoppingBag
                className="h-3 w-3 shrink-0 text-emerald-600"
                aria-label="Order hoyeche"
              />
            )}
            <span
              className={cn(
                "tabular ml-auto shrink-0 text-[10.5px]",
                urgent
                  ? "font-medium text-rose-600 dark:text-rose-400"
                  : unread
                    ? "font-medium text-blue-600 dark:text-blue-400"
                    : "ib-ink-3",
              )}
              title={awaiting ? `${waitLabel(c.last_message_at)} — ${t("waitingFor")}` : undefined}
            >
              {relTime(c.last_message_at)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {awaiting && (
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  urgent ? "bg-rose-500" : "bg-amber-500",
                )}
                title={t("q_awaiting")}
              />
            )}
            <span
              className={cn(
                "line-clamp-1 text-[12.5px] leading-[18px]",
                unread ? "text-[var(--ib-ink)]" : "ib-ink-2",
              )}
            >
              {c.last_message_direction === "out" && (
                <CornerUpLeft className="ib-ink-3 mr-0.5 inline h-3 w-3 align-[-2px]" />
              )}
              {c.last_message_preview ?? ""}
            </span>
            {unread && (
              <span className="tabular ml-auto flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-blue-600 px-1 text-[9.5px] font-semibold text-white">
                {c.unread_count > 99 ? "99+" : num(c.unread_count)}
              </span>
            )}
          </div>
          {
            <div className="mt-[3px] flex min-w-0 items-center gap-1.5">
              {showBrand && <BrandTag brandId={c.brand_id} size="xs" />}
              {c.snoozed_until && <SnoozeChip at={c.snoozed_until} />}
              {c.ad_id && <AdChip c={c} />}
              {(c.tags ?? []).slice(0, 2).map((t) => {
                const l = labelInfo(t);
                return (
                  <span
                    key={t}
                    className="ib-ink-2 inline-flex items-center gap-1 rounded bg-[var(--ib-canvas)] px-1 text-[10px] leading-4"
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", l.dot)} />
                    <span className="max-w-[80px] truncate">{l.label}</span>
                  </span>
                );
              })}
              <OwnerChip assignee={assignee} isMine={isMine} assigned={!!c.assigned_to} />
            </div>
          }
        </div>
      </div>
    </li>
  );
}

/** Who is handling the chat — always shown so nobody has to guess. */
function OwnerChip({
  assignee,
  isMine,
  assigned,
}: {
  assignee?: InboxStaff;
  isMine: boolean;
  assigned: boolean;
}) {
  const { t } = useInboxT();
  if (!assigned)
    return (
      <span
        title={t("nobody")}
        className="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-[var(--ib-ink-3)]"
      >
        <span className="h-3.5 w-3.5 rounded-full border border-dashed border-current" />
        {t("nobody")}
      </span>
    );
  const label = isMine ? t("you") : (assignee?.display_name.split(" ")[0] ?? "—");
  return (
    <span
      title={`${t("handledBy")}: ${isMine ? t("you") : (assignee?.display_name ?? "—")}`}
      className={cn(
        "ml-auto flex max-w-[90px] shrink-0 items-center gap-1 text-[10px] font-medium",
        isMine ? "text-primary" : "text-[var(--ib-ink-2)]",
      )}
    >
      <span
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[7px] font-bold text-white"
        style={{
          background: isMine ? "var(--primary)" : assignee ? staffColor(assignee.id) : "#94A3B8",
        }}
      >
        {assignee ? initials(assignee.display_name).slice(0, 1) : "?"}
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}

export function snoozeLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.getTime() <= now.getTime()) return "Ekhon dekho";
  const tmr = new Date(now);
  tmr.setDate(now.getDate() + 1);
  const t = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Aaj ${t}`;
  if (d.toDateString() === tmr.toDateString()) return `Kal ${t}`;
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${t}`;
}

function SnoozeChip({ at }: { at: string }) {
  const due = new Date(at).getTime() <= Date.now();
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded px-1 text-[10px] leading-4",
        due
          ? "bg-amber-500/15 font-medium text-amber-700 dark:text-amber-300"
          : "ib-ink-2 bg-[var(--ib-canvas)]",
      )}
    >
      <AlarmClock className="h-2.5 w-2.5" />
      {snoozeLabel(at)}
    </span>
  );
}

/** Small "Ad" marker: which ad started this chat (fresh clicks glow for 24h). */
export function AdChip({ c }: { c: InboxConversation }) {
  const fresh = c.ad_at ? Date.now() - new Date(c.ad_at).getTime() < 24 * 3_600_000 : false;
  return (
    <span
      title={`Ad: ${c.ad_title ?? c.ad_id}${c.ad_source === "backfill" ? " (ager chat, icebreaker theke dhora)" : ""}`}
      className={cn(
        "inline-flex max-w-[150px] items-center gap-1 rounded px-1 text-[10px] leading-4",
        fresh
          ? "bg-violet-500/10 text-violet-700 dark:text-violet-300"
          : "ib-ink-3 bg-[var(--ib-canvas)]",
      )}
    >
      <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 shrink-0" fill="currentColor" aria-hidden>
        <path d="M2 6.5v3a1 1 0 0 0 1 1h1.5l3.8 2.6a.5.5 0 0 0 .7-.4V3.3a.5.5 0 0 0-.7-.4L4.5 5.5H3a1 1 0 0 0-1 1Zm9.2-2.2a.6.6 0 0 1 .85.1 6 6 0 0 1 0 7.2.6.6 0 1 1-.95-.75 4.8 4.8 0 0 0 0-5.7.6.6 0 0 1 .1-.85Z" />
      </svg>
      <span className="truncate">{c.ad_title || "Ad"}</span>
    </span>
  );
}

function ListSkeleton() {
  return (
    <ul className="space-y-0.5" aria-hidden>
      {Array.from({ length: 10 }).map((_, i) => (
        <li key={i} className="flex items-center gap-2.5 px-2 py-2">
          <div className="skeleton h-9 w-9 shrink-0 rounded-full bg-[var(--ib-canvas)]" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-2.5 w-2/5 rounded bg-[var(--ib-canvas)]" />
            <div className="skeleton h-2.5 w-4/5 rounded bg-[var(--ib-canvas)]" />
          </div>
        </li>
      ))}
    </ul>
  );
}
