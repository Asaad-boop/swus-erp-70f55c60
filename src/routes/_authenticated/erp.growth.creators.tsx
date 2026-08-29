import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Users,
  Plus,
  Star,
  ExternalLink,
  LayoutGrid,
  KanbanSquare,
  Trophy,
  Phone,
  Mail,
  MapPin,
  Wallet,
  Eye,
  ShoppingCart,
  CalendarClock,
  Handshake,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  costPerOrder,
  daysUntil,
  fetchAgencies,
  fetchCreatorContacts,
  fetchCreators,
  fetchItems,
  fetchShipments,
  labelOf,
  NEGOTIATION_STATUSES,
  PLATFORMS,
  type Creator,
  type CreatorContact,
} from "@/lib/erp/content/content-data";
import {
  Avatar,
  ContentHero,
  EmptyState,
  ExportButton,
  Kpi,
  KpiStrip,
  Pill,
  SearchBox,
  Segmented,
  Toolbar,
  downloadCsv,
  fmtNum,
  sortBy,
  usePersistedState,
  BrandTag,
  BrandSelect,
} from "@/components/erp/content/content-ui";
import { cn } from "@/lib/utils";
import { Building2, Network } from "lucide-react";
import { GrowthPageTabs, useTabParam, type PageTab } from "@/components/erp/growth/page-tabs";
import { AgenciesPage } from "./erp.growth.agencies";
import { MatchingPage } from "./erp.growth.matching";

export const Route = createFileRoute("/_authenticated/erp/growth/creators")({
  head: () => ({
    meta: [
      { title: "Creator CRM — Growth Studio" },
      {
        name: "description",
        content:
          "Influencer database with rates, negotiation pipeline, follow-up reminders and cost-per-order leaderboard.",
      },
      { property: "og:title", content: "Creator CRM — Growth Studio" },
      {
        property: "og:description",
        content: "Track creator rates, negotiations, shipments and delivered performance in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search['tab'] === "string" ? (search['tab'] as string) : undefined,
  }),
  component: PeopleShell,
});

const PEOPLE_TABS: PageTab[] = [
  { key: "creators", label: "Creator CRM", icon: Users },
  { key: "agencies", label: "Agency Partners", icon: Building2 },
  { key: "matching", label: "Product \u2194 Creator", icon: Network },
];

function PeopleShell() {
  const tab = useTabParam(PEOPLE_TABS);
  return (
    <div>
      <div className="border-b border-border/50 bg-card/30 px-4 py-2.5 sm:px-6">
        <GrowthPageTabs base="/erp/growth/creators" tabs={PEOPLE_TABS} active={tab} />
      </div>
      {tab === "agencies" ? <AgenciesPage /> : tab === "matching" ? <MatchingPage /> : <CreatorsPage />}
    </div>
  );
}

const emptyDraft = {
  name: "",
  handle: "",
  platform: "facebook",
  followers: 0,
  niche: "",
  rate: 0,
  min_charge: 0,
  max_charge: 0,
  phone: "",
  email: "",
  address: "",
  agency_id: "",
  profile_url: "",
  negotiation_status: "new",
};

type Perf = { pieces: number; views: number; orders: number; spend: number };
type ViewMode = "grid" | "pipeline" | "leaderboard";

function CreatorsPage() {
  const { brandIds, activeBrand } = useBrand();
  const qc = useQueryClient();

  const [view, patchView] = usePersistedState("creators", {
    search: "",
    stage: "all",
    platform: "all",
    mode: "grid" as ViewMode,
    sort: "orders" as "orders" | "cpo" | "rate" | "followers" | "name",
  });
  const [formBrand, setFormBrand] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [open, setOpen] = useState<Creator | null>(null);

  const creatorsQ = useQuery({
    queryKey: ["content-creators", brandIds],
    queryFn: () => fetchCreators(brandIds),
  });
  const agenciesQ = useQuery({
    queryKey: ["content-agencies", brandIds],
    queryFn: () => fetchAgencies(brandIds),
  });
  const itemsQ = useQuery({
    queryKey: ["content-items", brandIds],
    queryFn: () => fetchItems(brandIds),
  });
  const shipmentsQ = useQuery({
    queryKey: ["content-shipments", brandIds],
    queryFn: () => fetchShipments(brandIds),
  });
  const contactsQ = useQuery({
    queryKey: ["content-creator-contacts", open?.id],
    enabled: !!open,
    queryFn: () => fetchCreatorContacts(open ? [open.id] : []),
  });
  const allContactsQ = useQuery({
    queryKey: ["content-creator-contacts-all", (creatorsQ.data ?? []).length],
    enabled: (creatorsQ.data ?? []).length > 0,
    queryFn: () => fetchCreatorContacts((creatorsQ.data ?? []).map((c) => c.id)),
  });

  const creators = creatorsQ.data ?? [];
  const agencyName = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of agenciesQ.data ?? []) m.set(a.id, a.name);
    return m;
  }, [agenciesQ.data]);

  const perf = useMemo(() => {
    const m = new Map<string, Perf>();
    for (const i of itemsQ.data ?? []) {
      if (!i.creator_id) continue;
      const cur = m.get(i.creator_id) ?? { pieces: 0, views: 0, orders: 0, spend: 0 };
      cur.pieces++;
      cur.views += Number(i.views) || 0;
      cur.orders += Number(i.attributed_orders) || 0;
      cur.spend += Number(i.cost) || 0;
      m.set(i.creator_id, cur);
    }
    return m;
  }, [itemsQ.data]);

  /** Next follow-up date per creator, from the contact log. */
  const followUp = useMemo(() => {
    const m = new Map<string, string>();
    for (const [cid, list] of allContactsQ.data ?? new Map<string, CreatorContact[]>()) {
      const dates = list.map((c: CreatorContact) => c.next_follow_up).filter(Boolean) as string[];
      if (dates.length) m.set(cid, dates.sort()[0]!);
    }
    return m;
  }, [allContactsQ.data]);

  const shipmentsByCreator = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of shipmentsQ.data ?? []) m.set(s.creator_id, (m.get(s.creator_id) ?? 0) + 1);
    return m;
  }, [shipmentsQ.data]);

  const filtered = useMemo(() => {
    const s = view.search.trim().toLowerCase();
    const out = creators.filter((c) => {
      if (view.stage !== "all" && c.negotiation_status !== view.stage) return false;
      if (view.platform !== "all" && c.platform !== view.platform) return false;
      if (!s) return true;
      return (
        c.name.toLowerCase().includes(s) ||
        (c.handle ?? "").toLowerCase().includes(s) ||
        (c.niche ?? "").toLowerCase().includes(s) ||
        (c.phone ?? "").includes(s)
      );
    });
    switch (view.sort) {
      case "cpo":
        return sortBy(out, (c) => {
          const p = perf.get(c.id);
          const v = p ? costPerOrder(p.spend, p.orders) : null;
          return v == null ? Number.MAX_SAFE_INTEGER : v;
        }, "asc");
      case "rate":
        return sortBy(out, (c) => c.rate);
      case "followers":
        return sortBy(out, (c) => c.followers ?? 0);
      case "name":
        return sortBy(out, (c) => c.name.toLowerCase(), "asc");
      default:
        return sortBy(out, (c) => perf.get(c.id)?.orders ?? 0);
    }
  }, [creators, view, perf]);

  const kpis = useMemo(() => {
    const spend = [...perf.values()].reduce((s, p) => s + p.spend, 0);
    const orders = [...perf.values()].reduce((s, p) => s + p.orders, 0);
    const dueToday = creators.filter((c) => {
      const d = daysUntil(followUp.get(c.id));
      return d != null && d <= 0;
    }).length;
    return {
      total: creators.length,
      working: creators.filter((c) => c.negotiation_status === "working").length,
      negotiating: creators.filter((c) => c.negotiation_status === "negotiating").length,
      spend,
      orders,
      cpo: costPerOrder(spend, orders),
      dueToday,
    };
  }, [creators, perf, followUp]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!draft.name.trim()) throw new Error("Name দাও");
      const brand_id = formBrand ?? activeBrand?.id ?? null;
      if (!brand_id) throw new Error("Brand বাছাই করুন");
      const { error } = await supabase.from("hub_creators").insert({
        brand_id,
        ...draft,
        agency_id: draft.agency_id || null,
        handle: draft.handle || null,
        niche: draft.niche || null,
        phone: draft.phone || null,
        email: draft.email || null,
        address: draft.address || null,
        profile_url: draft.profile_url || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Creator যোগ হয়েছে");
      setCreating(false);
      setDraft(emptyDraft);
      qc.invalidateQueries({ queryKey: ["content-creators"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: async (patch: Partial<Creator> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase
        .from("hub_creators")
        .update(rest as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-creators"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hub_creators").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Creator মুছে ফেলা হয়েছে");
      setOpen(null);
      qc.invalidateQueries({ queryKey: ["content-creators"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const logMut = useMutation({
    mutationFn: async (v: {
      creator: Creator;
      channel: string;
      summary: string;
      outcome: string;
      quoted: number;
      next: string;
    }) => {
      if (!v.summary.trim()) throw new Error("Summary দাও");
      const { error } = await supabase.from("content_creator_contacts").insert({
        creator_id: v.creator.id,
        brand_id: v.creator.brand_id,
        channel: v.channel,
        summary: v.summary.trim(),
        outcome: v.outcome || null,
        quoted_amount: v.quoted || null,
        next_follow_up: v.next || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contact log হয়েছে");
      qc.invalidateQueries({ queryKey: ["content-creator-contacts"] });
      qc.invalidateQueries({ queryKey: ["content-creator-contacts-all"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = () =>
    downloadCsv(`creators-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["Name", "Handle", "Platform", "Followers", "Niche", "Stage", "Rate", "Agency", "Content", "Views", "Orders", "Spend", "Cost/Order", "Next follow-up"],
      ...filtered.map((c) => {
        const p = perf.get(c.id);
        return [
          c.name,
          c.handle ?? "",
          labelOf(PLATFORMS, c.platform),
          c.followers ?? 0,
          c.niche ?? "",
          labelOf(NEGOTIATION_STATUSES, c.negotiation_status),
          c.rate,
          c.agency_id ? (agencyName.get(c.agency_id) ?? "") : "",
          p?.pieces ?? 0,
          p?.views ?? 0,
          p?.orders ?? 0,
          p?.spend ?? 0,
          p ? (costPerOrder(p.spend, p.orders)?.toFixed(0) ?? "") : "",
          followUp.get(c.id) ?? "",
        ];
      }),
    ]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-3 md:p-6">
      <ContentHero
        icon={Users}
        title="Creator CRM"
        subtitle="Influencer database, rate negotiation, follow-up reminder আর delivered performance — সব এক জায়গায়।"
        actions={
          <Button size="sm" className="h-9" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add creator
          </Button>
        }
      >
        <KpiStrip cols={5}>
          <Kpi label="Creators" value={kpis.total} icon={Users} />
          <Kpi
            label="Working"
            value={kpis.working}
            icon={Handshake}
            tone="good"
            onClick={() => patchView({ stage: view.stage === "working" ? "all" : "working" })}
            active={view.stage === "working"}
          />
          <Kpi
            label="Negotiating"
            value={kpis.negotiating}
            tone="warn"
            onClick={() => patchView({ stage: view.stage === "negotiating" ? "all" : "negotiating" })}
            active={view.stage === "negotiating"}
          />
          <Kpi
            label="Follow-up due"
            value={kpis.dueToday}
            icon={CalendarClock}
            tone={kpis.dueToday > 0 ? "bad" : "good"}
          />
          <Kpi
            label="Creator spend"
            value={bdt(kpis.spend)}
            icon={Wallet}
            hint={kpis.cpo != null ? `${bdt(kpis.cpo)} / order · ${kpis.orders} orders` : "no attributed order"}
          />
        </KpiStrip>
      </ContentHero>

      <Toolbar>
        <SearchBox
          value={view.search}
          onChange={(v) => patchView({ search: v })}
          placeholder="Name, handle, niche, phone…  ( / )"
        />
        <Segmented
          value={view.mode}
          onChange={(v) => patchView({ mode: v })}
          options={[
            { key: "grid", label: "Grid", icon: LayoutGrid },
            { key: "pipeline", label: "Pipeline", icon: KanbanSquare },
            { key: "leaderboard", label: "Leaderboard", icon: Trophy },
          ]}
        />
        <Select value={view.stage} onValueChange={(v) => patchView({ stage: v })}>
          <SelectTrigger className="h-9 w-[130px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {NEGOTIATION_STATUSES.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={view.platform} onValueChange={(v) => patchView({ platform: v })}>
          <SelectTrigger className="h-9 w-[130px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            {PLATFORMS.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={view.sort} onValueChange={(v) => patchView({ sort: v as typeof view.sort })}>
          <SelectTrigger className="h-9 w-[150px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="orders" className="text-xs">Sort: Orders</SelectItem>
            <SelectItem value="cpo" className="text-xs">Sort: Cost / order</SelectItem>
            <SelectItem value="rate" className="text-xs">Sort: Rate</SelectItem>
            <SelectItem value="followers" className="text-xs">Sort: Followers</SelectItem>
            <SelectItem value="name" className="text-xs">Sort: Name</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <ExportButton onClick={exportCsv} />
        </div>
      </Toolbar>

      {creatorsQ.isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="কোনো creator নেই"
          description="নতুন creator যোগ করো অথবা filter বদলাও।"
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add creator
            </Button>
          }
        />
      ) : view.mode === "pipeline" ? (
        <div className="flex snap-x gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-6 md:overflow-visible">
          {NEGOTIATION_STATUSES.map((st) => {
            const list = filtered.filter((c) => c.negotiation_status === st.key);
            return (
              <div
                key={st.key}
                className="w-[80vw] shrink-0 snap-start rounded-xl border border-border/60 bg-muted/25 p-2 md:w-auto"
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-xs font-semibold">{st.label}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {list.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {list.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setOpen(c)}
                      className="flex w-full items-center gap-2 rounded-lg border border-border/70 bg-card p-2 text-left transition-colors hover:border-primary/40"
                    >
                      <Avatar name={c.name} size={26} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">{c.name}</p>
                        <BrandTag brandId={c.brand_id} className="mt-0.5" />
                        <p className="truncate text-[10px] text-muted-foreground">
                          {bdt(c.rate)} · {fmtNum(c.followers ?? 0)} followers
                        </p>
                      </div>
                    </button>
                  ))}
                  {list.length === 0 && (
                    <p className="px-1 py-5 text-center text-[11px] text-muted-foreground">খালি</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : view.mode === "leaderboard" ? (
        <Leaderboard creators={filtered} perf={perf} onOpen={setOpen} />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <CreatorCard
              key={c.id}
              creator={c}
              perf={perf.get(c.id)}
              agency={c.agency_id ? (agencyName.get(c.agency_id) ?? null) : null}
              shipments={shipmentsByCreator.get(c.id) ?? 0}
              followUp={followUp.get(c.id) ?? null}
              onOpen={() => setOpen(c)}
            />
          ))}
        </div>
      )}

      {/* Add creator */}
      <Sheet open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-base">Add creator</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 py-3">
            <BrandSelect value={formBrand ?? activeBrand?.id ?? null} onChange={setFormBrand} />
            <Field label="Name">
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="h-9"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Handle">
                <Input
                  value={draft.handle}
                  onChange={(e) => setDraft({ ...draft, handle: e.target.value })}
                  className="h-9"
                />
              </Field>
              <Field label="Platform">
                <Select
                  value={draft.platform}
                  onValueChange={(v) => setDraft({ ...draft, platform: v })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Followers">
                <Input
                  type="number"
                  value={draft.followers}
                  onChange={(e) => setDraft({ ...draft, followers: Number(e.target.value) || 0 })}
                  className="h-9"
                />
              </Field>
              <Field label="Niche">
                <Input
                  value={draft.niche}
                  onChange={(e) => setDraft({ ...draft, niche: e.target.value })}
                  className="h-9"
                />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  ["rate", "Rate"],
                  ["min_charge", "Min"],
                  ["max_charge", "Max"],
                ] as const
              ).map(([k, label]) => (
                <Field key={k} label={label}>
                  <Input
                    type="number"
                    value={draft[k]}
                    onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) || 0 })}
                    className="h-9"
                  />
                </Field>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone">
                <Input
                  value={draft.phone}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  className="h-9"
                />
              </Field>
              <Field label="Email">
                <Input
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  className="h-9"
                />
              </Field>
            </div>
            <Field label="Address (product ship করার জন্য)">
              <Textarea
                value={draft.address}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                className="min-h-16 text-sm"
              />
            </Field>
            <Field label="Profile URL">
              <Input
                value={draft.profile_url}
                onChange={(e) => setDraft({ ...draft, profile_url: e.target.value })}
                className="h-9"
              />
            </Field>
            <Field label="Agency">
              <Select
                value={draft.agency_id || "none"}
                onValueChange={(v) => setDraft({ ...draft, agency_id: v === "none" ? "" : v })}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Independent</SelectItem>
                  {(agenciesQ.data ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Button className="w-full" disabled={createMut.isPending} onClick={() => createMut.mutate()}>
              Add
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Detail */}
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {open && (
            <CreatorDetail
              creator={open}
              perf={perf.get(open.id)}
              agency={open.agency_id ? (agencyName.get(open.agency_id) ?? null) : null}
              contacts={contactsQ.data?.get(open.id) ?? []}
              shipments={(shipmentsQ.data ?? []).filter((s) => s.creator_id === open.id)}
              items={(itemsQ.data ?? []).filter((i) => i.creator_id === open.id)}
              onStage={(v) => {
                updateMut.mutate({ id: open.id, negotiation_status: v });
                setOpen({ ...open, negotiation_status: v });
              }}
              onRate={(v) => {
                updateMut.mutate({ id: open.id, rate: v });
                setOpen({ ...open, rate: v });
                toast.success("Rate সেভ হয়েছে");
              }}
              onRating={(v) => {
                updateMut.mutate({ id: open.id, rating: v });
                setOpen({ ...open, rating: v });
              }}
              onLog={(v) => logMut.mutate({ creator: open, ...v })}
              logging={logMut.isPending}
              onDelete={() => {
                if (confirm(`"${open.name}" creator মুছে ফেলবে?`)) deleteMut.mutate(open.id);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[11px]">{label}</Label>
      {children}
    </div>
  );
}

function CreatorCard({
  creator: c,
  perf: p,
  agency,
  shipments,
  followUp,
  onOpen,
}: {
  creator: Creator;
  perf?: Perf;
  agency: string | null;
  shipments: number;
  followUp: string | null;
  onOpen: () => void;
}) {
  const due = daysUntil(followUp);
  const cpo = p ? costPerOrder(p.spend, p.orders) : null;
  return (
    <button
      onClick={onOpen}
      className="group rounded-xl border border-border/70 bg-card p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-start gap-2.5">
        <Avatar name={c.name} size={38} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold group-hover:text-primary">{c.name}</p>
              <BrandTag brandId={c.brand_id} className="mt-0.5" />
              <p className="truncate text-[11px] text-muted-foreground">
                {c.handle ?? "—"} · {labelOf(PLATFORMS, c.platform)} · {fmtNum(c.followers ?? 0)} followers
              </p>
            </div>
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {labelOf(NEGOTIATION_STATUSES, c.negotiation_status)}
            </Badge>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Pill tone="info">{bdt(c.rate)} rate</Pill>
            {c.niche && <Pill>{c.niche}</Pill>}
            {agency && <Pill>{agency}</Pill>}
            {c.rating != null && (
              <Pill tone="warn">
                <Star className="h-3 w-3" /> {c.rating}
              </Pill>
            )}
            {shipments > 0 && <Pill>{shipments} shipment</Pill>}
            {due != null && (
              <Pill tone={due < 0 ? "bad" : due <= 1 ? "warn" : "default"}>
                <CalendarClock className="h-3 w-3" />
                {due < 0 ? `${Math.abs(due)}d overdue` : due === 0 ? "Today" : `${due}d`}
              </Pill>
            )}
          </div>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-4 gap-1.5 border-t border-border/60 pt-2 text-center">
        <Stat label="Content" value={String(p?.pieces ?? 0)} />
        <Stat label="Views" value={fmtNum(p?.views ?? 0)} />
        <Stat label="Orders" value={String(p?.orders ?? 0)} />
        <Stat label="৳/order" value={cpo != null ? bdt(cpo) : "—"} />
      </div>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xs font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Leaderboard({
  creators,
  perf,
  onOpen,
}: {
  creators: Creator[];
  perf: Map<string, Perf>;
  onOpen: (c: Creator) => void;
}) {
  const rows = useMemo(() => {
    const withPerf = creators
      .map((c) => ({ c, p: perf.get(c.id) }))
      .filter((r) => r.p && r.p.orders > 0) as { c: Creator; p: Perf }[];
    return sortBy(withPerf, (r) => costPerOrder(r.p.spend, r.p.orders) ?? Number.MAX_SAFE_INTEGER, "asc");
  }, [creators, perf]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title="এখনো attributed order নেই"
        description="Pipeline-এ content-এর attributed orders বসালে এখানে creator leaderboard দেখাবে।"
      />
    );
  }

  const best = costPerOrder(rows[0]!.p.spend, rows[0]!.p.orders) ?? 1;

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
      {rows.map((r, idx) => {
        const cpo = costPerOrder(r.p.spend, r.p.orders) ?? 0;
        const ratio = best > 0 ? best / Math.max(cpo, 1) : 0;
        return (
          <button
            key={r.c.id}
            type="button"
            onClick={() => onOpen(r.c)}
            className="flex w-full items-center gap-3 border-b border-border/60 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-muted/40"
          >
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                idx === 0
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : idx === 1
                    ? "bg-slate-500/15 text-slate-600 dark:text-slate-300"
                    : idx === 2
                      ? "bg-orange-500/15 text-orange-600 dark:text-orange-400"
                      : "bg-muted text-muted-foreground",
              )}
            >
              {idx + 1}
            </span>
            <Avatar name={r.c.name} size={30} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{r.c.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {r.p.pieces} content · {fmtNum(r.p.views)} views · {r.p.orders} orders · {bdt(r.p.spend)} spend
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {bdt(cpo)}
              </p>
              <p className="text-[10px] text-muted-foreground">per order</p>
            </div>
            <div className="hidden w-24 sm:block">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.min(100, ratio * 100)}%` }}
                />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function CreatorDetail({
  creator,
  perf,
  agency,
  contacts,
  shipments,
  items,
  onStage,
  onRate,
  onRating,
  onLog,
  logging,
  onDelete,
}: {
  creator: Creator;
  perf?: Perf;
  agency: string | null;
  contacts: {
    id: string;
    channel: string;
    summary: string;
    outcome: string | null;
    quoted_amount: number | null;
    next_follow_up: string | null;
    created_at: string;
  }[];
  shipments: { id: string; status: string; qty: number; sent_date: string | null; tracking_no: string | null }[];
  items: { id: string; title: string; stage: string; views: number; attributed_orders: number; cost: number }[];
  onStage: (v: string) => void;
  onRate: (v: number) => void;
  onRating: (v: number) => void;
  onLog: (v: { channel: string; summary: string; outcome: string; quoted: number; next: string }) => void;
  logging: boolean;
  onDelete: () => void;
}) {
  const [channel, setChannel] = useState("whatsapp");
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState("");
  const [quoted, setQuoted] = useState(0);
  const [next, setNext] = useState("");
  const [rate, setRate] = useState(creator.rate);
  const cpo = perf ? costPerOrder(perf.spend, perf.orders) : null;

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-3 pr-6">
          <Avatar name={creator.name} size={44} />
          <div className="min-w-0">
            <SheetTitle className="truncate text-base">{creator.name}</SheetTitle>
            <BrandTag brandId={creator.brand_id} />
            <p className="truncate text-[11px] text-muted-foreground">
              {creator.handle ?? "—"} · {labelOf(PLATFORMS, creator.platform)}
              {agency ? ` · ${agency}` : ""}
              {creator.profile_url && (
                <a
                  href={creator.profile_url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1.5 inline-flex items-center text-primary"
                >
                  profile <ExternalLink className="ml-0.5 h-3 w-3" />
                </a>
              )}
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="ml-auto h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </SheetHeader>
      <div className="space-y-4 py-3">
        <KpiStrip cols={4}>
          <Kpi label="Content" value={perf?.pieces ?? 0} />
          <Kpi label="Views" value={fmtNum(perf?.views ?? 0)} icon={Eye} tone="info" />
          <Kpi label="Orders" value={perf?.orders ?? 0} icon={ShoppingCart} tone="good" />
          <Kpi label="৳ / order" value={cpo != null ? bdt(cpo) : "—"} icon={Wallet} />
        </KpiStrip>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Negotiation stage">
            <Select value={creator.negotiation_status} onValueChange={onStage}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NEGOTIATION_STATUSES.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Agreed rate (৳)">
            <div className="flex gap-1.5">
              <Input
                type="number"
                value={rate}
                onChange={(e) => setRate(Number(e.target.value) || 0)}
                className="h-9"
              />
              <Button size="sm" variant="outline" onClick={() => onRate(rate)}>
                Save
              </Button>
            </div>
          </Field>
        </div>

        <div>
          <Label className="text-[11px]">Rating</Label>
          <div className="mt-1 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => onRating(n)} aria-label={`Rate ${n}`}>
                <Star
                  className={cn(
                    "h-5 w-5 transition-colors",
                    (creator.rating ?? 0) >= n
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground/40",
                  )}
                />
              </button>
            ))}
          </div>
        </div>

        {(creator.phone || creator.email || creator.address) && (
          <div className="space-y-1 rounded-xl border border-border/70 bg-muted/30 p-2.5 text-[11px]">
            {creator.phone && (
              <p className="flex items-center gap-1.5">
                <Phone className="h-3 w-3 text-muted-foreground" />
                <a href={`tel:${creator.phone}`} className="hover:text-primary">
                  {creator.phone}
                </a>
              </p>
            )}
            {creator.email && (
              <p className="flex items-center gap-1.5">
                <Mail className="h-3 w-3 text-muted-foreground" /> {creator.email}
              </p>
            )}
            {creator.address && (
              <p className="flex items-start gap-1.5">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" /> {creator.address}
              </p>
            )}
          </div>
        )}

        {items.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Delivered content ({items.length})
            </h3>
            <div className="space-y-1.5">
              {items.slice(0, 8).map((i) => (
                <div
                  key={i.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-card px-2.5 py-1.5"
                >
                  <p className="truncate text-xs">{i.title}</p>
                  <p className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {fmtNum(i.views)} views · {i.attributed_orders} orders
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {shipments.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Product shipments ({shipments.length})
            </h3>
            <div className="space-y-1.5">
              {shipments.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-card px-2.5 py-1.5 text-[11px]"
                >
                  <span>
                    {s.qty} pcs {s.tracking_no ? `· ${s.tracking_no}` : ""}
                  </span>
                  <Pill tone={s.status === "delivered" ? "good" : s.status === "returned" ? "bad" : "warn"}>
                    {s.status}
                  </Pill>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Contact log
          </h3>
          <div className="space-y-2 border-l border-border/70 pl-3">
            {contacts.map((c) => (
              <div key={c.id} className="relative rounded-lg border border-border/70 bg-card px-2.5 py-2">
                <span className="absolute -left-[19px] top-3 h-2 w-2 rounded-full bg-primary" />
                <p className="text-xs">{c.summary}</p>
                <p className="text-[10px] text-muted-foreground">
                  {c.channel} · {new Date(c.created_at).toLocaleDateString()}
                  {c.quoted_amount ? ` · quoted ${bdt(c.quoted_amount)}` : ""}
                  {c.outcome ? ` · ${c.outcome}` : ""}
                  {c.next_follow_up ? ` · next ${c.next_follow_up}` : ""}
                </p>
              </div>
            ))}
            {contacts.length === 0 && <p className="text-[11px] text-muted-foreground">কোনো log নেই।</p>}
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-border/70 p-2.5">
          <p className="text-xs font-semibold">নতুন contact log</p>
          <div className="grid grid-cols-2 gap-2">
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["whatsapp", "call", "messenger", "instagram", "email", "meeting"].map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              value={quoted}
              onChange={(e) => setQuoted(Number(e.target.value) || 0)}
              placeholder="Quoted ৳"
              className="h-9"
            />
          </div>
          <Textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="কী কথা হলো..."
            className="min-h-16 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              placeholder="Outcome"
              className="h-9"
            />
            <Input
              type="date"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="h-9"
              title="Next follow-up"
            />
          </div>
          <Button
            size="sm"
            className="w-full"
            disabled={logging}
            onClick={() => {
              onLog({ channel, summary, outcome, quoted, next });
              setSummary("");
              setOutcome("");
              setQuoted(0);
            }}
          >
            Log contact
          </Button>
        </div>
      </div>
    </>
  );
}
