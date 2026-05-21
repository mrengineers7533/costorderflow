
-- 1. Validate reviewer inputs in design-review RPCs ---------------------

CREATE OR REPLACE FUNCTION public.submit_design_review_with_token(
  _token uuid,
  _reviewer_email text,
  _items jsonb,
  _docs jsonb DEFAULT '[]'::jsonb,
  _reviewer_name text DEFAULT NULL::text,
  _reviewer_design_team text DEFAULT NULL::text,
  _reviewer_contact text DEFAULT NULL::text
)
RETURNS boq_design_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.boq_design_reviews;
  _it jsonb;
  _all_approved boolean := true;
  _any_change boolean := false;
  _outcome text;
  _doc jsonb;
  _is_comment boolean;
  _decision text;
  _comment text;
  _change_note text;
BEGIN
  -- Input validation
  IF _reviewer_email IS NULL
     OR char_length(_reviewer_email) < 3
     OR char_length(_reviewer_email) > 320
     OR _reviewer_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid reviewer email';
  END IF;
  IF _reviewer_name IS NOT NULL AND char_length(_reviewer_name) > 256 THEN
    RAISE EXCEPTION 'reviewer_name too long';
  END IF;
  IF _reviewer_design_team IS NOT NULL AND char_length(_reviewer_design_team) > 256 THEN
    RAISE EXCEPTION 'reviewer_design_team too long';
  END IF;
  IF _reviewer_contact IS NOT NULL AND char_length(_reviewer_contact) > 320 THEN
    RAISE EXCEPTION 'reviewer_contact too long';
  END IF;

  SELECT * INTO _row FROM public.boq_design_reviews
   WHERE token = _token AND status = 'sent' AND expires_at > now()
   LIMIT 1;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Invalid, expired, or already submitted review link';
  END IF;

  _is_comment := (_row.kind = 'comment');

  FOR _it IN SELECT value FROM jsonb_array_elements(_items)
  LOOP
    IF _is_comment THEN
      _decision := 'pending';
    ELSE
      _decision := COALESCE(_it->>'decision', 'pending');
    END IF;

    _comment := _it->>'comment';
    IF _comment IS NOT NULL AND char_length(_comment) > 4000 THEN
      RAISE EXCEPTION 'item comment too long';
    END IF;
    _change_note := _it->>'design_change_note';
    IF _change_note IS NOT NULL AND char_length(_change_note) > 4000 THEN
      RAISE EXCEPTION 'design_change_note too long';
    END IF;

    UPDATE public.boq_design_review_items
       SET decision = _decision,
           comment = _comment,
           column_comments = COALESCE(_it->'column_comments', '{}'::jsonb),
           design_change_note = CASE WHEN _is_comment THEN NULL ELSE _change_note END,
           decided_at = now()
     WHERE review_id = _row.id AND boq_item_id = _it->>'boq_item_id';

    IF NOT _is_comment THEN
      IF _decision = 'change_required' THEN
        _any_change := true; _all_approved := false;
      ELSIF _decision <> 'approved' THEN
        _all_approved := false;
      END IF;
    END IF;
  END LOOP;

  FOR _doc IN SELECT value FROM jsonb_array_elements(_docs)
  LOOP
    INSERT INTO public.boq_design_review_documents
      (review_id, boq_item_id, source, file_name, file_path, uploaded_by_email)
    VALUES
      (_row.id, _doc->>'boq_item_id', 'reviewer',
       LEFT(COALESCE(_doc->>'file_name',''), 512),
       LEFT(COALESCE(_doc->>'file_path',''), 1024),
       _reviewer_email);
  END LOOP;

  IF _is_comment THEN
    _outcome := 'comments';
  ELSIF _all_approved THEN
    _outcome := 'approved';
  ELSIF _any_change THEN
    _outcome := 'changes_required';
  ELSE
    _outcome := 'partial';
  END IF;

  UPDATE public.boq_design_reviews
     SET status = 'submitted',
         submitted_at = now(),
         submitted_by_email = _reviewer_email,
         reviewer_name = COALESCE(_reviewer_name, reviewer_name),
         reviewer_design_team = COALESCE(_reviewer_design_team, reviewer_design_team),
         reviewer_contact = COALESCE(_reviewer_contact, reviewer_contact),
         overall_outcome = _outcome,
         updated_at = now()
   WHERE id = _row.id
   RETURNING * INTO _row;

  UPDATE public.boqs
     SET design_review_status = CASE
       WHEN _is_comment THEN 'review_received'
       WHEN _outcome = 'approved' THEN 'design_approved'
       WHEN _outcome = 'changes_required' THEN 'changes_required'
       ELSE 'review_received' END,
         updated_at = now()
   WHERE id = _row.boq_id;

  RETURN _row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_boq_items_with_token(
  _token uuid, _verifier_email text, _items jsonb
)
RETURNS boqs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.boqs;
  _existing jsonb;
  _new_items jsonb := '[]'::jsonb;
  _it jsonb;
  _decision jsonb;
  _comment text;
  _all_approved boolean := true;
  _any_rejected boolean := false;
  _final_status text;
BEGIN
  IF _verifier_email IS NULL
     OR char_length(_verifier_email) < 3
     OR char_length(_verifier_email) > 320
     OR _verifier_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid verifier email';
  END IF;

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
      _all_approved := false;
      _new_items := _new_items || jsonb_build_array(
        _it
        || jsonb_build_object(
             'approval_status', COALESCE(_it->>'approval_status', 'pending'),
             'approval_comment', COALESCE(_it->>'approval_comment', '')
           )
      );
    ELSE
      _comment := _decision->>'comment';
      IF _comment IS NOT NULL AND char_length(_comment) > 4000 THEN
        RAISE EXCEPTION 'item comment too long';
      END IF;
      IF (_decision->>'status') = 'rejected' THEN
        _any_rejected := true; _all_approved := false;
      ELSIF (_decision->>'status') <> 'approved' THEN
        _all_approved := false;
      END IF;
      _new_items := _new_items || jsonb_build_array(
        _it
        || jsonb_build_object(
             'approval_status', COALESCE(_decision->>'status', 'pending'),
             'approval_comment', COALESCE(_comment, '')
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
$function$;

-- 2. Token-gated server functions for anon BOQ reads -------------------

CREATE OR REPLACE FUNCTION public.get_final_boq_by_token(_token uuid)
RETURNS public.boqs
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.boqs
   WHERE final_share_token = _token
     AND final_share_token IS NOT NULL
     AND design_review_status = 'final_sent'
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_boq_by_verification_token(_token uuid)
RETURNS public.boqs
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.boqs
   WHERE verification_token = _token
     AND verification_token IS NOT NULL
     AND verification_status = 'pending_verification'
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_final_boq_by_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_boq_by_verification_token(uuid) TO anon, authenticated;

-- Drop the overly broad anon policies on boqs / boq_revisions
DROP POLICY IF EXISTS boqs_select_by_final_token ON public.boqs;
DROP POLICY IF EXISTS boqs_select_by_token ON public.boqs;
DROP POLICY IF EXISTS boq_revisions_select_by_final_token ON public.boq_revisions;

-- 3. Tighten cost_sheets realtime policy: only owner's topic --------------

DROP POLICY IF EXISTS "cost_sheets_realtime_user_scoped" ON realtime.messages;

CREATE POLICY "cost_sheets_realtime_user_scoped"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE 'cost_sheets:' || (auth.uid())::text || '%'
);

-- 4. Make "no client writes" explicit on email log -----------------------

DROP POLICY IF EXISTS bdrel_no_client_write ON public.boq_design_review_email_log;
CREATE POLICY bdrel_no_client_write
ON public.boq_design_review_email_log
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

COMMENT ON TABLE public.boq_design_review_email_log IS
  'Writes only from edge functions using the service role. Client roles are denied via bdrel_no_client_write.';
