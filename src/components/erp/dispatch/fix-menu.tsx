import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoreHorizontal, Wrench, PauseCircle, XCircle, ExternalLink, Pencil, Undo2, Truck } from "lucide-react";
import { customerPhone, fullAddress, customerName, type DispatchOrder, type UseDispatch } from "@/hooks/erp/use-dispatch";

const STAGE_TARGETS: { label: string; status: string }[] = [
  { label: "Pending (confirmed)", status: "confirmed" },
  { label: "Packed", status: "packed" },
  { label: "Ready to ship", status: "ready_to_ship" },
  { label: "Shipped", status: "shipped" },
];

export function FixMenu({ order, d, trigger }: { order: DispatchOrder; d: UseDispatch; trigger?: React.ReactNode }) {
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(customerName(order));
  const [phone, setPhone] = useState(customerPhone(order));
  const [address, setAddress] = useState(order.shipping_address ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await d.updateContact(order, {
      shipping_name: name.trim(),
      shipping_phone: phone.replace(/[^0-9]/g, ""),
      shipping_address: address.trim(),
    });
    setSaving(false);
    setEditOpen(false);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger ?? (
            <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-[11px] flex items-center gap-1.5">
            <Wrench className="h-3 w-3" /> Fix #{order.invoice_no ?? order.id.slice(0, 8)}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-xs">
              <Undo2 className="h-3.5 w-3.5 mr-2" /> Move to stage
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {STAGE_TARGETS.filter((s) => s.status !== order.status).map((s) => (
                <DropdownMenuItem key={s.status} className="text-xs" onClick={() => d.moveTo(order, s.status)}>
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuItem className="text-xs" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5 mr-2" /> Edit name / phone / address
          </DropdownMenuItem>

          <DropdownMenuItem className="text-xs" onClick={() => d.cancelBooking(order)}>
            <Truck className="h-3.5 w-3.5 mr-2" /> Cancel courier booking
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          {order.status !== "on_hold" ? (
            <DropdownMenuItem className="text-xs text-amber-600" onClick={() => d.moveTo(order, "on_hold", "Dispatch hold")}>
              <PauseCircle className="h-3.5 w-3.5 mr-2" /> Put on hold
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem className="text-xs" onClick={() => d.moveTo(order, "confirmed", "Released from hold")}>
              <PauseCircle className="h-3.5 w-3.5 mr-2" /> Release hold
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className="text-xs text-destructive" onClick={() => d.moveTo(order, "cancelled", "Cancelled from dispatch")}>
            <XCircle className="h-3.5 w-3.5 mr-2" /> Cancel order
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="text-xs">
            <Link to="/erp/orders/$orderId" params={{ orderId: order.id }}>
              <ExternalLink className="h-3.5 w-3.5 mr-2" /> Open order
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit shipping details</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Customer name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone (11 digits)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" />
              {phone.replace(/[^0-9]/g, "").length !== 11 && (
                <p className="text-[11px] text-amber-600">Courier booking-এর জন্য ঠিক ১১ ডিজিট লাগবে।</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
              <p className="text-[11px] text-muted-foreground truncate">Full: {fullAddress(order) || "—"}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
