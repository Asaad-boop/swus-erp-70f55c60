-- Read-only acceptance checks for the owner-requested Flower Curtain Buckle merge.
SELECT 'one parent, duplicates removed' AS test,
  (SELECT count(*) FROM public.products WHERE id IN (
    'ea97a584-0b86-4ed5-bf93-d20690f9679c',
    '452c6731-b019-421c-a536-83579f43d13b',
    '2c3ca501-b4b3-4f62-8523-cefd6844d30e')) = 1 AS passed
UNION ALL
SELECT 'Beige SKU', EXISTS (
  SELECT 1 FROM public.product_variants WHERE product_id='ea97a584-0b86-4ed5-bf93-d20690f9679c'
  AND sku='HS-CB-01-B' AND color_name='Beige')
UNION ALL
SELECT 'Coffee SKU', EXISTS (
  SELECT 1 FROM public.product_variants WHERE product_id='ea97a584-0b86-4ed5-bf93-d20690f9679c'
  AND sku='HS-CB-01-C' AND color_name='Coffee')
UNION ALL
SELECT 'duplicate Beige sales retain row IDs and quantity', NOT EXISTS (
  SELECT 1 FROM public._backup_curtain_merge_20261117 b
  LEFT JOIN public.order_items i ON i.id=(b.original_record->>'id')::uuid
  WHERE b.source_table='order_items'
    AND b.original_record->>'product_id'='452c6731-b019-421c-a536-83579f43d13b'
    AND (i.id IS NULL OR i.product_id <> 'ea97a584-0b86-4ed5-bf93-d20690f9679c'
      OR i.variant_id IS DISTINCT FROM '616ce483-236e-4fc3-9a77-edd071b7abd2'::uuid
      OR i.quantity IS DISTINCT FROM (b.original_record->>'quantity')::integer))
UNION ALL
SELECT 'duplicate Coffee sales retain row IDs and quantity', NOT EXISTS (
  SELECT 1 FROM public._backup_curtain_merge_20261117 b
  LEFT JOIN public.order_items i ON i.id=(b.original_record->>'id')::uuid
  WHERE b.source_table='order_items'
    AND b.original_record->>'product_id'='2c3ca501-b4b3-4f62-8523-cefd6844d30e'
    AND (i.id IS NULL OR i.product_id <> 'ea97a584-0b86-4ed5-bf93-d20690f9679c'
      OR i.variant_id IS DISTINCT FROM 'cd9b6e07-7b41-46b5-9390-77936aab4758'::uuid
      OR i.quantity IS DISTINCT FROM (b.original_record->>'quantity')::integer))
UNION ALL
SELECT 'financial entries unchanged during merge', EXISTS (
  SELECT 1 FROM public._backup_curtain_merge_20261117
  WHERE source_table='acceptance' AND (original_record->>'finance_unchanged')::boolean)
UNION ALL
SELECT 'stock movement history conserved', EXISTS (
  SELECT 1 FROM public._backup_curtain_merge_20261117
  WHERE source_table='acceptance'
  AND original_record->'ledger_before'=original_record->'ledger_after')
UNION ALL
SELECT 'physical stock conserved', EXISTS (
  SELECT 1 FROM public._backup_curtain_merge_20261117
  WHERE source_table='acceptance'
  AND original_record->'stock_before'=original_record->'stock_after')
UNION ALL
SELECT 'Elastic product untouched', EXISTS (
  SELECT 1 FROM public.products WHERE id='0220bc95-62cb-4d20-9015-309a7c6e09a2'
  AND title='Flower Curtain Buckle Elastic' AND stock=311);