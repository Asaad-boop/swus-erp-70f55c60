import { dhakaToday } from "@/lib/erp/finance";
import { useEffect, useMemo, useState } from "react";
import { Download, Plus, Wallet, TrendingUp, TrendingDown, ArrowRightLeft, Trash2, Search, Sparkles, Check } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CATEGORY_PRESETS, type CategoryPreset } from "@/lib/erp/finance/category-presets";
import {
  useAccounts, useCategories, useTransactions, useProfitLoss, type TxnFilter,
} from "@/hooks/erp/use-finance-query";
import { exportTransactionsCsv, fmtBdt, TXN_TYPE_LABEL, type TxnType } from "@/lib/erp/finance";
import { downloadCsv } from "@/lib/erp/orders";
import { TransactionForm } from "@/components/erp/finance/transaction-form";
import { AccountForm } from "@/components/erp/finance/account-form";
import { WalletsPage } from "@/components/erp/finance/pages/wallets";

export function FinancePage() {
  const { activeBrand, brands, brandIds, isAllBrands } = useBrand();
  const brandId = activeBrand?.id ?? null;

  const accountsQ = useAccounts(brandIds);
  const categoriesQ = useCategories(brandIds);

  const [txnOpen, setTxnOpen] = useState<{ open: boolean; type: TxnType }>({ open: false, type: "income" });
  const [acctOpen, setAcctOpen] = useState(false);

  const accounts = accountsQ.data ?? [];
  const categories = categoriesQ.data ?? [];
  const totalCash = accounts.reduce((s, a) => s + Number(a.current_balance || 0), 0);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Finance</h1>
          <p className="text-sm text-muted-foreground">{isAllBrands ? `All brands (${brands.length})` : activeBrand?.name} · Cash on hand: <span className="font-semibold text-foreground">{fmtBdt(totalCash)}</span></p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setTxnOpen({ open: true, type: "income" })}><TrendingUp className="h-4 w-4 mr-1" />Income</Button>
          <Button variant="outline" size="sm" onClick={() => setTxnOpen({ open: true, type: "expense" })}><TrendingDown className="h-4 w-4 mr-1" />Expense</Button>
          <Button variant="outline" size="sm" onClick={() => setTxnOpen({ open: true, type: "transfer" })}><ArrowRightLeft className="h-4 w-4 mr-1" />Transfer</Button>
        </div>
      </header>

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="reports">P&amp;L Report</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-3 -mx-4 md:-mx-6">
          <WalletsPage />
        </TabsContent>

        <TabsContent value="transactions" className="mt-3">
          <TransactionsTab brandIds={brandIds} brands={brands} isAllBrands={isAllBrands} />
        </TabsContent>

        <TabsContent value="categories" className="mt-3">
          <CategoriesTab brandId={brandId} brands={brands} isAllBrands={isAllBrands} />
        </TabsContent>

        <TabsContent value="reports" className="mt-3">
          <ReportsTab brandIds={brandIds} />
        </TabsContent>
      </Tabs>

      <TransactionForm
        open={txnOpen.open}
        onClose={() => setTxnOpen({ ...txnOpen, open: false })}
        brandId={isAllBrands ? null : brandId}
        brands={brands}
        accounts={accounts}
        categories={categories}
        defaultType={txnOpen.type}
      />
      <AccountForm open={acctOpen} onClose={() => setAcctOpen(false)} brandId={isAllBrands ? null : brandId} brands={brands} />
    </div>
  );
}

function AdjustButton({ accountId }: { accountId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const d = Number(delta);
      if (!d) throw new Error("Delta required");
      if (!reason.trim()) throw new Error("Reason required");
      const { error } = await supabase.rpc("adjust_account_balance", {
        _account_id: accountId, _delta: d, _reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Balance adjusted");
      qc.invalidateQueries({ queryKey: ["erp_accounts"] });
      qc.invalidateQueries({ queryKey: ["erp_transactions"] });
      setDelta(""); setReason(""); setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open) {
    return <Button size="sm" variant="ghost" className="mt-2 h-7 text-xs" onClick={() => setOpen(true)}>Adjust balance</Button>;
  }
  return (
    <div className="mt-2 space-y-1.5 border-t pt-2">
      <div className="grid grid-cols-3 gap-1.5">
        <Input type="number" placeholder="±delta" value={delta} onChange={(e) => setDelta(e.target.value)} className="col-span-1 h-8 text-xs" />
        <Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} className="col-span-2 h-8 text-xs" />
      </div>
      <div className="flex gap-1">
        <Button size="sm" className="h-7 text-xs flex-1" onClick={() => mut.mutate()} disabled={mut.isPending}>Save</Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

function TransactionsTab({ brandIds, brands, isAllBrands }: { brandIds: string[]; brands: { id: string; name: string }[]; isAllBrands: boolean }) {
  const qc = useQueryClient();
  const accountsQ = useAccounts(brandIds);
  const categoriesQ = useCategories(brandIds);
  const [filter, setFilter] = useState<TxnFilter>({
    brandIds: [], type: "all", accountId: null, from: null, to: null, search: "", limit: 200,
  });
  const effective = useMemo<TxnFilter>(() => ({ ...filter, brandIds }), [filter, brandIds]);
  const { data: rows = [], isLoading } = useTransactions(effective);

  const catMap = useMemo(() => new Map((categoriesQ.data ?? []).map((c) => [c.id, c.name])), [categoriesQ.data]);
  const accMap = useMemo(() => new Map((accountsQ.data ?? []).map((a) => [a.id, a.name])), [accountsQ.data]);
  const brandMap = useMemo(() => new Map(brands.map((b) => [b.id, b.name])), [brands]);

  const handleExport = () => {
    const csv = exportTransactionsCsv(rows, catMap, accMap);
    downloadCsv(`transactions-${dhakaToday()}.csv`, csv);
  };

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transaction deleted");
      qc.invalidateQueries({ queryKey: ["erp_transactions"] });
      qc.invalidateQueries({ queryKey: ["erp_accounts"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["finance_dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[180px]"><Label className="text-xs">Search</Label><Input placeholder="Description…" value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} /></div>
        <div className="min-w-[120px]">
          <Label className="text-xs">Type</Label>
          <Select value={filter.type} onValueChange={(v: TxnFilter["type"]) => setFilter({ ...filter, type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
              <SelectItem value="adjustment">Adjustment</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[160px]">
          <Label className="text-xs">Account</Label>
          <Select value={filter.accountId ?? "all"} onValueChange={(v) => setFilter({ ...filter, accountId: v === "all" ? null : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {(accountsQ.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">From</Label><Input type="date" value={filter.from ?? ""} onChange={(e) => setFilter({ ...filter, from: e.target.value || null })} /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={filter.to ?? ""} onChange={(e) => setFilter({ ...filter, to: e.target.value || null })} /></div>
        <Button variant="outline" onClick={handleExport} disabled={!rows.length}><Download className="h-4 w-4 mr-1" />CSV</Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              {isAllBrands && <TableHead>Brand</TableHead>}
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={isAllBrands ? 8 : 7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={isAllBrands ? 8 : 7} className="text-center py-8 text-muted-foreground">No transactions</TableCell></TableRow>}
            {rows.map((t) => {
              const meta = TXN_TYPE_LABEL[t.txn_type] ?? { label: t.txn_type, className: "" };
              const sign = t.txn_type === "expense" ? -1 : 1;
              return (
                <TableRow key={t.id}>
                  <TableCell className="text-xs whitespace-nowrap">{t.transaction_date}</TableCell>
                  {isAllBrands && <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{brandMap.get(t.brand_id) ?? "—"}</TableCell>}
                  <TableCell><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}>{meta.label}</span></TableCell>
                  <TableCell className="text-xs">{t.category_id ? catMap.get(t.category_id) ?? "—" : "—"}</TableCell>
                  <TableCell className="text-xs">
                    {t.account_id ? accMap.get(t.account_id) ?? "—" : "—"}
                    {t.to_account_id && <> → {accMap.get(t.to_account_id) ?? "—"}</>}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${sign < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {sign < 0 ? "−" : "+"}{fmtBdt(t.amount)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground truncate max-w-[260px]">{t.description ?? ""}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-red-600 hover:text-red-700"
                      title="Delete transaction"
                      disabled={del.isPending}
                      onClick={() => { if (confirm("Delete this transaction? Account balances will be recomputed.")) del.mutate(t.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CategoriesTab({ brandId, brands, isAllBrands }: { brandId: string | null; brands: { id: string; name: string }[]; isAllBrands: boolean }) {
  const qc = useQueryClient();
  const brandIds = isAllBrands ? brands.map((b) => b.id) : brandId ? [brandId] : [];
  const { data: cats = [], isLoading } = useCategories(brandIds);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("expense");
  const [newBrandId, setNewBrandId] = useState<string>(brandId ?? (brands.length === 1 ? brands[0].id : ""));
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "expense" | "income">("all");

  useEffect(() => {
    if (!isAllBrands && brandId) setNewBrandId(brandId);
  }, [brandId, isAllBrands]);

  const brandMap = useMemo(() => new Map(brands.map((b) => [b.id, b.name])), [brands]);

  const add = useMutation({
    mutationFn: async () => {
      const targetBrandId = isAllBrands ? newBrandId : brandId;
      if (!targetBrandId) throw new Error("Select a brand");
      if (!name.trim()) throw new Error("Name required");
      const { error } = await supabase.from("erp_expense_categories").insert({
        brand_id: targetBrandId, name: name.trim(), kind, is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Category added"); setName(""); qc.invalidateQueries({ queryKey: ["erp_categories"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_expense_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["erp_categories"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const targetBrandId = isAllBrands ? newBrandId : brandId;
  const existingNames = useMemo(() => {
    const set = new Set<string>();
    for (const c of cats) {
      if (!targetBrandId || c.brand_id === targetBrandId) set.add(c.name.trim().toLowerCase());
    }
    return set;
  }, [cats, targetBrandId]);

  const addPreset = useMutation({
    mutationFn: async (p: CategoryPreset) => {
      if (!targetBrandId) throw new Error("Select a brand first");
      const { error } = await supabase.from("erp_expense_categories").insert({
        brand_id: targetBrandId, name: p.name, kind: p.kind, is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["erp_categories"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkAddGroup = useMutation({
    mutationFn: async (group: string) => {
      if (!targetBrandId) throw new Error("Select a brand first");
      const items = CATEGORY_PRESETS.filter((p) => p.group === group && !existingNames.has(p.name.toLowerCase()));
      if (items.length === 0) return 0;
      const { error } = await supabase.from("erp_expense_categories").insert(
        items.map((p) => ({ brand_id: targetBrandId, name: p.name, kind: p.kind, is_active: true })),
      );
      if (error) throw error;
      return items.length;
    },
    onSuccess: (n) => { if (n) toast.success(`${n} categories added`); qc.invalidateQueries({ queryKey: ["erp_categories"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const presetGroups = useMemo(() => {
    const groups = new Map<string, CategoryPreset[]>();
    for (const p of CATEGORY_PRESETS) {
      if (kindFilter !== "all" && p.kind !== kindFilter) continue;
      const list = groups.get(p.group) ?? [];
      list.push(p);
      groups.set(p.group, list);
    }
    return Array.from(groups.entries());
  }, [kindFilter]);

  const filteredCats = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cats.filter((c) => {
      if (kindFilter !== "all" && c.kind !== kindFilter) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [cats, search, kindFilter]);

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Add new row */}
      <div className="flex gap-2 items-end flex-wrap rounded-xl border bg-card p-3">
        {isAllBrands && (
          <div className="min-w-[160px]">
            <Label className="text-xs">Brand</Label>
            <Select value={newBrandId} onValueChange={setNewBrandId}>
              <SelectTrigger><SelectValue placeholder="Choose brand" /></SelectTrigger>
              <SelectContent>{brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <div className="flex-1 min-w-[200px]"><Label className="text-xs">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marketing" onKeyDown={(e) => e.key === "Enter" && add.mutate()} /></div>
        <div className="min-w-[140px]">
          <Label className="text-xs">Kind</Label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="income">Income</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => add.mutate()} disabled={add.isPending}><Plus className="h-4 w-4 mr-1" />Add</Button>
      </div>

      {/* Quick add presets */}
      <div className="rounded-xl border bg-gradient-to-br from-muted/40 to-transparent p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <div>
              <h3 className="text-sm font-semibold">Quick add common categories</h3>
              <p className="text-xs text-muted-foreground">Click any chip to add it to {targetBrandId ? "this brand" : "(select a brand first)"}.</p>
            </div>
          </div>
          <Tabs value={kindFilter} onValueChange={(v) => setKindFilter(v as typeof kindFilter)}>
            <TabsList className="h-8">
              <TabsTrigger value="all" className="text-xs h-7">All</TabsTrigger>
              <TabsTrigger value="expense" className="text-xs h-7">Expense</TabsTrigger>
              <TabsTrigger value="income" className="text-xs h-7">Income</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="space-y-3">
          {presetGroups.map(([group, items]) => {
            const remaining = items.filter((p) => !existingNames.has(p.name.toLowerCase())).length;
            return (
              <div key={group}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</span>
                  {remaining > 0 && targetBrandId && (
                    <button type="button" onClick={() => bulkAddGroup.mutate(group)} disabled={bulkAddGroup.isPending}
                      className="text-[11px] text-primary hover:underline disabled:opacity-50">
                      + Add all ({remaining})
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((p) => {
                    const added = existingNames.has(p.name.toLowerCase());
                    return (
                      <button key={`${p.group}-${p.name}`} type="button"
                        disabled={added || addPreset.isPending || !targetBrandId}
                        onClick={() => addPreset.mutate(p)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                          added
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 cursor-default"
                            : p.kind === "income"
                              ? "bg-card hover:bg-emerald-500/10 hover:border-emerald-500/40"
                              : "bg-card hover:bg-rose-500/10 hover:border-rose-500/40",
                          !targetBrandId && !added && "opacity-50 cursor-not-allowed",
                        )}>
                        {added ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Existing categories list with search */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 justify-between flex-wrap">
          <h3 className="text-sm font-semibold">Your categories <span className="text-xs text-muted-foreground font-normal">({filteredCats.length})</span></h3>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search categories…" className="pl-8 h-9" />
          </div>
        </div>
        <div className="rounded-md border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead>{isAllBrands && <TableHead>Brand</TableHead>}<TableHead>Kind</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={isAllBrands ? 4 : 3} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && filteredCats.length === 0 && <TableRow><TableCell colSpan={isAllBrands ? 4 : 3} className="text-center py-6 text-muted-foreground">{cats.length === 0 ? "No categories yet — use quick add above" : "No match"}</TableCell></TableRow>}
            {filteredCats.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                {isAllBrands && <TableCell className="text-xs text-muted-foreground">{brandMap.get(c.brand_id) ?? "—"}</TableCell>}
                <TableCell>
                  <Badge variant="outline" className={cn(
                    "text-[10px] uppercase tracking-wider",
                    c.kind === "income" ? "border-emerald-500/40 text-emerald-600" : "border-rose-500/40 text-rose-600",
                  )}>{c.kind}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(c.id)} disabled={remove.isPending}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </div>
    </div>
  );
}

function ReportsTab({ brandIds }: { brandIds: string[] }) {
  const today = dhakaToday();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const { data, isLoading } = useProfitLoss(brandIds, from, to);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Calculating…</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Revenue</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-emerald-600">{fmtBdt(data.revenue)}</div><div className="text-xs text-muted-foreground">{data.delivered_orders} delivered</div></CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Other Income</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmtBdt(data.other_income)}</div></CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Expense</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-red-600">{fmtBdt(data.expense_total)}</div></CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Profit</CardTitle></CardHeader><CardContent><div className={`text-2xl font-bold ${data.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtBdt(data.profit)}</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Expense breakdown</CardTitle></CardHeader>
            <CardContent>
              {Object.keys(data.expense_by_category ?? {}).length === 0 ? (
                <p className="text-sm text-muted-foreground">No expenses in this range.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">% of total</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {Object.entries(data.expense_by_category)
                      .sort((a, b) => Number(b[1]) - Number(a[1]))
                      .map(([name, amt]) => (
                        <TableRow key={name}>
                          <TableCell>{name}</TableCell>
                          <TableCell className="text-right font-mono">{fmtBdt(Number(amt))}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {data.expense_total ? ((Number(amt) / data.expense_total) * 100).toFixed(1) : "0"}%
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}