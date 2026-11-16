import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Thin top-of-page progress bar shown while a route transition is loading.
 * Waits 120ms before appearing so instant (preloaded) navigations never flash it.
 */
export function RouteProgress() {
  const loading = useRouterState({ select: (s) => s.isLoading || s.status === "pending" });
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clear = () => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
    clear();
    if (loading) {
      showTimer.current = setTimeout(() => setPhase("running"), 120);
    } else if (phaseRef.current === "running") {
      setPhase("done");
      hideTimer.current = setTimeout(() => setPhase("idle"), 320);
    } else {
      setPhase("idle");
    }
    return clear;
  }, [loading]);

  if (phase === "idle") return null;
  return (
    <div
      className="erp-route-progress"
      data-phase={phase}
      role="progressbar"
      aria-label="Loading page"
      aria-busy={phase === "running"}
    >
      <div className="erp-route-progress__bar" />
    </div>
  );
}
