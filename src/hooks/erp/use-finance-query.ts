import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Account, Category, Transaction } from "@/lib/erp/finance";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";

// Hooks accept brandIds[]; pass [] to skip, [id] for single brand, or
// brands.map(b => b.id) for All-Brands mode.
export function useAccounts(brandIds: string[]) {
  return useQuery({
    queryKey: ["erp_accounts", brandIds],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      const { data, error } = await applyBrandScope(
        supabase
          .from("erp_accounts")
          .select("id,brand_id,name,account_type,account_subtype,wallet_type,account_number,opening_balance,current_balance,is_active,notes"),
        brandIds,
        "brand_id",
        { includeNull: true },
      ).order("name");
      if (error) throw error;
      return (data ?? []) as Account[];
    },
  });
}

export function useCategories(brandIds: string[]) {
  return useQuery({
    queryKey: ["erp_categories", brandIds],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      const { data, error } = await applyBrandScope(
        supabase
          .from("erp_expense_categories")
          .select("id,brand_id,name,kind,is_active"),
        brandIds,
      ).order("name");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });
}

export type TxnFilter = {
  brandIds: string[];
  type: "all" | "income" | "expense" | "transfer" | "adjustment";
  accountId: string | null;
  from: string | null;
  to: string | null;
  search: string;
  limit: number;
};

export function useTransactions(filter: TxnFilter) {
  return useQuery({
    queryKey: ["erp_transactions", filter],
    enabled: filter.brandIds.length > 0,
    queryFn: async () => {
      let q = applyBrandScope(
        supabase
          .from("erp_transactions")
          .select("id,brand_id,txn_type,category_id,account_id,to_account_id,amount,reference_type,reference_id,supplier_id,description,transaction_date,created_at"),
        filter.brandIds,
      )
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(filter.limit);
      if (filter.type !== "all") q = q.eq("txn_type", filter.type);
      if (filter.accountId) q = q.or(`account_id.eq.${filter.accountId},to_account_id.eq.${filter.accountId}`);
      if (filter.from) q = q.gte("transaction_date", filter.from);
      if (filter.to) q = q.lte("transaction_date", filter.to);
      if (filter.search.trim()) q = q.ilike("description", `%${filter.search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Transaction[];
    },
  });
}

export type PnL = {
  revenue: number;
  delivered_orders: number;
  other_income: number;
  expense_total: number;
  expense_by_category: Record<string, number>;
  profit: number;
};

export function useProfitLoss(brandIds: string[], from: string, to: string) {
  return useQuery({
    queryKey: ["erp_pnl", brandIds, from, to],
    enabled: brandIds.length > 0 && !!from && !!to,
    queryFn: async () => {
      // RPC is single-brand; aggregate when in All-Brands mode.
      const results = await Promise.all(
        brandIds.map(async (bid) => {
          const { data, error } = await supabase.rpc("erp_profit_loss", {
            _brand_id: bid,
            _from: from,
            _to: to,
          });
          if (error) throw error;
          return data as unknown as PnL;
        }),
      );
      if (results.length === 1) return results[0];
      const acc: PnL = {
        revenue: 0,
        delivered_orders: 0,
        other_income: 0,
        expense_total: 0,
        expense_by_category: {},
        profit: 0,
      };
      for (const r of results) {
        acc.revenue += Number(r.revenue || 0);
        acc.delivered_orders += Number(r.delivered_orders || 0);
        acc.other_income += Number(r.other_income || 0);
        acc.expense_total += Number(r.expense_total || 0);
        acc.profit += Number(r.profit || 0);
        for (const [k, v] of Object.entries(r.expense_by_category ?? {})) {
          acc.expense_by_category[k] = (acc.expense_by_category[k] ?? 0) + Number(v || 0);
        }
      }
      // Shared (all-brand) transactions have brand_id NULL — count them once in All-Brands view.
      const { data: sharedRows, error: sharedErr } = await supabase
        .from("erp_transactions")
        .select("txn_type, amount, category_id, erp_expense_categories(name, excluded_from_pnl, is_cogs_category)")
        .is("brand_id", null)
        .in("txn_type", ["expense", "income"])
        .gte("transaction_date", from)
        .lte("transaction_date", to);
      if (sharedErr) throw sharedErr;
      for (const row of sharedRows ?? []) {
        const cat = row.erp_expense_categories as { name: string; excluded_from_pnl: boolean | null; is_cogs_category: boolean | null } | null;
        if (cat?.excluded_from_pnl) continue;
        const amt = Number(row.amount || 0);
        if (row.txn_type === "expense") {
          if (cat?.is_cogs_category) continue;
          acc.expense_total += amt;
          acc.profit -= amt;
          const name = cat?.name ?? "Uncategorized";
          acc.expense_by_category[name] = (acc.expense_by_category[name] ?? 0) + amt;
        } else {
          acc.other_income += amt;
          acc.profit += amt;
        }
      }
      return acc;
    },
  });
}