import { createFileRoute } from "@tanstack/react-router";

/** Boot time of this deployment's server bundle. */
const BOOTED_AT = new Date().toISOString();

const pick = (...keys: string[]) => keys.map((k) => process.env[k]).find(Boolean) ?? null;

export const Route = createFileRoute("/api/public/build-info")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          JSON.stringify({
            commit:
              pick("VERCEL_GIT_COMMIT_SHA", "CF_PAGES_COMMIT_SHA", "GIT_COMMIT_SHA", "COMMIT_SHA"),
            branch:
              pick("VERCEL_GIT_COMMIT_REF", "CF_PAGES_BRANCH", "GIT_BRANCH"),
            message: pick("VERCEL_GIT_COMMIT_MESSAGE"),
            env: pick("VERCEL_ENV", "NODE_ENV"),
            bootedAt: BOOTED_AT,
          }),
          {
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
            },
          },
        ),
    },
  },
});
