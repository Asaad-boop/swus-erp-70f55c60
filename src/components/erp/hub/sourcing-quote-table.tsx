import { useMemo, useState } from "react";
import {
  ArrowDownUp,
  CheckCircle2,
  Copy,
  Crown,
  ExternalLink,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { fmtValue, quoteLandedCost, type HubSourcingQuote } from "@/lib/erp/hub/hub-data";

type SortKey = "landed" | "supplier" | "moq" | "lead" | "rating";

const SAMPLE_TONE: Record<string, string> = {
  none: "text-muted-foreground",
  requested: "text-amber-600 dark:text-amber-400",
  paid: "text-amber-600 dark:text-amber-400",
  shipped: "text-sky-600 dark:text-sky-400",
  received: "text-sky-600 dark:text-sky-400",
  approved: "text-emerald-600 dark:text-emerald-400",
  rejected: "text-destructive",
};

export function QuoteCompareTable({
  quotes,
  selectedQuoteId,
  targetMax,
  onSelect,
  onEdit,
  onDuplicate,
  onRemove,
  busy,
}: {
  quotes: HubSourcingQuote[];
  selectedQuoteId: string | null;
  targetMax: number | null;
  onSelect: (q: HubSourcingQuote) => void;
  onEdit: (q: HubSourcingQuote) => void;
  onDuplicate: (q: HubSourcingQuote) => void;
  onRemove: (q: HubSourcingQuote) => void;
  busy?: boolean;
}) {
  const [sort, setSort] = useState<SortKey>("landed");
  const [dir, setDir] = useState<1 | -1>(1);

  const rows = useMemo(() => {
    const list = [...quotes];
    list.sort((a, b) => {
      let d = 0;
      switch (sort) {
        case "supplier":
          d = a.supplier_name.localeCompare(b.supplier_name);
          break;
        case "moq":
          d = (a.moq ?? Infinity) - (b.moq ?? Infinity);
          break;
        case "lead":
          d = (a.lead_time_days ?? Infinity) - (b.lead_time_days ?? Infinity);
          break;
        case "rating":
          d = (b.quality_rating ?? 0) - (a.quality_rating ?? 0);
          break;
        default:
          d = quoteLandedCost(a) - quoteLandedCost(b);
      }
      return d * dir;
    });
    return list;
  }, [quotes, sort, dir]);

  const bestId = useMemo(() => {
    const alive = quotes.filter((q) => q.status !== "rejected");
    if (alive.length === 0) return null;
    return [...alive].sort((a, b) => quoteLandedCost(a) - quoteLandedCost(b))[0]!.id;
  }, [quotes]);

  const head = (key: SortKey, label: string, cls = "") => (
    <th className={`px-2 py-2 text-left font-medium ${cls}`}>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => {
          if (sort === key) setDir((d) => (d === 1 ? -1 : 1));
          else {
            setSort(key);
            setDir(1);
          }
        }}
      >
        {label}
        {sort === key && <ArrowDownUp className="h-3 w-3" />}
      </button>
    </th>
  );

  if (quotes.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          কোনো quote নেই। 1688 / Alibaba supplier থেকে price নিয়ে "Add quote" করো।
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[840px] text-xs">
          <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              {head("supplier", "Supplier")}
              <th className="px-2 py-2 text-right font-medium">Unit ¥ / FX</th>
              <th className="px-2 py-2 text-right font-medium">Ship /u</th>
              {head("landed", "Landed /u", "text-right [&>button]:justify-end w-[110px]")}
              <th className="px-2 py-2 text-right font-medium">vs target</th>
              {head("moq", "MOQ", "text-right")}
              {head("lead", "Lead", "text-right")}
              <th className="px-2 py-2 text-left font-medium">Sample</th>
              {head("rating", "Rating", "text-right")}
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => {
              const landed = quoteLandedCost(q);
              const diff = targetMax == null ? null : landed - targetMax;
              const isSel = selectedQuoteId === q.id;
              return (
                <tr
                  key={q.id}
                  className={`border-t transition-colors ${
                    isSel ? "bg-primary/5" : "hover:bg-muted/40"
                  }`}
                >
                  <td className="max-w-[220px] px-2 py-2">
                    <p className="flex items-center gap-1 truncate font-semibold">
                      {isSel && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                      {q.supplier_name}
                      {q.id === bestId && !isSel && (
                        <Badge variant="outline" className="ml-1 border-emerald-500/40 text-[9px] text-emerald-600">
                          Best
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-[10px] uppercase text-muted-foreground">
                      {q.platform}
                      {q.contact ? ` · ${q.contact}` : ""}
                      {q.supplier_url && (
                        <a
                          href={q.supplier_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="ml-1 inline-flex text-primary"
                          aria-label="Open supplier link"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </p>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    ¥{q.unit_price_cny} <span className="text-muted-foreground">@{q.cny_rate}</span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {fmtValue(q.shipping_cost_per_unit, "bdt")}
                    <span className="block text-[10px] text-muted-foreground">{q.shipping_mode}</span>
                  </td>
                  <td
                    className={`px-2 py-2 text-right font-display text-sm font-bold tabular-nums ${
                      diff == null ? "" : diff <= 0 ? "text-emerald-600" : "text-destructive"
                    }`}
                  >
                    {fmtValue(Math.round(landed), "bdt")}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {diff == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className={diff <= 0 ? "text-emerald-600" : "text-destructive"}>
                        {diff <= 0 ? "−" : "+"}
                        {fmtValue(Math.abs(Math.round(diff)), "bdt")}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{q.moq ?? "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {q.lead_time_days ? `${q.lead_time_days}d` : "—"}
                  </td>
                  <td className="px-2 py-2">
                    <span className={`capitalize ${SAMPLE_TONE[q.sample_status] ?? ""}`}>
                      {q.sample_status}
                    </span>
                    {q.sample_tracking && (
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {q.sample_tracking}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {q.quality_rating ? `${q.quality_rating}★` : "—"}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button
                        size="sm"
                        variant={isSel ? "secondary" : "outline"}
                        className="h-7 whitespace-nowrap px-2 text-[11px]"
                        onClick={() => onSelect(q)}
                        disabled={busy || isSel}
                      >
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        {isSel ? "Selected" : "Select"}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(q)} aria-label="Edit quote">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDuplicate(q)} aria-label="Duplicate quote">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => onRemove(q)}
                        disabled={busy}
                        aria-label="Delete quote"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {quotes.some((q) => q.notes) && (
        <div className="space-y-1 border-t bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          {quotes
            .filter((q) => q.notes)
            .map((q) => (
              <p key={q.id} className="truncate">
                <span className="font-medium text-foreground">{q.supplier_name}:</span> {q.notes}
              </p>
            ))}
        </div>
      )}
    </Card>
  );
}
