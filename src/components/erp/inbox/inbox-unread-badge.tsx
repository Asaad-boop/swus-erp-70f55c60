import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useBrand } from "@/contexts/brand-context";
import { useCurrentRole } from "@/hooks/use-current-role";
import { db, fetchViewCounts, type ViewCounts } from "@/lib/erp/inbox/inbox";

/** Number of inbox conversations with unread customer messages (RLS-scoped). */
export function useInboxUnreadCount() {
  return useQuery({
    queryKey: ["inbox", "unread-badge"],
    refetchInterval: 30_000,
    staleTime: 15_000,
    queryFn: async () => {
      const { count, error } = await db
        .from("inbox_conversations")
        .select("id", { count: "exact", head: true })
        .gt("unread_count", 0);
      if (error) return 0;
      return count ?? 0;
    },
  });
}

/** Queue counts for the selected brand(s) — shared with the inbox page's cache. */
export function useInboxQueueCounts(enabled = true) {
  const { brandIds } = useBrand();
  const { userId } = useCurrentRole();
  return useQuery({
    queryKey: ["inbox", "counts", brandIds, "all", userId],
    queryFn: () => fetchViewCounts(brandIds, "all", userId),
    enabled: enabled && brandIds.length > 0,
    refetchInterval: 45_000,
    staleTime: 15_000,
  });
}

function useOpenCommentCount(enabled: boolean) {
  const { brandIds } = useBrand();
  return useQuery({
    queryKey: ["inbox", "comment-count", brandIds],
    enabled: enabled && brandIds.length > 0,
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
}

export type QueueBadgeKey = keyof ViewCounts | "comments";

/** Small live count for a sidebar row. Red when someone is waiting too long. */
export function InboxQueueBadge({ queue, mini }: { queue: QueueBadgeKey; mini?: boolean }) {
  const counts = useInboxQueueCounts(queue !== "comments");
  const comments = useOpenCommentCount(queue === "comments");
  const n =
    queue === "comments"
      ? (comments.data ?? 0)
      : Number(counts.data?.[queue as keyof ViewCounts] ?? 0);
  if (!n) return null;
  const hot =
    (queue === "awaiting" && (counts.data?.urgent ?? 0) > 0) ||
    queue === "complaint" ||
    queue === "followup_due";
  return (
    <span
      className={cn(
        "tabular flex items-center justify-center rounded-full font-semibold leading-none",
        hot ? "bg-rose-500 text-white" : "bg-foreground/[0.07] text-foreground/70",
        mini
          ? "absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[9px]"
          : "ml-auto h-[18px] min-w-[18px] px-1.5 text-[10.5px]",
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Kept for older imports. */
export function InboxUnreadBadge({ mini }: { mini?: boolean }) {
  return <InboxQueueBadge queue="awaiting" mini={mini} />;
}
