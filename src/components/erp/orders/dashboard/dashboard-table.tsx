import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  MessageSquare,
  Package,
  Truck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { statusBadge } from "@/lib/erp/orders";
import {
  getOrderDashboardDetail,
  type DashboardOrderRow,
} from "@/lib/erp/orders-dashboard.functions";
import { money } from "./dashboard-kpis";

export type SortKey =
  | "created_at"
  | "total"
  | "status"
  | "delivered_at"
  | "confirmed_at"
  | "invoice_no";

const COLUMNS: { key: string; label: string; always?: boolean }[] = [
  { key: "invoice", label: "Invoice", always: true },
  { key: "date", label: "Date", always: true },
  { key: "customer", label: "Customer", always: true },
  { key: "items", label: "Items" },
  { key: "amount", label: "Amount", always: true },
  { key: "payment", label: "Payment" },
  { key: "status", label: "Status", always: true },
  { key: "courier", label: "Courier" },
  { key: "source", label: "Source" },
  { key: "staff", label: "Staff" },
  { key: "tags", label: "Tags" },
];

export const DEFAULT_COLUMNS = COLUMNS.filter((c) => c.key !== "tags").map((c) => c.key);
export const ALL_COLUMNS = COLUMNS;

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function OrderDetail({ orderId }: { orderId: string }) {
  const fetchDetail = useServerFn(getOrderDashboardDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["order-dashboard-detail", orderId],
    queryFn: () => fetchDetail({ data: { orderId } }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading details…
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="grid gap-4 bg-muted/30 p-4 text-sm lg:grid-cols-4">
      <div>
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
          <Package className="h-3.5 w-3.5" /> Status timeline
        </div>
        {data.timeline.length === 0 ? (
          <p className="text-xs text-muted-foreground">No history.</p>
        ) : (
          <ol className="space-y-1.5">
            {data.timeline.map((t) => (
              <li key={t.id} className="border-l-2 pl-2">
                <div className="text-xs">
                  <span className="font-medium">{statusBadge(t.to_status ?? "").label}</span>
                  {t.from_status ? <span className="text-muted-foreground"> ← {statusBadge(t.from_status).label}</span> : null}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {fmtDate(t.created_at)}
                  {t.changed_by_name ? ` · ${t.changed_by_name}` : ""}
                  {t.reason ? ` · ${t.reason}` : ""}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
          <MessageSquare className="h-3.5 w-3.5" /> Notes
        </div>
        {data.notes.length === 0 ? (
          <p className="text-xs text-muted-foreground">No notes.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.notes.map((n) => (
              <li key={n.id} className="rounded border bg-background p-1.5">
                <p className="text-xs">{n.body}</p>
                <p className="text-[11px] text-muted-foreground">
                  {n.author ?? "system"} · {fmtDate(n.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">SMS log</div>
        {data.sms.length === 0 ? (
          <p className="text-xs text-muted-foreground">No SMS sent.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.sms.map((s) => (
              <li key={s.id} className="rounded border bg-background p-1.5">
                <p className="line-clamp-2 text-xs">{s.message}</p>
                <p className="text-[11px] text-muted-foreground">
                  {s.template_key ?? "custom"} · {s.status ?? "—"} · {fmtDate(s.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
          <Truck className="h-3.5 w-3.5" /> Shipments
        </div>
        {data.shipments.length === 0 ? (
          <p className="text-xs text-muted-foreground">No shipment booked.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.shipments.map((s) => (
              <li key={s.id} className="rounded border bg-background p-1.5 text-xs">
                <div className="font-medium">{s.provider ?? "—"} · {s.consignment_id ?? "—"}</div>
                <div className="text-[11px] text-muted-foreground">
                  {s.status ?? "—"} · fee {money(s.delivery_fee)} · {fmtDate(s.created_at)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function DashboardTable({
  rows,
  loading,
  columns,
  sort,
  dir,
  onSort,
}: {
  rows: DashboardOrderRow[];
  loading: boolean;
  columns: string[];
  sort: string;
  dir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const show = (k: string) => columns.includes(k);

  const SortHead = ({ label, k }: { label: string; k: SortKey }) => (
    <button className="flex items-center gap-1 hover:text-foreground" onClick={() => onSort(k)}>
      {label}
      {sort === k ? (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : null}
    </button>
  );

  if (loading) {
    return (
      <div className="space-y-2 rounded-lg border p-3">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">
        এই filter-এ কোনো order নেই।
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr className="[&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-2 [&>th]:text-left">
            <th className="w-8" />
            {show("invoice") && <th><SortHead label="Invoice" k="invoice_no" /></th>}
            {show("date") && <th><SortHead label="Date" k="created_at" /></th>}
            {show("customer") && <th>Customer</th>}
            {show("items") && <th>Items</th>}
            {show("amount") && <th className="!text-right"><span className="flex justify-end"><SortHead label="Amount" k="total" /></span></th>}
            {show("payment") && <th>Payment</th>}
            {show("status") && <th><SortHead label="Status" k="status" /></th>}
            {show("courier") && <th>Courier</th>}
            {show("source") && <th>Source</th>}
            {show("staff") && <th>Staff</th>}
            {show("tags") && <th>Tags</th>}
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const b = statusBadge(r.status);
            const open = expanded === r.id;
            return (
              <>
                <tr
                  key={r.id}
                  className={cn("border-t hover:bg-muted/40 [&>td]:px-3 [&>td]:py-2 [&>td]:align-top", open && "bg-muted/40")}
                >
                  <td>
                    <button onClick={() => setExpanded(open ? null : r.id)} className="text-muted-foreground">
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  </td>
                  {show("invoice") && (
                    <td className="whitespace-nowrap font-medium">
                      {r.invoice_no ?? r.id.slice(0, 8)}
                      {r.is_preorder && <Badge variant="outline" className="ml-1.5 h-4 px-1 text-[10px]">PRE</Badge>}
                      <div className="text-[11px] font-normal text-muted-foreground">{r.brand_name ?? "—"}</div>
                    </td>
                  )}
                  {show("date") && (
                    <td className="whitespace-nowrap text-xs text-muted-foreground">
                      {fmtDate(r.created_at)}
                      {r.delivered_at && <div className="text-emerald-600 dark:text-emerald-400">✓ {fmtDate(r.delivered_at)}</div>}
                    </td>
                  )}
                  {show("customer") && (
                    <td>
                      <div className="max-w-[180px] truncate">{r.customer_name ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {r.phone ?? "—"}{r.city ? ` · ${r.city}` : ""}
                      </div>
                    </td>
                  )}
                  {show("items") && (
                    <td className="max-w-[240px]">
                      <div className="truncate text-xs">
                        {r.items.slice(0, 2).map((i) => `${i.name ?? "—"}${i.variant_label ? ` (${i.variant_label})` : ""} ×${i.quantity}`).join(", ")}
                      </div>
                      {r.item_count > 2 && <div className="text-[11px] text-muted-foreground">+{r.item_count - 2} more · {r.total_qty} pcs</div>}
                    </td>
                  )}
                  {show("amount") && (
                    <td className="whitespace-nowrap text-right tabular-nums">
                      {money(r.total)}
                      {Number(r.advance_amount ?? 0) > 0 && (
                        <div className="text-[11px] text-blue-600 dark:text-blue-400">adv {money(r.advance_amount)}</div>
                      )}
                      {r.cod_due > 0 && <div className="text-[11px] text-amber-600 dark:text-amber-400">COD {money(r.cod_due)}</div>}
                    </td>
                  )}
                  {show("payment") && (
                    <td className="whitespace-nowrap text-xs">
                      <Badge variant={r.payment_status === "paid" ? "default" : "secondary"} className="h-5">
                        {r.payment_status ?? "—"}
                      </Badge>
                      {r.advance_txn_id && <div className="text-[11px] text-muted-foreground">{r.advance_txn_id}</div>}
                    </td>
                  )}
                  {show("status") && (
                    <td className="whitespace-nowrap">
                      <Badge variant="outline" className={cn("h-5", b.className)}>{b.label}</Badge>
                      {r.reconciliation_status && (
                        <div className="text-[11px] text-muted-foreground">{r.reconciliation_status}</div>
                      )}
                    </td>
                  )}
                  {show("courier") && (
                    <td className="whitespace-nowrap text-xs">
                      {r.courier_name ?? "—"}
                      {r.tracking_number && <div className="text-[11px] text-muted-foreground">{r.tracking_number}</div>}
                      {r.courier_status && <div className="text-[11px] text-muted-foreground">{r.courier_status}</div>}
                    </td>
                  )}
                  {show("source") && (
                    <td className="whitespace-nowrap text-xs">
                      {r.source ?? "—"}
                      {r.utm_campaign && <div className="max-w-[120px] truncate text-[11px] text-muted-foreground">{r.utm_campaign}</div>}
                    </td>
                  )}
                  {show("staff") && (
                    <td className="whitespace-nowrap text-xs">
                      {r.confirmed_by_name ?? "—"}
                      {r.packaged_by_name && <div className="text-[11px] text-muted-foreground">pack: {r.packaged_by_name}</div>}
                    </td>
                  )}
                  {show("tags") && (
                    <td>
                      <div className="flex max-w-[160px] flex-wrap gap-1">
                        {(r.tags ?? []).map((t) => (
                          <Badge key={t} variant="secondary" className="h-4 px-1 text-[10px]">{t}</Badge>
                        ))}
                      </div>
                    </td>
                  )}
                  <td>
                    <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                      <Link to="/erp/orders/$orderId" params={{ orderId: r.id }}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </td>
                </tr>
                {open && (
                  <tr key={`${r.id}-detail`} className="border-t">
                    <td colSpan={columns.length + 2} className="p-0">
                      <OrderDetail orderId={r.id} />
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}