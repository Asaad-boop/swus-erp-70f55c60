import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Auto-recover from stale chunk hashes after a fresh deploy.
// Old client references chunk URLs that no longer exist → dynamic import fails.
// Reload once (guarded via sessionStorage) to pull fresh index.html + new hashes.
function isChunkLoadError(err: unknown): boolean {
  const msg = (err as any)?.message ?? String(err ?? "");
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /ChunkLoadError/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg)
  );
}

function tryReloadForStaleChunk(err: unknown): boolean {
  if (typeof window === "undefined") return false;
  if (!isChunkLoadError(err)) return false;
  try {
    const KEY = "__chunk_reload_at";
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 10_000) return false; // avoid reload loop
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {}
  window.location.reload();
  return true;
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    tryReloadForStaleChunk(e.error ?? e.message);
  });
  window.addEventListener("unhandledrejection", (e) => {
    tryReloadForStaleChunk(e.reason);
  });
  // Vite's official hook — fires when a module preload (dynamic chunk) fails,
  // typically after a redeploy invalidates old hashed filenames. Preventing
  // default stops the console error; we hard-reload to fetch fresh index.html.
  window.addEventListener("vite:preloadError", (e: any) => {
    e?.preventDefault?.();
    try {
      const KEY = "__chunk_reload_at";
      const last = Number(sessionStorage.getItem(KEY) ?? 0);
      if (Date.now() - last < 10_000) return;
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {}
    window.location.reload();
  });
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Instant back/forward + no re-fetch storms while navigating around the ERP.
        staleTime: 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnMount: true,
        refetchOnReconnect: true,
        retry: 1,
        networkMode: "offlineFirst",
        // Do not reuse another query's rows across brand/filter changes.
      },
      mutations: { retry: 0, networkMode: "offlineFirst" },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Warm the next page (code chunk + loader) as soon as a link is hovered.
    defaultPreload: "intent",
    defaultPreloadDelay: 40,
    defaultPreloadStaleTime: 30_000,
    // Avoid spinner flicker on fast transitions.
    defaultPendingMs: 250,
    defaultPendingMinMs: 300,
    defaultErrorComponent: ({ error }) => {
      if (tryReloadForStaleChunk(error)) {
        return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-sm text-gray-500">Updating…</div>
          </div>
        );
      }
      return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8 bg-white rounded-xl shadow-sm max-w-md">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Something went wrong
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            {(error as Error | undefined)?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
          >
            Reload Page
          </button>
        </div>
      </div>
      );
    },
    defaultNotFoundComponent: () => (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <div className="text-4xl mb-4">404</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Page not found</h2>
          <a href="/erp" className="text-indigo-600 text-sm hover:underline">
            Go to Dashboard
          </a>
        </div>
      </div>
    ),
  });

  return router;
};
