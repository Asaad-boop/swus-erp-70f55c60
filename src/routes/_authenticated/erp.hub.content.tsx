import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Creative Desk has been merged into Content Studio.
 * Kept as a permanent redirect so old links/bookmarks keep working.
 */
export const Route = createFileRoute("/_authenticated/erp/hub/content")({
  beforeLoad: () => {
    throw redirect({ to: "/erp/content/pipeline", replace: true });
  },
});
