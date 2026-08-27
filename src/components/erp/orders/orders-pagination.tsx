import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function OrdersPagination({
  page, pageSize, total, rowsOnPage, onPage, onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  rowsOnPage?: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const start = total === 0 ? 0 : safePage * pageSize + 1;
  const end = total === 0 ? 0 : Math.min(total, safePage * pageSize + (rowsOnPage ?? pageSize));
  const [jump, setJump] = useState("");

  const go = (p: number) => {
    const next = Math.min(Math.max(0, p), totalPages - 1);
    if (next !== safePage) onPage(next);
  };

  const pages = pageNumbers(safePage + 1, totalPages);
  const atStart = safePage === 0;
  const atEnd = safePage + 1 >= totalPages;
  const navBtn =
    "h-8 w-8 rounded-lg border border-[var(--panel-border)] bg-card text-muted-foreground hover:text-foreground disabled:opacity-40";

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--panel-border)] bg-card/60 px-3 py-2 text-[12.5px] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      {/* left: range + page size */}
      <div className="flex min-w-0 items-center justify-between gap-3 text-muted-foreground sm:justify-start">
        <span className="truncate tabular-nums">
          <span className="font-semibold text-foreground">{start.toLocaleString()}–{end.toLocaleString()}</span>
          <span className="text-muted-foreground/70"> of {total.toLocaleString()}</span>
          <span className="hidden text-muted-foreground/70 sm:inline"> orders</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <span className="hidden text-muted-foreground/70 md:inline">Rows</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-[68px] rounded-lg border-[var(--panel-border)] bg-card text-xs shadow-none"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[25, 50, 100, 200].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </span>
      </div>

      {/* right: pager */}
      <div className="flex items-center justify-between gap-1.5 sm:justify-end">
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className={cn(navBtn, "hidden sm:inline-flex")} disabled={atStart} onClick={() => go(0)} title="First page">
            <ChevronsLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className={navBtn} disabled={atStart} onClick={() => go(safePage - 1)} title="Previous page (←)">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>

          {/* compact indicator on mobile */}
          <span className="px-2 text-xs tabular-nums text-muted-foreground sm:hidden">
            Page <span className="font-semibold text-foreground">{safePage + 1}</span> / {totalPages}
          </span>

          <div className="hidden items-center gap-0.5 sm:flex">
            {pages.map((p, i) =>
              p === "…" ? (
                <span key={`gap-${i}`} className="px-1 text-muted-foreground/60">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => go(p - 1)}
                  aria-current={p === safePage + 1 ? "page" : undefined}
                  className={cn(
                    "h-8 min-w-8 px-2 rounded-lg border text-xs tabular-nums transition-colors",
                    p === safePage + 1
                      ? "border-primary bg-primary text-primary-foreground font-semibold"
                      : "border-[var(--panel-border)] bg-card text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]",
                  )}
                >
                  {p}
                </button>
              ),
            )}
          </div>

          <Button variant="ghost" size="icon" className={navBtn} disabled={atEnd} onClick={() => go(safePage + 1)} title="Next page (→)">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className={cn(navBtn, "hidden sm:inline-flex")} disabled={atEnd} onClick={() => go(totalPages - 1)} title="Last page">
            <ChevronsRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {totalPages > 7 && (
          <form
            className="hidden items-center gap-1 lg:flex"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(jump);
              if (Number.isFinite(n) && n >= 1 && n <= totalPages) go(n - 1);
              setJump("");
            }}
          >
            <Input
              value={jump}
              onChange={(e) => setJump(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder={`Go to 1–${totalPages}`}
              aria-label="Go to page"
              className="h-8 w-[96px] rounded-lg border-transparent bg-foreground/[0.04] text-xs shadow-none"
              inputMode="numeric"
            />
          </form>
        )}
      </div>
    </div>
  );
}

function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const from = Math.max(2, current - 1);
  const to = Math.min(total - 1, current + 1);
  if (from > 2) out.push("…");
  for (let i = from; i <= to; i++) out.push(i);
  if (to < total - 1) out.push("…");
  out.push(total);
  return out;
}
