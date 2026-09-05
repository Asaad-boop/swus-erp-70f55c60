import { format } from "date-fns";
import { useEffect, useState } from "react";
import { User, Phone, MapPin, Package, Clock, Loader2, Hash, Calendar, Globe, UserCog, ListChecks, StickyNote, Send, AlertTriangle, Truck, Pencil, Lock, ShieldAlert, Save, X, CalendarClock, PhoneCall, Copy, MessageCircle, CheckCircle2, PauseCircle, PhoneOff, Wallet, History, Tag as TagIcon, ClipboardCopy, ShieldCheck, Command, Repeat2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useOrderDetail, useStaffList } from "@/hooks/erp/use-orders-query";
import { useOrderLock } from "@/hooks/erp/use-order-lock";
import { useLogCallAttempt } from "@/hooks/erp/use-order-ops";
import { STATUS_GROUPS, STATUS_BADGE, bdPhoneError, customerName, customerPhone, invoiceDisplay, statusBadge, type OrderStatus } from "@/lib/erp/orders";
import { setOrderActualShippingCostFn } from "@/lib/erp/courier-sync.functions";
import { confirmOrderAdvanceReceivedFn } from "@/lib/erp/finance/advance.functions";
import { PreorderConvertDialog } from "@/components/erp/orders/preorder-convert-dialog";
import { OrderItemsEditor } from "@/components/erp/orders/order-items-editor";
import { OrderCourierScoreStrip, OrderLocationIntel } from "@/components/erp/orders/order-delivery-intel";
import { OrderBillingEditor } from "@/components/erp/orders/order-billing-editor";
import { fireOrderSms } from "@/lib/erp/sms/notify";
import { cn } from "@/lib/utils";


type Props = { orderId: string | null; onClose: () => void; mode?: "web" | "fulfillment" };

type CustomerDraft = {
  shipping_name: string;
  shipping_phone: string;
  shipping_address: string;
  shipping_thana: string;
  shipping_city: string;
  shipping_district: string;
  shipping_note: string;
  customer_note: string;
};

const EMPTY_CUSTOMER_DRAFT: CustomerDraft = {
  shipping_name: "",
  shipping_phone: "",
  shipping_address: "",
  shipping_thana: "",
  shipping_city: "",
  shipping_district: "",
  shipping_note: "",
  customer_note: "",
};

function draftFromOrder(order: Record<string, unknown> | null | undefined): CustomerDraft {
  if (!order) return EMPTY_CUSTOMER_DRAFT;
  return {
    shipping_name: String(order.shipping_name ?? order.guest_name ?? ""),
    shipping_phone: String(order.shipping_phone ?? order.guest_phone ?? ""),
    shipping_address: String(order.shipping_address ?? ""),
    shipping_thana: String(order.shipping_thana ?? ""),
    shipping_city: String(order.shipping_city ?? ""),
    shipping_district: String(order.shipping_district ?? ""),
    shipping_note: String(order.shipping_note ?? ""),
    customer_note: String(order.customer_note ?? ""),
  };
}

const LOCK_STALE_MS = 90_000;

function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

function LockCountdown({ lastHeartbeatAt, tone }: { lastHeartbeatAt: string; tone: "emerald" | "amber" }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const last = new Date(lastHeartbeatAt).getTime();
  const remaining = LOCK_STALE_MS - (Date.now() - last);
  const secondsAgo = Math.max(0, Math.floor((Date.now() - last) / 1000));
  const cls = tone === "emerald"
    ? "text-emerald-700 dark:text-emerald-300"
    : "text-amber-700 dark:text-amber-300";
  return (
    <span className={`tabular-nums ${cls}`}>
      Expires in {formatRemaining(remaining)} · heartbeat {secondsAgo}s ago
    </span>
  );
}

const WEB_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "processing", label: "Processing" },
  { value: "incomplete", label: "Incomplete" },
  { value: "good_but_no_response", label: "Good But No Response" },
  { value: "no_response", label: "No Response" },
  { value: "advance_payment", label: "Advance Payment" },
  { value: "on_hold", label: "On Hold" },
  { value: "complete", label: "Confirm Order" },
  { value: "cancelled", label: "Cancel" },
];

function webStatusLabel(status: string | null | undefined) {
  return WEB_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? (status ?? "Processing").replace(/_/g, " ");
}

/** Compact product thumbnail with graceful fallback. */
function ItemThumb({ src, alt }: { src: string | null | undefined; alt: string }) {
  const [failed, setFailed] = useState(false);
  const url = src && String(src).trim() ? String(src) : null;
  return (
    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border bg-muted">
      {!url || failed ? (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <Package className="h-5 w-5 opacity-50" />
        </div>
      ) : (
        <img src={url} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      )}
    </div>
  );
}

/** Past order footprint for the same phone number (repeat / risk signal). */
function useCustomerFootprint(phone: string | null, currentId: string | null) {
  const digits = String(phone ?? "").replace(/\D/g, "").slice(-11);
  return useQuery({
    queryKey: ["order-drawer-footprint", digits],
    enabled: digits.length === 11,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,status,total,created_at")
        .or(`shipping_phone.ilike.%${digits}%,guest_phone.ilike.%${digits}%`)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows = (data ?? []).filter((r) => r.id !== currentId);
      const delivered = rows.filter((r) => r.status === "delivered" || r.status === "completed" || r.status === "paid").length;
      const returned = rows.filter((r) => String(r.status ?? "").includes("return")).length;
      const cancelled = rows.filter((r) => r.status === "cancelled" || r.status === "fake").length;
      return { total: rows.length, delivered, returned, cancelled, last: rows[0] ?? null };
    },
  });
}

/** One-tap canned notes — fastest way to log common call outcomes. */
const QUICK_NOTES = [
  "Customer confirm korlo",
  "Call dhore nai — pore try korte hobe",
  "Delivery date jante cheyeche",
  "Address confirm kora hoyeche",
  "Advance dite raji",
  "Customer cancel korte cheyeche",
];

/** Simple risk read from the customer's past-order footprint. */
function riskFrom(fp: { total: number; delivered: number; returned: number; cancelled: number } | undefined) {
  if (!fp || fp.total === 0) return null;
  const bad = fp.returned + fp.cancelled;
  const rate = bad / fp.total;
  if (fp.total >= 2 && rate >= 0.5) return { level: "high" as const, label: "High risk customer", detail: `${bad}/${fp.total} order return/cancel hoyeche` };
  if (bad > 0) return { level: "watch" as const, label: "Watch", detail: `${bad} past return/cancel` };
  if (fp.delivered >= 2) return { level: "good" as const, label: "Trusted repeat customer", detail: `${fp.delivered} successful delivery` };
  return null;
}

const CALL_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "not_called", label: "Not called" },
  { value: "attempting", label: "Attempting" },
  { value: "reached", label: "Reached" },
  { value: "no_response", label: "No response" },
  { value: "wrong_number", label: "Wrong number" },
  { value: "customer_confirmed", label: "Customer confirmed" },
  { value: "customer_cancelled", label: "Customer cancelled" },
  { value: "needs_followup", label: "Needs follow-up" },
];



export function OrderDrawer({ orderId, onClose, mode = "fulfillment" }: Props) {
  const qc = useQueryClient();
  const { data, isLoading } = useOrderDetail(orderId);
  const { data: staff = [] } = useStaffList();
  const lockState = useOrderLock(orderId);
  const logCall = useLogCallAttempt();
  const [note, setNote] = useState("");
  const [advOpen, setAdvOpen] = useState(false);
  const [preorderOpen, setPreorderOpen] = useState(false);
  const [advAmount, setAdvAmount] = useState("");
  const [advSource, setAdvSource] = useState("");
  const [advNumber, setAdvNumber] = useState("");
  const [advTxnId, setAdvTxnId] = useState("");
  const [feeOpen, setFeeOpen] = useState(false);
  const [feeAmount, setFeeAmount] = useState("");
  const [customerEditing, setCustomerEditing] = useState(false);
  const [itemsEditing, setItemsEditing] = useState(false);
  const [customerDraft, setCustomerDraft] = useState<CustomerDraft>(EMPTY_CUSTOMER_DRAFT);
  const setFeeFn = useServerFn(setOrderActualShippingCostFn);
  const confirmAdvanceFn = useServerFn(confirmOrderAdvanceReceivedFn);
  const confirmAdvance = useMutation({
    mutationFn: () => confirmAdvanceFn({ data: { orderId: orderId! } }),
    onSuccess: (r) => {
      toast.success(r.alreadyRecorded ? "Already recorded in accounts" : "Advance recorded in accounts ✓");
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const order = data?.order;
  const items = data?.items ?? [];
  const history = data?.history ?? [];
  const notes = data?.notes ?? [];
  const subtotal = Number(order?.subtotal ?? 0);
  const shippingFee = Number(order?.shipping_fee ?? 0);
  const actualShippingCost = (order as { actual_shipping_cost?: number | null } | undefined)?.actual_shipping_cost;
  const actualShippingSource = (order as { actual_shipping_source?: string | null } | undefined)?.actual_shipping_source;
  const actualShippingBreakdown = (order as { actual_shipping_breakdown?: { delivery?: number; cod?: number; extra?: number; total?: number } | null } | undefined)?.actual_shipping_breakdown ?? null;
  const hasActual = actualShippingCost !== undefined && actualShippingCost !== null;
  const actualNum = hasActual ? Number(actualShippingCost) : 0;
  const shippingLoss = hasActual ? actualNum - shippingFee : 0;
  const discountAmount = Number(order?.discount_amount ?? 0);
  const advanceAmount = Number(order?.advance_amount ?? 0);
  const grossTotal = Math.max(0, subtotal + shippingFee - discountAmount);
  const dueTotal = Math.max(0, grossTotal - advanceAmount);
  const payableTotal = advanceAmount > 0 ? dueTotal : Number(order?.total ?? grossTotal);
  const advanceSource = (order as { advance_source?: string | null } | undefined)?.advance_source;
  const advancePaymentNumber = (order as { advance_payment_number?: string | null } | undefined)?.advance_payment_number;
  const advanceTxnId = (order as { advance_txn_id?: string | null } | undefined)?.advance_txn_id;
  const editingBlocked = mode === "web" && lockState.heldByOther;
  const phone = order ? customerPhone(order) : "";
  const { data: footprint } = useCustomerFootprint(phone || null, orderId);
  const callAttempts = Number((order as { call_attempt_count?: number | null } | undefined)?.call_attempt_count ?? 0);
  const callStatus = (order as { call_status?: string | null } | undefined)?.call_status ?? "not_called";
  const lastCallAt = (order as { last_call_at?: string | null } | undefined)?.last_call_at ?? null;
  const orderTags = ((order as { tags?: string[] | null } | undefined)?.tags ?? []).filter(Boolean);
  const trackingNumber = (order as { tracking_number?: string | null } | undefined)?.tracking_number ?? null;
  const courierNameVal = (order as { courier_name?: string | null } | undefined)?.courier_name ?? null;

  const setCallStatus = useMutation({
    mutationFn: async (value: string) => {
      const { error } = await supabase.from("orders").update({ call_status: value as never }).eq("id", orderId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Call status updated");
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
      qc.invalidateQueries({ queryKey: ["web-orders"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => { setItemsEditing(false); }, [orderId]);

  useEffect(() => {
    if (!order || customerEditing) return;
    setCustomerDraft(draftFromOrder(order));
  }, [order, customerEditing]);

  const startCustomerEdit = () => {
    if (editingBlocked) {
      toast.error(`Order opened by ${lockState.lock?.user_name ?? "another user"}. Takeover first.`);
      return;
    }
    setCustomerDraft(draftFromOrder(order));
    setCustomerEditing(true);
  };

  const cancelCustomerEdit = () => {
    setCustomerDraft(draftFromOrder(order));
    setCustomerEditing(false);
  };

  const guardedAction = (action: () => void) => {
    if (editingBlocked) {
      toast.error(`Order opened by ${lockState.lock?.user_name ?? "another user"}. Takeover first.`);
      return;
    }
    action();
  };

  const updateStatus = useMutation({
    mutationFn: async (status: OrderStatus) => {
      const { error } = await supabase.rpc("transition_order_status", { _order_id: orderId!, _new_status: status });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success("Status updated");
      if (vars === "confirmed" && orderId) fireOrderSms(orderId, "order_confirm");
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveCustomer = useMutation({
    mutationFn: async () => {
      if (!orderId) throw new Error("Order missing");
      const phoneError = bdPhoneError(customerDraft.shipping_phone);
      if (phoneError) throw new Error(phoneError);
      const payload = {
        shipping_name: customerDraft.shipping_name.trim() || null,
        shipping_phone: customerDraft.shipping_phone.trim() || null,
        shipping_address: customerDraft.shipping_address.trim() || null,
        shipping_thana: customerDraft.shipping_thana.trim() || null,
        shipping_city: customerDraft.shipping_city.trim() || null,
        shipping_district: customerDraft.shipping_district.trim() || null,
        shipping_note: customerDraft.shipping_note.trim() || null,
        customer_note: customerDraft.customer_note.trim() || null,
        ...(order?.is_guest_order
          ? {
            guest_name: customerDraft.shipping_name.trim() || null,
            guest_phone: customerDraft.shipping_phone.trim() || null,
          }
          : {}),
      };
      const { error } = await supabase.from("orders").update(payload).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Customer details saved");
      setCustomerEditing(false);
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders-status-counts"] });
      qc.invalidateQueries({ queryKey: ["web-orders"] });
      qc.invalidateQueries({ queryKey: ["web-orders-page"] });
      qc.invalidateQueries({ queryKey: ["web-orders-counts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateWebStatus = useMutation({
    mutationFn: async ({ web_status, extra }: { web_status: string; extra?: Record<string, unknown> }) => {
      const now = new Date().toISOString();
      // Promote the pipeline status based on the DB's current status (not a possibly
      // stale client copy) so a "complete"/"cancelled" web status can never leave the
      // order stuck at `new` — which would hide it from the Order List.
      if (web_status === "complete" || web_status === "cancelled") {
        const promo = web_status === "complete"
          ? { status: "confirmed" as never, confirmation_status: "pending" as never, confirmed_at: now }
          : { status: "cancelled" as never, cancelled_at: now };
        const { error: promoError } = await supabase
          .from("orders")
          .update({ web_status: web_status as never, ...promo, ...(extra ?? {}) })
          .eq("id", orderId!)
          .in("status", ["new", "incomplete", "pre_order"]);
        if (promoError) throw promoError;
      }
      const { error } = await supabase
        .from("orders")
        .update({ web_status: web_status as never, ...(extra ?? {}) })
        .eq("id", orderId!);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success("Status updated");
      if (vars.web_status === "complete" && orderId) fireOrderSms(orderId, "order_confirm");
      qc.invalidateQueries({ queryKey: ["web-orders"] });
      qc.invalidateQueries({ queryKey: ["web-orders-page"] });
      qc.invalidateQueries({ queryKey: ["web-orders-inf"] });
      qc.invalidateQueries({ queryKey: ["web-orders-counts"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders-status-counts"] });
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
      // Final actions (confirm/cancel) end the workflow for this order —
      // close the drawer so the user immediately sees the row leave the queue.
      if (vars.web_status === "complete" || vars.web_status === "cancelled") onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onPickWebStatus = (v: string) => {
    if (v === "advance_payment") {
      setAdvAmount("");
      setAdvSource("");
      setAdvNumber("");
      setAdvTxnId("");
      setAdvOpen(true);
      return;
    }
    guardedAction(() => updateWebStatus.mutate({ web_status: v }));
  };

  const submitAdvance = () => {
    if (editingBlocked) {
      toast.error(`Order opened by ${lockState.lock?.user_name ?? "another user"}. Takeover first.`);
      return;
    }
    const amt = Number(advAmount);
    if (!amt || amt <= 0) { toast.error("Enter a valid advance amount"); return; }
    if (!advSource) { toast.error("Select advance payment source"); return; }
    if (!advNumber || advNumber.length < 4) { toast.error("Enter payment number (min 4 digits)"); return; }
    updateWebStatus.mutate({
      web_status: "advance_payment",
      extra: {
        advance_amount: amt,
        advance_source: advSource,
        advance_payment_number: advNumber,
        advance_txn_id: advTxnId || null,
      },
    });
    setAdvOpen(false);
  };

  const assignStaff = useMutation({
    mutationFn: async (userId: string | null) => {
      const { error } = await supabase.from("orders").update({ assigned_to: userId }).eq("id", orderId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assigned");
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveFee = useMutation({
    mutationFn: async (amt: number) => {
      await setFeeFn({ data: { orderId: orderId!, amount: amt } });
    },
    onSuccess: () => {
      toast.success("Courier cost saved");
      setFeeOpen(false);
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["erp-transactions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openFeeDialog = () => {
    if (editingBlocked) {
      toast.error(`Order opened by ${lockState.lock?.user_name ?? "another user"}. Takeover first.`);
      return;
    }
    setFeeAmount(hasActual ? String(actualNum) : "");
    setFeeOpen(true);
  };

  const addNote = useMutation({
    mutationFn: async (body?: string) => {
      const text = (body ?? note).trim();
      if (!text) throw new Error("Note khali");
      const { error } = await supabase.rpc("add_order_note", { _order_id: orderId!, _body: text, _is_internal: true });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Note added");
      setNote("");
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const risk = riskFrom(footprint);
  const lastOrderAt = footprint?.last?.created_at ? new Date(footprint.last.created_at) : null;
  const isDuplicateRisk = !!lastOrderAt && Date.now() - lastOrderAt.getTime() < 24 * 60 * 60 * 1000;

  /** Copy a paste-ready order summary (for WhatsApp / courier / team chat). */
  const copySummary = () => {
    if (!order) return;
    const lines = [
      `#${invoiceDisplay(order)}`,
      `${customerName(order)} · ${customerPhone(order)}`,
      `${order.shipping_address ?? ""}, ${[order.shipping_thana, order.shipping_city, order.shipping_district].filter(Boolean).join(", ")}`,
      "",
      ...items.map((it) => `• ${it.name}${it.variant_label ? ` (${it.variant_label})` : ""} × ${it.quantity} = ৳${Number(it.line_total ?? Number(it.unit_price ?? it.price) * it.quantity).toLocaleString()}`),
      "",
      `Subtotal: ৳${subtotal.toLocaleString()}`,
      `Shipping: ৳${shippingFee.toLocaleString()}`,
      ...(advanceAmount > 0 ? [`Advance: ৳${advanceAmount.toLocaleString()}`] : []),
      `${advanceAmount > 0 ? "Due" : "Total"}: ৳${payableTotal.toLocaleString()}`,
    ];
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Order summary copied");
  };

  const copyAddress = () => {
    if (!order) return;
    navigator.clipboard.writeText(
      `${customerName(order)}, ${customerPhone(order)}\n${order.shipping_address ?? ""}, ${[order.shipping_thana, order.shipping_city, order.shipping_district].filter(Boolean).join(", ")}`,
    );
    toast.success("Address copied");
  };

  const confirmPrimary = () => {
    if (mode === "web") onPickWebStatus("complete");
    else guardedAction(() => updateStatus.mutate("confirmed" as OrderStatus));
  };

  /** Keyboard shortcuts — power-user speed on the confirmation desk. */
  useEffect(() => {
    if (!orderId || editingBlocked) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "c") { e.preventDefault(); confirmPrimary(); }
      else if (k === "h" && mode === "web") { e.preventDefault(); onPickWebStatus("on_hold"); }
      else if (k === "r" && mode === "web") { e.preventDefault(); onPickWebStatus("no_response"); }
      else if (k === "a" && mode === "web") { e.preventDefault(); onPickWebStatus("advance_payment"); }
      else if (k === "p" && phone) { e.preventDefault(); window.location.href = `tel:${phone}`; if (orderId) logCall.mutate({ orderId, attempts: callAttempts, currentStatus: callStatus }); }
      else if (k === "y") { e.preventDefault(); copySummary(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, editingBlocked, mode, phone, callAttempts, callStatus, items, order]);

  return (
    <Dialog open={!!orderId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl w-[96vw] max-h-[92vh] overflow-hidden p-0 gap-0 border-border/60">
        {isLoading || !order ? (
          <div className="flex items-center justify-center h-60"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <DialogHeader className="px-6 pt-5 pb-4 bg-gradient-to-r from-primary/10 via-background to-background border-b">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-left">
                  <div className="h-11 w-11 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                    <Hash className="h-5 w-5" />
                  </div>
                  <div className="space-y-0.5">
                    <DialogTitle className="font-mono text-xl tracking-tight">#{invoiceDisplay(order)}</DialogTitle>
                    <DialogDescription className="text-[11px] flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(order.created_at), "dd MMM yyyy, hh:mm a")}</span>
                      <span className="text-muted-foreground/50">·</span>
                      <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" />{order.source ?? "—"}</span>
                    </DialogDescription>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</div>
                    <div className="text-xl font-bold tabular-nums">৳ {payableTotal.toLocaleString()}</div>
                  </div>
                  <Badge className={statusBadge(mode === "web" ? "confirmed" : order.status).className + " text-xs px-3 py-1 rounded-full"}>
                    {mode === "web" ? webStatusLabel((order as { web_status?: string | null }).web_status) : statusBadge(order.status).label}
                  </Badge>
                </div>
              </div>
            </DialogHeader>

            <div className="overflow-y-auto max-h-[calc(92vh-90px)] bg-muted/20">
              {lockState.error && (
                <div className="px-5 pt-4">
                  <div className="flex items-center gap-2 rounded-lg border border-rose-400/60 bg-rose-50 px-4 py-2.5 text-sm text-rose-800 shadow-sm dark:bg-rose-950/40 dark:text-rose-200">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Order lock check failed: {lockState.error}
                  </div>
                </div>
              )}
              {lockState.heldByOther && lockState.lock && (
                <div className="px-5 pt-4">
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-400/60 bg-amber-50 dark:bg-amber-950/40 px-4 py-2.5 shadow-sm">
                    <div className="flex items-center gap-2.5 text-sm">
                      <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <div>
                        <div className="font-semibold text-amber-900 dark:text-amber-200">
                          Order opened by {lockState.lock.user_name ?? "another user"}
                        </div>
                        <div className="text-[11px] text-amber-700/80 dark:text-amber-300/80">
                          Same order ekhane edit korle conflict hote pare. Takeover korle oder access bondho hoye jabe.
                        </div>
                        <div className="text-[11px] font-medium mt-0.5">
                          <LockCountdown lastHeartbeatAt={lockState.lock.last_heartbeat_at} tone="amber" />
                        </div>
                      </div>
                    </div>
                    <Button size="sm" variant="default" className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5" onClick={() => lockState.takeOver()}>
                      <Lock className="h-3.5 w-3.5" /> Takeover
                    </Button>
                  </div>
                </div>
              )}
              {lockState.isMine && (
                <div className="px-5 pt-4">
                  <div className="inline-flex items-center gap-2 rounded-md border border-emerald-400/50 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    You are editing this order
                    {lockState.lock && (
                      <span className="mx-1 text-emerald-400">·</span>
                    )}
                    {lockState.lock && (
                      <LockCountdown lastHeartbeatAt={lockState.lock.last_heartbeat_at} tone="emerald" />
                    )}
                  </div>
                </div>
              )}
              {editingBlocked ? (
                <div className="p-5">
                  <div className="rounded-xl border border-amber-300/70 bg-card p-8 text-center shadow-sm">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300">
                      <ShieldAlert className="h-6 w-6" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">This order is locked</h3>
                    <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                      {lockState.lock?.user_name ?? "Another user"} is working on this order. Takeover korle tar session close hoye tomar edit access open hobe.
                    </p>
                    {lockState.lock && (
                      <div className="mt-3 text-xs font-medium">
                        <LockCountdown lastHeartbeatAt={lockState.lock.last_heartbeat_at} tone="amber" />
                      </div>
                    )}
                    <Button className="mt-5 gap-1.5" onClick={() => lockState.takeOver()}>
                      <Lock className="h-3.5 w-3.5" /> Takeover & Open
                    </Button>
                  </div>
                </div>
              ) : (
              <>
              {/* QUICK ACTIONS — one tap status change */}
              <div className="sticky top-0 z-20 border-b bg-background/95 px-5 py-3 backdrop-blur">
                {/* Primary CTA — big, always first, full width on mobile */}
                {mode === "web" ? (
                  <Button
                    size="lg"
                    className="mb-2.5 h-12 w-full gap-2 rounded-xl bg-emerald-600 text-base font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 sm:w-auto sm:min-w-[16rem]"
                    disabled={updateWebStatus.isPending}
                    onClick={() => onPickWebStatus("complete")}
                  >
                    {updateWebStatus.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />} Confirm Order
                  </Button>
                ) : order.status !== "confirmed" && order.status !== "delivered" ? (
                  <Button
                    size="lg"
                    className="mb-2.5 h-12 w-full gap-2 rounded-xl bg-emerald-600 text-base font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 sm:w-auto sm:min-w-[16rem]"
                    disabled={updateStatus.isPending}
                    onClick={() => guardedAction(() => updateStatus.mutate("confirmed" as OrderStatus))}
                  >
                    {updateStatus.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />} Confirm Order
                  </Button>
                ) : null}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quick actions</span>
                  {mode === "web" ? (
                    <>
                      <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={updateWebStatus.isPending} onClick={() => onPickWebStatus("good_but_no_response")}>
                        <PhoneOff className="h-3.5 w-3.5" /> Good / No response
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={updateWebStatus.isPending} onClick={() => onPickWebStatus("no_response")}>
                        <PhoneOff className="h-3.5 w-3.5" /> No response
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={updateWebStatus.isPending} onClick={() => onPickWebStatus("on_hold")}>
                        <PauseCircle className="h-3.5 w-3.5" /> On hold
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 border-violet-300 text-violet-700 dark:border-violet-900 dark:text-violet-300" disabled={updateWebStatus.isPending} onClick={() => onPickWebStatus("advance_payment")}>
                        <Wallet className="h-3.5 w-3.5" /> Advance
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 text-destructive" disabled={updateWebStatus.isPending} onClick={() => onPickWebStatus("cancelled")}>
                        <X className="h-3.5 w-3.5" /> Cancel
                      </Button>
                    </>
                  ) : (

                    <>
                      {(["confirmed", "packed", "ready_to_ship", "delivered"] as OrderStatus[])
                        .filter((s) => s !== order.status && s !== "confirmed")

                        .map((s) => (
                          <Button key={s} size="sm" variant="outline" className="h-8 gap-1.5" disabled={updateStatus.isPending} onClick={() => guardedAction(() => updateStatus.mutate(s))}>
                            {STATUS_BADGE[s]?.label ?? s.replace(/_/g, " ")}
                          </Button>
                        ))}
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 text-destructive" disabled={updateStatus.isPending} onClick={() => guardedAction(() => updateStatus.mutate("cancelled" as OrderStatus))}>
                        <X className="h-3.5 w-3.5" /> Cancel
                      </Button>
                    </>
                  )}
                  <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
                  {phone && (
                    <>
                      <a
                        href={`tel:${phone}`}
                        onClick={() => orderId && logCall.mutate({ orderId, attempts: callAttempts, currentStatus: callStatus })}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                      >
                        <PhoneCall className="h-3.5 w-3.5" /> Call now{callAttempts > 0 ? ` (${callAttempts})` : ""}
                      </a>
                      <a
                        href={`https://wa.me/88${phone.replace(/\D/g, "").slice(-11)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                      </a>
                    </>
                  )}
                  <div className="ml-auto flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Call</span>
                    <Select value={callStatus} disabled={setCallStatus.isPending || editingBlocked} onValueChange={(v) => guardedAction(() => setCallStatus.mutate(v))}>
                      <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CALL_STATUS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {(lastCallAt || orderTags.length > 0 || trackingNumber) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    {lastCallAt && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />Last call {format(new Date(lastCallAt), "dd MMM, hh:mm a")}</span>}
                    {trackingNumber && (
                      <span className="inline-flex items-center gap-1"><Truck className="h-3 w-3" />{courierNameVal ?? "Courier"} · <span className="font-mono text-foreground">{trackingNumber}</span></span>
                    )}
                    {orderTags.map((t) => (
                      <Badge key={t} variant="outline" className="h-5 gap-1 px-1.5 text-[10px]"><TagIcon className="h-2.5 w-2.5" />{t}</Badge>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground" onClick={copySummary}>
                    <ClipboardCopy className="h-3.5 w-3.5" /> Copy summary
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground" onClick={copyAddress}>
                    <MapPin className="h-3.5 w-3.5" /> Copy address
                  </Button>
                  <span className="ml-auto hidden items-center gap-1.5 text-[10px] text-muted-foreground md:inline-flex">
                    <Command className="h-3 w-3" />
                    {(["C confirm", ...(mode === "web" ? ["A advance", "H hold", "R no-response"] : []), "P call", "Y copy"]).map((s) => (
                      <kbd key={s} className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[9px]">{s}</kbd>
                    ))}
                  </span>
                </div>
              </div>

              {(risk || isDuplicateRisk) && (
                <div className="flex flex-wrap gap-2 px-5 pt-4">
                  {risk && (
                    <div className={cn(
                      "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium",
                      risk.level === "high" && "border-rose-300/70 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200",
                      risk.level === "watch" && "border-amber-300/70 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200",
                      risk.level === "good" && "border-emerald-300/70 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200",
                    )}>
                      {risk.level === "good" ? <ShieldCheck className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                      <span>{risk.label} · <span className="font-normal opacity-80">{risk.detail}</span></span>
                    </div>
                  )}
                  {isDuplicateRisk && (
                    <div className="inline-flex items-center gap-2 rounded-lg border border-violet-300/70 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-800 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-200">
                      <Repeat2 className="h-4 w-4 shrink-0" />
                      Possible duplicate — same number theke {lastOrderAt ? format(lastOrderAt, "dd MMM, hh:mm a") : ""} e ekta order ache
                    </div>
                  )}
                </div>
              )}

              <div className="grid lg:grid-cols-3 gap-4 p-5">

                {/* LEFT — Customer + Items (2 cols) */}
                <div className="lg:col-span-2 space-y-4">
                  {/* Customer */}
                  <section className="rounded-xl border bg-card p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><User className="h-3.5 w-3.5" />Customer</h3>
                      {customerEditing ? (
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="ghost" className="h-7 px-2 gap-1" onClick={cancelCustomerEdit} disabled={saveCustomer.isPending}>
                            <X className="h-3.5 w-3.5" />Cancel
                          </Button>
                          <Button size="sm" className="h-7 px-2 gap-1" onClick={() => guardedAction(() => saveCustomer.mutate())} disabled={saveCustomer.isPending || editingBlocked}>
                            {saveCustomer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            Save
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={startCustomerEdit} disabled={editingBlocked}>
                          <Pencil className="h-3.5 w-3.5" />Edit
                        </Button>
                      )}
                    </div>
                    {customerEditing ? (
                      <div className="grid gap-3 text-sm sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Name</Label>
                          <Input value={customerDraft.shipping_name} onChange={(e) => setCustomerDraft((d) => ({ ...d, shipping_name: e.target.value }))} className="h-8" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Phone Number</Label>
                          <Input value={customerDraft.shipping_phone} onChange={(e) => setCustomerDraft((d) => ({ ...d, shipping_phone: e.target.value }))} className="h-8 font-mono" />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-[11px] text-muted-foreground">Address</Label>
                          <Textarea rows={3} value={customerDraft.shipping_address} onChange={(e) => setCustomerDraft((d) => ({ ...d, shipping_address: e.target.value }))} className="resize-none text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Thana / Zone</Label>
                          <Input value={customerDraft.shipping_thana} onChange={(e) => setCustomerDraft((d) => ({ ...d, shipping_thana: e.target.value }))} className="h-8" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">City</Label>
                          <Input value={customerDraft.shipping_city} onChange={(e) => setCustomerDraft((d) => ({ ...d, shipping_city: e.target.value }))} className="h-8" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">District</Label>
                          <Input value={customerDraft.shipping_district} onChange={(e) => setCustomerDraft((d) => ({ ...d, shipping_district: e.target.value }))} className="h-8" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Shipping Note</Label>
                          <Input value={customerDraft.shipping_note} onChange={(e) => setCustomerDraft((d) => ({ ...d, shipping_note: e.target.value }))} className="h-8" />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-[11px] text-muted-foreground">Customer Note</Label>
                          <Textarea rows={2} value={customerDraft.customer_note} onChange={(e) => setCustomerDraft((d) => ({ ...d, customer_note: e.target.value }))} className="resize-none text-sm" />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold">{customerName(order)}</span>
                          {footprint && footprint.total > 0 && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-2 py-0.5 text-[10px] font-medium">
                              <History className="h-3 w-3" />
                              {footprint.total} past
                              <span className="text-emerald-600 dark:text-emerald-400">{footprint.delivered}✓</span>
                              {footprint.returned > 0 && <span className="text-rose-600 dark:text-rose-400">{footprint.returned}↩</span>}
                              {footprint.cancelled > 0 && <span className="text-muted-foreground">{footprint.cancelled}✕</span>}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <a
                            href={`tel:${customerPhone(order)}`}
                            title="Call customer (logs a call attempt)"
                            onClick={() => {
                              if (!orderId) return;
                              logCall.mutate({ orderId, attempts: callAttempts, currentStatus: callStatus });
                            }}
                            className={cn("flex items-center gap-2 text-foreground transition-colors hover:text-primary")}
                          >
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" /><span className="font-medium tabular-nums">{customerPhone(order)}</span>
                          </a>
                          <button
                            type="button"
                            title="Copy phone"
                            onClick={() => { navigator.clipboard.writeText(customerPhone(order)); toast.success("Phone copied"); }}
                            className="text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="flex items-start gap-2 text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span className="leading-relaxed">{order.shipping_address}, {[order.shipping_thana, order.shipping_city, order.shipping_district].filter(Boolean).join(", ")}</span>
                        </div>
                        {((order as { shipping_note?: string | null }).shipping_note ?? "").trim() && (
                          <div className="mt-2 flex items-start gap-2 p-2 rounded-md border border-sky-300/60 bg-sky-50 dark:bg-sky-950/30 dark:border-sky-900/50">
                            <StickyNote className="h-3.5 w-3.5 mt-0.5 shrink-0 text-sky-600 dark:text-sky-400" />
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Shipping Note</div>
                              <p className="text-xs text-foreground leading-snug">{(order as { shipping_note?: string | null }).shipping_note}</p>
                            </div>
                          </div>
                        )}
                        {(order.customer_note ?? "").trim() && (
                          <div className="mt-2 flex items-start gap-2 p-2 rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/50">
                            <StickyNote className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">Customer Note</div>
                              <p className="text-xs text-foreground leading-snug">{order.customer_note}</p>
                            </div>
                          </div>
                        )}
                      </div>
                     )}

                    <OrderLocationIntel
                      orderId={orderId}
                      address={[order.shipping_address, order.shipping_thana, order.shipping_city, order.shipping_district]
                        .filter(Boolean)
                        .join(", ")}
                    />
                  </section>





                  {/* Items */}
                  <section className="rounded-xl border bg-card p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Package className="h-3.5 w-3.5" />Items ({items.length})</h3>
                      {!itemsEditing && (
                        <button
                          type="button"
                          onClick={() => guardedAction(() => setItemsEditing(true))}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                        >
                          <Pencil className="h-3 w-3" /> Edit / Add product
                        </button>
                      )}
                    </div>
                    {itemsEditing ? (
                      <OrderItemsEditor
                        orderId={orderId!}
                        shippingFee={shippingFee}
                        discountAmount={discountAmount}
                        disabled={editingBlocked}
                        onDone={() => setItemsEditing(false)}
                        items={items.map((it) => ({
                          id: it.id,
                          product_id: (it as { product_id: string }).product_id,
                          variant_id: (it as { variant_id?: string | null }).variant_id ?? null,
                          variant_label: it.variant_label ?? null,
                          name: it.name ?? "Item",
                          image: (it as { image?: string | null }).image ?? null,
                          unit_price: Number(it.unit_price ?? it.price ?? 0),
                          quantity: Number(it.quantity ?? 1),
                        }))}
                      />
                    ) : (
                    <div className="space-y-2">
                      {items.map((it) => (
                        <div key={it.id} className="flex items-center justify-between gap-3 text-sm p-2.5 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors">
                          <ItemThumb src={(it as { image?: string | null }).image} alt={it.name ?? "item"} />
                          <div className="flex-1 min-w-0">

                            <div className="font-medium truncate">{it.name}</div>
                            {it.variant_label && <div className="text-xs text-muted-foreground mt-0.5">{it.variant_label}</div>}
                            <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">Qty: <span className="font-semibold text-foreground">{it.quantity}</span> × ৳ {Number(it.unit_price ?? it.price).toLocaleString()}</div>
                          </div>
                          <div className="font-bold whitespace-nowrap tabular-nums">৳ {Number(it.line_total ?? Number(it.price) * it.quantity).toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                    )}

                    <div className="mt-4 pt-3 border-t space-y-1.5 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">৳ {subtotal.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span className="tabular-nums">৳ {shippingFee.toLocaleString()}</span></div>
                      <div className="rounded-md border bg-muted/30 p-2.5 mt-1 space-y-1">
                        <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><Truck className="h-3 w-3" /> Courier Actual Charge</span>
                          <button onClick={openFeeDialog} className="text-primary hover:underline inline-flex items-center gap-0.5">
                            <Pencil className="h-3 w-3" /> {hasActual ? "Edit" : "Set"}
                          </button>
                        </div>
                        {hasActual ? (
                          <>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Courier charged us</span>
                              <span className="tabular-nums font-medium">৳ {actualNum.toLocaleString()}</span>
                            </div>
                            {actualShippingBreakdown && (Number(actualShippingBreakdown.delivery ?? 0) > 0 || Number(actualShippingBreakdown.cod ?? 0) > 0 || Number(actualShippingBreakdown.extra ?? 0) > 0) && (
                              <div className="rounded bg-background/60 border border-dashed px-2 py-1.5 space-y-0.5 text-[11px]">
                                <div className="flex justify-between"><span className="text-muted-foreground">Delivery charge</span><span className="tabular-nums">৳ {Number(actualShippingBreakdown.delivery ?? 0).toLocaleString()}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">COD charge</span><span className="tabular-nums">৳ {Number(actualShippingBreakdown.cod ?? 0).toLocaleString()}</span></div>
                                {Number(actualShippingBreakdown.extra ?? 0) > 0 && (
                                  <div className="flex justify-between"><span className="text-muted-foreground">Extra charge</span><span className="tabular-nums">৳ {Number(actualShippingBreakdown.extra ?? 0).toLocaleString()}</span></div>
                                )}
                                <div className="flex justify-between font-semibold pt-1 mt-1 border-t border-dashed"><span>Total delivery charge</span><span className="tabular-nums">৳ {Number(actualShippingBreakdown.total ?? actualNum).toLocaleString()}</span></div>
                              </div>
                            )}
                            <div className={`flex justify-between text-sm font-semibold ${shippingLoss > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                              <span>{shippingLoss > 0 ? "Shipping loss" : "Shipping margin"}</span>
                              <span className="tabular-nums">{shippingLoss > 0 ? "− " : "+ "}৳ {Math.abs(shippingLoss).toLocaleString()}</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">Source: {actualShippingSource ?? "—"}</div>
                          </>
                        ) : (
                          <p className="text-[11px] text-muted-foreground italic">Courier sync er por automatic bose jabe, ba manually set koro.</p>
                        )}
                      </div>
                      {discountAmount > 0 && (
                        <div className="flex justify-between text-emerald-600 dark:text-emerald-400"><span>Discount</span><span className="tabular-nums">− ৳ {discountAmount.toLocaleString()}</span></div>
                      )}
                      {advanceAmount > 0 && (
                        <div className="space-y-1.5 rounded-md border bg-muted/30 p-2.5">
                          <div className="flex justify-between font-semibold text-emerald-600 dark:text-emerald-400"><span>Advance Paid</span><span className="tabular-nums">− ৳ {advanceAmount.toLocaleString()}</span></div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[11px] text-muted-foreground">
                            <span><b className="text-foreground">Source:</b> {advanceSource || "—"}</span>
                            <span><b className="text-foreground">Number:</b> {advancePaymentNumber || "—"}</span>
                            <span><b className="text-foreground">Txn ID:</b> {advanceTxnId || "—"}</span>
                          </div>
                          <div className="pt-1.5 border-t flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-[11px] text-muted-foreground">
                              {advancePaymentNumber
                                ? "Payment number diyecho — accounts e record koro."
                                : "Payment number ID pele niche entry diye Confirm Received chapo."}
                            </span>
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white h-7"
                              disabled={!advancePaymentNumber || confirmAdvance.isPending}
                              onClick={() => confirmAdvance.mutate()}
                            >
                              {confirmAdvance.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirm Received"}
                            </Button>
                          </div>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-base pt-2 mt-1 border-t"><span>{advanceAmount > 0 ? "Due Total" : "Total"}</span><span className="tabular-nums text-primary">৳ {payableTotal.toLocaleString()}</span></div>
                    </div>
                  </section>

                  {/* Timeline */}
                  <section className="rounded-xl border bg-card p-4 shadow-sm">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Status Timeline</h3>
                    {history.length > 0 ? (
                      <div className="space-y-3 relative before:absolute before:left-[5px] before:top-2 before:bottom-2 before:w-px before:bg-border">
                        {history.map((h) => (
                          <div key={h.id} className="text-xs flex items-start gap-3 relative">
                            <div className="w-3 h-3 rounded-full bg-primary ring-4 ring-background mt-0.5 shrink-0 z-10" />
                            <div className="flex-1 pb-0.5">
                              <div className="text-sm"><span className="capitalize text-muted-foreground">{(h.from_status ?? "—").replace(/_/g, " ")}</span> <span className="text-muted-foreground/50">→</span> <span className="font-semibold capitalize">{(h.to_status ?? "").replace(/_/g, " ")}</span></div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">{format(new Date(h.created_at), "dd MMM, hh:mm a")}</div>
                              {h.note && <div className="text-xs text-muted-foreground italic mt-0.5">"{h.note}"</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No status changes recorded yet</p>
                    )}
                  </section>
                </div>

                {/* RIGHT — Actions + Notes */}
                <div className="space-y-4">
                  {/* Status + Assign */}
                  <section className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><ListChecks className="h-3.5 w-3.5" />Manage</h3>
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground mb-1.5 block">Status</label>
                      {mode === "web" ? (
                    <Select
                      value={(order as { web_status?: string | null }).web_status ?? "processing"}
                      disabled={updateWebStatus.isPending || editingBlocked}
                      onValueChange={onPickWebStatus}
                    >
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WEB_STATUS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={order.status} disabled={updateStatus.isPending || editingBlocked} onValueChange={(v) => guardedAction(() => updateStatus.mutate(v as OrderStatus))}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_GROUPS.map((g) => (
                          <div key={g.key}>
                            <div className="px-2 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {g.label}
                            </div>
                            {g.statuses.map((s) => (
                              <SelectItem key={s} value={s}>
                                {STATUS_BADGE[s]?.label ?? s.replace(/_/g, " ")}
                              </SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1"><UserCog className="h-3 w-3" />Assigned to</label>
                      <Select
                        value={order.assigned_to ?? "none"}
                        disabled={assignStaff.isPending || editingBlocked}
                        onValueChange={(v) => guardedAction(() => assignStaff.mutate(v === "none" ? null : v))}
                      >
                        <SelectTrigger className="h-9"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Unassigned —</SelectItem>
                          {staff.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.display_name ?? s.id.slice(0, 8)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {order.status !== "pre_order" && (
                      <Button
                        variant="outline"
                        className="w-full gap-1.5 border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-900 dark:text-indigo-300"
                        disabled={editingBlocked}
                        onClick={() => guardedAction(() => setPreorderOpen(true))}
                      >
                        <CalendarClock className="h-3.5 w-3.5" /> Convert to Pre-order
                      </Button>
                    )}
                  </section>

                  {/* Notes */}
                  <section className="rounded-xl border bg-card p-4 shadow-sm">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5"><StickyNote className="h-3.5 w-3.5" />Notes</h3>
                    <div className="space-y-2 mb-3">
                      <Textarea
                        placeholder="Add internal note…"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        className="resize-none text-sm"
                      />
                      <Button size="sm" className="w-full gap-1.5" disabled={!note.trim() || addNote.isPending || editingBlocked} onClick={() => guardedAction(() => addNote.mutate(undefined))}>
                        <Send className="h-3.5 w-3.5" />Add Note
                      </Button>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {QUICK_NOTES.map((q) => (
                          <button
                            key={q}
                            type="button"
                            disabled={addNote.isPending || editingBlocked}
                            onClick={() => guardedAction(() => addNote.mutate(q))}
                            className="rounded-full border bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                          >
                            + {q}
                          </button>
                        ))}
                      </div>
                    </div>
                    {notes.length > 0 ? (
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {notes.map((n) => (
                          <div key={n.id} className="p-3 rounded-lg border-l-4 border-l-amber-500 bg-amber-50/80 dark:bg-amber-950/30 shadow-sm">
                            <div className="text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">{format(new Date(n.created_at), "dd MMM, hh:mm a")}</div>
                            <div className="text-sm font-semibold text-foreground dark:text-amber-50 whitespace-pre-wrap leading-relaxed">{n.body}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic text-center py-3">No notes yet</p>
                    )}
                  </section>
                </div>
              </div>
              </>
              )}

            </div>
          </>
        )}

        <Dialog open={advOpen} onOpenChange={setAdvOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Advance Payment</DialogTitle>
          <DialogDescription>Customer kotota advance pay korlo, ki diye?</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Advance Amount (৳) <span className="text-rose-600">*</span></Label>
            <Input type="number" min={1} autoFocus value={advAmount} onChange={(e) => setAdvAmount(e.target.value)} placeholder="e.g. 100" />
          </div>
          <div>
            <Label>Payment Source <span className="text-rose-600">*</span></Label>
            <Select value={advSource} onValueChange={setAdvSource}>
              <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bKash">bKash</SelectItem>
                <SelectItem value="Nagad">Nagad</SelectItem>
                <SelectItem value="Rocket">Rocket</SelectItem>
                <SelectItem value="Upay">Upay</SelectItem>
                <SelectItem value="Bank">Bank Transfer</SelectItem>
                <SelectItem value="Card">Card</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Payment Number / Last 4 Digits <span className="text-rose-600">*</span></Label>
            <Input
              inputMode="numeric"
              maxLength={20}
              value={advNumber}
              onChange={(e) => setAdvNumber(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="e.g. 01712345678 or 5678"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">Full number ba last 4 digit — jeta accept koreche.</p>
          </div>
          <div>
            <Label className="text-muted-foreground">Transaction ID <span className="text-muted-foreground/70">(optional)</span></Label>
            <Input maxLength={50} value={advTxnId} onChange={(e) => setAdvTxnId(e.target.value)} placeholder="e.g. 9F7A2BX1Q" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setAdvOpen(false)}>Cancel</Button>
          <Button disabled={updateWebStatus.isPending} onClick={submitAdvance} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {updateWebStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
        </Dialog>

        <Dialog open={feeOpen} onOpenChange={setFeeOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Courier Actual Charge</DialogTitle>
              <DialogDescription>
                Courier (Pathao/Steadfast) amader theke koto taka delivery charge niyeche? Eta finance e expense entry hisebe boshe jabe.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Customer Paid (Shipping)</Label>
                <Input value={`৳ ${shippingFee.toLocaleString()}`} disabled />
              </div>
              <div>
                <Label>Courier Actual Charge (৳) <span className="text-rose-600">*</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  autoFocus
                  value={feeAmount}
                  onChange={(e) => setFeeAmount(e.target.value)}
                  placeholder="e.g. 108.50"
                />
                {feeAmount && Number(feeAmount) > 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {Number(feeAmount) > shippingFee
                      ? <>Loss: <span className="text-rose-600 font-semibold">৳ {(Number(feeAmount) - shippingFee).toLocaleString()}</span></>
                      : <>Margin: <span className="text-emerald-600 font-semibold">৳ {(shippingFee - Number(feeAmount)).toLocaleString()}</span></>}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setFeeOpen(false)}>Cancel</Button>
              <Button
                disabled={saveFee.isPending || !feeAmount || Number(feeAmount) < 0 || editingBlocked}
                onClick={() => guardedAction(() => saveFee.mutate(Number(feeAmount)))}
              >
                {saveFee.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <PreorderConvertDialog
          open={preorderOpen}
          onOpenChange={setPreorderOpen}
          orderIds={orderId ? [orderId] : []}
          brandId={(order as { brand_id?: string | null } | undefined)?.brand_id ?? null}
          onDone={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}