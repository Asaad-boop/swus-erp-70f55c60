/**
 * Inbox language: English or Bangla, chosen per person and remembered on
 * this device. Customer messages are never translated — only our own UI.
 */
import { useSyncExternalStore } from "react";

export type InboxLang = "en" | "bn";

const KEY = "inbox.lang";
const listeners = new Set<() => void>();

function read(): InboxLang {
  try {
    return localStorage.getItem(KEY) === "bn" ? "bn" : "en";
  } catch {
    return "en";
  }
}

let current: InboxLang = typeof window === "undefined" ? "en" : read();

export function setInboxLang(l: InboxLang) {
  current = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* storage blocked: still switch for this visit */
  }
  listeners.forEach((f) => f());
}

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
export function toBnDigits(v: string | number) {
  return String(v).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]!);
}

const STR = {
  // queues
  q_awaiting: ["Needs reply", "উত্তর বাকি"],
  q_unread: ["Unread", "না পড়া"],
  q_mine: ["My chats", "আমার চ্যাট"],
  q_complaint: ["Complaint", "অভিযোগ"],
  q_followup: ["Follow-up", "ফলো-আপ"],
  q_ads: ["From ads", "অ্যাড থেকে"],
  q_all: ["All", "সব"],
  q_unassigned: ["Unassigned", "কেউ নেয়নি"],
  q_ordered: ["Ordered", "অর্ডার হয়েছে"],
  q_done: ["Done", "শেষ"],
  q_open: ["Open", "খোলা"],
  h_awaiting: [
    "Customer wrote last and nobody has replied yet.",
    "কাস্টমার শেষে লিখেছে, এখনো কেউ উত্তর দেয়নি।",
  ],
  h_unread: ["New messages nobody has opened.", "নতুন মেসেজ, কেউ খুলে দেখেনি।"],
  h_mine: ["Open chats assigned to you.", "আপনাকে দেওয়া খোলা চ্যাট।"],
  h_complaint: [
    "Broken, late or wrong items — sort these first.",
    "ভাঙা, দেরি বা ভুল প্রোডাক্ট — আগে এগুলো দেখুন।",
  ],
  h_followup: ["Chats you planned to message again.", "যেগুলোতে আবার মেসেজ দেওয়ার কথা।"],
  h_ads: ["Open chats that started from a message ad.", "মেসেজ অ্যাডে ক্লিক করে আসা খোলা চ্যাট।"],
  h_all: ["Every chat, newest first.", "সব চ্যাট, নতুনগুলো আগে।"],
  h_unassigned: ["Open chats nobody has taken yet.", "খোলা চ্যাট, এখনো কেউ নেয়নি।"],
  h_ordered: ["Chats that turned into an order.", "যেসব চ্যাট থেকে অর্ডার হয়েছে।"],
  h_done: ["Chats marked done.", "শেষ করা চ্যাট।"],
  h_open: ["All open chats.", "সব খোলা চ্যাট।"],
  more: ["More", "আরও"],
  // list
  search: ["Name, phone or message…", "নাম, ফোন বা মেসেজ…"],
  allChannels: ["All", "সব"],
  everyone: ["Everyone", "সবাই"],
  me: ["Me", "আমি"],
  you: ["You", "আপনি"],
  nobody: ["Unassigned", "কেউ নেয়নি"],
  showChatsOf: ["Show chats handled by", "কার চ্যাট দেখবেন"],
  filter: ["Filter", "ফিল্টার"],
  label: ["Label", "লেবেল"],
  clearFilter: ["Clear filters", "ফিল্টার সরান"],
  select: ["Select", "সিলেক্ট"],
  selectHint: ["Select chats to reply to many at once", "একসাথে অনেক চ্যাটে উত্তর দিতে সিলেক্ট করুন"],
  markAllRead: ["Mark all read", "সব পড়া হয়েছে"],
  loadMore: ["Load more", "আরও দেখান"],
  emptyAwaiting: ["All replied 🎉", "সব উত্তর দেওয়া শেষ 🎉"],
  emptyAwaitingSub: ["New messages will land here.", "নতুন মেসেজ এলে এখানে আসবে।"],
  emptyList: ["Nothing here", "এই লিস্ট খালি"],
  emptyListSub: ["Try another queue or search.", "অন্য কিউ বা সার্চ চেষ্টা করুন।"],
  noMatch: ["Nothing matches", "কিছু পাওয়া যায়নি"],
  youPrefix: ["You: ", "আপনি: "],
  handledBy: ["Handled by", "দেখছে"],
  waitingFor: ["waiting for a reply", "উত্তরের অপেক্ষায়"],
  // thread
  assignedTo: ["Assigned to", "দায়িত্বে"],
  assignedYou: ["Assigned to you", "দায়িত্বে: আপনি"],
  takeChat: ["Take this chat", "চ্যাটটা নিন"],
  handOver: ["Hand over to", "কাকে দেবেন"],
  unassign: ["Unassign", "দায়িত্ব সরান"],
  send: ["Send", "পাঠান"],
  sendN: ["Send {n}", "{n}টা পাঠান"],
  writeTo: ["Write to {name}…  ( / for templates )", "{name}-কে লিখুন…  ( / চাপলে টেমপ্লেট )"],
  writeReply: ["Write a reply…", "উত্তর লিখুন…"],
  addFiles: [
    "Photos, videos or files — pick many, paste or drag in",
    "ছবি, ভিডিও বা ফাইল — একসাথে অনেকগুলো দিন, পেস্ট বা টেনে আনুন",
  ],
  language: ["Language", "ভাষা"],
} as const;

export type InboxStrKey = keyof typeof STR;

export function useInboxT() {
  const lang = useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => current,
    () => "en" as InboxLang,
  );
  const t = (k: InboxStrKey, vars?: Record<string, string | number>) => {
    let s: string = STR[k][lang === "bn" ? 1 : 0];
    if (vars)
      for (const [name, v] of Object.entries(vars))
        s = s.replace(`{${name}}`, lang === "bn" ? toBnDigits(v) : String(v));
    return s;
  };
  const num = (n: number | string) => (lang === "bn" ? toBnDigits(n) : String(n));
  return { lang, t, num, setLang: setInboxLang };
}

/** EN | বাংলা switch. */
export const LANG_OPTIONS: { value: InboxLang; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "bn", label: "বাংলা" },
];
