import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download, ClipboardList, FileText, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

type Order = {
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
  shipping_thana: string | null;
  shipping_city: string | null;
  tracking_number: string | null;
  created_at: string | null;
  packaged_at: string | null;
  updated_at: string | null;
  items?: Array<{ name: string; quantity: number }>;
};

function isCod(o: Order) {
  return (o.payment_method ?? "").toLowerCase().includes("cod");
}
function bdt(n: number) {
  return `৳${n.toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}
function sum(rows: Order[]) {
  return rows.reduce((s, r) => s + (r.total ?? 0), 0);
}

function groupBy<T>(rows: T[], key: (r: T) => string) {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r) || "—";
    const arr = m.get(k) ?? [];
    arr.push(r);
    m.set(k, arr);
  }
  return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
}

function toCsv(rows: Order[]) {
  const head = [
    "invoice_no", "status", "brand_id", "courier", "tracking", "customer",
    "phone", "area", "payment", "total", "created_at", "packaged_at",
  ];
  const lines = [head.join(",")];
  for (const o of rows) {
    const cells = [
      o.invoice_no ?? "",
      o.status,
      o.brand_id ?? "",
      o.courier_name ?? "",
      o.tracking_number ?? "",
      o.shipping_name ?? o.guest_name ?? "",
      o.shipping_phone ?? o.guest_phone ?? "",
      [o.shipping_thana, o.shipping_city].filter(Boolean).join(" "),
      o.payment_method ?? "",
      String(o.total ?? 0),
      o.created_at ?? "",
      o.packaged_at ?? "",
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DispatchReportsDialog({
  open,
  onClose,
  pending,
  packed,
  ready,
  shipped,
  brands,
  onPrintManifest,
  onPrintPicking,
  onFinalizeHandover,
}: {
  open: boolean;
  onClose: () => void;
  pending: Order[];
  packed: Order[];
  ready: Order[];
  shipped: Order[];
  brands: { id: string; name: string }[];
  onPrintManifest: (orders: Order[]) => void;
  onPrintPicking: (orders: Order[]) => void;
  onFinalizeHandover?: (orders: Order[]) => Promise<void> | void;
}) {
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "Unknown";

  const all = useMemo(() => [...pending, ...packed, ...ready, ...shipped], [pending, packed, ready, shipped]);
  // Only parcels that already have a courier entry (tracking/consignment booked) qualify for the rider handover manifest.
  const todayHandover = useMemo(
    () => [...packed, ...ready].filter((o) => !!(o.tracking_number && o.tracking_number.trim())),
    [packed, ready],
  );
  const handoverPending = useMemo(
    () => [...packed, ...ready].filter((o) => !(o.tracking_number && o.tracking_number.trim())),
    [packed, ready],
  );

  const byBrand = useMemo(() => groupBy(all, (o) => o.brand_id ?? "—"), [all]);
  const byCourier = useMemo(() => groupBy([...ready, ...shipped], (o) => o.courier_name ?? "Unassigned"), [ready, shipped]);

  const codShipped = shipped.filter(isCod);
  const codShippedAmount = sum(codShipped);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Dispatch Reports
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {format(new Date(), "PPP")}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="Pending" value={pending.length} sub={bdt(sum(pending))} />
          <Stat label="Packed" value={packed.length} sub={bdt(sum(packed))} />
          <Stat label="Ready" value={ready.length} sub={bdt(sum(ready))} />
          <Stat label="Shipped today" value={shipped.length} sub={`${bdt(sum(shipped))} · COD ${codShipped.length}/${bdt(codShippedAmount)}`} />
        </div>

        {/* By brand */}
        <Section title="By brand">
          <Table
            head={["Brand", "Pending", "Packed", "Ready", "Shipped", "Value"]}
            rows={byBrand.map(([bid, rows]) => {
              const p = rows.filter((r) => pending.includes(r)).length;
              const pk = rows.filter((r) => packed.includes(r)).length;
              const rd = rows.filter((r) => ready.includes(r)).length;
              const sh = rows.filter((r) => shipped.includes(r)).length;
              return [brandName(bid), p, pk, rd, sh, bdt(sum(rows))];
            })}
          />
        </Section>

        {/* By courier */}
        <Section title="By courier (ready + shipped)">
          <Table
            head={["Courier", "Parcels", "COD parcels", "COD ৳"]}
            rows={byCourier.map(([c, rows]) => {
              const codRows = rows.filter(isCod);
              return [c, rows.length, codRows.length, bdt(sum(codRows))];
            })}
          />
        </Section>

        {/* Quick actions */}
        <Section title="Quick actions">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <ActionTile
              icon={<ClipboardList className="h-4 w-4" />}
              title="Pickup Manifest (Courier-booked only)"
              desc={`${todayHandover.length} parcel(s) with consignment${handoverPending.length ? ` · ${handoverPending.length} awaiting courier entry` : ""}`}
              onClick={() => onPrintManifest(todayHandover)}
              disabled={todayHandover.length === 0}
            />
            {onFinalizeHandover && (
              <ActionTile
                icon={<CheckCircle2 className="h-4 w-4" />}
                title="Finalize handover → Shipped"
                desc={`Mark ${todayHandover.length} courier-booked parcel(s) as shipped`}
                onClick={() => onFinalizeHandover(todayHandover)}
                disabled={todayHandover.length === 0}
              />
            )}
            <ActionTile
              icon={<Printer className="h-4 w-4" />}
              title="Picking List (Pending)"
              desc={`${pending.length} orders · aggregated SKU`}
              onClick={() => onPrintPicking(pending)}
              disabled={pending.length === 0}
            />
            <ActionTile
              icon={<Download className="h-4 w-4" />}
              title="CSV — Today (all stages)"
              desc={`${all.length} rows`}
              onClick={() => downloadCsv(`dispatch-${format(new Date(), "yyyyMMdd")}.csv`, toCsv(all))}
              disabled={all.length === 0}
            />
            <ActionTile
              icon={<Download className="h-4 w-4" />}
              title="CSV — Shipped today"
              desc={`${shipped.length} rows`}
              onClick={() => downloadCsv(`shipped-${format(new Date(), "yyyyMMdd")}.csv`, toCsv(shipped))}
              disabled={shipped.length === 0}
            />
          </div>
        </Section>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground truncate mt-0.5">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">{title}</div>
      {children}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) {
    return <div className="text-xs text-muted-foreground italic py-2">No data</div>;
  }
  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            {head.map((h, i) => (
              <th key={i} className={`px-2 py-1.5 ${i === 0 ? "text-left" : "text-right"} font-semibold text-[10px] uppercase tracking-wider text-muted-foreground`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              {r.map((c, j) => (
                <td key={j} className={`px-2 py-1.5 ${j === 0 ? "text-left font-medium" : "text-right tabular-nums"}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActionTile({ icon, title, desc, onClick, disabled }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-start gap-2.5 text-left p-3 rounded-lg border bg-card hover:border-foreground/40 hover:bg-muted/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span className="grid h-7 w-7 place-items-center rounded-md bg-foreground text-background shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold truncate">{title}</span>
        <span className="block text-[11px] text-muted-foreground truncate">{desc}</span>
      </span>
    </button>
  );
}