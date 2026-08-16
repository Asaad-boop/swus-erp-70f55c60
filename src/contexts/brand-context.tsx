import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyAccessProfile } from "@/hooks/use-my-access-profile";

export type Brand = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  is_active: boolean;
};

type BrandContextValue = {
  brands: Brand[];
  activeBrand: Brand | null;
  setActiveBrandId: (id: string | "all") => void;
  isAllBrands: boolean;
  brandIds: string[]; // all active brand ids when isAllBrands, else [activeBrand.id]
  isLoading: boolean;
};

const BrandContext = createContext<BrandContextValue | null>(null);
const STORAGE_KEY = "erp.activeBrandId";
const ALL = "all";

export function BrandProvider({ children }: { children: ReactNode }) {
  const access = useMyAccessProfile();
  const { data: allBrands = [], isLoading: brandsLoading } = useQuery({
    queryKey: ["brands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id,name,slug,logo_url,is_active")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Brand[];
    },
    staleTime: 5 * 60 * 1000,
  });
  const brands = useMemo(() => {
    if (!access.data || access.data.roles.includes("admin") || access.data.brandMode === "all")
      return allBrands;
    const allowed = new Set(access.data.brandIds);
    return allBrands.filter((brand) => allowed.has(brand.id));
  }, [access.data, allBrands]);
  const isLoading = brandsLoading || access.isLoading;

  const [activeBrandId, setActiveBrandIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY) ?? ALL;
  });

  useEffect(() => {
    if (brands.length === 0) return;
    if (activeBrandId === ALL) return;
    const exists = activeBrandId ? brands.some((b) => b.id === activeBrandId) : false;
    if (!activeBrandId || !exists) {
      // Default to ALL so multi-brand reporting is on by default
      setActiveBrandIdState(ALL);
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, ALL);
    }
  }, [brands, activeBrandId]);

  const setActiveBrandId = (id: string | "all") => {
    setActiveBrandIdState(id);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
  };

  const value = useMemo<BrandContextValue>(() => {
    const isAllBrands = activeBrandId === ALL;
    const activeBrand = isAllBrands ? null : (brands.find((b) => b.id === activeBrandId) ?? null);
    const brandIds = isAllBrands ? brands.map((b) => b.id) : activeBrand ? [activeBrand.id] : [];
    return { brands, activeBrand, setActiveBrandId, isAllBrands, brandIds, isLoading };
  }, [brands, activeBrandId, isLoading]);

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand() {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("useBrand must be used inside BrandProvider");
  return ctx;
}
