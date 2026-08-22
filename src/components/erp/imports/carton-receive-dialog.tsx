import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ClipboardCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { saveCartonReceipt } from "@/lib/erp/imports/imports.functions";

export function CartonReceiveDialog({
  open,
  onOpenChange,
  carton,
  poId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  carton: any;
  poId: string;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(saveCartonReceipt);

  const items: any[] = carton?.items ?? [];
  const [rows, setRows] = useState<Record<string, { received: number; damaged: number }>>(() => {
    const m: Record<string, { received: number; damaged: number }> = {};
    items.forEach((it) => {
      m[it.id] = {
        received: Number(it.received_qty ?? it.quantity_expected ?? 0),
        damaged: Number(it.damaged_qty ?? 0),
      };
    });
    return m;
  });

  const mut = useMutation({
    mutationFn: () => fn({
      data: {
        carton_id: carton.id,
        items: items.map((it) => ({
          carton_item_id: it.id,
          received_qty: rows[it.id]?.received ?? 0,
          damaged_qty: rows[it.id]?.damaged ?? 0,
        })),
      },
    }),
    onSuccess: () => {
      toast.success("Carton receipt saved");
      qc.invalidateQueries({ queryKey: ["imp-po", poId] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /> Carton Received — Quantity Check</DialogTitle>
          <DialogDescription>Enter received and damaged quantities per product.</DialogDescription>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Expected</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Damaged</TableHead>
              <TableHead className="text-right">Usable</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => {
              const r = rows[it.id] ?? { received: 0, damaged: 0 };
              const usable = Math.max(0, Number(r.received) - Number(r.damaged));
              return (
                <TableRow key={it.id}>
                  <TableCell className="font-mono text-xs">{it.sku_snapshot ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{it.quantity_expected}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      className="h-8 text-right"
                      value={r.received}
                      onChange={(e) => setRows((s) => ({ ...s, [it.id]: { ...r, received: Number(e.target.value) || 0 } }))}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      className="h-8 text-right"
                      value={r.damaged}
                      onChange={(e) => setRows((s) => ({ ...s, [it.id]: { ...r, damaged: Number(e.target.value) || 0 } }))}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{usable}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}