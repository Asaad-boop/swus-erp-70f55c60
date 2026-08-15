# Growth Hub + Content Studio → এক মডিউল: **Growth Studio**

## কেন
এখন দুইটা আলাদা মডিউল, দুইটাতেই subnav, দুইটাতেই brand-scoped কাজ, আর অনেক overlap (creative, planning, calendar, report)। ব্যবহারকারীকে দুই জায়গায় ঘুরতে হয়। Creative Desk আগেই Content Studio-তে merge হয়েছে — এবার পুরোটা এক ছাদের নিচে।

## নতুন কাঠামো (URL: `/erp/growth/*`)
একটাই subnav, ৪টা গ্রুপে সাজানো:

| গ্রুপ | পেজ | কোথা থেকে এলো |
|---|---|---|
| **Overview** | Command Center | Hub index (goals + tasks + content snapshot একসাথে) |
| **Plan** | Vision & Goals · Task Board · Routines & Calendar · Monthly Projection | Growth Hub |
| **Create** | Content Intake · Content Pipeline (Brief সহ) · Media Buying Hub | Content Studio |
| **People & Market** | Creator CRM · Agency Partners · Product ↔ Creator · Product Pipeline · Sourcing Desk · Competitors | দুই দিক থেকে |
| **Report** | Growth Report | Content Report + Hub planning KPI merge |

## যেগুলো বাদ/মিলিয়ে দেওয়া হবে
- **Content Hub index (`/erp/content`)** আলাদা থাকবে না — Command Center-ই একমাত্র ল্যান্ডিং। Content KPI কার্ডগুলো Command Center-এ Create সেকশনে ঢুকবে।
- **Monthly Projection ↔ Media Buying Hub**: দুইটাই বাজেট প্ল্যান — Projection পেজে Media plan-এর spend/budget লাইন দেখাবে, ডুপ্লিকেট ইনপুট বাদ।
- **Routines & Calendar** এবং Pipeline-এর due-date calendar এক ক্যালেন্ডারে: routine task + content deadline একসাথে।
- **Report**: Content Brand Report + Hub goal progress এক পেজে (Goals vs actual, content output, creator cost, campaign profit)।

## রুট ও লিংক
- নতুন লেআউট `src/routes/_authenticated/erp.growth.tsx` + সব child রুট।
- পুরনো `/erp/hub/*` ও `/erp/content/*` সব রুট **permanent redirect** হয়ে নতুন path-এ যাবে (bookmark ভাঙবে না)।
- Sidebar-এ দুইটা গ্রুপের বদলে একটা **Growth Studio** গ্রুপ, ভেতরে উপরের সাজানো আইটেম।
- Page-permission catalog নতুন path-এ আপডেট, পুরনো path পেলে নতুনটায় map করা হবে।

## যা বদলাবে না
- ডেটাবেজ টেবিল, RLS, RPC — কিছুই বদলাবে না। শুধু route/nav/UI reorganization।
- প্রতিটা পেজের ভেতরের feature অক্ষত; শুধু জায়গা বদল + যেখানে duplicate সেখানে merge।

## Technical
- `hub-shell.tsx` + `content-shell.tsx` → একটা `growth-shell.tsx` (grouped subnav, mobile sheet সহ)।
- রুট ফাইল rename (`erp.hub.*` / `erp.content.*` → `erp.growth.*`), import path আপডেট, প্রতিটায় unique `head()`।
- পুরনো রুট ফাইলগুলো `beforeLoad: redirect(...)` স্টাব হিসেবে থাকবে।
- কোনো নতুন migration নেই।
