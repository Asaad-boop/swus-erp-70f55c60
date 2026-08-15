import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CatalogProduct } from "@/lib/erp/product-catalog";

export type CatalogStatus = "all" | "active" | "inactive";
export type CatalogStock = "all" | "in" | "low" | "out";
export type CatalogSku = "all" | "missing" | "has";
export type CatalogSort = "updated" | "created" | "title" | "price" | "stock";

export type CatalogFilter = {
  search: string;
  brandId: string; // "all" | uuid | "none"
  categoryId: string; // "all" | uuid
  status: CatalogStatus;
  stock: CatalogStock;
  sku: CatalogSku;
  flag: "all" | "featured" | "new" | "preorder" | "combo" | "variants";
  sortBy: CatalogSort;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
};

export const DEFAULT_CATALOG_FILTER: CatalogFilter = {
  search: "",
  brandId: "all",
  categoryId: "all",
  status: "all",
  stock: "all",
  sku: "all",
  flag: "all",
  sortBy: "updated",
  sortDir: "desc",
  page: 0,
  pageSize: 50,
};

const SORT_COLUMN: Record<CatalogSort, string> = {
  updated: "updated_at",
  created: "created_at",
  title: "title",
  price: "price",
  stock: "stock",
};

const SELECT =
  "id,title,slug,image,video_url,description,price,old_price,cost_price,weighted_avg_cost,stock,reserved_stock,available_stock,low_stock_threshold,reorder_point,reorder_qty,sku,barcode,brand_id,category_id,is_active,is_featured,is_new_arrival,is_preorder,is_combo,preorder_expected_date,age_group,display_order,created_at,updated_at," +
  "product_variants(id,sku,stock,color_name,color_hex,is_active)," +
  "product_brand_listings(id,brand_id,is_active)";

function applyFilters(query: any, f: CatalogFilter) {
  let q = query;
  if (f.brandId === "none") q = q.is("brand_id", null);
  else if (f.brandId !== "all") q = q.eq("brand_id", f.brandId);
  if (f.categoryId !== "all") q = q.eq("category_id", f.categoryId);
  if (f.status !== "all") q = q.eq("is_active", f.status === "active");
  if (f.stock === "out") q = q.lte("stock", 0);
  if (f.stock === "in") q = q.gt("stock", 0);
  if (f.sku === "missing") q = q.or("sku.is.null,sku.eq.");
  if (f.sku === "has") q = q.not("sku", "is", null);
  if (f.flag === "featured") q = q.eq("is_featured", true);
  if (f.flag === "new") q = q.eq("is_new_arrival", true);
  if (f.flag === "preorder") q = q.eq("is_preorder", true);
  if (f.flag === "combo") q = q.eq("is_combo", true);
  const s = f.search.trim();
  if (s) {
    const esc = s.replace(/[,()]/g, " ");
    q = q.or(`title.ilike.%${esc}%,sku.ilike.%${esc}%,barcode.ilike.%${esc}%,slug.ilike.%${esc}%`);
  }
  return q;
}

function map(d: Record<string, any>): CatalogProduct {
  const { product_variants, product_brand_listings, ...rest } = d;
  return {
    ...(rest as CatalogProduct),
    variants: (product_variants ?? []) as CatalogProduct["variants"],
    listings: (product_brand_listings ?? []) as CatalogProduct["listings"],
  };
}

export function useProductsCatalog(filter: CatalogFilter) {
  return useQuery({
    queryKey: ["products-catalog", filter],
    queryFn: async () => {
      const asc = filter.sortDir === "asc";
      const wideScan = filter.stock === "low" || filter.flag === "variants";
      let q = applyFilters(supabase.from("products").select(SELECT, { count: "exact" }), filter);
      q = q.order(SORT_COLUMN[filter.sortBy], { ascending: asc });

      if (wideScan) {
        const { data, error } = await q.limit(5000);
        if (error) throw error;
        let all = ((data ?? []) as Array<Record<string, any>>).map(map);
        if (filter.stock === "low") all = all.filter((p) => p.stock > 0 && p.stock <= (p.low_stock_threshold ?? 5));
        if (filter.flag === "variants") all = all.filter((p) => p.variants.length > 0);
        const from = filter.page * filter.pageSize;
        return { rows: all.slice(from, from + filter.pageSize), total: all.length };
      }

      const from = filter.page * filter.pageSize;
      const { data, error, count } = await q.range(from, from + filter.pageSize - 1);
      if (error) throw error;
      const rows = ((data ?? []) as Array<Record<string, any>>).map(map);
      return { rows, total: count ?? rows.length };
    },
  });
}

export type CatalogStats = {
  total: number;
  active: number;
  inactive: number;
  missingSku: number;
  notListed: number;
  stockValue: number;
  outOfStock: number;
};

/** Global stats across every brand (independent of paging). */
export function useCatalogStats() {
  return useQuery({
    queryKey: ["products-catalog-stats"],
    staleTime: 60_000,
    queryFn: async (): Promise<CatalogStats> => {
      const { data, error } = await supabase
        .from("products")
        .select("id,is_active,sku,stock,cost_price,weighted_avg_cost,product_brand_listings(id)")
        .limit(20000);
      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, any>>;
      const s: CatalogStats = { total: rows.length, active: 0, inactive: 0, missingSku: 0, notListed: 0, stockValue: 0, outOfStock: 0 };
      for (const r of rows) {
        if (r.is_active) s.active += 1; else s.inactive += 1;
        if (!r.sku || String(r.sku).trim() === "") s.missingSku += 1;
        if (((r.product_brand_listings as unknown[]) ?? []).length === 0) s.notListed += 1;
        const stock = Number(r.stock ?? 0);
        if (stock <= 0) s.outOfStock += 1;
        s.stockValue += Number(r.weighted_avg_cost ?? r.cost_price ?? 0) * stock;
      }
      return s;
    },
  });
}

export function useAllCategories() {
  return useQuery({
    queryKey: ["catalog-categories-all"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id,name,brand_id").order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; brand_id: string | null }>;
    },
  });
}

/** Existing SKUs (products + variants) used to guarantee uniqueness when generating. */
export async function fetchExistingSkus(): Promise<Set<string>> {
  const [p, v] = await Promise.all([
    supabase.from("products").select("sku").not("sku", "is", null).limit(20000),
    supabase.from("product_variants").select("sku").not("sku", "is", null).limit(20000),
  ]);
  const set = new Set<string>();
  for (const r of (p.data ?? []) as Array<{ sku: string | null }>) if (r.sku) set.add(r.sku.toUpperCase());
  for (const r of (v.data ?? []) as Array<{ sku: string | null }>) if (r.sku) set.add(r.sku.toUpperCase());
  return set;
}
