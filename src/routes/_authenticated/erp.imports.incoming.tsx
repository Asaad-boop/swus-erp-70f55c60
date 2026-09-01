import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ClipboardCheck, PackageSearch, Printer, Truck, Boxes, ArrowRight, Loader2,
} from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listIncomingReleases } from "@/lib/erp/imports/imports.functions";
import { fmtBdt } from "@/lib/erp/imports/types";
import { printHtml } from "@/lib/erp/utils/pdf";
import { QcReleaseDialog } from "@/components/erp/imports/po-detail/qc-release-dialog";

export const Route = createFileRoute("/_authenticated/erp/imports/incoming")({
  head: () => ({
    meta: [
      { title: "Incoming & Warehouse QC — Imports ERP" },
      { name: "description", content: "Released kintu ekhono hate na asha import lot gulo — QC, local courier charge ar final costing ek jaygay." },
    ],
  }),
  component: IncomingPage,
});

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

function IncomingPage() {
  const { brandIds } = useBrand();
  const brandKey = brandIds.join(",");
  const fn = useServerFn(listIncomingReleases);
  const [q, setQ] = useState("");
  const [qcFor, setQcFor] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["imp-incoming", brandKey],
    enabled: brandIds.length > 0,
    queryFn: () => fn({ data: { brandIds } }),
  });

  const releases = (data?.releases ?? []) as any[];
  const progress = (data?.progress ?? {}) as Record<string, any>;

  const titleFor = (ri: any) => ri.product?.title ?? ri.sku_snapshot ?? "Item";
  const skuFor = (ri: any) => ri.variant?.sku ?? ri.sku_snapshot ?? ri.product?.sku ?? "—";
  const imgFor = (ri: any) => ri.variant?.image ?? ri.product?.image ?? null;
  const colorFor = (ri: any) =>
    ri.variant?.color_name || ri.variant?.color_hex
      ? { name: ri.variant?.color_name ?? "Color", hex: ri.variant?.color_hex ?? "#999" }
      : null;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return releases;
    return releases.filter(
      (r) =>
        String(r.po?.po_number ?? "").toLowerCase().includes(s) ||
        (r.items ?? []).some((ri: any) => `${titleFor(ri)} ${skuFor(ri)}`.toLowerCase().includes(s)),
    );
  }, [releases, q]);

  const totals = useMemo(() => {
    let pcs = 0, value = 0;
    for (const r of filtered) {
      for (const ri of r.items ?? []) {
        pcs += Number(ri.quantity ?? 0);
        value += Number(ri.quantity ?? 0) * Number(ri.unit_landed_cost_bdt ?? 0);
      }
    }
    return { lots: filtered.length, pcs, value };
  }, [filtered]);

  const printAll = () => {
    const body = filtered
      .map((r) => {
        const p = progress[r.po_id] ?? { ordered: 0, released: 0, remaining: 0, byItem: {} };
        const rows = (r.items ?? [])
          .map((ri: any) => {
            const ip = p.byItem?.[ri.po_item_id] ?? { ordered: 0, released: 0 };
            const col = colorFor(ri);
            return `<tr>
              <td>${esc(titleFor(ri))}<div class="sku">${esc(skuFor(ri))}${col ? ` · ${esc(col.name)}` : ""}</div></td>
              <td class="num">${ip.ordered}</td>
              <td class="num">${ip.released}</td>
              <td class="num">${Math.max(0, ip.ordered - ip.released)}</td>
              <td class="num"><b>${ri.quantity ?? 0}</b></td>
              <td class="num box"></td><td class="num box"></td><td class="num box"></td>
            </tr>`;
          })
          .join("");
        return `<div class="lot">
          <div class="lot-h"><b>${esc(r.po?.po_number ?? "PO")}</b> · Release #${r.release_number}
            <span class="muted">· released ${new Date(r.released_at).toLocaleDateString("en-GB")}
            · freight ${esc(fmtBdt(Number(r.shipping_charge_bdt ?? 0)))}</span></div>
          <table class="doc-tbl">
            <thead><tr>
              <th>Product</th><th class="num">Ordered</th><th class="num">Released</th><th class="num">Remaining</th>
              <th class="num">This lot</th><th class="num">Good</th><th class="num">Damaged</th><th class="num">Missing</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="lc">Local courier charge: ______________ &nbsp;&nbsp; Received by: ______________</div>
        </div>`;
      })
      .join("");

    printHtml(
      `<h2 style="margin:0">Incoming lots — receiving checklist</h2>
       <div class="muted">${filtered.length} lot · ${totals.pcs} pcs · value ${esc(fmtBdt(totals.value))} · ${new Date().toLocaleString("en-GB")}</div>
       <style>
         .doc-tbl{width:100%;border-collapse:collapse;font-size:11px;margin-top:8px}
         .doc-tbl th{text-align:left;background:#f1f5f9;border-bottom:1px solid #cbd5e1;padding:5px 7px;font-size:9px;text-transform:uppercase;letter-spacing:.04em}
         .doc-tbl td{border-bottom:1px solid #e2e8f0;padding:5px 7px}
         .doc-tbl .num{text-align:right;font-variant-numeric:tabular-nums}
         .doc-tbl td.box{border:1px solid #94a3b8;min-width:46px}
         .sku{font-family:ui-monospace,monospace;font-size:9px;color:#64748b}
         .muted{color:#64748b;font-size:10px}
         .lot{margin-top:16px;page-break-inside:avoid}
         .lot-h{font-size:12px}
         .lc{margin-top:8px;font-size:10px;color:#475569}
       </style>
       ${body}`,
      { title: "Incoming lots" },
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold inline-flex items-center gap-2">
            <PackageSearch className="h-5 w-5 text-primary" />
            Incoming & Warehouse QC
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Release hoyeche kintu ekhono hate ashe ni / QC hoy ni — egulo <b>reserved</b> stock. QC confirm korle
            sellable hobe ar final per-piece cost boshe jabe.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="PO / product khujun…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-9 w-52"
          />
          <Button variant="outline" size="sm" onClick={printAll} disabled={filtered.length === 0}>
            <Printer className="h-4 w-4 mr-1.5" /> Print list
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Kpi label="Pending lot" value={String(totals.lots)} icon={<Boxes className="h-4 w-4" />} />
        <Kpi label="Incoming pcs" value={`${totals.pcs}`} icon={<Truck className="h-4 w-4" />} />
        <Kpi label="Reserved value" value={fmtBdt(totals.value)} icon={<ClipboardCheck className="h-4 w-4" />} />
      </div>

      {isLoading && (
        <div className="p-10 text-center text-sm text-muted-foreground inline-flex items-center gap-2 justify-center w-full">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Kono pending lot nei — shob release QC hoye geche. 🎉
        </Card>
      )}

      <div className="space-y-3">
        {filtered.map((r) => {
          const p = progress[r.po_id] ?? { ordered: 0, released: 0, remaining: 0, byItem: {} };
          const lotPcs = (r.items ?? []).reduce((s: number, ri: any) => s + Number(ri.quantity ?? 0), 0);
          const lotValue = (r.items ?? []).reduce(
            (s: number, ri: any) => s + Number(ri.quantity ?? 0) * Number(ri.unit_landed_cost_bdt ?? 0), 0,
          );
          return (
            <Card key={r.id} className="overflow-hidden">
              <div className="p-3 border-b border-border flex items-center gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-mono text-sm font-semibold truncate">
                    {r.po?.po_number} · Release #{r.release_number}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(r.released_at).toLocaleDateString("en-GB")} · PO ordered {p.ordered} · released {p.released} · remaining {p.remaining}
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 dark:text-amber-300">
                  QC pending
                </Badge>
                <div className="ml-auto flex items-center gap-2">
                  <div className="text-right text-xs tabular-nums">
                    <div className="font-semibold">{lotPcs} pcs</div>
                    <div className="text-muted-foreground">{fmtBdt(lotValue)}</div>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/erp/imports/orders/$orderId" params={{ orderId: r.po_id } as never}>
                      PO <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Link>
                  </Button>
                  <Button size="sm" onClick={() => setQcFor({ ...r, po_number: r.po?.po_number })}>
                    <ClipboardCheck className="h-4 w-4 mr-1.5" /> QC koro
                  </Button>
                </div>
              </div>

              <div className="divide-y divide-border">
                {(r.items ?? []).map((ri: any) => {
                  const ip = p.byItem?.[ri.po_item_id] ?? { ordered: 0, released: 0 };
                  const col = colorFor(ri);
                  const img = imgFor(ri);
                  return (
                    <div key={ri.id} className="p-3 flex items-center gap-3 text-sm">
                      {img ? (
                        <img src={img} alt="" className="h-10 w-10 rounded object-cover border border-border" />
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted border border-dashed border-border" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{titleFor(ri)}</div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono text-muted-foreground">{skuFor(ri)}</span>
                          {col && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-px text-[10px]">
                              <span className="h-2 w-2 rounded-full border border-border" style={{ background: col.hex }} />
                              {col.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <MiniStat label="Ordered" value={ip.ordered} />
                      <MiniStat label="Released" value={ip.released} />
                      <MiniStat label="Remaining" value={Math.max(0, ip.ordered - ip.released)} />
                      <MiniStat label="Ei lot" value={Number(ri.quantity ?? 0)} strong />
                      <div className="text-right text-[11px] text-muted-foreground tabular-nums w-24">
                        {fmtBdt(Number(ri.unit_landed_cost_bdt ?? 0))}/pc
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      <QcReleaseDialog
        release={qcFor}
        brandId={qcFor?.brand_id}
        helpers={{ titleFor, skuFor, imgFor, colorFor }}
        onClose={() => setQcFor(null)}
      />
    </div>
  );
}

function Kpi({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card className="p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
        {icon} {label}
      </div>
      <div className="text-xl font-semibold tabular-nums mt-1">{value}</div>
    </Card>
  );
}

function MiniStat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="text-right w-16 hidden sm:block">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`tabular-nums ${strong ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{value}</div>
    </div>
  );
}
