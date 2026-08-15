import { createFileRoute, redirect } from "@tanstack/react-router";

/** Growth Hub and Content Studio merged into Growth Studio. */
export const Route = createFileRoute("/_authenticated/erp/hub/")({
  beforeLoad: () => {
    throw redirect({ to: "/erp/growth", replace: true });
  },
});
