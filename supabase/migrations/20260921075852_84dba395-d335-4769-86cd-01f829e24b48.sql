-- 1) Reconciliation: finance staff only
DROP POLICY IF EXISTS "Authenticated can manage reconciliation runs" ON public.erp_reconciliation_runs;
DROP POLICY IF EXISTS "Authenticated can manage reconciliation rows" ON public.erp_reconciliation_rows;
CREATE POLICY "Finance staff manage reconciliation runs" ON public.erp_reconciliation_runs FOR ALL TO authenticated USING (public.is_finance_staff(auth.uid())) WITH CHECK (public.is_finance_staff(auth.uid()));
CREATE POLICY "Finance staff manage reconciliation rows" ON public.erp_reconciliation_rows FOR ALL TO authenticated USING (public.is_finance_staff(auth.uid())) WITH CHECK (public.is_finance_staff(auth.uid()));

-- 2) Return timeline: staff only
DROP POLICY IF EXISTS "Authenticated can insert timeline" ON public.erp_return_timeline;
DROP POLICY IF EXISTS "Authenticated can read timeline" ON public.erp_return_timeline;
CREATE POLICY "Staff read timeline" ON public.erp_return_timeline FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff insert timeline" ON public.erp_return_timeline FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

-- 3) Meta financial tables: staff read, admin write stays
DROP POLICY IF EXISTS wallet_read ON public.meta_ad_wallet_ledger;
CREATE POLICY wallet_read ON public.meta_ad_wallet_ledger FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS fifo_read ON public.meta_fifo_lots;
CREATE POLICY fifo_read ON public.meta_fifo_lots FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS spend_consump_read ON public.meta_spend_consumptions;
CREATE POLICY spend_consump_read ON public.meta_spend_consumptions FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "auth read meta_capi_log" ON public.meta_capi_log;
CREATE POLICY "staff read meta_capi_log" ON public.meta_capi_log FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- 4) Meta tracking config (CAPI secrets): admin only
DROP POLICY IF EXISTS "auth read meta_tracking_config" ON public.meta_tracking_config;
CREATE POLICY "admin read meta_tracking_config" ON public.meta_tracking_config FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 5) Hub planning: staff only
DROP POLICY IF EXISTS "Staff manage plan scenarios" ON public.hub_plan_scenarios;
CREATE POLICY "Staff manage plan scenarios" ON public.hub_plan_scenarios FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "hub comments staff" ON public.hub_comments;
CREATE POLICY "hub comments staff" ON public.hub_comments FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- 6) Inventory snapshots/audit: staff only
DROP POLICY IF EXISTS "staff read snapshot runs" ON public.inv_snapshot_runs;
CREATE POLICY "staff read snapshot runs" ON public.inv_snapshot_runs FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "staff read snapshot rows" ON public.inv_snapshot_rows;
CREATE POLICY "staff read snapshot rows" ON public.inv_snapshot_rows FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "staff read stock audit" ON public.inv_stock_audit;
CREATE POLICY "staff read stock audit" ON public.inv_stock_audit FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- 7) Local PO / stocktake / reorder: staff only
DROP POLICY IF EXISTS auth_all_local_po ON public.local_purchase_orders;
CREATE POLICY auth_all_local_po ON public.local_purchase_orders FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS auth_all_local_po_items ON public.local_po_items;
CREATE POLICY auth_all_local_po_items ON public.local_po_items FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS auth_all_local_po_receipts ON public.local_po_receipts;
CREATE POLICY auth_all_local_po_receipts ON public.local_po_receipts FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS auth_all_local_po_receipt_items ON public.local_po_receipt_items;
CREATE POLICY auth_all_local_po_receipt_items ON public.local_po_receipt_items FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS auth_all_stocktake_sessions ON public.stocktake_sessions;
CREATE POLICY auth_all_stocktake_sessions ON public.stocktake_sessions FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS auth_all_stocktake_items ON public.stocktake_items;
CREATE POLICY auth_all_stocktake_items ON public.stocktake_items FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS auth_all_reorder_suggestions ON public.reorder_suggestions;
CREATE POLICY auth_all_reorder_suggestions ON public.reorder_suggestions FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- 8) Reports: finance staff only
DROP POLICY IF EXISTS "Staff can read snapshots" ON public.rpt_snapshots;
CREATE POLICY "Finance read snapshots" ON public.rpt_snapshots FOR SELECT TO authenticated USING (public.is_finance_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff manage subscriptions" ON public.rpt_subscriptions;
CREATE POLICY "Finance manage subscriptions" ON public.rpt_subscriptions FOR ALL TO authenticated USING (public.is_finance_staff(auth.uid())) WITH CHECK (public.is_finance_staff(auth.uid()));

-- 9) Fix mutable search_path on own functions
ALTER FUNCTION public.crm_normalize_phone(text) SET search_path = public;
ALTER FUNCTION public.normalize_phone_tail(text) SET search_path = public;
ALTER FUNCTION public.tg_touch_updated_at() SET search_path = public;

-- 10) Views: enforce querying user's RLS instead of view owner's
ALTER VIEW public.imp_cargo_balances SET (security_invoker = on);
ALTER VIEW public.v_brand_catalog SET (security_invoker = on);
ALTER VIEW public.v_combo_summary SET (security_invoker = on);
ALTER VIEW public.v_meta_spend_reconciliation SET (security_invoker = on);
ALTER VIEW public.v_mkt_attribution_possibly_overwritten SET (security_invoker = on);
ALTER VIEW public.v_product_incoming SET (security_invoker = on);

-- 11) CRM materialized view out of the Data API (app falls back to the live invoker view)
REVOKE SELECT ON public.crm_customers_mv FROM anon, authenticated;