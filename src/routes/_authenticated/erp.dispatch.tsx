import { createFileRoute } from "@tanstack/react-router";
import { DispatchShell } from "@/components/erp/dispatch/dispatch-shell";

export const Route = createFileRoute("/_authenticated/erp/dispatch")({
  head: () => ({
    meta: [
      { title: "Dispatch Center — Packing & Courier Handover" },
      { name: "description", content: "Scan-driven packing floor: pending, packed, ready to ship and shipped orders with courier booking." },
      { property: "og:title", content: "Dispatch Center — Packing & Courier Handover" },
      { property: "og:description", content: "Scan-driven packing floor with courier booking, printing and day-end handover." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DispatchPage,
});

function DispatchPage() {
  return <DispatchShell />;
}
