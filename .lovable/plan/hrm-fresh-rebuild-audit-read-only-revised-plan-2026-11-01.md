# HRM Fresh Rebuild — Audit (read-only) + Revised Plan

Kono data delete/change kora hoyni. Nicher shob row count live database theke pora (1 Nov 2026, 18:35 Dhaka).

## 1. Existing schema findings

| Table | Rows | Policies | Triggers | Links |
|---|---:|---:|---:|---|
| hr_employees | 3 (3 login linked) | 2 | 1 | brands, departments, designations; 9 table eke refer kore |
| hr_time_entries | 13 (0 open) | 4 | 2 | employee; breaks eke refer kore |
| hr_breaks | 2 | 4 | 3 | employee, time_entry |
| hr_attendance | 14 | 2 | 1 | employee |
| hr_leave_types | 3 | 2 | 1 | leaves eke refer kore |
| hr_leaves | 0 | 3 | 1 | employee, leave_type |
| hr_holidays / departments / designations | 0 / 0 / 0 | 2 each | 1 each | — |
| hr_payroll_runs / payslips / payroll_audit | 0 / 0 / 0 | 1/2/1 | 2/2/0 | brands, erp_accounts |
| hr_kpi_entries / reviews / employee_events / documents | 0 each | 2 each | 1 each | employee |

- DB functions: hr_auto_close_stale_sessions, hr_decide_leave, hr_cancel_my_leave, hr_count_working_days, hr_effective_break_allowance, hr_recalc_attendance, hr_sync_attendance_from_entry, hr_sync_attendance_from_break, hr_payroll_audit_trg, hr_touch_updated_at.
- Scheduled job: `hr-auto-close-sessions` at 17:55 UTC (= 23:55 Dhaka), SQL-only.
- Unique index: ek employee-er ekta-i open time entry.
- Pages: hr index, access, attendance, employees, leaves, live, my-attendance, payroll, performance, settings.

**Key finding:** reset-e muchar moto asol data khub kom — shudhu 13 time entry, 2 break, 14 attendance row. Leave/payroll/performance shob ekhono khali.

## 2. Data retention / reset matrix

| Data | Decision |
|---|---|
| Employees, salary, phone, login link, shift, weekly off, brand | **Keep, untouched** |
| Departments, designations, leave types, holidays | **Keep** |
| Payroll, payslips, KPI, reviews, documents, events | **Keep** (khali; page sidebar theke lukano) |
| Time entries (13), breaks (2), attendance (14) | **Decision dorkar** — Option A: rekhe dei (recommended, shob test data hole-o kono khoti nei). Option B: backup-er por clear. |
| Leaves (0) | Kichu korar nei |

## 3. Backup & restore plan (shudhu Option B nile)
1. Ekta transaction-e `hr_backup` private schema-te 3 table-er copy + `backed_up_at` timestamp.
2. Verify: original vs backup row count + checksum (md5 of ordered rows) mile kina; mile na hole stop.
3. Access: schema-te anon/authenticated-er kono grant nei; shudhu service_role/owner.
4. Restore: FK order-e insert — time_entries → breaks → attendance — trigger disable rekhe, tarpor count verify.
5. Retention: 90 din por backup drop (alada approval-e).
Backup ekhono **toiri hoyni**.

## 4. Revised technical plan

**Pages**
- `/erp/hr/my-day` — boro Check In / Break Start / Break End / Check Out button, ajker ghonta, late, OT live.
- `/erp/hr/my-leave` — apply (full/half day), type-wise balance, history, pending cancel.
- `/erp/hr/team` — present / late / on break / absent / leave / off / holiday, live.
- `/erp/hr/leave-approvals` — approve/reject + note.
- Sidebar-e Payroll, Performance, purono Attendance page lukano; data ar code thakbe.

**Business rules**
- State machine (server + DB trigger): off → in → break → in → out. Invalid transition reject.
- Ekta open session (existing unique index), break-o ekta open.
- Shob hisab Asia/Dhaka. Session-er date = check-in-er Dhaka date (overnight shift ager din-e gona).
- Late = check-in > shift start + grace. Worked = session − break (allowance-er beshi break = deduct). OT = worked − shift length (min threshold). Weekly off/holiday = puro OT, late na.
- Absent = working day, kono session/leave nei, din shesh.
- Auto-close 23:55 Dhaka: shudhu shift shesh hoye geche emon open session, shift end-e close, `auto_closed=true`, original check-in rakha; idempotent (already closed skip); run log table-e count likhe monitor.
- Leave approve (hr_decide_leave review kore reuse): overlap check, balance check (half day = 0.5), attendance conflict (oi din session thakle block/warn), approval + attendance mark + balance ek transaction-e.
- Access: employee shudhu nijer; manager/hr_admin nijer brand-er; check server function + RLS duitatei.
- Audit: protiti punch/approve event `hr_attendance_events` append-only table-e (actor, time, old/new state); 2 bochor rakha.

**Tests**: transitions, double check-in, late/grace, OT, overnight, holiday, half-day leave counting, overlap, duplicate approve, other-brand access deny, Dhaka midnight, auto-close idempotent.

## 5. Risks & decisions needed
1. **Reset: Option A (rekhe dei) naki B (backup + clear)?**
2. Half-day leave lagbe? (ekhon schema-te support nei — notun column dorkar)
3. Overnight shift ache kono employee-r? (na thakle simple rakhbo)
4. Leave approve kara korbe — shudhu HR admin/owner, naki department manager-o?
- Risk: auto-close job nijer schedule-e chole; bodlale purono job unschedule kore notun, ekbar-e.
- Risk: types file migration-er por regenerate hoy; code oi por-e.
