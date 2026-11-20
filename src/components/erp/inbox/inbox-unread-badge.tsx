import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { db } from "@/lib/erp/inbox/inbox";

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

export function InboxUnreadBadge({ mini }: { mini?: boolean }) {
  const { data } = useInboxUnreadCount();
  if (!data) return null;
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-full bg-primary font-bold text-primary-foreground",
        mini
          ? "absolute -right-0.5 -top-0.5 h-4 min-w-4 px-1 text-[9px]"
          : "ml-auto h-5 min-w-5 px-1.5 text-[10px]",
      )}
    >
      {data > 99 ? "99+" : data}
    </span>
  );
}
