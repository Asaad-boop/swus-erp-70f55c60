import { useState } from "react";
import { CheckCircle2, X, Printer, Truck, Tag as TagIcon, RefreshCcw, Plus, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type WebStatusKey =
  | "processing"
  | "good_but_no_response"
  | "no_response"
  | "advance_payment"
  | "on_hold"
  | "complete"
  | "cancelled";

const STATUS_OPTIONS: { key: WebStatusKey; label: string; dot: string }[] = [
  { key: "processing", label: "Processing", dot: "bg-blue-500" },
  { key: "good_but_no_response", label: "Good But No Response", dot: "bg-amber-500" },
  { key: "no_response", label: "No Response", dot: "bg-red-500" },
  { key: "advance_payment", label: "Advance Payment", dot: "bg-purple-500" },
  { key: "on_hold", label: "On Hold", dot: "bg-yellow-500" },
  { key: "complete", label: "Confirm Order", dot: "bg-emerald-500" },
  { key: "cancelled", label: "Cancel", dot: "bg-zinc-500" },
];

type Props = {
  count: number;
  onClear: () => void;
  onStatus: (s: WebStatusKey) => void;
  onPrintInvoices: () => void;
  onBookCourier: () => void;
  onAddTag: (tag: string) => void;
  onPreorder: () => void;
  isPending?: boolean;
};

export function WebBulkActionBar({ count, onClear, onStatus, onPrintInvoices, onBookCourier, onAddTag, onPreorder, isPending }: Props) {
  const [tagInput, setTagInput] = useState("");
  const [tagOpen, setTagOpen] = useState(false);
  if (count === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5">
      <div className="flex items-center gap-1 rounded-full border border-border bg-card shadow-2xl shadow-black/20 px-2 py-1.5 backdrop-blur">
        <div className="inline-flex items-center gap-1.5 pl-2 pr-3 text-xs font-semibold text-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span className="tabular-nums">{count}</span> selected
        </div>
        <span className="h-5 w-px bg-border" />

        {/* Change status */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" disabled={isPending}>
              <RefreshCcw className="h-3.5 w-3.5" /> Change Status
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="w-56">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Set status to…</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {STATUS_OPTIONS.map((s) => (
              <DropdownMenuItem key={s.key} onClick={() => onStatus(s.key)} className="gap-2">
                <span className={cn("h-2 w-2 rounded-full", s.dot)} />
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={onPrintInvoices}>
          <Printer className="h-3.5 w-3.5" /> Print Invoices
        </Button>

        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={onBookCourier}>
          <Truck className="h-3.5 w-3.5" /> Book Courier
        </Button>

        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-indigo-600" onClick={onPreorder}>
          <CalendarClock className="h-3.5 w-3.5" /> Pre-order
        </Button>

        <Popover open={tagOpen} onOpenChange={setTagOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs">
              <TagIcon className="h-3.5 w-3.5" /> Add Tag
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" className="w-64 p-3" align="center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Add tag to {count}</div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const v = tagInput.trim();
                if (!v) return;
                onAddTag(v);
                setTagInput("");
                setTagOpen(false);
              }}
              className="flex gap-1.5"
            >
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="e.g. priority"
                className="h-8 text-xs"
                autoFocus
              />
              <Button size="sm" type="submit" className="h-8 px-2">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </form>
          </PopoverContent>
        </Popover>

        <span className="h-5 w-px bg-border" />
        <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={onClear}>
          <X className="h-3.5 w-3.5" /> Clear
        </Button>
      </div>
    </div>
  );
}