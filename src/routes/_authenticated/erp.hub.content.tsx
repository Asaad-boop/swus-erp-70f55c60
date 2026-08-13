import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Clapperboard,
  Plus,
  Pencil,
  Trash2,
  Users,
  ExternalLink,
  Wallet,
  CalendarDays,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { HubPageHeader } from "@/components/erp/hub/hub-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ASSET_TYPES,
  ASSIGNMENT_STATUSES,
  CONTENT_PLATFORMS,
  CONTENT_STATUSES,
  fetchAssignments,
  fetchContentPlans,
  fetchCreators,
  fetchProductOptions,
  fmtValue,
  type HubContentAssignment,
  type HubContentPlan,
  type HubCreator,
} from "@/lib/erp/hub/hub-data";

export const Route = createFileRoute("/_authenticated/erp/hub/content")({
  head: () => ({
    meta: [
      { title: "Content Journey — Growth Hub" },
      {
        name: "description",
        content:
          "Plan product content from stock arrival to launch: angles, platforms, creators, budgets and delivery status.",
      },
      { property: "og:title", content: "Content Journey — Growth Hub" },
      {
        property: "og:description",
        content: "Product-wise content plans, creator roster and assignment tracking in one board.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContentJourneyPage,
});

const STATUS_TONE: Record<string, string> = {
  planned: "bg-muted text-muted-foreground",
  briefing: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  shooting: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  editing: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  scheduled: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  live: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  cancelled: "bg-destructive/15 text-destructive",
};

type PlanDraft = {
  id?: string;
  title: string;
  product_id: string;
  angle: string;
  platform: string;
  asset_type: string;
  budget: string;
  launch_date: string;
  deadline: string;
  status: string;
  notes: string;
};

const emptyPlan = (): PlanDraft => ({
  title: "",
  product_id: "none",
  angle: "",
  platform: "facebook",
  asset_type: "ugc",
  budget: "",
  launch_date: "",
  deadline: "",
  status: "planned",
  notes: "",
});

type CreatorDraft = {
  id?: string;
  name: string;
  handle: string;
  platform: string;
  followers: string;
  niche: string;
  rate: string;
  contact: string;
  profile_url: string;
  performance_note: string;
  status: string;
};

const emptyCreator = (): CreatorDraft => ({
  name: "",
  handle: "",
  platform: "facebook",
  followers: "",
  niche: "",
  rate: "",
  contact: "",
  profile_url: "",
  performance_note: "",
  status: "active",
});

type AsgDraft = {
  id?: string;
  plan_id: string;
  creator_id: string;
  deliverable: string;
  agreed_budget: string;
  actual_cost: string;
  deadline: string;
  status: string;
  result_url: string;
};

const emptyAsg = (planId: string): AsgDraft => ({
  plan_id: planId,
  creator_id: "none",
  deliverable: "",
  agreed_budget: "",
  actual_cost: "",
  deadline: "",
  status: "briefed",
  result_url: "",
});

function ContentJourneyPage() {
  const { brandIds, activeBrand, isLoading: brandLoading } = useBrand();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [planOpen, setPlanOpen] = useState(false);
  const [plan, setPlan] = useState<PlanDraft>(emptyPlan());
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [creator, setCreator] = useState<CreatorDraft>(emptyCreator());
  const [asgOpen, setAsgOpen] = useState(false);
  const [asg, setAsg] = useState<AsgDraft>(emptyAsg(""));

  const plansQ = useQuery({
    queryKey: ["hub-content-plans", brandIds],
    queryFn: () => fetchContentPlans(brandIds),
    enabled: brandIds.length > 0,
  });
  const creatorsQ = useQuery({
    queryKey: ["hub-creators", brandIds],
    queryFn: () => fetchCreators(brandIds),
    enabled: brandIds.length > 0,
  });
  const productsQ = useQuery({
    queryKey: ["hub-content-products", brandIds],
    queryFn: () => fetchProductOptions(brandIds),
    enabled: brandIds.length > 0,
  });
  const plans = useMemo(() => plansQ.data ?? [], [plansQ.data]);
  const asgQ = useQuery({
    queryKey: ["hub-content-assignments", plans.map((p) => p.id)],
    queryFn: () => fetchAssignments(plans.map((p) => p.id)),
    enabled: plans.length > 0,
  });

  const creators = creatorsQ.data ?? [];
  const creatorById = useMemo(() => {
    const m = new Map<string, HubCreator>();
    for (const c of creators) m.set(c.id, c);
    return m;
  }, [creators]);
  const productName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of productsQ.data ?? []) m.set(p.id, p.name);
    return m;
  }, [productsQ.data]);
  const asgByPlan = useMemo(() => {
    const m = new Map<string, HubContentAssignment[]>();
    for (const a of asgQ.data ?? []) {
      const list = m.get(a.plan_id) ?? [];
      list.push(a);
      m.set(a.plan_id, list);
    }
    return m;
  }, [asgQ.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["hub-content-plans"] });
    qc.invalidateQueries({ queryKey: ["hub-content-assignments"] });
    qc.invalidateQueries({ queryKey: ["hub-creators"] });
  };

  const savePlan = useMutation({
    mutationFn: async (d: PlanDraft) => {
      if (!d.title.trim()) throw new Error("Title দরকার");
      const row = {
        brand_id: activeBrand?.id ?? null,
        title: d.title.trim(),
        product_id: d.product_id === "none" ? null : d.product_id,
        angle: d.angle.trim() || null,
        platform: d.platform,
        asset_type: d.asset_type,
        budget: Number(d.budget || 0),
        launch_date: d.launch_date || null,
        deadline: d.deadline || null,
        status: d.status,
        notes: d.notes.trim() || null,
      };
      const { error } = d.id
        ? await supabase.from("hub_content_plans").update(row as never).eq("id", d.id)
        : await supabase.from("hub_content_plans").insert(row as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Content plan saved");
      setPlanOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removePlan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hub_content_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setPlanStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("hub_content_plans")
        .update({ status } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const saveCreator = useMutation({
    mutationFn: async (d: CreatorDraft) => {
      if (!d.name.trim()) throw new Error("Name দরকার");
      const row = {
        brand_id: activeBrand?.id ?? null,
        name: d.name.trim(),
        handle: d.handle.trim() || null,
        platform: d.platform,
        followers: d.followers ? Number(d.followers) : null,
        niche: d.niche.trim() || null,
        rate: Number(d.rate || 0),
        contact: d.contact.trim() || null,
        profile_url: d.profile_url.trim() || null,
        performance_note: d.performance_note.trim() || null,
        status: d.status,
      };
      const { error } = d.id
        ? await supabase.from("hub_creators").update(row as never).eq("id", d.id)
        : await supabase.from("hub_creators").insert(row as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Creator saved");
      setCreatorOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeCreator = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hub_creators").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveAsg = useMutation({
    mutationFn: async (d: AsgDraft) => {
      const row = {
        plan_id: d.plan_id,
        creator_id: d.creator_id === "none" ? null : d.creator_id,
        deliverable: d.deliverable.trim() || null,
        agreed_budget: Number(d.agreed_budget || 0),
        actual_cost: Number(d.actual_cost || 0),
        deadline: d.deadline || null,
        status: d.status,
        result_url: d.result_url.trim() || null,
      };
      const { error } = d.id
        ? await supabase.from("hub_content_assignments").update(row as never).eq("id", d.id)
        : await supabase.from("hub_content_assignments").insert(row as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assignment saved");
      setAsgOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeAsg = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hub_content_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const postExpense = useMutation({
    mutationFn: async ({ a, p }: { a: HubContentAssignment; p: HubContentPlan }) => {
      const brand = p.brand_id ?? activeBrand?.id;
      if (!brand) throw new Error("Brand select করো");
      const amount = Number(a.actual_cost || a.agreed_budget || 0);
      if (amount <= 0) throw new Error("Actual cost 0 — আগে cost বসাও");
      const cat = p.asset_type === "photoshoot" ? "photoshoot" : a.creator_id ? "influencer" : "content";
      const { error } = await supabase.from("mkt_manual_expenses").insert({
        brand_id: brand,
        date: new Date().toISOString().slice(0, 10),
        amount,
        currency: "BDT",
        category: cat,
        product_id: p.product_id,
        vendor: a.creator_id ? (creatorById.get(a.creator_id)?.name ?? null) : null,
        note: `Content: ${p.title}${a.deliverable ? ` — ${a.deliverable}` : ""}`,
        source: "manual",
      } as never);
      if (error) throw error;
    },
    onSuccess: () => toast.success("Marketing expense-এ post হয়েছে"),
    onError: (e: Error) => toast.error(e.message),
  });

  const filteredPlans = useMemo(
    () => (statusFilter === "all" ? plans : plans.filter((p) => p.status === statusFilter)),
    [plans, statusFilter],
  );

  const stats = useMemo(() => {
    const active = plans.filter((p) => !["live", "cancelled"].includes(p.status)).length;
    const live = plans.filter((p) => p.status === "live").length;
    let budget = 0;
    let spent = 0;
    for (const p of plans) budget += Number(p.budget || 0);
    for (const a of asgQ.data ?? []) spent += Number(a.actual_cost || 0);
    return { active, live, budget, spent };
  }, [plans, asgQ.data]);

  const openNewPlan = () => {
    setPlan(emptyPlan());
    setPlanOpen(true);
  };
  const openEditPlan = (p: HubContentPlan) => {
    setPlan({
      id: p.id,
      title: p.title,
      product_id: p.product_id ?? "none",
      angle: p.angle ?? "",
      platform: p.platform,
      asset_type: p.asset_type,
      budget: p.budget ? String(p.budget) : "",
      launch_date: p.launch_date ?? "",
      deadline: p.deadline ?? "",
      status: p.status,
      notes: p.notes ?? "",
    });
    setPlanOpen(true);
  };
  const openNewAsg = (planId: string) => {
    setAsg(emptyAsg(planId));
    setAsgOpen(true);
  };
  const openEditAsg = (a: HubContentAssignment) => {
    setAsg({
      id: a.id,
      plan_id: a.plan_id,
      creator_id: a.creator_id ?? "none",
      deliverable: a.deliverable ?? "",
      agreed_budget: a.agreed_budget ? String(a.agreed_budget) : "",
      actual_cost: a.actual_cost ? String(a.actual_cost) : "",
      deadline: a.deadline ?? "",
      status: a.status,
      result_url: a.result_url ?? "",
    });
    setAsgOpen(true);
  };

  const loading = brandLoading || plansQ.isLoading;

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 px-3 py-4 md:px-6">
      <HubPageHeader
        icon={Clapperboard}
        title="Content Journey"
        subtitle="Stock আসার পর থেকে launch পর্যন্ত প্রতিটা product-এর content plan, creator আর budget একসাথে"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => { setCreator(emptyCreator()); setCreatorOpen(true); }}>
              <Users className="mr-1.5 h-4 w-4" /> Add creator
            </Button>
            <Button size="sm" onClick={openNewPlan}>
              <Plus className="mr-1.5 h-4 w-4" /> New plan
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Active plans", value: String(stats.active) },
          { label: "Live", value: String(stats.live) },
          { label: "Planned budget", value: fmtValue(stats.budget, "bdt") },
          { label: "Actual spent", value: fmtValue(stats.spent, "bdt") },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="font-display text-xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="plans" className="space-y-4">
        <TabsList>
          <TabsTrigger value="plans">Content plans</TabsTrigger>
          <TabsTrigger value="creators">Creators ({creators.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {[{ key: "all", label: "All" }, ...CONTENT_STATUSES].map((s) => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  statusFilter === s.key
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28 w-full rounded-xl" />
              ))}
            </div>
          ) : filteredPlans.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                কোনো content plan নেই। Stock আসলে auto task তৈরি হবে, বা এখনই "New plan" দিয়ে শুরু করো।
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredPlans.map((p) => {
                const list = asgByPlan.get(p.id) ?? [];
                const spent = list.reduce((s, a) => s + Number(a.actual_cost || 0), 0);
                return (
                  <Card key={p.id} className="overflow-hidden">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-display text-base font-semibold">{p.title}</h3>
                            <Badge className={STATUS_TONE[p.status] ?? ""} variant="secondary">
                              {CONTENT_STATUSES.find((s) => s.key === p.status)?.label ?? p.status}
                            </Badge>
                            <Badge variant="outline">
                              {ASSET_TYPES.find((a) => a.key === p.asset_type)?.label ?? p.asset_type}
                            </Badge>
                            <Badge variant="outline">
                              {CONTENT_PLATFORMS.find((c) => c.key === p.platform)?.label ?? p.platform}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {p.product_id ? productName.get(p.product_id) ?? "Product" : "No product linked"}
                            {p.angle ? ` • ${p.angle}` : ""}
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            {p.launch_date && (
                              <span className="inline-flex items-center gap-1">
                                <CalendarDays className="h-3.5 w-3.5" /> Launch {p.launch_date}
                              </span>
                            )}
                            {p.deadline && <span>Deadline {p.deadline}</span>}
                            <span>
                              Budget {fmtValue(Number(p.budget || 0), "bdt")} • Spent{" "}
                              <span className={spent > Number(p.budget || 0) ? "text-destructive" : ""}>
                                {fmtValue(spent, "bdt")}
                              </span>
                            </span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Select
                            value={p.status}
                            onValueChange={(v) => setPlanStatus.mutate({ id: p.id, status: v })}
                          >
                            <SelectTrigger className="h-8 w-[130px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CONTENT_STATUSES.map((s) => (
                                <SelectItem key={s.key} value={s.key}>
                                  {s.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditPlan(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => removePlan.mutate(p.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border/70 bg-muted/30 p-2">
                        <div className="flex items-center justify-between px-1 pb-1.5">
                          <p className="text-xs font-medium text-muted-foreground">
                            Creator assignments ({list.length})
                          </p>
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openNewAsg(p.id)}>
                            <Plus className="mr-1 h-3.5 w-3.5" /> Assign
                          </Button>
                        </div>
                        {list.length === 0 ? (
                          <p className="px-1 pb-1 text-xs text-muted-foreground">এখনো কেউ assign করা হয়নি।</p>
                        ) : (
                          <div className="space-y-1.5">
                            {list.map((a) => (
                              <div
                                key={a.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-background px-2.5 py-1.5 text-xs"
                              >
                                <div className="min-w-0">
                                  <span className="font-medium">
                                    {a.creator_id ? creatorById.get(a.creator_id)?.name ?? "Creator" : "In-house"}
                                  </span>
                                  {a.deliverable && (
                                    <span className="text-muted-foreground"> • {a.deliverable}</span>
                                  )}
                                  {a.deadline && <span className="text-muted-foreground"> • due {a.deadline}</span>}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Badge variant="outline">
                                    {ASSIGNMENT_STATUSES.find((s) => s.key === a.status)?.label ?? a.status}
                                  </Badge>
                                  <span className="text-muted-foreground">
                                    {fmtValue(Number(a.actual_cost || a.agreed_budget || 0), "bdt")}
                                  </span>
                                  {a.result_url && (
                                    <a
                                      href={a.result_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-primary hover:underline"
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title="Marketing expense-এ post করো"
                                    onClick={() => postExpense.mutate({ a, p })}
                                  >
                                    <Wallet className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => openEditAsg(a)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive"
                                    onClick={() => removeAsg.mutate(a.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="creators">
          {creators.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                কোনো creator/reviewer যোগ করা হয়নি।
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {creators.map((c) => (
                <Card key={c.id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-display text-sm font-semibold">{c.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {c.handle ? `${c.handle} • ` : ""}
                          {CONTENT_PLATFORMS.find((p) => p.key === c.platform)?.label ?? c.platform}
                          {c.followers ? ` • ${c.followers.toLocaleString("en-BD")} followers` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setCreator({
                              id: c.id,
                              name: c.name,
                              handle: c.handle ?? "",
                              platform: c.platform,
                              followers: c.followers ? String(c.followers) : "",
                              niche: c.niche ?? "",
                              rate: c.rate ? String(c.rate) : "",
                              contact: c.contact ?? "",
                              profile_url: c.profile_url ?? "",
                              performance_note: c.performance_note ?? "",
                              status: c.status,
                            });
                            setCreatorOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => removeCreator.mutate(c.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {c.niche && <Badge variant="outline">{c.niche}</Badge>}
                      <Badge variant="secondary">Rate {fmtValue(Number(c.rate || 0), "bdt")}</Badge>
                      {c.status !== "active" && <Badge variant="outline">{c.status}</Badge>}
                    </div>
                    {c.performance_note && (
                      <p className="text-xs text-muted-foreground">{c.performance_note}</p>
                    )}
                    {(c.contact || c.profile_url) && (
                      <p className="flex items-center gap-3 text-xs">
                        {c.contact && <span className="text-muted-foreground">{c.contact}</span>}
                        {c.profile_url && (
                          <a
                            href={c.profile_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            Profile <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Plan dialog */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{plan.id ? "Edit content plan" : "New content plan"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input value={plan.title} onChange={(e) => setPlan({ ...plan, title: e.target.value })} />
            </div>
            <div>
              <Label>Product</Label>
              <Select value={plan.product_id} onValueChange={(v) => setPlan({ ...plan, product_id: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No product</SelectItem>
                  {(productsQ.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Platform</Label>
                <Select value={plan.platform} onValueChange={(v) => setPlan({ ...plan, platform: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTENT_PLATFORMS.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Asset type</Label>
                <Select value={plan.asset_type} onValueChange={(v) => setPlan({ ...plan, asset_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSET_TYPES.map((a) => (
                      <SelectItem key={a.key} value={a.key}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Angle / hook</Label>
              <Input value={plan.angle} onChange={(e) => setPlan({ ...plan, angle: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Budget (৳)</Label>
                <Input
                  inputMode="numeric"
                  value={plan.budget}
                  onChange={(e) => setPlan({ ...plan, budget: e.target.value })}
                />
              </div>
              <div>
                <Label>Launch date</Label>
                <Input
                  type="date"
                  value={plan.launch_date}
                  onChange={(e) => setPlan({ ...plan, launch_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Deadline</Label>
                <Input
                  type="date"
                  value={plan.deadline}
                  onChange={(e) => setPlan({ ...plan, deadline: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={plan.status} onValueChange={(v) => setPlan({ ...plan, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_STATUSES.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={plan.notes}
                onChange={(e) => setPlan({ ...plan, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => savePlan.mutate(plan)} disabled={savePlan.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Creator dialog */}
      <Dialog open={creatorOpen} onOpenChange={setCreatorOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{creator.id ? "Edit creator" : "Add creator"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Name</Label>
                <Input value={creator.name} onChange={(e) => setCreator({ ...creator, name: e.target.value })} />
              </div>
              <div>
                <Label>Handle</Label>
                <Input
                  value={creator.handle}
                  onChange={(e) => setCreator({ ...creator, handle: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Platform</Label>
                <Select value={creator.platform} onValueChange={(v) => setCreator({ ...creator, platform: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTENT_PLATFORMS.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Followers</Label>
                <Input
                  inputMode="numeric"
                  value={creator.followers}
                  onChange={(e) => setCreator({ ...creator, followers: e.target.value })}
                />
              </div>
              <div>
                <Label>Rate (৳)</Label>
                <Input
                  inputMode="numeric"
                  value={creator.rate}
                  onChange={(e) => setCreator({ ...creator, rate: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Niche</Label>
                <Input value={creator.niche} onChange={(e) => setCreator({ ...creator, niche: e.target.value })} />
              </div>
              <div>
                <Label>Contact</Label>
                <Input
                  value={creator.contact}
                  onChange={(e) => setCreator({ ...creator, contact: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Profile URL</Label>
              <Input
                value={creator.profile_url}
                onChange={(e) => setCreator({ ...creator, profile_url: e.target.value })}
              />
            </div>
            <div>
              <Label>Past performance note</Label>
              <Textarea
                rows={2}
                value={creator.performance_note}
                onChange={(e) => setCreator({ ...creator, performance_note: e.target.value })}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={creator.status} onValueChange={(v) => setCreator({ ...creator, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="blacklisted">Blacklisted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatorOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveCreator.mutate(creator)} disabled={saveCreator.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assignment dialog */}
      <Dialog open={asgOpen} onOpenChange={setAsgOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{asg.id ? "Edit assignment" : "Assign creator"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Creator</Label>
              <Select value={asg.creator_id} onValueChange={(v) => setAsg({ ...asg, creator_id: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">In-house / none</SelectItem>
                  {creators.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Deliverable</Label>
              <Input
                value={asg.deliverable}
                onChange={(e) => setAsg({ ...asg, deliverable: e.target.value })}
                placeholder="1 reel + 3 photo"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Agreed (৳)</Label>
                <Input
                  inputMode="numeric"
                  value={asg.agreed_budget}
                  onChange={(e) => setAsg({ ...asg, agreed_budget: e.target.value })}
                />
              </div>
              <div>
                <Label>Actual (৳)</Label>
                <Input
                  inputMode="numeric"
                  value={asg.actual_cost}
                  onChange={(e) => setAsg({ ...asg, actual_cost: e.target.value })}
                />
              </div>
              <div>
                <Label>Deadline</Label>
                <Input
                  type="date"
                  value={asg.deadline}
                  onChange={(e) => setAsg({ ...asg, deadline: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={asg.status} onValueChange={(v) => setAsg({ ...asg, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNMENT_STATUSES.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Result link</Label>
              <Input
                value={asg.result_url}
                onChange={(e) => setAsg({ ...asg, result_url: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsgOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveAsg.mutate(asg)} disabled={saveAsg.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
