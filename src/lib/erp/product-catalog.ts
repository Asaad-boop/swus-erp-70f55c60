export type CatalogProduct = {
  id: string;
  title: string;
  slug: string;
  image: string | null;
  video_url: string | null;
  description: string | null;
  price: number;
  old_price: number | null;
  cost_price: number | null;
  weighted_avg_cost: number | null;
  stock: number;
  reserved_stock: number | null;
  available_stock: number | null;
  low_stock_threshold: number | null;
  reorder_point: number | null;
  reorder_qty: number | null;
  sku: string | null;
  barcode: string | null;
  brand_id: string | null;
  category_id: string | null;
  is_active: boolean;
  is_featured: boolean;
  is_new_arrival: boolean;
  is_preorder: boolean;
  is_combo: boolean;
  preorder_expected_date: string | null;
  age_group: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
  variants: Array<{ id: string; sku: string | null; stock: number; color_name: string | null; color_hex: string | null; is_active: boolean }>;
  listings: Array<{ id: string; brand_id: string; is_active: boolean }>;
};

/** Storefront/Shopify sync state derived from active flag + brand listings. */
export function syncState(p: CatalogProduct) {
  const live = p.listings.filter((l) => l.is_active).length;
  if (!p.is_active) return { label: "Off (inactive)", tone: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300", live };
  if (live > 0) return { label: `Synced · ${live} brand${live > 1 ? "s" : ""}`, tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", live };
  return { label: "Not listed", tone: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300", live };
}

const STOP = new Set(["the", "and", "with", "for", "pro", "new"]);

function tokenize(s: string) {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w.toLowerCase()));
}

export type SkuStyle = "brand-title-seq" | "brand-cat-seq" | "title-seq" | "compact";

export function skuPreview(opts: {
  style: SkuStyle;
  brandName?: string | null;
  categoryName?: string | null;
  title: string;
  seq: number;
  separator?: string;
  pad?: number;
}) {
  const sep = opts.separator ?? "-";
  const pad = opts.pad ?? 4;
  const brand = (opts.brandName ? tokenize(opts.brandName).join("") : "GEN").slice(0, 3) || "GEN";
  const cat = (opts.categoryName ? tokenize(opts.categoryName).join("") : "").slice(0, 3);
  const words = tokenize(opts.title);
  const titleCode = (words.length >= 2
    ? words.slice(0, 3).map((w) => w.slice(0, 2)).join("")
    : (words[0] ?? "ITEM").slice(0, 5)
  ).slice(0, 6);
  const n = String(opts.seq).padStart(pad, "0");
  switch (opts.style) {
    case "brand-cat-seq":
      return [brand, cat || titleCode, n].filter(Boolean).join(sep);
    case "title-seq":
      return [titleCode, n].join(sep);
    case "compact":
      return `${brand}${titleCode}${n}`;
    default:
      return [brand, titleCode, n].join(sep);
  }
}

export function exportCatalogCsv(rows: CatalogProduct[], brandName: (id: string | null) => string, catName: (id: string | null) => string) {
  const headers = [
    "ID", "Title", "SKU", "Barcode", "Brand", "Category", "Status", "Price", "Old price", "Cost", "WAC",
    "Stock", "Reserved", "Available", "Threshold", "Reorder point", "Variants", "Listings", "Featured",
    "New arrival", "Pre-order", "Combo", "Slug", "Created", "Updated",
  ];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const p of rows) {
    lines.push([
      p.id.slice(0, 8), p.title, p.sku ?? "", p.barcode ?? "", brandName(p.brand_id), catName(p.category_id),
      p.is_active ? "active" : "inactive", p.price, p.old_price ?? "", p.cost_price ?? "", p.weighted_avg_cost ?? "",
      p.stock, p.reserved_stock ?? 0, p.available_stock ?? "", p.low_stock_threshold ?? "", p.reorder_point ?? "",
      p.variants.length, p.listings.length, p.is_featured ? "yes" : "", p.is_new_arrival ? "yes" : "",
      p.is_preorder ? "yes" : "", p.is_combo ? "yes" : "", p.slug, p.created_at, p.updated_at,
    ].map(esc).join(","));
  }
  return lines.join("\n");
}
