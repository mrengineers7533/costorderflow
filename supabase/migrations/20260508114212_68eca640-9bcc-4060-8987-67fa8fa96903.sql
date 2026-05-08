
CREATE OR REPLACE FUNCTION public.verify_boq_items_with_token(
  _token uuid,
  _verifier_email text,
  _items jsonb
)
RETURNS public.boqs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row public.boqs;
  _existing jsonb;
  _new_items jsonb := '[]'::jsonb;
  _it jsonb;
  _decision jsonb;
  _all_approved boolean := true;
  _any_rejected boolean := false;
  _final_status text;
BEGIN
  SELECT * INTO _row FROM public.boqs
   WHERE verification_token = _token
     AND verification_status IN ('pending_verification', 'rejected')
   LIMIT 1;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Invalid or already used verification link';
  END IF;

  _existing := COALESCE(_row.line_items, '[]'::jsonb);

  FOR _it IN SELECT value FROM jsonb_array_elements(_existing)
  LOOP
    _decision := NULL;
    SELECT value INTO _decision
      FROM jsonb_array_elements(_items)
     WHERE value->>'id' = _it->>'id'
     LIMIT 1;

    IF _decision IS NULL THEN
      -- Missing decision = treat as not approved
      _all_approved := false;
      _new_items := _new_items || jsonb_build_array(
        _it
        || jsonb_build_object(
             'approval_status', COALESCE(_it->>'approval_status', 'pending'),
             'approval_comment', COALESCE(_it->>'approval_comment', '')
           )
      );
    ELSE
      IF (_decision->>'status') = 'rejected' THEN
        _any_rejected := true;
        _all_approved := false;
      ELSIF (_decision->>'status') <> 'approved' THEN
        _all_approved := false;
      END IF;
      _new_items := _new_items || jsonb_build_array(
        _it
        || jsonb_build_object(
             'approval_status', COALESCE(_decision->>'status', 'pending'),
             'approval_comment', COALESCE(_decision->>'comment', '')
           )
      );
    END IF;
  END LOOP;

  IF _any_rejected THEN
    _final_status := 'rejected';
  ELSIF _all_approved THEN
    _final_status := 'approved';
  ELSE
    _final_status := 'pending_verification';
  END IF;

  UPDATE public.boqs
     SET line_items = _new_items,
         verification_status = _final_status,
         is_current = CASE WHEN _final_status = 'approved' THEN true ELSE is_current END,
         status = CASE WHEN _final_status = 'approved' THEN 'finalized'::order_status ELSE status END,
         verified_at = CASE WHEN _final_status = 'approved' THEN now() ELSE verified_at END,
         verified_by_email = _verifier_email,
         verification_token = CASE WHEN _final_status = 'approved' THEN NULL ELSE verification_token END,
         updated_at = now()
   WHERE id = _row.id
   RETURNING * INTO _row;

  RETURN _row;
END;
$$;
