CREATE OR REPLACE FUNCTION public.insert_reconciliation_rows_safe(_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE inserted_count integer;
BEGIN
  INSERT INTO public.erp_reconciliation_rows
  SELECT * FROM jsonb_populate_recordset(NULL::public.erp_reconciliation_rows, _rows)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END
$function$;
REVOKE ALL ON FUNCTION public.insert_reconciliation_rows_safe(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.insert_reconciliation_rows_safe(jsonb) TO authenticated, service_role;