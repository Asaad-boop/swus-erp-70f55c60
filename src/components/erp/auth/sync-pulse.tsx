/**
 * "Sync Pulse" — signature diagram for the login brand panel.
 * Two brand nodes connected by a line with packets travelling left→right,
 * representing live data sync between Hobby Shop and Toyora Kids.
 * Presentation only; no data access.
 */
export function SyncPulse() {
  return (
    <div className="w-full max-w-md">
      <div className="flex items-center gap-3">
        <BrandNode label="Hobby Shop" sub="Inventory" ring="oklch(0.62 0.16 275)" />

        <div className="relative h-px flex-1">
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, oklch(0.62 0.16 275 / 0.55), oklch(0.70 0.15 300 / 0.55))",
            }}
          />
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              aria-hidden
              className="sync-packet absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: 0,
                animationDelay: `${i * 0.9}s`,
                background: "oklch(0.85 0.09 290)",
                boxShadow: "0 0 10px 2px oklch(0.70 0.15 285 / 0.65)",
              }}
            />
          ))}

        </div>

        <BrandNode label="Toyora Kids" sub="Fulfillment" ring="oklch(0.66 0.17 305)" align="right" />
      </div>

      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.24em] text-white/40">
        Two brands · one data layer
      </p>
    </div>
  );
}

function BrandNode({
  label,
  sub,
  ring,
  align = "left",
}: {
  label: string;
  sub: string;
  ring: string;
  align?: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <div className={`flex items-center gap-2 ${align === "right" ? "flex-row-reverse" : ""}`}>
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full"
          style={{ border: `1.5px solid ${ring}`, boxShadow: `0 0 16px -2px ${ring}` }}
        >
          <span className="sync-status-dot h-2 w-2 rounded-full" style={{ background: ring }} />
        </span>
        <div className="leading-tight">
          <div className="text-[13px] font-medium text-white/90">{label}</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">{sub}</div>
        </div>
      </div>
    </div>
  );
}
