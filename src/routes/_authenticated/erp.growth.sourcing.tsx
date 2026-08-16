import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/erp/growth/sourcing")({
  beforeLoad: () => {
    throw redirect({ to: "/erp/sourcing" });
  },
});
