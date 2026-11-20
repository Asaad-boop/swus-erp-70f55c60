import { Facebook, Instagram, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLATFORM_LABEL, PLATFORM_TONE, type InboxPlatform } from "@/lib/erp/inbox/inbox";

export function PlatformIcon({
  platform,
  className,
}: {
  platform: InboxPlatform;
  className?: string;
}) {
  if (platform === "instagram") return <Instagram className={className} />;
  if (platform === "whatsapp") return <MessageCircle className={className} />;
  return <Facebook className={className} />;
}

export function PlatformChip({
  platform,
  className,
}: {
  platform: InboxPlatform;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
        PLATFORM_TONE[platform],
        className,
      )}
    >
      <PlatformIcon platform={platform} className="h-3 w-3" />
      {PLATFORM_LABEL[platform]}
    </span>
  );
}

const DOT: Record<InboxPlatform, string> = {
  messenger: "bg-[#0866FF]",
  instagram: "bg-gradient-to-tr from-[#F9CE34] via-[#EE2A7B] to-[#6228D7]",
  whatsapp: "bg-[#25D366]",
};

/** Soft, stable tint per person so initials avatars are tellable apart at a glance. */
const TINTS = [
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200",
  "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200",
  "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-200",
];
function tintFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length]!;
}

export function ContactAvatar({
  name,
  src,
  platform,
  size = 40,
}: {
  name: string;
  src?: string | null;
  platform?: InboxPlatform;
  size?: number;
}) {
  const initials =
    name
      .replace(/^@/, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  const badge = Math.max(14, Math.round(size * 0.38));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className={cn(
          "flex h-full w-full items-center justify-center overflow-hidden rounded-full font-semibold",
          tintFor(name),
        )}
        style={{ fontSize: Math.max(11, Math.round(size * 0.34)) }}
      >
        {initials}
        {src && (
          <img
            src={src}
            alt=""
            className="absolute inset-0 h-full w-full rounded-full object-cover"
            referrerPolicy="no-referrer"
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
          />
        )}
      </div>
      {platform && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full ring-2 ring-[var(--ib-panel,var(--background))]",
            DOT[platform],
          )}
          style={{ width: badge, height: badge }}
        >
          <PlatformIcon platform={platform} className="h-[60%] w-[60%] text-white" />
        </span>
      )}
    </div>
  );
}

export function relTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function agoLabel(iso: string | null) {
  const r = relTime(iso);
  if (!r) return "";
  return r === "now" ? "just now" : /\d[mhd]$/.test(r) ? `${r} ago` : r;
}
