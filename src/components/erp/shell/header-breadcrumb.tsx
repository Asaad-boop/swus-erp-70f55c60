import { useMemo } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { NAV_GROUPS, type NavItem } from "@/lib/erp/nav";

type Crumb = { group: string; section?: string; item: NavItem };

/** Flattened nav tree, longest paths first so the most specific match wins. */
const INDEX: { path: string; crumb: Crumb }[] = (() => {
  const out: { path: string; crumb: Crumb }[] = [];
  for (const g of NAV_GROUPS) {
    if (g.kind === "flat") {
      for (const item of g.items) {
        out.push({ path: item.to, crumb: { group: g.label, item } });
        for (const p of item.activeFor ?? [])
          out.push({ path: p, crumb: { group: g.label, item } });
      }
    } else {
      for (const s of g.sections) {
        for (const item of s.items) {
          out.push({ path: item.to, crumb: { group: g.label, section: s.label, item } });
          for (const p of item.activeFor ?? [])
            out.push({ path: p, crumb: { group: g.label, section: s.label, item } });
        }
      }
    }
  }
  return out.sort((a, b) => b.path.length - a.path.length);
})();

/** Last URL segment as a readable label; record IDs become "Details". */
function tailLabel(pathname: string): string {
  const seg = decodeURIComponent(pathname.replace(/\/+$/, "").split("/").pop() ?? "");
  if (!seg || (/\d/.test(seg) && seg.length > 6)) return "Details";
  return seg.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function findCrumb(pathname: string): Crumb | null {
  const clean = pathname.replace(/\/+$/, "") || "/";
  for (const { path, crumb } of INDEX) {
    if (clean === path) return crumb;
  }
  for (const { path, crumb } of INDEX) {
    if (path !== "/erp" && clean.startsWith(path + "/")) return crumb;
  }
  return null;
}

/** "Where am I" trail in the top bar, derived from the same nav tree as the sidebar. */
export function HeaderBreadcrumb() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const crumb = useMemo(() => findCrumb(pathname), [pathname]);
  if (!crumb) return null;

  const Icon = crumb.item.icon;
  const parent = crumb.section ?? crumb.group;
  const isDetail =
    pathname.replace(/\/+$/, "") !== crumb.item.to && !crumb.item.activeFor?.includes(pathname);

  return (
    <nav
      aria-label="Breadcrumb"
      className="hidden md:flex min-w-0 items-center gap-1.5 text-[13px]"
    >
      <span className="truncate text-muted-foreground">{parent}</span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
      {isDetail ? (
        <>
          <Link
            to={crumb.item.to}
            className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{crumb.item.label}</span>
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
          <span className="truncate font-medium text-foreground">{tailLabel(pathname)}</span>
        </>
      ) : (
        <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-foreground">
          <Icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          <span className="truncate">{crumb.item.label}</span>
        </span>
      )}
    </nav>
  );
}
