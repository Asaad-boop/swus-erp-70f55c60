CREATE OR REPLACE FUNCTION public.hub_content_task_on_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand uuid;
  v_name text;
BEGIN
  IF NEW.product_id IS NULL OR COALESCE(NEW.quantity,0) <= 0 THEN
    RETURN NEW;
  END IF;
  SELECT r.brand_id INTO v_brand FROM imp_po_releases r WHERE r.id = NEW.release_id;
  SELECT p.title INTO v_name FROM products p WHERE p.id = NEW.product_id;
  IF EXISTS (SELECT 1 FROM hub_content_plans cp WHERE cp.product_id = NEW.product_id) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM hub_tasks t
    WHERE t.link_type = 'content_needed' AND t.link_id = NEW.product_id::text AND t.status <> 'done'
  ) THEN
    RETURN NEW;
  END IF;
  INSERT INTO hub_tasks (brand_id, title, details, priority, status, link_type, link_id, link_label, due_date)
  VALUES (
    v_brand,
    'Content plan দরকার: ' || COALESCE(v_name, NEW.sku_snapshot, 'Product'),
    'Stock এসে গেছে — এই product-এর জন্য content plan তৈরি করো (Growth Hub → Content Journey).',
    'high', 'todo', 'content_needed', NEW.product_id::text,
    COALESCE(v_name, NEW.sku_snapshot), (now() AT TIME ZONE 'Asia/Dhaka')::date + 3
  );
  RETURN NEW;
END;
$$;