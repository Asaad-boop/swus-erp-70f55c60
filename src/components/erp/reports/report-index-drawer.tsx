import { useMemo, useState } from "react";
import { BookOpen, Search } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { REPORT_REGISTRY, type ReportEntry } from "@/lib/erp/reports/registry";

export function ReportIndexDrawer({ onOpenTab }: { onOpenTab?: (tab: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = REPORT_REGISTRY.filter((r) =>
      !needle ||
      [r.name, r.category, r.source, r.formula, r.id].some((s) => s.toLowerCase().includes(needle)),
    );
    const map = new Map<string, ReportEntry[]>();
    for (const r of rows) map.set(r.category, [...(map.get(r.category) ?? []), r]);
    return Array.from(map.entries());
  }, [q]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <BookOpen className="mr-1.5 h-3.5 w-3.5" />
          Index
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Report index</SheetTitle>
        </SheetHeader>
        <p className="mt-1 text-xs text-muted-foreground">
          One number = one source = one formula. Every report below is defined once.
        </p>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search report, source or formula…"
            className="h-9 pl-8 text-xs"
          />
        </div>

        <div className="mt-4 space-y-5 pb-8">
          {groups.length === 0 && <p className="text-sm text-muted-foreground">No report matches that search.</p>}
          {groups.map(([cat, rows]) => (
            <div key={cat} className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat}</h4>
              {rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { onOpenTab?.(r.tab); setOpen(false); }}
                  className="w-full rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{r.name}</span>
                    <Badge
                      variant="outline"
                      className={r.status === "live"
                        ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                        : "border-amber-500/40 text-amber-600 dark:text-amber-400"}
                    >
                      {r.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{r.formula}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/80">
                    {r.source} · basis: {r.basis} · {r.definition_version}
                  </p>
                </button>
              ))}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
