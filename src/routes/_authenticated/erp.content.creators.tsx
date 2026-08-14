import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Plus, Search, Star, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { ContentKpi, ContentPageHeader } from "@/components/erp/content/content-shell";
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
  fetchAgencies,
  fetchCreatorContacts,
  fetchCreators,
  fetchItems,
  labelOf,
  NEGOTIATION_STATUSES,
  PLATFORMS,
  type Creator,
} from "@/lib/erp/content/content-data";

export const Route = createFileRoute("/_authenticated/erp/content/creators")({
  head: () => ({
    meta: [
      { title: "Creator CRM — Content Studio" },
      {
        name: "description",
        content:
          "Influencer database with rates, negotiation stage, contact log and delivered content performance.",
      },
      { property: "og:title", content: "Creator CRM — Content Studio" },
      {
        property: "og:description",
        content: "Track creator rates, negotiations and past performance in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CreatorsPage,
});

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

function CreatorsPage() {
  const { brandIds, activeBrand } = useBrand();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("all");
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
  const contactsQ = useQuery({
    queryKey: ["content-creator-contacts", open?.id],
    enabled: !!open,
    queryFn: () => fetchCreatorContacts(open ? [open.id] : []),
  });

  const creators = creatorsQ.data ?? [];

  const perf = useMemo(() => {
    const m = new Map<string, { pieces: number; views: number; orders: number; spend: number }>();
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

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return creators.filter((c) => {
      if (stage !== "all" && c.negotiation_status !== stage) return false;
      if (!s) return true;
      return (
        c.name.toLowerCase().includes(s) ||
        (c.handle ?? "").toLowerCase().includes(s) ||
        (c.niche ?? "").toLowerCase().includes(s)
      );
    });
  }, [creators, search, stage]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!draft.name.trim()) throw new Error("Name দাও");
      const { error } = await supabase.from("content_creators").insert({
        brand_id: activeBrand?.id ?? brandIds[0] ?? null,
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
        .from("content_creators")
        .update(rest as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-creators"] }),
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
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalSpend = useMemo(
    () => Array.from(perf.values()).reduce((s, p) => s + p.spend, 0),
    [perf],
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-3 md:p-6">
      <ContentPageHeader
        icon={Users}
        title="Creator CRM"
        subtitle="Influencer database, rate negotiation আর past performance"
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add creator
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <ContentKpi label="Creators" value={creators.length} />
        <ContentKpi
          label="Working"
          value={creators.filter((c) => c.negotiation_status === "working").length}
          tone="good"
        />
        <ContentKpi
          label="Negotiating"
          value={creators.filter((c) => c.negotiation_status === "negotiating").length}
          tone="warn"
        />
        <ContentKpi label="Creator spend" value={bdt(totalSpend)} />
      </div>

      <div className="sticky top-[46px] z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-background/85 p-2 backdrop-blur">
        <div className="relative min-w-40 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, handle, niche..."
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger className="h-9 w-36 text-xs">
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
      </div>

      {creatorsQ.isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          কোনো creator নেই।
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const p = perf.get(c.id);
            return (
              <button
                key={c.id}
                onClick={() => setOpen(c)}
                className="rounded-xl border bg-card p-3 text-left shadow-sm transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{c.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {c.handle ?? "—"} · {labelOf(PLATFORMS, c.platform)} ·{" "}
                      {(c.followers ?? 0).toLocaleString()} followers
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {labelOf(NEGOTIATION_STATUSES, c.negotiation_status)}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                  <Badge variant="secondary">Rate {bdt(c.rate)}</Badge>
                  {c.niche && <Badge variant="outline">{c.niche}</Badge>}
                  {c.rating != null && (
                    <Badge variant="outline" className="gap-0.5">
                      <Star className="h-2.5 w-2.5" /> {c.rating}
                    </Badge>
                  )}
                </div>
                {p && (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {p.pieces} content · {p.views.toLocaleString()} views · {p.orders} orders ·{" "}
                    {bdt(p.spend)} spend
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Add creator */}
      <Sheet open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-base">Add creator</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 py-3">
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
                  onChange={(e) =>
                    setDraft({ ...draft, followers: Number(e.target.value) || 0 })
                  }
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

      {/* Detail */}
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {open && (
            <CreatorDetail
              creator={open}
              perf={perf.get(open.id)}
              contacts={contactsQ.data ?? []}
              onStage={(v) => {
                updateMut.mutate({ id: open.id, negotiation_status: v });
                setOpen({ ...open, negotiation_status: v });
              }}
              onRate={(v) => {
                updateMut.mutate({ id: open.id, rate: v });
                setOpen({ ...open, rate: v });
              }}
              onLog={(v) => logMut.mutate({ creator: open, ...v })}
              logging={logMut.isPending}
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

function CreatorDetail({
  creator,
  perf,
  contacts,
  onStage,
  onRate,
  onLog,
  logging,
}: {
  creator: Creator;
  perf?: { pieces: number; views: number; orders: number; spend: number };
  contacts: { id: string; channel: string; summary: string; outcome: string | null; quoted_amount: number | null; created_at: string }[];
  onStage: (v: string) => void;
  onRate: (v: number) => void;
  onLog: (v: {
    channel: string;
    summary: string;
    outcome: string;
    quoted: number;
    next: string;
  }) => void;
  logging: boolean;
}) {
  const [channel, setChannel] = useState("whatsapp");
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState("");
  const [quoted, setQuoted] = useState(0);
  const [next, setNext] = useState("");
  const [rate, setRate] = useState(creator.rate);

  return (
    <>
      <SheetHeader>
        <SheetTitle className="text-base">{creator.name}</SheetTitle>
        <p className="text-[11px] text-muted-foreground">
          {creator.handle ?? "—"} · {labelOf(PLATFORMS, creator.platform)}
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
      </SheetHeader>
      <div className="space-y-4 py-3">
        <div className="grid grid-cols-2 gap-2">
          <ContentKpi label="Content delivered" value={perf?.pieces ?? 0} />
          <ContentKpi label="Views" value={(perf?.views ?? 0).toLocaleString()} />
          <ContentKpi label="Attributed orders" value={perf?.orders ?? 0} tone="good" />
          <ContentKpi label="Paid" value={bdt(perf?.spend ?? 0)} />
        </div>

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

        {(creator.phone || creator.email || creator.address) && (
          <div className="rounded-lg border bg-muted/40 p-2 text-[11px]">
            {creator.phone && <p>📞 {creator.phone}</p>}
            {creator.email && <p>✉️ {creator.email}</p>}
            {creator.address && <p>📍 {creator.address}</p>}
          </div>
        )}

        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Contact log
          </h3>
          <div className="space-y-1.5">
            {contacts.map((c) => (
              <div key={c.id} className="rounded-lg border bg-card px-2.5 py-2">
                <p className="text-xs">{c.summary}</p>
                <p className="text-[10px] text-muted-foreground">
                  {c.channel} · {new Date(c.created_at).toLocaleDateString()}
                  {c.quoted_amount ? ` · quoted ${bdt(c.quoted_amount)}` : ""}
                  {c.outcome ? ` · ${c.outcome}` : ""}
                </p>
              </div>
            ))}
            {contacts.length === 0 && (
              <p className="text-[11px] text-muted-foreground">কোনো log নেই।</p>
            )}
          </div>
        </div>

        <div className="space-y-2 rounded-xl border p-2.5">
          <p className="text-xs font-semibold">নতুন contact log</p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder="Channel"
              className="h-9"
            />
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