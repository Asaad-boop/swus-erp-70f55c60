/** Inbox comments (Facebook page/ad posts + Instagram) — browser-side queries. */
import { db } from "./inbox";

export type CommentPlatform = "facebook" | "instagram";

export type InboxPost = {
  id: string;
  channel_id: string;
  brand_id: string;
  platform: CommentPlatform;
  external_post_id: string;
  message: string | null;
  permalink: string | null;
  image_url: string | null;
};

export type InboxComment = {
  id: string;
  channel_id: string;
  brand_id: string;
  platform: CommentPlatform;
  post_id: string | null;
  external_comment_id: string;
  external_parent_id: string | null;
  author_id: string | null;
  author_name: string | null;
  author_username: string | null;
  is_from_page: boolean;
  body: string | null;
  attachment_url: string | null;
  is_hidden: boolean;
  is_deleted: boolean;
  status: "open" | "done";
  replied_at: string | null;
  private_replied_at: string | null;
  created_at: string;
  post?: InboxPost | null;
};

export type CommentFilters = {
  brandIds: string[];
  platform: CommentPlatform | "all";
  status: "open" | "done" | "all";
  unrepliedOnly: boolean;
  search: string;
};

export const COMMENT_PAGE = 60;

/** Customer comments for the list (the page's own replies are shown inside threads). */
export async function fetchComments(f: CommentFilters, limit: number): Promise<InboxComment[]> {
  if (f.brandIds.length === 0) return [];
  let q = db
    .from("inbox_comments")
    .select("*, post:inbox_posts(*)")
    .in("brand_id", f.brandIds)
    .eq("is_from_page", false)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (f.platform !== "all") q = q.eq("platform", f.platform);
  if (f.status !== "all") q = q.eq("status", f.status);
  if (f.unrepliedOnly) q = q.is("replied_at", null);
  const s = f.search.trim().replace(/[%,()]/g, "");
  if (s) q = q.or(`body.ilike.%${s}%,author_name.ilike.%${s}%,author_username.ilike.%${s}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as InboxComment[];
}

/** The whole thread a comment belongs to: top-level comment + every reply under it. */
export async function fetchCommentThread(c: InboxComment): Promise<InboxComment[]> {
  const top = c.external_parent_id ?? c.external_comment_id;
  const { data, error } = await db
    .from("inbox_comments")
    .select("*")
    .or(`external_comment_id.eq.${top},external_parent_id.eq.${top}`)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as InboxComment[];
}

export async function setCommentStatus(id: string, status: "open" | "done") {
  const { error } = await db.from("inbox_comments").update({ status }).eq("id", id);
  if (error) throw error;
}

export function commentAuthor(
  c: Pick<InboxComment, "author_name" | "author_username" | "is_from_page">,
) {
  if (c.is_from_page) return "Page";
  return c.author_name || (c.author_username ? `@${c.author_username}` : "Someone");
}

/** Link that opens the comment on Facebook/Instagram. */
export function commentLink(c: InboxComment): string | null {
  const permalink = c.post?.permalink ?? null;
  if (c.platform === "facebook") {
    const id = c.external_comment_id.includes("_")
      ? c.external_comment_id.split("_").pop()
      : c.external_comment_id;
    if (permalink) return `${permalink}${permalink.includes("?") ? "&" : "?"}comment_id=${id}`;
    return `https://www.facebook.com/${c.external_comment_id}`;
  }
  return permalink;
}
