import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, ChevronRight, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { FixMenu } from "./fix-menu";
import {
  bdt, customerArea, customerName, customerPhone, isCod, itemCount, stageFor, stageTime, timeAgo,
  type DispatchOrder, type DispatchStage, type UseDispatch,
} from "@/hooks/erp/use-dispatch";

type SortKey = "time" | "total" | "name" | "stage";

const STAGE_LABEL: Record<DispatchStage, string> = {
  pending: "Pending",
  packed: "Packed",
  ready: "Ready",
  shipped: "Shipped",
  hold: "On hold",
};
const STAGE_TONE: Record<DispatchStage, string> = {
  pending: "bg-amber-500",
  packed: "bg-blue-500",
  ready: "bg-violet-500",
  shipped: "bg-emerald-500",
  hold: "bg-rose-500",
};

export function DispatchTable({
  rows, d, selected, onToggleSelect, onSelectAll, onAdvance,
}: {
  rows: DispatchOrder[];
  d: UseDispatch;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onAdvance: (o: DispatchOrder) => void;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("time");
  const [asc, setAsc] = useState(true);
  const [limit, setLimit] = useState(80);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = rows;
    if (needle) {
      list = list.filter(
        (o) =>
          (o.invoice_no ?? "").toLowerCase().includes(needle) ||
          customerName(o).toLowerCase().includes(needle) ||
          customerPhone(o).includes(needle) ||
          customerArea(o).toLowerCase().includes(needle),
      );
    }
    const dir = asc ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sort === "total") return ((a.total ?? 0) - (b.total ?? 0)) * dir;
      if (sort === "name") return customerName(a).localeCompare(customerName(b)) * dir;
      if (sort === "stage") return (stageFor(a.status) ?? "").localeCompare(stageFor(b.status) ?? "") * dir;
      const ta = new Date(stageTime(a, stageFor(a.status) ?? "pending") ?? 0).getTime();
      const tb = new Date(stageTime(b, stageFor(b.status) ?? "pending") ?? 0).getTime();
      return (ta - tb) * dir;
    });
  }, [rows, q, sort, asc]);

  const visible = filtered.slice(0, limit);

  function head(key: SortKey, label: string, className?: string) {
    return (
      <TableHead className={cn("text-[11px]", className)}>
        <button
          className="inline-flex items-center gap-1 hover:text-foreground"
          onClick={() => {
            if (sort === key) setAsc((v) => !v);
            else {
              setSort(key);
              setAsc(true);
            }
          }}
        >
          {label} <ArrowUpDown className="h-3 w-3 opacity-50" />
        </button>
      </TableHead>
    );
  }

  return (
    <Card className="border bg-card/60">
      <div className="flex items-center gap-2 p-3 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoice, name, phone, area…" className="h-8 pl-8 text-xs" />
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onSelectAll(filtered.map((o) => o.id))}>
          Select all {filtered.length}
        </Button>
      </div>
      <ScrollArea className="h-[620px]">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="text-[11px]">Invoice</TableHead>
              {head("name", "Customer")}
              <TableHead className="text-[11px]">Area</TableHead>
              {head("stage", "Stage")}
              <TableHead className="text-[11px]">Pay</TableHead>
              {head("total", "Total", "text-right")}
              {head("time", "Age")}
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((o) => {
              const stage = stageFor(o.status) ?? "pending";
              return (
                <TableRow key={o.id} className={cn(selected.has(o.id) && "bg-muted/50")}>
                  <TableCell className="py-1.5">
                    <Checkbox checked={selected.has(o.id)} onCheckedChange={() => onToggleSelect(o.id)} />
                  </TableCell>
                  <TableCell className="py-1.5 font-mono text-xs font-semibold">{o.invoice_no ?? o.id.slice(0, 8)}</TableCell>
                  <TableCell className="py-1.5 text-xs">
                    <div className="font-medium truncate max-w-[160px]">{customerName(o)}</div>
                    <div className="text-[10px] text-muted-foreground">{customerPhone(o)}</div>
                  </TableCell>
                  <TableCell className="py-1.5 text-[11px] text-muted-foreground truncate max-w-[140px]">{customerArea(o)}</TableCell>
                  <TableCell className="py-1.5">
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold">
                      <span className={cn("h-1.5 w-1.5 rounded-full", STAGE_TONE[stage])} />
                      {STAGE_LABEL[stage]}
                    </span>
                  </TableCell>
                  <TableCell className="py-1.5 text-[10px]">{isCod(o) ? "COD" : "PAID"}</TableCell>
                  <TableCell className="py-1.5 text-xs text-right font-semibold tabular-nums">{bdt(o.total ?? 0)}</TableCell>
                  <TableCell className="py-1.5 text-[10px] text-muted-foreground">{timeAgo(stageTime(o, stage))}</TableCell>
                  <TableCell className="py-1.5">
                    <div className="flex items-center justify-end gap-0.5">
                      {stage !== "shipped" && stage !== "hold" && (
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 rounded-full" onClick={() => onAdvance(o)}>
                          {stage === "pending" ? "Pack" : stage === "packed" ? "Ready" : "Ship"}
                          <ChevronRight className="h-3 w-3 ml-0.5" />
                        </Button>
                      )}
                      <FixMenu order={o} d={d} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-10">— no orders —</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {limit < filtered.length && (
          <div className="p-3 text-center">
            <Button size="sm" variant="outline" onClick={() => setLimit((l) => l + 120)}>
              Load {Math.min(120, filtered.length - limit)} more ({filtered.length - limit} left)
            </Button>
          </div>
        )}
      </ScrollArea>
    </Card>
  );
}
