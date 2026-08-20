import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { OrdersStatusTabs } from "@/components/erp/orders/orders-status-tabs";
import { OrdersToolbar } from "@/components/erp/orders/orders-toolbar";
import { OrdersPagination } from "@/components/erp/orders/orders-pagination";
import type { OrdersFilter } from "@/hooks/erp/use-orders-query";

export const Route = createFileRoute("/uipreview")({ component: P });

function P() {
  const [filter, setFilter] = useState<OrdersFilter>({
    brandId: null, brandIds: [], search: "", statuses: ["pending"], source: null,
    dateFrom: null, dateTo: null, courier: null, page: 0, pageSize: 50,
    sortKey: "created_at", sortDir: "desc", courierBucket: null, paymentMethod: null,
    paymentStatus: null, city: null, assignee: null, amountMin: null, amountMax: null,
    advanceFilter: "any", printedFilter: "all",
  } as OrdersFilter);
  const counts: Record<string, number> = { pending: 42, packing: 12, ready_to_ship: 8, shipped: 30, in_transit: 55, delivered: 810, partial: 6, pending_return: 9, returned: 71, paid_return: 3, completed: 640, exchange: 2, on_hold: 4, cancelled: 27 };
  return (
    <div className="min-h-screen bg-background p-6 space-y-4">
      <OrdersStatusTabs active="pending" counts={counts} total={1720} incompleteCount={14} onChange={() => {}} />
      <OrdersToolbar filter={filter} onChange={setFilter} density="comfortable" onDensityChange={() => {}} hiddenColumns={[]} onToggleColumn={() => {}} onResetColumns={() => {}} savedViews={[]} onSaveView={() => {}} />
      <OrdersPagination page={0} pageSize={50} total={1720} onPage={() => {}} onPageSize={() => {}} />
    </div>
  );
}
