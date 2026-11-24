import {
  AlarmClock,
  AlertTriangle,
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

type ViewDef = { key: InboxView; label: string; hint: string };

/** Always visible — the queues people actually work from. */
const PRIMARY: ViewDef[] = [
  { key: "awaiting", label: "Reply baki", hint: "Customer er last message er reply hoy nai" },
  { key: "ads", label: "Ad theke", hint: "Message ad e click kore asha open chat" },
  { key: "mine", label: "Amar", hint: "Amake assign kora open chat" },
  { key: "complaint", label: "Complaint", hint: "Obhijog" },
  { key: "followup", label: "Follow-up", hint: "Pore dekhbo" },
  { key: "open", label: "Open", hint: "Shob open chat" },
];
const MORE: ViewDef[] = [
  { key: "unread", label: "Unread", hint: "Pora hoy nai" },
  { key: "unassigned", label: "Karo na", hint: "Karo kache assign kora nai" },
  { key: "ordered", label: "Order hoyeche", hint: "Ei chat theke order" },
  { key: "done", label: "Done", hint: "Shesh kora chat" },
  { key: "all", label: "Shob", hint: "Shob chat" },
];

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
};

export function ConversationList(p: Props) {
  const picking = p.picked.size > 0;
  const allPicked = p.conversations.length > 0 && p.conversations.every((c) => p.picked.has(c.id));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-[var(--ib-line)] px-2.5 pb-2 pt-2.5">
        <label className="group relative block">
          <Search className="ib-ink-3 pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
          <input
            ref={p.searchRef}
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            placeholder="Naam, phone, message…"
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

        {picking ? (
          <BulkBar {...p} allPicked={allPicked} />
        ) : (
          <div className="flex h-7 items-center gap-2 px-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-1 rounded-md text-[14px] font-semibold tracking-[-0.01em] lg:pointer-events-none"
                >
                  <span className="truncate">{p.title}</span>
                  <ChevronDown className="ib-ink-3 h-3.5 w-3.5 lg:hidden" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52 lg:hidden">
                {[...PRIMARY, ...MORE].map((v) => (
                  <DropdownMenuItem
                    key={v.key}
                    onClick={() => p.onView(v.key)}
                    className="text-[13px]"
                  >
                    <span className="flex-1">{v.label}</span>
                    {!!p.counts[v.key] &&
                      v.key !== "open" &&
                      v.key !== "done" &&
                      v.key !== "all" && (
                        <span className="ib-ink-3 tabular text-[11px]">
                          {fmtCount(p.counts[v.key])}
                        </span>
                      )}
                    {p.view === v.key && <Check className="ml-2 h-3.5 w-3.5" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {p.subtitle && <span className="ib-ink-3 tabular text-[12px]">{p.subtitle}</span>}
            <div className="ml-auto" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] transition-colors",
                    p.platform !== "all" || p.label
                      ? "bg-[var(--ib-accent-soft)] font-medium text-primary"
                      : "ib-ink-3 hover:bg-[var(--ib-hover)] hover:text-[var(--ib-ink)]",
                  )}
                  title="Channel / label diye filter"
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  {p.platform !== "all"
                    ? PLATFORM_LABEL[p.platform]
                    : p.label
                      ? labelInfo(p.label).label
                      : "Filter"}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs">Channel</DropdownMenuLabel>
                {(["all", "messenger", "instagram", "whatsapp"] as const).map((pl) => (
                  <DropdownMenuItem
                    key={pl}
                    onClick={() => p.onPlatform(pl)}
                    className="text-[13px]"
                  >
                    {pl === "all" ? (
                      <span className="mr-2 w-4" />
                    ) : (
                      <PlatformIcon platform={pl} className="mr-2 h-3.5 w-3.5" />
                    )}
                    <span className="flex-1">
                      {pl === "all" ? "Shob channel" : PLATFORM_LABEL[pl]}
                    </span>
                    {p.platform === pl && <Check className="h-3.5 w-3.5" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Label</DropdownMenuLabel>
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
                        {p.counts.labels[l.key]}
                      </span>
                    )}
                    {p.label === l.key && <Check className="h-3.5 w-3.5" />}
                  </DropdownMenuItem>
                ))}
                {(p.platform !== "all" || p.label) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        p.onPlatform("all");
                        p.onLabel(null);
                      }}
                      className="text-[13px]"
                    >
                      Filter bad dao
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {p.conversations.length > 0 && (
              <button
                type="button"
                onClick={() => p.onPickAll(true)}
                className="ib-ink-3 rounded-md px-1.5 py-0.5 text-[11.5px] hover:bg-[var(--ib-hover)] hover:text-[var(--ib-ink)]"
                title="List er shob select kore ekshathe reply / done"
              >
                Select
              </button>
            )}
          </div>
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
                ? "Shob reply deya shesh 🎉"
                : p.search
                  ? `"${p.search}" diye kichu pai nai`
                  : "Ei list khali"}
            </div>
            <div className="ib-ink-2 text-[12px]">
              {p.view === "awaiting" && !p.search
                ? "Notun message ashle ekhane chole ashbe."
                : "Onno filter dekho ba search bodlao."}
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
            Aro dekhao
          </button>
        )}
      </div>
    </div>
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
}: {
  c: InboxConversation;
  active: boolean;
  picked: boolean;
  picking: boolean;
  onSelect: (id: string) => void;
  onPick: (id: string, on: boolean, range?: boolean) => void;
  showBrand: boolean;
  assignee?: InboxStaff;
}) {
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
        className="ib-row group/row flex w-full cursor-pointer items-center gap-2.5 px-2 py-[7px] text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
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
                    ? "font-medium text-primary"
                    : "ib-ink-3",
              )}
              title={
                awaiting ? `${waitLabel(c.last_message_at)} dhore reply er opekkhay` : undefined
              }
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
                title="Reply baki"
              />
            )}
            <span
              className={cn(
                "line-clamp-1 text-[12.5px] leading-[18px]",
                unread ? "text-[var(--ib-ink)]" : "ib-ink-2",
              )}
            >
              {c.last_message_direction === "out" && <span className="ib-ink-3">Apni: </span>}
              {c.last_message_preview ?? ""}
            </span>
            {assignee && !unread && (
              <span
                title={`Assigned: ${assignee.display_name}`}
                className="ib-ink-3 ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--ib-canvas)] text-[7.5px] font-bold"
              >
                {initials(assignee.display_name)}
              </span>
            )}
            {unread && (
              <span className="tabular ml-auto flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[9.5px] font-semibold text-primary-foreground">
                {c.unread_count > 99 ? "99+" : c.unread_count}
              </span>
            )}
          </div>
          {(showBrand || c.ad_id || c.snoozed_until || (c.tags?.length ?? 0) > 0) && (
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
            </div>
          )}
        </div>
      </div>
    </li>
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
