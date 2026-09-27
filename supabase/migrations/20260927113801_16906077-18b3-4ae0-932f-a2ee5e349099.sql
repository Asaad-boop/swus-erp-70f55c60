CREATE TABLE public.hr_payroll_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  run_id uuid,
  action text NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hr_payroll_audit_row ON public.hr_payroll_audit(row_id, changed_at DESC);
CREATE INDEX idx_hr_payroll_audit_run ON public.hr_payroll_audit(run_id, changed_at DESC);
GRANT SELECT ON public.hr_payroll_audit TO authenticated;
GRANT ALL ON public.hr_payroll_audit TO service_role;
ALTER TABLE public.hr_payroll_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR staff read payroll audit" ON public.hr_payroll_audit FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'hr_manager') OR public.has_role(auth.uid(),'accountant'));

CREATE OR REPLACE FUNCTION public.hr_payroll_audit_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o jsonb; n jsonb; diff jsonb := '{}'::jsonb; k text;
  skip text[] := ARRAY['updated_at','created_at'];
  rid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    o := to_jsonb(OLD);
    rid := CASE WHEN TG_TABLE_NAME='hr_payslips' THEN OLD.run_id ELSE OLD.id END;
    INSERT INTO hr_payroll_audit(table_name,row_id,run_id,action,changes,changed_by)
    VALUES (TG_TABLE_NAME, OLD.id, rid, 'delete', o, auth.uid());
    RETURN OLD;
  END IF;
  n := to_jsonb(NEW);
  rid := CASE WHEN TG_TABLE_NAME='hr_payslips' THEN NEW.run_id ELSE NEW.id END;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO hr_payroll_audit(table_name,row_id,run_id,action,changes,changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, rid, 'create', '{}'::jsonb, auth.uid());
    RETURN NEW;
  END IF;
  o := to_jsonb(OLD);
  FOR k IN SELECT jsonb_object_keys(n) LOOP
    IF k = ANY(skip) THEN CONTINUE; END IF;
    IF (o->k) IS DISTINCT FROM (n->k) THEN
      diff := diff || jsonb_build_object(k, jsonb_build_object('old', o->k, 'new', n->k));
    END IF;
  END LOOP;
  IF diff <> '{}'::jsonb THEN
    INSERT INTO hr_payroll_audit(table_name,row_id,run_id,action,changes,changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, rid, 'update', diff, auth.uid());
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.hr_payroll_audit_trg() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_hr_payslips_audit AFTER INSERT OR UPDATE OR DELETE ON public.hr_payslips
FOR EACH ROW EXECUTE FUNCTION public.hr_payroll_audit_trg();
CREATE TRIGGER trg_hr_payroll_runs_audit AFTER INSERT OR UPDATE OR DELETE ON public.hr_payroll_runs
FOR EACH ROW EXECUTE FUNCTION public.hr_payroll_audit_trg();