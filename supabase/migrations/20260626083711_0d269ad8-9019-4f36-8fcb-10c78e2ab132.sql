
WITH targets AS (
  SELECT id FROM boqs WHERE id IN (
    'a626615a-75bb-49e5-9be8-94bc9d3df2b8',
    '1bd688b1-dea6-43b7-b079-0d256dc72751'
  )
),
approved AS (
  SELECT s.boq_id, s.boq_item_id::text AS item_id
  FROM boq_item_design_status s
  JOIN targets t ON t.id = s.boq_id
  WHERE s.status = 'approved'
),
patched AS (
  SELECT b.id,
    jsonb_agg(
      CASE WHEN a.item_id IS NOT NULL
        THEN jsonb_set(li.value, '{approval_status}', '"approved"'::jsonb, true)
        ELSE li.value END
      ORDER BY li.ord
    ) AS new_items
  FROM boqs b
  CROSS JOIN LATERAL jsonb_array_elements(b.line_items) WITH ORDINALITY li(value, ord)
  LEFT JOIN approved a ON a.boq_id = b.id AND a.item_id = (li.value->>'id')
  WHERE b.id IN (SELECT id FROM targets)
  GROUP BY b.id
)
UPDATE boqs b SET line_items = p.new_items, updated_at = now()
FROM patched p WHERE b.id = p.id;
