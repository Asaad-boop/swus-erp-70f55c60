import { PickSheet, type SheetOptions, type SheetOrder } from "./pack-pick-sheet";

/**
 * Backwards-compatible entry point — the old picking list now renders the new
 * product-wise pick sheet.
 */
export function PickingListPrint({
  orders,
  options,
  brandName,
}: {
  orders: SheetOrder[];
  options?: SheetOptions;
  brandName?: string | null;
}) {
  return <PickSheet orders={orders} by="product" options={options} brandName={brandName} />;
}
