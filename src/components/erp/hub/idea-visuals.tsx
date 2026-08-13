import { useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff, Star } from "lucide-react";

/** Swipeable product image gallery with dots + arrows. */
export function IdeaGallery({
  images,
  title,
  className = "aspect-[4/3]",
}: {
  images: string[];
  title: string;
  className?: string;
}) {
  const [idx, setIdx] = useState(0);
  const list = images.filter(Boolean);
  if (list.length === 0) {
    return (
      <div
        className={`flex ${className} w-full items-center justify-center bg-gradient-to-br from-muted to-muted/40 text-muted-foreground`}
      >
        <ImageOff className="h-6 w-6 opacity-50" />
      </div>
    );
  }
  const safe = Math.min(idx, list.length - 1);
  return (
    <div className={`group/gal relative ${className} w-full overflow-hidden bg-muted`}>
      {list.map((src, k) => (
        <img
          key={`${src}-${k}`}
          src={src}
          alt={`${title} — image ${k + 1}`}
          loading="lazy"
          className={`absolute inset-0 h-full w-full object-cover transition-all duration-500 ${
            k === safe ? "scale-100 opacity-100" : "scale-105 opacity-0"
          }`}
        />
      ))}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />
      {list.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous image"
            onClick={() => setIdx((safe - 1 + list.length) % list.length)}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1 opacity-0 shadow transition-opacity group-hover/gal:opacity-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next image"
            onClick={() => setIdx((safe + 1) % list.length)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1 opacity-0 shadow transition-opacity group-hover/gal:opacity-100"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
            {list.map((_, k) => (
              <button
                key={k}
                type="button"
                aria-label={`Go to image ${k + 1}`}
                onClick={() => setIdx(k)}
                className={`h-1.5 rounded-full transition-all ${
                  k === safe ? "w-4 bg-white" : "w-1.5 bg-white/60"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** 1-5 star rating. Read-only when onRate is omitted. */
export function StarRating({
  value,
  onRate,
  size = "sm",
}: {
  value: number;
  onRate?: (v: number) => void;
  size?: "sm" | "md";
}) {
  const [hover, setHover] = useState(0);
  const dim = size === "md" ? "h-5 w-5" : "h-4 w-4";
  const active = hover || value;
  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onRate}
          aria-label={`${n} star`}
          onMouseEnter={() => onRate && setHover(n)}
          onClick={() => onRate?.(n)}
          className={`transition-transform ${onRate ? "hover:scale-110 active:scale-95" : "cursor-default"}`}
        >
          <Star
            className={`${dim} ${
              n <= Math.round(active)
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground/40"
            }`}
          />
        </button>
      ))}
    </div>
  );
}
