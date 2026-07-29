CREATE OR REPLACE FUNCTION public.normalize_website_advance_from_note()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  note_text text;
  source_text text;
  advance_txt text;
  due_txt text;
  method_txt text;
  from_txt text;
  trx_txt text;
  parsed_advance numeric;
  parsed_due numeric;
  gross numeric;
  normalized_method text;
BEGIN
  note_text := COALESCE(NEW.notes, '') || E'\n' || COALESCE(NEW.customer_note, '') || E'\n' || COALESCE(NEW.latest_note, '');
  source_text := lower(COALESCE(NEW.source::text, '') || ' ' || COALESCE(NEW.source_platform, '') || ' ' || COALESCE(NEW.source_website, ''));

  IF note_text !~* 'Advance\s+paid:' THEN
    RETURN NEW;
  END IF;

  IF source_text !~ '(website|pixel|utm|direct|organic|shopify|hobbyshop|toyora)' AND COALESCE(NEW.is_preorder, false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  advance_txt := (regexp_match(note_text, 'Advance paid:\s*৳?\s*([0-9,]+(?:\.[0-9]+)?)', 'i'))[1];
  IF advance_txt IS NULL THEN
    RETURN NEW;
  END IF;

  parsed_advance := NULLIF(replace(advance_txt, ',', ''), '')::numeric;
  IF parsed_advance IS NULL OR parsed_advance < 0 THEN
    RETURN NEW;
  END IF;

  due_txt := (regexp_match(note_text, 'Due on delivery:\s*৳?\s*([0-9,]+(?:\.[0-9]+)?)', 'i'))[1];
  method_txt := (regexp_match(note_text, 'Payment:\s*([A-Za-z]+)', 'i'))[1];
  from_txt := (regexp_match(note_text, 'From:\s*([+0-9][+0-9\s-]{5,24})', 'i'))[1];
  trx_txt := (regexp_match(note_text, 'TrxID:\s*([A-Za-z0-9_-]+)', 'i'))[1];

  parsed_due := CASE WHEN due_txt IS NULL THEN NULL ELSE NULLIF(replace(due_txt, ',', ''), '')::numeric END;
  gross := COALESCE(NEW.subtotal, 0) + COALESCE(NEW.shipping_fee, 0) - COALESCE(NEW.discount_amount, 0);
  normalized_method := CASE lower(COALESCE(method_txt, ''))
    WHEN 'bkash' THEN 'bKash'
    WHEN 'nagad' THEN 'Nagad'
    WHEN 'rocket' THEN 'Rocket'
    WHEN 'upay' THEN 'Upay'
    ELSE NULLIF(initcap(method_txt), '')
  END;

  NEW.advance_amount := parsed_advance;
  NEW.advance_source := COALESCE(NULLIF(NEW.advance_source, ''), normalized_method, NEW.payment_method, 'bKash');
  NEW.advance_payment_number := COALESCE(NULLIF(NEW.advance_payment_number, ''), NULLIF(regexp_replace(COALESCE(from_txt, ''), '[^0-9+]', '', 'g'), ''));
  NEW.advance_txn_id := COALESCE(NULLIF(NEW.advance_txn_id, ''), NULLIF(trx_txt, ''));
  NEW.total := COALESCE(parsed_due, GREATEST(gross - parsed_advance, 0));
  NEW.payment_status := CASE WHEN NEW.total <= 0 THEN 'paid'::public.payment_status ELSE 'partial'::public.payment_status END;

  RETURN NEW;
END;
$function$;