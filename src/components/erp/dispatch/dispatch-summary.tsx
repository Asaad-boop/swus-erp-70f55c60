import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

type Order = {
  id: string;
  invoice_no: string | null;
  status: string;
  total: number | null;
  payment_method: string | null;
  courier_name: string | null;
  updated_at?: string | null;
};

function bdt(n: number) {
  return `৳${n.toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}

export function DispatchSummary({
  open,
  onClose,
  shippedToday,
  packedToday,
}: {
  open: boolean;
  onClose: () => void;
  shippedToday: Order[];
  packedToday: Order[];
}) {
  const shippedTotal = shippedToday.reduce((s, o) => s + (o.total ?? 0), 0);
  const codTotal = shippedToday
    .filter((o) => (o.payment_method ?? "").toLowerCase().includes("cod"))
    .reduce((s, o) => s + (o.total ?? 0), 0);

  const byCourier = new Map<string, { count: number; value: number }>();
  for (const o of shippedToday) {
    const k = o.courier_name ?? "Unassigned";
    const cur = byCourier.get(k) ?? { count: 0, value: 0 };
    cur.count += 1;
    cur.value += o.total ?? 0;
    byCourier.set(k, cur);
  }

  function exportCsv() {
    const rows = [
      ["Invoice", "Status", "Courier", "Payment", "Total"],
      ...shippedToday.map((o) => [
        o.invoice_no ?? "",
        o.status,
        o.courier_name ?? "",
        o.payment_method ?? "",
        String(o.total ?? 0),
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dispatch-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[420px] sm:max-w-[420px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Today's Dispatch Summary</SheetTitle>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <Stat label="Packed" value={packedToday.length} sub={bdt(packedToday.reduce((s, o) => s + (o.total ?? 0), 0))} />
          <Stat label="Shipped" value={shippedToday.length} sub={bdt(shippedTotal)} />
          <Stat label="COD Value" value={bdt(codTotal)} />
          <Stat label="Prepaid Value" value={bdt(shippedTotal - codTotal)} />
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-semibold mb-2">By Courier</h3>
          <div className="space-y-1.5">
            {Array.from(byCourier.entries()).map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm border-b py-1.5">
                <span>{k}</span>
                <span className="text-muted-foreground">
                  {v.count} · {bdt(v.value)}
                </span>
              </div>
            ))}
            {byCourier.size === 0 && <p className="text-sm text-muted-foreground">No shipments yet today.</p>}
          </div>
        </div>

        <Button variant="outline" className="w-full mt-6" onClick={exportCsv} disabled={shippedToday.length === 0}>
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="border rounded-md p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}