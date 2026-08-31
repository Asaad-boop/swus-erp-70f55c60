import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  History, Wallet, Truck, Boxes, Pencil, Flag, Loader2, Search, Download,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fmtBdt } from "@/lib/erp/imports/types";
import { getPoActivity } from "@/lib/erp/imports/po-activity.functions";

type Group = "money" | "shipment" | "stock" | "plan" | "status";

const GROUP_META: Record<Group, { label: string; Icon: typeof Wallet; dot: string; chip: string }> = {
  money: {
    label: "Money", Icon: Wallet,
    dot: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 ring-emerald-200/70 dark:ring-emerald-900",
    chip: "border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300",
  },
  shipment: {
    label: "Shipment", Icon: Truck,
    dot: "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 ring-indigo-200/70 dark:ring-indigo-900",
    chip: "border-indigo-200 text-indigo-700 dark:border-indigo-900 dark:text-indigo-300",
  },
  stock: {
    label: "Stock", Icon: Boxes,
    dot: "bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300 ring-orange-200/70 dark:ring-orange-900",
    chip: "border-orange-200 text-orange-700 dark:border-orange-900 dark:text-orange-300",
  },
  plan: {
    label: "Plan / Edit", Icon: Pencil,
    dot: "bg-muted text-muted-foreground ring-border",
    chip: "border-border text-muted-foreground",
  },
  status: {
    label: "Status", Icon: Flag,
    dot: "bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-300 ring-sky-200/70 dark:ring-sky-900",
    chip: "border-sky-200 text-sky-700 dark:border-sky-900 dark:text-sky-300",
  },
};

const DHAKA = "Asia/Dhaka";

function dayKey(ts: string) {
  return new Date(ts).toLocaleDateString("en-CA", { timeZone: DHAKA });
}
function dayLabel(key: string) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: DHAKA });
  const yest = new Date(Date.now() - 864e5).toLocaleDateString("en-CA", { timeZone: DHAKA });
  if (key === today) return "Aaj";
  if (key === yest) return "Gotokal";
  return new Date(`${key}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}
function timeLabel(ts: string) {
  return new Date(ts).toLocaleTimeString("en-US", {
    timeZone: DHAKA, hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

export function ActivityTimeline({ poId, poNumber }: { poId: string; poNumber?: string }) {
  const fn = useServerFn(getPoActivity);
  const { data, isLoading } = useQuery({
    queryKey: ["imp-po", poId, "activity"],
    queryFn: () => fn({ data: { poId } }),
  });

  const [filter, setFilter] = useState<"all" | Group>("all");
  const [q, setQ] = useState("");

  const events = ((data as any)?.events ?? []) as Array<any>;

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: events.length };
    events.forEach((e) => { c[e.group] = (c[e.group] ?? 0) + 1; });
    return c;
  }, [events]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return events.filter((e) => {
      if (filter !== "all" && e.group !== filter) return false;
      if (!needle) return true;
      return [e.title, e.detail, e.actor].filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [events, filter, q]);

  const days = useMemo(() => {
    const m = new Map<string, any[]>();
    filtered.forEach((e) => {
      const k = dayKey(e.ts);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    });
    return [...m.entries()];
  }, [filtered]);

  const exportCsv = () => {
    const rows = [
      ["Date (Dhaka)", "Time", "Type", "Action", "Detail", "Amount (BDT)", "By"],
      ...filtered.map((e) => [
        dayKey(e.ts), timeLabel(e.ts), GROUP_META[e.group as Group]?.label ?? e.group,
        e.title, e.detail ?? "", e.amount != null ? String(e.amount) : "", e.actor ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${poNumber ?? "PO"}-activity.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
            <History className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Activity & history</h3>
            <p className="text-xs text-muted-foreground">
              Ki korlen, kokhon korlen — sob ekhane (Asia/Dhaka)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="h-8 pl-8 w-40 sm:w-52 text-xs"
            />
          </div>
          <Button size="sm" variant="outline" className="h-8" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1" />CSV
          </Button>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-border flex items-center gap-1.5 flex-wrap">
        {(["all", "money", "shipment", "stock", "plan", "status"] as const).map((g) => {
          const active = filter === g;
          const n = counts[g] ?? 0;
          if (g !== "all" && n === 0) return null;
          return (
            <button
              key={g}
              onClick={() => setFilter(g)}
              className={cn(
                "px-2.5 h-7 rounded-full text-xs font-medium border transition-colors",
                active ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted",
              )}
            >
              {g === "all" ? "Sob" : GROUP_META[g].label}
              <span className={cn("ml-1.5 tabular-nums", active ? "opacity-70" : "text-muted-foreground")}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="py-10 flex items-center justify-center text-sm text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />Activity load hocche…
          </div>
        ) : days.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Kono activity nei.
          </div>
        ) : (
          <div className="space-y-6">
            {days.map(([key, list]) => (
              <div key={key}>
                <div className="flex items-center gap-3 mb-3">
                  <Badge variant="secondary" className="text-[11px] font-semibold">{dayLabel(key)}</Badge>
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[11px] text-muted-foreground">{list.length} event</span>
                </div>
                <ol className="relative space-y-3 pl-1">
                  <span className="absolute left-[19px] top-2 bottom-2 w-px bg-border" aria-hidden />
                  {list.map((e) => {
                    const meta = GROUP_META[(e.group as Group)] ?? GROUP_META.plan;
                    const { Icon } = meta;
                    return (
                      <li key={e.id} className="relative flex gap-3">
                        <div className={cn(
                          "h-10 w-10 shrink-0 rounded-full flex items-center justify-center ring-4 ring-background z-10",
                          meta.dot,
                        )}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0 rounded-lg border border-border bg-card/60 px-3 py-2">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="min-w-0">
                              <div className="text-sm font-medium leading-snug">{e.title}</div>
                              {e.detail && (
                                <div className="text-xs text-muted-foreground mt-0.5 break-words">{e.detail}</div>
                              )}
                            </div>
                            {e.amount != null && e.amount !== 0 && (
                              <span className="text-sm font-semibold tabular-nums shrink-0">{fmtBdt(e.amount)}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
                            <span className="tabular-nums">{timeLabel(e.ts)}</span>
                            <span>·</span>
                            <span className={cn("px-1.5 rounded border", meta.chip)}>{meta.label}</span>
                            {e.actor && <><span>·</span><span>{e.actor}</span></>}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
