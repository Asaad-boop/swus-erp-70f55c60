import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Truck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { steadfastBookOrderFn } from "@/lib/erp/steadfast.functions";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orderId: string;
  defaultAmount: number;
};

export function BookSteadfastDialog({ open, onOpenChange, orderId, defaultAmount }: Props) {
  const qc = useQueryClient();
  const bookFn = useServerFn(steadfastBookOrderFn);

  const [amount, setAmount] = useState(String(defaultAmount || 0));
  const [desc, setDesc] = useState("");
  const [note, setNote] = useState("");

  const book = useMutation({
    mutationFn: async () =>
      bookFn({
        data: {
          orderId,
          cod_amount: Number(amount),
          item_description: desc || undefined,
          note: note || undefined,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Booked. Consignment: ${r.consignment ?? r.invoice}`);
      qc.invalidateQueries({ queryKey: ["courier-shipments"] });
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Truck className="h-4 w-4" /> Book Steadfast Consignment</DialogTitle>
          <DialogDescription>Pickup will be requested from your registered Steadfast hub.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div>
            <Label className="text-xs">COD amount (৳)</Label>
            <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Item description</Label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. 1× Cotton shirt" />
          </div>
          <div>
            <Label className="text-xs">Note (optional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={book.isPending || Number(amount) < 0} onClick={() => book.mutate()}>
            {book.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            Book consignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}