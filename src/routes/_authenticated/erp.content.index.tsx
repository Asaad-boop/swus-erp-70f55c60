import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/erp/content/")({
  beforeLoad: () => {
    throw redirect({ to: "/erp/content/intake" });
  },
});