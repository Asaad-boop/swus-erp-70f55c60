import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy Growth Studio route — folded into the Growth OS. */
export const Route = createFileRoute("/_authenticated/erp/growth/agencies")({
  beforeLoad: () => {
    throw redirect({ to: "/erp/growth/content", search: { tab: "creators" } });
  },
});
