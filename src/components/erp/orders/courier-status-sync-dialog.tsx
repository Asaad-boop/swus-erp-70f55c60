import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, AlertCircle, ArrowRight, Check, Phone, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useBrand } from "@/contexts/brand-context";
import { ORDER_STATUSES, statusBadge, type OrderStatus } from "@/lib/erp/orders";
import { syncCourierStatusFn, type CourierSyncResult } from "@/lib/erp/courier-sync.functions";
import type { CourierProvider } from "@/lib/erp/courier-status-mapping";
import { fetchCourierHistoryFn } from "@/lib/erp/courier-history.functions";

type PhoneHistory = {
  loading: boolean;
  found: boolean;
  total: number;
  success: number;
  cancelled: number;
  suggested: OrderStatus | null;
  error?: string;
};

type RowState = {
  result: CourierSyncResult;
  selected: boolean;
  overrideStatus: OrderStatus | null;
  manualProvider: CourierProvider;
  manualId: string;
  fetching: boolean;
  phoneHistory?: PhoneHistory;
  showManual?: boolean;
};

function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("880")) return "0" + d.slice(3);
  if (d.length === 10 && d.startsWith("1")) return "0" + d;
  return d.length >= 10 ? d : null;
}

function suggestFromHistory(total: number, success: number, cancelled: number): OrderStatus | null {
  if (total === 0) return null;
  if (success > 0) return "in_transit";
  if (cancelled > 0) return "cancelled";
  return null;
}

export function CourierStatusSyncDialog({
  open,
  onOpenChange,
  orderIds,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orderIds: string[];
}) {
  const qc = useQueryClient();
  const { activeBrand } = useBrand();
  const syncFn = useServerFn(syncCourierStatusFn);
  const historyFn = useServerFn(fetchCourierHistoryFn);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [fetching, setFetching] = useState(false);
  const [applying, setApplying] = useState(false);

  // Reset + fetch when opened
  useEffect(() => {
    if (!open || orderIds.length === 0) return;
    let cancel = false;
    setRows({});
    setFetching(true);
    (async () => {
      try {
        const res = await syncFn({ data: { orderIds, brandId: activeBrand?.id ?? undefined } });
        if (cancel) return;
        const next: Record<string, RowState> = {};
        for (const r of res.results as CourierSyncResult[]) {
          next[r.order_id] = {
            result: r,
            selected: r.ok && r.mapped_status != null && r.mapped_status !== r.current_status,
            overrideStatus: r.mapped_status,
            manualProvider: r.provider ?? "pathao",
            manualId: "",
            fetching: false,
          };
        }
        setRows(next);

        // Auto-fallback: for rows without courier linked but with a phone,
        // fetch courier history by phone and suggest delivered/cancelled.
        const phoneByOrder = new Map<string, string>();
        const phones = new Set<string>();
        for (const r of res.results as CourierSyncResult[]) {
          if (r.ok) continue;
          const p = normalizePhone(r.phone);
          if (!p) continue;
          phoneByOrder.set(r.order_id, p);
          phones.add(p);
        }
        if (phones.size === 0) return;

        setRows((prev) => {
          const n = { ...prev };
          for (const [oid] of phoneByOrder) {
            n[oid] = {
              ...n[oid],
              phoneHistory: { loading: true, found: false, total: 0, success: 0, cancelled: 0, suggested: null },
            };
          }
          return n;
        });

        try {
          const hist = await historyFn({
            data: { phones: Array.from(phones), brandId: activeBrand?.id ?? undefined },
          });
          if (cancel) return;
          const map = hist.results as Record<string, { found: boolean; summary: { total: number; success: number; cancelled: number } }>;
          setRows((prev) => {
            const n = { ...prev };
            for (const [oid, phone] of phoneByOrder) {
              const h = map[phone];
              if (!h) {
                n[oid] = { ...n[oid], phoneHistory: { loading: false, found: false, total: 0, success: 0, cancelled: 0, suggested: null, error: "Phone history nai" } };
                continue;
              }
              const s = h.summary;
              const sug = suggestFromHistory(s.total, s.success, s.cancelled);
              n[oid] = {
                ...n[oid],
                phoneHistory: { loading: false, found: !!h.found, total: s.total, success: s.success, cancelled: s.cancelled, suggested: sug },
                // Do NOT auto-apply phone-history estimate as the new status.
                // Phone history is only a hint; user must pick from dropdown.
              };
            }
            return n;
          });
        } catch (e) {
          if (cancel) return;
          setRows((prev) => {
            const n = { ...prev };
            for (const [oid] of phoneByOrder) {
              n[oid] = { ...n[oid], phoneHistory: { loading: false, found: false, total: 0, success: 0, cancelled: 0, suggested: null, error: (e as Error).message } };
            }
            return n;
          });
        }
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        if (!cancel) setFetching(false);
      }
    })();
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const list = useMemo(() => Object.values(rows), [rows]);
  const selectedCount = list.filter((r) => r.selected && r.overrideStatus).length;

  const refetchOne = async (orderId: string) => {
    const row = rows[orderId];
    if (!row) return;
    if (!row.manualId.trim()) {
      toast.error("Consignment ID din");
      return;
    }
    setRows((p) => ({ ...p, [orderId]: { ...p[orderId], fetching: true } }));
    try {
      const res = await syncFn({
        data: {
          orderIds: [orderId],
          brandId: activeBrand?.id ?? undefined,
          overrides: [{ orderId, provider: row.manualProvider, identifier: row.manualId.trim() }],
        },
      });
      const r = (res.results as CourierSyncResult[])[0];
      setRows((p) => ({
        ...p,
        [orderId]: {
          ...p[orderId],
          result: r,
          overrideStatus: r.mapped_status,
          selected: r.ok && r.mapped_status != null && r.mapped_status !== r.current_status,
          fetching: false,
        },
      }));
    } catch (e) {
      toast.error((e as Error).message);
      setRows((p) => ({ ...p, [orderId]: { ...p[orderId], fetching: false } }));
    }
  };

  const apply = useMutation({
    mutationFn: async () => {
      const targets = list.filter((r) => r.selected && r.overrideStatus && r.overrideStatus !== r.result.current_status);
      setApplying(true);
      let ok = 0;
      let fail = 0;
      for (const t of targets) {
        const note = t.result.ok
          ? `${t.result.provider}: ${t.result.raw_status ?? ""}`
          : t.phoneHistory?.suggested
            ? `phone_history: ${t.phoneHistory.success}/${t.phoneHistory.total} delivered, ${t.phoneHistory.cancelled} cancelled`
            : "manual";
        const { error } = await supabase.rpc("transition_order_status", {
          _order_id: t.result.order_id,
          _new_status: t.overrideStatus!,
          _reason: t.result.ok ? "courier_sync" : "phone_history_sync",
          _note: note,
        });
        if (error) fail++;
        else ok++;
      }
      return { ok, fail };
    },
    onSuccess: ({ ok, fail }) => {
      setApplying(false);
      if (ok) toast.success(`${ok} orders updated`);
      if (fail) toast.error(`${fail} updates failed`);
      qc.invalidateQueries({ queryKey: ["orders"] });
      onOpenChange(false);
    },
    onError: (e: Error) => {
      setApplying(false);
      toast.error(e.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !applying && onOpenChange(o)}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Courier Status Sync
          </DialogTitle>
          <DialogDescription>
            Pathao + Steadfast theke live status fetch korbo. Mapping confirm korar por apply hobe.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto rounded-md border">
          {fetching && list.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Fetching courier status for {orderIds.length} orders…
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur border-b text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-8 p-2"></th>
                  <th className="text-left p-2">Order</th>
                  <th className="text-left p-2">Courier</th>
                  <th className="text-left p-2">Current → New</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => (
                  <Row key={row.result.order_id} row={row}
                    onToggle={(v) => setRows((p) => ({ ...p, [row.result.order_id]: { ...p[row.result.order_id], selected: v } }))}
                    onChangeStatus={(s) => setRows((p) => ({ ...p, [row.result.order_id]: { ...p[row.result.order_id], overrideStatus: s, selected: true } }))}
                    onChangeProvider={(p2) => setRows((p) => ({ ...p, [row.result.order_id]: { ...p[row.result.order_id], manualProvider: p2 } }))}
                    onChangeManualId={(v) => setRows((p) => ({ ...p, [row.result.order_id]: { ...p[row.result.order_id], manualId: v } }))}
                    onFetch={() => refetchOne(row.result.order_id)}
                    onShowManual={() => setRows((p) => ({ ...p, [row.result.order_id]: { ...p[row.result.order_id], showManual: true } }))}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <div className="flex-1 text-xs text-muted-foreground">
            {fetching ? "Fetching…" : `${list.length} fetched · ${list.filter((r) => r.result.ok).length} ok · ${list.filter((r) => !r.result.ok).length} issues`}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>Cancel</Button>
          <Button onClick={() => apply.mutate()} disabled={applying || selectedCount === 0}>
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Apply {selectedCount} update{selectedCount === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  row,
  onToggle,
  onChangeStatus,
  onChangeProvider,
  onChangeManualId,
  onFetch,
  onShowManual,
}: {
  row: RowState;
  onToggle: (v: boolean) => void;
  onChangeStatus: (s: OrderStatus) => void;
  onChangeProvider: (p: CourierProvider) => void;
  onChangeManualId: (v: string) => void;
  onFetch: () => void;
  onShowManual: () => void;
}) {
  const r = row.result;
  const cur = statusBadge(r.current_status);
  const next = row.overrideStatus ? statusBadge(row.overrideStatus) : null;
  const canSelect = (r.ok || !!row.phoneHistory?.suggested) && !!row.overrideStatus;
  const ph = row.phoneHistory;
  const showManualUI = r.ok ? false : (row.showManual || !ph || (!ph.loading && !ph.suggested));

  return (
    <tr className={`border-b last:border-0 ${!r.ok ? "bg-destructive/5" : ""}`}>
      <td className="p-2 align-top">
        <Checkbox
          checked={row.selected}
          disabled={!canSelect}
          onCheckedChange={(v) => onToggle(!!v)}
        />
      </td>
      <td className="p-2 align-top">
        <div className="font-medium">{r.invoice_no ?? r.order_id.slice(0, 8).toUpperCase()}</div>
        <div className="text-xs text-muted-foreground">{r.customer ?? "—"} · {r.phone ?? "—"}</div>
      </td>
      <td className="p-2 align-top">
        {r.ok ? (
          <div className="space-y-0.5">
            <Badge variant="secondary" className="capitalize">{r.provider}</Badge>
            <div className="text-[11px] text-muted-foreground font-mono truncate max-w-[180px]" title={r.identifier ?? ""}>{r.identifier}</div>
            <div className="text-[11px] text-muted-foreground">Raw: <span className="font-mono">{r.raw_status}</span></div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {ph?.loading ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <Phone className="h-3 w-3" /> Phone history fetch hocche…
              </div>
            ) : ph && ph.suggested ? (
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Phone className="h-3 w-3" /> Phone history match
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="gap-1 h-5">
                    <CheckCircle2 className="h-3 w-3 text-green-600" /> {ph.success}
                  </Badge>
                  <Badge variant="outline" className="gap-1 h-5">
                    <XCircle className="h-3 w-3 text-destructive" /> {ph.cancelled}
                  </Badge>
                  <span className="text-muted-foreground">/ {ph.total}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" /> {ph?.error ?? r.error}
              </div>
            )}
            {!showManualUI && !ph?.loading && (
              <button
                type="button"
                onClick={onShowManual}
                className="text-[11px] text-primary hover:underline"
              >
                Consignment ID diye fetch korun
              </button>
            )}
            {showManualUI && (
            <div className="flex items-center gap-1">
              <Select value={row.manualProvider} onValueChange={(v) => onChangeProvider(v as CourierProvider)}>
                <SelectTrigger className="h-7 w-[90px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pathao">Pathao</SelectItem>
                  <SelectItem value="steadfast">Steadfast</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={row.manualId}
                onChange={(e) => onChangeManualId(e.target.value)}
                placeholder="Consignment ID"
                className="h-7 text-xs w-[150px]"
              />
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={onFetch} disabled={row.fetching}>
                {row.fetching ? <Loader2 className="h-3 w-3 animate-spin" /> : "Fetch"}
              </Button>
            </div>
            )}
          </div>
        )}
      </td>
      <td className="p-2 align-top">
        <div className="flex items-center gap-2">
          <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium ${cur.className}`}>{cur.label}</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <Select
            value={row.overrideStatus ?? ""}
            onValueChange={(v) => onChangeStatus(v as OrderStatus)}
            disabled={!r.ok && !ph?.suggested}
          >
            <SelectTrigger className="h-7 w-[170px] text-xs">
              <SelectValue placeholder="—">
                {next ? <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] ${next.className}`}>{next.label}</span> : "—"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ORDER_STATUSES.map((s) => {
                const b = statusBadge(s);
                return <SelectItem key={s} value={s}>{b.label}</SelectItem>;
              })}
            </SelectContent>
          </Select>
        </div>
        {!r.ok && ph?.suggested && (
          <div className="mt-1 text-[10px] text-muted-foreground">Phone history hint — manually select korun</div>
        )}
      </td>
    </tr>
  );
}

// Use checkbox via canSelect computed above