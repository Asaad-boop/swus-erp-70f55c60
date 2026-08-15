import { supabase } from "@/integrations/supabase/client";
import type { ContentBrief, ContentItem } from "./content-data";

export type BriefDraft = {
  deliverable_type: string;
  hook: string;
  script: string;
  cta: string;
  reference_url: string;
  due_date: string;
  cost: number;
  approval_status: string;
  revision_note: string;
  notes: string;
  creator_id: string | null;
  agency_id: string | null;
};

export const emptyBriefDraft: BriefDraft = {
  deliverable_type: "ugc",
  hook: "",
  script: "",
  cta: "",
  reference_url: "",
  due_date: "",
  cost: 0,
  approval_status: "pending",
  revision_note: "",
  notes: "",
  creator_id: null,
  agency_id: null,
};

export function briefToDraft(b: ContentBrief | null, item: ContentItem): BriefDraft {
  if (!b) {
    return {
      ...emptyBriefDraft,
      deliverable_type: item.content_type || "ugc",
      hook: item.hook ?? "",
      script: item.script ?? "",
      cta: item.cta ?? "",
      reference_url: item.reference_urls?.[0] ?? "",
      due_date: item.due_date ?? "",
      cost: item.cost ?? 0,
      creator_id: item.creator_id,
      agency_id: item.agency_id,
    };
  }
  return {
    deliverable_type: b.deliverable_type || "ugc",
    hook: b.hook ?? "",
    script: b.script ?? "",
    cta: b.cta ?? "",
    reference_url: b.reference_url ?? "",
    due_date: b.due_date ?? "",
    cost: Number(b.cost ?? 0),
    approval_status: b.approval_status || "pending",
    revision_note: b.revision_note ?? "",
    notes: b.notes ?? "",
    creator_id: b.creator_id,
    agency_id: b.agency_id,
  };
}

/** The single brief attached to a content item (null when not written yet). */
export async function fetchItemBrief(itemId: string) {
  const { data, error } = await supabase
    .from("content_briefs")
    .select("*")
    .eq("item_id", itemId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as ContentBrief | null;
}

export async function saveItemBrief(args: {
  existingId: string | null;
  item: ContentItem;
  draft: BriefDraft;
}) {
  const { existingId, item, draft } = args;
  const payload = {
    brand_id: item.brand_id,
    item_id: item.id,
    media_plan_id: item.media_plan_id,
    creator_id: draft.creator_id,
    agency_id: draft.agency_id,
    deliverable_type: draft.deliverable_type,
    hook: draft.hook || null,
    script: draft.script || null,
    cta: draft.cta || null,
    reference_url: draft.reference_url || null,
    due_date: draft.due_date || null,
    cost: Number(draft.cost) || 0,
    approval_status: draft.approval_status,
    revision_note: draft.revision_note || null,
    notes: draft.notes || null,
  };
  if (existingId) {
    const { error } = await supabase
      .from("content_briefs")
      .update(payload as never)
      .eq("id", existingId);
    if (error) throw error;
    return existingId;
  }
  const { data, error } = await supabase
    .from("content_briefs")
    .insert(payload as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function deleteBrief(id: string) {
  const { error } = await supabase.from("content_briefs").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- Templates ---------------- */

export type BriefTemplate = {
  key: string;
  label: string;
  hint: string;
  apply: (ctx: { product: string; brand: string }) => Partial<BriefDraft>;
};

export const BRIEF_TEMPLATES: BriefTemplate[] = [
  {
    key: "ugc_review",
    label: "UGC review",
    hint: "Creator নিজে ব্যবহার করে সৎ রিভিউ দেয়",
    apply: ({ product }) => ({
      deliverable_type: "ugc",
      hook: `আমি ${product} ৭ দিন ব্যবহার করলাম — সত্যি বলি?`,
      script: [
        "০–৩ সেকেন্ড: Hook — ক্যামেরার দিকে তাকিয়ে সরাসরি প্রশ্ন।",
        `৩–১০ সেকেন্ড: সমস্যা — ${product} ছাড়া কী কষ্ট হতো।`,
        "১০–২৫ সেকেন্ড: ব্যবহার দেখাও (close-up, হাতে ধরা, real setting)।",
        "২৫–৪০ সেকেন্ড: ২টা সুবিধা + দাম/অফার।",
        "৪০–৪৫ সেকেন্ড: CTA — কোথা থেকে অর্ডার করবে।",
      ].join("\n"),
      cta: "কমেন্টে 'অর্ডার' লিখুন অথবা প্রোফাইল লিংকে অর্ডার করুন",
    }),
  },
  {
    key: "unboxing",
    label: "Unboxing",
    hint: "প্যাকেজ খোলা → first impression",
    apply: ({ product }) => ({
      deliverable_type: "unboxing",
      hook: `${product} এর প্যাকেট খুললাম — ভিতরে যা পেলাম!`,
      script: [
        "০–৩ সে: পার্সেল হাতে, কাঁচি দিয়ে কাটা শুরু।",
        "৩–১২ সে: প্যাকেজিং quality, ভিতরের সব জিনিস দেখানো।",
        "১২–৩০ সে: প্রথম ব্যবহারের রিয়েকশন, texture/finish close-up।",
        "৩০–৪০ সে: দাম বনাম মান তুলনা।",
        "শেষ: CTA + delivery কত দিনে এসেছে।",
      ].join("\n"),
      cta: "ইনবক্সে মেসেজ দিলেই ক্যাশ অন ডেলিভারিতে পাঠানো হবে",
    }),
  },
  {
    key: "problem_solution",
    label: "Problem → Solution",
    hint: "Pain point দেখিয়ে সমাধান reveal",
    apply: ({ product }) => ({
      deliverable_type: "reel",
      hook: "এই সমস্যাটা প্রতিদিন হয়? ৩০ সেকেন্ডে সমাধান।",
      script: [
        "০–৪ সে: সমস্যার দৃশ্য (relatable, কোনো কথা ছাড়াও চলে)।",
        "৪–১০ সে: বিরক্তি বাড়ানো — কী কী চেষ্টা করেছিলে।",
        `১০–২৫ সে: ${product} reveal ও ব্যবহার।`,
        "২৫–৩৫ সে: আগে/পরে তুলনা।",
        "৩৫–৪৫ সে: CTA + অফার।",
      ].join("\n"),
      cta: "আজই অর্ডার করুন — সীমিত স্টক",
    }),
  },
  {
    key: "demo",
    label: "Product demo",
    hint: "ফিচার ধরে ধরে দেখানো",
    apply: ({ product }) => ({
      deliverable_type: "static",
      hook: `${product} এর ৩টা ফিচার যেটা কেউ বলে না`,
      script: [
        "Shot 1: প্রোডাক্ট ঘুরিয়ে ৩৬০° ভিউ।",
        "Shot 2: ফিচার ১ — close-up + on-screen text।",
        "Shot 3: ফিচার ২ — ব্যবহারের সময় দেখানো।",
        "Shot 4: ফিচার ৩ + durability test।",
        "Shot 5: দাম, অফার, CTA card।",
      ].join("\n"),
      cta: "অর্ডার করতে লিংকে ক্লিক করুন",
    }),
  },
  {
    key: "testimonial",
    label: "Testimonial",
    hint: "কাস্টমার রেজাল্ট / সোশ্যাল প্রুফ",
    apply: ({ product, brand }) => ({
      deliverable_type: "review",
      hook: `${brand} থেকে নেওয়ার পর যা বদলালো`,
      script: [
        "০–৫ সে: কাস্টমার পরিচয় + কী সমস্যা ছিল।",
        `৫–২০ সে: ${product} কীভাবে ব্যবহার করেছে।`,
        "২০–৩৫ সে: ফলাফল, নির্দিষ্ট সংখ্যা/সময়সহ।",
        "৩৫–৪৫ সে: কাকে সাজেস্ট করবে + CTA।",
      ].join("\n"),
      cta: "আপনিও ট্রাই করুন — মেসেজ দিন",
    }),
  },
];

/** Plain-text brief that can be copied straight into WhatsApp / Messenger. */
export function briefToText(args: {
  item: { title: string; code: string; platform: string; content_type: string };
  product: string | null;
  brand: string | null;
  draft: BriefDraft;
  creatorName?: string | null;
}) {
  const { item, product, brand, draft, creatorName } = args;
  const lines = [
    `🎬 CREATIVE BRIEF — ${item.title}`,
    `Code: ${item.code}`,
    brand ? `Brand: ${brand}` : null,
    product ? `Product: ${product}` : null,
    creatorName ? `Creator: ${creatorName}` : null,
    `Deliverable: ${draft.deliverable_type} · Platform: ${item.platform}`,
    draft.due_date ? `Deadline: ${draft.due_date}` : null,
    draft.cost ? `Budget: ৳${Math.round(draft.cost)}` : null,
    "",
    draft.hook ? `HOOK\n${draft.hook}` : null,
    draft.script ? `\nSCRIPT\n${draft.script}` : null,
    draft.cta ? `\nCTA\n${draft.cta}` : null,
    draft.reference_url ? `\nREFERENCE\n${draft.reference_url}` : null,
    draft.notes ? `\nNOTES\n${draft.notes}` : null,
    draft.revision_note ? `\nREVISION\n${draft.revision_note}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}
