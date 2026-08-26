import { Package, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { fmtBdt, type ImpCartonStatus } from "@/lib/erp/imports/types";
import { BillTile } from "./atoms";

export function CartonsHeader({
  cartons, selected, setSelected, onBulkStage, onBulkRelease, poPaid, poSupplierTotal, onEditPlan,
}: {
  cartons: any[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  onBulkStage: (s: ImpCartonStatus) => void;
  onBulkRelease: () => void;
  poPaid: number;
  poSupplierTotal: number;
  onEditPlan?: () => void;
}) {
  const SELECTABLE = ["ordered", "at_china_warehouse", "in_transit", "arrived_bd"];
  const eligible = cartons.filter((c) => SELECTABLE.includes(c.status));
  const selCartons = cartons.filter((c) => selected.has(c.id));
  const anyMovable = selCartons.some((c) => ["ordered", "at_china_warehouse", "in_transit"].includes(c.status));
  const arrived = selCartons.filter((c) => c.status === "arrived_bd");

  const supplierCost = arrived.reduce((s, c) => s + Number(c.supplier_cost_bdt || 0), 0);
  const shipping = arrived.reduce((s, c) => s + Number(c.shipping_charge_bdt || 0), 0);
  const advanceShare = poSupplierTotal > 0 ? (poPaid * supplierCost) / poSupplierTotal : 0;
  const supplierDue = Math.max(0, supplierCost - advanceShare);
  const totalBill = Math.round((supplierDue + shipping) * 100) / 100;

  const allSelected = eligible.length > 0 && eligible.every((c) => selected.has(c.id));

  return (
    <div className="border-b border-border">
      <div className="p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(v) => {
              if (v) setSelected(new Set(eligible.map((c) => c.id)));
              else setSelected(new Set());
            }}
            aria-label="Select all cartons"
          />
          <h3 className="font-semibold inline-flex items-center gap-2">
            Cartons <Badge variant="outline" className="text-[11px]">{cartons.length}</Badge>
          </h3>
          {selected.size > 0 && (
            <Badge variant="secondary" className="text-[11px]">{selected.size} selected</Badge>
          )}
        </div>
        {selected.size === 0 && eligible.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Select cartons to bulk update stage or release
          </div>
        )}
      </div>

      {selected.size > 0 && (
        <div className="px-4 pb-4 -mt-1 space-y-3">
          {arrived.length > 0 && (
            <div className="rounded-lg border border-orange-200 dark:border-orange-900/40 bg-orange-50/60 dark:bg-orange-950/20 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-4 w-4 text-orange-600" />
                <div className="text-[11px] font-semibold tracking-wider text-orange-800 dark:text-orange-200 uppercase">
                  Bulk Release Bill — {arrived.length} arrived carton{arrived.length > 1 ? "s" : ""}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <BillTile label="Supplier cost" value={fmtBdt(supplierCost)} />
                <BillTile label="Advance share" value={`− ${fmtBdt(advanceShare)}`} valueClass="text-emerald-700 dark:text-emerald-400" />
                <BillTile label="Shipping (CN→BD)" value={fmtBdt(shipping)} />
                <BillTile label="Total to pay" value={fmtBdt(totalBill)} valueClass="text-orange-700 dark:text-orange-300 text-base" />
              </div>
              <div className="mt-3 flex items-center justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
                <Button size="sm" onClick={onBulkRelease} className="bg-orange-600 hover:bg-orange-700 text-white shadow-md">
                  <Send className="h-4 w-4 mr-1" />
                  Pay {fmtBdt(totalBill)} & Release {arrived.length}
                </Button>
              </div>
            </div>
          )}
          {anyMovable && (
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="text-muted-foreground">Bulk stage:</span>
              <Button size="sm" variant="outline" onClick={() => onBulkStage("ordered")}>Ordered</Button>
              <Button size="sm" variant="outline" onClick={() => onBulkStage("at_china_warehouse")}>At China WH</Button>
              <Button size="sm" variant="outline" onClick={() => onBulkStage("in_transit")}>In Transit</Button>
              {arrived.length === 0 && (
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}