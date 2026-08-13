import { createFileRoute } from "@tanstack/react-router";
import { makeZip } from "@/lib/erp/hub/zip.server";
import { extensionFiles } from "@/lib/erp/hub/extension-files.server";

export const Route = createFileRoute("/api/public/hub/extension.zip")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.searchParams.get("origin") || url.origin;
        const token = url.searchParams.get("token");
        const zip = makeZip(extensionFiles(origin, token));
        return new Response(zip as unknown as BodyInit, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": 'attachment; filename="growth-hub-capture.zip"',
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
