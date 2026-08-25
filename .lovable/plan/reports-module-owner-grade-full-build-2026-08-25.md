# Reports Module — owner-grade full build

Reports Hub-এ এখন ১১টা tab (overview, sales, orders, products, customers, inventory, marketing, returns, supply, finance, control) live আছে, সব canonical `rpt_*` RPC থেকে চলে। আপনার spec-এর সাথে মিলিয়ে যেগুলো **নেই** সেগুলোই এই প্ল্যানে যোগ হবে — পুরোনো accurate অংশ ভাঙা হবে না।

## এখন যা মিসিং (gap list)

| Spec section | অবস্থা |
|---|---|
| 1. Executive overview | আংশিক — global filter (brand/category/channel/courier/payment/warehouse) ও period comparison নেই |
| 8. Expense reports | নেই (category/brand/department/month + budget vs actual) |
| 13. Cash flow (Cash In / Cash Out / Opening–Closing) | নেই (শুধু daily cash আছে) |
| 15. Brand-wise consolidated P&L | নেই |
| 16. Warehouse reports | নেই |
| 17. Team / employee performance | নেই |
| 18. Daily business report | নেই |
| 19. Monthly business report | আংশিক (period close আছে, PDF planned) |
| 6. Product cost history | নেই |
| 20. ABC / cohort / break-even / forecast | নেই |

## Phase 1 — Foundation (data dictionary + filters)

- `src/lib/erp/reports/canonical.ts` metric dictionary বাড়ানো: expense, cash-flow, warehouse, team, ABC, break-even metric definitions — প্রতিটার source + formula + basis সহ। registry.ts-এ নতুন প্রতিটা report entry।
- **Global filter bar**: date + brand-এর পাশে channel, courier, payment method, category, warehouse; URL search param-এ persist, সব tab একই filter context পাবে (React context, প্রতিটা RPC-তে optional param হিসেবে pass)।
- **Comparison engine**: Today/Yesterday, This week/Last week, This month/Last month, This year/Last year — এক ক্লিকে prev-period সব KPI-তে delta chip (KpiStrip-এ `prev` already supported)।

## Phase 2 — Finance depth

- **Cash Flow report** (নতুন RPC `rpt_cash_flow`): Opening cash → Cash In (customer collection, COD settlement, bank/bKash/Nagad, investment, other income) → Cash Out (supplier, salary, ads, courier, rent, packaging, other) → Closing cash; account-wise breakdown সহ।
- **Expense report** (`rpt_expense_breakdown`): category / brand / department / month pivot + budget vs actual (`erp_budgets` থেকে) + variance %।
- **Brand-wise consolidated P&L** (`rpt_pnl_by_brand`): প্রতিটা brand-এর sales, COGS, marketing, opex, net profit, margin — side-by-side column view + company total।

## Phase 3 — Ops reports

- **Warehouse tab**: warehouse-wise stock qty ও value, stock in/out, transfers, damaged/missing, warehouse-wise delivered sales।
- **Team performance tab**: CS (calls, confirmed, confirmation %, cancelled), packing (packed orders, avg pack time, pending) — `activity_log` + `order_status_history` + `hr_employees` থেকে।
- **Product cost history**: প্রতিটা SKU-র date-wise supplier, qty, unit landed cost (imp PO + local PO থেকে) — costing drift ট্র্যাক করার জন্য।

## Phase 4 — Scheduled business reports

- **Daily Business Report**: আজকের Sales/Orders/Delivered/Cancelled/Returned/Units/Ad spend/COGS/Gross/Net profit + yesterday comparison; এক পাতা, print/PDF-ready, owner dashboard-এও card হিসেবে।
- **Monthly Business Report PDF**: closed-period snapshot থেকে official archive PDF (registry-তে যেটা "planned" ছিল) — previous month comparison সহ।

## Phase 5 — Advanced analytics

- **ABC analysis** (revenue-এর 80/15/5 cut), **Contribution margin** ranking, **Break-even** (fixed cost ÷ contribution margin per order), **Cohort** (first-purchase month × repeat months), **Forecast** (trailing velocity থেকে expected sales, stock-out date, purchase ও cash requirement)।

## Technical notes

- সব নতুন number Postgres RPC (`rpt_*`, `SECURITY DEFINER`, শুধু `authenticated` + `service_role` grant) — client-এ কোনো inline calculation নয়, "one number = one source = one formula" রুল বজায় থাকবে।
- প্রতিটা নতুন report registry entry ছাড়া merge হবে না; Report Index drawer-এ automatic দেখাবে।
- Timezone সর্বত্র `Asia/Dhaka`; প্রতিটা report-এ date basis দৃশ্যমান ও switchable।
- UI বর্তমান "Midnight Indigo Editorial" design system (`report-kit.tsx`, `rpt-*` tokens) মেনেই — নতুন tab গুলো Panel/KpiStrip/ExportMenu reuse করবে, প্রতিটাতে Excel/CSV/PDF export।
- Data না থাকলে card/section hide হবে, ফাঁকা শূন্য দেখাবে না।

## Delivery order

Phase 1 → 2 → 3 → 4 → 5, প্রতি phase আলাদা করে ডেলিভার করব যাতে মাঝপথেই ব্যবহার শুরু করা যায়।
