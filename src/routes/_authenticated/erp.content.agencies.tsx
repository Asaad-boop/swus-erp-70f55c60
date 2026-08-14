import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { ContentKpi, ContentPageHeader } from "@/components/erp/content/content-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { bdt, fetchAgencies, fetchItems } from "@/lib/erp/content/content-data";

export const Route = createFileRoute("/_authenticated/erp/content/agencies")({
  head: () => ({
    meta: [
      { title: "Agency Partners — Content Studio" },
      {
        name: "description",
        content:
          "Production and media-buying agency directory with retainer, commission and delivered content spend.",
      },
      { property: "og:title", content: "Agency Partners — Content Studio" },
      {
        property: "og:description",
        content: "Manage agency partners, retainers and their content output.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgenciesPage,
});

const empty = {
  name: "",
  contact_person: "",
  phone: "",
  email: "",
  website: "",
  retainer_fee: 0,
  commission_pct: 0,
  notes: "",
};

function AgenciesPage() {
  const { brandIds, activeBrand } = useBrand();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(empty);

  const agenciesQ = useQuery({
    queryKey: ["content-agencies", brandIds],
    queryFn: () => fetchAgencies(brandIds),
  });
  const itemsQ = useQuery({
    queryKey: ["content-items", brandIds],
    queryFn: () => fetchItems(brandIds),
  });

  const perf = useMemo(() => {
    const m = new Map<string, { pieces: number; spend: number; orders: number }>();
    for (const i of itemsQ.data ?? []) {
      if (!i.agency_id) continue;
      const cur = m.get(i.agency_id) ?? { pieces: 0, spend: 0, orders: 0 };
      cur.pieces++;
      cur.spend += Number(i.cost) || 0;
      cur.orders += Number(i.attributed_orders) || 0;
      m.set(i.agency_id, cur);
    }
    return m;
  }, [itemsQ.data]);

  const agencies = agenciesQ.data ?? [];
  const retainer = agencies.reduce((s, a) => s + a.retainer_fee, 0);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!draft.name.trim()) throw new Error("Name দাও");
      const { error } = await supabase.from("content_agencies").insert({
        brand_id: activeBrand?.id ?? brandIds[0] ?? null,
        name: draft.name.trim(),
        contact_person: draft.contact_person || null,
        phone: draft.phone || null,
        email: draft.email || null,
        website: draft.website || null,
        retainer_fee: draft.retainer_fee,
        commission_pct: draft.commission_pct,
        notes: draft.notes || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agency যোগ হয়েছে");
      setCreating(false);
      setDraft(empty);
      qc.invalidateQueries({ queryKey: ["content-agencies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-3 md:p-6">
      <ContentPageHeader
        icon={Building2}
        title="Agency Partners"
        subtitle="Production ও media buying agency — retainer, commission আর output"
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add agency
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <ContentKpi label="Agencies" value={agencies.length} />
        <ContentKpi label="Monthly retainer" value={bdt(retainer)} />
        <ContentKpi
          label="Agency content"
          value={Array.from(perf.values()).reduce((s, p) => s + p.pieces, 0)}
        />
      </div>

      {agenciesQ.isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : agencies.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          কোনো agency নেই।
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {agencies.map((a) => {
            const p = perf.get(a.id);
            return (
              <div key={a.id} className="rounded-xl border bg-card p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{a.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {a.contact_person ?? "—"} · {a.phone ?? a.email ?? "—"}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {a.status}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                  <Badge variant="secondary">Retainer {bdt(a.retainer_fee)}</Badge>
                  {a.commission_pct > 0 && (
                    <Badge variant="outline">{a.commission_pct}% commission</Badge>
                  )}
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  {p?.pieces ?? 0} content · {bdt(p?.spend ?? 0)} spend · {p?.orders ?? 0} orders
                </p>
              </div>
            );
          })}
        </div>
      )}

      <Sheet open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-base">Add agency</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 py-3">
            {(
              [
                ["name", "Name"],
                ["contact_person", "Contact person"],
                ["phone", "Phone"],
                ["email", "Email"],
                ["website", "Website"],
              ] as const
            ).map(([k, label]) => (
              <div key={k}>
                <Label className="text-[11px]">{label}</Label>
                <Input
                  value={draft[k]}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                  className="h-9"
                />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px]">Retainer (৳)</Label>
                <Input
                  type="number"
                  value={draft.retainer_fee}
                  onChange={(e) =>
                    setDraft({ ...draft, retainer_fee: Number(e.target.value) || 0 })
                  }
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-[11px]">Commission %</Label>
                <Input
                  type="number"
                  value={draft.commission_pct}
                  onChange={(e) =>
                    setDraft({ ...draft, commission_pct: Number(e.target.value) || 0 })
                  }
                  className="h-9"
                />
              </div>
            </div>
            <div>
              <Label className="text-[11px]">Notes</Label>
              <Textarea
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                className="min-h-20 text-sm"
              />
            </div>
            <Button
              className="w-full"
              disabled={createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              Add
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}