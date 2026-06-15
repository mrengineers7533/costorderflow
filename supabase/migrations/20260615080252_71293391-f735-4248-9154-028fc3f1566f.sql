-- Add audit columns for "Apply comment" tracking on design comments
ALTER TABLE public.boq_design_comments
  ADD COLUMN IF NOT EXISTS applied_to_oa_at timestamptz,
  ADD COLUMN IF NOT EXISTS applied_to_oa_by uuid,
  ADD COLUMN IF NOT EXISTS applied_value text,
  ADD COLUMN IF NOT EXISTS oa_revision_id uuid;

-- Item-wise Design verification status per BOQ revision
CREATE TABLE IF NOT EXISTS public.boq_item_design_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boq_id uuid NOT NULL REFERENCES public.boqs(id) ON DELETE CASCADE,
  boq_revision integer NOT NULL DEFAULT 0,
  boq_item_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','not_approved')),
  reason text,
  decided_by uuid,
  decided_by_name text,
  decided_by_department text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (boq_id, boq_revision, boq_item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.boq_item_design_status TO authenticated;
GRANT ALL ON public.boq_item_design_status TO service_role;

ALTER TABLE public.boq_item_design_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read design status"
  ON public.boq_item_design_status FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Design or admin can insert design status"
  ON public.boq_item_design_status FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.notification_recipients nr
      WHERE nr.user_id = auth.uid()
        AND nr.is_active = true
        AND lower(nr.department) = 'design'
    )
  );

CREATE POLICY "Design or admin can update design status"
  ON public.boq_item_design_status FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.notification_recipients nr
      WHERE nr.user_id = auth.uid()
        AND nr.is_active = true
        AND lower(nr.department) = 'design'
    )
  );

CREATE TRIGGER trg_boq_item_design_status_updated_at
  BEFORE UPDATE ON public.boq_item_design_status
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Notification fan-out on status change
CREATE OR REPLACE FUNCTION public.notif_on_design_item_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _bnum text; _client text; _root uuid;
BEGIN
  SELECT b.boq_number, b.client_name, COALESCE(o.parent_order_id, o.id)
    INTO _bnum, _client, _root
    FROM public.boqs b
    LEFT JOIN public.orders o ON o.id = b.order_id
   WHERE b.id = NEW.boq_id;

  PERFORM public.emit_notification(
    'boq',
    'design_item_status_changed',
    NEW.boq_id,
    _bnum,
    _client,
    'Design ' || NEW.status || ' on ' || COALESCE(_bnum,'BOQ') ||
      ' (R' || NEW.boq_revision || ') item ' || NEW.boq_item_id,
    CASE WHEN NEW.status = 'not_approved' AND NEW.reason IS NOT NULL
         THEN 'Reason: ' || LEFT(NEW.reason, 240)
         ELSE NULL END,
    CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('status', OLD.status) ELSE NULL END,
    jsonb_build_object(
      'status', NEW.status,
      'reason', NEW.reason,
      'boq_item_id', NEW.boq_item_id,
      'boq_revision', NEW.boq_revision
    ),
    _root, NEW.boq_id, NULL, NULL, NULL, NULL, NULL
  );
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_notif_design_item_status ON public.boq_item_design_status;
CREATE TRIGGER trg_notif_design_item_status
  AFTER INSERT OR UPDATE OF status, reason ON public.boq_item_design_status
  FOR EACH ROW EXECUTE FUNCTION public.notif_on_design_item_status();

-- RPC to mark a Design comment as applied to an OA (audit only — does NOT modify OA)
CREATE OR REPLACE FUNCTION public.apply_design_comment_to_oa(
  _comment_id uuid,
  _oa_id uuid,
  _applied_value text
) RETURNS public.boq_design_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _row public.boq_design_comments;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Auth required';
  END IF;

  UPDATE public.boq_design_comments
     SET applied_to_oa_at = now(),
         applied_to_oa_by = auth.uid(),
         applied_value = _applied_value,
         oa_revision_id = _oa_id
   WHERE id = _comment_id
   RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Comment not found';
  END IF;

  RETURN _row;
END $fn$;