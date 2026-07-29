import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRightLeft, Banknote, Building2, Coins, Landmark, Plus, Smartphone, Truck, Wallet as WalletIcon, FileText, Pencil, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtBdt, type Account } from "@/lib/erp/finance";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { TransferDialog } from "@/components/erp/finance/transfer-dialog";
import { AccountForm } from "@/components/erp/finance/account-form";
import { TransactionForm } from "@/components/erp/finance/transaction-form";
import { DepositWithdrawDialog } from "@/components/erp/finance/deposit-withdraw-dialog";
import { useCategories } from "@/hooks/erp/use-finance-query";
import { cn } from "@/lib/utils";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";

type Wallet = Account & { wallet_type: string; account_subtype?: string | null };

function subtypeStyle(w: Wallet): { ring?: string; bg?: string; accent?: string } {
  const sub = (w.account_subtype ?? w.account_type ?? "").toLowerCase();
  if (sub === "bkash") return { ring: "ring-1 ring-pink-300/60 dark:ring-pink-900/60", bg: "bg-gradient-to-br from-pink-50 to-transparent dark:from-pink-950/30", accent: "text-pink-600" };
  if (sub === "nagad") return { ring: "ring-1 ring-orange-300/60 dark:ring-orange-900/60", bg: "bg-gradient-to-br from-orange-50 to-transparent dark:from-orange-950/30", accent: "text-orange-600" };
  if (sub === "rocket") return { ring: "ring-1 ring-purple-300/60 dark:ring-purple-900/60", bg: "bg-gradient-to-br from-purple-50 to-transparent dark:from-purple-950/30", accent: "text-purple-600" };
  return {};
}

function walletGroup(w: Wallet) {
  const sub = (w.account_subtype ?? w.account_type ?? "").toLowerCase();
  if (["cash", "petty_cash"].includes(sub)) return "cash";
  if (["bank", "bank_savings", "bank_current"].includes(sub)) return "bank";
  if (["bkash", "nagad", "rocket", "upay"].includes(sub)) return "mfs";
  if (sub === "courier_wallet") return "courier_wallet";
  if (["loan", "credit_card"].includes(sub)) return "loan";
  if (sub === "equity") return "equity";
  return w.wallet_type || "other";
}

const GROUPS: Array<{ key: string; label: string; icon: typeof WalletIcon; color: string }> = [
  { key: "cash",           label: "Cash in Hand",   icon: Coins,      color: "text-emerald-600" },
  { key: "bank",           label: "Bank Accounts",  icon: Landmark,   color: "text-blue-600" },
  { key: "mfs",            label: "Mobile Wallets", icon: Smartphone, color: "text-pink-600" },
  { key: "courier_wallet", label: "Courier COD",    icon: Truck,      color: "text-orange-600" },
  { key: "loan",           label: "Loans",          icon: Banknote,   color: "text-red-600" },
  { key: "equity",         label: "Equity / Owner", icon: Building2,  color: "text-purple-600" },
  { key: "other",          label: "Other",          icon: WalletIcon, color: "text-muted-foreground" },
];

export function WalletsPage() {
  const { activeBrand, brands, brandIds, isAllBrands } = useBrand();
  const brandId = activeBrand?.id ?? null;

  const [transferOpen, setTransferOpen] = useState<{ open: boolean; fromId?: string | null }>({ open: false });
  const [newAcctOpen, setNewAcctOpen] = useState(false);
  const [editWallet, setEditWallet] = useState<Wallet | null>(null);
  const [statementFor, setStatementFor] = useState<Wallet | null>(null);
  const [txnDialog, setTxnDialog] = useState<{ open: boolean; type: "income" | "expense"; accountId: string | null; brandId: string | null }>({ open: false, type: "income", accountId: null, brandId: null });
  const [dwDialog, setDwDialog] = useState<{ open: boolean; mode: "deposit" | "withdraw"; account: Wallet | null }>({ open: false, mode: "deposit", account: null });
  const categoriesQ = useCategories(brandIds);

  const walletsQ = useQuery({
    queryKey: ["wallets", brandIds],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      const { data, error } = await applyBrandScope(
        supabase.from("erp_accounts").select("*"),
        brandIds,
        "brand_id",
        { includeNull: true },
      )
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Wallet[];
    },
  });

  // Today's transactions for in/out badges
  const today = new Date().toISOString().slice(0, 10);
  const todayTxQ = useQuery({
    queryKey: ["wallets_today", brandIds, today],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      const { data, error } = await applyBrandScope(
        supabase.from("erp_transactions").select("id,txn_type,amount,account_id,to_account_id"),
        brandIds,
      ).eq("transaction_date", today);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; txn_type: string; amount: number; account_id: string | null; to_account_id: string | null }>;
    },
  });

  const todayByWallet = useMemo(() => {
    const map = new Map<string, { in: number; out: number }>();
    const get = (id: string) => map.get(id) ?? { in: 0, out: 0 };
    for (const t of todayTxQ.data ?? []) {
      const a = Number(t.amount || 0);
      if (t.account_id) {
        const e = get(t.account_id);
        if (t.txn_type === "income") e.in += a;
        else if (t.txn_type === "expense") e.out += a;
        else if (t.txn_type === "transfer") e.out += a;
        else if (t.txn_type === "adjustment") { if (a >= 0) e.in += a; else e.out += -a; }
        map.set(t.account_id, e);
      }
      if (t.txn_type === "transfer" && t.to_account_id) {
        const e = get(t.to_account_id);
        e.in += a;
        map.set(t.to_account_id, e);
      }
    }
    return map;
  }, [todayTxQ.data]);

  const wallets = walletsQ.data ?? [];
  const brandMap = useMemo(() => new Map(brands.map((b) => [b.id, b.name])), [brands]);
  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    let liquid = 0;
    for (const w of wallets) {
      const k = walletGroup(w);
      t[k] = (t[k] ?? 0) + Number(w.current_balance || 0);
      if (["cash", "bank", "mfs"].includes(k)) liquid += Number(w.current_balance || 0);
    }
    return { byType: t, liquid };
  }, [wallets]);

  const netWorth = wallets.reduce((s, w) => {
    const v = Number(w.current_balance || 0);
    return s + (walletGroup(w) === "loan" ? -v : v);
  }, 0);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Accounts &amp; Wallets</h1>
          <p className="text-sm text-muted-foreground">
            Cash, bank, mobile wallet, courier COD and owner accounts · {isAllBrands ? `All brands (${brands.length})` : activeBrand?.name} · Liquid: <span className="font-semibold text-foreground">{fmtBdt(totals.liquid)}</span> · Net worth: <span className="font-semibold text-foreground">{fmtBdt(netWorth)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setTransferOpen({ open: true })}>
            <ArrowRightLeft className="h-4 w-4 mr-1.5" /> Transfer
          </Button>
          <Button size="sm" onClick={() => setNewAcctOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> New Account / Wallet
          </Button>
        </div>
      </header>

      {brandIds.length === 0 && <p className="text-sm text-muted-foreground">No brands available.</p>}

      {walletsQ.isLoading && <p className="text-sm text-muted-foreground">Loading wallets…</p>}

      {brandIds.length > 0 && !walletsQ.isLoading && wallets.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <WalletIcon className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No accounts yet. Create cash, bank, mobile wallet, courier COD, loan, or owner accounts here.</p>
            <Button size="sm" onClick={() => setNewAcctOpen(true)}><Plus className="h-4 w-4 mr-1.5" />Create first account</Button>
          </CardContent>
        </Card>
      )}

      {GROUPS.map((g) => {
        const items = wallets.filter((w) => walletGroup(w) === g.key);
        if (items.length === 0) return null;
        const Icon = g.icon;
        const subtotal = totals.byType[g.key] ?? 0;
        return (
          <section key={g.key} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className={cn("h-4 w-4", g.color)} />
                <h2 className="text-sm font-semibold">{g.label}</h2>
                <Badge variant="secondary" className="text-xs">{items.length}</Badge>
              </div>
              <span className="text-sm font-semibold tabular-nums">{fmtBdt(subtotal)}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((w) => {
                const style = subtypeStyle(w);
                const today = todayByWallet.get(w.id);
                return (
                <Card key={w.id} className={cn("hover:shadow-md transition-shadow", style.ring, style.bg)}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm font-medium truncate">{w.name}</CardTitle>
                      <Icon className={cn("h-4 w-4 shrink-0", style.accent ?? g.color)} />
                    </div>
                    {isAllBrands && (
                      <p className="text-[11px] text-muted-foreground truncate">{w.brand_id ? (brandMap.get(w.brand_id) ?? "—") : "🌐 Shared (all brands)"}</p>
                    )}
                    {w.account_number && (
                      <p className="text-[11px] text-muted-foreground font-mono truncate">{w.account_number}</p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className={cn("text-xl font-bold tabular-nums", Number(w.current_balance) < 0 && "text-red-600")}>
                      {fmtBdt(w.current_balance)}
                    </div>
                    {today && (today.in > 0 || today.out > 0) ? (
                      <div className="flex gap-2 text-[11px]">
                        {today.in > 0 && <span className="text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-0.5"><ArrowDownRight className="h-3 w-3" />{fmtBdt(today.in)}</span>}
                        {today.out > 0 && <span className="text-rose-700 dark:text-rose-400 inline-flex items-center gap-0.5"><ArrowUpRight className="h-3 w-3" />{fmtBdt(today.out)}</span>}
                        <span className="text-muted-foreground">today</span>
                      </div>
                    ) : (
                      <div className="text-[11px] text-muted-foreground">Opening: {fmtBdt(w.opening_balance)}</div>
                    )}
                    <div className="flex gap-1.5 pt-1">
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs flex-1 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40" onClick={() => setDwDialog({ open: true, mode: "deposit", account: w })}>
                        <ArrowDownToLine className="h-3 w-3 mr-1" />Deposit
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs flex-1 text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40" onClick={() => setDwDialog({ open: true, mode: "withdraw", account: w })}>
                        <ArrowUpFromLine className="h-3 w-3 mr-1" />Withdraw
                      </Button>
                    </div>
                    <div className="flex gap-1.5">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs flex-1" onClick={() => setStatementFor(w)}>
                        <FileText className="h-3 w-3 mr-1" />Statement
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditWallet(w)} title="Edit / Delete">
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setTransferOpen({ open: true, fromId: w.id })}>
                        <ArrowRightLeft className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                );
              })}
            </div>
          </section>
        );
      })}

      {brandIds.length > 0 && (
        <TransferDialog
          open={transferOpen.open}
          onClose={() => setTransferOpen({ open: false })}
          brandId={isAllBrands ? null : brandId}
          brands={brands}
          accounts={wallets}
          defaultFromId={transferOpen.fromId ?? null}
        />
      )}
      {brandIds.length > 0 && <AccountForm open={newAcctOpen} onClose={() => setNewAcctOpen(false)} brandId={isAllBrands ? null : brandId} brands={brands} />}
      {brandIds.length > 0 && <AccountForm open={!!editWallet} onClose={() => setEditWallet(null)} brandId={editWallet?.brand_id ?? (isAllBrands ? null : brandId)} brands={brands} editing={editWallet} />}
      {brandIds.length > 0 && (
        <TransactionForm
          open={txnDialog.open}
          onClose={() => setTxnDialog((s) => ({ ...s, open: false }))}
          brandId={txnDialog.brandId ?? (isAllBrands ? null : brandId)}
          accounts={wallets}
          categories={categoriesQ.data ?? []}
          brands={brands}
          defaultType={txnDialog.type}
          defaultAccountId={txnDialog.accountId}
        />
      )}
      <StatementDialog wallet={statementFor} onClose={() => setStatementFor(null)} />
      <DepositWithdrawDialog
        open={dwDialog.open}
        onClose={() => setDwDialog((s) => ({ ...s, open: false }))}
        mode={dwDialog.mode}
        account={dwDialog.account}
        brandId={isAllBrands ? null : brandId}
      />
    </div>
  );
}

function StatementDialog({ wallet, onClose }: { wallet: Wallet | null; onClose: () => void }) {
  const stmtQ = useQuery({
    queryKey: ["wallet_statement", wallet?.id],
    enabled: !!wallet,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_transactions")
        .select("id, txn_type, amount, transaction_date, description, account_id, to_account_id")
        .or(`account_id.eq.${wallet!.id},to_account_id.eq.${wallet!.id}`)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = stmtQ.data ?? [];

  return (
    <Dialog open={!!wallet} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {wallet?.name} · <span className="font-mono">{fmtBdt(wallet?.current_balance ?? 0)}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-auto flex-1">
          {stmtQ.isLoading && <p className="text-sm text-muted-foreground p-4">Loading…</p>}
          {!stmtQ.isLoading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground p-4 text-center">No transactions yet.</p>
          )}
          {rows.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const inflow = r.txn_type === "income" || (r.txn_type === "transfer" && r.to_account_id === wallet?.id) || (r.txn_type === "adjustment" && Number(r.amount) > 0);
                  const signed = inflow ? Math.abs(Number(r.amount)) : -Math.abs(Number(r.amount));
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">{r.transaction_date}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px] uppercase">{r.txn_type}</Badge></TableCell>
                      <TableCell className="text-sm">{r.description ?? "—"}</TableCell>
                      <TableCell className={cn("text-right tabular-nums font-medium", signed >= 0 ? "text-emerald-600" : "text-red-600")}>
                        {signed >= 0 ? "+" : ""}{fmtBdt(signed)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}