import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Network, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { ContentKpi, ContentPageHeader } from "@/components/erp/content/content-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  bdt,
  fetchCreators,
  fetchItems,
  fetchProductsLite,
  fetchShipments,
  labelOf,
  SHIPMENT_STATUSES,
} from "@/lib/erp/content/content-data";

export const Route = createFileRoute("/_authenticated/erp/content/matching")({
  head: () => ({
    meta: [
      { title: "Product ↔ Creator — Content Studio" },
      {
        name: "description",
        content:
          "Which creator is working on which product, what has been shipped to them, and the content that came back.",
      },
      { property: "og:title", content: "Product ↔ Creator — Content Studio" },
      {
        property: "og:description",
        content: "Track product samples sent to creators and the content delivered.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MatchingPage,
});

const empty = {
  creator_id: "",
  product_id: "",
  qty: 1,
  courier: "",
  tracking_no: "",
  sent_date: "",
  cost: 0,
  status: "pending",
};

function MatchingPage() {
  const { brandIds, activeBrand } = useBrand();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(empty);

  const shipQ = useQuery({
    queryKey: ["content-shipments", brandIds],
    queryFn: () => fetchShipments(brandIds),
  });
  const creatorsQ = useQuery({
    queryKey: ["content-creators", brandIds],
    queryFn: () => fetchCreators(brandIds),
  });
  const productsQ = useQuery({
    queryKey: ["content-products", brandIds],
    queryFn: () => fetchProductsLite(brandIds),
  });
  const itemsQ = useQuery({
    queryKey: ["content-items", brandIds],
    queryFn: () => fetchItems(brandIds),
  });

  const creatorName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of creatorsQ.data ?? []) m.set(c.id, c.name);
    return m;
  }, [creatorsQ.data]);
  const productName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of productsQ.data ?? []) m.set(p.id, p.title);
    return m;
  }, [productsQ.data]);

  const shipments = shipQ.data ?? [];

  const pairs = useMemo(() => {
    type Pair = {
      key: string;
      creator_id: string;
      product_id: string | null;
      shipped: number;
      shipStatus: string;
      content: number;
      published: number;
      orders: number;
      cost: number;
    };
    const m = new Map<string, Pair>();
    const get = (cid: string, pid: string | null) => {
      const k = `${cid}|${pid ?? "none"}`;
      let cur = m.get(k);
      if (!cur) {
        cur = {
          key: k,
          creator_id: cid,
          product_id: pid,
          shipped: 0,
          shipStatus: "—",
          content: 0,
          published: 0,
          orders: 0,
          cost: 0,
        };
        m.set(k, cur);
      }
      return cur;
    };
    for (const s of shipments) {
      const p = get(s.creator_id, s.product_id);
      p.shipped += s.qty;
      p.shipStatus = s.status;
    }
    for (const i of itemsQ.data ?? []) {
      if (!i.creator_id) continue;
      const p = get(i.creator_id, i.product_id);
      p.content++;
      if (i.stage === "published" || i.stage === "performance") p.published++;
      p.orders += Number(i.attributed_orders) || 0;
      p.cost += Number(i.cost) || 0;
    }
    return Array.from(m.values()).sort((a, b) => b.content - a.content);
  }, [shipments, itemsQ.data]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!draft.creator_id) throw new Error("Creator select করো");
      const { error } = await supabase.from("content_creator_shipments").insert({
        brand_id: activeBrand?.id ?? brandIds[0] ?? null,
        creator_id: draft.creator_id,
        product_id: draft.product_id || null,
        qty: draft.qty,
        courier: draft.courier || null,
        tracking_no: draft.tracking_no || null,
        sent_date: draft.sent_date || null,
        cost: draft.cost,
        status: draft.status,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Shipment রেকর্ড হয়েছে");
      setCreating(false);
      setDraft(empty);
      qc.invalidateQueries({ queryKey: ["content-shipments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-3 md:p-6">
      <ContentPageHeader
        icon={Network}
        title="Product ↔ Creator"
        subtitle="কোন creator কোন product নিয়ে কাজ করছে, কী ship হয়েছে, কী content এসেছে"
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Log shipment
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <ContentKpi label="Active pairs" value={pairs.length} />
        <ContentKpi label="Shipments" value={shipments.length} />
        <ContentKpi
          label="Pending delivery"
          value={shipments.filter((s) => s.status !== "delivered").length}
          tone="warn"
        />
        <ContentKpi
          label="Sample cost"
          value={bdt(shipments.reduce((s, x) => s + x.cost, 0))}
        />
      </div>

      {shipQ.isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : pairs.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          এখনো কোনো creator–product pair নেই।
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Creator</th>
                <th className="px-3 py-2 text-left">Product</th>
                <th className="px-3 py-2 text-right">Shipped</th>
                <th className="px-3 py-2 text-left">Ship status</th>
                <th className="px-3 py-2 text-right">Content</th>
                <th className="px-3 py-2 text-right">Live</th>
                <th className="px-3 py-2 text-right">Orders</th>
                <th className="px-3 py-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((p) => (
                <tr key={p.key} className="border-t">
                  <td className="px-3 py-2 font-medium">
                    {creatorName.get(p.creator_id) ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {p.product_id ? (productName.get(p.product_id) ?? "—") : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.shipped}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[10px]">
                      {p.shipStatus === "—"
                        ? "—"
                        : labelOf(SHIPMENT_STATUSES, p.shipStatus)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.content}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.published}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.orders}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{bdt(p.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-base">Log product shipment</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 py-3">
            <div>
              <Label className="text-[11px]">Creator</Label>
              <Select
                value={draft.creator_id || "none"}
                onValueChange={(v) => setDraft({ ...draft, creator_id: v === "none" ? "" : v })}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select creator</SelectItem>
                  {(creatorsQ.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px]">Product</Label>
              <Select
                value={draft.product_id || "none"}
                onValueChange={(v) => setDraft({ ...draft, product_id: v === "none" ? "" : v })}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No product</SelectItem>
                  {(productsQ.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px]">Qty</Label>
                <Input
                  type="number"
                  value={draft.qty}
                  onChange={(e) => setDraft({ ...draft, qty: Number(e.target.value) || 1 })}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-[11px]">Cost (৳)</Label>
                <Input
                  type="number"
                  value={draft.cost}
                  onChange={(e) => setDraft({ ...draft, cost: Number(e.target.value) || 0 })}
                  className="h-9"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px]">Courier</Label>
                <Input
                  value={draft.courier}
                  onChange={(e) => setDraft({ ...draft, courier: e.target.value })}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-[11px]">Tracking no</Label>
                <Input
                  value={draft.tracking_no}
                  onChange={(e) => setDraft({ ...draft, tracking_no: e.target.value })}
                  className="h-9"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px]">Sent date</Label>
                <Input
                  type="date"
                  value={draft.sent_date}
                  onChange={(e) => setDraft({ ...draft, sent_date: e.target.value })}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-[11px]">Status</Label>
                <Select
                  value={draft.status}
                  onValueChange={(v) => setDraft({ ...draft, status: v })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHIPMENT_STATUSES.map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              className="w-full"
              disabled={createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              Save
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}