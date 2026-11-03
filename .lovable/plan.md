# Finance Architecture & Data Integrity Audit (read-only)

Audit date: 3 Nov 2026. No data or code was changed.

## 1. How money is calculated today

There are three separate sources of numbers, and they are not kept in sync:

| Source | Used by | Coverage |
|---|---|---|
| Stored wallet balance (`erp_accounts.current_balance`, kept by a trigger on `erp_transactions`) | Account cards, Overview | All wallet movements |
| `erp_transactions` (3,477 rows) | Income/Expense, Overview, `erp_profit_loss`, `rpt_pnl_v2` (manual-only part) | All wallet movements |
| Double-entry journals (155 entries, all balanced) | Balance Sheet, General Ledger | Only import payments (125) and carton posting (30) |

Reports also take numbers straight from orders, products and marketing (`erp_profit_loss`, `rpt_pnl_v2`, `get_finance_dashboard`, dashboard widgets). Each one uses a different basis, so their totals can disagree.

**Live checks**
- 17 of 18 wallets: the stored balance matches the sum of opening balance and transactions to the paisa.
- Every journal is balanced (0 unbalanced).
- No duplicate transactions found for the same reference.
- No transaction is tagged with a different brand than its wallet.
- Brands in the database: **HobbyShop and Toyora only. SynQ With Us does not exist yet.**
- 10 of 18 wallets have no brand (shared), including PUBALI TANJIL, NEXT MOVE, SAAD CASH and INSTAPAY PATHAO.
- Period close: 0 periods closed. Approvals: none on finance entries.

## 2. Findings

### F1 (P0): NEXT MOVE has 2 leftover expense rows worth ৳1,08,913.19
- **Tables:** `erp_transactions`, `imp_payments`, the balance trigger
- **Current:** 2 `imp_payment` expense rows point to import payments that no longer exist. The stored balance (৳0) already excludes them, but any report that sums transactions counts ৳1,08,913.19 of extra Next Move spending.
- **Risk:** Inflated expense and import cost in reports. The stored balance is correct.
- **Fix:** Show both rows for review. If confirmed, cancel them with an audited correction that leaves the wallet balance unchanged. They are not deleted.
- **Migration:** None. This is a data correction you approve row by row.
- **Risk to records:** Low.
- **Test:** NEXT MOVE derived balance = stored balance = ৳0, and no orphan `imp_payment` rows remain.

### F2 (P0): Delivered orders missing from finance
- **Tables/functions:** `fn_post_order_delivery_to_finance`, `orders`
- **Current:** 34 of 49 `delivered` orders have no delivery or settlement income posting. The function quietly skips an order when it cannot work out which wallet to use. (Older orders may have been settled another way, which still needs checking.)
- **Risk:** Revenue and COD receivable are understated.
- **Fix:** Report the skipped orders with the reason for each. Add a "posting exceptions" list instead of skipping quietly. Backfill only after you approve.
- **Migration:** A read-only view, then an optional backfill that cannot post twice (the unique index already exists).
- **Test:** Every delivered order has exactly one posting or one listed exception.

### F3 (P0): Order advance may be counted twice
- **Functions:** `fn_post_order_advance_to_finance`, `fn_post_order_delivery_to_finance`
- **Current:** The advance is posted as income. The delivery posting then uses the full order total minus shipping and refund, without subtracting the advance.
- **Risk:** Advance-paid orders show the advance as income twice.
- **Fix:** Delivery income = collected COD only (total − advance − shipping − refund). Measure the effect on past orders first, then post correcting entries for the difference. Existing rows are not rewritten.
- **Test:** An order with ৳1,000 total, ৳200 advance and ৳100 shipping posts ৳200 + ৳700 = ৳900.

### F4 (P0): `partial_amount` means two different things
- **Functions:** `apply_settlement_variance_action`, delivery posting
- **Current:** Settlement stores `partial_amount = total − collected`, while delivery posting reads it as the amount collected.
- **Fix:** Use one meaning (the amount collected). Correct the affected partial-delivery orders after a dry-run list.
- **Test:** Partial delivery of ৳600 on a ৳1,000 order posts ৳600.

### F5 (P1): Balance Sheet and General Ledger formulas
- **Functions:** `get_balance_sheet`, `get_general_ledger`
- **Current:** The Balance Sheet can include draft, future-dated or deleted journal lines, because the filter sits on a LEFT JOIN. The General Ledger opening balance leaves out movements before the start date.
- **Fix:** Correct both formulas. This only changes reports, not data.
- **Test:** Totals for a fixed date range match a hand-calculated query, and a deleted journal changes nothing.

### F6 (P1): Journals cover only imports
- **Current:** Transfers, COD collection, manual income and expense, adjustments, and order delivery or advance postings create no journal. That is why the Balance Sheet and GL cannot be fully trusted.
- **Fix (single source of truth):** Make `erp_transactions` the authoritative money ledger. Add one guarded posting function that writes journals for every transaction type, linked by `source_type`/`source_id` with a unique index so a journal can never be posted twice. Backfill journals for past transactions in dated batches, with a dry run first. Wallet balances stay trigger-based and are checked against both sources every night.
- **Risk:** Medium. Backfilling adds journal rows only and never touches transactions or balances.
- **Test:** For each wallet, transaction-derived balance = journal balance = stored balance.

### F7 (P1): Transfers and COD collection run from the browser
- **Files:** `transfer-dialog.tsx`, `cod-collection-dialog.tsx`
- **Current:** These insert rows directly from the browser. The balance check runs in the browser only, and there is no idempotency key.
- **Risk:** Two quick clicks or two people at once can create a duplicate entry or an overdraft.
- **Fix:** Move both into server-side functions that lock the wallet and take an idempotency key, following the pattern `_imp_record_payment` already uses.
- **Test:** A double submit creates one row, and an over-balance transfer is rejected.

### F8 (P1): Opening balance edits break the reconciliation
- **Current:** Editing an account's opening balance does not move the current balance and leaves no audit row.
- **Fix:** Lock the opening balance once the account has transactions. Corrections go through an audited adjustment.

### F9 (P1): Import payment corrections delete history
- **Functions:** `imp_reverse_payment`, the correction flow
- **Current:** A reversal deletes the transaction and its journal. A correction runs as two separate calls, and reusing an idempotency key with a different amount quietly returns the old payment.
- **Fix:** Post a reversing entry instead of deleting. Run correction as one call. Reject an idempotency key that comes with a different amount.
- **Test:** A reversed payment leaves original + reversal and net ৳0, and history is kept.

### F10 (P1): Next Move bills and dues have no ledger
- **Tables:** `imp_purchase_orders`, `imp_payments`, `imp_cargo_ledger`, `imp_cargo_bills`
- **Current:** Bills come from PO fields. Shipping is stored in two formats (`freight_cost_bdt` / `shipping_total_bdt`). Most cartons have no weight. Payments are tracked per carton. There is no supplier payable ledger and no advance allocation record. The `cargo_*` functions are defined but no code that uses them was found.
- **Fix:** Build a read-only Next Move statement view (bill, payment, advance, allocation, running due) from the existing rows. Use one shipping field. Keep local courier separate (as already agreed).
- **Test:** The statement total matches the figures already agreed (13 active POs).

### F11 (P1): Courier settlement can be imported twice
- **Tables:** `erp_courier_settlement_lines` (empty today), `erp_reconciliation_runs` (299 runs)
- **Current:** Nothing stops the same settlement from being imported twice. Bank receipts are not matched to remittances (`erp_cod_remittances` = 0).
- **Fix:** Add a unique key on courier + consignment + invoice. Add a remittance-to-bank-receipt matching step.

### F12 (P1): No real monthly closing
- **Current:** The closed-period guard protects only `erp_transactions`. Journals, wallets and import postings are not covered. No period has ever been closed.
- **Fix:** Extend the guard to journals, import posting and opening balances. Add a close checklist (balances matched, exceptions cleared).

### F13 (P2): Brand separation and SynQ
- **Current:** Shared wallets have no brand. SynQ With Us is not set up as a brand. Profit per brand relies on order and transaction brand tags, which are correct today (0 mismatches).
- **Fix:** Create SynQ With Us as a brand (needs your confirmation). Keep shared wallets, but tag every transaction with a brand (already enforced) and show a brand-wise cash allocation report. Brand-level cash = attributed inflows − outflows.

### F14 (P2): Other report problems
- `get_finance_dashboard` still refers to a table that has been dropped, and it counts COD without removing duplicates.
- `erp_profit_loss` uses the current product cost and may count delivery income twice.
- **Fix:** Retire both and route everything to the canonical marketing/P&L functions (per existing memory), adding a "basis" label on each report.

### F15 (P2): Approvals and audit
- **Current:** Changes to journal headers are audited (400 audit rows). Transactions, wallets and journal lines are not fully audited. There is no approval step.
- **Fix:** Add an audit trigger on transactions and accounts. Require optional approval for manual entries and adjustments above a limit you choose.

## 3. Phased proposal

| Phase | Scope | Changes data? |
|---|---|---|
| 1 | Integrity dashboard: drift per wallet, orphans, unposted delivered orders, duplicate checks, nightly check | No (views only) |
| 2 | Fix formulas F3, F4, F5, F14 for future postings and reports, plus a dry-run impact report for past data | No historical changes |
| 3 | Safe server-side money operations F7, F8, F9, plus audit triggers F15 | New rows only |
| 4 | Approved corrections: F1 orphans, F2 backfill, F3/F4 correcting entries | Correction entries only, each list approved by you |
| 5 | Journal for every transaction F6, with backfill in batches | Adds journal rows |
| 6 | Next Move statement F10 + courier settlement and bank matching F11 | Read views + unique key |
| 7 | Monthly close F12, brand setup F13, approvals | Rules |

**Guarantees for every phase:** nothing is deleted, balances are never reset, transactions are never recreated, every correction is a new audited entry, a dry run comes before any backfill, and unique indexes prevent duplicates.

## 4. Decisions needed
1. Should SynQ With Us be created as a third brand?
2. Should shared wallets stay brand-less (my recommendation) or be split by brand?
3. Above what amount should a manual entry need approval?
