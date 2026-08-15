# Growth Hub ↔ Content Studio merge — এক জায়গায় Creative

## সমস্যা
এখন দুই জায়গায় একই কাজ:
- Growth Hub → **Creative Desk** (`/erp/hub/content`): content plan, brief, creator assignment, budget, result।
- Content Studio (`/erp/content/*`): Intake, Media plan, Pipeline, Creator CRM, Agency, Matching, Report।

দুইটার ডেটা আলাদা টেবিলে, তাই একই ব্র্যান্ডের কনটেন্ট দুই জায়গায় ভাগ হয়ে যায়। বর্তমানে Creative Desk-এ মাত্র ১টা plan আর ০টা assignment আছে — তাই এখনই merge করলে ঝুঁকি নেই।

## সিদ্ধান্ত
**Content Studio-ই একমাত্র creative home।** Growth Hub-এ Creative Desk আলাদা মডিউল হিসেবে থাকবে না — সেখানে শুধু "কতটুকু হয়েছে" summary + link থাকবে।

## কাজ

### ১. Creative brief → Content Studio-তে আনা
- Pipeline-এর প্রতিটা content item-এ পূর্ণ **Brief editor** (drawer): objective/angle, hook variants, script, CTA, caption, hashtags, reference links, deliverable type, due date, cost, creator/agency assign, approval status (pending → briefed → in review → revision → approved)।
- Brief **template** ও "copy brief to another item" — Creative Desk-এর যেটা ভালো ছিল সেটাই এখানে।
- Brief **print/share view** (creator-কে পাঠানোর জন্য পরিষ্কার এক পৃষ্ঠার ভিউ) + copy-to-clipboard text।
- `content_briefs` টেবিল (এখন খালি) এই brief-এর canonical জায়গা, item-এর সাথে ১:১ লিঙ্ক।

### ২. Creative Desk-এর যে ফিচারগুলো Content Studio-তে পোর্ট হবে
- Plan card-এ **budget bar** (spent vs budget) ও due chip — Media Buying Hub + Pipeline-এ।
- **Month/calendar grid** ভিউ Pipeline-এ (due date অনুযায়ী)।
- Publish-পরবর্তী **result fields** (views/likes/orders) — Pipeline item-এ ইতিমধ্যে আছে, UI-তে এক জায়গায় আনা হবে।

### ৩. ডেটা মাইগ্রেশন (এক-বার)
- `hub_content_plans` → `content_plans`
- `hub_content_assignments` → `content_items` (status/stage ম্যাপ করে)
- `hub_creators` আগে থেকেই দুই মডিউলে শেয়ার্ড, তাই অপরিবর্তিত।
- পুরনো টেবিল ড্রপ করা হবে না, শুধু অ্যাপ থেকে ব্যবহার বন্ধ (safety)।

### ৪. Growth Hub পরিষ্কার
- `/erp/hub/content` → `/erp/content/pipeline`-এ redirect।
- Hub nav থেকে "Creative Desk" বাদ; বদলে Command Center-এ একটা **Content snapshot card**: এই মাসে কত brief pending / editing / published + "Open Content Studio" বাটন।
- Sidebar ও page-permission catalog আপডেট।

## Technical
- নতুন: `src/components/erp/content/brief-drawer.tsx`, `src/lib/erp/content/brief-data.ts` (brief CRUD + template)।
- `content-data.ts`-এ brief fetch/upsert helper, item↔brief join।
- Migration: hub → content data copy (idempotent, `on conflict do nothing`), নতুন টেবিল নেই বলে GRANT দরকার নেই; `content_briefs`-এ GRANT/RLS আগে থেকে আছে কিনা যাচাই করে দরকার হলে যোগ।
- `erp.hub.content.tsx` route redirect-এ রূপান্তর, `creative-kit.tsx`-এর reusable অংশ Content Studio-তে সরানো।
- প্রতিটা টাচ করা রুটে unique head() ঠিক রাখা হবে।
