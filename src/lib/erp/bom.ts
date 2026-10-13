/** Pure BOM math — shared by Components / BOM UI and tests. */
export type BomLineCalc = {
  quantity: number;
  est_unit_cost: number | null;
  current_cost: number; // WAC or cost_price of component
  available: number; // available stock of component
};

export const PRODUCT_KINDS = [
  { value: "simple", label: "Simple" },
  { value: "bundle", label: "Bundle / Kit" },
  { value: "assembled", label: "Assembled" },
  { value: "component", label: "Component" },
] as const;

/** Required qty per finished unit including wastage %. */
export function requiredPerUnit(qty: number, wastagePct: number): number {
  return qty * (1 + Math.max(0, wastagePct) / 100);
}

export function lineUnitCost(l: BomLineCalc): number {
  return l.est_unit_cost != null && l.est_unit_cost > 0 ? l.est_unit_cost : l.current_cost;
}

export function bomMaterialCost(lines: BomLineCalc[], wastagePct: number): number {
  return lines.reduce((s, l) => s + requiredPerUnit(l.quantity, wastagePct) * lineUnitCost(l), 0);
}

/** Max finished units buildable from current component availability. */
export function maxBuildable(lines: BomLineCalc[], wastagePct: number): number {
  if (lines.length === 0) return 0;
  let min = Infinity;
  for (const l of lines) {
    const need = requiredPerUnit(l.quantity, wastagePct);
    if (need <= 0) continue;
    min = Math.min(min, Math.floor(Math.max(0, l.available) / need + 1e-9));
  }
  return min === Infinity ? 0 : min;
}

export function marginPct(price: number, cost: number): number {
  return price > 0 ? ((price - cost) / price) * 100 : 0;
}
