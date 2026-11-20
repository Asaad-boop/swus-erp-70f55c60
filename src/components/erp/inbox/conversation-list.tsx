import { Inbox as InboxIcon, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BrandBadge } from "@/components/erp/brand-badge";
import { cn } from "@/lib/utils";
import { displayName, type InboxConversation } from "@/lib/erp/inbox/inbox";
import { ContactAvatar, relTime } from "./shared";

type Props = {
  conversations: InboxConversation[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (v: string) => void;
  status: "open" | "done" | "all";
  onStatus: (v: "open" | "done" | "all") => void;
  unreadOnly: boolean;
  onUnreadOnly: (v: boolean) => void;
  showBrand: boolean;
  canLoadMore: boolean;
  onLoadMore: () => void;
  isFetchingMore: boolean;
};

export function ConversationList(p: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border/70 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            placeholder="Name, phone, message…"
            className="h-9 pl-8"
          />
        </div>
        <div className="flex items-center gap-1">
          {(["open", "done", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => p.onStatus(s)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                p.status === s
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
            onClick={() => p.onUnreadOnly(!p.unreadOnly)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              p.unreadOnly
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            Unread
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {p.isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : p.conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center text-sm text-muted-foreground">
            <InboxIcon className="h-8 w-8 opacity-40" />
            {p.search || p.unreadOnly || p.status !== "all"
              ? "Ei filter e kono conversation nai"
              : "Ekhono kono message ashe nai"}
          </div>
        ) : (
          <ul>
            {p.conversations.map((c) => {
              const name = displayName(c);
              const unread = c.unread_count > 0;
              const active = c.id === p.selectedId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => p.onSelect(c.id)}
                    className={cn(
                      "flex w-full items-start gap-3 border-b border-border/40 px-3 py-2.5 text-left transition-colors",
                      active ? "bg-muted" : "hover:bg-muted/50",
                    )}
                  >
                    <ContactAvatar name={name} src={c.contact_avatar} platform={c.platform} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "truncate text-sm",
                            unread ? "font-semibold" : "font-medium",
                          )}
                        >
                          {name}
                        </span>
                        <span
                          className={cn(
                            "ml-auto shrink-0 text-[11px]",
                            unread ? "font-semibold text-primary" : "text-muted-foreground",
                          )}
                        >
                          {relTime(c.last_message_at)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span
                          className={cn(
                            "truncate text-xs",
                            unread ? "text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {c.last_message_direction === "out" && (
                            <span className="text-muted-foreground">You: </span>
                          )}
                          {c.last_message_preview ?? ""}
                        </span>
                        {unread && (
                          <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                            {c.unread_count > 99 ? "99+" : c.unread_count}
                          </span>
                        )}
                      </div>
                      {p.showBrand && (
                        <div className="mt-1">
                          <BrandBadge brandId={c.brand_id} variant="compact" />
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {p.canLoadMore && !p.isLoading && (
          <div className="p-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={p.onLoadMore}
              disabled={p.isFetchingMore}
            >
              {p.isFetchingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load more"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
