import { createFileRoute, redirect } from "@tanstack/react-router";

const MAP: Record<string, string> = {
  content: "/erp/growth/pipeline",
  "media-plans": "/erp/growth/media-plans",
};

/** Legacy /erp/content/* links redirect into the merged Growth Studio. */
export const Route = createFileRoute("/_authenticated/erp/content/$")({
  beforeLoad: ({ params }) => {
    const rest = (params as { _splat?: string })._splat ?? "";
    const target = MAP[rest] ?? (rest ? `/erp/growth/${rest}` : "/erp/growth");
    throw redirect({ to: target, replace: true });
  },
});
