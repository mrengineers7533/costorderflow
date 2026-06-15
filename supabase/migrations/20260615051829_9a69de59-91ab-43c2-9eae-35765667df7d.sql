
-- ============================================================
-- 1. Helper: resolve current user's department
-- ============================================================
CREATE OR REPLACE FUNCTION public.current_user_department()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT department FROM public.notification_recipients
     WHERE user_id = auth.uid() AND is_active = true LIMIT 1),
    'Other'
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_name()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()),
    (SELECT email FROM public.profiles WHERE id = auth.uid()),
    'System'
  );
$$;

-- ============================================================
-- 2. Design comments (item / cell wise)
-- ============================================================
CREATE TABLE public.boq_design_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boq_id UUID NOT NULL REFERENCES public.boqs(id) ON DELETE CASCADE,
  boq_item_id TEXT NOT NULL,
  column_key TEXT,
  comment TEXT NOT NULL,
  user_id UUID,
  user_name TEXT,
  user_email TEXT,
  department TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_boq_design_comments_boq ON public.boq_design_comments(boq_id);
CREATE INDEX idx_boq_design_comments_item ON public.boq_design_comments(boq_id, boq_item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.boq_design_comments TO authenticated;
GRANT ALL ON public.boq_design_comments TO service_role;

ALTER TABLE public.boq_design_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read comments if has boq/design/notifications access"
ON public.boq_design_comments FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_module_access(auth.uid(),'boqs')
  OR public.has_module_access(auth.uid(),'design')
  OR public.has_module_access(auth.uid(),'notifications')
);

CREATE POLICY "design users can insert comments"
ON public.boq_design_comments FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(),'admin')
  OR public.has_module_access(auth.uid(),'design')
);

CREATE POLICY "owner or admin can update/delete comment"
ON public.boq_design_comments FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "owner or admin can delete comment"
ON public.boq_design_comments FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_boq_design_comments_updated_at
BEFORE UPDATE ON public.boq_design_comments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3. App notifications + per-user reads
-- ============================================================
CREATE TABLE public.app_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module TEXT NOT NULL,
  event_type TEXT NOT NULL,
  record_id UUID,
  record_ref TEXT,
  client_name TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  old_value JSONB,
  new_value JSONB,
  actor_user_id UUID,
  actor_user_name TEXT,
  actor_department TEXT,
  target_departments TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_notifications_created ON public.app_notifications(created_at DESC);
CREATE INDEX idx_app_notifications_module ON public.app_notifications(module);
CREATE INDEX idx_app_notifications_actor ON public.app_notifications(actor_user_id);
CREATE INDEX idx_app_notifications_record ON public.app_notifications(record_id);

GRANT SELECT, INSERT ON public.app_notifications TO authenticated;
GRANT ALL ON public.app_notifications TO service_role;

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone with notifications access can read"
ON public.app_notifications FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_module_access(auth.uid(),'notifications')
  OR actor_user_id = auth.uid()
);

CREATE POLICY "system inserts allowed"
ON public.app_notifications FOR INSERT TO authenticated
WITH CHECK (true);

CREATE TABLE public.app_notification_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES public.app_notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_name TEXT,
  department TEXT,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (notification_id, user_id)
);

CREATE INDEX idx_app_notification_reads_user ON public.app_notification_reads(user_id);
CREATE INDEX idx_app_notification_reads_notif ON public.app_notification_reads(notification_id);

GRANT SELECT, INSERT ON public.app_notification_reads TO authenticated;
GRANT ALL ON public.app_notification_reads TO service_role;

ALTER TABLE public.app_notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read reads if has notifications access or own"
ON public.app_notification_reads FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(),'admin')
  OR public.has_module_access(auth.uid(),'notifications')
);

CREATE POLICY "user acknowledges own"
ON public.app_notification_reads FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 4. Notification emit helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.emit_notification(
  _module text, _event text, _record_id uuid, _record_ref text,
  _client text, _title text, _summary text,
  _old jsonb, _new jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor_dept text := public.current_user_department();
  _actor_name text := public.current_user_name();
  _targets text[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT department), ARRAY[]::text[])
    INTO _targets
  FROM public.notification_recipients
  WHERE is_active = true
    AND department IS DISTINCT FROM _actor_dept;

  INSERT INTO public.app_notifications
    (module, event_type, record_id, record_ref, client_name,
     title, summary, old_value, new_value,
     actor_user_id, actor_user_name, actor_department, target_departments)
  VALUES
    (_module, _event, _record_id, _record_ref, _client,
     _title, _summary, _old, _new,
     auth.uid(), _actor_name, _actor_dept, _targets);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'emit_notification failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- 5. Source-table triggers (additive — never mutate the row)
-- ============================================================
-- BOQs
CREATE OR REPLACE FUNCTION public.notif_on_boqs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_notification('boq','created',NEW.id,NEW.boq_number,NEW.client_name,
      'BOQ created: '||COALESCE(NEW.boq_number,''),
      NEW.client_name, NULL, to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.emit_notification('boq','status_changed',NEW.id,NEW.boq_number,NEW.client_name,
        'BOQ '||COALESCE(NEW.boq_number,'')||' status changed',
        'Status: '||COALESCE(OLD.status::text,'')||' → '||COALESCE(NEW.status::text,''),
        jsonb_build_object('status',OLD.status), jsonb_build_object('status',NEW.status));
    END IF;
    IF NEW.design_review_status IS DISTINCT FROM OLD.design_review_status THEN
      PERFORM public.emit_notification('boq','design_status_changed',NEW.id,NEW.boq_number,NEW.client_name,
        'BOQ '||COALESCE(NEW.boq_number,'')||' design status: '||COALESCE(NEW.design_review_status,''),
        NULL,
        jsonb_build_object('design_review_status',OLD.design_review_status),
        jsonb_build_object('design_review_status',NEW.design_review_status));
    END IF;
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
      PERFORM public.emit_notification('boq','verification_changed',NEW.id,NEW.boq_number,NEW.client_name,
        'BOQ '||COALESCE(NEW.boq_number,'')||' verification: '||COALESCE(NEW.verification_status,''),
        NULL,
        jsonb_build_object('verification_status',OLD.verification_status),
        jsonb_build_object('verification_status',NEW.verification_status));
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notif_boqs AFTER INSERT OR UPDATE ON public.boqs
FOR EACH ROW EXECUTE FUNCTION public.notif_on_boqs();

-- Orders
CREATE OR REPLACE FUNCTION public.notif_on_orders() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.revision,0) > 0 THEN
      PERFORM public.emit_notification('order','revision_created',NEW.id,NEW.oa_number,NEW.company_name,
        'OA revision created: '||COALESCE(NEW.oa_number,''),
        'Revision '||NEW.revision, NULL, to_jsonb(NEW));
    ELSE
      PERFORM public.emit_notification('order','created',NEW.id,NEW.oa_number,NEW.company_name,
        'Order created: '||COALESCE(NEW.oa_number,''), NEW.company_name, NULL, to_jsonb(NEW));
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.emit_notification('order','status_changed',NEW.id,NEW.oa_number,NEW.company_name,
      'Order '||COALESCE(NEW.oa_number,'')||' status: '||COALESCE(NEW.status::text,''),
      NULL, jsonb_build_object('status',OLD.status), jsonb_build_object('status',NEW.status));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notif_orders AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notif_on_orders();

-- PI
CREATE OR REPLACE FUNCTION public.notif_on_pi() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_notification('pi','created',NEW.id,NEW.pi_number,NEW.company_name,
      'PI created: '||COALESCE(NEW.pi_number,''), NEW.company_name, NULL, to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.emit_notification('pi','status_changed',NEW.id,NEW.pi_number,NEW.company_name,
      'PI '||COALESCE(NEW.pi_number,'')||' status: '||COALESCE(NEW.status::text,''),
      NULL, jsonb_build_object('status',OLD.status), jsonb_build_object('status',NEW.status));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notif_pi AFTER INSERT OR UPDATE ON public.proforma_invoices
FOR EACH ROW EXECUTE FUNCTION public.notif_on_pi();

-- Purchase Orders
CREATE OR REPLACE FUNCTION public.notif_on_po() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_notification('purchase','created',NEW.id,NEW.po_number,NEW.vendor_name,
      'PO created: '||COALESCE(NEW.po_number,''), NEW.vendor_name, NULL, to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.emit_notification('purchase','status_changed',NEW.id,NEW.po_number,NEW.vendor_name,
      'PO '||COALESCE(NEW.po_number,'')||' status: '||COALESCE(NEW.status::text,''),
      NULL, jsonb_build_object('status',OLD.status), jsonb_build_object('status',NEW.status));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notif_po AFTER INSERT OR UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.notif_on_po();

-- GRN
CREATE OR REPLACE FUNCTION public.notif_on_grn() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_notification('grn','created',NEW.id,NEW.po_id::text,NULL,
      'GRN received', 'Received qty: '||COALESCE(NEW.received_qty::text,''), NULL, to_jsonb(NEW));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notif_grn AFTER INSERT ON public.grn_receipts
FOR EACH ROW EXECUTE FUNCTION public.notif_on_grn();

-- Requisitions
CREATE OR REPLACE FUNCTION public.notif_on_req() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_notification('requisition','created',NEW.id,NEW.requisition_number,NULL,
      'Requisition created: '||COALESCE(NEW.requisition_number,''), NULL, NULL, to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.emit_notification('requisition','status_changed',NEW.id,NEW.requisition_number,NULL,
      'Requisition '||COALESCE(NEW.requisition_number,'')||' status: '||COALESCE(NEW.status::text,''),
      NULL, jsonb_build_object('status',OLD.status), jsonb_build_object('status',NEW.status));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notif_req AFTER INSERT OR UPDATE ON public.requisitions
FOR EACH ROW EXECUTE FUNCTION public.notif_on_req();

-- Design comments
CREATE OR REPLACE FUNCTION public.notif_on_design_comment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _bnum text; _client text;
BEGIN
  SELECT boq_number, client_name INTO _bnum, _client FROM public.boqs WHERE id = NEW.boq_id;
  PERFORM public.emit_notification('design_comment','comment_added',NEW.boq_id,_bnum,_client,
    'Design comment on '||COALESCE(_bnum,'BOQ'),
    LEFT(NEW.comment, 200),
    NULL,
    jsonb_build_object('item_id',NEW.boq_item_id,'column',NEW.column_key,'comment',NEW.comment));
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notif_design_comment AFTER INSERT ON public.boq_design_comments
FOR EACH ROW EXECUTE FUNCTION public.notif_on_design_comment();
