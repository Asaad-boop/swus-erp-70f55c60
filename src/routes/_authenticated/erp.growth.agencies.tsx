import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Plus, Coins, FileVideo, ShoppingCart, Percent, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import {
  ContentHero,
  EmptyState,
  ExportButton,
  Kpi,
  KpiStrip,
  Pill,
  SearchBox,
  Toolbar,
  downloadCsv,
  BrandTag,
  BrandSelect,
  BrandFilter,
} from "@/components/erp/content/content-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bdt, fetchAgencies, fetchItems, type Agency } from "@/lib/erp/content/content-data";

export const Route = createFileRoute("/_authenticated/erp/growth/agencies")({
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
  const [formBrand, setFormBrand] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(empty);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Agency | null>(null);
  const [brandFilter, setBrandFilter] = useState("all");

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
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agencies.filter((a) => {
      if (brandFilter !== "all" && a.brand_id !== brandFilter) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        (a.contact_person ?? "").toLowerCase().includes(q) ||
        (a.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [agencies, search, brandFilter]);
  const totalPieces = Array.from(perf.values()).reduce((s, p) => s + p.pieces, 0);
  const totalOrders = Array.from(perf.values()).reduce((s, p) => s + p.orders, 0);
  const totalSpend = Array.from(perf.values()).reduce((s, p) => s + p.spend, 0);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!draft.name.trim()) throw new Error("Name দাও");
      const brand_id = formBrand ?? activeBrand?.id ?? null;
      if (!brand_id) throw new Error("Brand বাছাই করুন");
      const { error } = await supabase.from("content_agencies").insert({
        brand_id,
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

  const updateMut = useMutation({
    mutationFn: async (patch: Partial<Agency> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase
        .from("content_agencies")
        .update(rest as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agency আপডেট হয়েছে");
      qc.invalidateQueries({ queryKey: ["content-agencies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("content_agencies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agency মুছে ফেলা হয়েছে");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["content-agencies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-3 md:p-6">
      <ContentHero
        icon={Building2}
        title="Agency Partners"
        subtitle="Production ও media buying agency — retainer, commission আর delivered output একসাথে।"
        actions={
          <Button size="sm" className="h-9" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add agency
          </Button>
        }
      >
        <KpiStrip cols={5}>
          <Kpi label="Agencies" value={agencies.length} icon={Building2} />
          <Kpi label="Monthly retainer" value={bdt(retainer)} icon={Coins} tone="warn" />
          <Kpi label="Agency content" value={totalPieces} icon={FileVideo} />
          <Kpi label="Attributed orders" value={totalOrders} icon={ShoppingCart} tone="good" />
          <Kpi
            label="Cost / order"
            value={totalOrders > 0 ? bdt(totalSpend / totalOrders) : "—"}
            icon={Percent}
          />
        </KpiStrip>
      </ContentHero>

      <Toolbar>
        <SearchBox value={search} onChange={setSearch} placeholder="Agency, contact…" />
        <BrandFilter value={brandFilter} onChange={setBrandFilter} />
        <div className="ml-auto">
          <ExportButton
            onClick={() =>
              downloadCsv("agencies.csv", [
                ["Agency", "Contact", "Phone", "Email", "Status", "Retainer", "Commission %", "Content", "Spend", "Orders"],
                ...filtered.map((a) => {
                  const p = perf.get(a.id);
                  return [
                    a.name,
                    a.contact_person ?? "",
                    a.phone ?? "",
                    a.email ?? "",
                    a.status,
                    a.retainer_fee,
                    a.commission_pct,
                    p?.pieces ?? 0,
                    p?.spend ?? 0,
                    p?.orders ?? 0,
                  ];
                }),
              ])
            }
          />
        </div>
      </Toolbar>

      {agenciesQ.isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="কোনো agency নেই"
          description="Production বা media buying partner যোগ করলে তাদের retainer আর output এখানে rollup হবে।"
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => {
            const p = perf.get(a.id);
            return (
              <div
                key={a.id}
                className="rounded-xl border border-border/70 bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{a.name}</p>
                    <BrandTag brandId={a.brand_id} className="mt-0.5" />
                    <p className="truncate text-[11px] text-muted-foreground">
                      {a.contact_person ?? "—"} · {a.phone ?? a.email ?? "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge variant="outline" className="text-[10px]">
                      {a.status}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground"
                      onClick={() => setEditing(a)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                  <Badge variant="secondary">Retainer {bdt(a.retainer_fee)}</Badge>
                  {a.commission_pct > 0 && (
                    <Badge variant="outline">{a.commission_pct}% commission</Badge>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <Cell label="Content" value={String(p?.pieces ?? 0)} />
                  <Cell label="Spend" value={bdt(p?.spend ?? 0)} />
                  <Cell label="Orders" value={String(p?.orders ?? 0)} />
                </div>
                {(p?.orders ?? 0) > 0 && (
                  <div className="mt-2">
                    <Pill tone="good">Cost/order {bdt((p!.spend + a.retainer_fee) / p!.orders)}</Pill>
                  </div>
                )}
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
            <BrandSelect value={formBrand ?? activeBrand?.id ?? null} onChange={setFormBrand} />
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

      {editing && (
        <AgencyEditSheet
          key={editing.id}
          agency={editing}
          onClose={() => setEditing(null)}
          onSave={(p) => updateMut.mutate(p)}
          onDelete={(id) => deleteMut.mutate(id)}
          saving={updateMut.isPending || deleteMut.isPending}
        />
      )}
    </div>
  );
}

function AgencyEditSheet({
  agency,
  onClose,
  onSave,
  onDelete,
  saving,
}: {
  agency: Agency;
  onClose: () => void;
  onSave: (patch: Partial<Agency> & { id: string }) => void;
  onDelete: (id: string) => void;
  saving: boolean;
}) {
  const [d, setD] = useState({
    name: agency.name,
    contact_person: agency.contact_person ?? "",
    phone: agency.phone ?? "",
    email: agency.email ?? "",
    website: agency.website ?? "",
    retainer_fee: agency.retainer_fee,
    commission_pct: agency.commission_pct,
    status: agency.status,
    notes: agency.notes ?? "",
  });
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-base">Edit agency</SheetTitle>
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
                value={d[k]}
                onChange={(e) => setD({ ...d, [k]: e.target.value })}
                className="h-9"
              />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px]">Retainer (৳)</Label>
              <Input
                type="number"
                value={d.retainer_fee}
                onChange={(e) => setD({ ...d, retainer_fee: Number(e.target.value) || 0 })}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-[11px]">Commission %</Label>
              <Input
                type="number"
                value={d.commission_pct}
                onChange={(e) => setD({ ...d, commission_pct: Number(e.target.value) || 0 })}
                className="h-9"
              />
            </div>
          </div>
          <div>
            <Label className="text-[11px]">Status</Label>
            <Select value={d.status} onValueChange={(v) => setD({ ...d, status: v })}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["active", "paused", "ended"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px]">Notes</Label>
            <Textarea
              value={d.notes}
              onChange={(e) => setD({ ...d, notes: e.target.value })}
              className="min-h-20 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={saving}
              onClick={() => {
                if (!d.name.trim()) {
                  toast.error("Name দাও");
                  return;
                }
                onSave({
                  id: agency.id,
                  name: d.name.trim(),
                  contact_person: d.contact_person || null,
                  phone: d.phone || null,
                  email: d.email || null,
                  website: d.website || null,
                  retainer_fee: d.retainer_fee,
                  commission_pct: d.commission_pct,
                  status: d.status,
                  notes: d.notes || null,
                });
                onClose();
              }}
            >
              Save
            </Button>
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => {
                if (confirm(`"${agency.name}" মুছে ফেলবে?`)) onDelete(agency.id);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xs font-semibold tabular-nums">{value}</p>
    </div>
  );
}
