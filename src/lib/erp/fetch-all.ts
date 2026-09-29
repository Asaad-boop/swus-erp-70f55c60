/**
 * Supabase/PostgREST caps every response at 1000 rows. Dashboard aggregates
 * that sum rows client-side must page through the full result set, otherwise
 * totals silently truncate at 1000 (e.g. "Orders: 1000").
 *
 * `make` receives (from, to) and must return the same query with `.range(from, to)`
 * applied. Loops until a short page arrives.
 */
const PAGE = 1000;

export async function fetchAllRows<T = any>(
  make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await make(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}
