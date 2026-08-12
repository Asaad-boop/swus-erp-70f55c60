---
name: Reporting canonical rules
description: Reports Hub-এর core rules — one number = one source = one formula, master registry, reconciliation chain, period close, monthly archive PDF
type: feature
---
- **Core rule:** একটা number = একটা source = একটা formula. কোনো tab/page inline calculation করবে না; সব canonical layer (`rpt_lines`, `rpt_pnl_v2`, `get_campaign_profit`, `src/lib/erp/reports/canonical.ts`) থেকে আসবে।
- **Master Report Registry** (`src/lib/erp/reports/registry.ts`): প্রতিটা report-এর id, name, category, tab, source, formula, date basis, filters, export types, status (Live/Scattered/Planned/Data missing)। Registry entry ছাড়া নতুন report add করা যাবে না।
- **Reconciliation chain**: Sales → Orders → Delivery → Returns → Revenue → COGS → Gross profit → Expenses → Net profit → Cash. Gap থাকলে system নিজে explain করবে (`rpt_reconcile_chain`)।
- **Period Close** (`rpt_period_close`): মাস close হলে snapshot freeze; closed period-এ backdated posting blocked; correction শুধু visible adjustment entry দিয়ে, overwrite নয়।
- **Monthly Business Report PDF**: closed snapshot থেকে generate, physical archive-যোগ্য official record।
- Accounting accuracy > Executive dashboard polish — Executive tab সবসময় শেষে।
- Timezone সর্বত্র `Asia/Dhaka`; প্রতিটা report-এ date basis দৃশ্যমান ও switchable।
