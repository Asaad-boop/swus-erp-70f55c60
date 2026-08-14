/** Shared video helpers for Growth Hub (YouTube / TikTok / Facebook / Vimeo / direct file). */
export function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    if (host.endsWith("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
      if (u.pathname.startsWith("/shorts/"))
        return `https://www.youtube.com/embed/${u.pathname.split("/")[2]}`;
      if (u.pathname.startsWith("/embed/")) return url;
    }
    if (host.endsWith("vimeo.com")) return `https://player.vimeo.com/video/${u.pathname.slice(1)}`;
    if (host.endsWith("facebook.com") || host.endsWith("fb.watch"))
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`;
    if (host.endsWith("tiktok.com")) {
      const id = u.pathname.split("/video/")[1]?.split(/[/?]/)[0];
      if (id) return `https://www.tiktok.com/embed/v2/${id}`;
    }
  } catch {
    return null;
  }
  return null;
}

export function VideoEmbed({ url, title = "Video" }: { url: string; title?: string }) {
  const embed = toEmbedUrl(url);
  if (embed) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl border bg-black">
        <iframe
          src={embed}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>
    );
  }
  if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(url))
    return <video src={url} controls className="w-full rounded-xl border bg-black" />;
  return (
    <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
      এই লিংকটা এখানে play করা যাচ্ছে না — "Open" দিয়ে নতুন ট্যাবে দেখো।
    </p>
  );
}