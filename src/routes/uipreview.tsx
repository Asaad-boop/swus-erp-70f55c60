import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { OrdersStatusTabs } from "@/components/erp/orders/orders-status-tabs";
import { OrdersToolbar } from "@/components/erp/orders/orders-toolbar";
import { OrdersPagination } from "@/components/erp/orders/orders-pagination";
import { OrdersTable } from "@/components/erp/orders/orders-table";
import { BrandProvider } from "@/contexts/brand-context";
import type { OrdersFilter } from "@/hooks/erp/use-orders-query";

export const Route = createFileRoute("/uipreview")({ component: P });

function P() {
  const [filter, setFilter] = useState<OrdersFilter>({
    brandId: null, brandIds: [], search: "", statuses: ["pending"], source: null,
    dateFrom: null, dateTo: null, courier: null, page: 0, pageSize: 50,
    sortKey: "created_at", sortDir: "desc", courierBucket: null, paymentMethod: null,
    paymentStatus: null, city: null, assignee: null, amountMin: null, amountMax: null,
    advanceFilter: "any", printedFilter: "all",
  } as unknown as OrdersFilter);
  const counts: Record<string, number> = { pending: 42, packing: 12, ready_to_ship: 8, shipped: 30, in_transit: 55, delivered: 810, partial: 6, pending_return: 9, returned: 71, paid_return: 3, completed: 640, exchange: 2, on_hold: 4, cancelled: 27 };

  const rows = [1,2,3,4,5].map((i) => ({
    id: String(i), invoice_no: 1200 + i, order_no: "ORD-" + (1200+i), status: ["pending","shipped","delivered","returned","partial"][i-1],
    customer_name: ["Rahim Uddin","Karim Hossain","Sadia Akter","Tanvir Ahmed","Nusrat Jahan"][i-1],
    customer_phone: "0171234567" + i, address: "House 12, Road 4, Dhanmondi, Dhaka", city: "Dhaka",
    total: 1250 * i, advance_amount: i === 2 ? 500 : 0, advance_txn_id: i === 2 ? "TX1" : null,
    payment_method: ["cod","bkash","cod","nagad","cod"][i-1], payment_status: "unpaid",
    source: ["website","manual","shopify","website","facebook"][i-1], brand_id: null, brand_name: "Rocket Launcher",
    created_at: new Date(Date.now() - i * 3600e3).toISOString(), updated_at: new Date().toISOString(),
    printed_at: i % 2 ? new Date().toISOString() : null, items_count: i, item_summary: "Rocket Launcher x" + i,
  })) as never[];
  return (
    <BrandProvider><div className="min-h-screen bg-background p-6 space-y-4">
      <OrdersStatusTabs active="pending" counts={counts} total={1720} incompleteCount={14} onChange={() => {}} />
      <OrdersToolbar filter={filter} onChange={setFilter} density="comfortable" onDensityChange={() => {}} hiddenColumns={[]} onToggleColumn={() => {}} onResetColumns={() => {}} savedViews={[]} onSaveView={() => {}} />
      <div className="rounded-2xl border border-[var(--panel-border)] bg-card overflow-hidden"><OrdersTable rows={rows} loading={false} selectedIds={new Set()} onToggleSelect={() => {}} onToggleAll={() => {}} onRowClick={() => {}} onStatusChange={() => {}} pendingStatusIds={new Set()} shipmentsByOrderId={{}} flashOrderIds={new Set()} onSyncRow={() => {}} density="comfortable" hiddenColumns={[]} sortKey="created_at" sortDir="desc" onSortChange={() => {}} /><OrdersPagination rowsOnPage={5} page={0} pageSize={50} total={1720} onPage={() => {}} onPageSize={() => {}} /></div>
    </div></BrandProvider>
  );
}
