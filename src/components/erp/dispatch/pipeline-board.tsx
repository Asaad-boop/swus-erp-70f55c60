import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, ArrowDownUp, Banknote, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { OrderCard } from "./order-card";
import {
  bdt, customerName, customerPhone, isCod, stageTime, sumTotal,
  type DispatchOrder, type DispatchStage, type UseDispatch,
} from "@/hooks/erp/use-dispatch";

const PAGE = 40;

export function PipelineColumn({
  title, stage, rows, d, accent, actionLabel, onAction, selected, onToggleSelect, onSelectAll, loading,
}: {
  title: string;
  stage: DispatchStage;
  rows: DispatchOrder[];
  d: UseDispatch;
  accent: string;
  actionLabel?: string;
  onAction?: (o: DispatchOrder) => void;
  selected?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onSelectAll?: (ids: string[]) => void;
  loading?: boolean;
}) {
  const [q, setQ] = useState("");
  const [codOnly, setCodOnly] = useState(false);
  const [newestFirst, setNewestFirst] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = rows;
    if (needle) {
      list = list.filter(
        (o) =>
          (o.invoice_no ?? "").toLowerCase().includes(needle) ||
          customerName(o).toLowerCase().includes(needle) ||
          customerPhone(o).includes(needle) ||
          (o.shipping_city ?? "").toLowerCase().includes(needle) ||
          (o.shipping_thana ?? "").toLowerCase().includes(needle),
      );
    }
    if (codOnly) list = list.filter(isCod);
    const sorted = [...list].sort((a, b) => {
      const ta = new Date(stageTime(a, stage) ?? 0).getTime();
      const tb = new Date(stageTime(b, stage) ?? 0).getTime();
      return newestFirst ? tb - ta : ta - tb;
    });
    return sorted;
  }, [rows, q, codOnly, newestFirst, stage]);

  useEffect(() => setLimit(PAGE), [q, codOnly, newestFirst]);

  // incremental render so 500+ rows never block the main thread
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setLimit((l) => (l < filtered.length ? l + PAGE : l));
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  const visible = filtered.slice(0, limit);
  const codCount = filtered.filter(isCod).length;

  return (
    <Card className="p-3 border bg-card/60 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("h-1.5 w-1.5 rounded-full", accent)} />
          <span className="text-sm font-semibold tracking-tight truncate">{title}</span>
        </div>
        <Badge variant="outline" className="rounded-full h-5 text-[10px] tabular-nums shrink-0">
          {filtered.length} · {bdt(sumTotal(filtered))}
        </Badge>
      </div>

      <div className="flex items-center gap-1 mb-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Invoice, name, phone, area…"
            className="h-7 pl-7 text-xs"
          />
        </div>
        <Button
          size="icon"
          variant={codOnly ? "default" : "ghost"}
          className="h-7 w-7 shrink-0"
          title={`COD only (${codCount})`}
          onClick={() => setCodOnly((v) => !v)}
        >
          <Banknote className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          title={newestFirst ? "Newest first" : "Oldest first"}
          onClick={() => setNewestFirst((v) => !v)}
        >
          <ArrowDownUp className="h-3.5 w-3.5" />
        </Button>
        {onSelectAll && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            title="Select all in this column"
            onClick={() => onSelectAll(filtered.map((o) => o.id))}
          >
            <CheckSquare className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <ScrollArea className="h-[520px] pr-2">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-10">— empty —</p>
        ) : (
          <div className="space-y-1.5">
            {visible.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                stage={stage}
                d={d}
                selected={selected?.has(o.id)}
                onToggleSelect={onToggleSelect}
                actionLabel={actionLabel}
                onAction={onAction}
                busy={d.busy}
              />
            ))}
            <div ref={sentinel} className="h-1" />
            {limit < filtered.length && (
              <p className="text-center text-[10px] text-muted-foreground py-2">
                {filtered.length - limit} more…
              </p>
            )}
          </div>
        )}
      </ScrollArea>
    </Card>
  );
}
