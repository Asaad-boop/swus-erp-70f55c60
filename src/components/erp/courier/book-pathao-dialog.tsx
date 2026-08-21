import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Truck, Calculator, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePathaoCities, usePathaoZones, usePathaoAreas } from "@/hooks/erp/use-courier-query";
import { pathaoBookOrderFn, pathaoPriceFn, pathaoDetectForOrderFn } from "@/lib/erp/pathao.functions";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orderId: string;
  defaultAmount: number;
  brandId?: string | null;
};

function pathaoSourceLabel(source?: string) {
  if (source === "pathao_address_parser") return "Pathao merchant address parser";
  return "Pathao API";
}

export function BookPathaoDialog({ open, onOpenChange, orderId, defaultAmount, brandId }: Props) {
  const qc = useQueryClient();
  const bookFn = useServerFn(pathaoBookOrderFn);
  const priceFn = useServerFn(pathaoPriceFn);
  const detectFn = useServerFn(pathaoDetectForOrderFn);

  const [cityId, setCityId] = useState<number | null>(null);
  const [zoneId, setZoneId] = useState<number | null>(null);
  const [areaId, setAreaId] = useState<number | null>(null);
  const [autoFilled, setAutoFilled] = useState<null | { city: string; zone: string; area: string | null; source: string }>(null);
  const [weight, setWeight] = useState("0.5");
  const [qty, setQty] = useState("1");
  const [amount, setAmount] = useState(String(defaultAmount || 0));
  const [desc, setDesc] = useState("");
  const [instruction, setInstruction] = useState("");
  const [estimated, setEstimated] = useState<number | null>(null);
  const [locationManuallySelected, setLocationManuallySelected] = useState(false);

  const { data: cities = [], isLoading: cityLoading, error: cityError } = usePathaoCities(brandId);
  const { data: zones = [] } = usePathaoZones(cityId, brandId);
  const { data: areas = [] } = usePathaoAreas(zoneId, brandId);

  // Shared cached detection — also prefetched from the order detail page on
  // mount, so opening this dialog usually has the answer instantly.
  const { data: detected, isFetching: detecting } = useQuery({
    queryKey: ["pathao-detect", orderId],
    queryFn: async () =>
      (await detectFn({ data: { orderId } })) as {
        city: { id: number; name: string } | null;
        zone: { id: number; name: string } | null;
        area: { id: number; name: string } | null;
        source: string;
      },
    staleTime: 1000 * 60 * 10,
    enabled: open,
  });

  useEffect(() => {
    if (!open || !detected) return;
    if (!locationManuallySelected && detected.city) setCityId(detected.city.id);
    if (!locationManuallySelected && detected.zone) setZoneId(detected.zone.id);
    if (!locationManuallySelected && detected.area) setAreaId(detected.area.id);
    if (detected.city && detected.zone) {
      setAutoFilled({
        city: detected.city.name,
        zone: detected.zone.name,
        area: detected.area?.name ?? null,
        source: detected.source,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, detected]);

  const canSubmit = useMemo(
    () => Number(weight) > 0 && Number(qty) > 0,
    [weight, qty],
  );

  const calc = useMutation({
    mutationFn: async () => {
      const r: any = await priceFn({
        data: {
          item_weight: Number(weight),
          recipient_city: cityId!,
          recipient_zone: zoneId!,
          brandId: brandId ?? undefined,
        },
      });
      const p = r?.price;
      const fee = Number(p?.price ?? p?.data?.price ?? p?.final_price ?? 0);
      setEstimated(fee);
      return fee;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const book = useMutation({
    mutationFn: async () => {
      return bookFn({
        data: {
          orderId,
          recipient_city: cityId ?? undefined,
          recipient_zone: zoneId ?? undefined,
          recipient_area: cityId && zoneId ? (areaId ?? undefined) : undefined,
          item_weight: Number(weight),
          item_quantity: Number(qty),
          amount_to_collect: Number(amount),
          item_description: desc || undefined,
          special_instruction: instruction || undefined,
        },
      });
    },
    onSuccess: (r) => {
      toast.success(`Booked. Consignment: ${r.consignment ?? "—"}`);
      qc.invalidateQueries({ queryKey: ["courier-shipments"] });
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Truck className="h-4 w-4" /> Book Pathao Consignment</DialogTitle>
          <DialogDescription>Pickup will be requested from your registered Pathao store.</DialogDescription>
        </DialogHeader>

        {cityError ? (
          <div className="text-sm text-destructive">
            Failed to load Pathao cities. Check PATHAO_* credentials. {(cityError as Error).message}
          </div>
        ) : (
          <div className="grid gap-3">
            {(detecting || autoFilled) && (
              <div className={
                autoFilled
                  ? "flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-700 dark:text-emerald-300"
                  : "flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground"
              }>
                {detecting ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Detecting City / Zone / Area from customer address…</span>
                  </>
                ) : autoFilled ? (
                  <>
                    <Sparkles className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>
                      Auto-filled from {pathaoSourceLabel(autoFilled.source)}:{" "}
                      <span className="font-semibold">{autoFilled.city}</span> › <span className="font-semibold">{autoFilled.zone}</span>
                      {autoFilled.area && <> › <span className="font-semibold">{autoFilled.area}</span></>}
                    </span>
                  </>
                ) : null}
              </div>
            )}
            <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-200">
              City/Zone/Area এখানে customer address থেকে Pathao merchant portal-এর address parser দিয়ে auto-fill হয়; booking payload-এ এই exact Pathao IDs যাবে.
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">City</Label>
                <Select
                  value={cityId ? String(cityId) : ""}
                  onValueChange={(v) => { setLocationManuallySelected(true); setCityId(Number(v)); setZoneId(null); setAreaId(null); }}
                  disabled={cityLoading}
                >
                  <SelectTrigger><SelectValue placeholder={cityLoading ? "Loading…" : "Select"} /></SelectTrigger>
                  <SelectContent>
                    {cities.map((c) => <SelectItem key={c.city_id} value={String(c.city_id)}>{c.city_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Zone</Label>
                <Select value={zoneId ? String(zoneId) : ""} onValueChange={(v) => { setLocationManuallySelected(true); setZoneId(Number(v)); setAreaId(null); }} disabled={!cityId}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {zones.map((z) => <SelectItem key={z.zone_id} value={String(z.zone_id)}>{z.zone_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Area (optional)</Label>
                <Select value={areaId ? String(areaId) : ""} onValueChange={(v) => { setLocationManuallySelected(true); setAreaId(Number(v)); }} disabled={!zoneId}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {areas.map((a) => <SelectItem key={a.area_id} value={String(a.area_id)}>{a.area_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Weight (kg)</Label>
                <Input type="number" step="0.1" min="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Qty</Label>
                <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">COD (৳)</Label>
                <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>

            <div>
              <Label className="text-xs">Item description</Label>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. 1× Lego set" />
            </div>
            <div>
              <Label className="text-xs">Special instruction</Label>
              <Textarea rows={2} value={instruction} onChange={(e) => setInstruction(e.target.value)} />
            </div>

            <div className="flex items-center justify-between rounded-md border bg-muted/30 p-2 text-sm">
              <div>
                Estimated delivery fee:{" "}
                <span className="font-semibold">{estimated != null ? `৳ ${estimated.toLocaleString()}` : "—"}</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => calc.mutate()} disabled={!cityId || !zoneId || calc.isPending}>
                {calc.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Calculator className="h-3.5 w-3.5 mr-1" />}
                Calculate
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!canSubmit || book.isPending} onClick={() => book.mutate()}>
            {book.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            Book consignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}