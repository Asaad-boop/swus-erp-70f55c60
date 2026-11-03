# Finance Phase 2: Fix the formulas for new postings (needs approval)

Phase 1 is done and read-only: the new page is Finance → Integrity. No historical record was changed.

## Phase 1 findings (live data, 3 Nov 2026)

| Check | Result |
|---|---|
| Wallet drift | 17 of 18 wallets match. **NEXT MOVE: ৳1,08,913.19** |
| Orphan transactions | 2 (exactly the NEXT MOVE drift) |
| Same-source duplicates | 0 |
| Unbalanced journals | 0 |
| Transaction brand ≠ wallet brand | 0 |
| Advance counted twice | 5 orders, ৳374.40 extra income in total |
| Delivered orders without a delivery posting | 34 → 31 had nothing to collect, 3 are covered by courier reconciliation only, **0 truly unposted** |
| Partial deliveries without a posting | 85, all matched in courier reconciliation |

### NEXT MOVE: ৳1,08,913.19, exact cause
- Txn `16d0aaf5…`, 16 Aug 2026, HobbyShop, ৳1,00,254.00: "Import supplier advance (PO PO-HOBB-2608-00010)"
- Txn `9a0bfc27…`, 24 Aug 2026, Toyora, ৳8,659.19: "Import supplier advance (PO PO-TOYO-2608-00015)"
- **What happened:** both import payments and their journals (JE-202608-00001, JE-202608-00011) were deleted on 26 Aug and 31 Aug by the same user. The audit log keeps the journal copies.
- The wallet balance was given back on deletion. The two expense rows, however, were left behind.
- **Effect on each report:**
  - Stored wallet balance (৳0): correct.
  - Balance Sheet / GL: not affected, because the journals are gone.
  - Income/Expense list, Overview "spend", `erp_profit_loss` other expense, and import-cost totals: overstated by ৳1,08,913.19. HobbyShop is overstated by ৳1,00,254.00 and Toyora by ৳8,659.19.
  - `rpt_pnl_v2` is not affected, because it only reads manual rows.

### The 5 advance double counts
TY-0000348 (+৳53.00), HS-0001859 (+৳62.10), TY-0000369 (+৳86.40), TY-0000366 (+৳88.40), TY-0000320 (+৳84.50). In each, delivery posting + ৳200 advance is more than the order total.

## Phase 2 scope (formulas only; past records are not changed)

1. **Delivery posting formula:** collected COD = total − advance − shipping − refund. This applies only to orders delivered after release.
2. **One meaning for partial delivery:** `partial_amount` means the amount collected. The settlement action and the delivery posting will both use that meaning from now on.
3. **Balance Sheet:** draft, deleted and future-dated journal lines are left out.
4. **General Ledger:** the opening balance includes every movement before the start date.
5. **Old dashboard and P&L:** `get_finance_dashboard` stops pointing to the dropped table, and `erp_profit_loss` stops counting delivery income twice. Each report shows a small label saying what it is based on.
6. **Brand setup:** add SynQ With Us as the third brand. Its wallet and settings are empty, and its default warehouse is created by the existing trigger.
7. **Settings record:** approval threshold ৳20,000, editable in Finance Settings. It is stored but only enforced in Phase 3.
8. **Dry-run impact report:** the Integrity page gets a "Phase 4 preview" listing the exact correcting entries that would be needed. Nothing is posted; they still need owner authorization later.

## Not in Phase 2
Voiding the 2 orphans, backfilling, correcting the 5 orders, adding journals for past transactions, approvals, and month close. These come in Phase 3 onwards, after owner authorization.

## Acceptance tests
- New order: ৳1,000 total, ৳200 advance, ৳100 shipping → delivery ৳700 + advance ৳200.
- Partial delivery of ৳600 on a ৳1,000 order posts ৳600.
- Balance Sheet totals are unchanged when a deleted or draft journal exists.
- GL opening for 1 Oct = all movements before 1 Oct.
- After release, every Integrity test still shows the same counts. Past rows are untouched (row count and sum of `erp_transactions` checked before and after).
- SynQ With Us appears in the brand picker, with ৳0 everywhere.

## Technical notes
- Changes: replace the functions `fn_post_order_delivery_to_finance`, `apply_settlement_variance_action`, `get_balance_sheet`, `get_general_ledger`, `get_finance_dashboard` and `erp_profit_loss`; one insert into `brands`; one settings key.
- A trigger guard ensures the new formula fires only for orders that become delivered after the release time, so editing an old order cannot re-post it.
