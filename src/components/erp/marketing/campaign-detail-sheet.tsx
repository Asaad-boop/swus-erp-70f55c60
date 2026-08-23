import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link2, Plus, Search, Trash2, Sparkles, Package, Target } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getCampaignProducts,
  getCampaignProductPerf,
  searchProductsForCampaign,
  linkCampaignProducts,
  unlinkCampaignProduct,
  setCampaignProductWeight,
  setCampaignTargets,
  type MktNodeRow,
} from "@/lib/erp/marketing/campaigns.functions";

const bdt = (n: number) => "৳" + Math.round(n).toLocaleString("en-IN");

export function CampaignDetailSheet({
  row,
  from,
  to,
  onClose,
}: {
  row: MktNodeRow | null;
  from: string;
  to: string;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        {row && (
          <>
            <SheetHeader className="border-b p-4">
              <SheetTitle className="text-sm font-semibold leading-snug pr-6">{row.name}</SheetTitle>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <Badge variant="outline" className="font-normal">
                  {row.status}
                </Badge>
                {row.objective && (
                  <Badge variant="outline" className="font-normal">
                    {row.objective}
                  </Badge>
                )}
                <span>Spend {bdt(row.spend)}</span>
                <span>· Delivered rev {bdt(row.revenue)}</span>
                <span>· ROAS {row.roas > 0 ? `${row.roas.toFixed(2)}x` : "—"}</span>
              </div>
            </SheetHeader>
            <div className="p-4">
              <Tabs defaultValue="products">
                <TabsList className="h-8">
                  <TabsTrigger value="products" className="text-xs">
                    <Package className="mr-1.5 h-3.5 w-3.5" />
                    Products
                  </TabsTrigger>
                  <TabsTrigger value="bulk" className="text-xs">
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    Bulk link
                  </TabsTrigger>
                  <TabsTrigger value="audit" className="text-xs">
                    <ScanSearch className="mr-1.5 h-3.5 w-3.5" />
                    Audit
                  </TabsTrigger>
                  <TabsTrigger value="targets" className="text-xs">
                    <Target className="mr-1.5 h-3.5 w-3.5" />
                    Targets
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="products" className="mt-3">
                  <ProductsTab campaign={row} from={from} to={to} />
                </TabsContent>
                <TabsContent value="bulk" className="mt-3">
                  <BulkLinkTab campaign={row} />
                </TabsContent>
                <TabsContent value="audit" className="mt-3">
                  <CampaignAuditTab campaign={row} from={from} to={to} />
                </TabsContent>
                <TabsContent value="targets" className="mt-3">
                  <TargetsTab row={row} onSaved={onClose} />
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ProductsTab({
  campaign,
  from,
  to,
}: {
  campaign: MktNodeRow;
  from: string;
  to: string;
}) {
  const qc = useQueryClient();
  const listLinked = useServerFn(getCampaignProducts);
  const listPerf = useServerFn(getCampaignProductPerf);
  const searchFn = useServerFn(searchProductsForCampaign);
  const linkFn = useServerFn(linkCampaignProducts);
  const unlinkFn = useServerFn(unlinkCampaignProduct);
  const weightFn = useServerFn(setCampaignProductWeight);

  const [q, setQ] = useState("");

  const linked = useQuery({
    queryKey: ["mkt-camp-products", campaign.id],
    queryFn: () => listLinked({ data: { campaignId: campaign.id } }),
    staleTime: 30_000,
  });

  const perf = useQuery({
    queryKey: ["mkt-camp-product-perf", campaign.id, from, to],
    queryFn: () => listPerf({ data: { campaignId: campaign.id, from, to } }),
    staleTime: 60_000,
  });

  const search = useQuery({
    queryKey: ["mkt-product-search", q],
    queryFn: () => searchFn({ data: { q } }),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["mkt-camp-products", campaign.id] });
    qc.invalidateQueries({ queryKey: ["mkt-camp-product-perf", campaign.id] });
  };

  const link = useMutation({
    mutationFn: (productIds: string[]) =>
      linkFn({ data: { campaignId: campaign.id, productIds, weight: 1 } }),
    onSuccess: (r: any) => {
      toast.success(`${r.count} product link holo`);
      setQ("");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Link fail"),
  });

  const unlink = useMutation({
    mutationFn: (productId: string) =>
      unlinkFn({ data: { campaignId: campaign.id, productId } }),
    onSuccess: () => {
      toast.success("Unlink holo");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Unlink fail"),
  });

  const weight = useMutation({
    mutationFn: (v: { productId: string; weight: number }) =>
      weightFn({ data: { campaignId: campaign.id, ...v } }),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Weight save fail"),
  });

  const linkedIds = useMemo(
    () => new Set((linked.data ?? []).map((r) => r.product_id)),
    [linked.data],
  );
  const suggestions = useMemo(
    () => (perf.data ?? []).filter((p) => !linkedIds.has(p.product_id)),
    [perf.data, linkedIds],
  );

  return (
    <div className="space-y-5">
      {/* Search + link */}
      <div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Product name / SKU diye khujun (link korte)"
            className="h-8 pl-7 text-xs"
          />
        </div>
        {q.trim().length >= 2 && (
          <div className="mt-2 max-h-56 overflow-y-auto rounded-md border">
            {search.isLoading ? (
              <div className="space-y-1 p-2">
                <Skeleton className="h-7 w-full" />
                <Skeleton className="h-7 w-full" />
              </div>
            ) : (search.data ?? []).length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-foreground">Kichu pawa jayni</div>
            ) : (
              (search.data ?? []).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 border-b px-2 py-1.5 text-xs last:border-b-0"
                >
                  <Thumb src={p.image} />
                  <span className="min-w-0 flex-1 truncate">{p.title}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{p.sku ?? "—"}</span>
                  {linkedIds.has(p.id) ? (
                    <Badge variant="outline" className="font-normal text-[10px]">
                      Linked
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2"
                      disabled={link.isPending}
                      onClick={() => link.mutate([p.id])}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Linked products */}
      <section className="space-y-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold">
          <Link2 className="h-3.5 w-3.5" />
          Linked products ({(linked.data ?? []).length})
        </h4>
        {linked.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (linked.data ?? []).length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            Ekhono kono product link kora nei. Niche suggestion theke ek click-e add korun.
          </p>
        ) : (
          <div className="rounded-md border">
            {(linked.data ?? []).map((p) => {
              const stat = (perf.data ?? []).find((x) => x.product_id === p.product_id);
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 border-b px-2 py-2 text-xs last:border-b-0"
                >
                  <Thumb src={p.image} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.title}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {p.sku ?? "—"}
                      {stat
                        ? ` · ${stat.delivered_qty} pcs · ${bdt(stat.revenue)} · GP ${bdt(stat.gross_profit)}`
                        : " · ei range-e sale nei"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Input
                      defaultValue={String(p.weight)}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isFinite(v) || v === p.weight) return;
                        weight.mutate({ productId: p.product_id, weight: v });
                      }}
                      className="h-7 w-14 text-center text-[11px]"
                      inputMode="decimal"
                      title="Weight — spend allocation share"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => unlink.mutate(p.product_id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Suggestions from attributed orders */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Ei campaign theke ja bikroy hoyeche ({suggestions.length})
          </h4>
          {suggestions.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              disabled={link.isPending}
              onClick={() => link.mutate(suggestions.slice(0, 50).map((s) => s.product_id))}
            >
              Sob link koro
            </Button>
          )}
        </div>
        {perf.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : suggestions.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            Ei date range-e attributed order theke notun product pawa jayni.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-right [&>th:first-child]:text-left">
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Delivered</th>
                  <th>Revenue</th>
                  <th>Gross profit</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => (
                  <tr key={s.product_id} className="border-t">
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <Thumb src={s.image} />
                        <span className="max-w-[220px] truncate">{s.title}</span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{s.qty}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{s.delivered_qty}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{bdt(s.revenue)}</td>
                    <td
                      className={`px-2 py-1.5 text-right tabular-nums ${s.gross_profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                    >
                      {bdt(s.gross_profit)}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2"
                        disabled={link.isPending}
                        onClick={() => link.mutate([s.product_id])}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Thumb({ src }: { src: string | null }) {
  if (!src) return <span className="h-6 w-6 shrink-0 rounded border bg-muted" />;
  return (
    <img src={src} alt="" loading="lazy" className="h-6 w-6 shrink-0 rounded border object-cover" />
  );
}

function TargetsTab({ row, onSaved }: { row: MktNodeRow; onSaved: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(setCampaignTargets);
  const [roas, setRoas] = useState(row.target_roas == null ? "" : String(row.target_roas));
  const [cpa, setCpa] = useState(row.target_cpa == null ? "" : String(row.target_cpa));

  const m = useMutation({
    mutationFn: () =>
      save({
        data: {
          campaignId: row.id,
          targetRoas: roas.trim() === "" ? null : Number(roas),
          targetCpa: cpa.trim() === "" ? null : Number(cpa),
        },
      }),
    onSuccess: () => {
      toast.success("Target save holo");
      qc.invalidateQueries({ queryKey: ["mkt-level"] });
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Save fail"),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Target ROAS (x)</Label>
          <Input value={roas} onChange={(e) => setRoas(e.target.value)} inputMode="decimal" placeholder="e.g. 3" />
          <p className="text-[10px] text-muted-foreground">
            Actual: {row.roas > 0 ? `${row.roas.toFixed(2)}x` : "—"}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Target CPA (৳)</Label>
          <Input value={cpa} onChange={(e) => setCpa(e.target.value)} inputMode="decimal" placeholder="e.g. 350" />
          <p className="text-[10px] text-muted-foreground">
            Actual CAC: {row.cac > 0 ? bdt(row.cac) : "—"}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
        <div className="rounded-md border p-2">
          Daily budget: <span className="font-medium text-foreground">{bdt(row.daily_budget)}</span>
        </div>
        <div className="rounded-md border p-2">
          Lifetime budget:{" "}
          <span className="font-medium text-foreground">{bdt(row.lifetime_budget)}</span>
        </div>
      </div>
      <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending}>
        Save
      </Button>
    </div>
  );
}
