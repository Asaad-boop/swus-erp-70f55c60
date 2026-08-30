import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  AlertCircle,
  Loader2,
  Phone,
  ShoppingCart,
  Trash2,
  CheckCircle2,
  MapPin,
  ImageIcon,
  AlertTriangle,
  MessageCircle,
  Flame,
  BarChart3,
  Download,
  Filter,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CopyIconBtn, PhoneActions } from "@/components/erp/orders/contact-actions";
import { CourierRateBadge } from "@/components/erp/orders/orders-table";
import { BrandBadge } from "@/components/erp/brand-badge";
import { cn } from "@/lib/utils";
import { useAbandonedCartsQuery, type IncompleteFilters } from "@/hooks/erp/use-abandoned-carts-query";
import {
  convertAbandonedCartFn,
  deleteAbandonedCartFn,
  bulkDeleteAbandonedCartsFn,
  bulkLogCartMessagesFn,
  logCartMessageFn,
  type AbandonedCartRow,
  type AbandonedCartItem,
} from "@/lib/erp/abandoned-carts.functions";

type Props = {
  brandId: string | null;
  brandIds?: string[];
  search: string;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onOpenOrder: (orderId: string) => void;
};

const LAST_STEP_OPTIONS = ["cart", "shipping", "checkout"] as const;
const FOLLOWUP_OPTIONS = [
  { key: "pending", label: "Not Contacted" },
  { key: "contacted", label: "Contacted" },
  { key: "responded", label: "Responded" },
  { key: "ignored", label: "Ignored" },
] as const;

function priorityScore(r: AbandonedCartRow): number {
  // Higher = more urgent. Bigger cart + fresher = higher score.
  const val = Number(r.subtotal ?? 0);
  const ageH = (Date.now() - new Date(r.updated_at).getTime()) / 3_600_000;
  const freshness = Math.max(0, 48 - ageH) / 48; // 1 fresh, 0 stale (>48h)
  const contactedPenalty = (r.followup_count ?? 0) > 0 ? 0.5 : 1;
  return val * (0.5 + 0.5 * freshness) * contactedPenalty;
}

function priorityTier(r: AbandonedCartRow): "hot" | "warm" | "cold" | "done" {
  if ((r.followup_count ?? 0) >= 2) return "done";
  const score = priorityScore(r);
  if (score >= 1500) return "hot";
  if (score >= 500) return "warm";
  return "cold";
}

function buildWhatsAppMessage(r: AbandonedCartRow): string {
  const name = r.customer_name?.trim() || "Assalamu Alaikum";
  const total = Number(r.subtotal ?? 0).toLocaleString();
  return `Hi ${name}! 👋\n\nApnar cart e ৳${total} taka'r product ache jeta ekhono order kora hoy nai. Ekhon order korlei confirm hoye jabe.\n\nKono jhamela hocche? Amra help korte prostut.\n\nDhonnobad!`;
}

function waLink(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, "");
  const num = digits.startsWith("880") ? digits : digits.startsWith("0") ? "88" + digits : "880" + digits;
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

export function IncompleteOrdersTable({
  brandId,
  brandIds,
  search,
  page,
  pageSize,
  onPageChange,
  onOpenOrder,
}: Props) {
  const qc = useQueryClient();
  const convertAbandonedCart = useServerFn(convertAbandonedCartFn);
  const deleteAbandonedCart = useServerFn(deleteAbandonedCartFn);
  const bulkDeleteCarts = useServerFn(bulkDeleteAbandonedCartsFn);
  const bulkLogMessages = useServerFn(bulkLogCartMessagesFn);
  const logMessage = useServerFn(logCartMessageFn);

  const [filters, setFilters] = useState<IncompleteFilters>({ sort: "newest" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const { data, isLoading, isFetching, error } = useAbandonedCartsQuery({
    brandId,
    brandIds,
    search,
    page,
    pageSize,
    enabled: true,
    ...filters,
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmCart, setConfirmCart] = useState<AbandonedCartRow | null>(null);
  const [deleteCart, setDeleteCart] = useState<AbandonedCartRow | null>(null);

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const allVisibleChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someVisibleChecked = rows.some((r) => selected.has(r.id));

  const toggleAll = (v: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (v) rows.forEach((r) => next.add(r.id));
      else rows.forEach((r) => next.delete(r.id));
      return next;
    });
  };
  const toggleOne = (id: string, v: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (v) next.add(id); else next.delete(id);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  const activeFilterCount =
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0) +
    (filters.subtotalMin != null ? 1 : 0) +
    (filters.subtotalMax != null ? 1 : 0) +
    (filters.lastSteps?.length ? 1 : 0) +
    (filters.followupStatuses?.length ? 1 : 0) +
    (filters.sort && filters.sort !== "newest" ? 1 : 0);

  const convertMut = useMutation({
    mutationFn: async (cart: AbandonedCartRow) => {
      setPendingId(cart.id);
      const targetBrandId = cart.brand_id ?? brandId;
      if (!targetBrandId) throw new Error("Brand select koro");
      return convertAbandonedCart({
        data: { id: cart.id, brandId: targetBrandId },
      });
    },
    onSuccess: (res) => {
      toast.success(`Order draft created${res.invoiceNo ? " · " + res.invoiceNo : ""} — edit & confirm`);
      qc.invalidateQueries({ queryKey: ["abandoned-carts"] });
      qc.invalidateQueries({ queryKey: ["abandoned-carts-count"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      onOpenOrder(res.orderId);
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setPendingId(null),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      setPendingId(id);
      return deleteAbandonedCart({ data: { id } });
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["abandoned-carts"] });
      qc.invalidateQueries({ queryKey: ["abandoned-carts-count"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setPendingId(null),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids: string[]) => bulkDeleteCarts({ data: { ids } }),
    onSuccess: (res) => {
      toast.success(`${res.deleted} incomplete cart deleted`);
      clearSelection();
      qc.invalidateQueries({ queryKey: ["abandoned-carts"] });
      qc.invalidateQueries({ queryKey: ["abandoned-carts-count"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkWhatsappMut = useMutation({
    mutationFn: async (carts: AbandonedCartRow[]) => {
      // Open each wa.me link (limit to first 5, warn beyond)
      const toOpen = carts.slice(0, 5);
      toOpen.forEach((r, i) => {
        if (!r.customer_phone) return;
        setTimeout(() => {
          window.open(waLink(r.customer_phone!, buildWhatsAppMessage(r)), "_blank", "noopener");
        }, i * 300);
      });
      return bulkLogMessages({
        data: {
          cartIds: carts.map((c) => c.id),
          channel: "whatsapp",
          messageBody: "Cart recovery WhatsApp link opened",
        },
      });
    },
    onSuccess: (res, carts) => {
      const skipped = carts.length - Math.min(carts.length, 5);
      toast.success(
        `Opened ${Math.min(carts.length, 5)} WhatsApp chat${skipped > 0 ? ` · ${skipped} skipped (5 max at once)` : ""} · logged ${res.logged}`,
      );
      clearSelection();
      qc.invalidateQueries({ queryKey: ["abandoned-carts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkMarkContactedMut = useMutation({
    mutationFn: async (ids: string[]) =>
      bulkLogMessages({ data: { cartIds: ids, channel: "manual", messageBody: "Marked contacted" } }),
    onSuccess: (res) => {
      toast.success(`${res.logged} marked as contacted`);
      clearSelection();
      qc.invalidateQueries({ queryKey: ["abandoned-carts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const logSingleMut = useMutation({
    mutationFn: async (args: { cartId: string; channel: "whatsapp" | "manual" | "call" }) =>
      logMessage({ data: args }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["abandoned-carts"] }),
  });

  const exportCsv = () => {
    const target = selectedRows.length > 0 ? selectedRows : rows;
    if (target.length === 0) { toast.error("Nothing to export"); return; }
    const headers = ["date","name","phone","address","city","subtotal","items","last_step","followup_status","followup_count"];
    const csv = [headers.join(",")].concat(
      target.map((r) => [
        format(new Date(r.updated_at), "yyyy-MM-dd HH:mm"),
        JSON.stringify(r.customer_name ?? ""),
        r.customer_phone ?? "",
        JSON.stringify([r.shipping_address, r.shipping_thana, r.shipping_city].filter(Boolean).join(", ")),
        r.shipping_city ?? "",
        r.subtotal ?? 0,
        (r.cart_items ?? []).length,
        r.last_step ?? "",
        r.followup_status ?? "pending",
        r.followup_count ?? 0,
      ].join(",")),
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `incomplete-carts-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${target.length} rows`);
  };

  return (
    <div className="bg-card overflow-x-auto">
      {/* Toolbar: filters + reports link */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b bg-muted/20">
        <FiltersPopover filters={filters} onChange={setFilters} activeCount={activeFilterCount} />
        <Select
          value={filters.sort ?? "newest"}
          onValueChange={(v: any) => setFilters((f) => ({ ...f, sort: v }))}
        >
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="highest">Highest value</SelectItem>
            <SelectItem value="lowest">Lowest value</SelectItem>
            <SelectItem value="priority">🔥 Priority</SelectItem>
          </SelectContent>
        </Select>
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={() => setFilters({ sort: "newest" })}
          >
            <X className="h-3 w-3" /> Clear filters
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <Link to="/erp/orders/incomplete-reports">
              <BarChart3 className="h-3.5 w-3.5" /> Reports
            </Link>
          </Button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b bg-primary/5">
          <span className="text-xs font-semibold">{selected.size} selected</span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 border-green-500/40 text-green-700 hover:bg-green-500/10 dark:text-green-400"
            disabled={bulkWhatsappMut.isPending || selectedRows.every((r) => !r.customer_phone)}
            onClick={() => bulkWhatsappMut.mutate(selectedRows.filter((r) => !!r.customer_phone))}
          >
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            disabled={bulkMarkContactedMut.isPending}
            onClick={() => bulkMarkContactedMut.mutate(Array.from(selected))}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Mark contacted
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive"
            onClick={() => setConfirmBulkDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto" onClick={clearSelection}>
            Clear
          </Button>
        </div>
      )}

      <Table>
        <TableHeader className="bg-muted/40 sticky top-0 z-10 backdrop-blur">
          <TableRow className="hover:bg-transparent border-b">
            <TableHead className="w-[36px] pl-3">
              <Checkbox
                checked={allVisibleChecked ? true : someVisibleChecked ? "indeterminate" : false}
                onCheckedChange={(v) => toggleAll(!!v)}
                aria-label="Select all"
              />
            </TableHead>
            {[
              "Date",
              "Brand",
              "Products",
              "Customer",
              "Priority",
              "Follow-up",
              "Total",
              "Step",
              "",
            ].map((h, i) => (
              <TableHead
                key={i}
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wider text-muted-foreground h-10 px-3",
                  h === "" && "w-[140px]",
                )}
              >
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 10 }).map((_c, j) => (
                  <TableCell key={j} className="py-3 px-3">
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : error ? (
            <TableRow>
              <TableCell colSpan={10} className="text-center py-12 text-destructive">
                <AlertCircle className="inline h-5 w-5 mr-2 opacity-80" />
                {error.message}
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
                <ShoppingCart className="inline h-5 w-5 mr-2 opacity-60" />
                Kono incomplete checkout nai
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => {
              const items = Array.isArray(r.cart_items) ? r.cart_items : [];
              const addr = [
                r.shipping_address,
                r.shipping_thana,
                r.shipping_city,
                r.shipping_district,
              ]
                .filter(Boolean)
                .join(", ");
              const busy = pendingId === r.id;
              const tier = priorityTier(r);
              return (
                <TableRow
                  key={r.id}
                  className="border-b last:border-0 hover:bg-muted/50 transition-colors group/row"
                >
                  <TableCell className="pl-3 align-middle">
                    <Checkbox
                      checked={selected.has(r.id)}
                      onCheckedChange={(v) => toggleOne(r.id, !!v)}
                      aria-label="Select row"
                    />
                  </TableCell>
                  <TableCell className="py-3 px-3 align-middle relative">
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-[3px] rounded-r-full bg-amber-500"
                    />
                    <div className="text-xs leading-tight whitespace-nowrap pl-1">
                      <div className="font-medium">
                        {format(new Date(r.updated_at), "dd/MM/yyyy,")}
                      </div>
                      <div>{format(new Date(r.updated_at), "h:mm a")}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {relTime(r.updated_at)}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="py-3 px-3 align-middle">
                    <BrandBadge brandId={r.brand_id} />
                  </TableCell>

                  <TableCell className="py-3 px-3 align-middle">
                    <CartProductsCell items={items} />
                  </TableCell>

                  <TableCell className="py-3 px-3 align-middle">
                    <div className="min-w-[220px] max-w-[280px]">
                      <div className="text-xs space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="font-semibold text-sm truncate text-foreground">
                            {r.customer_name ?? "—"}
                          </span>
                          {r.customer_name && (
                            <CopyIconBtn value={r.customer_name} label="Name" className="shrink-0" />
                          )}
                        </div>
                        {r.customer_phone && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Phone className="h-3 w-3 shrink-0" />
                            <span className="tabular-nums truncate">{r.customer_phone}</span>
                            <CourierRateBadge phone={r.customer_phone} brandId={r.brand_id ?? brandId} />
                            <PhoneActions phone={r.customer_phone} className="ml-auto" />
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
                  </TableCell>

                  <TableCell className="py-3 px-3 align-middle">
                    <PriorityBadge tier={tier} />
                  </TableCell>

                  <TableCell className="py-3 px-3 align-middle">
                    <FollowupBadge status={r.followup_status ?? "pending"} count={r.followup_count ?? 0} lastAt={r.last_followup_at ?? null} />
                  </TableCell>

                  <TableCell className="py-3 px-3 align-middle">
                    <div className="text-right whitespace-nowrap">
                      <div className="font-bold text-sm tabular-nums">
                        ৳{Number(r.subtotal ?? 0).toLocaleString()}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        {items.length} item{items.length === 1 ? "" : "s"}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="py-3 px-3 align-middle">
                    {r.last_step ? (
                      <span className="inline-flex items-center px-2 h-5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-muted text-muted-foreground border">
                        {r.last_step}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50 text-xs">—</span>
                    )}
                  </TableCell>

                  <TableCell className="py-3 px-3 align-middle text-right">
                    <div className="inline-flex gap-1">
                      {r.customer_phone && (
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8 border-green-500/40 text-green-700 hover:bg-green-500/10 dark:text-green-400"
                          title="Send WhatsApp"
                          onClick={() => {
                            window.open(waLink(r.customer_phone!, buildWhatsAppMessage(r)), "_blank", "noopener");
                            logSingleMut.mutate({ cartId: r.id, channel: "whatsapp" });
                          }}
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="h-8 gap-1"
                        disabled={busy || !(r.brand_id ?? brandId)}
                        onClick={() => setConfirmCart(r)}
                        title="Open & edit as order"
                      >
                        {busy && convertMut.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        Open
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() => setDeleteCart(r)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between text-xs px-4 py-2.5 border-t bg-muted/20">
        <span className="text-muted-foreground">
          {total.toLocaleString()} incomplete · Page {page + 1} of {totalPages}
          {isFetching && " · syncing"}
        </span>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Delete {selected.size} incomplete cart{selected.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ei carts permanent delete hobe. Undo kora jabe na.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleteMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkDeleteMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                bulkDeleteMut.mutate(Array.from(selected), {
                  onSettled: () => setConfirmBulkDelete(false),
                });
              }}
            >
              {bulkDeleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
              Delete {selected.size}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmCart} onOpenChange={(o) => !o && setConfirmCart(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Open as order draft?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  Ei incomplete checkout theke ekta draft order tairi hobe. Order page e giye customer info, address, items — shob edit korte parben, tarpor Confirm korben.
                </div>
                {confirmCart && (
                  <div className="rounded-md border bg-muted/40 p-2.5 text-xs space-y-1">
                    <div>
                      <span className="text-muted-foreground">Customer:</span>{" "}
                      <span className="font-semibold">{confirmCart.customer_name ?? "—"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Phone:</span>{" "}
                      <span className="font-mono">{confirmCart.customer_phone ?? "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>
                        <span className="text-muted-foreground">Items:</span>{" "}
                        {(confirmCart.cart_items ?? []).length}
                      </span>
                      <span className="font-bold tabular-nums">
                        ৳{Number(confirmCart.subtotal ?? 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={convertMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={convertMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirmCart) {
                  const cart = confirmCart;
                  setConfirmCart(null);
                  convertMut.mutate(cart);
                }
              }}
            >
              {convertMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
              )}
              Open & Edit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteCart} onOpenChange={(o) => !o && setDeleteCart(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete incomplete cart?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ei incomplete checkout permanently delete hobe. Eta undo kora jabe na.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={delMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={delMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (deleteCart) {
                  const id = deleteCart.id;
                  setDeleteCart(null);
                  delMut.mutate(id);
                }
              }}
            >
              {delMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1.5" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function CartProductsCell({ items }: { items: AbandonedCartItem[] }) {
  if (!items || items.length === 0) {
    return <span className="text-muted-foreground/50 text-xs">—</span>;
  }
  const totalQty = items.reduce((s, i) => s + Number(i.quantity ?? i.qty ?? 0), 0);
  const visible = items.slice(0, 3);
  const extra = items.length - visible.length;
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-2 group"
        >
          <div className="flex -space-x-2">
            {visible.map((it, i) => (
              <CartThumb key={(it.id ?? it.product_id ?? i) + "-" + i} src={it.image ?? null} name={it.name ?? null} />
            ))}
            {extra > 0 && (
              <div className="h-9 w-9 rounded-lg border-2 border-card bg-muted text-[10px] font-bold flex items-center justify-center text-muted-foreground shadow-sm">
                +{extra}
              </div>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground leading-tight">
            <div className="font-semibold text-foreground tabular-nums">
              {items.length} item{items.length === 1 ? "" : "s"}
            </div>
            <div className="tabular-nums">Qty {totalQty}</div>
          </div>
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80 p-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold px-1 pb-1.5">
          Cart Items
        </div>
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {items.map((it, i) => {
            const qty = Number(it.quantity ?? it.qty ?? 0);
            const price = Number(it.unit_price ?? it.price ?? 0);
            return (
              <div key={i} className="flex items-center gap-2.5 p-1.5 rounded-md hover:bg-muted/60">
                <CartThumb src={it.image ?? null} name={it.name ?? null} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{it.name ?? "Unnamed"}</div>
                  {it.variant_label && (
                    <div className="text-[10px] text-muted-foreground truncate">{it.variant_label}</div>
                  )}
                </div>
                <div className="text-right text-[11px] shrink-0">
                  <div className="font-semibold tabular-nums">×{qty}</div>
                  {price > 0 && (
                    <div className="text-muted-foreground tabular-nums">
                      ৳{(price * qty).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function CartThumb({
  src,
  name,
  size = 36,
}: {
  src: string | null;
  name: string | null;
  size?: number;
}) {
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
      onError={(e) => {
        (e.target as HTMLImageElement).style.visibility = "hidden";
      }}
    />
  );
}

function PriorityBadge({ tier }: { tier: "hot" | "warm" | "cold" | "done" }) {
  if (tier === "hot") {
    return (
      <span className="inline-flex items-center gap-1 pl-1.5 pr-2 h-6 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
        <Flame className="h-3 w-3" /> Hot
      </span>
    );
  }
  if (tier === "warm") {
    return (
      <span className="inline-flex items-center gap-1 pl-1.5 pr-2 h-6 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
        <AlertTriangle className="h-3 w-3" /> Warm
      </span>
    );
  }
  if (tier === "done") {
    return (
      <span className="inline-flex items-center gap-1 pl-1.5 pr-2 h-6 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-muted text-muted-foreground border">
        <CheckCircle2 className="h-3 w-3" /> Done
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 pl-1.5 pr-2 h-6 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800">
      Cold
    </span>
  );
}

function FollowupBadge({ status, count, lastAt }: { status: string; count: number; lastAt: string | null }) {
  const tone =
    status === "responded"
      ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
      : status === "contacted"
        ? "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"
        : status === "ignored"
          ? "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800"
          : "bg-muted text-muted-foreground border";
  const label = status === "pending" ? "Not sent" : status;
  return (
    <div className="text-xs leading-tight">
      <span className={cn("inline-flex items-center px-2 h-5 rounded-full text-[10px] font-semibold uppercase tracking-wider border", tone)}>
        {label}
      </span>
      {count > 0 && (
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {count} msg{count === 1 ? "" : "s"}{lastAt ? ` · ${relTime(lastAt)}` : ""}
        </div>
      )}
    </div>
  );
}

function FiltersPopover({
  filters,
  onChange,
  activeCount,
}: {
  filters: IncompleteFilters;
  onChange: (f: IncompleteFilters) => void;
  activeCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<IncompleteFilters>(filters);

  const toggleStep = (step: string) => {
    const cur = new Set(draft.lastSteps ?? []);
    if (cur.has(step)) cur.delete(step); else cur.add(step);
    setDraft({ ...draft, lastSteps: Array.from(cur) });
  };
  const toggleFollowup = (s: string) => {
    const cur = new Set(draft.followupStatuses ?? []);
    if (cur.has(s)) cur.delete(s); else cur.add(s);
    setDraft({ ...draft, followupStatuses: Array.from(cur) });
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(filters); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          Filters
          {activeCount > 0 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] tabular-nums">
              {activeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] p-3 space-y-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Cart date (Dhaka)</div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="date"
              className="h-8 text-xs"
              value={draft.dateFrom ?? ""}
              onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value || null })}
            />
            <Input
              type="date"
              className="h-8 text-xs"
              value={draft.dateTo ?? ""}
              onChange={(e) => setDraft({ ...draft, dateTo: e.target.value || null })}
            />
          </div>
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Cart value (৳)</div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder="Min"
              className="h-8 text-xs"
              value={draft.subtotalMin ?? ""}
              onChange={(e) => setDraft({ ...draft, subtotalMin: e.target.value ? Number(e.target.value) : null })}
            />
            <Input
              type="number"
              placeholder="Max"
              className="h-8 text-xs"
              value={draft.subtotalMax ?? ""}
              onChange={(e) => setDraft({ ...draft, subtotalMax: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Last step</div>
          <div className="flex flex-wrap gap-1.5">
            {LAST_STEP_OPTIONS.map((step) => {
              const active = (draft.lastSteps ?? []).includes(step);
              return (
                <button
                  key={step}
                  type="button"
                  onClick={() => toggleStep(step)}
                  className={cn(
                    "h-7 px-2.5 rounded-full text-[11px] font-medium border transition-colors capitalize",
                    active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border",
                  )}
                >
                  {step}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Follow-up status</div>
          <div className="flex flex-wrap gap-1.5">
            {FOLLOWUP_OPTIONS.map((opt) => {
              const active = (draft.followupStatuses ?? []).includes(opt.key);
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => toggleFollowup(opt.key)}
                  className={cn(
                    "h-7 px-2.5 rounded-full text-[11px] font-medium border transition-colors",
                    active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-between pt-2 border-t">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => { setDraft({ sort: filters.sort ?? "newest" }); }}
          >
            Reset
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => { onChange({ ...draft, sort: filters.sort ?? "newest" }); setOpen(false); }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
