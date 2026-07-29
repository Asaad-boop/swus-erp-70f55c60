import { useEffect, useRef, useState } from "react";
import { CheckCheck, Printer, Sticker, ClipboardList, FileSpreadsheet, Truck, RefreshCw, Download, Copy, X, Loader2, ChevronDown, Phone, Zap, Search, PackageCheck, CalendarClock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STATUS_GROUPS, statusAccent, statusBadge, type OrderStatus } from "@/lib/erp/orders";

type Props = {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onStatus: (s: OrderStatus) => void;
  onExport: () => void;
  onSendToPathao: () => void;
  onSyncCourier: () => void;
  onPhoneHistory: () => void;
  onPreorder: () => void;
  onPrint: (mode: "invoice" | "sticker" | "picking" | "sheet") => void;
  isPending: boolean;
};

export function OrdersBulkActions({ selectedCount, totalCount, onSelectAll, onClear, onStatus, onExport, onSendToPathao, onSyncCourier, onPhoneHistory, onPreorder, onPrint, isPending }: Props) {
  const disabled = selectedCount === 0;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const prevCountRef = useRef(0);

  // Auto-open only on the 0 -> >0 transition (first selection).
  // Auto-close only on >0 -> 0 transition (all cleared).
  // Otherwise respect user's manual open/close.
  useEffect(() => {
    const prev = prevCountRef.current;
    if (prev === 0 && selectedCount > 0) setOpen(true);
    else if (prev > 0 && selectedCount === 0) setOpen(false);
    prevCountRef.current = selectedCount;
  }, [selectedCount]);

  const query = q.trim().toLowerCase();
  const matchStatus = (label: string) => !query || label.toLowerCase().includes(query);

  return (
    <div className="flex items-center gap-1">
      <InlineQuickBtn icon={PackageCheck} label="Delivered" color="#059669" onClick={() => onStatus("delivered")} disabled={disabled} />
      <InlineQuickBtn icon={CheckCheck} label="RTS" color="#16a34a" onClick={() => onStatus("ready_to_ship")} disabled={disabled} />
      <InlineQuickBtn icon={X} label="Cancel" color="#dc2626" onClick={() => onStatus("cancelled")} disabled={disabled} />
      <InlineQuickBtn icon={RefreshCw} label="Sync" color="#0284c7" onClick={onSyncCourier} disabled={disabled} />
      <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <Zap className="h-3.5 w-3.5" />
          <span className="font-semibold">More</span>
          {selectedCount > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold tabular-nums">
              {selectedCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[340px] p-0 overflow-hidden rounded-xl shadow-2xl border-border/60 max-h-[min(85vh,680px)] flex flex-col"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="relative px-3.5 py-2.5 border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`h-6 w-6 rounded-md grid place-items-center shrink-0 ${selectedCount > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {selectedCount > 0 ? <CheckCheck className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold leading-tight truncate">
                  {selectedCount > 0 ? `${selectedCount} order${selectedCount > 1 ? "s" : ""} selected` : "Quick Actions"}
                </div>
                <div className="text-[10px] text-muted-foreground leading-tight">
                  {selectedCount > 0 ? `of ${totalCount} total` : "Select orders to enable"}
                </div>
              </div>
            </div>
            {selectedCount > 0 ? (
              <button type="button" onClick={() => { onClear(); setOpen(false); }} className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <X className="h-3 w-3" /> Clear
              </button>
            ) : (
              <button type="button" onClick={onSelectAll} className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-medium text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors" disabled={!totalCount}>
                <CheckCheck className="h-3 w-3" /> All
              </button>
            )}
          </div>
        </div>

        {isPending && (
          <div className="flex items-center gap-2 px-3.5 py-1.5 text-[11px] font-medium text-primary border-b bg-primary/5">
            <Loader2 className="h-3 w-3 animate-spin" /> Updating orders…
          </div>
        )}

        {/* Search */}
        <div className="px-3 pt-2.5 pb-1.5 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search action or status…"
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {/* 1. Quick Status — daily-flow, most frequent */}
          <Section label="Quick Status" hint="One-tap common transitions">
            <div className="grid grid-cols-3 gap-1">
              <QuickStatusTile color="#16a34a" icon={CheckCheck} label="RTS" onClick={() => onStatus("ready_to_ship")} disabled={disabled} />
              <QuickStatusTile color="#0284c7" icon={Truck} label="Shipped" onClick={() => onStatus("shipped")} disabled={disabled} />
              <QuickStatusTile color="#dc2626" icon={X} label="Cancel" onClick={() => onStatus("cancelled")} disabled={disabled} />
            </div>
          </Section>

          {/* 2. Courier — happens right after RTS */}
          <Section label="Courier">
            <div className="grid grid-cols-2 gap-1 mb-1">
              <IconTile icon={Truck} label="Send Pathao" tone="rose" onClick={onSendToPathao} disabled={disabled} />
              <IconTile icon={RefreshCw} label="Sync Status" tone="blue" onClick={onSyncCourier} disabled={disabled} />
            </div>
            <ActionRow icon={Phone} label="Match by Phone (History)" onClick={onPhoneHistory} disabled={disabled} />
          </Section>

          {/* Pre-order */}
          <Section label="Pre-order" hint="Stock nei — promise date diye rakho">
            <ActionRow icon={CalendarClock} label="Move to Pre-order" onClick={onPreorder} disabled={disabled} />
          </Section>

          {/* 3. Print — after courier booked */}
          <Section label="Print">
            <div className="grid grid-cols-4 gap-1">
              <IconTile icon={Printer} label="Invoice" tone="blue" onClick={() => onPrint("invoice")} disabled={disabled} />
              <IconTile icon={Sticker} label="Sticker" tone="violet" onClick={() => onPrint("sticker")} disabled={disabled} />
              <IconTile icon={ClipboardList} label="Picking" tone="amber" onClick={() => onPrint("picking")} disabled={disabled} />
              <IconTile icon={FileSpreadsheet} label="Sheet" tone="emerald" onClick={() => onPrint("sheet")} disabled={disabled} />
            </div>
          </Section>

          {/* 4. Detailed status — less frequent, collapsible */}
          <Section label="More Status Options">
            {STATUS_GROUPS.map((g) => (
              <StatusGroupCollapsible
                key={g.key}
                label={g.label}
                statuses={g.statuses}
                onStatus={onStatus}
                disabled={disabled}
                matchStatus={matchStatus}
                forceOpen={!!query}
              />
            ))}
          </Section>

          {/* 5. Export — rarely used */}
          <Section label="Export">
            <div className="grid grid-cols-2 gap-1">
              <IconTile icon={Download} label="Excel" tone="emerald" onClick={onExport} />
              <IconTile icon={Copy} label="Duplicates" tone="slate" disabled />
            </div>
          </Section>
        </div>
      </PopoverContent>
      </Popover>
    </div>
  );
}

function Section({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="px-2.5 py-2 border-b last:border-b-0">
      <div className="px-1 pb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/80">{label}</span>
        {hint && <span className="text-[9.5px] text-muted-foreground/60 truncate">{hint}</span>}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function InlineQuickBtn({
  icon: Icon, label, color, onClick, disabled,
}: { icon: React.ElementType; label: string; color: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Select orders first" : label}
      className="hidden md:inline-flex items-center gap-1.5 h-9 px-2.5 rounded-md border bg-card text-[12px] font-semibold transition-all hover:shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ borderColor: `${color}40`, color }}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  );
}

function ActionRow({ icon: Icon, label, onClick, disabled, tone }: { icon: React.ElementType; label: string; onClick?: () => void; disabled?: boolean; tone?: "destructive" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2.5 px-2 h-8 rounded-md text-[13px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        tone === "destructive" ? "text-destructive hover:bg-destructive/10" : "hover:bg-muted text-foreground/90"
      }`}
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}

const TONE_MAP: Record<string, string> = {
  blue: "text-blue-600 dark:text-blue-400 bg-blue-500/10 group-hover:bg-blue-500/20",
  violet: "text-violet-600 dark:text-violet-400 bg-violet-500/10 group-hover:bg-violet-500/20",
  amber: "text-amber-600 dark:text-amber-400 bg-amber-500/10 group-hover:bg-amber-500/20",
  emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 group-hover:bg-emerald-500/20",
  slate: "text-slate-600 dark:text-slate-400 bg-slate-500/10 group-hover:bg-slate-500/20",
  rose: "text-rose-600 dark:text-rose-400 bg-rose-500/10 group-hover:bg-rose-500/20",
};

function IconTile({ icon: Icon, label, onClick, disabled, tone = "slate" }: { icon: React.ElementType; label: string; onClick?: () => void; disabled?: boolean; tone?: keyof typeof TONE_MAP }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex flex-col items-center justify-center gap-1 py-2 rounded-lg border bg-card hover:border-primary/40 hover:shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:shadow-none"
    >
      <span className={`h-7 w-7 rounded-md grid place-items-center transition-colors ${TONE_MAP[tone]}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="text-[10.5px] font-semibold text-foreground/80">{label}</span>
    </button>
  );
}

function QuickStatusTile({ icon: Icon, label, onClick, disabled, color }: { icon: React.ElementType; label: string; onClick?: () => void; disabled?: boolean; color: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 px-2.5 h-9 rounded-md border bg-card text-[12px] font-semibold hover:shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ borderColor: `${color}33` }}
    >
      <span className="h-6 w-6 rounded-md grid place-items-center" style={{ backgroundColor: `${color}1a`, color }}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="flex-1 text-left text-foreground/90">{label}</span>
    </button>
  );
}

function StatusGroupCollapsible({
  label,
  statuses,
  onStatus,
  disabled,
  matchStatus,
  forceOpen,
}: {
  label: string;
  statuses: OrderStatus[];
  onStatus: (s: OrderStatus) => void;
  disabled: boolean;
  matchStatus: (label: string) => boolean;
  forceOpen: boolean;
}) {
  const [open, setOpen] = useState(label === "Fulfillment");
  const visible = statuses.filter((s) => matchStatus(statusBadge(s).label));
  if (forceOpen && visible.length === 0) return null;
  const isOpen = forceOpen ? true : open;
  return (
    <div className="rounded-md border bg-card/40 overflow-hidden mb-1 last:mb-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={forceOpen}
        className="w-full flex items-center justify-between px-2.5 h-8 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-muted/60 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          {label}
          <span className="text-[9px] font-medium text-muted-foreground/60 normal-case tracking-normal">({visible.length})</span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && visible.length > 0 && (
        <div className="p-1 space-y-0.5 bg-background/40">
          {visible.map((s) => {
            const b = statusBadge(s);
            return (
              <button
                type="button"
                key={s}
                onClick={() => onStatus(s)}
                disabled={disabled}
                className="w-full flex items-center gap-2.5 px-2 h-8 rounded text-[13px] font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors group"
              >
                <span className="h-2 w-2 rounded-full shrink-0 ring-2 ring-transparent group-hover:ring-offset-1" style={{ backgroundColor: statusAccent(s) }} />
                <span className="flex-1 text-left text-foreground/90">{b.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}