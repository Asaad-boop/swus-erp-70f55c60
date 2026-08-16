# Role-based Dashboards: Owner / Admin / Employee

এখন `/erp` এ সবার জন্য একই ২২০০+ লাইনের dashboard render হয় — owner-level financial data সবাই দেখে ফেলে। এটা তিনটা আলাদা dashboard এ ভাগ করা হবে, একই URL `/erp` থেকে role অনুযায়ী auto-switch।

## ১) নতুন `owner` role

`app_role` enum-এ `owner` যোগ হবে (migration)। Owner = admin-এর সব access + owner-only financial dashboard। Access engine (`src/lib/erp/access.ts`)-এ owner কে admin-এর সমান module list দেওয়া হবে, আর `isOwner` flag `useCurrentRole()`-এ আসবে।

তোমার account গুলোর মধ্যে কাকে owner করব সেটা তুমি Users & Access screen থেকেই দিতে পারবে (role picker-এ owner অপশন আসবে)।

## ২) তিনটা dashboard

**Owner Dashboard** (`owner` role) — business ownership view
- Net Profit, Profit Quality score, Cash Position (সব wallet + COD pipeline)
- Brand-wise revenue/profit comparison
- Monthly projection vs actual pace
- Ad spend vs ROAS, Marketing efficiency
- Product Danger Zone, Return loss
- Team cost snapshot (payroll total) — শুধু owner দেখবে

**Admin Dashboard** (`admin`) — operational control view
- Today's Command Panel (need confirm / pack / low stock / courier issue / COD pending)
- Order funnel + status breakdown, Stuck orders
- Courier performance, Reconciliation pending
- Inventory alerts, Website orders overview
- Live visitors
- Revenue/order KPI দেখাবে, কিন্তু owner-only cash/payroll block বাদ

**Employee Dashboard** (বাকি সব role: operations, packer, CS, warehouse, marketing, hr, employee…)
- "My day": আজকের attendance status + check-in/out shortcut, my leave balance
- আমার role অনুযায়ী task cards (packer → packing queue, CS → orders to call, ops → pending confirmations)
- আমার allowed pages-এর quick links
- কোনো money/profit/cash KPI নেই

## ৩) Routing

`/erp` একটাই route থাকবে (`erp.index.tsx`), যেটা এখন শুধু resolver:
- `owner` → `<OwnerDashboard/>`
- `admin` (owner না হলে) → `<AdminDashboard/>`
- বাকি → `<EmployeeDashboard/>`

Fallback: role load না হওয়া পর্যন্ত skeleton।

## Technical notes

- বর্তমান 2244-লাইনের `erp.index.tsx` ভেঙে `src/components/erp/dashboard/owner-dashboard.tsx`, `admin-dashboard.tsx`, `employee-dashboard.tsx` হবে; shared helper/widget গুলো `dashboard/shared.tsx`-এ যাবে। কোনো ডেটা-লজিক পাল্টাবে না, শুধু re-organize + role gating।
- Migration: `ALTER TYPE app_role ADD VALUE 'owner'` + `has_role` ভিত্তিক যেসব policy admin চেক করে সেগুলোতে owner ও যোগ হবে না (owner আলাদা করে admin role-ও পাবে, তাই RLS অপরিবর্তিত থাকবে — নিরাপদ ও সহজ)।
- `useCurrentRole()` এ `isOwner` যোগ হবে; sidebar/route guard অপরিবর্তিত।
- Employee dashboard এ কোনো finance table query হবে না (RLS ছাড়াও client-side এ data pull বন্ধ)।
