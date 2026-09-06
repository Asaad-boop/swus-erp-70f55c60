# 3-Level Dashboard: Owner / Admin-Staff / Staff

এখন `/erp` এ role অনুযায়ী switch হয় কিন্তু admin আর owner প্রায় একই ২৩৮৮ লাইনের ভিউ পায়, আর staff view পাতলা। তিনটা পরিষ্কার আলাদা dashboard বানাবো — একই URL `/erp`, role resolver ঠিক করবে কে কোনটা দেখবে।

## ১) Owner Dashboard — "Business Truth"

শুধু owner role. টাকা, profit, cash — সব এখানে।

- **Money Header**: Net Profit (today / MTD), Profit Quality score, Cash Position (সব wallet + COD pipeline + দেনা)
- **Brand Compare**: ব্র্যান্ড-ওয়াইজ revenue, delivered profit, margin %, trend sparkline
- **Month Pace**: target vs actual projection, দিন-শেষে কোথায় ল্যান্ড করবে
- **Marketing Efficiency**: ad spend, blended ROAS, CAC, top/worst campaign
- **Leak Panel**: Product Danger Zone, return loss, courier variance, unreconciled COD
- **Team Cost**: payroll total, cost per order — শুধু owner
- **Risk Alerts**: stock-out ঝুঁকি, cash runway, দীর্ঘ pending advance

## ২) Admin Dashboard — "Operations Control"

admin role (owner নয়). Money KPI সীমিত — revenue/order দেখাবে, কিন্তু cash position, payroll, net profit নয়।

- **Today's Command Panel**: need confirm / need packing / low stock / courier issue / COD pending — clickable
- **Order Funnel**: status breakdown, stuck orders (X ঘণ্টার বেশি একই status)
- **Team Activity**: কে কয়টা order confirm/pack করলো আজ, live attendance count
- **Courier Board**: Pathao/Steadfast delivery rate, in-transit aging, failed pickup
- **Inventory Alerts**: low stock, reorder queue, incoming shipment ETA
- **Website Orders + Live Visitors**
- **Reconciliation Pending**: কত invoice mismatch, কত টাকা atke ache

## ৩) Staff Dashboard — "My Work"

বাকি সব role (operations, packer, CS, warehouse, marketing, hr, employee…). কোনো money/profit/cash নেই।

- **My Day**: check-in/out button, আজকের attendance status, work hours, leave balance
- **My Queue** (role-adaptive):
  - packer → packing queue + আজ কয়টা pack করেছি
  - CS/operations → orders to call, pending confirmations
  - warehouse → receive/stocktake task
  - marketing → আমার campaign task
  - hr → pending leave approval
- **My Numbers**: আজ/এই সপ্তাহে আমার completed task count, streak
- **Quick Links**: শুধু আমার allowed pages
- **Announcements + Holidays**

## ৪) Permission wiring

- `/erp` resolver: `owner` → Owner, `admin` → Admin, বাকি → Staff.
- Owner চাইলে top-right এ view switcher ("Owner / Admin / Staff view") দিয়ে অন্য dashboard দেখতে পারবে — শুধু owner পাবে।
- Custom page-grant mode এ থাকা user সবসময় Staff dashboard পাবে (তার allowed pages অনুযায়ী quick links)।
- Data guard: Staff dashboard কোনো finance/payroll table query-ই করবে না; Admin dashboard cash/payroll/profit RPC কল করবে না। শুধু UI hide নয় — fetch-ও হবে না।

## Technical notes

- `erp.index.tsx` (2388 লাইন) ভেঙে: `dashboard/owner-dashboard.tsx`, `dashboard/admin-dashboard.tsx`, `dashboard/staff-dashboard.tsx`; route ফাইল শুধু resolver + skeleton।
- বিদ্যমান `owner-suite.tsx`, `widgets.tsx`, `month-pace-card.tsx`, `team-cost-card.tsx`, `website-orders-overview.tsx` reuse হবে; shared helper `dashboard/shared.tsx`-এ।
- কোনো নতুন role/migration লাগবে না — `owner` enum + `useCurrentRole().isOwner` আগেই আছে।
- Data logic অপরিবর্তিত; শুধু re-organize + role-gated fetch।

## Rollout

1. Split + resolver (কোনো visual পরিবর্তন নয়)
2. Admin dashboard থেকে owner-only block বাদ + team activity/courier board যোগ
3. Owner dashboard এ leak panel + risk alerts + view switcher
4. Staff dashboard role-adaptive queue
