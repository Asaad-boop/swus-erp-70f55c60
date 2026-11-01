import { createFileRoute } from "@tanstack/react-router";
import { MyLeaveCard } from "@/components/erp/hr/my-leave-card";

export const Route = createFileRoute("/_authenticated/erp/hr/my-leave")({
  component: MyLeavePage,
  head: () => ({
    meta: [
      { title: "My Leave — Synq ERP HRM" },
      { name: "description", content: "Apply for full or half-day leave, see your yearly balance and request history." },
      { property: "og:title", content: "My Leave — Synq ERP HRM" },
      { property: "og:description", content: "Employee self-service leave applications and balance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function MyLeavePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <h1 className="font-display text-xl font-bold">My Leave</h1>
      <MyLeaveCard />
    </div>
  );
}
