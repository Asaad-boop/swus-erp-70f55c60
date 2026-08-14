import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ContentSubnav } from "@/components/erp/content/content-shell";

export const Route = createFileRoute("/_authenticated/erp/content")({
  component: ContentLayout,
});

function ContentLayout() {
  return (
    <div className="min-h-full">
      <ContentSubnav />
      <Outlet />
    </div>
  );
}