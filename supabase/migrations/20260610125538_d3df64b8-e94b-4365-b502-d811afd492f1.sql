
ALTER TABLE public.requisitions
  ADD COLUMN IF NOT EXISTS upload_file_path text,
  ADD COLUMN IF NOT EXISTS upload_file_name text,
  ADD COLUMN IF NOT EXISTS upload_mime_type text,
  ADD COLUMN IF NOT EXISTS client_name_override text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'generated';

ALTER TABLE public.requisitions
  DROP CONSTRAINT IF EXISTS requisitions_source_check;
ALTER TABLE public.requisitions
  ADD CONSTRAINT requisitions_source_check CHECK (source IN ('generated','uploaded'));
