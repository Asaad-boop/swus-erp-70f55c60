# Roadmap

## Project monitoring safety review
- [x] Review all 15 findings against current code and live definitions; preserve intentional Growth Studio removal (false positive).
- [x] Apply 9 low-risk fixes: courier column mapping, fixed bars, stable/full aggregate pagination, activity refresh, owner key permission, brand-safe cache, sidebar focus, receipt notes. Ten regression tests pass; preview/CSS/receipt checks pass.
- Deferred by safety instruction: billing total gross-vs-COD convention (decision required), CRM refresh (performance + row isolation review required), scanner undo (atomic conflict protection required), webhook duplicates (atomic claims + crash recovery required), packing counter/link mismatch (combined queue semantics required). Findings remain unresolved; no risky changes applied.
- Authenticated end-to-end checks unavailable: externally managed Supabase provides no test session. Verify real courier booking, owner settings save and live order activity in the signed-in app.

## ERP deep-dive fixes (step by step)
- [x] 1. Order status: row lock + illegal backward jump guard
- [x] 7. Bulk status batched RPC (+ wire order list)
- [x] 2. Order total server-side recompute
- [x] 3. PO release cost price race/stale
- [x] 4. Courier bucket filter server-side
- [x] 5. CRM customer list server pagination
- [x] 6. Cash flow/inventory summary row cap
- [x] 8. ROAS single formula
- [x] 9. HR leaves Asia/Dhaka dates
- [x] 10. Order filter logic shared (export pre_order)
- [x] 11. Orders list error state
- [x] 12-15. Stock aging, supplier scorecard, leave balance, payroll audit
- [ ] 16-19. cohort/LTV, abandoned cart auto, bulk assign, global SLA alert
- [ ] 20-23. Admin-check helper, route error boundaries, monolith split, shared realtime hook

## Campaign Profit Truth — open
- [ ] Live authenticated UI verification pending (external Supabase — no preview session available)

## Dashboard split
- [x] Owner overview redesign — Executive Command Center focused-feed hierarchy
- [ ] Phase 3b: Owner Leak Panel + Risk Alerts consolidated section
- [ ] Phase 4: Staff dashboard — announcements/holidays + deeper role-adaptive queues
- [x] BOM Phase 1+2 (components, BOM manager) — awaiting review
- [ ] BOM Phase 3 assembly (after review)
- [ ] Phase 4 procurement — technical mapping first
- [ ] Phase 5-6 pricing / replenishment
