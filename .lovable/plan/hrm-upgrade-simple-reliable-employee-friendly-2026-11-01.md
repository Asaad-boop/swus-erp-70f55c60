# HRM Upgrade — Simple, Reliable, Employee-friendly

Goal: employee-ra shohoje attendance, break, weekly holiday, overtime, leave, payroll ar performance use korte parbe. Kono jinish complex hobe na.

## Phase 1 — Attendance thik kora (shobcheye age)
- Check In / Break / Check Out: ek tap, boro button, phone-e easy.
- Ekbar-e ekta open session; double check-in block.
- Bhule check-out na korle raat-e auto close + "missed checkout" flag (10ta purono open session clean).
- Dhaka time-e date/late/overtime hisab.
- Brand mixing bondho: shudhu nijer brand-er employee/attendance dekhabe.

## Phase 2 — Weekly holiday + Shift
- Protiti employee-r weekly off day (jemon Friday) set kora jabe.
- Off day-te kaj korle automatic overtime.
- Shift time (start/end, grace minutes) diye late hisab.
- Public holiday list.

## Phase 3 — Leave (employee nije apply korbe)
- Employee nijer dashboard theke leave apply, balance dekhbe.
- Manager approve/reject; approve hole attendance-e "Leave" auto boshbe (ekshathe, ekta fail korle duto-i fail).

## Phase 4 — Overtime
- Shift-er beshi kaj = overtime request; manager approve korle payroll-e jabe.
- Overtime rate employee/settings theke.

## Phase 5 — Payroll
- Mash shesh-e ek click-e payroll run: base salary + approved overtime − unpaid leave/absent − late deduction (setting on/off).
- Payslip employee nijer dashboard-e dekhbe/PDF download.
- Payroll lock korar por change audit-e thakbe.

## Phase 6 — Performance
- Monthly simple score: attendance %, punctuality, overtime, manager rating (1–5) + short note.
- Employee nijer score dekhbe; owner team summary dekhbe.

## Kivabe korbo
- Phase dhore dhore; protiti phase shesh-e janabo, "next" bolle porer ta.
- Existing data/flow bhangbo na; important rule-er test likhbo.

## Technical notes
- Attendance/leave/payroll write-gulo server-side RPC-te atomic; brand-scoped RLS.
- Auto-close via scheduled job; Dhaka timezone helpers reuse.
