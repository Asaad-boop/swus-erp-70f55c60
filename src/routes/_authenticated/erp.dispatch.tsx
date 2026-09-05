import { createFileRoute, redirect } from "@tanstack/react-router";

// Dispatch Center merged into the Order List page — keep old URL working.
export const Route = createFileRoute("/_authenticated/erp/dispatch")({
  beforeLoad: () => {
    throw redirect({ to: "/erp/orders/list", search: { view: "dispatch" } });
  },
});
