import { useState } from "react";
import { Check, ChevronDown, Filter, RotateCcw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { DateRangePicker, type MktRangeValue } from "@/components/erp/marketing/date-range-picker";
import { ORDER_STATUSES, STATUS_GROUPS, statusBadge } from "@/lib/erp/orders";
import { cn } from "@/lib/utils";

export type DashboardFilterState = {
  range: MktRangeValue;
  statuses: string[];
  paymentStatus: string;
  source: string;
  courier: string;
  confirmedBy: string;
  search: string;
  tags: string[];
  minAmount: string;
  maxAmount: string;
  city: string;
};

const PAYMENT_STATUSES = ["unpaid", "partial", "paid", "refunded"];
const SOURCES = ["website", "facebook", "manual", "phone", "shopify", "utm", "pixel", "incomplete"];
const COURIERS = ["pathao", "steadfast", "redx", "ecourier", "manual"];

function MultiStatus({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (s: string) =>
    onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 justify-between gap-2 min-w-[150px]">
          <span className="truncate">
            {value.length === 0 ? "All statuses" : `${value.length} status${value.length > 1 ? "es" : ""}`}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px] p-0">
        <ScrollArea className="h-[340px]">
          <div className="p-2">
            {STATUS_GROUPS.map((g) => (
              <div key={g.key} className="mb-2">
                <div className="flex items-center justify-between px-1 py-1">
                  <span className="text-[11px] font-medium uppercase text-muted-foreground">{g.label}</span>
                  <button
                    className="text-[11px] text-primary hover:underline"
                    onClick={() => onChange([...new Set([...value, ...g.statuses])])}
                  >
                    all
                  </button>
                </div>
                {g.statuses.map((s) => {
                  const b = statusBadge(s);
                  const on = value.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() => toggle(s)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
                        on && "bg-muted",
                      )}
                    >
                      <span className={cn("flex h-4 w-4 items-center justify-center rounded border", on && "bg-primary text-primary-foreground border-primary")}>
                        {on && <Check className="h-3 w-3" />}
                      </span>
                      <span className="truncate">{b.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </ScrollArea>
        <Separator />
        <div className="flex justify-between p-2">
          <Button variant="ghost" size="sm" onClick={() => onChange([])}>Clear</Button>
          <Button size="sm" onClick={() => setOpen(false)}>Done</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function DashboardFilterBar({
  state,
  onChange,
  onReset,
  confirmers,
  extra,
}: {
  state: DashboardFilterState;
  onChange: (patch: Partial<DashboardFilterState>) => void;
  onReset: () => void;
  confirmers: { user_id: string; name: string }[];
  extra?: React.ReactNode;
}) {
  const [tagDraft, setTagDraft] = useState("");
  const [more, setMore] = useState(false);

  const activeCount =
    state.statuses.length +
    state.tags.length +
    [state.paymentStatus, state.source, state.courier, state.confirmedBy, state.city, state.minAmount, state.maxAmount, state.search]
      .filter(Boolean).length;

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker value={state.range} onChange={(r) => onChange({ range: r })} />
        <MultiStatus value={state.statuses} onChange={(v) => onChange({ statuses: v })} />

        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={state.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder="Invoice, phone, name, consignment, TrxID…"
            className="h-9 pl-8"
          />
        </div>

        <Button variant={more ? "secondary" : "outline"} size="sm" className="h-9 gap-1.5" onClick={() => setMore((v) => !v)}>
          <Filter className="h-3.5 w-3.5" />
          Filters
          {activeCount > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5">{activeCount}</Badge>}
        </Button>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="h-9 gap-1.5" onClick={onReset}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
        )}
        {extra}
      </div>

      {more && (
        <div className="grid gap-2 border-t pt-2 md:grid-cols-3 xl:grid-cols-6">
          <Select value={state.paymentStatus || "all"} onValueChange={(v) => onChange({ paymentStatus: v === "all" ? "" : v })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Payment" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All payments</SelectItem>
              {PAYMENT_STATUSES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={state.source || "all"} onValueChange={(v) => onChange({ source: v === "all" ? "" : v })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={state.courier || "all"} onValueChange={(v) => onChange({ courier: v === "all" ? "" : v })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Courier" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All couriers</SelectItem>
              {COURIERS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={state.confirmedBy || "all"} onValueChange={(v) => onChange({ confirmedBy: v === "all" ? "" : v })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Confirmed by" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any staff</SelectItem>
              {confirmers.map((c) => <SelectItem key={c.user_id} value={c.user_id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Input
            className="h-9"
            placeholder="City"
            value={state.city}
            onChange={(e) => onChange({ city: e.target.value })}
          />

          <div className="flex items-center gap-1">
            <Input
              className="h-9"
              placeholder="Min ৳"
              inputMode="numeric"
              value={state.minAmount}
              onChange={(e) => onChange({ minAmount: e.target.value.replace(/[^\d]/g, "") })}
            />
            <Input
              className="h-9"
              placeholder="Max ৳"
              inputMode="numeric"
              value={state.maxAmount}
              onChange={(e) => onChange({ maxAmount: e.target.value.replace(/[^\d]/g, "") })}
            />
          </div>

          <div className="md:col-span-3 xl:col-span-6">
            <div className="flex flex-wrap items-center gap-1.5">
              {state.tags.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1">
                  {t}
                  <button onClick={() => onChange({ tags: state.tags.filter((x) => x !== t) })}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <Input
                className="h-8 w-[180px]"
                placeholder="Add tag + Enter"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagDraft.trim()) {
                    onChange({ tags: [...new Set([...state.tags, tagDraft.trim()])] });
                    setTagDraft("");
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

      {state.statuses.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {state.statuses.map((s) => (
            <Badge key={s} variant="outline" className={cn("gap-1", statusBadge(s).className)}>
              {statusBadge(s).label}
              <button onClick={() => onChange({ statuses: state.statuses.filter((x) => x !== s) })}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export const ALL_ORDER_STATUSES = ORDER_STATUSES;