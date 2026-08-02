import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Latest USD→BDT rate.
 * 1) erp_fx_rates (brand-scoped when brandIds given, else global latest)
 * 2) fallback: latest confirmed dollar purchase effective/usd rate
 * Returns `null` only when neither source has a real rate (no hardcoded fallback).
 */
export function useUsdBdtRate(brandIds: string[] = []) {
  return useQuery({
    queryKey: ["fx_usd_bdt", brandIds.join(",")],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<number | null> => {
      let q = supabase
        .from("erp_fx_rates")
        .select("rate, rate_date")
        .eq("from_ccy", "USD")
        .eq("to_ccy", "BDT")
        .order("rate_date", { ascending: false })
        .limit(1);
      if (brandIds.length) q = q.in("brand_id", brandIds);
      const { data } = await q;
      const r = Number(data?.[0]?.rate);
      if (Number.isFinite(r) && r > 0) return r;

      // Fallback: latest confirmed USD purchase rate (Payoneer/dollar purchase)
      const { data: dp } = await supabase
        .from("meta_dollar_purchases")
        .select("effective_rate, usd_rate, purchase_date")
        .eq("status", "confirmed")
        .order("purchase_date", { ascending: false })
        .limit(1);
      const d = Number(dp?.[0]?.effective_rate ?? 0) || Number(dp?.[0]?.usd_rate ?? 0);
      return Number.isFinite(d) && d > 0 ? d : null;
    },
  });
}