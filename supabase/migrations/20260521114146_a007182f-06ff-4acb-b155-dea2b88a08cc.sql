
-- Add fg_description_full to preserve full Column A text (multi-line spec)
ALTER TABLE public.fg_raw_material_map
  ADD COLUMN IF NOT EXISTS fg_description_full text;

-- One-time cleanup: split any existing model_number containing newlines into
-- a clean first-line key, preserving the full text in fg_description_full.
DO $$
DECLARE
  r record;
  first_line text;
  existing_id uuid;
  merged jsonb;
BEGIN
  FOR r IN
    SELECT id, model_number, raw_materials, is_direct_purchase, notes
      FROM public.fg_raw_material_map
     WHERE model_number ~ E'[\\n\\r]'
  LOOP
    first_line := btrim(split_part(regexp_replace(r.model_number, E'\\r', E'\\n', 'g'), E'\\n', 1));
    IF first_line = '' THEN
      first_line := r.model_number;
    END IF;
    -- cap length
    IF char_length(first_line) > 120 THEN
      first_line := substring(first_line FROM 1 FOR 120);
    END IF;

    SELECT id INTO existing_id
      FROM public.fg_raw_material_map
     WHERE lower(model_number) = lower(first_line)
       AND id <> r.id
     LIMIT 1;

    IF existing_id IS NOT NULL THEN
      -- merge raw_materials into the existing canonical row, then delete duplicate
      SELECT COALESCE(raw_materials, '[]'::jsonb) || COALESCE(r.raw_materials, '[]'::jsonb)
        INTO merged
        FROM public.fg_raw_material_map WHERE id = existing_id;
      UPDATE public.fg_raw_material_map
         SET raw_materials = merged,
             fg_description_full = COALESCE(fg_description_full, r.model_number),
             updated_at = now()
       WHERE id = existing_id;
      DELETE FROM public.fg_raw_material_map WHERE id = r.id;
    ELSE
      UPDATE public.fg_raw_material_map
         SET fg_description_full = COALESCE(fg_description_full, model_number),
             model_number = first_line,
             updated_at = now()
       WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
