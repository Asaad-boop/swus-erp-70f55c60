import { format } from "date-fns";
import { useBrand } from "@/contexts/brand-context";

type Item = { name: string; quantity: number };
type Order = {
  invoice_no: string | null;
  shipping_name?: string | null;
  guest_name?: string | null;
  shipping_phone?: string | null;
  guest_phone?: string | null;
  shipping_thana?: string | null;
  shipping_city?: string | null;
  total?: number | null;
  payment_method?: string | null;
  courier_name?: string | null;
  tracking_number?: string | null;
  brand_id?: string | null;
  items?: Item[];
};

function isCod(o: Order) {
  return (o.payment_method ?? "").toLowerCase().includes("cod");
}
function qtyOf(o: Order) {
  return (o.items ?? []).reduce((a, b) => a + (b.quantity ?? 0), 0);
}

/**
 * Pickup / Handover Manifest — brand-grouped, with signature block.
 */
export function PickupManifestPrint({ orders }: { orders: Order[] }) {
  const { brands } = useBrand();
  const brandName = (id: string | null | undefined) =>
    brands.find((b) => b.id === id)?.name ?? (id ? "Unknown" : "Unbranded");

  const totalParcels = orders.length;
  const totalUnits = orders.reduce((s, o) => s + qtyOf(o), 0);
  const codOrders = orders.filter(isCod);
  const codAmount = codOrders.reduce((s, o) => s + (o.total ?? 0), 0);

  const groups = new Map<string, Order[]>();
  for (const o of orders) {
    const key = o.brand_id ?? "__none__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(o);
  }
  const groupList = Array.from(groups.entries()).sort((a, b) =>
    brandName(a[0] === "__none__" ? null : a[0]).localeCompare(
      brandName(b[0] === "__none__" ? null : b[0]),
    ),
  );

  return (
    <div className="bg-white text-black p-8 font-sans">
      <div className="flex items-start justify-between border-b-2 border-black pb-3 mb-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-600">Dispatch</div>
          <h1 className="text-2xl font-bold tracking-tight">Pickup Manifest</h1>
          <div className="text-[11px] text-neutral-600 mt-0.5">Brand-wise rider handover sheet</div>
        </div>
        <div className="text-right text-xs">
          <div className="font-mono">{format(new Date(), "yyyy-MM-dd HH:mm")}</div>
          <div className="text-neutral-600">Manifest #{format(new Date(), "yyyyMMddHHmm")}</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3 text-xs">
        <Stat label="Parcels" value={String(totalParcels)} />
        <Stat label="Units" value={String(totalUnits)} />
        <Stat label="COD parcels" value={String(codOrders.length)} />
        <Stat label="COD amount" value={`৳${codAmount.toLocaleString("en-BD")}`} />
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {groupList.map(([key, list]) => {
          const name = brandName(key === "__none__" ? null : key);
          const units = list.reduce((s, o) => s + qtyOf(o), 0);
          const cod = list.filter(isCod).reduce((s, o) => s + (o.total ?? 0), 0);
          return (
            <span
              key={key}
              className="inline-flex items-center gap-1.5 border border-black px-2 py-0.5 text-[10px] font-semibold"
            >
              <span className="uppercase tracking-wider">{name}</span>
              <span className="text-neutral-600">·</span>
              <span className="tabular-nums">{list.length}p</span>
              <span className="text-neutral-600">/</span>
              <span className="tabular-nums">{units}u</span>
              {cod > 0 && (
                <>
                  <span className="text-neutral-600">·</span>
                  <span className="tabular-nums">৳{cod.toLocaleString("en-BD")}</span>
                </>
              )}
            </span>
          );
        })}
      </div>

      {groupList.map(([key, list]) => {
        const name = brandName(key === "__none__" ? null : key);
        const units = list.reduce((s, o) => s + qtyOf(o), 0);
        const cod = list.filter(isCod).reduce((s, o) => s + (o.total ?? 0), 0);
        return (
          <div key={key} className="mb-4 break-inside-avoid">
            <div className="flex items-end justify-between border-b border-black pb-1 mb-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[9px] uppercase tracking-[0.18em] text-neutral-600">Brand</span>
                <h2 className="text-sm font-bold uppercase tracking-wide">{name}</h2>
              </div>
              <div className="text-[10px] text-neutral-700 tabular-nums">
                {list.length} parcels · {units} units
                {cod > 0 && <> · COD ৳{cod.toLocaleString("en-BD")}</>}
              </div>
            </div>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-neutral-400">
                  <th className="text-left py-1 pr-2 w-6">#</th>
                  <th className="text-left py-1 pr-2">Invoice / Tracking</th>
                  <th className="text-left py-1 pr-2">Courier / Consignment</th>
                  <th className="text-left py-1 pr-2">Customer</th>
                  <th className="text-left py-1 pr-2">Phone</th>
                  <th className="text-left py-1 pr-2">Area</th>
                  <th className="text-right py-1 pr-2">Qty</th>
                  <th className="text-right py-1">COD ৳</th>
                </tr>
              </thead>
              <tbody>
                {list.map((o, i) => {
                  const qty = qtyOf(o);
                  const codv = isCod(o) ? (o.total ?? 0) : 0;
                  return (
                    <tr key={i} className="border-b border-neutral-200 align-top">
                      <td className="py-1 pr-2 tabular-nums">{i + 1}</td>
                      <td className="py-1 pr-2 font-mono">
                        <div className="font-semibold">{o.invoice_no ?? "—"}</div>
                        {o.tracking_number && (
                          <div className="text-[10px] text-neutral-600">{o.tracking_number}</div>
                        )}
                      </td>
                      <td className="py-1 pr-2">
                        <div className="font-semibold uppercase text-[10px] tracking-wider">
                          {o.courier_name ?? "—"}
                        </div>
                        <div className="font-mono text-[10px] text-neutral-700">
                          {o.tracking_number ?? "—"}
                        </div>
                      </td>
                      <td className="py-1 pr-2">{o.shipping_name ?? o.guest_name ?? "—"}</td>
                      <td className="py-1 pr-2 font-mono">{o.shipping_phone ?? o.guest_phone ?? "—"}</td>
                      <td className="py-1 pr-2">
                        {[o.shipping_thana, o.shipping_city].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">{qty}</td>
                      <td className="py-1 text-right tabular-nums font-semibold">
                        {codv ? codv.toLocaleString("en-BD") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      <div className="border-t-2 border-black pt-2 flex items-center justify-between text-xs font-bold">
        <span>Grand Total</span>
        <span className="tabular-nums">
          {totalParcels} parcels · {totalUnits} units · COD ৳{codAmount.toLocaleString("en-BD")}
        </span>
      </div>

      <div className="mt-10 grid grid-cols-2 gap-12 break-inside-avoid">
        <SignatureBox label="Handed over by (Warehouse)" />
        <SignatureBox label="Received by (Rider / Courier)" includeRiderFields />
      </div>

      <div className="mt-4 text-[10px] text-neutral-600">
        Total {totalParcels} parcel(s) handed over. Receiver acknowledges count &amp; COD amount above.
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-neutral-300 rounded p-2">
      <div className="text-[9px] uppercase tracking-[0.14em] text-neutral-600">{label}</div>
      <div className="text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}

function SignatureBox({
  label,
  includeRiderFields,
}: {
  label: string;
  includeRiderFields?: boolean;
}) {
  return (
    <div>
      <div className="h-16 border-b border-black" />
      <div className="text-[10px] uppercase tracking-[0.14em] text-neutral-700 mt-1">{label}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
        <div>
          <div className="text-neutral-600">Name</div>
          <div className="border-b border-neutral-400 h-4" />
        </div>
        <div>
          <div className="text-neutral-600">Date / Time</div>
          <div className="border-b border-neutral-400 h-4" />
        </div>
        {includeRiderFields && (
          <>
            <div>
              <div className="text-neutral-600">Rider phone</div>
              <div className="border-b border-neutral-400 h-4" />
            </div>
            <div>
              <div className="text-neutral-600">Vehicle / ID</div>
              <div className="border-b border-neutral-400 h-4" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}