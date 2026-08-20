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
  rowsOnPage: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = total === 0 ? 0 : page * pageSize + rowsOnPage;
  const [jump, setJump] = useState("");

  const pages = pageNumbers(page + 1, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--panel-border)] px-3 py-2 text-[12.5px]">
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          Show
          <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-[72px] rounded-lg border-[var(--panel-border)] bg-card text-xs shadow-none"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[25, 50, 100, 200].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
          entries
        </span>
        <span className="hidden sm:inline tabular-nums text-muted-foreground/80">
          Showing {start.toLocaleString()} to {end.toLocaleString()} of {total.toLocaleString()} orders
        </span>
      </div>

      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg border border-[var(--panel-border)] bg-card text-muted-foreground" disabled={page === 0} onClick={() => onPage(0)} title="First page">
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg border border-[var(--panel-border)] bg-card text-muted-foreground" disabled={page === 0} onClick={() => onPage(page - 1)} title="Previous">
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-muted-foreground/60">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p - 1)}
              className={cn(
                "h-8 min-w-8 px-2 rounded-lg border text-xs tabular-nums transition-colors",
                p === page + 1
                  ? "border-primary bg-primary text-primary-foreground font-semibold"
                  : "border-[var(--panel-border)] bg-card text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]",
              )}
            >
              {p}
            </button>
          ),
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg border border-[var(--panel-border)] bg-card text-muted-foreground" disabled={page + 1 >= totalPages} onClick={() => onPage(page + 1)} title="Next">
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg border border-[var(--panel-border)] bg-card text-muted-foreground" disabled={page + 1 >= totalPages} onClick={() => onPage(totalPages - 1)} title="Last page">
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>

        <form
          className="ml-1.5 hidden sm:flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(jump);
            if (Number.isFinite(n) && n >= 1 && n <= totalPages) onPage(n - 1);
            setJump("");
          }}
        >
          <Input
            value={jump}
            onChange={(e) => setJump(e.target.value)}
            placeholder={`Go to 1–${totalPages}`}
            className="h-7 w-[92px] rounded-lg border-transparent bg-foreground/[0.04] text-xs shadow-none"
            inputMode="numeric"
          />
        </form>
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
