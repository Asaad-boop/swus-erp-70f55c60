import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/erp/products")({
  beforeLoad: () => {
    throw redirect({ to: "/erp/inventory", search: { tab: "catalog" } as never });
  },
});
