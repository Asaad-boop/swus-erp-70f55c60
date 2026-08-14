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
  Search,
  LayoutGrid,
  List as ListIcon,
  Copy,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Eye,
  Heart,
  ShoppingCart,
  Link2,
  Play,
  Package,
  SlidersHorizontal,
  Save,
  ImageOff,
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
  CONTENT_PRIORITIES,
  CONTENT_STATUSES,
  fetchAssignments,
  fetchContentPlans,
  fetchCreators,
  fetchProductOptions,
  fmtValue,
  type HubContentAssignment,
  type HubContentPlan,
  type HubCreator,
  type HubProductOption,
} from "@/lib/erp/hub/hub-data";
import { VideoEmbed } from "@/components/erp/hub/video-embed";
import {
  BudgetBar,
  DueChip,
  Field,
  KpiTile,
  MonthGrid,
  PRIORITY_BAR,
  PRIORITY_TONE,
  STATUS_DOT,
  STATUS_TONE,
  daysUntil,
  priorityLabel,
  statusLabel,
  todayISO,
} from "@/components/erp/hub/creative-kit";

export const Route = createFileRoute("/_authenticated/erp/hub/content")({
  head: () => ({
    meta: [
      { title: "Creative Desk — Growth Hub" },
      {
        name: "description",
        content:
          "Plan, brief, produce and publish product content: kanban production board, creator roster, budgets and post-launch results.",
      },
      { property: "og:title", content: "Creative Desk — Growth Hub" },
      {
        property: "og:description",
        content:
          "Production board, briefs, creator assignments, budget control and result tracking for every product content piece.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CreativeDeskPage,
});

const BOARD_STAGES = CONTENT_STATUSES.filter((s) => s.key !== "cancelled");

type PlanDraft = {
  id?: string;
  title: string;
  product_id: string;
  angle: string;
  platform: string;
  asset_type: string;
  priority: string;
  budget: string;
  launch_date: string;
  deadline: string;
  status: string;
  brief: string;
  script: string;
  caption: string;
  cta: string;
  hashtags: string;
  reference_urls: string;
  notes: string;
  video_url: string;
};

const emptyPlan = (): PlanDraft => ({
  title: "",
  product_id: "none",
  angle: "",
  platform: "facebook",
  asset_type: "ugc",
  priority: "normal",
  budget: "",
  launch_date: "",
  deadline: "",
  status: "planned",
  brief: "",
  script: "",
  caption: "",
  cta: "",
  hashtags: "",
  reference_urls: "",
  notes: "",
  video_url: "",
});

const planToDraft = (p: HubContentPlan): PlanDraft => ({
  id: p.id,
  title: p.title,
  product_id: p.product_id ?? "none",
  angle: p.angle ?? "",
  platform: p.platform,
  asset_type: p.asset_type,
  priority: p.priority ?? "normal",
  budget: p.budget ? String(p.budget) : "",
  launch_date: p.launch_date ?? "",
  deadline: p.deadline ?? "",
  status: p.status,
  brief: p.brief ?? "",
  script: p.script ?? "",
  caption: p.caption ?? "",
  cta: p.cta ?? "",
  hashtags: p.hashtags ?? "",
  reference_urls: (p.reference_urls ?? []).join("\n"),
  notes: p.notes ?? "",
  video_url: p.video_url ?? "",
});

type CreatorDraft = {
  id?: string;
  name: string;
  handle: string;
  platform: string;
  followers: string;
  niche: string;
  rate: string;
  rating: string;
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
  rating: "",
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
  notes: string;
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
  notes: "",
});

function CreativeDeskPage() {
  const { brandIds, activeBrand, isLoading: brandLoading } = useBrand();
  const qc = useQueryClient();

  const [view, setView] = useState<"board" | "list" | "calendar" | "creators">("board");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [assetFilter, setAssetFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [quick, setQuick] = useState<"none" | "due" | "overdue" | "live" | "unassigned">("none");
  const [sortBy, setSortBy] = useState<"deadline" | "launch" | "created" | "budget">("deadline");
  const [month, setMonth] = useState(() => new Date());
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
  const productById = useMemo(() => {
    const m = new Map<string, HubProductOption>();
    for (const p of productsQ.data ?? []) m.set(p.id, p);
    return m;
  }, [productsQ.data]);
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
  const spendByPlan = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of asgQ.data ?? [])
      m.set(a.plan_id, (m.get(a.plan_id) ?? 0) + Number(a.actual_cost || 0));
    return m;
  }, [asgQ.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["hub-content-plans"] });
    qc.invalidateQueries({ queryKey: ["hub-content-assignments"] });
    qc.invalidateQueries({ queryKey: ["hub-creators"] });
  };

  const planRow = (d: PlanDraft) => ({
    brand_id: activeBrand?.id ?? null,
    title: d.title.trim(),
    product_id: d.product_id === "none" ? null : d.product_id,
    angle: d.angle.trim() || null,
    platform: d.platform,
    asset_type: d.asset_type,
    priority: d.priority,
    budget: Number(d.budget || 0),
    launch_date: d.launch_date || null,
    deadline: d.deadline || null,
    status: d.status,
    brief: d.brief.trim() || null,
    script: d.script.trim() || null,
    caption: d.caption.trim() || null,
    cta: d.cta.trim() || null,
    hashtags: d.hashtags.trim() || null,
    reference_urls: d.reference_urls
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    notes: d.notes.trim() || null,
    video_url: d.video_url.trim() || null,
  });

  const savePlan = useMutation({
    mutationFn: async (d: PlanDraft) => {
      if (!d.title.trim()) throw new Error("Title দরকার");
      const row = planRow(d);
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

  const patchPlan = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("hub_content_plans").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const removePlan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hub_content_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      setSelectedId(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clonePlan = useMutation({
    mutationFn: async (p: HubContentPlan) => {
      const d = planToDraft(p);
      const row = { ...planRow(d), title: `${p.title} (copy)`, status: "planned" };
      const { error } = await supabase.from("hub_content_plans").insert(row as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cloned");
      invalidate();
    },
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
        rating: d.rating ? Number(d.rating) : null,
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
        notes: d.notes.trim() || null,
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

  const patchAsg = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("hub_content_assignments")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
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
      const cat =
        p.asset_type === "photoshoot" ? "photoshoot" : a.creator_id ? "influencer" : "content";
      const { error } = await supabase.from("mkt_manual_expenses").insert({
        brand_id: brand,
        date: todayISO(),
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

  /* ---------------- derived ---------------- */

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = plans.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (platformFilter !== "all" && p.platform !== platformFilter) return false;
      if (assetFilter !== "all" && p.asset_type !== assetFilter) return false;
      if (priorityFilter !== "all" && (p.priority ?? "normal") !== priorityFilter) return false;
      if (creatorFilter !== "all") {
        const list = asgByPlan.get(p.id) ?? [];
        if (!list.some((a) => a.creator_id === creatorFilter)) return false;
      }
      if (q) {
        const hay = [
          p.title,
          p.angle ?? "",
          p.brief ?? "",
          p.caption ?? "",
          p.hashtags ?? "",
          p.product_id ? (productName.get(p.product_id) ?? "") : "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (quick === "due")
      list = list.filter((p) => {
        const d = daysUntil(p.deadline);
        return d != null && d >= 0 && d <= 7 && !["live", "cancelled"].includes(p.status);
      });
    if (quick === "overdue")
      list = list.filter((p) => {
        const d = daysUntil(p.deadline);
        return d != null && d < 0 && !["live", "cancelled"].includes(p.status);
      });
    if (quick === "live") list = list.filter((p) => p.status === "live");
    if (quick === "unassigned")
      list = list.filter((p) => (asgByPlan.get(p.id) ?? []).length === 0);

    const key = (p: HubContentPlan) =>
      sortBy === "deadline"
        ? (p.deadline ?? "9999-12-31")
        : sortBy === "launch"
          ? (p.launch_date ?? "9999-12-31")
          : sortBy === "budget"
            ? String(1e12 - Number(p.budget || 0)).padStart(15, "0")
            : (9e15 - new Date(p.created_at).getTime()).toString().padStart(18, "0");
    return [...list].sort((a, b) => key(a).localeCompare(key(b)));
  }, [
    plans,
    search,
    statusFilter,
    platformFilter,
    assetFilter,
    priorityFilter,
    creatorFilter,
    quick,
    sortBy,
    asgByPlan,
    productName,
  ]);

  const stats = useMemo(() => {
    const open = plans.filter((p) => !["live", "cancelled"].includes(p.status));
    const overdue = open.filter((p) => {
      const d = daysUntil(p.deadline);
      return d != null && d < 0;
    }).length;
    const due = open.filter((p) => {
      const d = daysUntil(p.deadline);
      return d != null && d >= 0 && d <= 7;
    }).length;
    const live = plans.filter((p) => p.status === "live");
    let budget = 0;
    for (const p of plans) budget += Number(p.budget || 0);
    let spent = 0;
    for (const a of asgQ.data ?? []) spent += Number(a.actual_cost || 0);
    const views = live.reduce((s, p) => s + Number(p.views || 0), 0);
    const orders = live.reduce((s, p) => s + Number(p.attributed_orders || 0), 0);
    const unassigned = open.filter((p) => (asgByPlan.get(p.id) ?? []).length === 0).length;
    return {
      production: open.length,
      overdue,
      due,
      live: live.length,
      budget,
      spent,
      views,
      orders,
      unassigned,
    };
  }, [plans, asgQ.data, asgByPlan]);

  const creatorStats = useMemo(() => {
    const m = new Map<
      string,
      { jobs: number; delivered: number; spend: number; live: number }
    >();
    for (const a of asgQ.data ?? []) {
      if (!a.creator_id) continue;
      const s = m.get(a.creator_id) ?? { jobs: 0, delivered: 0, spend: 0, live: 0 };
      s.jobs += 1;
      if (["delivered", "posted"].includes(a.status)) s.delivered += 1;
      if (a.status === "posted") s.live += 1;
      s.spend += Number(a.actual_cost || 0);
      m.set(a.creator_id, s);
    }
    return m;
  }, [asgQ.data]);

  const selected = useMemo(
    () => plans.find((p) => p.id === selectedId) ?? null,
    [plans, selectedId],
  );

  const openNewPlan = () => {
    setPlan(emptyPlan());
    setPlanOpen(true);
  };
  const openEditPlan = (p: HubContentPlan) => {
    setPlan(planToDraft(p));
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
      notes: a.notes ?? "",
    });
    setAsgOpen(true);
  };

  const copyBrief = (p: HubContentPlan) => {
    const text = [
      `Title: ${p.title}`,
      p.product_id ? `Product: ${productName.get(p.product_id) ?? ""}` : "",
      `Platform: ${p.platform} • Asset: ${p.asset_type}`,
      p.angle ? `Hook/Angle: ${p.angle}` : "",
      p.brief ? `\nBrief:\n${p.brief}` : "",
      p.script ? `\nScript:\n${p.script}` : "",
      p.caption ? `\nCaption:\n${p.caption}` : "",
      p.cta ? `CTA: ${p.cta}` : "",
      p.hashtags ? `Hashtags: ${p.hashtags}` : "",
      p.deadline ? `Deadline: ${p.deadline}` : "",
      (p.reference_urls ?? []).length ? `\nReferences:\n${(p.reference_urls ?? []).join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    navigator.clipboard.writeText(text).then(
      () => toast.success("Brief copy হয়েছে"),
      () => toast.error("Copy করা যায়নি"),
    );
  };

  const nextStage = (status: string, dir: 1 | -1) => {
    const i = BOARD_STAGES.findIndex((s) => s.key === status);
    const j = Math.min(BOARD_STAGES.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir));
    return BOARD_STAGES[j].key;
  };

  const loading = brandLoading || plansQ.isLoading;

  const filterSelects = (
    <>
      <Select value={platformFilter} onValueChange={setPlatformFilter}>
        <SelectTrigger className="h-8 w-[120px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All platforms</SelectItem>
          {CONTENT_PLATFORMS.map((p) => (
            <SelectItem key={p.key} value={p.key}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={assetFilter} onValueChange={setAssetFilter}>
        <SelectTrigger className="h-8 w-[130px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All asset types</SelectItem>
          {ASSET_TYPES.map((a) => (
            <SelectItem key={a.key} value={a.key}>
              {a.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={priorityFilter} onValueChange={setPriorityFilter}>
        <SelectTrigger className="h-8 w-[110px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All priority</SelectItem>
          {CONTENT_PRIORITIES.map((p) => (
            <SelectItem key={p.key} value={p.key}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={creatorFilter} onValueChange={setCreatorFilter}>
        <SelectTrigger className="h-8 w-[130px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All creators</SelectItem>
          {creators.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
        <SelectTrigger className="h-8 w-[130px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="deadline">Sort: Deadline</SelectItem>
          <SelectItem value="launch">Sort: Launch date</SelectItem>
          <SelectItem value="created">Sort: Newest</SelectItem>
          <SelectItem value="budget">Sort: Budget</SelectItem>
        </SelectContent>
      </Select>
    </>
  );

  const PlanCard = ({ p, compact }: { p: HubContentPlan; compact?: boolean }) => {
    const list = asgByPlan.get(p.id) ?? [];
    const spent = spendByPlan.get(p.id) ?? 0;
    const budget = Number(p.budget || 0);
    const prod = p.product_id ? productById.get(p.product_id) : undefined;
    return (
      <button
        type="button"
        onClick={() => setSelectedId(p.id)}
        className={`group relative w-full overflow-hidden rounded-xl border bg-card p-3 text-left transition-all active:scale-[0.99] md:hover:-translate-y-0.5 md:hover:shadow-md ${
          selectedId === p.id ? "ring-2 ring-primary/40" : ""
        }`}
      >
        <span
          className={`absolute inset-y-0 left-0 w-1 ${PRIORITY_BAR[p.priority ?? "normal"] ?? ""}`}
        />
        <div className="space-y-2 pl-1.5">
          <div className="flex items-start gap-2.5">
            {prod?.image ? (
              <img
                src={prod.image}
                alt={prod.name}
                loading="lazy"
                className="h-11 w-11 shrink-0 rounded-lg border object-cover"
              />
            ) : (
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground">
                <ImageOff className="h-4 w-4 opacity-60" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-2 text-sm font-semibold leading-snug">{p.title}</p>
                <DueChip date={p.deadline} done={p.status === "live"} />
              </div>
              <p className="line-clamp-1 text-[11px] text-muted-foreground">
                {prod ? prod.name : "No product"}
                {p.angle ? ` • ${p.angle}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {p.video_url && (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <Play className="h-2.5 w-2.5" /> Video
              </Badge>
            )}
            {p.script && (
              <Badge variant="secondary" className="text-[10px]">
                Script
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px]">
              {ASSET_TYPES.find((a) => a.key === p.asset_type)?.label ?? p.asset_type}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {CONTENT_PLATFORMS.find((c) => c.key === p.platform)?.label ?? p.platform}
            </Badge>
            {(p.priority ?? "normal") !== "normal" && (
              <Badge
                variant="secondary"
                className={`text-[10px] ${PRIORITY_TONE[p.priority ?? "normal"] ?? ""}`}
              >
                {priorityLabel(p.priority ?? "normal")}
              </Badge>
            )}
            {compact && (
              <Badge variant="secondary" className={`text-[10px] ${STATUS_TONE[p.status] ?? ""}`}>
                {statusLabel(p.status)}
              </Badge>
            )}
          </div>
          {(budget > 0 || spent > 0) && (
            <div className="space-y-1">
              <BudgetBar budget={budget} spent={spent} />
              <p className="text-[10px] text-muted-foreground">
                {fmtValue(spent, "bdt")} / {fmtValue(budget, "bdt")}
              </p>
            </div>
          )}
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>
              {list.length === 0 ? (
                <span className="text-amber-600 dark:text-amber-400">No creator assigned</span>
              ) : (
                `${list.length} assignment${list.length > 1 ? "s" : ""}`
              )}
            </span>
            {p.status === "live" && Number(p.views || 0) > 0 && (
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3 w-3" /> {Number(p.views).toLocaleString("en-BD")}
              </span>
            )}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 px-3 py-4 md:px-6">
      <HubPageHeader
        icon={Clapperboard}
        title="Creative Desk"
        subtitle="Brief → shoot → edit → schedule → live: প্রতিটা content-এর production, creator, budget আর result একসাথে"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCreator(emptyCreator());
                setCreatorOpen(true);
              }}
            >
              <Users className="mr-1.5 h-4 w-4" /> Add creator
            </Button>
            <Button size="sm" onClick={openNewPlan}>
              <Plus className="mr-1.5 h-4 w-4" /> New content
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label="In production"
          value={String(stats.production)}
          hint={`${stats.unassigned} unassigned`}
          accent="primary"
          active={quick === "none" && statusFilter === "all"}
          onClick={() => {
            setQuick("none");
            setStatusFilter("all");
          }}
        />
        <KpiTile
          label="Due ≤ 7 days"
          value={String(stats.due)}
          accent="amber"
          active={quick === "due"}
          onClick={() => setQuick(quick === "due" ? "none" : "due")}
        />
        <KpiTile
          label="Overdue"
          value={String(stats.overdue)}
          accent="destructive"
          active={quick === "overdue"}
          onClick={() => setQuick(quick === "overdue" ? "none" : "overdue")}
        />
        <KpiTile
          label="Live"
          value={String(stats.live)}
          hint={`${stats.views.toLocaleString("en-BD")} views`}
          accent="emerald"
          active={quick === "live"}
          onClick={() => setQuick(quick === "live" ? "none" : "live")}
        />
        <KpiTile
          label="Budget"
          value={fmtValue(stats.budget, "bdt")}
          hint={`Spent ${fmtValue(stats.spent, "bdt")}`}
          accent="muted"
        />
        <KpiTile
          label="Attributed orders"
          value={String(stats.orders)}
          hint="live content থেকে"
          accent="muted"
        />
      </div>

      {/* Toolbar */}
      <div className="sticky top-[52px] z-20 rounded-xl border bg-background/85 p-2 shadow-sm backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Title, hook, brief, product…"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <div className="hidden flex-wrap items-center gap-2 md:flex">{filterSelects}</div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 px-2 md:hidden">
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl p-4">
              <SheetHeader className="p-0 pb-3">
                <SheetTitle className="text-sm">Filters</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-2 gap-2 [&_button]:w-full">{filterSelects}</div>
            </SheetContent>
          </Sheet>
          <div className="inline-flex items-center rounded-md border bg-background p-0.5">
            {(
              [
                { k: "board", icon: LayoutGrid, label: "Board" },
                { k: "list", icon: ListIcon, label: "List" },
                { k: "calendar", icon: CalendarDays, label: "Calendar" },
                { k: "creators", icon: Users, label: "Creators" },
              ] as const
            ).map((v) => {
              const Icon = v.icon;
              return (
                <button
                  key={v.k}
                  type="button"
                  onClick={() => setView(v.k)}
                  className={`inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium transition ${
                    view === v.k
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">{v.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        {(view === "list" || view === "board") && (
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 md:flex-wrap">
            {[{ key: "all", label: "All stages" }, ...CONTENT_STATUSES].map((s) => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  statusFilter === s.key
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {s.key !== "all" && (
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[s.key] ?? ""}`} />
                )}
                {s.label}
                <span className="opacity-60">
                  {s.key === "all"
                    ? plans.length
                    : plans.filter((p) => p.status === s.key).length}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : view === "board" ? (
        <div className="flex snap-x gap-3 overflow-x-auto pb-2">
          {BOARD_STAGES.map((s) => {
            const items = filtered.filter((p) => p.status === s.key);
            return (
              <div key={s.key} className="w-[250px] shrink-0 snap-start space-y-2 sm:w-[280px]">
                <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-2.5 py-1.5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                    <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s.key] ?? ""}`} />
                    {s.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((p) => (
                    <div key={p.id} className="space-y-1">
                      <PlanCard p={p} />
                      <div className="flex items-center justify-between px-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={s.key === BOARD_STAGES[0].key}
                          onClick={() =>
                            patchPlan.mutate({
                              id: p.id,
                              patch: { status: nextStage(p.status, -1) },
                            })
                          }
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={s.key === BOARD_STAGES[BOARD_STAGES.length - 1].key}
                          onClick={() =>
                            patchPlan.mutate({
                              id: p.id,
                              patch: {
                                status: nextStage(p.status, 1),
                                ...(nextStage(p.status, 1) === "live"
                                  ? { published_at: todayISO() }
                                  : {}),
                              },
                            })
                          }
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div className="rounded-lg border border-dashed p-4 text-center text-[11px] text-muted-foreground">
                      খালি
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : view === "list" ? (
        filtered.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              কোনো content নেই — "New content" দিয়ে শুরু করো।
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => (
              <PlanCard key={p.id} p={p} compact />
            ))}
          </div>
        )
      ) : view === "calendar" ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-display text-sm font-semibold">
              {month.toLocaleString("en-US", { month: "long", year: "numeric" })}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-7" onClick={() => setMonth(new Date())}>
                Today
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <MonthGrid
            month={month}
            items={filtered}
            dateOf={(p) => p.launch_date ?? p.deadline}
            render={(p) => (
              <button
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={`w-full truncate rounded px-1.5 py-1 text-left text-[10px] ${
                  STATUS_TONE[p.status] ?? "bg-muted"
                }`}
                title={p.title}
              >
                {p.title}
              </button>
            )}
          />
        </div>
      ) : (
        <CreatorRoster
          creators={creators}
          statsMap={creatorStats}
          onEdit={(c) => {
            setCreator({
              id: c.id,
              name: c.name,
              handle: c.handle ?? "",
              platform: c.platform,
              followers: c.followers ? String(c.followers) : "",
              niche: c.niche ?? "",
              rate: c.rate ? String(c.rate) : "",
              rating: c.rating != null ? String(c.rating) : "",
              contact: c.contact ?? "",
              profile_url: c.profile_url ?? "",
              performance_note: c.performance_note ?? "",
              status: c.status,
            });
            setCreatorOpen(true);
          }}
          onDelete={(id) => removeCreator.mutate(id)}
        />
      )}

      {/* Detail sheet */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-xl">
          {selected && (
            <div>
              <SheetHeader className="space-y-2 border-b bg-muted/30 p-4">
                <SheetTitle className="pr-6 text-base leading-snug">{selected.title}</SheetTitle>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className={STATUS_TONE[selected.status] ?? ""}>
                    {statusLabel(selected.status)}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className={PRIORITY_TONE[selected.priority ?? "normal"] ?? ""}
                  >
                    {priorityLabel(selected.priority ?? "normal")}
                  </Badge>
                  <Badge variant="outline">
                    {ASSET_TYPES.find((a) => a.key === selected.asset_type)?.label ??
                      selected.asset_type}
                  </Badge>
                  <Badge variant="outline">
                    {CONTENT_PLATFORMS.find((c) => c.key === selected.platform)?.label ??
                      selected.platform}
                  </Badge>
                  <DueChip date={selected.deadline} done={selected.status === "live"} />
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <Select
                    value={selected.status}
                    onValueChange={(v) =>
                      patchPlan.mutate({
                        id: selected.id,
                        patch: { status: v, ...(v === "live" ? { published_at: todayISO() } : {}) },
                      })
                    }
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
                  <Select
                    value={selected.priority ?? "normal"}
                    onValueChange={(v) => patchPlan.mutate({ id: selected.id, patch: { priority: v } })}
                  >
                    <SelectTrigger className="h-8 w-[110px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTENT_PRIORITIES.map((p) => (
                        <SelectItem key={p.key} value={p.key}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" className="h-8" onClick={() => copyBrief(selected)}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy brief
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Edit"
                    onClick={() => openEditPlan(selected)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Clone"
                    onClick={() => clonePlan.mutate(selected)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => removePlan.mutate(selected.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </SheetHeader>

              <Tabs defaultValue="overview" className="p-3 sm:p-4">
                <TabsList className="w-full">
                  <TabsTrigger value="overview" className="flex-1 text-xs">
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="script" className="flex-1 text-xs">
                    Script
                  </TabsTrigger>
                  <TabsTrigger value="production" className="flex-1 text-xs">
                    Crew ({(asgByPlan.get(selected.id) ?? []).length})
                  </TabsTrigger>
                  <TabsTrigger value="results" className="flex-1 text-xs">
                    Results
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-3 pt-3">
                  <ProductBlock
                    product={selected.product_id ? productById.get(selected.product_id) : undefined}
                  />
                  {(selected.video_url ||
                    (selected.product_id
                      ? productById.get(selected.product_id)?.video_url
                      : null)) && (
                    <Field label="Video">
                      <div className="space-y-1.5">
                        <VideoEmbed
                          url={
                            selected.video_url ||
                            productById.get(selected.product_id ?? "")?.video_url ||
                            ""
                          }
                          title={selected.title}
                        />
                        <a
                          href={
                            selected.video_url ||
                            productById.get(selected.product_id ?? "")?.video_url ||
                            "#"
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                        >
                          Open <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </Field>
                  )}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-xl border p-3 text-xs">
                    <div>
                      <p className="text-muted-foreground">Hook / angle</p>
                      <p className="font-medium">{selected.angle || "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Launch date</p>
                      <p className="font-medium">{selected.launch_date || "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Deadline</p>
                      <p className="font-medium">{selected.deadline || "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Budget / spent</p>
                      <p className="font-medium">
                        {fmtValue(spendByPlan.get(selected.id) ?? 0, "bdt")} /{" "}
                        {fmtValue(Number(selected.budget || 0), "bdt")}
                      </p>
                    </div>
                  </div>
                  {selected.brief && (
                    <Field label="Brief">
                      <p className="whitespace-pre-wrap rounded-xl border bg-muted/30 p-3 text-xs">
                        {selected.brief}
                      </p>
                    </Field>
                  )}
                  {(selected.reference_urls ?? []).length > 0 && (
                    <Field label="References">
                      <div className="space-y-1">
                        {(selected.reference_urls ?? []).map((u) => (
                          <a
                            key={u}
                            href={u}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 truncate text-xs text-primary hover:underline"
                          >
                            <Link2 className="h-3 w-3 shrink-0" /> {u}
                          </a>
                        ))}
                      </div>
                    </Field>
                  )}
                  {selected.notes && (
                    <Field label="Notes">
                      <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                        {selected.notes}
                      </p>
                    </Field>
                  )}
                </TabsContent>

                <TabsContent value="script" className="pt-3">
                  <ScriptStudio
                    key={selected.id}
                    plan={selected}
                    saving={patchPlan.isPending}
                    onSave={(patch) => patchPlan.mutate({ id: selected.id, patch })}
                    onCopy={() => copyBrief(selected)}
                  />
                </TabsContent>

                <TabsContent value="production" className="space-y-2 pt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Creator assignments</p>
                    <Button size="sm" className="h-7 text-xs" onClick={() => openNewAsg(selected.id)}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Assign
                    </Button>
                  </div>
                  {(asgByPlan.get(selected.id) ?? []).length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                      এখনো কেউ assign করা হয়নি।
                    </div>
                  ) : (
                    (asgByPlan.get(selected.id) ?? []).map((a) => (
                      <div key={a.id} className="space-y-2 rounded-lg border p-2.5 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium">
                              {a.creator_id
                                ? (creatorById.get(a.creator_id)?.name ?? "Creator")
                                : "In-house"}
                            </p>
                            <p className="text-muted-foreground">
                              {a.deliverable || "No deliverable set"}
                            </p>
                          </div>
                          <DueChip date={a.deadline} done={a.status === "posted"} />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Select
                            value={a.status}
                            onValueChange={(v) => patchAsg.mutate({ id: a.id, patch: { status: v } })}
                          >
                            <SelectTrigger className="h-7 w-[120px] text-[11px]">
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
                          <div className="ml-auto flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Marketing expense-এ post করো"
                              onClick={() => postExpense.mutate({ a, p: selected })}
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
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="results" className="pt-3">
                  <ResultsForm
                    plan={selected}
                    onSave={(patch) => patchPlan.mutate({ id: selected.id, patch })}
                    saving={patchPlan.isPending}
                  />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Plan dialog */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{plan.id ? "Edit content" : "New content"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input value={plan.title} onChange={(e) => setPlan({ ...plan, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
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
              <div>
                <Label>Priority</Label>
                <Select value={plan.priority} onValueChange={(v) => setPlan({ ...plan, priority: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTENT_PRIORITIES.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
            <div className="grid grid-cols-4 gap-3">
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
              <div>
                <Label>Stage</Label>
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
            </div>
            <div>
              <Label>Brief (creator কী করবে)</Label>
              <Textarea rows={3} value={plan.brief} onChange={(e) => setPlan({ ...plan, brief: e.target.value })} />
            </div>
            <div>
              <Label>Script</Label>
              <Textarea rows={3} value={plan.script} onChange={(e) => setPlan({ ...plan, script: e.target.value })} />
            </div>
            <div>
              <Label>Caption</Label>
              <Textarea rows={2} value={plan.caption} onChange={(e) => setPlan({ ...plan, caption: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>CTA</Label>
                <Input value={plan.cta} onChange={(e) => setPlan({ ...plan, cta: e.target.value })} />
              </div>
              <div>
                <Label>Hashtags</Label>
                <Input value={plan.hashtags} onChange={(e) => setPlan({ ...plan, hashtags: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Reference links (এক লাইনে একটা)</Label>
            </div>
            <div>
              <Label>Video link</Label>
              <Input
                value={plan.video_url}
                placeholder="https://youtube.com/… / tiktok / facebook / .mp4"
                onChange={(e) => setPlan({ ...plan, video_url: e.target.value })}
              />
            </div>
            <div>
              <Textarea
                rows={2}
                value={plan.reference_urls}
                onChange={(e) => setPlan({ ...plan, reference_urls: e.target.value })}
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={plan.notes} onChange={(e) => setPlan({ ...plan, notes: e.target.value })} />
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
                <Input value={creator.handle} onChange={(e) => setCreator({ ...creator, handle: e.target.value })} />
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
                <Label>Rating (1-5)</Label>
                <Input
                  inputMode="decimal"
                  value={creator.rating}
                  onChange={(e) => setCreator({ ...creator, rating: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Niche</Label>
                <Input value={creator.niche} onChange={(e) => setCreator({ ...creator, niche: e.target.value })} />
              </div>
              <div>
                <Label>Rate (৳)</Label>
                <Input
                  inputMode="numeric"
                  value={creator.rate}
                  onChange={(e) => setCreator({ ...creator, rate: e.target.value })}
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
                    <SelectItem value="blacklist">Blacklist</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Contact</Label>
                <Input value={creator.contact} onChange={(e) => setCreator({ ...creator, contact: e.target.value })} />
              </div>
              <div>
                <Label>Profile URL</Label>
                <Input
                  value={creator.profile_url}
                  onChange={(e) => setCreator({ ...creator, profile_url: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Performance note</Label>
              <Textarea
                rows={2}
                value={creator.performance_note}
                onChange={(e) => setCreator({ ...creator, performance_note: e.target.value })}
              />
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
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{asg.id ? "Edit assignment" : "Assign creator"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Creator</Label>
              <Select
                value={asg.creator_id}
                onValueChange={(v) => {
                  const c = creatorById.get(v);
                  setAsg({
                    ...asg,
                    creator_id: v,
                    agreed_budget: asg.agreed_budget || (c?.rate ? String(c.rate) : ""),
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">In-house</SelectItem>
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
              <Input value={asg.deliverable} onChange={(e) => setAsg({ ...asg, deliverable: e.target.value })} />
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
            <div className="grid grid-cols-2 gap-3">
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
                <Label>Result URL</Label>
                <Input value={asg.result_url} onChange={(e) => setAsg({ ...asg, result_url: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={asg.notes} onChange={(e) => setAsg({ ...asg, notes: e.target.value })} />
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

/* ---------------- Results tab form ---------------- */

function ProductBlock({ product }: { product?: HubProductOption }) {
  if (!product)
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
        <Package className="h-4 w-4" /> কোনো product link করা নেই — Edit করে product select করো।
      </div>
    );
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-3">
      {product.image ? (
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          className="h-14 w-14 shrink-0 rounded-lg border object-cover"
        />
      ) : (
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground">
          <ImageOff className="h-4 w-4 opacity-60" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{product.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {product.sku ? `SKU ${product.sku}` : "No SKU"}
          {product.price != null ? ` • ${fmtValue(product.price, "bdt")}` : ""}
          {product.stock != null ? ` • Stock ${product.stock}` : ""}
        </p>
      </div>
    </div>
  );
}

/* ---------------- Script studio ---------------- */

function ScriptStudio({
  plan,
  onSave,
  saving,
  onCopy,
}: {
  plan: HubContentPlan;
  onSave: (patch: Record<string, unknown>) => void;
  saving: boolean;
  onCopy: () => void;
}) {
  const [angle, setAngle] = useState(plan.angle ?? "");
  const [script, setScript] = useState(plan.script ?? "");
  const [caption, setCaption] = useState(plan.caption ?? "");
  const [cta, setCta] = useState(plan.cta ?? "");
  const [tags, setTags] = useState(plan.hashtags ?? "");
  const [video, setVideo] = useState(plan.video_url ?? "");

  const dirty =
    angle !== (plan.angle ?? "") ||
    script !== (plan.script ?? "") ||
    caption !== (plan.caption ?? "") ||
    cta !== (plan.cta ?? "") ||
    tags !== (plan.hashtags ?? "") ||
    video !== (plan.video_url ?? "");

  const words = script.trim() ? script.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span>{words} words</span>
        <span>• ~{Math.max(1, Math.round((words / 140) * 60))}s read</span>
        {plan.script_updated_at && (
          <span>• last edit {plan.script_updated_at.slice(0, 10)}</span>
        )}
        <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={onCopy}>
          <Copy className="mr-1 h-3.5 w-3.5" /> Copy brief
        </Button>
      </div>

      <Field label="Hook / angle">
        <Input value={angle} onChange={(e) => setAngle(e.target.value)} className="h-9 text-sm" />
      </Field>
      <Field label="Script">
        <Textarea
          rows={12}
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder={"Hook…\nProblem…\nProduct demo…\nOffer + CTA…"}
          className="text-sm leading-relaxed"
        />
      </Field>
      <Field label="Caption">
        <Textarea
          rows={3}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="text-sm"
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="CTA">
          <Input value={cta} onChange={(e) => setCta(e.target.value)} className="h-9 text-sm" />
        </Field>
        <Field label="Hashtags">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} className="h-9 text-sm" />
        </Field>
      </div>
      <Field label="Video link (YouTube / TikTok / Facebook / MP4)">
        <Input
          value={video}
          onChange={(e) => setVideo(e.target.value)}
          placeholder="https://…"
          className="h-9 text-sm"
        />
      </Field>
      {video.trim() && <VideoEmbed url={video.trim()} title={plan.title} />}

      <div className="sticky bottom-0 -mx-3 flex items-center gap-2 border-t bg-background/95 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4">
        <Button
          size="sm"
          disabled={saving || !dirty}
          onClick={() =>
            onSave({
              angle: angle.trim() || null,
              script: script.trim() || null,
              caption: caption.trim() || null,
              cta: cta.trim() || null,
              hashtags: tags.trim() || null,
              video_url: video.trim() || null,
              script_updated_at: new Date().toISOString(),
            })
          }
        >
          <Save className="mr-1.5 h-3.5 w-3.5" /> Save script
        </Button>
        {dirty && <span className="text-[11px] text-amber-600 dark:text-amber-400">Unsaved</span>}
      </div>
    </div>
  );
}

function ResultsForm({
  plan,
  onSave,
  saving,
}: {
  plan: HubContentPlan;
  onSave: (patch: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const [views, setViews] = useState(String(plan.views ?? 0));
  const [eng, setEng] = useState(String(plan.engagements ?? 0));
  const [orders, setOrders] = useState(String(plan.attributed_orders ?? 0));
  const [url, setUrl] = useState(plan.published_url ?? "");
  const [date, setDate] = useState(plan.published_at ?? "");

  const engRate = Number(views) > 0 ? (Number(eng) / Number(views)) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: Eye, label: "Views", value: Number(views).toLocaleString("en-BD") },
          { icon: Heart, label: "Engagements", value: Number(eng).toLocaleString("en-BD") },
          { icon: ShoppingCart, label: "Orders", value: Number(orders).toLocaleString("en-BD") },
        ].map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="rounded-lg border p-2.5">
              <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Icon className="h-3 w-3" /> {m.label}
              </p>
              <p className="font-display text-base font-bold">{m.value}</p>
            </div>
          );
        })}
      </div>
      <p className="inline-flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" /> Engagement rate {engRate.toFixed(2)}%
      </p>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Views</Label>
          <Input inputMode="numeric" value={views} onChange={(e) => setViews(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Engagements</Label>
          <Input inputMode="numeric" value={eng} onChange={(e) => setEng(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Attributed orders</Label>
          <Input inputMode="numeric" value={orders} onChange={(e) => setOrders(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Published URL</Label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Published date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={saving}
          onClick={() =>
            onSave({
              views: Number(views || 0),
              engagements: Number(eng || 0),
              attributed_orders: Number(orders || 0),
              published_url: url.trim() || null,
              published_at: date || null,
            })
          }
        >
          Save results
        </Button>
        {plan.published_url && (
          <a
            href={plan.published_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Open post <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

/* ---------------- Creator roster ---------------- */

function CreatorRoster({
  creators,
  statsMap,
  onEdit,
  onDelete,
}: {
  creators: HubCreator[];
  statsMap: Map<string, { jobs: number; delivered: number; spend: number; live: number }>;
  onEdit: (c: HubCreator) => void;
  onDelete: (id: string) => void;
}) {
  if (creators.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          কোনো creator/reviewer যোগ করা হয়নি।
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {creators.map((c) => {
        const s = statsMap.get(c.id) ?? { jobs: 0, delivered: 0, spend: 0, live: 0 };
        const rate = s.jobs > 0 ? Math.round((s.delivered / s.jobs) * 100) : 0;
        return (
          <Card key={c.id} className="transition-all hover:-translate-y-0.5 hover:shadow-md">
            <CardContent className="space-y-2.5 p-4">
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
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(c)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => onDelete(c.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-2 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground">Jobs</p>
                  <p className="text-sm font-semibold">{s.jobs}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Delivered</p>
                  <p className="text-sm font-semibold">{rate}%</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Paid</p>
                  <p className="text-sm font-semibold">{fmtValue(s.spend, "bdt")}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {c.niche && <Badge variant="outline">{c.niche}</Badge>}
                <Badge variant="secondary">Rate {fmtValue(Number(c.rate || 0), "bdt")}</Badge>
                {c.rating != null && <Badge variant="outline">★ {Number(c.rating).toFixed(1)}</Badge>}
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
        );
      })}
    </div>
  );
}