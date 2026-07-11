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
  _boq_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Auth required';
  END IF;

  SELECT boq_id INTO _boq_id FROM public.boq_design_comments WHERE id = _comment_id;
  IF _boq_id IS NULL THEN
    RAISE EXCEPTION 'Comment not found';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.can_edit_module(auth.uid(), 'design')
    OR public.has_doc_access(auth.uid(), 'boq', _boq_id, 'edit')
    OR public.has_doc_access(auth.uid(), 'oa', _oa_id, 'edit')
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.boq_design_comments
     SET applied_to_oa_at = now(),
         applied_to_oa_by = auth.uid(),
         applied_value = _applied_value,
         oa_revision_id = _oa_id
   WHERE id = _comment_id
   RETURNING * INTO _row;

  RETURN _row;
END $fn$;