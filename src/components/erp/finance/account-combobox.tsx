import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Landmark, Wallet, Banknote, CreditCard, Search, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ComboAccount = {
  id: string;
  name: string;
  account_type?: string | null;
  account_subtype?: string | null;
  current_balance?: number | string | null;
  brand_id?: string | null;
};

type Props = {
  accounts: ComboAccount[];
  value: string;
  onChange: (id: string) => void;
  /** Amount needed — accounts below this are flagged (not blocked). */
  requiredAmount?: number;
  brandNames?: Record<string, string>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(Math.round(n));

function typeIcon(t?: string | null) {
  const k = (t ?? "").toLowerCase();
  if (k.includes("bank")) return Landmark;
  if (k.includes("cash")) return Banknote;
  if (k.includes("card")) return CreditCard;
  return Wallet;
}

const TYPE_TONE: Record<string, string> = {
  bank: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  cash: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  bkash: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  nagad: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  card: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
};
const toneFor = (t?: string | null) => TYPE_TONE[(t ?? "other").toLowerCase()] ?? "bg-muted text-muted-foreground";
const displayType = (account: ComboAccount) => account.account_subtype ?? account.account_type ?? "other";

export function AccountCombobox({
  accounts,
  value,
  onChange,
  requiredAmount = 0,
  brandNames,
  placeholder = "Select account",
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const selected = accounts.find((a) => a.id === value);

  // Names that repeat need extra context (brand / type) so the user can tell them apart.
  const dupNames = useMemo(() => {
    const seen = new Map<string, number>();
    accounts.forEach((a) => seen.set(a.name.toLowerCase(), (seen.get(a.name.toLowerCase()) ?? 0) + 1));
    return seen;
  }, [accounts]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = accounts.filter((a) => {
      if (!needle) return true;
      return (
        a.name.toLowerCase().includes(needle) ||
        displayType(a).toLowerCase().includes(needle) ||
        (brandNames?.[a.brand_id ?? ""] ?? "").toLowerCase().includes(needle)
      );
    });
    const map = new Map<string, ComboAccount[]>();
    filtered.forEach((a) => {
      const k = displayType(a).toLowerCase();
      if (!map.has(k)) map.set(k, []);
      const list = map.get(k);
      if (list) list.push(a);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [accounts, q, brandNames]);

  const total = groups.reduce((s, [, list]) => s + list.length, 0);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQ("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn("w-full justify-between h-11 font-normal px-3", className)}
        >
          {selected ? (
            <span className="flex items-center gap-2.5 min-w-0">
              <SelectedIcon type={displayType(selected)} />
              <span className="flex flex-col items-start min-w-0 leading-tight">
                <span className="text-sm font-semibold truncate max-w-[220px]">{selected.name}</span>
                <span className="text-[11px] text-muted-foreground truncate max-w-[220px]">
                  {displayType(selected).toLowerCase()}
                  {brandNames?.[selected.brand_id ?? ""] ? ` · ${brandNames[selected.brand_id ?? ""]}` : selected.brand_id ? "" : " · shared"}
                </span>
              </span>
              <span
                className={cn(
                  "ml-2 text-xs font-semibold tabular-nums whitespace-nowrap",
                  Number(selected.current_balance ?? 0) < requiredAmount ? "text-amber-600" : "text-emerald-600",
                )}
              >
                ৳{fmt(Number(selected.current_balance ?? 0))}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground text-sm">{placeholder}</span>
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[320px]" align="start">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, type, brand…"
              className="h-9 pl-8 text-sm"
            />
          </div>
        </div>

        <div className="max-h-[320px] overflow-y-auto py-1">
          {total === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">No matching account</div>
          )}
          {groups.map(([type, list]) => (
            <div key={type}>
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {type} <span className="opacity-60">({list.length})</span>
              </div>
              {list.map((a) => {
                const accountType = displayType(a);
                const Icon = typeIcon(accountType);
                const bal = Number(a.current_balance ?? 0);
                const short = requiredAmount > 0 && bal < requiredAmount;
                const isDup = (dupNames.get(a.name.toLowerCase()) ?? 0) > 1;
                const brand = brandNames?.[a.brand_id ?? ""];
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      onChange(a.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 py-2 text-left rounded-md transition-colors",
                      "hover:bg-accent focus:bg-accent focus:outline-none",
                      value === a.id && "bg-primary/10",
                    )}
                  >
                    <span className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", toneFor(accountType))}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold truncate">{a.name}</span>
                        {isDup && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 font-semibold uppercase shrink-0">
                            same name
                          </span>
                        )}
                      </span>
                      <span className="block text-[11px] text-muted-foreground truncate">
                        {accountType.toLowerCase()}
                        {brand ? ` · ${brand}` : !a.brand_id ? " · shared" : ""}
                      </span>
                    </span>
                    <span className="text-right shrink-0">
                      <span
                        className={cn(
                          "block text-sm font-semibold tabular-nums",
                          bal < 0 ? "text-rose-600" : short ? "text-amber-600" : "text-foreground",
                        )}
                      >
                        ৳{fmt(bal)}
                      </span>
                      {short && (
                        <span className="flex items-center justify-end gap-0.5 text-[10px] text-amber-600 font-medium">
                          <AlertTriangle className="h-2.5 w-2.5" /> short
                        </span>
                      )}
                    </span>
                    {value === a.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {requiredAmount > 0 && (
          <div className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
            Needed: <span className="font-semibold tabular-nums text-foreground">৳{fmt(requiredAmount)}</span> — amber
            mane balance kom.
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function SelectedIcon({ type }: { type?: string | null }) {
  const Icon = typeIcon(type);
  return (
    <span className={cn("h-7 w-7 rounded-lg flex items-center justify-center shrink-0", toneFor(type))}>
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}
