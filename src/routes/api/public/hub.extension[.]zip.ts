import { createFileRoute } from "@tanstack/react-router";
import { makeZip } from "@/lib/erp/hub/zip.server";
import { extensionFiles } from "@/lib/erp/hub/extension-files.server";

/** The dev app URL always serves the current API routes. Published hosts can lag
 * until the next publish, while editor hosts are auth-gated. */
const PUBLIC_BASE = "https://project--ed6f058b-a815-45d2-bb71-e1fc12a02390-dev.lovable.app";

function publicOrigin(candidate: string) {
  try {
    const host = new URL(candidate).hostname;
    if (host === "localhost" || host === new URL(PUBLIC_BASE).hostname) {
      return candidate.replace(/\/$/, "");
    }
  } catch {
    /* fall through */
  }
  return PUBLIC_BASE;
}

export const Route = createFileRoute("/api/public/hub/extension.zip")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = publicOrigin(url.searchParams.get("origin") || url.origin);
        const token = url.searchParams.get("token");
        const zip = makeZip(extensionFiles(origin, token));
        return new Response(zip as unknown as BodyInit, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": 'attachment; filename="synq-with-us.zip"',
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
