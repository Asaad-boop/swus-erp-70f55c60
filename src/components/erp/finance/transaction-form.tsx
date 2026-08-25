import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownCircle, ArrowRightLeft, ArrowUpCircle, Banknote, Building2, Landmark, Settings2, Smartphone, Wallet as WalletIcon, ChevronsUpDown, Check, Plus, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { fmtBdt, type Account, type Category, type TxnType } from "@/lib/erp/finance";
import type { Brand } from "@/contexts/brand-context";

type Props = {
  open: boolean;
  onClose: () => void;
  brandId: string | null;
  accounts: Account[];
  categories: Category[];
  defaultType?: TxnType;
  defaultAccountId?: string | null;
  // When brandId is null and brands.length > 1, dialog shows a Brand picker.
  brands?: Brand[];
};

const TYPE_META: Record<TxnType, { label: string; bnLabel: string; icon: typeof ArrowDownCircle; tone: string; ring: string; bg: string; fg: string; verb: string }> = {
  expense:    { label: "Expense",    bnLabel: "Khoroch",   icon: ArrowUpCircle,   tone: "rose",    ring: "ring-rose-500/40 border-rose-500/50",        bg: "bg-rose-500/10",    fg: "text-rose-600 dark:text-rose-400",       verb: "Save expense" },
  income:     { label: "Income",     bnLabel: "Aay",       icon: ArrowDownCircle, tone: "emerald", ring: "ring-emerald-500/40 border-emerald-500/50",  bg: "bg-emerald-500/10", fg: "text-emerald-600 dark:text-emerald-400", verb: "Save income" },
  transfer:   { label: "Transfer",   bnLabel: "Transfer",  icon: ArrowRightLeft,  tone: "sky",     ring: "ring-sky-500/40 border-sky-500/50",          bg: "bg-sky-500/10",     fg: "text-sky-600 dark:text-sky-400",         verb: "Save transfer" },
  adjustment: { label: "Adjustment", bnLabel: "Adjust",    icon: Settings2,       tone: "amber",   ring: "ring-amber-500/40 border-amber-500/50",      bg: "bg-amber-500/10",   fg: "text-amber-600 dark:text-amber-400",     verb: "Save adjustment" },
};

function accountIcon(t: string) {
  const s = t.toLowerCase();
  if (s === "bank") return Landmark;
  if (s === "cash") return Banknote;
  if (s === "bkash" || s === "nagad" || s === "rocket") return Smartphone;
  if (s === "courier") return Building2;
  return WalletIcon;
}

function todayIso() { return new Date().toISOString().slice(0, 10); }
function yesterdayIso() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }

export function TransactionForm({ open, onClose, brandId, accounts, categories, defaultType = "income", defaultAccountId = null, brands = [] }: Props) {
  const qc = useQueryClient();
  const [type, setType] = useState<TxnType>(defaultType);
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [date, setDate] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [pickedBrandId, setPickedBrandId] = useState<string>("");

  const showBrandPicker = !brandId && brands.length > 1;
  const effectiveBrandId = brandId ?? pickedBrandId ?? null;

  useEffect(() => {
    if (open) {
      setPickedBrandId(brandId ?? (brands.length === 1 ? brands[0].id : ""));
    }
  }, [open, brandId, brands]);

  // When in All-Brands mode, after picking a brand, narrow accounts/categories.
  const scopedAccounts = useMemo(
    () => (effectiveBrandId ? accounts.filter((a) => a.brand_id === effectiveBrandId || a.brand_id === null) : []),
    [accounts, effectiveBrandId],
  );
  const scopedCategories = useMemo(
    () => (effectiveBrandId ? categories.filter((c) => c.brand_id === effectiveBrandId) : []),
    [categories, effectiveBrandId],
  );

  // Reset account/category when brand changes so we don't keep an out-of-scope id.
  useEffect(() => {
    setAccountId(""); setToAccountId(""); setCategoryId("");
  }, [effectiveBrandId]);

  // When dialog opens, reset type to caller's default
  useEffect(() => {
    if (open) {
      setType(defaultType);
      if (defaultAccountId) setAccountId(defaultAccountId);
    }
  }, [open, defaultType, defaultAccountId]);

  const reset = () => {
    setAmount(""); setAccountId(""); setToAccountId(""); setCategoryId("");
    setDescription(""); setDate(todayIso());
  };

  const filteredCats = scopedCategories.filter((c) =>
    type === "income" ? c.kind === "income" : type === "expense" ? c.kind === "expense" : true,
  );

  const mut = useMutation({
    mutationFn: async () => {
      if (!effectiveBrandId) throw new Error("Select a brand");
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("Amount must be > 0");
      if (type !== "transfer" && !accountId) throw new Error("Account is required");
      if ((type === "expense" || type === "income") && !categoryId) {
        throw new Error(`Category is required for ${type}`);
      }
      if (type === "transfer" && (!accountId || !toAccountId || accountId === toAccountId)) {
        throw new Error("Pick two different accounts for transfer");
      }
      // Block negative balance for expense/transfer
      const src = scopedAccounts.find((a) => a.id === accountId);
      if ((type === "expense" || type === "transfer") && src && amt > Number(src.current_balance)) {
        throw new Error(`Insufficient balance in ${src.name}. Available ${fmtBdt(src.current_balance)}`);
      }
      const payload = {
        brand_id: effectiveBrandId,
        txn_type: type,
        amount: amt,
        account_id: accountId || null,
        to_account_id: type === "transfer" ? toAccountId : null,
        category_id: type === "transfer" || type === "adjustment" ? null : (categoryId || null),
        transaction_date: date,
        description: description || null,
      };
      const { error } = await supabase.from("erp_transactions").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transaction saved");
      qc.invalidateQueries({ queryKey: ["erp_transactions"] });
      qc.invalidateQueries({ queryKey: ["erp_accounts"] });
      qc.invalidateQueries({ queryKey: ["erp_pnl"] });
      reset();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const meta = TYPE_META[type];
  const Icon = meta.icon;
  const selectedFrom = scopedAccounts.find((a) => a.id === accountId);
  const selectedTo = scopedAccounts.find((a) => a.id === toAccountId);
  const FromIcon = selectedFrom ? accountIcon(selectedFrom.account_type) : WalletIcon;
  const ToIcon = selectedTo ? accountIcon(selectedTo.account_type) : WalletIcon;

  const amountPlaceholder = type === "expense" ? "Koto khoroch holo?" : type === "income" ? "Koto ashlo?" : type === "transfer" ? "Koto transfer?" : "Adjustment amount";
  const descPlaceholder = type === "expense" ? "e.g. Office er jonno notun desk" : type === "income" ? "e.g. Customer payment / wallet refund" : type === "transfer" ? "e.g. bKash theke Bank e shift" : "e.g. Cash count mismatch reconcile";

  const amt = Number(amount) || 0;
  const insufficient = (type === "expense" || type === "transfer") && selectedFrom && amt > 0 && amt > Number(selectedFrom.current_balance);
  const handleSave = () => {
    if (insufficient && selectedFrom) {
      toast.error("Insufficient balance", {
        description: `${selectedFrom.name} e ache ${fmtBdt(selectedFrom.current_balance)} · short by ${fmtBdt(amt - Number(selectedFrom.current_balance))}`,
      });
      return;
    }
    mut.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-md", meta.bg, meta.fg)}>
              <Icon className="h-4 w-4" />
            </span>
            New {meta.label}
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 space-y-5 text-sm max-h-[70vh] overflow-y-auto">
          {/* Type segmented control */}
          <div className="grid grid-cols-4 gap-1.5">
            {(["expense", "income", "transfer", "adjustment"] as TxnType[]).map((t) => {
              const m = TYPE_META[t];
              const TIcon = m.icon;
              const active = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-lg border bg-card px-2 py-2.5 text-xs font-medium transition-all",
                    active ? cn("ring-2", m.ring, m.bg, m.fg) : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <TIcon className="h-4 w-4" />
                  {m.label}
                </button>
              );
            })}
          </div>

          {showBrandPicker && (
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Brand</Label>
              <Select value={pickedBrandId} onValueChange={setPickedBrandId}>
                <SelectTrigger><SelectValue placeholder="Choose brand" /></SelectTrigger>
                <SelectContent>
                  {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Hero amount + date */}
          <div className={cn("rounded-xl border p-4", meta.bg)}>
            <Label htmlFor="txn-amount" className="text-[11px] uppercase tracking-wider text-muted-foreground">Amount</Label>
            <div className="mt-1.5 relative">
              <span className={cn("absolute left-3 top-1/2 -translate-y-1/2 text-2xl font-semibold pointer-events-none", meta.fg)}>৳</span>
              <Input
                id="txn-amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                placeholder="0"
                className={cn(
                  "h-14 w-full rounded-lg border bg-background pl-10 pr-3 text-2xl font-semibold tracking-tight shadow-sm focus-visible:ring-2",
                  meta.fg,
                )}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{amountPlaceholder}</p>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {[100, 500, 1000, 5000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmount(String((Number(amount) || 0) + v))}
                  className="rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium hover:bg-muted transition-colors"
                >
                  +{v.toLocaleString()}
                </button>
              ))}
              {amount && (
                <button type="button" onClick={() => setAmount("")}
                  className="rounded-full border bg-background px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted transition-colors">
                  Clear
                </button>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-3">
              <button type="button" onClick={() => setDate(todayIso())}
                className={cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors", date === todayIso() ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted")}>
                Today
              </button>
              <button type="button" onClick={() => setDate(yesterdayIso())}
                className={cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors", date === yesterdayIso() ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted")}>
                Yesterday
              </button>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-7 w-auto bg-background text-xs" />
            </div>
          </div>

          {/* Account picker(s) */}
          {type === "transfer" ? (
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <AccountCombo label="From wallet" value={accountId} onChange={setAccountId} accounts={scopedAccounts} disabled={!effectiveBrandId} />
              <div className="pb-2 text-muted-foreground"><ArrowRightLeft className="h-4 w-4" /></div>
              <AccountCombo label="To wallet" value={toAccountId} onChange={setToAccountId} accounts={scopedAccounts.filter((a) => a.id !== accountId)} disabled={!effectiveBrandId} />
            </div>
          ) : (
            <AccountCombo label={type === "expense" ? "Pay from" : type === "income" ? "Receive in" : "Account"} value={accountId} onChange={setAccountId} accounts={scopedAccounts} disabled={!effectiveBrandId} />
          )}
          {effectiveBrandId && scopedAccounts.length === 0 && (
            <p className="text-xs text-muted-foreground -mt-2">No account/wallet in this brand yet. Add one from Finance → Accounts first.</p>
          )}

          {/* Transfer preview */}
          {type === "transfer" && selectedFrom && selectedTo && (
            <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
              <div className="flex items-center gap-2"><FromIcon className="h-3.5 w-3.5 text-muted-foreground" /><span className="font-medium">{selectedFrom.name}</span></div>
              <ArrowRightLeft className="h-3.5 w-3.5 text-sky-500" />
              <div className="flex items-center gap-2"><span className="font-medium">{selectedTo.name}</span><ToIcon className="h-3.5 w-3.5 text-muted-foreground" /></div>
            </div>
          )}

          {/* Category (income/expense only) */}
          {(type === "income" || type === "expense") && (
            <CategoryPicker
              value={categoryId}
              onChange={setCategoryId}
              categories={filteredCats}
              brandId={effectiveBrandId}
              kind={type as "income" | "expense"}
              meta={meta}
              qc={qc}
            />
          )}
          {(type === "income" || type === "expense") && !categoryId && (
            <p className="-mt-2 text-xs text-amber-700 dark:text-amber-400">
              Category is required so this transaction is classified correctly in P&amp;L.
            </p>
          )}

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Note <span className="text-muted-foreground/60 normal-case">(optional)</span></Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={descPlaceholder} />
          </div>

          {type === "adjustment" && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              Adjustment direct account balance e jog hobe. Komate chaile <span className="font-semibold">negative</span> amount din.
            </p>
          )}

          {insufficient && (
            <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-700 dark:text-rose-400">
              ⚠ Insufficient balance in <span className="font-semibold">{selectedFrom?.name}</span>. Available {fmtBdt(selectedFrom?.current_balance ?? 0)} · Short by {fmtBdt(amt - Number(selectedFrom?.current_balance ?? 0))}
            </p>
          )}
        </div>

        <DialogFooter className="border-t bg-muted/30 px-5 py-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={mut.isPending || !amount || !!insufficient || ((type === "income" || type === "expense") && !categoryId)}
            className="min-w-[140px]"
          >
            {mut.isPending ? "Saving…" : meta.verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccountCombo({ label, value, onChange, accounts, disabled }: { label: string; value: string; onChange: (v: string) => void; accounts: Account[]; disabled?: boolean }) {
  const selected = accounts.find((a) => a.id === value);
  const Icon = selected ? accountIcon(selected.account_type) : WalletIcon;
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-11">
          {selected ? (
            <div className="flex items-center gap-2.5 text-left">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-medium">{selected.name}</span>
                <span className="text-[11px] text-muted-foreground">{fmtBdt(selected.current_balance)} available</span>
              </div>
            </div>
          ) : (
            <SelectValue placeholder="Choose wallet" />
          )}
        </SelectTrigger>
        <SelectContent>
          {accounts.map((a) => {
            const AIcon = accountIcon(a.account_type);
            return (
              <SelectItem key={a.id} value={a.id}>
                <div className="flex items-center gap-2">
                  <AIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{a.name}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">{fmtBdt(a.current_balance)}</span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

function CategoryPicker({ value, onChange, categories, brandId, kind, meta, qc }: {
  value: string;
  onChange: (v: string) => void;
  categories: Category[];
  brandId: string | null;
  kind: "income" | "expense";
  meta: { bg: string; fg: string };
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = categories.find((c) => c.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inKind = categories.filter((c) => c.kind === kind);
    if (!q) return inKind;
    return inKind.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, kind, query]);

  const otherKind = useMemo(
    () => categories.filter((c) => c.kind !== kind && (!query || c.name.toLowerCase().includes(query.trim().toLowerCase()))),
    [categories, kind, query],
  );

  const exactExists = categories.some((c) => c.name.toLowerCase() === query.trim().toLowerCase());

  const create = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("Select brand first");
      const name = query.trim();
      if (!name) throw new Error("Enter a name");
      const { data, error } = await supabase.from("erp_expense_categories")
        .insert({ brand_id: brandId, name, kind, is_active: true })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success(`"${query.trim()}" added`);
      qc.invalidateQueries({ queryKey: ["erp_categories"] });
      onChange(id);
      setQuery("");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        Category <span className="text-muted-foreground/60 normal-case">(optional)</span>
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" disabled={!brandId}
            className="w-full justify-between h-10 font-normal">
            <span className="flex items-center gap-2 truncate">
              <Tag className={cn("h-3.5 w-3.5", selected ? meta.fg : "text-muted-foreground")} />
              {selected ? selected.name : <span className="text-muted-foreground">{categories.length === 0 ? "No categories yet — type to create" : "Choose or search…"}</span>}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search or type new…" value={query} onValueChange={setQuery} />
            <CommandList className="max-h-64">
              {filtered.length === 0 && otherKind.length === 0 && !query.trim() && (
                <CommandEmpty>No categories yet</CommandEmpty>
              )}
              {filtered.length > 0 && (
                <CommandGroup heading={kind === "expense" ? "Expense" : "Income"}>
                  {filtered.map((c) => (
                    <CommandItem key={c.id} value={c.id} onSelect={() => { onChange(c.id); setOpen(false); }}>
                      <Check className={cn("mr-2 h-3.5 w-3.5", value === c.id ? "opacity-100" : "opacity-0")} />
                      {c.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {otherKind.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading={kind === "expense" ? "Income (other kind)" : "Expense (other kind)"}>
                    {otherKind.map((c) => (
                      <CommandItem key={c.id} value={c.id} onSelect={() => { onChange(c.id); setOpen(false); }} className="opacity-70">
                        <Check className={cn("mr-2 h-3.5 w-3.5", value === c.id ? "opacity-100" : "opacity-0")} />
                        {c.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
              {query.trim() && !exactExists && brandId && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem value="__create__" onSelect={() => create.mutate()} disabled={create.isPending}>
                      <Plus className="mr-2 h-3.5 w-3.5 text-primary" />
                      Create "<span className="font-semibold mx-0.5">{query.trim()}</span>" as {kind}
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}