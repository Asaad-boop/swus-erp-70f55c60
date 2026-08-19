import { useState } from "react";
import { SlidersHorizontal, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COURIER_BUCKETS, COURIER_BUCKET_META, type CourierBucket } from "@/hooks/erp/use-courier-shipments";
import { useStaffList, type OrdersFilter } from "@/hooks/erp/use-orders-query";
import { cn } from "@/lib/utils";

const COURIERS = ["pathao", "steadfast", "redx", "paperfly", "sundarban"];
const PAYMENT_METHODS = ["cod", "bkash", "nagad", "rocket", "card", "bank"];
const PAYMENT_STATUSES = ["unpaid", "partial", "paid", "refunded"];

export type AdvancedFilterPatch = Partial<OrdersFilter>;

export function OrdersFilterPanel({
  filter, onChange, activeCount,
}: {
  filter: OrdersFilter;
  onChange: (patch: AdvancedFilterPatch) => void;
  activeCount: number;
}) {
  const [open, setOpen] = useState(false);
  const { data: staff = [] } = useStaffList();

  const clear = () =>
    onChange({
      courier: null, courierBucket: null, paymentMethod: null, paymentStatus: null,
      city: null, assignee: null, amountMin: null, amountMax: null, advanceFilter: "any",
    });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={activeCount > 0 ? "default" : "outline"}
          size="sm"
          className={cn("h-9 gap-1.5", activeCount > 0 && "shadow-sm")}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
          {activeCount > 0 && (
            <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-background/25 px-1 text-[10px] font-bold tabular-nums">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[420px] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Advanced filters</div>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-[11px]" onClick={clear}>
            <RotateCcw className="h-3 w-3" /> Reset
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Courier">
            <Select value={filter.courier ?? "all"} onValueChange={(v) => onChange({ courier: v === "all" ? null : v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any courier</SelectItem>
                {COURIERS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Live courier status">
            <Select
              value={filter.courierBucket ?? "all"}
              onValueChange={(v) => onChange({ courierBucket: v === "all" ? null : (v as CourierBucket) })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                {COURIER_BUCKETS.map((b) => (
                  <SelectItem key={b} value={b}>{COURIER_BUCKET_META[b].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Payment method">
            <Select value={filter.paymentMethod ?? "all"} onValueChange={(v) => onChange({ paymentMethod: v === "all" ? null : v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any method</SelectItem>
                {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m} className="uppercase">{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Payment status">
            <Select value={filter.paymentStatus ?? "all"} onValueChange={(v) => onChange({ paymentStatus: v === "all" ? null : v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                {PAYMENT_STATUSES.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="City / area">
            <Input
              value={filter.city ?? ""}
              onChange={(e) => onChange({ city: e.target.value || null })}
              placeholder="e.g. Dhaka"
              className="h-8 text-xs"
            />
          </Field>

          <Field label="Assigned to">
            <Select value={filter.assignee ?? "all"} onValueChange={(v) => onChange({ assignee: v === "all" ? null : v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Anyone</SelectItem>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.display_name ?? s.id.slice(0, 8)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Min amount (৳)">
            <Input
              type="number" inputMode="numeric"
              value={filter.amountMin ?? ""}
              onChange={(e) => onChange({ amountMin: e.target.value === "" ? null : Number(e.target.value) })}
              className="h-8 text-xs"
            />
          </Field>

          <Field label="Max amount (৳)">
            <Input
              type="number" inputMode="numeric"
              value={filter.amountMax ?? ""}
              onChange={(e) => onChange({ amountMax: e.target.value === "" ? null : Number(e.target.value) })}
              className="h-8 text-xs"
            />
          </Field>

          <Field label="Advance payment" className="col-span-2">
            <div className="inline-flex rounded-md border overflow-hidden">
              {(["any", "with", "without"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onChange({ advanceFilter: v })}
                  className={cn(
                    "h-8 px-3 text-xs font-medium capitalize transition-colors border-r last:border-r-0",
                    (filter.advanceFilter ?? "any") === v
                      ? "bg-foreground text-background"
                      : "bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v === "any" ? "Any" : v === "with" ? "Has advance" : "No advance"}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="flex justify-end mt-4">
          <Button size="sm" className="h-8" onClick={() => setOpen(false)}>Done</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
