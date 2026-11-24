import { Inbox as InboxIcon, Loader2, Search } from "lucide-react";
import { BrandBadge } from "@/components/erp/brand-badge";
import { cn } from "@/lib/utils";
import {
  displayName,
  initials,
  type InboxConversation,
  type InboxStaff,
  type InboxView,
} from "@/lib/erp/inbox/inbox";
import { ContactAvatar, relTime } from "./shared";

const VIEWS: Array<{ key: InboxView; label: string; hint: string }> = [
  { key: "awaiting", label: "Reply baki", hint: "Customer er last message er reply hoy nai" },
  { key: "open", label: "Open", hint: "Shob open conversation" },
  { key: "mine", label: "Amar", hint: "Amake assign kora" },
  { key: "unassigned", label: "Unassigned", hint: "Karo kache assign kora nai" },
  { key: "unread", label: "Unread", hint: "Pora hoy nai" },
  { key: "ads", label: "Ad theke", hint: "Message ad e click kore asha open chat" },
  { key: "done", label: "Done", hint: "Shesh kora conversation" },
  { key: "all", label: "All", hint: "Shob" },
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

type Props = {
  conversations: InboxConversation[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (v: string) => void;
  view: InboxView;
  onView: (v: InboxView) => void;
  staff: InboxStaff[];
  searchRef?: React.Ref<HTMLInputElement>;
  showBrand: boolean;
  canLoadMore: boolean;
  onLoadMore: () => void;
  isFetchingMore: boolean;
};

export function ConversationList(p: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2.5 px-3 pb-2 pt-3">
        <label className="group relative block">
          <Search className="ib-ink-3 pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <input
            ref={p.searchRef}
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            placeholder="Naam, phone ba message khojo"
            className="h-10 w-full rounded-xl border border-[var(--ib-line)] bg-[var(--ib-canvas)] pl-9 pr-10 text-sm outline-none transition-colors placeholder:text-[var(--ib-ink-3)] focus:border-primary/40 focus:bg-[var(--ib-panel)] focus:ring-4 focus:ring-primary/10"
          />
          <kbd className="ib-ink-3 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-[var(--ib-line)] bg-[var(--ib-panel)] px-1.5 text-[10px] font-semibold group-focus-within:hidden">
            /
          </kbd>
        </label>
        <div className="-mx-1 flex items-center gap-0.5 overflow-x-auto px-1 [scrollbar-width:none]">
          {VIEWS.map((v) => {
            const on = p.view === v.key;
            return (
              <button
                key={v.key}
                type="button"
                title={v.hint}
                onClick={() => p.onView(v.key)}
                className={cn(
                  "h-7 shrink-0 rounded-lg px-2.5 text-xs font-medium transition-colors",
                  on
                    ? "bg-[var(--ib-ink)] text-[var(--ib-panel)]"
                    : "ib-ink-2 hover:bg-[var(--ib-hover)] hover:text-[var(--ib-ink)]",
                )}
              >
                {v.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="ib-scroll min-h-0 flex-1 overflow-y-auto px-1.5 pb-2 pl-3">
        {p.isLoading ? (
          <ListSkeleton />
        ) : p.conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--ib-canvas)]">
              <InboxIcon className="ib-ink-3 h-5 w-5" />
            </div>
            <div className="text-sm font-medium">
              {p.view === "awaiting" && !p.search
                ? "Shob reply deya shesh"
                : p.search
                  ? `"${p.search}" diye kichu pai nai`
                  : "Ei list khali"}
            </div>
            <div className="ib-ink-2 text-xs">
              {p.view === "awaiting" && !p.search
                ? "Notun message ashle ekhane chole ashbe."
                : "Onno filter dekho ba search bodlao."}
            </div>
          </div>
        ) : (
          <ul className="space-y-0.5 pr-1.5">
            {p.conversations.map((c) => (
              <Row
                key={c.id}
                c={c}
                active={c.id === p.selectedId}
                onSelect={p.onSelect}
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
            className="ib-ink-2 mx-auto mt-2 flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium hover:bg-[var(--ib-hover)]"
          >
            {p.isFetchingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Aro dekhao
          </button>
        )}
      </div>
    </div>
  );
}

function Row({
  c,
  active,
  onSelect,
  showBrand,
  assignee,
}: {
  c: InboxConversation;
  active: boolean;
  onSelect: (id: string) => void;
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
      <button
        type="button"
        data-conv-id={c.id}
        data-active={active}
        onClick={() => onSelect(c.id)}
        className="ib-row flex w-full items-start gap-3 px-2.5 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <ContactAvatar name={name} src={c.contact_avatar} platform={c.platform} size={42} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "truncate text-[14px] leading-5",
                unread ? "font-semibold" : "font-medium",
              )}
            >
              {name}
            </span>
            <span
              className={cn(
                "tabular ml-auto shrink-0 text-[11px]",
                unread ? "font-semibold text-primary" : "ib-ink-3",
              )}
            >
              {relTime(c.last_message_at)}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span
              className={cn(
                "line-clamp-1 text-[13px] leading-5",
                unread ? "text-[var(--ib-ink)]" : "ib-ink-2",
              )}
            >
              {c.last_message_direction === "out" && <span className="ib-ink-3">Apni: </span>}
              {c.last_message_preview ?? ""}
            </span>
            {unread && (
              <span className="tabular ml-auto flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {c.unread_count > 99 ? "99+" : c.unread_count}
              </span>
            )}
          </div>
          {(showBrand || awaiting || assignee || c.ad_id) && (
            <div className="mt-1.5 flex items-center gap-1.5">
              {c.ad_id && <AdChip c={c} />}
              {awaiting && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[10.5px] font-medium",
                    urgent
                      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                      : "bg-[var(--ib-amber-soft)] text-amber-700 dark:text-amber-300",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      urgent ? "bg-rose-500" : "bg-amber-500",
                    )}
                  />
                  {waitLabel(c.last_message_at)} dhore opekkha
                </span>
              )}
              {showBrand && <BrandBadge brandId={c.brand_id} variant="compact" />}
              {assignee && (
                <span
                  title={`Assigned: ${assignee.display_name}`}
                  className="ib-ink-2 ml-auto flex h-5 items-center gap-1 rounded-full bg-[var(--ib-canvas)] pl-0.5 pr-1.5 text-[10px] font-medium"
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--ib-panel)] text-[8px] font-bold shadow-sm">
                    {initials(assignee.display_name)}
                  </span>
                  {assignee.display_name.split(" ")[0]}
                </span>
              )}
            </div>
          )}
        </div>
      </button>
    </li>
  );
}

/** Small "Ad" marker: which ad started this chat (fresh clicks glow for 24h). */
export function AdChip({ c }: { c: InboxConversation }) {
  const fresh = c.ad_at ? Date.now() - new Date(c.ad_at).getTime() < 24 * 3_600_000 : false;
  return (
    <span
      title={`Ad: ${c.ad_title ?? c.ad_id}${c.ad_source === "backfill" ? " (ager chat, icebreaker theke dhora)" : ""}`}
      className={cn(
        "inline-flex max-w-[140px] items-center gap-1 rounded-md px-1.5 py-px text-[10.5px] font-medium",
        fresh
          ? "bg-violet-500/10 text-violet-700 dark:text-violet-300"
          : "bg-[var(--ib-canvas)] ib-ink-2",
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
    <ul className="space-y-1 pr-1.5" aria-hidden>
      {Array.from({ length: 8 }).map((_, i) => (
        <li key={i} className="flex items-start gap-3 px-2.5 py-2.5">
          <div className="skeleton h-[42px] w-[42px] shrink-0 rounded-full bg-[var(--ib-canvas)]" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="skeleton h-3 w-2/5 rounded bg-[var(--ib-canvas)]" />
            <div className="skeleton h-3 w-4/5 rounded bg-[var(--ib-canvas)]" />
          </div>
        </li>
      ))}
    </ul>
  );
}
