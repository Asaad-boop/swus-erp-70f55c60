# Role-wise Dashboard System — Owner / Admin / Staff (role-specific)

লক্ষ্য: প্রত্যেক ইউজার login করলে **তার কাজের dashboard**-ই দেখবে — owner সব, admin পুরো operation control, আর staff শুধু তার নিজের role অনুযায়ী (packer, content, cargo, finance, supply chain ইত্যাদি)।

## ১. Owner Dashboard (আগে থেকেই আছে — শুধু পালিশ)
সব কিছু: profit, cash, payroll, brand comparison, marketing, inventory. কোনো বড় পরিবর্তন নয়।

## ২. Admin / Manager Dashboard — "আজকের পুরো ছবি"
এক স্ক্রিনে, চারটা ব্লকে:

- **Team today** — আজ কতজন office এসেছে (check-in), কতজন এখন কাজে (active/on break), কতজন late, কতজন ছুটিতে; প্রতিটি নাম + check-in সময় + এখন কী স্ট্যাটাসে। HR live attendance থেকে।
- **Order flow today** — website থেকে কত order এসেছে, কতটা confirm, কতটা pending/no-response, কতটা cancel/fake, কতটা packing-এ, কতটা ready to ship।
- **Courier & return today** — আজ কত parcel courier-এ গেল, কত in-transit, আজ কত delivered, আজ কত return এসেছে (এবং pending return কত), COD pending।
- আগের Reconciliation pending, Stuck orders, Inventory health কার্ডগুলো থাকবে (নিচে)।

কোনো profit / salary / cash কার্ড admin ভিউতে থাকবে না।

## ৩. Staff Dashboard — role অনুযায়ী আলাদা
সবার জন্য common উপরের অংশ (**My Work**):
- Check in / Check out বাটন, আজকের duty time live counter, Break start/stop
- আজকের/এই মাসের attendance summary (present, late, absent)
- My performance: এই মাসের KPI (নিজের role-এর কাজের count)
- My salary: fixed salary, এই মাসের আনুমানিক pay, শেষ payslip
- My profile (নাম, designation, department, joining date)

তার নিচে **role-specific work panel**:

| Role | কী দেখবে |
| --- | --- |
| Packer / warehouse | আজ pack করার order queue, তার নিজের আজকের packed count, scan/entry শর্টকাট, courier entry |
| Content | তার assigned content tasks, due today, shoot/plan queue |
| Cargo agent | তার PO / carton queue, in-transit, arrived BD |
| Supply chain | reorder queue, low stock, incoming PO |
| Finance / accountant | pending bills, reconciliation pending, receivables (profit নয়) |
| Customer service | pending confirmation orders, no-response follow-up, abandoned cart |
| Marketing | আজকের spend, campaign alerts |

যে role নেই তার panel দেখাবে না (খালি কার্ড দেখাবে না)।

## ৪. Access / Rules
- `/erp/users` (Users & Access) পেজেই role assign হয় — এটাই একমাত্র জায়গা। প্রতিটি role-এর জন্য "এই role কী কী দেখে" পরিষ্কার লেখা থাকবে।
- Role → module matrix (`access.ts`)-এ প্যাকার/কন্টেন্ট/কার্গো/finance ইত্যাদির গ্যাপ ঠিক করা হবে (যেমন packer আজ শুধু fulfillment পায় — তার order queue-ও দরকার)।
- সব role-এর জন্য self-service পেজ (my attendance, my profile) সবসময় খোলা।

## Technical notes
- `erp.index.tsx` resolver থাকবে: owner → Owner, admin → Admin, বাকি → Staff (role-aware)।
- নতুন ফাইল: `dashboard/admin/team-today-card.tsx`, `admin/order-flow-today.tsx`, `admin/courier-return-today.tsx`; `dashboard/staff/my-work-header.tsx`, `staff/panels/*.tsx` (packer, content, cargo, supply, finance, cs, marketing)।
- ডেটা: `hr_attendance`, `hr_breaks`, `hr_employees`, `orders`, `courier_shipments`, `erp_return_cases`, `imp_*`, `reorder_suggestions` — সব existing table, কোনো নতুন migration লাগবে না (KPI-র জন্য প্রয়োজন হলে পরে যোগ করব)।
- Staff dashboard-এ profit/cash/payroll কোনো query হবে না; salary শুধু নিজের row থেকে।
