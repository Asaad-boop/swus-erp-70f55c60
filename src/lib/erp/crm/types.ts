export type CrmSegment =
  | "new"
  | "one_time"
  | "repeat"
  | "vip"
  | "at_risk"
  | "lost"
  | "blocked";

export type CrmCustomerRow = {
  customer_key: string;
  name: string | null;
  email: string | null;
  user_id: string | null;
  is_registered: boolean;
  orders_count: number;
  valid_orders_count: number;
  cancelled_orders_count: number;
  lifetime_value: number;
  avg_order_value: number;
  first_order_at: string | null;
  last_order_at: string | null;
  brand_ids: string[] | null;
  meta_status: string | null;
  segment: CrmSegment;
  tags: string[];
};

export type CrmListResponse = {
  rows: CrmCustomerRow[];
  total: number;
  kpis: {
    totalCustomers: number;
    newThisMonth: number;
    activeLast30: number;
    totalLtv: number;
    avgLtv: number;
    avgAov: number;
    segmentCounts: Record<CrmSegment, number>;
    newTrend: { date: string; count: number }[];
  };
};

export type CrmFilters = {
  search?: string;
  brandIds?: string[];
  type?: "all" | "registered" | "guest";
  orderType?: "valid" | "cancelled" | "all";
  segment?: CrmSegment | "all";
  tag?: string;
  minSpend?: number;
  maxSpend?: number;
  minOrders?: number;
  maxOrders?: number;
  lastOrderFrom?: string;
  lastOrderTo?: string;
  hasEmail?: boolean;
};

export type CrmSort =
  | "ltv_desc"
  | "ltv_asc"
  | "orders_desc"
  | "orders_asc"
  | "last_order_desc"
  | "last_order_asc"
  | "first_order_desc";