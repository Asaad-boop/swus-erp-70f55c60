# HRM Live Attendance (reference-style)

Reference screenshot দুটো অনুযায়ী HRM-এ দুটো নতুন স্ক্রিন + real-time punch system যোগ করা হবে। বর্তমান HRM (Employees, Leave, Payroll, KPI) অপরিবর্তিত থাকবে; শুধু attendance অংশ live হবে।

## 1. My Attendance (নিজের হাজিরা)
`/erp/hr/my-attendance`
- বড় কার্ড: আজকের তারিখ, Check In / Check Out সময়, Work Hours, স্ট্যাটাস ব্যাজ (Not started / Working / On break / Completed)
- প্রাইমারি বাটন: Check In → Start break / End break → Check Out → "Check In Again" (ভুলে চেকআউট করলে)
- ৪টি স্ট্যাট কার্ড: Check-in Time (on time/late), Total Hours, Break Time (কয়টা break), Net Work Hours
- Today's Breaks লিস্ট (শুরু–শেষ, মিনিট)
- Status সেকশন

## 2. Live Dashboard (Workforce Command Center)
`/erp/hr/live`
- হেডার: gradient "Live Dashboard" ব্যানার + Refresh, ডানপাশে Attendance %, Updated time
- KPI টাইল: Total, Present, On break, Not in, Left (checked out)
- ৩টা ভিউ ট্যাব:
  - **Table** — প্রতি employee: status dot, check-in, check-out, break, net hours
  - **Timeline** — ঘণ্টা-ভিত্তিক টাইমলাইন বার (work / break), "NOW" মার্কার সহ
  - **Activity** — আজকের সব punch/break ইভেন্ট ফিড
- ৬০ সেকেন্ড পরপর auto refresh (load কম রাখতে), "Live polling" ইন্ডিকেটর

## 3. Data (নতুন টেবিল)
- `hr_time_entries` — employee, work_date, check_in, check_out, source, note
- `hr_breaks` — time_entry ধরে break_start / break_end
- দুটোতেই RLS: নিজের রেকর্ড নিজে দেখা/লেখা যাবে, HR admin/manager + admin সব দেখতে ও এডিট করতে পারবে
- Punch করলে সেদিনের `hr_attendance` রেকর্ড অটো তৈরি/আপডেট হবে (present/late, check_in, check_out, late_minutes, overtime_minutes) — ফলে Payroll ও Attendance রিপোর্ট আগের মতোই কাজ করবে
- অফিস শুরু/শেষ সময় ও grace minutes `app_settings`-এ (default 10:00–19:00, 15 min grace)

## 4. Navigation
HR subnav-এ যোগ হবে: **Live** এবং **My Attendance** (Overview-এর পাশে)। বাকি ট্যাব আগের মতো।

## টেকনিক্যাল
- Punch লজিক server function-এ (`src/lib/erp/hr/attendance.functions.ts`): `punchIn`, `punchOut`, `startBreak`, `endBreak`, `myToday`, `liveBoard` — সব `requireSupabaseAuth` দিয়ে, তাই সময় সার্ভার-সাইড (client clock spoof করা যাবে না)
- Live board data একটাই query-তে (employees + today's entries + breaks), react-query `refetchInterval: 60s`
- UI বর্তমান HR design token/`hr-shell` প্যাটার্নেই — কোনো hardcoded color নয়
