
UPDATE boqs b
SET line_items = (
  SELECT jsonb_agg(
    jsonb_set(li.value, '{approval_status}', '"approved"'::jsonb, true)
    ORDER BY li.ord
  )
  FROM jsonb_array_elements(b.line_items) WITH ORDINALITY li(value, ord)
),
updated_at = now()
WHERE b.id IN ('a626615a-75bb-49e5-9be8-94bc9d3df2b8','1bd688b1-dea6-43b7-b079-0d256dc72751');
