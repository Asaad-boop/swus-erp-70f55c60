import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  PackageSearch,
  Plus,
  ExternalLink,
  Target,
  CheckCircle2,
  ShoppingCart,
  Wallet,
  Factory,
  Loader2,
  AlertTriangle,
  Keyboard,
} from "lucide-react";
import { MoreHorizontal, Truck, XCircle, Trash2, RotateCcw, Archive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { useAccounts } from "@/hooks/erp/use-finance-query";
import { Switch } from "@/components/ui/switch";
import {
  createImportPo,
  listImportSuppliers,
  listCargoAgents,
  setPoCargoAgent,
} from "@/lib/erp/imports/imports.functions";
import { newIdemKey } from "@/lib/erp/imports/types";
import { GrowthPageHeader } from "@/components/erp/growth/growth-shell";
import { IdeaGallery, StarRating } from "@/components/erp/hub/idea-visuals";
import {
  deriveStage,
  StageBadge,
  StageFilterBar,
  SourcingTimeline,
  StageKpi,
  STAGE_ORDER,
  STAGE_META,
  type SourcingStage,
} from "@/components/erp/hub/sourcing-track";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  fetchIdeaSummaries,
  fetchIdeas,
  fetchSourcingQuotes,
  fmtValue,
  quoteLandedCost,
  type HubIdea,
  type HubSourcingQuote,
} from "@/lib/erp/hub/hub-data";
import { QuoteCompareTable } from "@/components/erp/hub/sourcing-quote-table";
import { ApprovalCard, type ReviewStatus } from "@/components/erp/hub/sourcing-approval";
import { useCurrentRole } from "@/hooks/use-current-role";
import { SourcingActivity } from "@/components/erp/hub/sourcing-activity";
import {
  FollowupCard,
  PRIORITY_TONE,
  isFollowupDue,
} from "@/components/erp/hub/sourcing-followup";
import {
  fetchSourcingEvents,
  logSourcingEvent,
  stageDates,
} from "@/lib/erp/hub/sourcing-events";

export const Route = createFileRoute("/_authenticated/erp/growth/sourcing")({
  head: () => ({
    meta: [
      { title: "Sourcing Desk — Growth Studio" },
      {
        name: "description",
        content:
          "Approved product ideas এর supplier quote collect করো, target price এর সাথে compare করো আর order place করো।",
      },
      { property: "og:title", content: "Sourcing Desk — Growth Studio" },
      {
        property: "og:description",
        content: "Supplier quotes, landed cost comparison and order placement for approved ideas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SourcingPage,
});

const SOURCING_STATUSES = ["approved", "sourcing", "ordered"] as const;

type QDraft = {
  id?: string;
  supplier_name: string;
  supplier_url: string;
  contact: string;
  platform: string;
  unit_price_cny: string;
  cny_rate: string;
  moq: string;
  lead_time_days: string;
  shipping_mode: string;
  shipping_cost_per_unit: string;
  sample_status: string;
  sample_cost: string;
  sample_tracking: string;
  sample_received_at: string;
  quality_rating: string;
  notes: string;
};

const SAMPLE_STAGES = [
  "none",
  "requested",
  "paid",
  "shipped",
  "received",
  "approved",
  "rejected",
] as const;

const detectPlatform = (url: string) => {
  const u = url.toLowerCase();
  if (u.includes("1688.")) return "1688";
  if (u.includes("alibaba.")) return "Alibaba";
  if (u.includes("taobao.") || u.includes("tmall.")) return "Taobao";
  return null;
};

const emptyQuote = (fx = "17"): QDraft => ({
  supplier_name: "",
  supplier_url: "",
  contact: "",
  platform: "1688",
  unit_price_cny: "",
  cny_rate: fx,
  moq: "",
  lead_time_days: "",
  shipping_mode: "air",
  shipping_cost_per_unit: "",
  sample_status: "none",
  sample_cost: "",
  sample_tracking: "",
  sample_received_at: "",
  quality_rating: "",
  notes: "",
});

const FX_KEY = "hub.sourcing.lastFx";
const STUCK_DAYS = 7;

function SourcingPage() {
  const { brandIds, activeBrand, isLoading: brandLoading } = useBrand();
  const { isAdmin } = useCurrentRole();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qOpen, setQOpen] = useState(false);
  const [qDraft, setQDraft] = useState<QDraft>(emptyQuote());
  const [lastFx, setLastFx] = useState("17");
  const [addAnother, setAddAnother] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderQty, setOrderQty] = useState("");
  const [orderPrice, setOrderPrice] = useState("");
  // PO fields
  const [poUnitCny, setPoUnitCny] = useState("");
  const [poFx, setPoFx] = useState("17");
  const [poSupplierId, setPoSupplierId] = useState<string>("");
  const [poSupplierName, setPoSupplierName] = useState("");
  const [poSupplierUrl, setPoSupplierUrl] = useState("");
  const [poAgentId, setPoAgentId] = useState<string>("");
  const [poNotes, setPoNotes] = useState("");
  const [payEnabled, setPayEnabled] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payWalletId, setPayWalletId] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payRef, setPayRef] = useState("");
  const [tMin, setTMin] = useState("");
  const [tMax, setTMax] = useState("");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<SourcingStage | "all">("all");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<
    { idea: HubIdea; mode: "cancel" | "delete" } | null
  >(null);
  const [removeReason, setRemoveReason] = useState("");
  const [sortBy, setSortBy] = useState<"stage" | "age" | "due" | "quotes" | "cost">("stage");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const v = typeof window !== "undefined" ? window.localStorage.getItem(FX_KEY) : null;
    if (v) setLastFx(v);
  }, []);

  const ideasQ = useQuery({
    queryKey: ["hub-ideas", brandIds],
    queryFn: () => fetchIdeas(brandIds),
    enabled: brandIds.length > 0,
  });
  const sumQ = useQuery({
    queryKey: ["hub-idea-summary", brandIds],
    queryFn: () => fetchIdeaSummaries(brandIds),
    enabled: brandIds.length > 0,
  });

  const pipeline = useMemo(
    () =>
      (ideasQ.data ?? []).filter((i) =>
        (SOURCING_STATUSES as readonly string[]).includes(i.status),
      ),
    [ideasQ.data],
  );

  const quotesQ = useQuery({
    queryKey: ["hub-quotes", pipeline.map((i) => i.id)],
    queryFn: () => fetchSourcingQuotes(pipeline.map((i) => i.id)),
    enabled: pipeline.length > 0,
  });

  /** Cancelled / archived sourcing items (kept out of the live pipeline). */
  const cancelled = useMemo(
    () => (ideasQ.data ?? []).filter((i) => i.status === "rejected"),
    [ideasQ.data],
  );

  // Keep the selection valid: pick the first row when nothing is selected, and
  // drop a stale selection after an item is cancelled or deleted.
  useEffect(() => {
    if (pipeline.length === 0) {
      if (selectedId) setSelectedId(null);
      return;
    }
    if (!selectedId || !pipeline.some((i) => i.id === selectedId)) {
      setSelectedId(pipeline[0]!.id);
    }
  }, [pipeline, selectedId]);

  // Live PO status for every ordered idea (for stage tracking).
  const pipelinePoIds = useMemo(
    () => pipeline.map((i) => i.imp_po_id).filter(Boolean) as string[],
    [pipeline],
  );
  const posQ = useQuery({
    queryKey: ["hub-sourcing-pos", pipelinePoIds],
    enabled: pipelinePoIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("imp_purchase_orders")
        .select("id,po_number,status,paid_bdt,due_bdt,grand_total_bdt")
        .in("id", pipelinePoIds);
      if (error) throw error;
      const m = new Map<string, { id: string; po_number: string; status: string; paid_bdt: number; due_bdt: number; grand_total_bdt: number }>();
      for (const r of (data ?? []) as never[]) m.set((r as { id: string }).id, r as never);
      return m;
    },
  });

  const stageOf = useMemo(() => {
    const m = new Map<string, SourcingStage>();
    for (const i of pipeline) {
      const po = i.imp_po_id ? posQ.data?.get(i.imp_po_id) : undefined;
      m.set(
        i.id,
        deriveStage({
          status: i.status,
          quoteCount: quotesQ.data?.get(i.id)?.length ?? 0,
          selectedQuoteId: i.selected_quote_id,
          impPoId: i.imp_po_id,
          poStatus: po?.status ?? null,
          reviewStatus: i.sourcing_review_status ?? "draft",
        }),
      );
    }
    return m;
  }, [pipeline, posQ.data, quotesQ.data]);

  const stageCounts = useMemo(() => {
    const c = { all: pipeline.length } as Record<SourcingStage, number> & { all: number };
    for (const s of STAGE_ORDER) c[s] = 0;
    for (const i of pipeline) c[stageOf.get(i.id) ?? "to_source"]++;
    return c;
  }, [pipeline, stageOf]);

  const ageDaysOf = useCallback(
    (i: HubIdea) =>
      Math.max(
        0,
        Math.round((Date.now() - new Date(i.approved_at ?? i.created_at).getTime()) / 86400000),
      ),
    [],
  );

  /** Needs attention = overdue follow-up, urgent priority, or stuck pre-order for too long. */
  const attentionSet = useMemo(() => {
    const s = new Set<string>();
    for (const i of pipeline) {
      const st = stageOf.get(i.id) ?? "to_source";
      const stuck =
        (st === "to_source" || st === "sourcing" || st === "sourced") && ageDaysOf(i) >= STUCK_DAYS;
      if (isFollowupDue(i.next_action_at) || i.priority === "urgent" || stuck) s.add(i.id);
    }
    return s;
  }, [pipeline, stageOf, ageDaysOf]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = pipeline.filter((i) => {
      if (stageFilter !== "all" && (stageOf.get(i.id) ?? "to_source") !== stageFilter) return false;
      if (attentionOnly && !attentionSet.has(i.id)) return false;
      if (!term) return true;
      return (
        i.title.toLowerCase().includes(term) ||
        (i.category ?? "").toLowerCase().includes(term) ||
        (i.supplier_name ?? "").toLowerCase().includes(term)
      );
    });
    const ageOf = (i: HubIdea) =>
      Date.now() - new Date(i.approved_at ?? i.created_at).getTime();
    const dueOf = (i: HubIdea) =>
      i.imp_po_id ? Number(posQ.data?.get(i.imp_po_id)?.due_bdt ?? 0) : 0;
    const sorted = [...rows];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "age":
          return ageOf(b) - ageOf(a);
        case "due":
          return dueOf(b) - dueOf(a);
        case "quotes":
          return (quotesQ.data?.get(b.id)?.length ?? 0) - (quotesQ.data?.get(a.id)?.length ?? 0);
        case "cost":
          return (a.est_unit_cost || Infinity) - (b.est_unit_cost || Infinity);
        default:
          return (
            STAGE_ORDER.indexOf(stageOf.get(a.id) ?? "to_source") -
            STAGE_ORDER.indexOf(stageOf.get(b.id) ?? "to_source")
          );
      }
    });
    return sorted;
  }, [pipeline, stageFilter, stageOf, search, sortBy, posQ.data, quotesQ.data, attentionOnly, attentionSet]);

  const dueTotal = useMemo(() => {
    let t = 0;
    posQ.data?.forEach((p) => { t += Number(p.due_bdt ?? 0); });
    return t;
  }, [posQ.data]);

  const selected: HubIdea | null = useMemo(
    () => pipeline.find((i) => i.id === selectedId) ?? null,
    [pipeline, selectedId],
  );

  useEffect(() => {
    setTMin(selected?.target_price_min != null ? String(selected.target_price_min) : "");
    setTMax(selected?.target_price_max != null ? String(selected.target_price_max) : "");
  }, [selected?.id, selected?.target_price_min, selected?.target_price_max]);

  const quotes = (selectedId && quotesQ.data?.get(selectedId)) || [];

  const poBrandId = selected?.brand_id ?? activeBrand?.id ?? brandIds[0] ?? null;
  const suppliersFn = useServerFn(listImportSuppliers);
  const createPoFn = useServerFn(createImportPo);
  const agentsFn = useServerFn(listCargoAgents);
  const setAgentFn = useServerFn(setPoCargoAgent);
  const suppliersQ = useQuery({
    queryKey: ["imp-suppliers", poBrandId],
    enabled: !!poBrandId && orderOpen,
    queryFn: () => suppliersFn({ data: { brandId: poBrandId! } }),
  });
  const agentsQ = useQuery({
    queryKey: ["imp-cargo-agents", poBrandId],
    enabled: !!poBrandId && orderOpen,
    queryFn: () => agentsFn({ data: { brandId: poBrandId!, activeOnly: true } }),
  });
  const { data: wallets = [] } = useAccounts(poBrandId ? [poBrandId] : []);

  const linkedPoQ = useQuery({
    queryKey: ["hub-idea-po", selected?.imp_po_id],
    enabled: !!selected?.imp_po_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("imp_purchase_orders")
        .select(
          "id,po_number,status,order_date,currency,fx_rate,grand_total_bdt,paid_bdt,due_bdt,total_units,landed_cost_per_unit_bdt",
        )
        .eq("id", selected!.imp_po_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["hub-ideas"] });
    qc.invalidateQueries({ queryKey: ["hub-idea-summary"] });
    qc.invalidateQueries({ queryKey: ["hub-quotes"] });
    qc.invalidateQueries({ queryKey: ["hub-sourcing-events"] });
  };

  const eventsQ = useQuery({
    queryKey: ["hub-sourcing-events", selectedId],
    enabled: !!selectedId,
    queryFn: () => fetchSourcingEvents(selectedId!),
  });
  const eventDates = useMemo(() => stageDates(eventsQ.data ?? []), [eventsQ.data]);

  const saveQuote = useMutation({
    mutationFn: async (d: QDraft) => {
      if (!selected) throw new Error("Select a product first");
      if (!d.supplier_name.trim()) throw new Error("Supplier name দিন");
      if (Number(d.unit_price_cny || 0) <= 0) throw new Error("Unit price (¥) দিন");
      if (Number(d.cny_rate || 0) <= 0) throw new Error("FX rate দিন");
      const { data: auth } = await supabase.auth.getUser();
      const row = {
        idea_id: selected.id,
        supplier_name: d.supplier_name.trim(),
        supplier_url: d.supplier_url.trim() || null,
        contact: d.contact.trim() || null,
        platform: d.platform,
        unit_price_cny: Number(d.unit_price_cny || 0),
        cny_rate: Number(d.cny_rate || 0),
        moq: d.moq ? Number(d.moq) : null,
        lead_time_days: d.lead_time_days ? Number(d.lead_time_days) : null,
        shipping_mode: d.shipping_mode,
        shipping_cost_per_unit: Number(d.shipping_cost_per_unit || 0),
        sample_status: d.sample_status,
        sample_cost: Number(d.sample_cost || 0),
        sample_tracking: d.sample_tracking.trim() || null,
        sample_received_at: d.sample_received_at || null,
        quality_rating: d.quality_rating ? Number(d.quality_rating) : null,
        notes: d.notes.trim() || null,
        created_by: auth.user?.id ?? null,
        updated_at: new Date().toISOString(),
      };
      const { error } = d.id
        ? await supabase.from("hub_sourcing_quotes").update(row as never).eq("id", d.id)
        : await supabase.from("hub_sourcing_quotes").insert(row as never);
      if (error) throw error;
      await logSourcingEvent({
        ideaId: selected.id,
        type: d.id ? "quote_updated" : "quote_added",
        quoteId: d.id ?? null,
        note: `${row.supplier_name} · ${fmtValue(
          Math.round(row.unit_price_cny * row.cny_rate + row.shipping_cost_per_unit),
          "bdt",
        )} landed`,
      });
      if (selected.status === "approved") {
        await supabase
          .from("hub_product_ideas")
          .update({ status: "sourcing" } as never)
          .eq("id", selected.id);
        await logSourcingEvent({
          ideaId: selected.id,
          type: "stage_change",
          fromStage: "to_source",
          toStage: "sourcing",
          note: "প্রথম quote যোগ হওয়ায় auto",
        });
      }
      if (typeof window !== "undefined") window.localStorage.setItem(FX_KEY, d.cny_rate);
      setLastFx(d.cny_rate);
    },
    onSuccess: () => {
      toast.success("Quote saved");
      if (addAnother) setQDraft(emptyQuote(lastFx));
      else setQOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeQuote = useMutation({
    mutationFn: async (q: HubSourcingQuote) => {
      const { error } = await supabase.from("hub_sourcing_quotes").delete().eq("id", q.id);
      if (error) throw error;
      await logSourcingEvent({
        ideaId: q.idea_id,
        type: "quote_removed",
        note: q.supplier_name,
      });
    },
    onSuccess: () => {
      toast.success("Quote removed");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const chooseQuote = useMutation({
    mutationFn: async (q: HubSourcingQuote) => {
      const { error } = await supabase
        .from("hub_sourcing_quotes")
        .update({ status: "selected" } as never)
        .eq("id", q.id);
      if (error) throw error;
      await supabase
        .from("hub_sourcing_quotes")
        .update({ status: "quoted" } as never)
        .eq("idea_id", q.idea_id)
        .neq("id", q.id)
        .eq("status", "selected");
      const { error: e2 } = await supabase
        .from("hub_product_ideas")
        .update({
          selected_quote_id: q.id,
          status: "sourcing",
          supplier_name: q.supplier_name,
          supplier_url: q.supplier_url,
          est_unit_cost: quoteLandedCost(q),
        } as never)
        .eq("id", q.idea_id);
      if (e2) throw e2;
      await logSourcingEvent({
        ideaId: q.idea_id,
        type: "supplier_selected",
        quoteId: q.id,
        note: `${q.supplier_name} · ${fmtValue(Math.round(quoteLandedCost(q)), "bdt")} landed`,
      });
    },
    onSuccess: () => {
      toast.success("Supplier selected");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveTarget = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const { error } = await supabase
        .from("hub_product_ideas")
        .update({
          target_price_min: tMin ? Number(tMin) : null,
          target_price_max: tMax ? Number(tMax) : null,
        } as never)
        .eq("id", selected.id);
      if (error) throw error;
      await logSourcingEvent({
        ideaId: selected.id,
        type: "target_updated",
        note: `${tMin || "—"} → ${tMax || "—"} ৳`,
      });
    },
    onSuccess: () => {
      toast.success("Target price saved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveFollowup = useMutation({
    mutationFn: async (v: {
      next_action_at: string | null;
      next_action_note: string | null;
      sourcing_owner: string | null;
      priority: string;
    }) => {
      if (!selected) return;
      const { error } = await supabase
        .from("hub_product_ideas")
        .update(v as never)
        .eq("id", selected.id);
      if (error) throw error;
      await logSourcingEvent({
        ideaId: selected.id,
        type: "followup_set",
        note: [
          v.next_action_at ? `due ${v.next_action_at}` : "no date",
          v.sourcing_owner ? `owner ${v.sourcing_owner}` : null,
          `priority ${v.priority}`,
          v.next_action_note,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    },
    onSuccess: () => {
      toast.success("Follow-up saved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reviewStatusOf = (i: HubIdea): ReviewStatus =>
    ((i.sourcing_review_status as ReviewStatus | undefined) ?? "draft");

  /** Staff submits the picked supplier + price for admin approval. */
  const submitForApproval = useMutation({
    mutationFn: async ({ idea, note }: { idea: HubIdea; note: string }) => {
      if (!idea.selected_quote_id) {
        throw new Error("আগে একটা supplier quote Select করুন");
      }
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("hub_product_ideas")
        .update({
          sourcing_review_status: "submitted",
          sourcing_submitted_at: new Date().toISOString(),
          sourcing_submitted_by: auth.user?.id ?? null,
          sourcing_review_note: note.trim() || null,
          sourcing_reviewed_at: null,
          sourcing_reviewed_by: null,
        } as never)
        .eq("id", idea.id);
      if (error) throw error;
      await logSourcingEvent({
        ideaId: idea.id,
        type: "stage_change",
        fromStage: "sourced",
        toStage: "submitted",
        note: note.trim() || "Submitted for approval",
      });
    },
    onSuccess: () => {
      toast.success("Admin approval-এর জন্য পাঠানো হয়েছে");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Admin approves or sends the sourcing back to the team. */
  const reviewDecision = useMutation({
    mutationFn: async ({
      idea,
      decision,
      note,
    }: {
      idea: HubIdea;
      decision: "approved" | "rejected";
      note: string;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("hub_product_ideas")
        .update({
          sourcing_review_status: decision,
          sourcing_reviewed_at: new Date().toISOString(),
          sourcing_reviewed_by: auth.user?.id ?? null,
          sourcing_review_note: note.trim() || null,
        } as never)
        .eq("id", idea.id);
      if (error) throw error;
      await logSourcingEvent({
        ideaId: idea.id,
        type: "stage_change",
        fromStage: "submitted",
        toStage: decision === "approved" ? "approved" : "sourced",
        note: `${decision === "approved" ? "Approved" : "Sent back"}${note.trim() ? ` — ${note.trim()}` : ""}`,
      });
    },
    onSuccess: (_d, v) => {
      toast.success(v.decision === "approved" ? "Approved ✅" : "ফেরত পাঠানো হয়েছে");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Manual stage change — pre-order stages write idea.status, post-order stages write PO status. */
  const changeStage = useMutation({
    mutationFn: async ({ idea, stage }: { idea: HubIdea; stage: SourcingStage }) => {
      const from = stageOf.get(idea.id) ?? "to_source";
      const poId = idea.imp_po_id ?? null;
      if (stage === "ordered" || stage === "in_transit" || stage === "received") {
        if (!poId) {
          throw new Error("আগে Place order দিয়ে PO তৈরি করুন");
        }
        const poStatus =
          stage === "ordered" ? "ordered" : "in_transit";
        if (stage === "received") {
          throw new Error("Received status warehouse receipt থেকে auto আসে");
        }
        const { error } = await supabase
          .from("imp_purchase_orders")
          .update({ status: poStatus } as never)
          .eq("id", poId);
        if (error) throw error;
        await logSourcingEvent({
          ideaId: idea.id,
          type: "stage_change",
          fromStage: from,
          toStage: stage,
        });
        return;
      }
      if (poId) throw new Error("PO তৈরি হয়ে গেছে — আগের stage-এ ফেরানো যাবে না");
      const patch: Record<string, unknown> = {
        status: stage === "to_source" ? "approved" : "sourcing",
      };
      if (stage === "to_source") patch.selected_quote_id = null;
      if (stage === "to_source" || stage === "sourcing" || stage === "sourced") {
        patch.sourcing_review_status = "draft";
        patch.sourcing_submitted_at = null;
        patch.sourcing_reviewed_at = null;
      }
      if (stage === "sourced" && !idea.selected_quote_id) {
        // Auto-pick the cheapest landed-cost quote so the user never gets stuck.
        const qs = (quotesQ.data?.get(idea.id) ?? []).filter((q) => q.status !== "rejected");
        if (qs.length === 0) {
          throw new Error("এই product-এ কোনো supplier quote নেই — আগে একটা quote add করুন");
        }
        const best = [...qs].sort((a, b) => quoteLandedCost(a) - quoteLandedCost(b))[0]!;
        await supabase
          .from("hub_sourcing_quotes")
          .update({ status: "selected" } as never)
          .eq("id", best.id);
        await supabase
          .from("hub_sourcing_quotes")
          .update({ status: "quoted" } as never)
          .eq("idea_id", idea.id)
          .neq("id", best.id)
          .eq("status", "selected");
        patch.selected_quote_id = best.id;
        patch.supplier_name = best.supplier_name;
        patch.supplier_url = best.supplier_url;
        patch.est_unit_cost = quoteLandedCost(best);
      }
      const { error } = await supabase
        .from("hub_product_ideas")
        .update(patch as never)
        .eq("id", idea.id);
      if (error) throw error;
      await logSourcingEvent({
        ideaId: idea.id,
        type: "stage_change",
        fromStage: from,
        toStage: stage,
        note: patch.supplier_name ? `auto supplier: ${patch.supplier_name}` : null,
      });
    },
    onSuccess: () => {
      toast.success("Status updated");
      invalidate();
      qc.invalidateQueries({ queryKey: ["hub-sourcing-pos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Cancel sourcing — keeps the row + history, just takes it out of the pipeline. */
  const cancelIdea = useMutation({
    mutationFn: async ({ idea, reason }: { idea: HubIdea; reason: string }) => {
      if (idea.imp_po_id) {
        throw new Error("PO তৈরি হয়ে গেছে — আগে PO cancel করুন");
      }
      const from = stageOf.get(idea.id) ?? "to_source";
      const { error } = await supabase
        .from("hub_product_ideas")
        .update({
          status: "rejected",
          next_action_at: null,
          next_action_note: reason.trim() || null,
        } as never)
        .eq("id", idea.id);
      if (error) throw error;
      await logSourcingEvent({
        ideaId: idea.id,
        type: "note",
        fromStage: from,
        note: `Sourcing cancelled${reason.trim() ? ` — ${reason.trim()}` : ""}`,
      });
    },
    onSuccess: () => {
      toast.success("Sourcing cancelled");
      setRemoveTarget(null);
      setRemoveReason("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Restore a cancelled item back into the pipeline. */
  const restoreIdea = useMutation({
    mutationFn: async (idea: HubIdea) => {
      const hasQuotes = (quotesQ.data?.get(idea.id)?.length ?? 0) > 0;
      const { error } = await supabase
        .from("hub_product_ideas")
        .update({ status: hasQuotes ? "sourcing" : "approved" } as never)
        .eq("id", idea.id);
      if (error) throw error;
      await logSourcingEvent({ ideaId: idea.id, type: "note", note: "Restored to sourcing" });
    },
    onSuccess: () => {
      toast.success("Pipeline-এ ফিরিয়ে আনা হয়েছে");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Hard delete — quotes and events cascade with the idea row. */
  const deleteIdea = useMutation({
    mutationFn: async (idea: HubIdea) => {
      if (idea.imp_po_id) {
        throw new Error("PO linked আছে — delete করা যাবে না, আগে PO cancel করুন");
      }
      const { error } = await supabase.from("hub_product_ideas").delete().eq("id", idea.id);
      if (error) throw error;
    },
    onSuccess: (_d, idea) => {
      toast.success(`"${idea.title}" মুছে ফেলা হয়েছে`);
      if (selectedId === idea.id) setSelectedId(null);
      setRemoveTarget(null);
      setRemoveReason("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const askRemove = (idea: HubIdea, mode: "cancel" | "delete") => {
    setRemoveReason("");
    setRemoveTarget({ idea, mode });
  };

  const StageMenu = ({ idea, align = "end" }: { idea: HubIdea; align?: "start" | "end" }) => {
    const cur = stageOf.get(idea.id) ?? "to_source";
    const hasPo = !!idea.imp_po_id;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={(e) => e.stopPropagation()}
            aria-label="Change status"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-52">
          <DropdownMenuLabel className="text-[11px]">Change status</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {STAGE_ORDER.filter((s) => s !== "submitted" && s !== "approved").map((s) => {
            const m = STAGE_META[s];
            const Icon = m.icon;
            const postOrder = s === "ordered" || s === "in_transit" || s === "received";
            const disabled =
              cur === s || s === "received" || (postOrder ? !hasPo : hasPo);
            return (
              <DropdownMenuItem
                key={s}
                disabled={disabled || changeStage.isPending}
                onSelect={(e) => {
                  e.preventDefault();
                  changeStage.mutate({ idea, stage: s });
                }}
                className="gap-2 text-xs"
              >
                <Icon className="h-3.5 w-3.5" />
                {m.label}
                {cur === s && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-emerald-500" />}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={hasPo || cancelIdea.isPending}
            onSelect={(e) => {
              e.preventDefault();
              askRemove(idea, "cancel");
            }}
            className="gap-2 text-xs text-amber-600 focus:text-amber-600"
          >
            <XCircle className="h-3.5 w-3.5" /> Cancel sourcing
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={hasPo || deleteIdea.isPending}
            onSelect={(e) => {
              e.preventDefault();
              askRemove(idea, "delete");
            }}
            className="gap-2 text-xs text-destructive focus:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete permanently
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const placeOrder = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      if (!poBrandId) throw new Error("Brand পাওয়া যায়নি");
      const qty = Number(orderQty || 0);
      const unitCny = Number(poUnitCny || 0);
      const fx = Number(poFx || 0);
      if (qty <= 0) throw new Error("Quantity দিন");
      if (fx <= 0) throw new Error("FX rate দিন");
      if (!poAgentId) throw new Error("Cargo agent select করুন");

      const supplier = poSupplierId
        ? { id: poSupplierId }
        : poSupplierName.trim()
          ? {
              name: poSupplierName.trim(),
              source_link: poSupplierUrl.trim() || undefined,
              supplier_type: "import" as const,
              currency: "CNY",
            }
          : undefined;

      const advance = Number(payAmount || 0);
      const res = (await createPoFn({
        data: {
          brand_id: poBrandId,
          order_date: new Date().toISOString().slice(0, 10),
          currency: "CNY",
          fx_rate: fx,
          notes:
            `Growth Hub sourcing — ${selected.title}` +
            (poNotes.trim() ? ` | ${poNotes.trim()}` : ""),
          supplier,
          items: [
            {
              name_snapshot: selected.title,
              quantity: qty,
              unit_cost_foreign: unitCny,
              image_snapshot: selected.image_url ?? undefined,
            },
          ],
          cartons: [],
          receive_mode: "quantity",
          initial_payment:
            payEnabled && advance > 0 && payWalletId
              ? {
                  amount_bdt: advance,
                  wallet_id: payWalletId,
                  payment_date: payDate,
                  reference: payRef.trim() || undefined,
                  payment_type: "supplier_advance" as const,
                  idempotency_key: newIdemKey("hubpay"),
                }
              : undefined,
          idempotency_key: newIdemKey("hubpo"),
        },
      })) as { po_id: string; po_number: string };

      await setAgentFn({ data: { po_id: res.po_id, cargo_agent_id: poAgentId } });

      const { error } = await supabase
        .from("hub_product_ideas")
        .update({
          status: "ordered",
          ordered_at: new Date().toISOString(),
          order_qty: qty,
          order_unit_price: orderPrice ? Number(orderPrice) : null,
          imp_po_id: res.po_id,
        } as never)
        .eq("id", selected.id);
      if (error) throw error;
      await logSourcingEvent({
        ideaId: selected.id,
        type: "po_created",
        note: `${res.po_number} · ${qty} pcs @ ¥${unitCny} (FX ${fx})`,
        meta: { po_id: res.po_id, qty },
      });
      await logSourcingEvent({
        ideaId: selected.id,
        type: "stage_change",
        fromStage: "sourced",
        toStage: "ordered",
        note: res.po_number,
      });
      return res;
    },
    onSuccess: (res) => {
      toast.success(res ? `PO ${res.po_number} তৈরি হয়েছে 🎉` : "Order placed 🎉");
      setOrderOpen(false);
      invalidate();
      qc.invalidateQueries({ queryKey: ["hub-idea-po"] });
      qc.invalidateQueries({ queryKey: ["imp-pos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bestQuote = useMemo(() => {
    if (quotes.length === 0) return null;
    return [...quotes]
      .filter((q) => q.status !== "rejected")
      .sort((a, b) => quoteLandedCost(a) - quoteLandedCost(b))[0] ?? null;
  }, [quotes]);

  const inTarget = (cost: number) => {
    if (!selected) return null;
    const max = selected.target_price_max;
    if (max == null) return null;
    return cost <= max;
  };

  const openNewQuote = () => {
    setAddAnother(false);
    setQDraft(emptyQuote(lastFx));
    setQOpen(true);
  };
  const quoteToDraft = (q: HubSourcingQuote, keepId: boolean): QDraft => ({
      ...(keepId ? { id: q.id } : {}),
      supplier_name: q.supplier_name,
      supplier_url: q.supplier_url ?? "",
      contact: q.contact ?? "",
      platform: q.platform,
      unit_price_cny: String(q.unit_price_cny || ""),
      cny_rate: String(q.cny_rate || ""),
      moq: q.moq ? String(q.moq) : "",
      lead_time_days: q.lead_time_days ? String(q.lead_time_days) : "",
      shipping_mode: q.shipping_mode,
      shipping_cost_per_unit: String(q.shipping_cost_per_unit || ""),
      sample_status: q.sample_status,
      sample_cost: q.sample_cost ? String(q.sample_cost) : "",
      sample_tracking: q.sample_tracking ?? "",
      sample_received_at: q.sample_received_at ?? "",
      quality_rating: q.quality_rating ? String(q.quality_rating) : "",
      notes: q.notes ?? "",
  });
  const openEditQuote = (q: HubSourcingQuote) => {
    setAddAnother(false);
    setQDraft(quoteToDraft(q, true));
    setQOpen(true);
  };
  const openDuplicateQuote = (q: HubSourcingQuote) => {
    setAddAnother(false);
    setQDraft({ ...quoteToDraft(q, false), supplier_name: `${q.supplier_name} (copy)` });
    setQOpen(true);
  };

  /** Duplicate supplier guard while typing a new quote. */
  const dupQuote = useMemo(() => {
    if (qDraft.id) return null;
    const name = qDraft.supplier_name.trim().toLowerCase();
    const url = qDraft.supplier_url.trim().toLowerCase();
    if (!name && !url) return null;
    return (
      quotes.find(
        (q) =>
          (name && q.supplier_name.trim().toLowerCase() === name) ||
          (url && (q.supplier_url ?? "").trim().toLowerCase() === url),
      ) ?? null
    );
  }, [qDraft.id, qDraft.supplier_name, qDraft.supplier_url, quotes]);

  /** Keyboard: j/k move, Enter select, a = add quote, / = search. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (qOpen || orderOpen || removeTarget) return;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (typing) return;
      if (e.key === "a") {
        e.preventDefault();
        if (selected) openNewQuote();
        return;
      }
      if (e.key !== "j" && e.key !== "k") return;
      e.preventDefault();
      const idx = visible.findIndex((i) => i.id === selectedId);
      const next = e.key === "j" ? idx + 1 : idx - 1;
      if (next >= 0 && next < visible.length) setSelectedId(visible[next]!.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selectedId, qOpen, orderOpen, selected, lastFx]);

  const draftLanded =
    Number(qDraft.unit_price_cny || 0) * Number(qDraft.cny_rate || 0) +
    Number(qDraft.shipping_cost_per_unit || 0);

  const selImages = selected
    ? selected.images?.length
      ? selected.images
      : selected.image_url
        ? [selected.image_url]
        : []
    : [];
  const selSummary = selected ? sumQ.data?.get(selected.id) : undefined;

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-3 md:p-6">
      <GrowthPageHeader
        icon={PackageSearch}
        title="Sourcing Desk"
        subtitle={
          activeBrand
            ? `${activeBrand.name} — approved product এর supplier quote আর order`
            : "Approved products এর pricing, quote আর order placement"
        }
        actions={
          selected ? (
            <>
              <Button size="sm" variant="outline" onClick={openNewQuote}>
                <Plus className="mr-1.5 h-4 w-4" /> Add quote
              </Button>
              {selected.imp_po_id && (
                <Link to="/erp/imports/orders/$orderId" params={{ orderId: selected.imp_po_id }}>
                  <Button size="sm" variant="outline">
                    <Factory className="mr-1.5 h-4 w-4" /> View PO
                  </Button>
                </Link>
              )}
              <Button
                size="sm"
                disabled={!!selected.imp_po_id}
                onClick={() => {
                  setOrderQty(selected.order_qty ? String(selected.order_qty) : "");
                  setOrderPrice(
                    selected.order_unit_price
                      ? String(selected.order_unit_price)
                      : bestQuote
                        ? String(Math.round(quoteLandedCost(bestQuote)))
                        : "",
                  );
                  setPoUnitCny(bestQuote ? String(bestQuote.unit_price_cny ?? "") : "");
                  setPoFx(bestQuote?.cny_rate ? String(bestQuote.cny_rate) : "17");
                  setPoSupplierId("");
                  setPoSupplierName(bestQuote?.supplier_name ?? selected.supplier_name ?? "");
                  setPoSupplierUrl(bestQuote?.supplier_url ?? selected.supplier_url ?? "");
                  setPoNotes("");
                  setPayEnabled(false);
                  setPayAmount("");
                  setPayRef("");
                  setOrderOpen(true);
                }}
              >
                <ShoppingCart className="mr-1.5 h-4 w-4" />
                {selected.imp_po_id ? "Ordered" : "Place order"}
              </Button>
            </>
          ) : null
        }
      />

      {(ideasQ.isLoading || brandLoading) && <Skeleton className="h-64 w-full rounded-xl" />}

      {!ideasQ.isLoading && pipeline.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            এখনো approved product নেই। Product Pipeline-এ admin approve করলেই এখানে চলে আসবে।
          </CardContent>
        </Card>
      )}

      {pipeline.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <StageKpi
              label="In pipeline"
              value={String(stageCounts.all)}
              sub="approved → received"
              active={stageFilter === "all"}
              onClick={() => setStageFilter("all")}
            />
            {STAGE_ORDER.map((s) => (
              <StageKpi
                key={s}
                label={STAGE_META[s].label}
                value={String(stageCounts[s])}
                dot={STAGE_META[s].dot}
                active={stageFilter === s}
                onClick={() => setStageFilter(s)}
                sub={s === "ordered" && dueTotal > 0 ? `${fmtValue(Math.round(dueTotal), "bdt")} due` : undefined}
              />
            ))}
          </div>
          <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-background/85 p-2 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
            <StageFilterBar counts={stageCounts} value={stageFilter} onChange={setStageFilter} />
            <button
              type="button"
              onClick={() => setAttentionOnly((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                attentionOnly
                  ? "border-amber-500 bg-amber-500 text-white"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
              }`}
            >
              <AlertTriangle className="h-3 w-3" /> Needs attention
              <span className="rounded-full bg-black/10 px-1.5 text-[10px] tabular-nums dark:bg-white/10">
                {attentionSet.size}
              </span>
            </button>
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product / supplier…  ( / )"
              className="h-8 w-full max-w-[240px] sm:ml-auto"
            />
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="h-8 w-[150px]">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stage">Sort: Stage</SelectItem>
                <SelectItem value="age">Sort: Oldest first</SelectItem>
                <SelectItem value="due">Sort: Due amount</SelectItem>
                <SelectItem value="quotes">Sort: Most quotes</SelectItem>
                <SelectItem value="cost">Sort: Lowest cost</SelectItem>
              </SelectContent>
            </Select>
            <span className="hidden items-center gap-1 text-[10px] text-muted-foreground lg:inline-flex">
              <Keyboard className="h-3 w-3" /> j/k move · a = add quote
            </span>
          </div>
        </div>
      )}

      {pipeline.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          {/* Queue */}
          <div className="space-y-2 lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto lg:pr-1">
            {visible.length === 0 && (
              <Card>
                <CardContent className="p-6 text-center text-xs text-muted-foreground">
                  এই stage-এ কিছু নেই।
                </CardContent>
              </Card>
            )}
            {visible.map((i, idx) => {
              const on = i.id === selectedId;
              const imgs = i.images?.length ? i.images : i.image_url ? [i.image_url] : [];
              const qs = quotesQ.data?.get(i.id) ?? [];
              const st = stageOf.get(i.id) ?? "to_source";
              const po = i.imp_po_id ? posQ.data?.get(i.imp_po_id) : undefined;
              const ageDays = ageDaysOf(i);
              const prevStage = idx > 0 ? stageOf.get(visible[idx - 1]!.id) ?? "to_source" : null;
              const showHead = sortBy === "stage" && st !== prevStage;
              const due = isFollowupDue(i.next_action_at);
              return (
                <div key={i.id}>
                {showHead && (
                  <p className="px-1 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {STAGE_META[st].label}
                  </p>
                )}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(i.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setSelectedId(i.id);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all ${
                    on
                      ? "border-primary/50 bg-primary/5 shadow-sm ring-1 ring-primary/20"
                      : due
                        ? "border-amber-500/40 bg-amber-500/5 hover:-translate-y-0.5 hover:bg-amber-500/10 hover:shadow-sm"
                        : "border-border/70 hover:-translate-y-0.5 hover:bg-muted/50 hover:shadow-sm"
                  }`}
                >
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg">
                    <IdeaGallery images={imgs.slice(0, 1)} title={i.title} className="h-14" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate text-sm font-semibold">
                      <span className="truncate">{i.title}</span>
                      {(i.priority === "urgent" || i.priority === "high") && (
                        <Badge
                          variant="outline"
                          className={`shrink-0 px-1 py-0 text-[9px] uppercase ${PRIORITY_TONE[i.priority!]}`}
                        >
                          {i.priority}
                        </Badge>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {qs.length} quote{qs.length === 1 ? "" : "s"}
                      {i.target_price_max ? ` · target ≤ ${fmtValue(i.target_price_max, "bdt")}` : ""}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {po ? `${po.po_number} · ` : ""}
                      {po && Number(po.due_bdt) > 0
                        ? `${fmtValue(Math.round(Number(po.due_bdt)), "bdt")} due · `
                        : ""}
                      {ageDays}d in pipeline
                      {i.sourcing_owner ? ` · ${i.sourcing_owner}` : ""}
                    </p>
                    {i.next_action_at && (
                      <p
                        className={`truncate text-[10px] ${
                          due ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                        }`}
                      >
                        ⏰ {i.next_action_at}
                        {i.next_action_note ? ` · ${i.next_action_note}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StageBadge stage={st} className="shrink-0" />
                    <StageMenu idea={i} />
                  </div>
                </div>
                </div>
              );
            })}
          </div>

          {/* Detail */}
          {selected && (
            <div className="space-y-4 lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto lg:pr-1">
              <Card className="overflow-hidden">
                <div className="grid gap-0 md:grid-cols-[280px_1fr]">
                  <IdeaGallery images={selImages} title={selected.title} className="aspect-[4/3]" />
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="font-display text-lg font-bold">{selected.title}</h2>
                        <p className="text-xs text-muted-foreground">
                          {selected.category || "uncategorised"}
                          {selected.moq ? ` · MOQ ${selected.moq}` : ""}
                          {selected.approved_at
                            ? ` · approved ${new Date(selected.approved_at).toLocaleDateString()}`
                            : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <StarRating value={selSummary?.avg_rating ?? 0} />
                        <p className="text-[10px] text-muted-foreground">
                          {selSummary?.up_votes ?? 0} likes · {selSummary?.rating_count ?? 0} ratings
                        </p>
                        <div className="mt-1 flex items-center justify-end gap-1">
                          <StageBadge stage={stageOf.get(selected.id) ?? "to_source"} />
                          <StageMenu idea={selected} />
                        </div>
                      </div>
                    </div>

                    {selected.description && (
                      <p className="text-xs text-muted-foreground">{selected.description}</p>
                    )}

                    <SourcingTimeline
                      current={stageOf.get(selected.id) ?? "to_source"}
                      steps={[
                        { stage: "to_source", date: selected.approved_at, note: "approved" },
                        {
                          stage: "sourcing",
                          date: quotes.length ? quotes[quotes.length - 1]!.created_at : null,
                          note: quotes.length ? `${quotes.length} quote${quotes.length === 1 ? "" : "s"}` : "no quote yet",
                        },
                        {
                          stage: "sourced",
                          date: null,
                          note: selected.selected_quote_id
                            ? `supplier: ${selected.supplier_name ?? "selected"}`
                            : "supplier pending",
                        },
                        {
                          stage: "ordered",
                          date: selected.ordered_at,
                          note: linkedPoQ.data?.po_number ?? (selected.order_qty ? `${selected.order_qty} pcs` : null),
                        },
                        {
                          stage: "in_transit",
                          date: null,
                          note: linkedPoQ.data
                            ? String(linkedPoQ.data.status).replace(/_/g, " ")
                            : "not shipped",
                        },
                        {
                          stage: "received",
                          date: null,
                          note: linkedPoQ.data?.status === "completed" ? "stock in" : "pending",
                        },
                      ]}
                    />

                    {(() => {
                      const st = stageOf.get(selected.id) ?? "to_source";
                      const hint =
                        st === "to_source"
                          ? "পরবর্তী ধাপ: supplier quote add করো (Add quote)।"
                          : st === "sourcing"
                            ? "পরবর্তী ধাপ: সেরা quote টা Select করো, নাহলে ⋯ মেনু থেকে Sourcing done দিলে সবচেয়ে কম landed cost auto select হবে।"
                            : st === "sourced"
                              ? "পরবর্তী ধাপ: Place order দিয়ে cargo agent সহ Purchase Order তৈরি করো।"
                              : st === "ordered"
                                ? "পরবর্তী ধাপ: মাল shipment-এ উঠলে ⋯ মেনু থেকে In transit করো।"
                                : st === "in_transit"
                                  ? "মাল পথে আছে — warehouse receive করলে Received auto হয়ে যাবে।"
                                  : "সব ধাপ শেষ — stock ঢুকে গেছে।";
                      return (
                        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 p-2.5 text-[11px]">
                          <Target className="h-3.5 w-3.5 shrink-0 text-primary" />
                          <span className="min-w-[200px] flex-1">{hint}</span>
                          {(st === "to_source" || st === "sourcing") && (
                            <Button size="sm" className="h-7 text-[11px]" onClick={openNewQuote}>
                              <Plus className="mr-1 h-3 w-3" /> Add quote
                            </Button>
                          )}
                          {st === "sourcing" && quotes.length > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px]"
                              disabled={changeStage.isPending}
                              onClick={() => changeStage.mutate({ idea: selected, stage: "sourced" })}
                            >
                              Sourcing done
                            </Button>
                          )}
                        </div>
                      );
                    })()}

                    <FollowupCard
                      ideaId={selected.id}
                      nextActionAt={selected.next_action_at ?? null}
                      nextActionNote={selected.next_action_note ?? null}
                      owner={selected.sourcing_owner ?? null}
                      priority={selected.priority ?? "normal"}
                      saving={saveFollowup.isPending}
                      onSave={(v) => saveFollowup.mutate(v)}
                    />

                    <div className="flex flex-wrap gap-1.5 text-xs">
                      <Badge variant="outline">
                        Planned sell {fmtValue(selected.est_sell_price, "bdt")}
                      </Badge>
                      <Badge variant="outline">
                        Est. cost {fmtValue(selected.est_unit_cost, "bdt")}
                      </Badge>
                      {selected.source_url && (
                        <a
                          href={selected.source_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          source <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>

                    <div className="rounded-lg border bg-muted/40 p-3">
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                        <Target className="h-3.5 w-3.5 text-primary" /> Target landed price (৳/unit)
                      </p>
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="grid gap-1">
                          <Label className="text-[11px]">Min</Label>
                          <Input
                            className="h-8 w-24"
                            type="number"
                            value={tMin}
                            onChange={(e) => setTMin(e.target.value)}
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-[11px]">Max</Label>
                          <Input
                            className="h-8 w-24"
                            type="number"
                            value={tMax}
                            onChange={(e) => setTMax(e.target.value)}
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => saveTarget.mutate()}
                          disabled={saveTarget.isPending}
                        >
                          Save target
                        </Button>
                        {bestQuote && (
                          <span className="ml-auto text-xs">
                            Best quote:{" "}
                            <span
                              className={
                                inTarget(quoteLandedCost(bestQuote)) === false
                                  ? "font-semibold text-destructive"
                                  : "font-semibold text-emerald-600"
                              }
                            >
                              {fmtValue(Math.round(quoteLandedCost(bestQuote)), "bdt")}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    {selected.status === "ordered" && (
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          Order placed
                        </span>{" "}
                        — {selected.order_qty ?? 0} pcs @{" "}
                        {fmtValue(selected.order_unit_price ?? 0, "bdt")} ·{" "}
                        {selected.ordered_at
                          ? new Date(selected.ordered_at).toLocaleDateString()
                          : ""}
                      </div>
                    )}

                    {selected.imp_po_id && linkedPoQ.data && (
                      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="flex items-center gap-1.5 text-xs font-semibold">
                            <Factory className="h-3.5 w-3.5 text-primary" />
                            Supply chain PO {linkedPoQ.data.po_number}
                            <Badge variant="secondary" className="text-[10px] capitalize">
                              {String(linkedPoQ.data.status).replace(/_/g, " ")}
                            </Badge>
                          </p>
                          <Link
                            to="/erp/imports/orders/$orderId"
                            params={{ orderId: selected.imp_po_id }}
                          >
                            <Button size="sm" variant="outline" className="h-7 text-xs">
                              Open PO <ExternalLink className="ml-1 h-3 w-3" />
                            </Button>
                          </Link>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                          <Info
                            label="Units"
                            value={String(linkedPoQ.data.total_units ?? selected.order_qty ?? 0)}
                          />
                          <Info
                            label="PO total"
                            value={fmtValue(
                              Math.round(Number(linkedPoQ.data.grand_total_bdt ?? 0)),
                              "bdt",
                            )}
                          />
                          <Info
                            label="Paid"
                            value={fmtValue(Math.round(Number(linkedPoQ.data.paid_bdt ?? 0)), "bdt")}
                          />
                          <Info
                            label="Due"
                            value={fmtValue(Math.round(Number(linkedPoQ.data.due_bdt ?? 0)), "bdt")}
                          />
                        </div>
                        {Number(linkedPoQ.data.landed_cost_per_unit_bdt ?? 0) > 0 && (
                          <p className="mt-1.5 text-[11px] text-muted-foreground">
                            Actual landed / unit:{" "}
                            {fmtValue(
                              Math.round(Number(linkedPoQ.data.landed_cost_per_unit_bdt)),
                              "bdt",
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </div>
              </Card>

              {/* Quotes */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Supplier quotes ({quotes.length})</h3>
                  <Button size="sm" variant="outline" onClick={openNewQuote}>
                    <Plus className="mr-1.5 h-4 w-4" /> Add quote
                  </Button>
                </div>

                {quotes.length === 0 && (
                  <Card>
                    <CardContent className="p-8 text-center text-sm text-muted-foreground">
                      কোনো quote নেই। 1688 / Alibaba supplier থেকে price নিয়ে "Add quote" করো।
                    </CardContent>
                  </Card>
                )}

                {quotes.length > 0 && (
                  <QuoteCompareTable
                    quotes={quotes}
                    selectedQuoteId={selected.selected_quote_id ?? null}
                    targetMax={selected.target_price_max ?? null}
                    onSelect={(q) => chooseQuote.mutate(q)}
                    onEdit={openEditQuote}
                    onDuplicate={openDuplicateQuote}
                    onRemove={(q) => removeQuote.mutate(q)}
                    busy={chooseQuote.isPending || removeQuote.isPending}
                  />
                )}

                <SourcingActivity events={eventsQ.data ?? []} loading={eventsQ.isLoading} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cancelled / archived */}
      {cancelled.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <button
              type="button"
              onClick={() => setShowCancelled((v) => !v)}
              className="flex w-full items-center gap-2 text-left text-xs font-semibold text-muted-foreground"
            >
              <Archive className="h-3.5 w-3.5" />
              Cancelled ({cancelled.length})
              <span className="ml-auto text-[10px] font-normal">
                {showCancelled ? "Hide" : "Show"}
              </span>
            </button>
            {showCancelled && (
              <div className="mt-3 space-y-2">
                {cancelled.map((i) => (
                  <div
                    key={i.id}
                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-2"
                  >
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md">
                      <IdeaGallery
                        images={(i.images?.length ? i.images : i.image_url ? [i.image_url] : []).slice(0, 1)}
                        title={i.title}
                        className="h-10"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{i.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {i.next_action_note || "no reason noted"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={restoreIdea.isPending}
                      onClick={() => restoreIdea.mutate(i)}
                    >
                      <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restore
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      aria-label={`Delete ${i.title}`}
                      onClick={() => askRemove(i, "delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cancel / delete confirmation */}
      <Dialog
        open={!!removeTarget}
        onOpenChange={(o) => {
          if (!o) {
            setRemoveTarget(null);
            setRemoveReason("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {removeTarget?.mode === "delete" ? "Delete permanently?" : "Cancel sourcing?"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{removeTarget?.idea.title}</span>{" "}
              {removeTarget?.mode === "delete"
                ? "— product, সব quote আর history একসাথে মুছে যাবে। এটা undo করা যাবে না।"
                : "— pipeline থেকে সরে যাবে, কিন্তু quote/history থেকে যাবে আর যেকোনো সময় restore করা যাবে।"}
            </p>
            {removeTarget?.mode === "cancel" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Reason (optional)</Label>
                <Textarea
                  value={removeReason}
                  onChange={(e) => setRemoveReason(e.target.value)}
                  placeholder="দাম বেশি / supplier পাওয়া যায়নি / product drop…"
                  rows={2}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRemoveTarget(null);
                setRemoveReason("");
              }}
            >
              Back
            </Button>
            <Button
              variant={removeTarget?.mode === "delete" ? "destructive" : "default"}
              disabled={cancelIdea.isPending || deleteIdea.isPending}
              onClick={() => {
                if (!removeTarget) return;
                if (removeTarget.mode === "delete") deleteIdea.mutate(removeTarget.idea);
                else cancelIdea.mutate({ idea: removeTarget.idea, reason: removeReason });
              }}
            >
              {(cancelIdea.isPending || deleteIdea.isPending) && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              {removeTarget?.mode === "delete" ? "Delete" : "Cancel sourcing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quote dialog */}
      <Dialog open={qOpen} onOpenChange={setQOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{qDraft.id ? "Edit quote" : "New supplier quote"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Supplier name">
                <Input
                  value={qDraft.supplier_name}
                  onChange={(e) => setQDraft({ ...qDraft, supplier_name: e.target.value })}
                />
              </Field>
              <Field label="Platform">
                <Select
                  value={qDraft.platform}
                  onValueChange={(v) => setQDraft({ ...qDraft, platform: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["1688", "Alibaba", "Taobao", "Direct factory", "Local"].map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Supplier link">
              <Input
                value={qDraft.supplier_url}
                onChange={(e) => {
                  const url = e.target.value;
                  const p = detectPlatform(url);
                  setQDraft({ ...qDraft, supplier_url: url, ...(p ? { platform: p } : {}) });
                }}
                placeholder="https://detail.1688.com/..."
              />
            </Field>
            {dupQuote && (
              <p className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                এই supplier ("{dupQuote.supplier_name}") ইতিমধ্যে quote list-এ আছে — duplicate হয়ে যাবে।
              </p>
            )}
            <Field label="Contact (WeChat / phone)">
              <Input
                value={qDraft.contact}
                onChange={(e) => setQDraft({ ...qDraft, contact: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Unit price (¥)">
                <Input
                  type="number"
                  value={qDraft.unit_price_cny}
                  onChange={(e) => setQDraft({ ...qDraft, unit_price_cny: e.target.value })}
                />
              </Field>
              <Field label="৳ per ¥">
                <Input
                  type="number"
                  value={qDraft.cny_rate}
                  onChange={(e) => setQDraft({ ...qDraft, cny_rate: e.target.value })}
                />
              </Field>
              <Field label="Ship/unit (৳)">
                <Input
                  type="number"
                  value={qDraft.shipping_cost_per_unit}
                  onChange={(e) =>
                    setQDraft({ ...qDraft, shipping_cost_per_unit: e.target.value })
                  }
                />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="MOQ">
                <Input
                  type="number"
                  value={qDraft.moq}
                  onChange={(e) => setQDraft({ ...qDraft, moq: e.target.value })}
                />
              </Field>
              <Field label="Lead time (days)">
                <Input
                  type="number"
                  value={qDraft.lead_time_days}
                  onChange={(e) => setQDraft({ ...qDraft, lead_time_days: e.target.value })}
                />
              </Field>
              <Field label="Shipping mode">
                <Select
                  value={qDraft.shipping_mode}
                  onValueChange={(v) => setQDraft({ ...qDraft, shipping_mode: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["air", "sea", "express"].map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sample status">
                <Select
                  value={qDraft.sample_status}
                  onValueChange={(v) => setQDraft({ ...qDraft, sample_status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["none", "requested", "shipped", "received", "approved"].map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Quality rating (1-5)">
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={qDraft.quality_rating}
                  onChange={(e) => setQDraft({ ...qDraft, quality_rating: e.target.value })}
                />
              </Field>
            </div>
            {qDraft.sample_status !== "none" && (
              <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/30 p-3">
                <Field label="Sample cost (৳)">
                  <Input
                    type="number"
                    value={qDraft.sample_cost}
                    onChange={(e) => setQDraft({ ...qDraft, sample_cost: e.target.value })}
                  />
                </Field>
                <Field label="Sample tracking">
                  <Input
                    value={qDraft.sample_tracking}
                    onChange={(e) => setQDraft({ ...qDraft, sample_tracking: e.target.value })}
                  />
                </Field>
                <Field label="Received on">
                  <Input
                    type="date"
                    value={qDraft.sample_received_at}
                    onChange={(e) => setQDraft({ ...qDraft, sample_received_at: e.target.value })}
                  />
                </Field>
              </div>
            )}
            <Field label="Notes">
              <Textarea
                rows={2}
                value={qDraft.notes}
                onChange={(e) => setQDraft({ ...qDraft, notes: e.target.value })}
              />
            </Field>
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3 text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Truck className="h-4 w-4" /> Landed cost / unit
              </span>
              <span className="text-right">
                <span className="font-display text-lg font-bold">
                  {fmtValue(Math.round(draftLanded), "bdt")}
                </span>
                {selected?.target_price_max ? (
                  <span
                    className={`block text-[10px] ${
                      draftLanded <= selected.target_price_max
                        ? "text-emerald-600"
                        : "text-destructive"
                    }`}
                  >
                    target ≤ {fmtValue(selected.target_price_max, "bdt")}
                  </span>
                ) : null}
                {qDraft.moq && Number(qDraft.moq) > 0 ? (
                  <span className="block text-[10px] text-muted-foreground">
                    MOQ {qDraft.moq} pcs ≈{" "}
                    {fmtValue(Math.round(draftLanded * Number(qDraft.moq)), "bdt")} order
                  </span>
                ) : null}
              </span>
            </div>
          </div>
          <DialogFooter>
            {!qDraft.id && (
              <label className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-primary"
                  checked={addAnother}
                  onChange={(e) => setAddAnother(e.target.checked)}
                />
                Save & add another
              </label>
            )}
            <Button variant="outline" onClick={() => setQOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveQuote.mutate(qDraft)}
              disabled={!qDraft.supplier_name.trim() || saveQuote.isPending}
            >
              Save quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order dialog */}
      <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Place order → Purchase Order — {selected?.title}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Quantity (pcs)">
                <Input
                  type="number"
                  value={orderQty}
                  onChange={(e) => setOrderQty(e.target.value)}
                />
              </Field>
              <Field label="Unit price (¥ CNY)">
                <Input
                  type="number"
                  step="0.01"
                  value={poUnitCny}
                  onChange={(e) => setPoUnitCny(e.target.value)}
                />
              </Field>
              <Field label="FX rate (৳ / ¥)">
                <Input
                  type="number"
                  step="0.01"
                  value={poFx}
                  onChange={(e) => setPoFx(e.target.value)}
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Cargo agent (main party) *">
                <Select value={poAgentId} onValueChange={setPoAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Agent select করুন" />
                  </SelectTrigger>
                  <SelectContent>
                    {(agentsQ.data ?? []).map((a: { id: string; name: string }) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex items-end text-[11px] text-muted-foreground">
                অর্ডার এই agent-এর মাধ্যমে যাবে; shipping ও payment tracking agent ledger-এ হবে।
                Agent না থাকলে Imports → Settings থেকে যোগ করুন।
              </div>
              <Field label="Supplier (existing)">
                <Select
                  value={poSupplierId || "new"}
                  onValueChange={(v) => setPoSupplierId(v === "new" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="New supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">+ New supplier</SelectItem>
                    {(suppliersQ.data ?? []).map((s: { id: string; name: string }) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {!poSupplierId && (
                <Field label="New supplier name">
                  <Input
                    value={poSupplierName}
                    onChange={(e) => setPoSupplierName(e.target.value)}
                    placeholder="1688 seller / factory"
                  />
                </Field>
              )}
              {!poSupplierId && (
                <Field label="Supplier link (optional)">
                  <Input
                    value={poSupplierUrl}
                    onChange={(e) => setPoSupplierUrl(e.target.value)}
                    placeholder="https://detail.1688.com/..."
                  />
                </Field>
              )}
              <Field label="Planned landed / unit (৳)">
                <Input
                  type="number"
                  value={orderPrice}
                  onChange={(e) => setOrderPrice(e.target.value)}
                />
              </Field>
            </div>

            <Field label="PO note (optional)">
              <Textarea
                rows={2}
                value={poNotes}
                onChange={(e) => setPoNotes(e.target.value)}
                placeholder="Color mix, packaging instruction..."
              />
            </Field>

            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Wallet className="h-4 w-4 text-primary" /> Advance payment এখনই record করবো?
                </div>
                <Switch checked={payEnabled} onCheckedChange={setPayEnabled} />
              </div>
              {payEnabled && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Amount (৳)">
                    <Input
                      type="number"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                    />
                  </Field>
                  <Field label="Pay from wallet">
                    <Select value={payWalletId} onValueChange={setPayWalletId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {wallets.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Payment date">
                    <Input
                      type="date"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                    />
                  </Field>
                  <Field label="Reference (optional)">
                    <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} />
                  </Field>
                </div>
              )}
            </div>

            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">PO value (product, ৳)</span>
                <span className="font-semibold">
                  {fmtValue(
                    Math.round(
                      Number(orderQty || 0) * Number(poUnitCny || 0) * Number(poFx || 0),
                    ),
                    "bdt",
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Planned landed total</span>
                <span className="font-display text-lg font-bold">
                  {fmtValue(
                    Math.round(Number(orderQty || 0) * Number(orderPrice || 0)),
                    "bdt",
                  )}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Quantity mode PO তৈরি হবে — Supply Chain থেকে piece by piece release করা যাবে।
              </p>
              {selected?.target_price_max != null &&
                Number(orderPrice || 0) > selected.target_price_max && (
                  <p className="mt-1 text-xs text-destructive">
                    Target price ({fmtValue(selected.target_price_max, "bdt")}) এর উপরে যাচ্ছে।
                  </p>
                )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrderOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => placeOrder.mutate()}
              disabled={
                !poAgentId ||
                !orderQty ||
                Number(poFx || 0) <= 0 ||
                (!poSupplierId && !poSupplierName.trim()) ||
                (payEnabled && (!payWalletId || Number(payAmount || 0) <= 0)) ||
                placeOrder.isPending
              }
            >
              {placeOrder.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Create PO & order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
