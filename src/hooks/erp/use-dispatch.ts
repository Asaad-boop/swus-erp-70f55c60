import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { pathaoBookOrderAutoFn } from "@/lib/erp/pathao.functions";
import { steadfastBookOrderFn } from "@/lib/erp/steadfast.functions";
import { dispatchFeedback } from "@/lib/erp/dispatch/feedback";

/* ------------------------------------------------------------------ types */

export type DispatchStage = "pending" | "packed" | "ready" | "shipped" | "hold";
export type DispatchMode = "pack" | "ready" | "ship";
export type CourierProvider = "pathao" | "steadfast" | "manual";

export type DispatchOrder = {
  id: string;
  invoice_no: string | null;
  brand_id: string | null;
  status: string;
  total: number | null;
  payment_method: string | null;
  courier_name: string | null;
  shipping_name: string | null;
  guest_name: string | null;
  shipping_phone: string | null;
  guest_phone: string | null;
  shipping_address: string | null;
  shipping_thana: string | null;
  shipping_city: string | null;
  shipping_district: string | null;
  tracking_number: string | null;
  printed_at: string | null;
  updated_at: string | null;
  created_at: string | null;
  packaged_at: string | null;
  shipping_note?: string | null;
  customer_note?: string | null;
  advance_amount?: number | null;
  items?: Array<{ name: string; variant_label: string | null; quantity: number; price: number; image: string | null; product?: { sku: string | null } | null; variant?: { sku: string | null } | null }>;
};

export type DispatchData = Record<DispatchStage, DispatchOrder[]>;

export type ScanEntry = {
  id: string;
  ok: boolean;
  msg: string;
  invoice?: string;
  orderId?: string;
  fromStatus?: string;
  toStatus?: string;
  undoable?: boolean;
  at: number;
};

export type FailedBooking = {
  orderId: string;
  invoice: string;
  provider: CourierProvider;
  error: string;
  at: number;
};

/* -------------------------------------------------------------- constants */

export const PENDING_STATUSES = ["confirmed", "ready_to_pack", "packaging"] as const;

const STAGE_OF: Record<string, DispatchStage> = {
  confirmed: "pending",
  ready_to_pack: "pending",
  packaging: "pending",
  packed: "packed",
  ready_to_ship: "ready",
  shipped: "shipped",
  courier_entry: "shipped",
  in_transit: "shipped",
  on_hold: "hold",
};

export function stageFor(status: string): DispatchStage | null {
  return STAGE_OF[status] ?? null;
}

export const NEXT_STATUS: Record<DispatchMode, "packed" | "ready_to_ship" | "shipped"> = {
  pack: "packed",
  ready: "ready_to_ship",
  ship: "shipped",
};

const REQUIRED_STAGE: Record<DispatchMode, DispatchStage> = {
  pack: "pending",
  ready: "packed",
  ship: "ready",
};

/* ---------------------------------------------------------------- helpers */

export function bdt(n: number) {
  return `৳${Math.round(n).toLocaleString("en-BD")}`;
}
export function sumTotal(rows: DispatchOrder[]) {
  return rows.reduce((s, r) => s + (r.total ?? 0), 0);
}
export function isCod(o: DispatchOrder) {
  const m = (o.payment_method ?? "").toLowerCase();
  return m.includes("cod") || m.includes("cash");
}
export function itemCount(o: DispatchOrder) {
  return (o.items ?? []).reduce((s, it) => s + (it.quantity ?? 0), 0);
}
export function customerName(o: DispatchOrder) {
  return o.shipping_name ?? o.guest_name ?? "—";
}
export function customerPhone(o: DispatchOrder) {
  return (o.shipping_phone ?? o.guest_phone ?? "").trim();
}
export function customerArea(o: DispatchOrder) {
  return [o.shipping_thana, o.shipping_city].filter(Boolean).join(", ");
}
export function fullAddress(o: DispatchOrder) {
  return [o.shipping_address, o.shipping_thana, o.shipping_city, o.shipping_district].filter(Boolean).join(", ");
}
export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
export function stageTime(o: DispatchOrder, stage: DispatchStage) {
  if (stage === "pending") return o.created_at;
  if (stage === "packed") return o.packaged_at ?? o.updated_at;
  return o.updated_at;
}
/** Blocking problems that will break a courier booking. */
export function preflight(o: DispatchOrder): string[] {
  const issues: string[] = [];
  const phone = customerPhone(o).replace(/[^0-9]/g, "");
  if (phone.length < 11) issues.push("Phone number invalid (11 digits লাগবে)");
  if (!fullAddress(o).trim()) issues.push("Shipping address missing");
  if (customerName(o) === "—") issues.push("Customer name missing");
  return issues;
}

const SELECT =
  "id, invoice_no, brand_id, status, total, payment_method, courier_name, shipping_name, guest_name, shipping_phone, guest_phone, shipping_address, shipping_thana, shipping_city, shipping_district, tracking_number, printed_at, updated_at, created_at, packaged_at, shipping_note, customer_note, advance_amount, items:order_items(name, variant_label, quantity, price, image, product:products(sku), variant:product_variants(sku))";

const EMPTY: DispatchData = { pending: [], packed: [], ready: [], shipped: [], hold: [] };

/* ------------------------------------------------------------------- hook */

export function useDispatch() {
  const { brandIds, brands } = useBrand();
  const qc = useQueryClient();
  const bookPathao = useServerFn(pathaoBookOrderAutoFn);
  const bookSteadfast = useServerFn(steadfastBookOrderFn);

  const [mode, setMode] = useState<DispatchMode>("pack");
  const [scanLog, setScanLog] = useState<ScanEntry[]>([]);
  const [failed, setFailed] = useState<FailedBooking[]>([]);
  const [busy, setBusy] = useState(false);
  const [sessionCount, setSessionCount] = useState<Record<DispatchMode, number>>({ pack: 0, ready: 0, ship: 0 });

  const [provider, setProviderState] = useState<CourierProvider>(() => {
    if (typeof window === "undefined") return "pathao";
    const v = window.localStorage.getItem("erp.dispatch.provider");
    return v === "steadfast" || v === "manual" ? v : "pathao";
  });
  const setProvider = useCallback((p: CourierProvider) => {
    setProviderState(p);
    try {
      window.localStorage.setItem("erp.dispatch.provider", p);
    } catch {
      /* ignore */
    }
  }, []);

  const queryKey = useMemo(() => ["dispatch-orders", brandIds.join(",")] as const, [brandIds]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey,
    enabled: brandIds.length > 0,
    refetchInterval: 60_000,
    staleTime: 10_000,
    queryFn: async (): Promise<DispatchData> => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayIso = today.toISOString();

      const [pending, packed, ready, shipped, hold] = await Promise.all([
        applyBrandScope(supabase.from("orders").select(SELECT).in("status", PENDING_STATUSES as unknown as never[]), brandIds)
          // web-source orders stay in the Web Orders queue until web_status = complete
          .or("status.neq.confirmed,source.is.null,source.not.in.(website,pixel,utm),web_status.eq.complete")
          .order("created_at", { ascending: true })
          .limit(600),
        applyBrandScope(supabase.from("orders").select(SELECT).eq("status", "packed"), brandIds)
          .order("packaged_at", { ascending: true })
          .limit(600),
        applyBrandScope(supabase.from("orders").select(SELECT).eq("status", "ready_to_ship"), brandIds)
          .order("updated_at", { ascending: true })
          .limit(600),
        applyBrandScope(supabase.from("orders").select(SELECT).in("status", ["shipped", "courier_entry", "in_transit"] as unknown as never[]).gte("updated_at", todayIso), brandIds)
          .order("updated_at", { ascending: false })
          .limit(600),
        applyBrandScope(supabase.from("orders").select(SELECT).eq("status", "on_hold"), brandIds)
          .order("updated_at", { ascending: false })
          .limit(200),
      ]);

      for (const r of [pending, packed, ready, shipped, hold]) if (r.error) throw r.error;

      return {
        pending: (pending.data ?? []) as unknown as DispatchOrder[],
        packed: (packed.data ?? []) as unknown as DispatchOrder[],
        ready: (ready.data ?? []) as unknown as DispatchOrder[],
        shipped: (shipped.data ?? []) as unknown as DispatchOrder[],
        hold: (hold.data ?? []) as unknown as DispatchOrder[],
      };
    },
  });

  const lists = data ?? EMPTY;

  /* ------------- realtime (throttled so the board never jumps mid-scan) */
  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (invalidateTimer.current) return;
    invalidateTimer.current = setTimeout(() => {
      invalidateTimer.current = null;
      qc.invalidateQueries({ queryKey });
    }, 1500);
  }, [qc, queryKey]);

  useEffect(() => {
    if (brandIds.length === 0) return;
    const ch = supabase
      .channel("dispatch-orders-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, scheduleRefresh)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
      if (invalidateTimer.current) {
        clearTimeout(invalidateTimer.current);
        invalidateTimer.current = null;
      }
    };
  }, [brandIds, scheduleRefresh]);

  /* ------------------------------------------------------- optimistic move */

  const applyLocal = useCallback(
    (orderId: string, nextStatus: string, patch?: Partial<DispatchOrder>) => {
      qc.setQueryData<DispatchData>(queryKey, (cur) => {
        if (!cur) return cur;
        let found: DispatchOrder | undefined;
        const next: DispatchData = { pending: [], packed: [], ready: [], shipped: [], hold: [] };
        (Object.keys(cur) as DispatchStage[]).forEach((k) => {
          next[k] = cur[k].filter((o) => {
            if (o.id === orderId) {
              found = o;
              return false;
            }
            return true;
          });
        });
        if (!found) return cur;
        const moved: DispatchOrder = {
          ...found,
          ...patch,
          status: nextStatus,
          updated_at: new Date().toISOString(),
          packaged_at: nextStatus === "packed" ? new Date().toISOString() : found.packaged_at,
        };
        const target = stageFor(nextStatus);
        if (target) next[target] = target === "shipped" ? [moved, ...next[target]] : [...next[target], moved];
        return next;
      });
    },
    [qc, queryKey],
  );

  const pushLog = useCallback((e: Omit<ScanEntry, "id" | "at">) => {
    setScanLog((cur) => [{ ...e, id: crypto.randomUUID(), at: Date.now() }, ...cur].slice(0, 20));
  }, []);

  const findLoaded = useCallback(
    (orderId: string): DispatchOrder | undefined => {
      const cur = qc.getQueryData<DispatchData>(queryKey) ?? EMPTY;
      for (const k of Object.keys(cur) as DispatchStage[]) {
        const hit = cur[k].find((o) => o.id === orderId);
        if (hit) return hit;
      }
      return undefined;
    },
    [qc, queryKey],
  );

  /** Raw status transition with optimistic move + rollback. */
  const transition = useCallback(
    async (order: DispatchOrder, nextStatus: string, note?: string, patch?: Partial<DispatchOrder>) => {
      const prevStatus = order.status;
      applyLocal(order.id, nextStatus, patch);
      const { error } = await supabase.rpc("transition_order_status", {
        _order_id: order.id,
        _new_status: nextStatus as never,
        _note: note ?? `Dispatch → ${nextStatus}`,
      });
      if (error) {
        applyLocal(order.id, prevStatus);
        throw error;
      }
      scheduleRefresh();
    },
    [applyLocal, scheduleRefresh],
  );

  /* ------------------------------------------------------- courier booking */

  const existingShipment = useCallback(async (orderId: string) => {
    const { data: rows } = await supabase
      .from("courier_shipments")
      .select("id, consignment_id, tracking_code, status, provider")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1);
    const row = (rows ?? [])[0];
    if (!row) return null;
    if (/cancel/i.test(row.status ?? "")) return null;
    return row;
  }, []);

  /**
   * Book with the chosen courier and move to shipped.
   * Returns the consignment string. Throws on failure — the stage never
   * advances when booking fails.
   */
  const shipOrder = useCallback(
    async (order: DispatchOrder, opts?: { provider?: CourierProvider; manualTracking?: string; manualCourier?: string }) => {
      const prov = opts?.provider ?? provider;
      const inv = order.invoice_no ?? order.id.slice(0, 8);

      const dup = await existingShipment(order.id);
      if (dup?.consignment_id) {
        throw Object.assign(new Error(`Already booked · ${dup.consignment_id}`), { duplicate: true });
      }

      let consignment = "";
      if (prov === "pathao") {
        const res: any = await bookPathao({ data: { orderId: order.id } });
        if (res?.blocked || res?.code === "PATHAO_CUSTOMER_BLOCKED") {
          throw new Error(res?.message || "Pathao এই customer number-এ booking block করেছে। অন্য courier ব্যবহার করুন।");
        }
        consignment = String(res?.consignment ?? res?.consignment_id ?? res?.tracking ?? "");
      } else if (prov === "steadfast") {
        const res: any = await bookSteadfast({
          data: { orderId: order.id, cod_amount: isCod(order) ? Number(order.total ?? 0) : 0 },
        });
        consignment = String(res?.consignment ?? res?.tracking ?? "");
      } else {
        const tracking = (opts?.manualTracking ?? "").trim();
        if (!tracking) throw new Error("Manual courier-এ tracking number দিতে হবে");
        const { error } = await supabase
          .from("orders")
          .update({
            courier_name: opts?.manualCourier?.trim() || "manual",
            tracking_number: tracking,
            courier_assigned_at: new Date().toISOString(),
          } as never)
          .eq("id", order.id);
        if (error) throw error;
        consignment = tracking;
      }

      await transition(order, "shipped", `Dispatch ship · ${prov}${consignment ? ` · ${consignment}` : ""}`, {
        courier_name: prov === "manual" ? opts?.manualCourier?.trim() || "manual" : prov,
        tracking_number: consignment || order.tracking_number,
      });
      return consignment;
    },
    [provider, existingShipment, bookPathao, bookSteadfast, transition],
  );

  /* ------------------------------------------------------------- advance */

  /** Advance one order by the given mode. Handles guards, sound, log, failures. */
  const advance = useCallback(
    async (order: DispatchOrder, useMode: DispatchMode = mode, shipOpts?: { provider?: CourierProvider; manualTracking?: string; manualCourier?: string }) => {
      const inv = order.invoice_no ?? order.id.slice(0, 8);
      const stage = stageFor(order.status);
      const need = REQUIRED_STAGE[useMode];

      if (stage !== need) {
        dispatchFeedback(stage === stageFor(NEXT_STATUS[useMode]) ? "duplicate" : "error");
        pushLog({
          ok: false,
          invoice: inv,
          orderId: order.id,
          msg:
            stage === stageFor(NEXT_STATUS[useMode])
              ? `#${inv} আগেই ${NEXT_STATUS[useMode].replace(/_/g, " ").toUpperCase()}`
              : `#${inv} এখন "${order.status}" — আগে ${need.toUpperCase()} করতে হবে`,
        });
        return false;
      }

      if (useMode === "ship") {
        const issues = preflight(order);
        if (issues.length > 0) {
          dispatchFeedback("error");
          pushLog({ ok: false, invoice: inv, orderId: order.id, msg: `#${inv} — ${issues[0]}` });
          setFailed((f) => [{ orderId: order.id, invoice: inv, provider: shipOpts?.provider ?? provider, error: issues[0], at: Date.now() }, ...f.filter((x) => x.orderId !== order.id)].slice(0, 30));
          return false;
        }
        try {
          const consignment = await shipOrder(order, shipOpts);
          dispatchFeedback("ship");
          setSessionCount((c) => ({ ...c, ship: c.ship + 1 }));
          setFailed((f) => f.filter((x) => x.orderId !== order.id));
          pushLog({
            ok: true,
            invoice: inv,
            orderId: order.id,
            fromStatus: "ready_to_ship",
            toStatus: "shipped",
            msg: `#${inv} → SHIPPED${consignment ? ` · ${consignment}` : ""}`,
          });
          return true;
        } catch (e: any) {
          const msg = e?.message ?? "Booking failed";
          dispatchFeedback("error");
          pushLog({ ok: false, invoice: inv, orderId: order.id, msg: `#${inv} — ${msg}` });
          setFailed((f) => [{ orderId: order.id, invoice: inv, provider: shipOpts?.provider ?? provider, error: msg, at: Date.now() }, ...f.filter((x) => x.orderId !== order.id)].slice(0, 30));
          return false;
        }
      }

      const next = NEXT_STATUS[useMode];
      try {
        await transition(order, next);
        dispatchFeedback(useMode === "pack" ? "pack" : "ready");
        setSessionCount((c) => ({ ...c, [useMode]: c[useMode] + 1 }));
        pushLog({
          ok: true,
          invoice: inv,
          orderId: order.id,
          fromStatus: order.status,
          toStatus: next,
          undoable: true,
          msg: `#${inv} → ${next === "packed" ? "PACKED" : "READY TO SHIP"}`,
        });
        return true;
      } catch (e: any) {
        dispatchFeedback("error");
        pushLog({ ok: false, invoice: inv, orderId: order.id, msg: `#${inv} — ${e?.message ?? "Failed"}` });
        return false;
      }
    },
    [mode, provider, pushLog, shipOrder, transition],
  );

  /* ---------------------------------------------------------- scan queue */

  const queueRef = useRef<string[]>([]);
  const runningRef = useRef(false);
  const lastScanRef = useRef<Map<string, number>>(new Map());
  const [lastResult, setLastResult] = useState<{ ok: boolean; order?: DispatchOrder; msg: string; at: number } | null>(null);

  const resolveOrder = useCallback(
    async (raw: string): Promise<DispatchOrder | null> => {
      const v = raw.trim().replace(/^#/, "");
      if (!v) return null;
      const cur = qc.getQueryData<DispatchData>(queryKey) ?? EMPTY;
      const lc = v.toLowerCase();
      for (const k of Object.keys(cur) as DispatchStage[]) {
        const hit = cur[k].find(
          (o) => (o.invoice_no ?? "").toLowerCase() === lc || o.id === v || o.id.slice(0, 8) === lc || (o.tracking_number ?? "").toLowerCase() === lc,
        );
        if (hit) return hit;
      }
      const { data: found, error } = await applyBrandScope(
        supabase.from("orders").select(SELECT).or(`invoice_no.eq.${v},invoice_no.ilike.%${v}%,tracking_number.eq.${v}`),
        brandIds,
      ).limit(1);
      if (error) throw error;
      return ((found ?? []) as unknown as DispatchOrder[])[0] ?? null;
    },
    [qc, queryKey, brandIds],
  );

  const drain = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    try {
      while (queueRef.current.length > 0) {
        const raw = queueRef.current.shift()!;
        const key = raw.trim().toLowerCase();
        const prev = lastScanRef.current.get(key);
        if (prev && Date.now() - prev < 2000) {
          dispatchFeedback("duplicate");
          setLastResult({ ok: false, msg: `Duplicate scan ignored · ${raw}`, at: Date.now() });
          continue;
        }
        lastScanRef.current.set(key, Date.now());
        try {
          const order = await resolveOrder(raw);
          if (!order) {
            dispatchFeedback("error");
            pushLog({ ok: false, msg: `No order found for "${raw}"` });
            setLastResult({ ok: false, msg: `No order found for "${raw}"`, at: Date.now() });
            continue;
          }
          const before = order.status;
          const ok = await advance(order, mode);
          setLastResult({
            ok,
            order: findLoaded(order.id) ?? order,
            msg: ok
              ? `#${order.invoice_no ?? order.id.slice(0, 8)} → ${NEXT_STATUS[mode].replace(/_/g, " ").toUpperCase()}`
              : `#${order.invoice_no ?? order.id.slice(0, 8)} — "${before}"`,
            at: Date.now(),
          });
        } catch (e: any) {
          dispatchFeedback("error");
          pushLog({ ok: false, msg: e?.message ?? "Scan failed" });
          setLastResult({ ok: false, msg: e?.message ?? "Scan failed", at: Date.now() });
        }
      }
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  }, [advance, findLoaded, mode, pushLog, resolveOrder]);

  /** Queue a scan — never dropped, processed strictly in order. */
  const scan = useCallback(
    (raw: string) => {
      const v = raw.trim();
      if (!v) return;
      queueRef.current.push(v);
      void drain();
    },
    [drain],
  );

  /* ---------------------------------------------------------------- undo */

  const undo = useCallback(
    async (entryId?: string) => {
      const entry = entryId ? scanLog.find((e) => e.id === entryId) : scanLog.find((e) => e.undoable && e.orderId && e.fromStatus);
      if (!entry?.orderId || !entry.fromStatus) return;
      const order = findLoaded(entry.orderId);
      try {
        if (order) await transition(order, entry.fromStatus, "Dispatch undo");
        else {
          const { error } = await supabase.rpc("transition_order_status", {
            _order_id: entry.orderId,
            _new_status: entry.fromStatus as never,
            _note: "Dispatch undo",
          });
          if (error) throw error;
          scheduleRefresh();
        }
        dispatchFeedback("undo");
        toast.success(`Undo · #${entry.invoice ?? ""} → ${entry.fromStatus}`);
        setScanLog((cur) => cur.map((e) => (e.id === entry.id ? { ...e, undoable: false, msg: `${e.msg} (undone)` } : e)));
      } catch (e: any) {
        dispatchFeedback("error");
        toast.error(e?.message ?? "Undo failed");
      }
    },
    [scanLog, findLoaded, transition, scheduleRefresh],
  );

  /* -------------------------------------------------------- bulk + fixes */

  const bulkAdvance = useCallback(
    async (orders: DispatchOrder[], useMode?: DispatchMode) => {
      let ok = 0;
      let fail = 0;
      for (const o of orders) {
        const stage = stageFor(o.status);
        const m: DispatchMode | null =
          useMode ?? (stage === "pending" ? "pack" : stage === "packed" ? "ready" : stage === "ready" ? "ship" : null);
        if (!m) continue;
        const done = await advance(o, m);
        done ? ok++ : fail++;
      }
      if (fail) toast.warning(`${ok} done · ${fail} failed`);
      else if (ok) toast.success(`${ok} order advanced`);
      return { ok, fail };
    },
    [advance],
  );

  const retryFailed = useCallback(async () => {
    const snapshot = [...failed];
    for (const f of snapshot) {
      const o = findLoaded(f.orderId);
      if (!o) continue;
      await advance(o, "ship", { provider: f.provider });
    }
  }, [failed, findLoaded, advance]);

  /** Free-form stage move used by the Fix menu (forward or backward). */
  const moveTo = useCallback(
    async (order: DispatchOrder, status: string, note?: string) => {
      try {
        await transition(order, status, note ?? `Dispatch manual fix → ${status}`);
        dispatchFeedback("undo");
        toast.success(`#${order.invoice_no ?? order.id.slice(0, 8)} → ${status.replace(/_/g, " ")}`);
      } catch (e: any) {
        dispatchFeedback("error");
        toast.error(e?.message ?? "Move failed");
      }
    },
    [transition],
  );

  const cancelBooking = useCallback(
    async (order: DispatchOrder) => {
      const { error } = await supabase
        .from("courier_shipments")
        .update({ status: "cancelled" } as never)
        .eq("order_id", order.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      await supabase.from("orders").update({ tracking_number: null } as never).eq("id", order.id);
      qc.setQueryData<DispatchData>(queryKey, (cur) => {
        if (!cur) return cur;
        const next = { ...cur };
        (Object.keys(next) as DispatchStage[]).forEach((k) => {
          next[k] = next[k].map((o) => (o.id === order.id ? { ...o, tracking_number: null } : o));
        });
        return next;
      });
      toast.success("Courier booking cancelled — এখন আবার book করা যাবে");
      scheduleRefresh();
    },
    [qc, queryKey, scheduleRefresh],
  );

  const updateContact = useCallback(
    async (order: DispatchOrder, patch: { shipping_phone?: string; shipping_address?: string; shipping_name?: string }) => {
      const { error } = await supabase.from("orders").update(patch as never).eq("id", order.id);
      if (error) {
        toast.error(error.message);
        return false;
      }
      qc.setQueryData<DispatchData>(queryKey, (cur) => {
        if (!cur) return cur;
        const next = { ...cur };
        (Object.keys(next) as DispatchStage[]).forEach((k) => {
          next[k] = next[k].map((o) => (o.id === order.id ? { ...o, ...patch } : o));
        });
        return next;
      });
      toast.success("Order updated");
      return true;
    },
    [qc, queryKey],
  );

  return {
    // data
    lists,
    brands,
    brandIds,
    isLoading,
    isFetching,
    refetch,
    queryKey,
    // mode / provider
    mode,
    setMode,
    provider,
    setProvider,
    // actions
    scan,
    advance,
    bulkAdvance,
    undo,
    moveTo,
    cancelBooking,
    updateContact,
    shipOrder,
    retryFailed,
    // state
    scanLog,
    clearLog: () => setScanLog([]),
    failed,
    dismissFailed: (orderId: string) => setFailed((f) => f.filter((x) => x.orderId !== orderId)),
    busy,
    lastResult,
    sessionCount,
  };
}

export type UseDispatch = ReturnType<typeof useDispatch>;
