# নতুন Feature ধাপ (#12–19) — ধাপে ধাপে

প্রতিটা আলাদা ধাপে করবো, একটা শেষ হলে পরেরটা। কোনো পুরোনো data বদলাবে না, শুধু নতুন report/feature যোগ হবে।

## ধাপ A — Inventory ও Supplier
**#12 Stock aging / Dead stock report** (Inventory Reports-এ নতুন tab)
- প্রতিটা product শেষ কবে বিক্রি হয়েছে, কত দিন ধরে পড়ে আছে
- Bucket: 0–30 / 31–60 / 61–90 / 90+ দিন, প্রতিটায় কত পিস আর কত টাকার মাল আটকে আছে
- "Dead stock" (৯০+ দিন কোনো বিক্রি নাই) list, CSV download

**#13 Supplier scorecard** (Suppliers page-এ)
- প্রতিটা supplier-এর মোট PO, মোট টাকা, গড় delivery সময় (order → BD arrival), দেরি হওয়া PO, কম/ভুল পিস আসার হার
- সহজ score (A/B/C) আর তুলনা table

## ধাপ B — HR
**#14 Leave balance** — প্রতিটা leave type-এ বছরে কত দিন পাবে (HR Settings-এ সেট), কত নিয়েছে, কত বাকি; leave apply করার সময় বাকি দিন দেখাবে, বেশি হলে warning
**#15 Payroll audit trail** — payroll run / payslip-এ কে কখন কী বদলালো (আগের → নতুন সংখ্যা), payslip-এর পাশে history

## ধাপ C — Customer ও Sales
**#16 Cohort / LTV** — কোন মাসে প্রথম order করা customer পরের মাসগুলোতে কতজন আবার কিনলো (cohort table), গড় lifetime value, repeat rate
**#17 Abandoned cart auto-recovery** — নির্দিষ্ট সময় পরে (যেমন ১ ঘণ্টা) auto SMS যাবে, একবারের বেশি না; recover হলে track

## ধাপ D — Team ও Alert
**#18 Bulk staff assign** — Order List-এ অনেক order select করে একসাথে staff assign
**#19 Global SLA alert** — নির্দিষ্ট সময়ের বেশি আটকে থাকা order (যেমন confirmed ২৪ ঘণ্টা+, packed ৪৮ ঘণ্টা+) header-এ badge আর list

## Technical notes
- #12, #13, #16: Postgres RPC (Asia/Dhaka), brand scoped, staff-only EXECUTE; নতুন table লাগবে না
- #14: `hr_leave_entitlements` table (+GRANT, RLS); #15: `hr_payroll_audit` table + trigger on hr_payslips/hr_payroll_runs
- #17: existing abandoned cart SMS function + cron route `/api/public/cron.abandoned-recovery` (secret-verified), `abandoned_carts.auto_sms_sent_at` column
- #18: `orders.assigned_to` bulk update via batched RPC; #19: SLA threshold `app_settings`-এ, একটা count RPC
- প্রতিটা ধাপ শেষে typecheck + DB-তে সংখ্যা মিলিয়ে দেখা
