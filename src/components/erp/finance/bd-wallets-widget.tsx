import { dhakaToday } from "@/lib/erp/finance";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Wallet as WalletIcon, Smartphone, Landmark, Coins, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { Card, CardContent } from "@/components/ui/card";
import { fmtBdt } from "@/lib/erp/finance";
import { cn } from "@/lib/utils";

type Wallet = {
  id: string;
  brand_id: string | null;
  name: string;
  account_subtype: string | null;
  account_type: string | null;
  current_balance: number;
};

type Txn = { id: string; txn_type: string; amount: number; account_id: string | null; to_account_id: string | null };

const BUCKETS: Array<{ key: string; label: string; icon: typeof WalletIcon; iconColor: string; bg: string; ring: string; subtypes: string[] }> = [
  { key: "cash",  label: "Cash",  icon: Coins,      iconColor: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/40", ring: "ring-emerald-200/60 dark:ring-emerald-900/60", subtypes: ["cash"] },
  { key: "bkash", label: "bKash", icon: Smartphone, iconColor: "text-pink-600",    bg: "bg-pink-50 dark:bg-pink-950/40",       ring: "ring-pink-200/60 dark:ring-pink-900/60",       subtypes: ["bkash"] },
  { key: "nagad", label: "Nagad", icon: Smartphone, iconColor: "text-orange-600",  bg: "bg-orange-50 dark:bg-orange-950/40",   ring: "ring-orange-200/60 dark:ring-orange-900/60",   subtypes: ["nagad", "rocket"] },
  { key: "bank",  label: "Bank",  icon: Landmark,   iconColor: "text-blue-600",    bg: "bg-blue-50 dark:bg-blue-950/40",       ring: "ring-blue-200/60 dark:ring-blue-900/60",       subtypes: ["bank"] },
];

function subtypeOf(w: Wallet): string {
  return (w.account_subtype ?? w.account_type ?? "").toLowerCase();
}

function bucketKeyFor(w: Wallet): string | null {
  const sub = subtypeOf(w);
  if (["cash", "petty_cash"].includes(sub)) return "cash";
  if (["bkash"].includes(sub)) return "bkash";
  if (["nagad", "rocket", "upay"].includes(sub)) return "nagad";
  if (["bank", "bank_savings", "bank_current"].includes(sub)) return "bank";
  return null;
}

export function BdWalletsWidget() {
  const { brandIds } = useBrand();
  const today = dhakaToday();

  const walletsQ = useQuery({
    queryKey: ["bd_wallets_widget", brandIds.join(",")],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      const { data, error } = await applyBrandScope(
        supabase.from("erp_accounts").select("id,brand_id,name,account_subtype,account_type,current_balance"),
        brandIds,
        "brand_id",
        { includeNull: true },
      ).eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as Wallet[];
    },
  });

  const todayTxQ = useQuery({
    queryKey: ["bd_wallets_today", brandIds.join(","), today],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      const { data, error } = await applyBrandScope(
        supabase.from("erp_transactions").select("id,txn_type,amount,account_id,to_account_id"),
        brandIds,
      ).eq("transaction_date", today);
      if (error) throw error;
      return (data ?? []) as Txn[];
    },
  });

  const buckets = useMemo(() => {
    const wallets = walletsQ.data ?? [];
    const txns = todayTxQ.data ?? [];
    const walletBucket = new Map<string, string>();
    for (const w of wallets) {
      const sub = subtypeOf(w);
      const bucket = bucketKeyFor(w);
      if (bucket) walletBucket.set(w.id, bucket);
    }
    return BUCKETS.map((b) => {
      const wallets_ = wallets.filter((w) => bucketKeyFor(w) === b.key);
      const balance = wallets_.reduce((s, w) => s + Number(w.current_balance || 0), 0);
      let inflow = 0, outflow = 0;
      for (const t of txns) {
        const amt = Number(t.amount || 0);
        const fromB = t.account_id && walletBucket.get(t.account_id);
        const toB = t.to_account_id && walletBucket.get(t.to_account_id);
        if (t.txn_type === "income" && fromB === b.key) inflow += amt;
        else if (t.txn_type === "expense" && fromB === b.key) outflow += amt;
        else if (t.txn_type === "transfer") {
          if (fromB === b.key) outflow += amt;
          if (toB === b.key) inflow += amt;
        } else if (t.txn_type === "adjustment" && fromB === b.key) {
          if (amt >= 0) inflow += amt; else outflow += -amt;
        }
      }
      return { ...b, balance, inflow, outflow, count: wallets_.length };
    });
  }, [walletsQ.data, todayTxQ.data]);

  // Hide entire widget if no relevant wallets exist anywhere
  const hasAny = buckets.some((b) => b.count > 0);
  if (!hasAny) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <WalletIcon className="h-4 w-4 text-muted-foreground" /> Accounts &amp; Wallets · Today
          </h3>
          <Link to="/erp/finance/accounts" className="text-xs text-primary hover:underline">View all →</Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {buckets.map((b) => {
            const Icon = b.icon;
            if (b.count === 0) {
              return (
                <div key={b.key} className="rounded-lg p-3 border border-dashed text-muted-foreground">
                  <div className="flex items-center justify-between text-xs">
                    <span>{b.label}</span><Icon className="h-3.5 w-3.5 opacity-50" />
                  </div>
                  <div className="text-sm mt-1">No wallet</div>
                </div>
              );
            }
            return (
              <div key={b.key} className={cn("rounded-lg p-3 ring-1", b.bg, b.ring)}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{b.label}</span>
                  <Icon className={cn("h-4 w-4", b.iconColor)} />
                </div>
                <div className="text-lg font-bold tabular-nums mt-0.5">{fmtBdt(b.balance)}</div>
                {(b.inflow > 0 || b.outflow > 0) ? (
                  <div className="flex gap-2 text-[11px] mt-1">
                    {b.inflow > 0 && (
                      <span className="text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-0.5">
                        <ArrowDownRight className="h-3 w-3" />{fmtBdt(b.inflow)}
                      </span>
                    )}
                    {b.outflow > 0 && (
                      <span className="text-rose-700 dark:text-rose-400 inline-flex items-center gap-0.5">
                        <ArrowUpRight className="h-3 w-3" />{fmtBdt(b.outflow)}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground mt-1">No movement today</div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}