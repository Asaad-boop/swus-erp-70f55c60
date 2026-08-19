import { useCallback, useEffect, useState } from "react";

export type Density = "comfortable" | "compact";

export const ORDER_COLUMNS: { id: string; label: string; lockable?: boolean }[] = [
  { id: "date", label: "Date" },
  { id: "invoice", label: "Invoice" },
  { id: "brand", label: "Brand" },
  { id: "products", label: "Products" },
  { id: "customer", label: "Customer" },
  { id: "note", label: "Note" },
  { id: "status", label: "Status" },
  { id: "total", label: "Total" },
  { id: "courier", label: "Courier" },
  { id: "source", label: "Source" },
  { id: "live_courier_status", label: "Live Status" },
];

const KEY = "erp.orders.prefs.v1";

type Prefs = { density: Density; hidden: string[] };

const DEFAULT: Prefs = { density: "comfortable", hidden: [] };

function read(): Prefs {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      density: p.density === "compact" ? "compact" : "comfortable",
      hidden: Array.isArray(p.hidden) ? p.hidden.filter((x) => typeof x === "string") : [],
    };
  } catch {
    return DEFAULT;
  }
}

export function useOrdersPrefs() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT);

  // Read after mount to avoid SSR/hydration mismatch.
  useEffect(() => { setPrefs(read()); }, []);

  const persist = useCallback((next: Prefs) => {
    setPrefs(next);
    try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  const setDensity = useCallback((density: Density) => {
    persist({ ...read(), density });
  }, [persist]);

  const toggleColumn = useCallback((id: string) => {
    const cur = read();
    const hidden = cur.hidden.includes(id) ? cur.hidden.filter((x) => x !== id) : [...cur.hidden, id];
    persist({ ...cur, hidden });
  }, [persist]);

  const resetColumns = useCallback(() => { persist({ ...read(), hidden: [] }); }, [persist]);

  return { density: prefs.density, hiddenColumns: prefs.hidden, setDensity, toggleColumn, resetColumns };
}

/* ---------------- Saved views ---------------- */

export type SavedView = { id: string; name: string; search: Record<string, unknown> };

const VIEWS_KEY = "erp.orders.views.v1";

export function readSavedViews(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(VIEWS_KEY);
    const arr = raw ? (JSON.parse(raw) as SavedView[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function writeSavedViews(views: SavedView[]) {
  try { window.localStorage.setItem(VIEWS_KEY, JSON.stringify(views)); } catch { /* ignore */ }
}

export function useSavedViews() {
  const [views, setViews] = useState<SavedView[]>([]);
  useEffect(() => { setViews(readSavedViews()); }, []);
  const save = useCallback((name: string, search: Record<string, unknown>) => {
    const next = [...readSavedViews().filter((v) => v.name !== name), { id: crypto.randomUUID(), name, search }];
    writeSavedViews(next);
    setViews(next);
  }, []);
  const remove = useCallback((id: string) => {
    const next = readSavedViews().filter((v) => v.id !== id);
    writeSavedViews(next);
    setViews(next);
  }, []);
  return { views, save, remove };
}
