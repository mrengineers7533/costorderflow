
ALTER TABLE public.boqs
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS verification_token uuid,
  ADD COLUMN IF NOT EXISTS verification_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by_email text;

CREATE INDEX IF NOT EXISTS boqs_verification_token_idx ON public.boqs(verification_token);

-- Seed configurable verifier setting (admins edit later via UI).
INSERT INTO public.app_settings(key, value)
VALUES ('boq_verifier', '{"email": null}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Allow anyone holding a valid pending verification token to read that one BOQ row.
DROP POLICY IF EXISTS boqs_select_by_token ON public.boqs;
CREATE POLICY boqs_select_by_token
ON public.boqs
FOR SELECT
TO anon, authenticated
USING (
  verification_status = 'pending_verification'
  AND verification_token IS NOT NULL
);

-- Approve a pending BOQ revision using its token. SECURITY DEFINER so anonymous
-- link recipients can approve without auth, but the token itself is the secret.
CREATE OR REPLACE FUNCTION public.verify_boq_with_token(_token uuid, _verifier_email text)
RETURNS public.boqs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.boqs;
BEGIN
  SELECT * INTO _row FROM public.boqs
   WHERE verification_token = _token
     AND verification_status = 'pending_verification'
   LIMIT 1;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Invalid or already used verification link';
  END IF;

  UPDATE public.boqs
     SET verification_status = 'approved',
         is_current = true,
         verified_at = now(),
         verified_by_email = _verifier_email,
         verification_token = NULL,
         status = 'finalized',
         updated_at = now()
   WHERE id = _row.id
   RETURNING * INTO _row;

  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_boq_with_token(uuid, text) TO anon, authenticated;
