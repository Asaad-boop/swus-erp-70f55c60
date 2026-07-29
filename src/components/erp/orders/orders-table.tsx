import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, FileText, Printer, ImageDown, Pencil, Send, X as XIcon, ListPlus, StickyNote, Phone, MapPin, Copy, ImageIcon, MessageSquare, ArrowRight, RefreshCcw, Check, CheckCircle2, Hash, ExternalLink, CalendarClock } from "lucide-react";
import { format } from "date-fns";
import { Link } from "@tanstack/react-router";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { customerName, customerPhone, invoiceDisplay, reconcileBadge, settlementBadge, statusAccent, statusAge, statusBadge, statusSinceTs, STATUS_GROUPS, type OrderRow, type OrderStatus } from "@/lib/erp/orders";
import { useCustomerHistory, useCourierHistory, type CourierProviderStat } from "@/hooks/erp/use-orders-query";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { CopyIconBtn, PhoneActions } from "@/components/erp/orders/contact-actions";
import { AdvanceBadge } from "@/components/erp/orders/advance-badge";
import { BrandBadge } from "@/components/erp/brand-badge";
import { CourierStatusBadge } from "@/components/erp/orders/courier-status-badge";
import type { CourierShipmentRow } from "@/hooks/erp/use-courier-shipments";

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  confirmed: "ready_to_pack",
  ready_to_pack: "packed",
  packed: "ready_to_ship",
  ready_to_ship: "shipped",
  shipped: "in_transit",
  in_transit: "delivered",
  pending_return: "returned",
  exchange: "exchanged",
};

function courierTrackingUrl(provider: string, tracking: string): string {
  const t = encodeURIComponent(tracking);
  if (provider.includes("pathao")) return `https://merchant.pathao.com/tracking?consignment_id=${t}`;
  if (provider.includes("steadfast")) return `https://steadfast.com.bd/t/${t}`;
  return `https://www.google.com/search?q=${t}+courier+tracking`;
}

type Props = {
  rows: OrderRow[];
  loading: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onRowClick: (id: string) => void;
  onStatusChange: (id: string, status: OrderStatus) => void;
  pendingStatusIds?: Set<string>;
  shipmentsByOrderId?: Record<string, CourierShipmentRow>;
  flashOrderIds?: Set<string>;
  onSyncRow?: (orderId: string) => void;
  onPreorder?: (orderId: string) => void;
};


export function OrdersTable({ rows, loading, selectedIds, onToggleSelect, onToggleAll, onRowClick, onStatusChange, pendingStatusIds, shipmentsByOrderId, flashOrderIds, onSyncRow, onPreorder }: Props) {
  const copyText = (text: string, label: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.success(`${label} copied`));
  };

  const columns: ColumnDef<OrderRow>[] = [
    {
      id: "select",
      header: () => (
        <div className="pl-1">
          <Checkbox
            checked={rows.length > 0 && rows.every((r) => selectedIds.has(r.id))}
            onCheckedChange={(v) => onToggleAll(!!v)}
            aria-label="Select all"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="relative pl-1">
          <span
            aria-hidden
            className="absolute left-[-12px] top-1/2 -translate-y-1/2 h-8 w-[3px] rounded-r-full"
            style={{ backgroundColor: statusAccent(row.original.status) }}
          />
          <Checkbox
            checked={selectedIds.has(row.original.id)}
            onCheckedChange={() => onToggleSelect(row.original.id)}
            onClick={(e) => e.stopPropagation()}
            aria-label="Select row"
          />
        </div>
      ),
      size: 40,
    },
    {
      header: "Date",
      cell: ({ row }) => (
        <div className="text-xs leading-tight whitespace-nowrap">
          <div className="font-medium">{format(new Date(row.original.created_at), "dd/MM/yyyy,")}</div>
          <div>{format(new Date(row.original.created_at), "h:mm a")}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{relTime(row.original.created_at)}</div>
        </div>
      ),
    },
    {
      header: "Invoice",
      cell: ({ row }) => {
        const inv = invoiceDisplay(row.original);
        const printedAt = row.original.printed_at;
        return (
          <div className="flex items-center gap-1 whitespace-nowrap">
            <span className="font-mono text-xs font-semibold">{inv}</span>
            <button
              onClick={(e) => { e.stopPropagation(); copyText(inv, "Invoice"); }}
              className="p-0.5 rounded hover:bg-muted text-muted-foreground"
              title="Copy invoice number"
            >
              <Copy className="h-3 w-3" />
            </button>
            <span
              title={printedAt ? `Printed ${format(new Date(printedAt), "dd/MM/yyyy h:mm a")}` : "Not printed yet"}
              className={cn(
                "inline-flex items-center justify-center h-5 w-5 rounded-md ring-1 ring-inset shadow-sm",
                printedAt
                  ? "bg-emerald-500 text-white ring-emerald-600 dark:bg-emerald-500 dark:text-white dark:ring-emerald-400"
                  : "bg-muted text-muted-foreground/70 ring-border",
              )}
              aria-label={printedAt ? "Printed" : "Not printed"}
            >
              <Printer className="h-3.5 w-3.5" strokeWidth={2.75} />
            </span>
          </div>
        );
      },
    },
    {
      header: "Brand",
      cell: ({ row }) => <BrandBadge brandId={row.original.brand_id} />,
    },
    {
      header: "Products",
      cell: ({ row }) => <ProductsCell items={row.original.items ?? []} />,
    },
    {
      header: "Customer",
      cell: ({ row }) => {
        const o = row.original;
        const phone = customerPhone(o);
        const addr = [o.shipping_address, o.shipping_city, o.shipping_district].filter(Boolean).join(", ");
        const name = customerName(o);
        return (
          <div className="min-w-[220px] max-w-[280px]">
            <div className="text-xs space-y-0.5 min-w-0">
              <div className="flex items-center gap-1 min-w-0">
                <span className="font-semibold text-sm truncate text-foreground">{name}</span>
                {name && <CopyIconBtn value={name} label="Name" className="shrink-0" />}
              </div>
              {phone && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Phone className="h-3 w-3 shrink-0" />
                  <CustomerPhoneHistory
                    phone={phone}
                    brandId={o.brand_id}
                    currentOrderId={o.id}
                  />
                  <CourierRateBadge phone={phone} brandId={o.brand_id} />
                  <PhoneActions phone={phone} className="ml-auto" />
                </div>
              )}
              {addr && (
                <div className="flex items-start gap-1.5 text-muted-foreground/80">
                  <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                  <span className="line-clamp-2 leading-snug flex-1">{addr}</span>
                  <CopyIconBtn value={addr} label="Address" className="shrink-0 mt-0.5" />
                </div>
              )}
            </div>
          </div>
        );
      },
    },
    {
      header: "Note",
      cell: ({ row }) => {
        const o = row.original;
        const entries: { label: string; text: string; tone: string; iconBg: string; labelClr: string }[] = [];
        if (o.shipping_note?.trim()) entries.push({
          label: "Shipping Note", text: o.shipping_note,
          tone: "border-sky-300/70 dark:border-sky-900/50",
          iconBg: "bg-sky-50 dark:bg-sky-950/40 border-sky-100 dark:border-sky-900/50 text-sky-600 dark:text-sky-400",
          labelClr: "text-sky-700/80 dark:text-sky-400/80",
        });
        if (o.customer_note?.trim()) entries.push({
          label: "Customer Note", text: o.customer_note,
          tone: "border-amber-200/70 dark:border-amber-900/40",
          iconBg: "bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/50 text-amber-600 dark:text-amber-400",
          labelClr: "text-amber-700/70 dark:text-amber-400/70",
        });
        if (o.admin_notes?.trim()) entries.push({
          label: "Internal Note", text: o.admin_notes,
          tone: "border-violet-200/70 dark:border-violet-900/40",
          iconBg: "bg-violet-50 dark:bg-violet-950/40 border-violet-100 dark:border-violet-900/50 text-violet-600 dark:text-violet-400",
          labelClr: "text-violet-700/80 dark:text-violet-400/80",
        });
        if (entries.length === 0) return <span className="text-xs text-muted-foreground/50">—</span>;
        return (
          <div className="w-[210px] flex flex-col gap-1.5">
            {entries.map((e, i) => (
              <div key={i} className={cn("flex items-start gap-2 p-1.5 rounded-lg bg-white dark:bg-card border shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-md transition-all", e.tone)}>
                <div className={cn("mt-0.5 shrink-0 flex items-center justify-center w-5 h-5 rounded-md border shadow-inner", e.iconBg)}>
                  <MessageSquare className="h-3 w-3" strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className={cn("text-[9px] font-bold uppercase tracking-wider leading-none", e.labelClr)}>{e.label}</span>
                  <p className="text-xs leading-snug text-foreground font-semibold line-clamp-2">{e.text}</p>
                </div>
              </div>
            ))}
          </div>
        );
      },
    },
    {
      header: "Status",
      cell: ({ row }) => {
        const b = statusBadge(row.original.status);
        const accent = statusAccent(row.original.status);
        const settle = settlementBadge(row.original);
        const recon = reconcileBadge(row.original);
        const age = statusAge(statusSinceTs(row.original));
        const ageClass =
          age.tone === "fresh"
            ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60"
            : age.tone === "warn"
            ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60"
            : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60";
        return (
          <div className="flex flex-col gap-1 items-start">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={cn("inline-flex items-center gap-1.5 pl-1.5 pr-2.5 h-6 rounded-full text-[11px] font-semibold whitespace-nowrap", b.className)}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
                {b.label}
              </span>
              <span
                className={cn(
                  "inline-flex items-center h-5 px-1.5 rounded-full border text-[10px] font-semibold tabular-nums whitespace-nowrap",
                  ageClass,
                )}
                title={`Current status since ${new Date(statusSinceTs(row.original)).toLocaleString()}`}
              >
                {age.label}
              </span>
            </div>
            {settle && (
              <span className={cn("inline-flex items-center h-5 px-2 rounded-full border text-[10px] font-bold tracking-wide uppercase", settle.className)}>
                {settle.label}
              </span>
            )}
            {recon && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 h-5 px-1.5 rounded-full border text-[10px] font-semibold whitespace-nowrap",
                  recon.className,
                )}
                title={recon.tooltip}
              >
                <span aria-hidden>{recon.icon}</span>
                COD {recon.label}
              </span>
            )}
          </div>
        );
      },
    },
    {
      header: "Total",
      cell: ({ row }) => (
        <div className="text-right whitespace-nowrap">
          <div className="font-bold text-sm tabular-nums">৳{Number(row.original.total).toLocaleString()}</div>
          {row.original.payment_method && (
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{row.original.payment_method}</div>
          )}
          {row.original.actual_shipping_cost != null && Number(row.original.actual_shipping_cost) > 0 && (
            <div className="text-[10px] text-muted-foreground font-medium tabular-nums" title="Courier delivery cost">
              Delivery ৳{Number(row.original.actual_shipping_cost).toLocaleString()}
            </div>
          )}
          <AdvanceBadge advance={row.original.advance_amount} total={row.original.total} txnId={(row.original as any).advance_txn_id} variant="full" className="mt-1" />
        </div>
      ),
    },
    {
      header: "Courier",
      cell: ({ row }) => {
        const o = row.original;
        const uploaded = !!o.tracking_number;
        const provider = (o.courier_name ?? "").toLowerCase();
        const tone =
          provider.includes("pathao")
            ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60"
            : provider.includes("steadfast")
            ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60"
            : "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900/60";
        if (!o.courier_name && !uploaded) {
          return <span className="text-muted-foreground/50 text-xs">—</span>;
        }
        return (
          <div className="flex flex-col gap-1 whitespace-nowrap">
            {uploaded ? (
              <span className={cn("inline-flex items-center gap-1 pl-1.5 pr-2 h-5 rounded-full border text-[10px] font-bold uppercase tracking-wider w-fit shadow-sm", tone)}>
                <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
                {o.courier_name ?? "Booked"}
              </span>
            ) : (
              <span className="text-xs font-medium">{o.courier_name}</span>
            )}
            {o.tracking_number && (
              <div className="inline-flex items-center gap-1 w-fit">
                <a
                  href={courierTrackingUrl(provider, o.tracking_number)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-[10px] font-mono text-primary hover:underline"
                  title="Open courier tracking"
                >
                  <Hash className="h-2.5 w-2.5" />
                  {o.tracking_number}
                  <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                </a>
                <button
                  onClick={(e) => { e.stopPropagation(); copyText(o.tracking_number!, "Consignment ID"); }}
                  className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                  title="Copy consignment ID"
                >
                  <Copy className="h-2.5 w-2.5" />
                </button>
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: "Source",
      cell: ({ row }) => (
        <div className="text-xs capitalize whitespace-nowrap">{row.original.source ?? "—"}</div>
      ),
    },
    {
      header: "Live Status",
      id: "live_courier_status",
      cell: ({ row }) => {
        const o = row.original;
        const shipment = shipmentsByOrderId?.[o.id];
        const flash = flashOrderIds?.has(o.id) ?? false;
        if (!shipment) {
          if (!onSyncRow) return <span className="text-muted-foreground/40 text-xs">—</span>;
          return (
            <button
              onClick={(e) => { e.stopPropagation(); onSyncRow(o.id); }}
              className="opacity-0 group-hover/row:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted"
              title="Sync courier status"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          );
        }
        return (
          <div className="flex items-center gap-1">
            <CourierStatusBadge shipment={shipment} flash={flash} />
            {onSyncRow && (
              <button
                onClick={(e) => { e.stopPropagation(); onSyncRow(o.id); }}
                className="opacity-0 group-hover/row:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted"
                title="Re-sync courier status"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      },
    },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => {
        const o = row.original;
        const busy = pendingStatusIds?.has(o.id) ?? false;
        const next = NEXT_STATUS[o.status];
        const nextLabel = next ? statusBadge(next).label : null;
        return (
          <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => onRowClick(o.id)}>
                  <FileText className="h-4 w-4" /> Order Details
                </DropdownMenuItem>
                <DropdownMenuItem disabled><Printer className="h-4 w-4" /> Print</DropdownMenuItem>
                <DropdownMenuItem disabled><ImageDown className="h-4 w-4" /> JPG Export</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link
                    to="/erp/orders/$orderId"
                    params={{ orderId: o.id }}
                    className="flex items-center gap-2 w-full"
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </Link>
                </DropdownMenuItem>
                {next && nextLabel && (
                  <DropdownMenuItem onClick={() => onStatusChange(o.id, next)}>
                    <ArrowRight className="h-4 w-4" /> Next: {nextLabel}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <RefreshCcw className="h-4 w-4" /> Change Status
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="w-56 max-h-[60vh] overflow-y-auto">
                      {STATUS_GROUPS.map((g, gi) => (
                        <div key={g.key}>
                          {gi > 0 && <DropdownMenuSeparator />}
                          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground py-1">
                            {g.label}
                          </DropdownMenuLabel>
                          {g.statuses.map((s) => {
                            const b = statusBadge(s);
                            const active = o.status === s;
                            return (
                              <DropdownMenuItem
                                key={s}
                                disabled={active}
                                onClick={() => onStatusChange(o.id, s)}
                                className="gap-2"
                              >
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusAccent(s) }} />
                                <span className="flex-1">{b.label}</span>
                                {active && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
                              </DropdownMenuItem>
                            );
                          })}
                        </div>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
                <DropdownMenuItem onClick={() => onStatusChange(o.id, "ready_to_ship")} disabled={o.status === "ready_to_ship"}>
                  <Send className="h-4 w-4" /> Send to RTS
                </DropdownMenuItem>
                {onPreorder && (
                  <DropdownMenuItem onClick={() => onPreorder(o.id)} disabled={o.status === "pre_order"}>
                    <CalendarClock className="h-4 w-4" /> Move to Pre-order
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => onStatusChange(o.id, "cancelled")}
                  disabled={o.status === "cancelled"}
                  className="text-destructive focus:text-destructive"
                >
                  <XIcon className="h-4 w-4" /> Cancel
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled><ListPlus className="h-4 w-4" /> Create Task</DropdownMenuItem>
                <DropdownMenuItem disabled><StickyNote className="h-4 w-4" /> Add Note</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
      size: 48,
    },
  ];

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="bg-card overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted/40 sticky top-0 z-10 backdrop-blur">
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="hover:bg-transparent border-b">
              {hg.headers.map((h) => (
                <TableHead key={h.id} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground h-10 px-3">
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>
                {columns.map((_c, j) => (
                  <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                ))}
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                No orders found
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer transition-colors border-b last:border-0 hover:bg-muted/50 group/row"
                onClick={() => onRowClick(row.original.id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="py-3 px-3 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86_400_000);
  if (d <= 0) {
    const h = Math.floor(diff / 3_600_000);
    return h <= 0 ? "just now" : `${h}h ago`;
  }
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  const m = Math.floor(d / 30);
  return `${m} mo ago`;
}

function ProductsCell({ items }: { items: NonNullable<OrderRow["items"]> }) {
  if (!items || items.length === 0) {
    return <span className="text-muted-foreground/50 text-xs">—</span>;
  }
  const totalQty = items.reduce((s, i) => s + (i.quantity ?? 0), 0);
  const visible = items.slice(0, 3);
  const extra = items.length - visible.length;
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-2 group"
        >
          <div className="flex -space-x-2">
            {visible.map((it) => (
              <ItemThumbPopover key={it.id} item={it} />
            ))}
            {extra > 0 && (
              <div className="h-9 w-9 rounded-lg border-2 border-card bg-muted text-[10px] font-bold flex items-center justify-center text-muted-foreground shadow-sm">
                +{extra}
              </div>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground leading-tight">
            <div className="font-semibold text-foreground tabular-nums">{items.length} item{items.length === 1 ? "" : "s"}</div>
            <div className="tabular-nums">Qty {totalQty}</div>
          </div>
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80 p-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold px-1 pb-1.5">Items</div>
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-2.5 p-1.5 rounded-md hover:bg-muted/60">
              <Thumb src={it.image} name={it.name} size={40} />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{it.name ?? "Unnamed"}</div>
                {it.variant_label && (
                  <div className="text-[10px] text-muted-foreground truncate">{it.variant_label}</div>
                )}
              </div>
              <div className="text-right text-[11px] shrink-0">
                <div className="font-semibold tabular-nums">×{it.quantity}</div>
                {it.line_total != null && (
                  <div className="text-muted-foreground tabular-nums">৳{Number(it.line_total).toLocaleString()}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function Thumb({ src, name, size = 36 }: { src: string | null; name: string | null; size?: number }) {
  const style = { width: size, height: size };
  if (!src) {
    return (
      <div
        style={style}
        className="rounded-lg border-2 border-card bg-gradient-to-br from-muted to-muted/60 flex items-center justify-center shadow-sm shrink-0"
        title={name ?? ""}
      >
        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground/60" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name ?? ""}
      loading="lazy"
      style={style}
      className="rounded-lg border-2 border-card object-cover shadow-sm shrink-0 bg-muted"
      onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
    />
  );
}

function ItemThumbPopover({ item }: { item: NonNullable<OrderRow["items"]>[number] }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); }}
          className="relative rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 hover:z-10 hover:scale-110 transition-transform shrink-0"
          aria-label={item.name ?? "Item"}
        >
          <Thumb src={item.image} name={item.name} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="w-72 p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-3 p-3">
          <Thumb src={item.image} name={item.name} size={72} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold leading-tight line-clamp-2">{item.name ?? "Unnamed item"}</div>
            {item.variant_label && (
              <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{item.variant_label}</div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 border-t bg-muted/30 text-center">
          <div className="px-2 py-2 border-r">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Qty</div>
            <div className="text-sm font-bold tabular-nums">{item.quantity ?? 0}</div>
          </div>
          <div className="px-2 py-2">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Total</div>
            <div className="text-sm font-bold tabular-nums text-primary">৳{Number(item.line_total ?? 0).toLocaleString()}</div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CustomerPhoneHistory({ phone, brandId, currentOrderId }: { phone: string; brandId: string | null; currentOrderId: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useCustomerHistory(phone, brandId, open);
  const others = (data?.rows ?? []).filter((r) => r.id !== currentOrderId);
  const summary = data?.summary;
  const repeatCount = summary ? Math.max(0, summary.total - 1) : 0;

  return (
    <HoverCard openDelay={150} closeDelay={80} onOpenChange={setOpen}>
      <HoverCardTrigger asChild>
        <button
          onClick={(e) => { e.stopPropagation(); }}
          className="font-mono inline-flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <span>{phone}</span>
          {repeatCount > 0 && (
            <span className="inline-flex items-center h-[15px] px-1 rounded text-[9px] font-bold bg-primary/10 text-primary tabular-nums">
              ×{summary!.total}
            </span>
          )}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" side="bottom" className="w-[340px] p-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-3 py-2 border-b bg-muted/40">
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Customer History</div>
          <div className="font-mono text-xs mt-0.5">{phone}</div>
        </div>
        {isLoading && !data ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : !summary || summary.total === 0 ? (
          <div className="p-4 text-xs text-muted-foreground text-center">No previous orders found.</div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-1 px-3 py-2.5 border-b text-center">
              <Stat label="Total" value={summary.total} tone="default" />
              <Stat label="Delivered" value={summary.delivered} tone="success" />
              <Stat label="Returned" value={summary.returned} tone="warn" />
              <Stat label="Cancelled" value={summary.cancelled} tone="danger" />
            </div>
            <div className="px-3 py-1.5 bg-muted/20 border-b flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Total Spent</span>
              <span className="text-xs font-bold tabular-nums">৳{summary.spent.toLocaleString()}</span>
            </div>
            {others.length > 0 ? (
              <div className="max-h-64 overflow-y-auto divide-y">
                {others.slice(0, 8).map((r) => {
                  const b = statusBadge(r.status);
                  return (
                    <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/40">
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[11px] font-semibold truncate">#{r.invoice_no ?? r.id.slice(0, 6)}</div>
                        <div className="text-[10px] text-muted-foreground">{format(new Date(r.created_at), "dd MMM yyyy")}</div>
                      </div>
                      <span className={cn("inline-flex items-center h-[18px] px-1.5 rounded-full text-[9px] font-semibold whitespace-nowrap", b.className)}>
                        {b.label}
                      </span>
                      <div className="text-[11px] font-bold tabular-nums w-16 text-right">৳{Number(r.total).toLocaleString()}</div>
                    </div>
                  );
                })}
                {others.length > 8 && (
                  <div className="px-3 py-1.5 text-[10px] text-muted-foreground text-center">+{others.length - 8} more orders</div>
                )}
              </div>
            ) : (
              <div className="px-3 py-3 text-[11px] text-muted-foreground text-center italic">First order from this customer.</div>
            )}
          </>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "default" | "success" | "warn" | "danger" }) {
  const toneCls = {
    default: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    danger: "text-red-600 dark:text-red-400",
  }[tone];
  return (
    <div>
      <div className={cn("text-sm font-bold tabular-nums leading-none", toneCls)}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function rateTone(rate: number | null): { text: string; bg: string; stroke: string; ring: string } {
  if (rate === null) return { text: "text-muted-foreground", bg: "bg-muted", stroke: "stroke-muted-foreground/60", ring: "ring-border" };
  if (rate >= 90) return { text: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-500/15", stroke: "stroke-emerald-500", ring: "ring-emerald-500/30" };
  if (rate >= 70) return { text: "text-amber-700 dark:text-amber-300", bg: "bg-amber-500/15", stroke: "stroke-amber-500", ring: "ring-amber-500/30" };
  return { text: "text-red-700 dark:text-red-300", bg: "bg-red-500/15", stroke: "stroke-red-500", ring: "ring-red-500/30" };
}

export function CourierRateBadge({ phone, brandId }: { phone: string; brandId: string | null }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  // Fetch eagerly so the % is visible at a glance. Server caches results for 24h.
  const { data, isLoading, isFetching, error } = useCourierHistory(phone, brandId, true);
  const summary = data?.summary;
  const rate = summary && summary.total > 0 ? Math.round((summary.success / summary.total) * 100) : null;
  const tone = rateTone(rate);

  // Hide badge entirely if there's no data and nothing's loading (per design rule).
  if (!isLoading && !isFetching && !error && rate === null) return null;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["courier-history", brandId, phone.replace(/\D/g, "")] });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => { e.stopPropagation(); }}
          className={cn(
            "inline-flex items-center h-[18px] px-1.5 rounded-md text-[10px] font-bold tabular-nums transition-colors ring-1",
            tone.bg, tone.text, tone.ring,
            (isLoading || isFetching) && "animate-pulse",
          )}
          title="Courier success rate"
        >
          {rate !== null ? `${rate}%` : isLoading || isFetching ? "…" : error ? "!" : "—"}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-[300px] p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b bg-muted/40 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Courier Success Rate</div>
            <div className="font-mono text-xs mt-0.5">{phone}</div>
          </div>
          <button
            onClick={refresh}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            title="Refresh"
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
          </button>
        </div>

        {isLoading && !data ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : error ? (
          <div className="p-4 text-xs text-destructive text-center">Failed to load history</div>
        ) : !data || (data.providers ?? []).length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground text-center">No courier history</div>
        ) : (
          <>
            <div className="px-3 py-3 flex items-center gap-3 border-b">
              <Donut rate={rate} stroke={tone.stroke} size={64} />
              <div className="flex-1 grid grid-cols-3 gap-1 text-center">
                <MiniStat label="Total" value={summary!.total} tone="default" />
                <MiniStat label="Success" value={summary!.success} tone="success" />
                <MiniStat label="Cancel" value={summary!.cancelled} tone="danger" />
              </div>
            </div>
            <div className="divide-y">
              {data.providers.map((p) => (
                <ProviderRow key={p.name} p={p} />
              ))}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ProviderRow({ p }: { p: CourierProviderStat }) {
  const rate = p.ok && p.total > 0 ? Math.round((p.success / p.total) * 100) : null;
  const tone = rateTone(rate);
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <Donut rate={rate} stroke={tone.stroke} size={36} compact />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold">{p.label}</div>
        {p.ok ? (
          <div className="text-[10px] text-muted-foreground tabular-nums">
            {p.success}/{p.total} delivered · {p.cancelled} cancelled
          </div>
        ) : (
          <div className="text-[10px] text-destructive truncate">{p.error ?? "unavailable"}</div>
        )}
      </div>
      <div className={cn("text-xs font-bold tabular-nums w-10 text-right", tone.text)}>
        {rate !== null ? `${rate}%` : "—"}
      </div>
    </div>
  );
}

function Donut({ rate, stroke, size = 64, compact = false }: { rate: number | null; stroke: string; size?: number; compact?: boolean }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = rate ?? 0;
  const dash = (pct / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={compact ? 4 : 6} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={compact ? 4 : 6}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          className={cn("transition-all", stroke)}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("font-bold tabular-nums", compact ? "text-[9px]" : "text-xs")}>
          {rate !== null ? `${rate}%` : "—"}
        </span>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: "default" | "success" | "danger" }) {
  const toneCls = {
    default: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    danger: "text-red-600 dark:text-red-400",
  }[tone];
  return (
    <div>
      <div className={cn("text-sm font-bold tabular-nums leading-none", toneCls)}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
    </div>
  );
}