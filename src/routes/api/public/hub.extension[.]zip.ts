import { createFileRoute } from "@tanstack/react-router";
import { makeZip } from "@/lib/erp/hub/zip.server";
import { extensionFiles } from "@/lib/erp/hub/extension-files.server";

/** Preview/editor hosts are auth-gated and return HTML, so the extension can never
 *  talk to them. Always bake in the stable public app URL. */
const PUBLIC_BASE = "https://project--ed6f058b-a815-45d2-bb71-e1fc12a02390.lovable.app";

function publicOrigin(candidate: string) {
  try {
    const host = new URL(candidate).hostname;
    if (host === "localhost" || host.endsWith(".lovable.app")) return candidate.replace(/\/$/, "");
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
