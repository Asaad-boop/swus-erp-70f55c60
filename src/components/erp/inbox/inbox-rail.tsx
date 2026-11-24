import {
  AlarmClock,
  AlertTriangle,
  AtSign,
  BarChart3,
  Bell,
  BellOff,
  CheckCircle2,
  Inbox,
  Layers,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  Plug,
  ShoppingBag,
  UserCircle2,
  UserX,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  INBOX_LABELS,
  PLATFORM_LABEL,
  type InboxPlatform,
  type InboxView,
  type ViewCounts,
} from "@/lib/erp/inbox/inbox";
import { BrandTag, PlatformIcon } from "./shared";

export type InboxTab = "inbox" | "comments" | "ads" | "report" | "replies" | "channels";

const fmt = (n?: number) => (!n ? "" : n > 999 ? `${(n / 1000).toFixed(1)}k` : String(n));

type Props = {
  brands: Array<{ id: string; name: string }>;
  brandFilter: string;
  onBrand: (id: string) => void;
  tab: InboxTab;
  onTab: (t: InboxTab) => void;
  view: InboxView;
  onView: (v: InboxView) => void;
  platform: InboxPlatform | "all";
  onPlatform: (p: InboxPlatform | "all") => void;
  label: string | null;
  onLabel: (l: string | null) => void;
  counts: ViewCounts;
  commentCount: number;
  isAdmin: boolean;
  alertsOn: boolean;
  onAlerts: () => void;
};

export function InboxRail(p: Props) {
  const go = (v: InboxView) => {
    p.onTab("inbox");
    p.onLabel(null);
    p.onView(v);
  };
  const onInbox = p.tab === "inbox";
  const queue = (
    v: InboxView,
    label: string,
    icon: LucideIcon,
    count?: number,
    tone?: "alert" | "warn",
    hint?: string,
  ) => (
    <RailItem
      key={v}
      icon={icon}
      label={label}
      hint={hint}
      count={count}
      tone={tone}
      active={onInbox && !p.label && p.view === v}
      onClick={() => go(v)}
    />
  );

  return (
    <nav className="ib-scroll flex h-full w-[212px] shrink-0 flex-col gap-4 overflow-y-auto px-2.5 py-3">
      {/* Brand */}
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => p.onBrand("all")}
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[13px] font-medium transition-colors",
            p.brandFilter === "all" ? "ib-rail-on" : "ib-ink-2 hover:bg-[var(--ib-hover)]",
          )}
        >
          <Layers className="h-4 w-4" /> Shob brand
        </button>
        {p.brands.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => p.onBrand(b.id)}
            className={cn(
              "flex h-8 w-full items-center rounded-lg px-2 transition-colors",
              p.brandFilter === b.id ? "ib-rail-on" : "hover:bg-[var(--ib-hover)]",
            )}
          >
            <BrandTag brandId={b.id} />
          </button>
        ))}
      </div>

      <Section title="Kaj">
        {queue(
          "awaiting",
          "Reply baki",
          Inbox,
          p.counts.awaiting,
          (p.counts.urgent ?? 0) > 0 ? "alert" : undefined,
          "Customer er last message er reply hoy nai",
        )}
        {queue("mine", "Amar chat", UserCircle2, p.counts.mine_waiting || p.counts.mine)}
        {queue(
          "ads",
          "Ad theke",
          Megaphone,
          p.counts.ads_waiting,
          (p.counts.ads_waiting ?? 0) > 0 ? "warn" : undefined,
        )}
        {queue(
          "complaint",
          "Complaint",
          AlertTriangle,
          p.counts.complaint,
          (p.counts.complaint ?? 0) > 0 ? "alert" : undefined,
          "Customer obhijog korse — nijer theke dhora",
        )}
        {queue(
          "followup",
          "Follow-up",
          AlarmClock,
          p.counts.followup,
          (p.counts.followup_due ?? 0) > 0 ? "warn" : undefined,
          "Pore abar dekhar jonno rakha chat",
        )}
        {queue("unassigned", "Karo na", UserX, p.counts.unassigned)}
      </Section>

      <Section title="Shob chat">
        {queue("open", "Open", MessagesSquare)}
        {queue("unread", "Unread", AtSign, p.counts.unread)}
        {queue("ordered", "Order hoyeche", ShoppingBag, p.counts.ordered)}
        {queue("done", "Done", CheckCircle2)}
      </Section>

      <Section title="Channel">
        <div className="flex gap-1 px-1">
          {(["all", "messenger", "instagram", "whatsapp"] as const).map((pl) => (
            <button
              key={pl}
              type="button"
              title={pl === "all" ? "Shob channel" : PLATFORM_LABEL[pl]}
              onClick={() => p.onPlatform(pl)}
              className={cn(
                "flex h-8 flex-1 items-center justify-center rounded-lg text-[11.5px] font-medium transition-colors",
                p.platform === pl ? "ib-rail-on" : "ib-ink-2 hover:bg-[var(--ib-hover)]",
              )}
            >
              {pl === "all" ? "Shob" : <PlatformIcon platform={pl} className="h-4 w-4" />}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Label">
        {INBOX_LABELS.map((l) => {
          const n = p.counts.labels?.[l.key];
          if (!n && p.label !== l.key) return null;
          return (
            <button
              key={l.key}
              type="button"
              onClick={() => {
                p.onTab("inbox");
                p.onLabel(p.label === l.key ? null : l.key);
              }}
              className={cn(
                "flex h-7 w-full items-center gap-2.5 rounded-lg px-2 text-[12.5px] transition-colors",
                onInbox && p.label === l.key ? "ib-rail-on" : "ib-ink-2 hover:bg-[var(--ib-hover)]",
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", l.dot)} />
              <span className="flex-1 truncate text-left">{l.label}</span>
              <span className="ib-ink-3 tabular text-[11px]">{fmt(n)}</span>
            </button>
          );
        })}
        {!INBOX_LABELS.some((l) => p.counts.labels?.[l.key]) && (
          <p className="ib-ink-3 px-2 text-[11.5px] leading-snug">
            Chat e label dile ekhane dekhabe.
          </p>
        )}
      </Section>

      <Section title="Aro">
        <RailItem
          icon={MessageCircle}
          label="Comments"
          count={p.commentCount}
          active={p.tab === "comments"}
          onClick={() => p.onTab("comments")}
        />
        <RailItem
          icon={Megaphone}
          label="Ad report"
          active={p.tab === "ads"}
          onClick={() => p.onTab("ads")}
        />
        <RailItem
          icon={BarChart3}
          label="Team report"
          active={p.tab === "report"}
          onClick={() => p.onTab("report")}
        />
        <RailItem
          icon={Zap}
          label="Quick replies"
          active={p.tab === "replies"}
          onClick={() => p.onTab("replies")}
        />
        {p.isAdmin && (
          <RailItem
            icon={Plug}
            label="Channels"
            active={p.tab === "channels"}
            onClick={() => p.onTab("channels")}
          />
        )}
      </Section>

      <button
        type="button"
        onClick={p.onAlerts}
        className="ib-ink-3 mt-auto flex h-8 items-center gap-2 rounded-lg px-2 text-[12px] hover:bg-[var(--ib-hover)] hover:text-[var(--ib-ink)]"
        title="Notification setting"
      >
        {p.alertsOn ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
        {p.alertsOn ? "Sound chalu" : "Sound bondho"}
      </button>
    </nav>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="ib-ink-3 px-2 pb-1 text-[11px] font-medium">{title}</div>
      {children}
    </div>
  );
}

function RailItem({
  icon: Icon,
  label,
  count,
  tone,
  active,
  hint,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  count?: number;
  tone?: "alert" | "warn";
  active: boolean;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={hint}
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-[13px] transition-colors",
        active
          ? "ib-rail-on font-medium"
          : "ib-ink-2 hover:bg-[var(--ib-hover)] hover:text-[var(--ib-ink)]",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "opacity-80")} />
      <span className="flex-1 truncate text-left">{label}</span>
      {!!count && (
        <span
          className={cn(
            "tabular min-w-5 rounded-md px-1.5 text-center text-[11px] leading-5",
            tone === "alert"
              ? "bg-rose-500 font-semibold text-white"
              : tone === "warn"
                ? "bg-amber-500/15 font-semibold text-amber-700 dark:text-amber-300"
                : "ib-ink-3",
          )}
        >
          {fmt(count)}
        </span>
      )}
    </button>
  );
}
