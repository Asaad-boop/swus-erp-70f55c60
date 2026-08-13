DROP INDEX IF EXISTS public.hub_month_plans_uniq;
DROP INDEX IF EXISTS public.hub_plan_products_uniq;
CREATE UNIQUE INDEX hub_month_plans_uniq ON public.hub_month_plans (brand_id, month) NULLS NOT DISTINCT;
CREATE UNIQUE INDEX hub_plan_products_uniq ON public.hub_plan_products (brand_id, month, product_id) NULLS NOT DISTINCT;