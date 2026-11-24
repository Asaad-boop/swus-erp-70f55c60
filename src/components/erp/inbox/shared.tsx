import { useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Facebook,
  Instagram,
  MessageCircle,
  X,
} from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
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

/** Brand colours the team knows at a glance: Toyora red, HobbyShop black. */
function brandTone(name: string) {
  const n = name.toLowerCase();
  if (n.includes("toyora"))
    return { text: "text-[#D3201A] dark:text-[#FF5A4E]", dot: "bg-[#E1251B]" };
  if (n.includes("hobby"))
    return {
      text: "text-neutral-900 dark:text-neutral-100",
      dot: "bg-neutral-900 dark:bg-neutral-100",
    };
  if (n.includes("florencia")) return { text: "text-[#B4236A]", dot: "bg-[#B4236A]" };
  return { text: "text-slate-600 dark:text-slate-300", dot: "bg-slate-500" };
}

/** Full brand name as quiet coloured text — enough to tell whose message it is. */
export function BrandTag({
  brandId,
  className,
  size = "sm",
}: {
  brandId: string | null | undefined;
  className?: string;
  size?: "xs" | "sm";
}) {
  const { brands } = useBrand();
  const brand = brands.find((b) => b.id === brandId);
  if (!brand) return null;
  const tone = brandTone(brand.name);
  return (
    <span
      title={brand.name}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 font-medium leading-none",
        size === "xs" ? "text-[10.5px]" : "text-[12px]",
        tone.text,
        className,
      )}
    >
      <span className={cn("rounded-full", size === "xs" ? "h-1.5 w-1.5" : "h-2 w-2", tone.dot)} />
      {brand.name}
    </span>
  );
}

/** Full-screen photo viewer with arrow keys. */
export function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const url = images[index];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      else if (e.key === "ArrowRight" && index < images.length - 1) onIndex(index + 1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, images.length, onIndex, onClose]);
  if (!url) return null;
  const nav =
    "absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 disabled:opacity-0";
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-6 animate-in fade-in-0 duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
      />
      <div
        className="absolute right-4 top-4 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {images.length > 1 && (
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white tabular-nums">
            {index + 1} / {images.length}
          </span>
        )}
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          title="Notun tab e kholo"
        >
          <Download className="h-4 w-4" />
        </a>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          title="Bondho (Esc)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {images.length > 1 && (
        <>
          <button
            type="button"
            className={cn(nav, "left-4")}
            disabled={index === 0}
            onClick={(e) => {
              e.stopPropagation();
              onIndex(index - 1);
            }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            className={cn(nav, "right-4")}
            disabled={index === images.length - 1}
            onClick={(e) => {
              e.stopPropagation();
              onIndex(index + 1);
            }}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
    </div>
  );
}
