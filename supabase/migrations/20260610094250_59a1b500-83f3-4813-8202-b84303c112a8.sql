ALTER TABLE public.requisition_annexures
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

ALTER TABLE public.requisition_annexures
  DROP CONSTRAINT IF EXISTS requisition_annexures_status_check;
ALTER TABLE public.requisition_annexures
  ADD CONSTRAINT requisition_annexures_status_check CHECK (status IN ('active','cancelled'));

CREATE INDEX IF NOT EXISTS idx_requisition_annexures_status
  ON public.requisition_annexures(status);