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
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm rounded-xl border bg-card px-4 py-2.5 shadow-sm">
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="tabular-nums">
          Showing <span className="font-semibold text-foreground">{start.toLocaleString()}–{end.toLocaleString()}</span> of{" "}
          <span className="font-semibold text-foreground">{total.toLocaleString()}</span>
        </span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
          <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[25, 50, 100, 200].map((n) => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => onPage(0)} title="First page">
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => onPage(page - 1)} title="Previous">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="px-1.5 text-muted-foreground">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p - 1)}
              className={cn(
                "h-8 min-w-8 px-2 rounded-md text-xs font-semibold tabular-nums transition-colors",
                p === page + 1 ? "bg-foreground text-background" : "hover:bg-muted text-muted-foreground",
              )}
            >
              {p}
            </button>
          ),
        )}
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page + 1 >= totalPages} onClick={() => onPage(page + 1)} title="Next">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page + 1 >= totalPages} onClick={() => onPage(totalPages - 1)} title="Last page">
          <ChevronsRight className="h-4 w-4" />
        </Button>

        <form
          className="ml-2 flex items-center gap-1"
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
            placeholder={`1–${totalPages}`}
            className="h-8 w-[76px] text-xs"
            inputMode="numeric"
          />
          <Button type="submit" size="sm" variant="outline" className="h-8 text-xs">Go</Button>
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
