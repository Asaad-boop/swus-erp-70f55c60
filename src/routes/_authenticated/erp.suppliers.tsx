import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { SupplierScorecard } from "@/components/erp/suppliers/supplier-scorecard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";

export const Route = createFileRoute("/_authenticated/erp/suppliers")({
  head: () => ({ meta: [{ title: "Suppliers — ERP" }] }),
  component: SuppliersPage,
});

type Supplier = {
  id: string; name: string; contact_person: string | null; phone: string | null; email: string | null;
  address: string | null; opening_balance: number; current_due: number; notes: string | null;
  is_active: boolean; brand_id: string;
};

function SuppliersPage() {
  const { activeBrand, brandIds, isAllBrands, brands } = useBrand();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [payFor, setPayFor] = useState<Supplier | null>(null);

  const brandNameById = new Map(brands.map((b) => [b.id, b.name] as const));

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers", brandIds.join(",")],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      const { data, error } = await applyBrandScope(
        supabase
          .from("erp_suppliers")
          .select("id,name,contact_person,phone,email,address,opening_balance,current_due,notes,is_active,brand_id"),
        brandIds,
      ).order("name");
      if (error) throw error;
      return data as Supplier[];
    },
  });

  const totalDue = suppliers.reduce((s, x) => s + Number(x.current_due || 0), 0);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-sm text-muted-foreground">
            {isAllBrands ? `All Brands (${brands.length})` : activeBrand?.name ?? "—"} · {suppliers.length} suppliers · Total due: <span className="font-semibold text-foreground">৳{totalDue.toLocaleString()}</span>
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1" />Add Supplier</Button>
      </header>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              {isAllBrands && <TableHead>Brand</TableHead>}
              <TableHead>Contact</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-right">Opening</TableHead>
              <TableHead className="text-right">Due</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={isAllBrands ? 7 : 6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && suppliers.length === 0 && (
              <TableRow><TableCell colSpan={isAllBrands ? 7 : 6} className="text-center py-8 text-muted-foreground">No suppliers yet</TableCell></TableRow>
            )}
            {suppliers.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                {isAllBrands && (
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{brandNameById.get(s.brand_id) ?? "—"}</Badge>
                  </TableCell>
                )}
                <TableCell>{s.contact_person ?? "—"}</TableCell>
                <TableCell>{s.phone ?? "—"}</TableCell>
                <TableCell className="text-right font-mono">৳{Number(s.opening_balance).toLocaleString()}</TableCell>
                <TableCell className={`text-right font-mono ${Number(s.current_due) > 0 ? "text-amber-700 dark:text-amber-400" : ""}`}>
                  ৳{Number(s.current_due).toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setPayFor(s)}>
                    <Wallet className="h-3.5 w-3.5 mr-1" />Pay
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <SupplierScorecard brandIds={brandIds} />

      <AddSupplierDialog open={addOpen} onClose={() => setAddOpen(false)} brandId={activeBrand?.id ?? null} onCreated={() => qc.invalidateQueries({ queryKey: ["suppliers"] })} />
      <PaymentDialog supplier={payFor} onClose={() => setPayFor(null)} brandId={activeBrand?.id ?? null} onPaid={() => qc.invalidateQueries({ queryKey: ["suppliers"] })} />
    </div>
  );
}

function AddSupplierDialog({ open, onClose, brandId, onCreated }: { open: boolean; onClose: () => void; brandId: string | null; onCreated: () => void }) {
  const { brands, isAllBrands } = useBrand();
  const [form, setForm] = useState({ name: "", contact_person: "", phone: "", email: "", address: "", opening_balance: "0", notes: "" });
  const [pickedBrandId, setPickedBrandId] = useState<string>("");

  const mut = useMutation({
    mutationFn: async () => {
      const targetBrandId = brandId ?? pickedBrandId;
      if (!targetBrandId) throw new Error("Brand select koro");
      if (!form.name.trim()) throw new Error("Name required");
      const opening = Number(form.opening_balance) || 0;
      const { error } = await supabase.from("erp_suppliers").insert({
        brand_id: targetBrandId,
        name: form.name.trim(),
        contact_person: form.contact_person || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        opening_balance: opening,
        current_due: opening,
        notes: form.notes || null,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Supplier added");
      setForm({ name: "", contact_person: "", phone: "", email: "", address: "", opening_balance: "0", notes: "" });
      setPickedBrandId("");
      onCreated();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Supplier</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {isAllBrands && !brandId && (
            <div className="space-y-1.5">
              <Label>Brand *</Label>
              <Select value={pickedBrandId} onValueChange={setPickedBrandId}>
                <SelectTrigger><SelectValue placeholder="Choose brand" /></SelectTrigger>
                <SelectContent>
                  {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>Contact person</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Address</Label><Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Opening balance (due)</Label><Input type="number" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({ supplier, onClose, brandId, onPaid }: { supplier: Supplier | null; onClose: () => void; brandId: string | null; onPaid: () => void }) {
  // payment uses supplier's own brand_id — preserves correctness in All-Brands mode
  const effectiveBrandId = supplier?.brand_id ?? brandId;
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");

  const { data: accounts = [] } = useQuery({
    queryKey: ["erp_accounts", effectiveBrandId],
    enabled: !!effectiveBrandId && !!supplier,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_accounts")
        .select("id,name,account_type,current_balance")
        .eq("brand_id", effectiveBrandId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string; account_type: string; current_balance: number }[];
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      if (!supplier) throw new Error("No supplier");
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("Amount required");
      if (!accountId) throw new Error("Account required");
      const { error } = await supabase.rpc("record_supplier_payment", {
        _supplier_id: supplier.id,
        _amount: amt,
        _account_id: accountId,
        _payment_date: date,
        _reference_no: ref || undefined,
        _notes: notes || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      setAmount(""); setRef(""); setNotes("");
      onPaid();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!supplier} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Pay {supplier?.name}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="text-muted-foreground">Current due: <span className="font-semibold text-foreground">৳{Number(supplier?.current_due ?? 0).toLocaleString()}</span></div>
          <div className="space-y-1.5"><Label>Amount *</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Account *</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Choose account" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name} ({a.account_type}) — ৳{Number(a.current_balance).toLocaleString()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {accounts.length === 0 && <p className="text-xs text-muted-foreground">No accounts yet. Create one in Finance &gt; Accounts.</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Reference no.</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Record Payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}