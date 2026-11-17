BEGIN;
CREATE TABLE public._backup_curtain_merge_20261117 (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, source_table text NOT NULL, original_record jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public._backup_curtain_merge_20261117 TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public._backup_curtain_merge_20261117_id_seq TO service_role;
ALTER TABLE public._backup_curtain_merge_20261117 ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER backup_curtain_touch BEFORE UPDATE ON public._backup_curtain_merge_20261117 FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TEMP TABLE curtain_map(old_id uuid PRIMARY KEY, variant_id uuid NOT NULL, color text NOT NULL);
INSERT INTO curtain_map VALUES ('452c6731-b019-421c-a536-83579f43d13b','616ce483-236e-4fc3-9a77-edd071b7abd2','Beige'),('2c3ca501-b4b3-4f62-8523-cefd6844d30e','cd9b6e07-7b41-46b5-9390-77936aab4758','Coffee');
CREATE TEMP TABLE curtain_triggers(tbl regclass, name text);
CREATE TEMP TABLE curtain_refs AS SELECT c.table_name,c.column_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name WHERE c.table_schema='public' AND t.table_type='BASE TABLE' AND c.data_type='uuid' AND c.column_name LIKE '%product_id';
DO $merge$
DECLARE parent uuid := 'ea97a584-0b86-4ed5-bf93-d20690f9679c'; r record; vcol text; before_orders jsonb; after_orders jsonb; before_ledger jsonb; after_ledger jsonb; before_fin jsonb; after_fin jsonb; before_stock integer; changed bigint; base_weight numeric;
BEGIN
  LOCK TABLE public.products,public.product_variants,public.orders,public.order_items,public.stock_movements,public.erp_transactions,public.erp_journal_entries,public.erp_journal_lines IN SHARE ROW EXCLUSIVE MODE;
  IF (SELECT count(*) FROM public.products WHERE id IN (parent,'452c6731-b019-421c-a536-83579f43d13b','2c3ca501-b4b3-4f62-8523-cefd6844d30e') AND brand_id='1f1f366d-ad85-4513-85ab-2dbb6b23c513') <> 3 THEN RAISE EXCEPTION 'Expected three HobbyShop Pearl products'; END IF;
  IF (SELECT count(*) FROM public.product_variants WHERE product_id=parent AND ((id='616ce483-236e-4fc3-9a77-edd071b7abd2' AND sku='HS-CB-01-B') OR (id='cd9b6e07-7b41-46b5-9390-77936aab4758' AND sku='HS-CB-01-C'))) <> 2 THEN RAISE EXCEPTION 'Color SKU mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM public.product_variants WHERE product_id IN (SELECT old_id FROM curtain_map)) THEN RAISE EXCEPTION 'Duplicate products unexpectedly have variants'; END IF;
  SELECT sum(stock) INTO before_stock FROM public.products WHERE id=parent OR id IN (SELECT old_id FROM curtain_map);
  SELECT jsonb_build_object('rows',count(*),'qty',sum(quantity),'amount',sum(line_total),'cost',sum(unit_cost_snapshot*quantity),'hash',md5(string_agg((to_jsonb(i)-ARRAY['product_id','variant_id','variant_label'])::text,'|' ORDER BY id))) INTO before_orders FROM public.order_items i WHERE product_id=parent OR product_id IN (SELECT old_id FROM curtain_map);
  SELECT jsonb_build_object('rows',count(*),'delta',sum(delta),'cost',sum(total_cost_bdt),'hash',md5(string_agg((to_jsonb(s)-ARRAY['product_id','variant_id'])::text,'|' ORDER BY id))) INTO before_ledger FROM public.stock_movements s WHERE product_id=parent OR product_id IN (SELECT old_id FROM curtain_map);
  SELECT jsonb_build_object('transactions',(SELECT md5(string_agg(to_jsonb(t)::text,'|' ORDER BY id)) FROM public.erp_transactions t),'journals',(SELECT md5(string_agg(to_jsonb(t)::text,'|' ORDER BY id)) FROM public.erp_journal_entries t),'lines',(SELECT md5(string_agg(to_jsonb(t)::text,'|' ORDER BY id)) FROM public.erp_journal_lines t),'allocations',(SELECT md5(string_agg((to_jsonb(t)-ARRAY['product_id','updated_at'])::text,'|' ORDER BY id)) FROM public.erp_product_expense_allocations t)) INTO before_fin;
  INSERT INTO public._backup_curtain_merge_20261117(source_table,original_record) SELECT 'products',to_jsonb(p) FROM public.products p WHERE id=parent OR id IN (SELECT old_id FROM curtain_map);
  INSERT INTO public._backup_curtain_merge_20261117(source_table,original_record) SELECT 'product_variants',to_jsonb(v) FROM public.product_variants v WHERE product_id=parent;
  FOR r IN SELECT DISTINCT table_name FROM curtain_refs ORDER BY table_name LOOP
    EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',r.table_name);
    INSERT INTO curtain_triggers SELECT tgrelid,tgname FROM pg_trigger WHERE tgrelid=format('public.%I',r.table_name)::regclass AND NOT tgisinternal AND tgenabled='O';
  END LOOP;
  INSERT INTO curtain_triggers SELECT tgrelid,tgname FROM pg_trigger WHERE tgrelid='public.products'::regclass AND NOT tgisinternal AND tgenabled='O';
  FOR r IN SELECT * FROM curtain_triggers LOOP EXECUTE format('ALTER TABLE %s DISABLE TRIGGER %I',r.tbl,r.name); END LOOP;
  FOR r IN SELECT * FROM curtain_refs LOOP
    EXECUTE format('INSERT INTO public._backup_curtain_merge_20261117(source_table,original_record) SELECT %L,to_jsonb(t) FROM public.%I t WHERE %I IN (SELECT old_id FROM curtain_map)',r.table_name,r.table_name,r.column_name);
  END LOOP;
  INSERT INTO public._backup_curtain_merge_20261117(source_table,original_record) SELECT 'mkt_campaign_products',to_jsonb(c) FROM public.mkt_campaign_products c WHERE product_id=parent;
  -- Combine campaign weights without re-running historical expense allocations.
  FOR r IN SELECT campaign_id,sum(weight) AS weight FROM public.mkt_campaign_products WHERE product_id=parent OR product_id IN (SELECT old_id FROM curtain_map) GROUP BY campaign_id HAVING count(*) FILTER (WHERE product_id IN (SELECT old_id FROM curtain_map)) > 0 LOOP
    IF NOT EXISTS(SELECT 1 FROM public.mkt_campaign_products WHERE campaign_id=r.campaign_id AND product_id=parent) THEN RAISE EXCEPTION 'Missing parent campaign link'; END IF;
    UPDATE public.mkt_campaign_products SET weight=r.weight WHERE campaign_id=r.campaign_id AND product_id=parent;
  END LOOP;
  DELETE FROM public.mkt_campaign_products WHERE product_id IN (SELECT old_id FROM curtain_map);
  -- Parent listing already supplies both colors; retain original duplicate listings in backup.
  IF EXISTS(SELECT 1 FROM public.product_brand_listings d WHERE d.product_id IN (SELECT old_id FROM curtain_map) AND NOT EXISTS(SELECT 1 FROM public.product_brand_listings p WHERE p.product_id=parent AND p.brand_id=d.brand_id)) THEN RAISE EXCEPTION 'Missing parent brand listing'; END IF;
  DELETE FROM public.product_brand_listings WHERE product_id IN (SELECT old_id FROM curtain_map);
  FOR r IN SELECT * FROM curtain_refs WHERE table_name NOT IN ('mkt_campaign_products','product_brand_listings') LOOP
    vcol := replace(r.column_name,'product_id','variant_id');
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=r.table_name AND column_name=vcol AND data_type='uuid') THEN
      EXECUTE format('UPDATE public.%I t SET %I=$1,%I=m.variant_id FROM curtain_map m WHERE t.%I=m.old_id',r.table_name,r.column_name,vcol,r.column_name) USING parent;
    ELSE
      EXECUTE format('UPDATE public.%I t SET %I=$1 FROM curtain_map m WHERE t.%I=m.old_id',r.table_name,r.column_name,r.column_name) USING parent;
    END IF;
  END LOOP;
  UPDATE public.order_items i SET variant_label=m.color || ' (' || v.sku || ')' FROM curtain_map m JOIN public.product_variants v ON v.id=m.variant_id WHERE i.product_id=parent AND i.variant_id=m.variant_id AND i.id IN (SELECT (original_record->>'id')::uuid FROM public._backup_curtain_merge_20261117 WHERE source_table='order_items');
  PERFORM set_config('app.inv_source','curtain_product_merge_20261117',true);
  PERFORM set_config('app.inv_ledger_write','on',true);
  UPDATE public.product_variants v SET stock=v.stock+p.stock, reserved_stock=v.reserved_stock+p.reserved_stock,color_name=m.color FROM curtain_map m JOIN public.products p ON p.id=m.old_id WHERE v.id=m.variant_id;
  UPDATE public.products SET title='Flower Curtain Buckle' WHERE id=parent;
  UPDATE public.product_option_values SET value='Coffee' WHERE id='f39b9cbf-633c-454d-8f14-1d3bbe18c47a';
  DELETE FROM public.products WHERE id IN (SELECT old_id FROM curtain_map);
  PERFORM public.inv_recompute_wac(parent,'616ce483-236e-4fc3-9a77-edd071b7abd2');
  PERFORM public.inv_recompute_wac(parent,'cd9b6e07-7b41-46b5-9390-77936aab4758');
  UPDATE public.products SET stock=(SELECT sum(stock) FROM public.product_variants WHERE product_id=parent AND is_active),reserved_stock=(SELECT sum(reserved_stock) FROM public.product_variants WHERE product_id=parent AND is_active) WHERE id=parent;
  IF (SELECT stock FROM public.products WHERE id=parent) <> before_stock THEN RAISE EXCEPTION 'Combined physical stock changed'; END IF;
  SELECT jsonb_build_object('rows',count(*),'qty',sum(quantity),'amount',sum(line_total),'cost',sum(unit_cost_snapshot*quantity),'hash',md5(string_agg((to_jsonb(i)-ARRAY['product_id','variant_id','variant_label'])::text,'|' ORDER BY id))) INTO after_orders FROM public.order_items i WHERE product_id=parent;
  SELECT jsonb_build_object('rows',count(*),'delta',sum(delta),'cost',sum(total_cost_bdt),'hash',md5(string_agg((to_jsonb(s)-ARRAY['product_id','variant_id'])::text,'|' ORDER BY id))) INTO after_ledger FROM public.stock_movements s WHERE product_id=parent;
  SELECT jsonb_build_object('transactions',(SELECT md5(string_agg(to_jsonb(t)::text,'|' ORDER BY id)) FROM public.erp_transactions t),'journals',(SELECT md5(string_agg(to_jsonb(t)::text,'|' ORDER BY id)) FROM public.erp_journal_entries t),'lines',(SELECT md5(string_agg(to_jsonb(t)::text,'|' ORDER BY id)) FROM public.erp_journal_lines t),'allocations',(SELECT md5(string_agg((to_jsonb(t)-ARRAY['product_id','updated_at'])::text,'|' ORDER BY id)) FROM public.erp_product_expense_allocations t)) INTO after_fin;
  IF before_orders IS DISTINCT FROM after_orders THEN RAISE EXCEPTION 'Order amounts, quantities or snapshots changed'; END IF;
  IF before_ledger IS DISTINCT FROM after_ledger THEN RAISE EXCEPTION 'Stock ledger entries changed beyond product/color references'; END IF;
  IF before_fin IS DISTINCT FROM after_fin THEN RAISE EXCEPTION 'Financial amounts/entries changed'; END IF;
  FOR r IN SELECT * FROM curtain_refs LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I IN (SELECT old_id FROM curtain_map)',r.table_name,r.column_name) INTO changed;
    IF changed <> 0 THEN RAISE EXCEPTION 'Unmigrated references in %.%',r.table_name,r.column_name; END IF;
  END LOOP;
  INSERT INTO public._backup_curtain_merge_20261117(source_table,original_record) VALUES ('acceptance',jsonb_build_object('orders_before',before_orders,'orders_after',after_orders,'ledger_before',before_ledger,'ledger_after',after_ledger,'finance_unchanged',before_fin=after_fin,'stock_before',before_stock,'stock_after',(SELECT stock FROM public.products WHERE id=parent),'unknown_color_orders',(SELECT count(*) FROM public.order_items WHERE product_id=parent AND variant_id IS NULL)));
  FOR r IN SELECT * FROM curtain_triggers LOOP EXECUTE format('ALTER TABLE %s ENABLE TRIGGER %I',r.tbl,r.name); END LOOP;
  PERFORM set_config('app.inv_ledger_write','off',true);
END $merge$;
DROP TABLE curtain_refs,curtain_triggers,curtain_map;
COMMIT;