import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ProductRow, StockMovementRow, VariantRow } from "@/lib/erp/inventory";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";

export type StockState = "all" | "in" | "low" | "out" | "reserved";
export type SortBy = "updated" | "title" | "stock" | "price";

export type InventoryFilter = {
  brandIds: string[];
  search: string;
  stockState: StockState;
  categoryId: string; // "all" or uuid
  sortBy: SortBy;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
};

export const DEFAULT_INVENTORY_FILTER: InventoryFilter = {
  brandIds: [],
  search: "",
  stockState: "all",
  categoryId: "all",
  sortBy: "updated",
  sortDir: "desc",
  page: 0,
  pageSize: 50,
};

const SORT_COLUMN: Record<SortBy, string> = {
  updated: "updated_at",
  title: "title",
  stock: "stock",
  price: "price",
};

/** Apply brand / search / category / active filters shared by list + summary. */
function applyCommon<T>(query: T, filter: InventoryFilter): T {
  let q = applyBrandScope(query, filter.brandIds) as any;
  q = q.eq("is_active", true);
  if (filter.categoryId && filter.categoryId !== "all") q = q.eq("category_id", filter.categoryId);
  const s = filter.search.trim();
  if (s) {
    const esc = s.replace(/[,()]/g, " ");
    q = q.or(`title.ilike.%${esc}%,sku.ilike.%${esc}%,barcode.ilike.%${esc}%,slug.ilike.%${esc}%`);
  }
  return q as T;
}

const PRODUCT_SELECT =
  "id,title,slug,image,video_url,price,stock,low_stock_threshold,is_active,brand_id,category_id,updated_at,cost_price,sku,barcode,reorder_point,reorder_qty,reserved_stock,available_stock,weighted_avg_cost,is_preorder,preorder_expected_date,product_variants(id,product_id,sku,stock,reserved_stock,available_stock,reorder_point,weighted_avg_cost,is_active,color_name,color_hex,image,display_order)";

function mapRow(d: Record<string, unknown>): ProductRow {
  const variantsRaw = (d.product_variants as Array<Record<string, unknown>> | null) ?? [];
  const variants: VariantRow[] = variantsRaw.map((v) => ({
    id: v.id as string,
    product_id: v.product_id as string,
    sku: (v.sku as string | null) ?? null,
    stock: Number(v.stock ?? 0),
    reserved_stock: Number(v.reserved_stock ?? 0),
    available_stock: Number(v.available_stock ?? (Number(v.stock ?? 0) - Number(v.reserved_stock ?? 0))),
    reorder_point: Number(v.reorder_point ?? 0),
    weighted_avg_cost: Number(v.weighted_avg_cost ?? 0),
    is_active: (v.is_active as boolean | null) ?? true,
    color_name: (v.color_name as string | null) ?? null,
    color_hex: (v.color_hex as string | null) ?? null,
    image: (v.image as string | null) ?? null,
    display_order: Number(v.display_order ?? 0),
  }));
  const variant_skus = variants.map((v) => v.sku).filter((s): s is string => !!s);
  const { product_variants: _pv, ...rest } = d;
  return { ...rest, variant_skus, variants } as ProductRow;
}

/**
 * "Low stock" compares two columns (stock <= low_stock_threshold) which PostgREST
 * cannot express, so we resolve the matching ids first and page over them.
 */
async function resolveLowStockIds(filter: InventoryFilter): Promise<string[]> {
  let q = applyCommon(
    supabase.from("products").select("id,stock,low_stock_threshold,updated_at,title,price"),
    filter,
  ) as any;
  q = q.gt("stock", 0).limit(10000);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; stock: number; low_stock_threshold: number | null }>;
  return rows.filter((r) => r.stock <= (r.low_stock_threshold ?? 5)).map((r) => r.id);
}

export function useInventoryQuery(filter: InventoryFilter) {
  return useQuery({
    queryKey: ["inventory", filter],
    enabled: filter.brandIds.length > 0,
    queryFn: async () => {
      const asc = filter.sortDir === "asc";
      const from = filter.page * filter.pageSize;
      const to = from + filter.pageSize - 1;

      let rows: ProductRow[] = [];
      let total = 0;

      if (filter.stockState === "low") {
        const ids = await resolveLowStockIds(filter);
        total = ids.length;
        if (ids.length) {
          const pageIds = ids.slice(from, from + filter.pageSize);
          if (pageIds.length) {
            const { data, error } = await supabase
              .from("products")
              .select(PRODUCT_SELECT)
              .in("id", pageIds)
              .order(SORT_COLUMN[filter.sortBy], { ascending: asc });
            if (error) throw error;
            rows = ((data ?? []) as Array<Record<string, unknown>>).map(mapRow);
          }
        }
      } else {
        let q = applyCommon(supabase.from("products").select(PRODUCT_SELECT, { count: "exact" }), filter) as any;
        if (filter.stockState === "out") q = q.lte("stock", 0);
        if (filter.stockState === "in") q = q.gt("stock", 0);
        if (filter.stockState === "reserved") q = q.gt("reserved_stock", 0);
        q = q.order(SORT_COLUMN[filter.sortBy], { ascending: asc }).range(from, to);
        const { data, error, count } = await q;
        if (error) throw error;
        rows = ((data ?? []) as Array<Record<string, unknown>>).map(mapRow);
        total = count ?? rows.length;
      }

      // Fetch incoming quantities from imports view
      if (rows.length > 0 && filter.brandIds.length > 0) {
        const ids = rows.map((r) => r.id);
        const { data: inc } = await applyBrandScope(
          supabase.from("v_product_incoming").select("product_id,incoming"),
          filter.brandIds,
        ).in("product_id", ids);
        const map = new Map<string, number>();
        for (const r of (inc ?? []) as Array<{ product_id: string; incoming: number }>) {
          map.set(r.product_id, Number(r.incoming) || 0);
        }
        rows = rows.map((r) => ({ ...r, incoming: map.get(r.id) ?? 0 }));
      }

      return { rows, total };
    },
  });
}

export type InventorySummary = {
  products: number;
  units: number;
  value: number;
  reserved: number;
  low: number;
  out: number;
};

/** Aggregates across the whole filtered set (not just the current page). */
export function useInventorySummary(filter: InventoryFilter) {
  const key = {
    brandIds: filter.brandIds,
    search: filter.search,
    categoryId: filter.categoryId,
  };
  return useQuery({
    queryKey: ["inventory-summary", key],
    enabled: filter.brandIds.length > 0,
    queryFn: async (): Promise<InventorySummary> => {
      const q = applyCommon(
        supabase
          .from("products")
          .select("id,stock,reserved_stock,weighted_avg_cost,cost_price,low_stock_threshold"),
        filter,
      ) as any;
      const { data, error } = await q.limit(20000);
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        stock: number | null;
        reserved_stock: number | null;
        weighted_avg_cost: number | null;
        cost_price: number | null;
        low_stock_threshold: number | null;
      }>;
      const s: InventorySummary = { products: rows.length, units: 0, value: 0, reserved: 0, low: 0, out: 0 };
      for (const r of rows) {
        const stock = Number(r.stock ?? 0);
        s.units += stock;
        s.value += Number(r.weighted_avg_cost ?? r.cost_price ?? 0) * stock;
        s.reserved += Number(r.reserved_stock ?? 0);
        if (stock <= 0) s.out += 1;
        else if (stock <= Number(r.low_stock_threshold ?? 5)) s.low += 1;
      }
      return s;
    },
  });
}

export function useProductCategories(brandIds: string[]) {
  return useQuery({
    queryKey: ["product-categories", brandIds.join(",")],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      const { data, error } = await applyBrandScope(
        supabase.from("categories").select("id,name,brand_id").order("name"),
        brandIds,
      );
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; brand_id: string | null }>;
    },
  });
}

export function useLowStockAlerts(brandIds: string[]) {
  return useQuery({
    queryKey: ["low-stock", brandIds.join(",")],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      let q = supabase
        .from("low_stock_alerts")
        .select("id,product_id,current_stock,threshold,created_at,is_resolved,products!inner(id,title,slug,image,brand_id,stock,low_stock_threshold)")
        .eq("is_resolved", false)
        .order("created_at", { ascending: false })
        .limit(200);
      if (brandIds.length > 0) q = q.in("products.brand_id", brandIds);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useStockMovements(brandIds: string[], productId?: string | null) {
  return useQuery({
    queryKey: ["stock-movements", brandIds.join(","), productId ?? null],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      let q = supabase
        .from("stock_movements")
        .select("id,created_at,product_id,variant_id,user_id,delta,stock_before,stock_after,running_stock,reason,note,brand_id,unit_cost_bdt,total_cost_bdt,movement_source")
        .order("created_at", { ascending: false })
        .limit(500);
      q = applyBrandScope(q, brandIds);
      if (productId) q = q.eq("product_id", productId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as StockMovementRow[];
    },
  });
}

export function useProductTitles(ids: string[]) {
  return useQuery({
    queryKey: ["product-titles", ids.sort().join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,title,slug,image")
        .in("id", ids);
      if (error) throw error;
      const map = new Map<string, { title: string; slug: string; image: string | null }>();
      for (const p of data ?? []) map.set(p.id, { title: p.title, slug: p.slug, image: p.image });
      return map;
    },
  });
}
