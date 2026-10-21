import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  countAbandonedCartsFn,
  listAbandonedCartsFn,
} from "@/lib/erp/abandoned-carts.functions";

export type IncompleteFilters = {
  dateFrom?: string | null;
  dateTo?: string | null;
  subtotalMin?: number | null;
  subtotalMax?: number | null;
  lastSteps?: string[];
  followupStatuses?: string[];
  sort?: "newest" | "oldest" | "highest" | "lowest" | "priority";
};

export function useAbandonedCartsQuery(args: {
  brandId: string | null;
  brandIds?: string[];
  search: string;
  page: number;
  pageSize: number;
  enabled: boolean;
} & IncompleteFilters) {
  const listAbandonedCarts = useServerFn(listAbandonedCartsFn);

  return useQuery({
    queryKey: [
      "abandoned-carts",
      args.brandId,
      (args.brandIds ?? []).join(","),
      args.search,
      args.page,
      args.pageSize,
      args.dateFrom ?? null,
      args.dateTo ?? null,
      args.subtotalMin ?? null,
      args.subtotalMax ?? null,
      (args.lastSteps ?? []).join(","),
      (args.followupStatuses ?? []).join(","),
      args.sort ?? "newest",
    ],
    enabled: args.enabled,
    // Safety net alongside the realtime subscription: quiet background refresh
    // so a missed event never leaves the tab stale.
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      return listAbandonedCarts({
        data: {
          brandId: args.brandId,
          brandIds: args.brandIds,
          search: args.search,
          page: args.page,
          pageSize: args.pageSize,
          dateFrom: args.dateFrom ?? null,
          dateTo: args.dateTo ?? null,
          subtotalMin: args.subtotalMin ?? null,
          subtotalMax: args.subtotalMax ?? null,
          lastSteps: args.lastSteps,
          followupStatuses: args.followupStatuses,
          sort: args.sort ?? "newest",
        },
      });
    },
  });
}

export function useAbandonedCartCount(brandId: string | null, brandIds?: string[]) {
  const countAbandonedCarts = useServerFn(countAbandonedCartsFn);

  return useQuery({
    queryKey: ["abandoned-carts-count", brandId, (brandIds ?? []).join(",")],
    enabled: true,
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const res = await countAbandonedCarts({ data: { brandId, brandIds } });
      return res.count;
    },
  });
}
