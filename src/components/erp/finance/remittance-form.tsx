import { dhakaToday } from "@/lib/erp/finance";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtBdt } from "@/lib/erp/finance";
import { useCodWorkflowMode } from "@/hooks/erp/use-cod-workflow-mode";
import { AlertTriangle } from "lucide-react";

export type RemittanceRow = {
  id: string;
  brand_id: string;
  courier: string;
  remittance_date: string;
  amount: number;
  reference_no: string | null;
  status: string;
  received_date: string | null;
  received_to: string | null;
  notes: string | null;
  expected_amount: number | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  brandId: string | null;
  brandIds: string[];
  editing?: RemittanceRow | null;
};

const COURIERS = ["pathao", "steadfast", "redx", "paperfly", "ecourier", "other"];

export function RemittanceForm({ open, onClose, brandId, brandIds, editing }: Props) {
  const qc = useQueryClient();
  const [pickedBrand, setPickedBrand] = useState<string>(brandId ?? "");
  const [courier, setCourier] = useState("pathao");
  const [remitDate, setRemitDate] = useState(() => dhakaToday());
  const [amount, setAmount] = useState("");
  const [expected, setExpected] = useState("");
  const [refNo, setRefNo] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setPickedBrand(editing.brand_id);
      setCourier(editing.courier);
      setRemitDate(editing.remittance_date);
      setAmount(String(editing.amount ?? ""));
      setExpected(String(editing.expected_amount ?? ""));
      setRefNo(editing.reference_no ?? "");
      setNotes(editing.notes ?? "");
    } else {
      setPickedBrand(brandId ?? (brandIds.length === 1 ? brandIds[0] : ""));
      setCourier("pathao");
      setRemitDate(dhakaToday());
      setAmount("");
      setExpected("");
      setRefNo("");
      setNotes("");
    }
  }, [open, editing, brandId, brandIds]);

  const effectiveBrand = brandId ?? pickedBrand;
  const { mode: workflowMode } = useCodWorkflowMode(effectiveBrand || null);
  const blocked = workflowMode === "direct" && !editing;

  // Calculate expected COD for the courier on/around the remittance date
  // (sum of orders.total for delivered COD shipments in last 7 days for that courier)
  const expectQ = useQuery({
    queryKey: ["cod_expected", effectiveBrand, courier, remitDate],
    enabled: open && !!effectiveBrand && !editing,
    queryFn: async () => {
      const to = remitDate;
      const from = new Date(remitDate);
      from.setDate(from.getDate() - 7);
      const fromISO = from.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("courier_shipments")
        .select("order_id, status, created_at, orders!inner(total, payment_method, brand_id)")
        .eq("provider", courier)
        .eq("brand_id", effectiveBrand)
        .eq("status", "delivered")
        .gte("created_at", fromISO)
        .lte("created_at", `${to}T23:59:59`);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      let sum = 0;
      for (const r of rows) {
        const pm = (r.orders?.payment_method ?? "").toLowerCase();
        if (pm.includes("cod")) sum += Number(r.orders?.total ?? 0);
      }
      return sum;
    },
  });

  useEffect(() => {
    if (!editing && expectQ.data != null && !expected) {
      setExpected(String(expectQ.data));
    }
  }, [expectQ.data, editing, expected]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!effectiveBrand) throw new Error("Brand required");
      if (blocked) throw new Error("Brand direct-collection mode-e ache. Courier remittance off. Finance → Settings-e mode change korun.");
      const amt = Number(amount || 0);
      if (!amt || amt <= 0) throw new Error("Amount must be > 0");
      const payload = {
        brand_id: effectiveBrand,
        courier,
        remittance_date: remitDate,
        amount: amt,
        expected_amount: expected ? Number(expected) : null,
        reference_no: refNo || null,
        notes: notes || null,
      };
      if (editing) {
        const { error } = await supabase.from("erp_cod_remittances").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase.from("erp_cod_remittances").insert({ ...payload, status: "pending", created_by: u.user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Remittance updated" : "Remittance recorded");
      qc.invalidateQueries({ queryKey: ["cod_remittances"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const showBrandPicker = !brandId && brandIds.length > 1 && !editing;
  const variance = (Number(amount || 0) || 0) - (Number(expected || 0) || 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Remittance" : "Record COD Remittance"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {blocked && (
            <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                This brand is in <strong>Direct collection</strong> mode. Courier remittance is disabled to prevent double-posting. Use <strong>Record Collection</strong> per order instead.
              </div>
            </div>
          )}
          {showBrandPicker && (
            <div>
              <Label>Brand</Label>
              <Select value={pickedBrand} onValueChange={setPickedBrand}>
                <SelectTrigger><SelectValue placeholder="Brand" /></SelectTrigger>
                <SelectContent>
                  {brandIds.map((b) => <SelectItem key={b} value={b}>{b.slice(0, 8)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Courier</Label>
              <Select value={courier} onValueChange={setCourier}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COURIERS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Remittance date</Label>
              <Input type="date" value={remitDate} onChange={(e) => setRemitDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount (৳)</Label>
              <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label>Expected (৳)</Label>
              <Input type="number" inputMode="decimal" value={expected} onChange={(e) => setExpected(e.target.value)} placeholder={expectQ.isLoading ? "…" : "auto"} />
            </div>
          </div>
          {expected && amount && (
            <p className={`text-xs ${Math.abs(variance) < 1 ? "text-muted-foreground" : variance > 0 ? "text-emerald-600" : "text-amber-600"}`}>
              Variance: {variance >= 0 ? "+" : ""}{fmtBdt(variance)}
            </p>
          )}
          <div>
            <Label>Reference no.</Label>
            <Input value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder="Bank ref / courier batch" />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !amount || blocked}>
            {mut.isPending ? "Saving…" : editing ? "Save" : "Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}