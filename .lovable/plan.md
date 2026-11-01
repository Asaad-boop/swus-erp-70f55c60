# HRM Fresh Rebuild — Attendance + Break + Leave first

## Ki delete hobe (data)
- Shob attendance, break, time entry, leave request, payroll run, payslip, KPI/review record muche fela hobe.
- **Thakbe:** employee list (nam, phone, login link, salary, weekly off, shift), department, designation, leave type, holiday list — egula na thakle notun kore shobar info abar dite hobe.
- Delete-er age shob HR data-r ekta backup copy rakha hobe, jate bhul hole ferot ana jay.

## Notun HRM — simple 4 page
1. **My Day (employee)** — ek screen-e boro button: Check In → Break Start/End → Check Out. Ajker kaj-er ghonta, late, overtime live dekhabe. Phone-e easy.
2. **My Leave (employee)** — leave type, date, karon diye apply; baki balance; nijer request-er status.
3. **Team Today (manager)** — ke present/late/break-e/absent/leave/off, live.
4. **Leave Approvals (manager)** — ek tap approve/reject; approve hole attendance-e "Leave" boshbe.

## Niyom (simple)
- Ekjon-er ekbar-e ekta open session; double check-in hobe na.
- Check out bhulle raat 11:55 (Dhaka) auto close + "missed checkout".
- Shift start + grace er por ashle late. Shift-er beshi kaj = overtime. Weekly off/holiday-te kaj = puro overtime.
- Shob date/time Dhaka time-e.
- Brand alada thakle employee mishbe na.

## Porer dhap (pore)
- Overtime approval → Payroll → Performance — attendance/leave thik moto cholar por.

## Technical details
- Backup tables `_backup_hr_2026_11_01_*`, then TRUNCATE hr_time_entries, hr_breaks, hr_attendance, hr_leaves, hr_payslips, hr_payroll_runs, hr_payroll_audit, hr_kpi_entries, hr_reviews, hr_employee_events.
- Keep existing secure server fns (attendance.functions.ts, schedule.ts) but rebuild routes: consolidate my-attendance + leave card into `/erp/hr/my-day`, live into `/erp/hr/team`, leaves into approvals; remove old attendance/performance/payroll pages from sidebar until rebuilt.
- Atomic leave approve RPC kept; unit tests for late/OT/leave-day counting.
