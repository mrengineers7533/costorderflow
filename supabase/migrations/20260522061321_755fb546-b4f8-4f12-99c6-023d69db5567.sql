
-- Departments enum-like via check
CREATE TABLE public.notification_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department text NOT NULL CHECK (department IN ('design','purchase','manufacturing')),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  email text,
  name text,
  channels text[] NOT NULL DEFAULT '{email}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR email IS NOT NULL)
);
CREATE INDEX idx_notif_recipients_dept_active ON public.notification_recipients(department) WHERE is_active;

ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY nr_select_auth ON public.notification_recipients
  FOR SELECT TO authenticated USING (true);
CREATE POLICY nr_admin_write ON public.notification_recipients
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_notif_recipients_updated
  BEFORE UPDATE ON public.notification_recipients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Outbox table
CREATE TABLE public.order_revision_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  order_root_id uuid NOT NULL,
  oa_number text NOT NULL,
  revision integer NOT NULL,
  previous_revision integer,
  revised_from_id uuid,
  client_name text,
  format public.order_format,
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','queued','sent','failed','skipped')),
  channel_status jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  triggered_by uuid,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_orn_order ON public.order_revision_notifications(order_id);
CREATE INDEX idx_orn_root ON public.order_revision_notifications(order_root_id);
CREATE INDEX idx_orn_status ON public.order_revision_notifications(status);

ALTER TABLE public.order_revision_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY orn_select_owner_or_admin ON public.order_revision_notifications
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.orders o
               WHERE o.id = order_revision_notifications.order_id
                 AND o.user_id = auth.uid())
  );

CREATE POLICY orn_update_owner_or_admin ON public.order_revision_notifications
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.orders o
               WHERE o.id = order_revision_notifications.order_id
                 AND o.user_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.orders o
               WHERE o.id = order_revision_notifications.order_id
                 AND o.user_id = auth.uid())
  );

CREATE POLICY orn_insert_admin ON public.order_revision_notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY orn_delete_admin ON public.order_revision_notifications
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_orn_updated
  BEFORE UPDATE ON public.order_revision_notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger function: captures a notification row when a new OA revision is inserted
CREATE OR REPLACE FUNCTION public.enqueue_order_revision_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _root uuid;
  _audience jsonb;
  _recipients jsonb;
  _creator jsonb;
  _prev_rev integer;
BEGIN
  -- Only act on actual revisions (not the root row).
  IF COALESCE(NEW.revision, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  _root := COALESCE(NEW.parent_order_id, NEW.id);
  _prev_rev := GREATEST(NEW.revision - 1, 0);

  -- Resolve OA creator profile.
  SELECT to_jsonb(p) - 'avatar_url' - 'is_active' - 'email_notifications'
    INTO _creator
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  -- Build per-department arrays.
  WITH active AS (
    SELECT nr.department,
           jsonb_build_object(
             'role', nr.department,
             'user_id', nr.user_id,
             'email', COALESCE(nr.email, p.email),
             'name', COALESCE(nr.name, p.full_name),
             'channels', to_jsonb(nr.channels)
           ) AS r
    FROM public.notification_recipients nr
    LEFT JOIN public.profiles p ON p.id = nr.user_id
    WHERE nr.is_active = true
  )
  SELECT jsonb_build_object(
    'design',        COALESCE(jsonb_agg(r) FILTER (WHERE department='design'),        '[]'::jsonb),
    'purchase',      COALESCE(jsonb_agg(r) FILTER (WHERE department='purchase'),      '[]'::jsonb),
    'manufacturing', COALESCE(jsonb_agg(r) FILTER (WHERE department='manufacturing'), '[]'::jsonb),
    'creator',       COALESCE(_creator, '{}'::jsonb)
  ) INTO _audience
  FROM active;

  -- Flattened recipients list (creator first).
  _recipients := COALESCE(
    CASE
      WHEN _creator IS NOT NULL AND _creator <> '{}'::jsonb
        THEN jsonb_build_array(jsonb_build_object(
               'role','creator',
               'user_id', _creator->>'id',
               'email', _creator->>'email',
               'name', _creator->>'full_name',
               'channels', to_jsonb(ARRAY['email','in_app']::text[])
             ))
      ELSE '[]'::jsonb
    END, '[]'::jsonb)
    || COALESCE(_audience->'design','[]'::jsonb)
    || COALESCE(_audience->'purchase','[]'::jsonb)
    || COALESCE(_audience->'manufacturing','[]'::jsonb);

  BEGIN
    INSERT INTO public.order_revision_notifications
      (order_id, order_root_id, oa_number, revision, previous_revision,
       revised_from_id, client_name, format, recipients, audience, payload,
       triggered_by)
    VALUES
      (NEW.id, _root, NEW.oa_number, NEW.revision, _prev_rev,
       NEW.revised_from_id, NEW.company_name, NEW.format,
       _recipients, _audience,
       jsonb_build_object(
         'oa_number', NEW.oa_number,
         'revision', NEW.revision,
         'previous_revision', _prev_rev,
         'client_name', NEW.company_name,
         'format', NEW.format,
         'order_id', NEW.id,
         'order_root_id', _root,
         'revised_from_id', NEW.revised_from_id
       ),
       NEW.user_id);
  EXCEPTION WHEN OTHERS THEN
    -- Never block revision creation if notification capture fails.
    RAISE WARNING 'enqueue_order_revision_notification failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_orders_after_insert_notify
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_order_revision_notification();
