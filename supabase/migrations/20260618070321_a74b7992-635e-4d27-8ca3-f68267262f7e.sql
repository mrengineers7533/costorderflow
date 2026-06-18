
-- 1. Permission enum
DO $$ BEGIN
  CREATE TYPE public.access_perm AS ENUM ('view','edit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.doc_kind AS ENUM ('order','boq','pi','purchase_order','requisition');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Module-level view/edit split (back-compat: existing rows = 'edit')
ALTER TABLE public.user_module_access
  ADD COLUMN IF NOT EXISTS permission public.access_perm NOT NULL DEFAULT 'edit';

-- 3. Per-document access table
CREATE TABLE IF NOT EXISTS public.document_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_kind   public.doc_kind NOT NULL,
  doc_id     uuid NOT NULL,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission public.access_perm NOT NULL DEFAULT 'view',
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doc_kind, doc_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_access TO authenticated;
GRANT ALL ON public.document_access TO service_role;

ALTER TABLE public.document_access ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_document_access_doc ON public.document_access(doc_kind, doc_id);
CREATE INDEX IF NOT EXISTS idx_document_access_user ON public.document_access(user_id);

-- RLS: users see their own grants; admins manage everything
DROP POLICY IF EXISTS doc_access_admin_all ON public.document_access;
CREATE POLICY doc_access_admin_all ON public.document_access
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS doc_access_select_own ON public.document_access;
CREATE POLICY doc_access_select_own ON public.document_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 4. Helper functions

CREATE OR REPLACE FUNCTION public.has_module_perm(_user uuid, _module text, _need public.access_perm)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_module_access
       WHERE user_id = _user
         AND module = _module
         AND (_need = 'view' OR permission = 'edit')
    );
$$;

CREATE OR REPLACE FUNCTION public.has_doc_access(_user uuid, _kind public.doc_kind, _doc_id uuid, _need public.access_perm)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _creator uuid;
  _ok boolean;
BEGIN
  IF _user IS NULL OR _doc_id IS NULL THEN RETURN false; END IF;
  IF public.has_role(_user, 'admin') THEN RETURN true; END IF;

  -- Creator always has edit
  CASE _kind
    WHEN 'order'          THEN SELECT user_id    INTO _creator FROM public.orders            WHERE id = _doc_id;
    WHEN 'boq'            THEN SELECT user_id    INTO _creator FROM public.boqs              WHERE id = _doc_id;
    WHEN 'pi'             THEN SELECT user_id    INTO _creator FROM public.proforma_invoices WHERE id = _doc_id;
    WHEN 'purchase_order' THEN SELECT created_by INTO _creator FROM public.purchase_orders   WHERE id = _doc_id;
    WHEN 'requisition'    THEN SELECT user_id    INTO _creator FROM public.requisitions      WHERE id = _doc_id;
  END CASE;

  IF _creator IS NOT NULL AND _creator = _user THEN RETURN true; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.document_access
     WHERE doc_kind = _kind AND doc_id = _doc_id AND user_id = _user
       AND (_need = 'view' OR permission = 'edit')
  ) INTO _ok;
  RETURN COALESCE(_ok, false);
END;
$$;

-- 5. Replace RLS on the five doc tables to use has_doc_access
-- ORDERS
DROP POLICY IF EXISTS orders_select_owned_or_admin ON public.orders;
DROP POLICY IF EXISTS orders_update_owned_or_admin ON public.orders;
DROP POLICY IF EXISTS orders_delete_owned_or_admin ON public.orders;
CREATE POLICY orders_select_doc_access ON public.orders
  FOR SELECT TO authenticated
  USING (public.has_doc_access(auth.uid(), 'order', id, 'view'));
CREATE POLICY orders_update_doc_access ON public.orders
  FOR UPDATE TO authenticated
  USING (public.has_doc_access(auth.uid(), 'order', id, 'edit'))
  WITH CHECK (public.has_doc_access(auth.uid(), 'order', id, 'edit'));
CREATE POLICY orders_delete_doc_access ON public.orders
  FOR DELETE TO authenticated
  USING (public.has_doc_access(auth.uid(), 'order', id, 'edit'));

-- BOQS
DROP POLICY IF EXISTS boqs_select_owned_or_admin ON public.boqs;
DROP POLICY IF EXISTS boqs_update_owned_or_admin ON public.boqs;
DROP POLICY IF EXISTS boqs_delete_owned_or_admin ON public.boqs;
CREATE POLICY boqs_select_doc_access ON public.boqs
  FOR SELECT TO authenticated
  USING (public.has_doc_access(auth.uid(), 'boq', id, 'view'));
CREATE POLICY boqs_update_doc_access ON public.boqs
  FOR UPDATE TO authenticated
  USING (public.has_doc_access(auth.uid(), 'boq', id, 'edit'))
  WITH CHECK (public.has_doc_access(auth.uid(), 'boq', id, 'edit'));
CREATE POLICY boqs_delete_doc_access ON public.boqs
  FOR DELETE TO authenticated
  USING (public.has_doc_access(auth.uid(), 'boq', id, 'edit'));

-- PI
DROP POLICY IF EXISTS pi_select_owned_or_admin ON public.proforma_invoices;
DROP POLICY IF EXISTS pi_update_owned_or_admin ON public.proforma_invoices;
DROP POLICY IF EXISTS pi_delete_owned_or_admin ON public.proforma_invoices;
CREATE POLICY pi_select_doc_access ON public.proforma_invoices
  FOR SELECT TO authenticated
  USING (public.has_doc_access(auth.uid(), 'pi', id, 'view'));
CREATE POLICY pi_update_doc_access ON public.proforma_invoices
  FOR UPDATE TO authenticated
  USING (public.has_doc_access(auth.uid(), 'pi', id, 'edit'))
  WITH CHECK (public.has_doc_access(auth.uid(), 'pi', id, 'edit'));
CREATE POLICY pi_delete_doc_access ON public.proforma_invoices
  FOR DELETE TO authenticated
  USING (public.has_doc_access(auth.uid(), 'pi', id, 'edit'));

-- PURCHASE ORDERS
DROP POLICY IF EXISTS "PO read own or admin" ON public.purchase_orders;
DROP POLICY IF EXISTS "PO update own or admin" ON public.purchase_orders;
DROP POLICY IF EXISTS "PO delete admin" ON public.purchase_orders;
CREATE POLICY po_select_doc_access ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (public.has_doc_access(auth.uid(), 'purchase_order', id, 'view'));
CREATE POLICY po_update_doc_access ON public.purchase_orders
  FOR UPDATE TO authenticated
  USING (public.has_doc_access(auth.uid(), 'purchase_order', id, 'edit'))
  WITH CHECK (public.has_doc_access(auth.uid(), 'purchase_order', id, 'edit'));
CREATE POLICY po_delete_doc_access ON public.purchase_orders
  FOR DELETE TO authenticated
  USING (public.has_doc_access(auth.uid(), 'purchase_order', id, 'edit'));

-- REQUISITIONS
DROP POLICY IF EXISTS requisitions_select_owned_or_admin ON public.requisitions;
DROP POLICY IF EXISTS requisitions_update_owned_or_admin ON public.requisitions;
DROP POLICY IF EXISTS requisitions_delete_owned_or_admin ON public.requisitions;
CREATE POLICY requisitions_select_doc_access ON public.requisitions
  FOR SELECT TO authenticated
  USING (public.has_doc_access(auth.uid(), 'requisition', id, 'view'));
CREATE POLICY requisitions_update_doc_access ON public.requisitions
  FOR UPDATE TO authenticated
  USING (public.has_doc_access(auth.uid(), 'requisition', id, 'edit'))
  WITH CHECK (public.has_doc_access(auth.uid(), 'requisition', id, 'edit'));
CREATE POLICY requisitions_delete_doc_access ON public.requisitions
  FOR DELETE TO authenticated
  USING (public.has_doc_access(auth.uid(), 'requisition', id, 'edit'));

-- 6. AFTER INSERT triggers: auto-grant creator edit access
CREATE OR REPLACE FUNCTION public._grant_creator_doc_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _kind public.doc_kind;
  _creator uuid;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'orders'            THEN _kind := 'order';          _creator := NEW.user_id;
    WHEN 'boqs'              THEN _kind := 'boq';            _creator := NEW.user_id;
    WHEN 'proforma_invoices' THEN _kind := 'pi';             _creator := NEW.user_id;
    WHEN 'purchase_orders'   THEN _kind := 'purchase_order'; _creator := NEW.created_by;
    WHEN 'requisitions'      THEN _kind := 'requisition';    _creator := NEW.user_id;
  END CASE;

  IF _creator IS NOT NULL THEN
    INSERT INTO public.document_access (doc_kind, doc_id, user_id, permission, granted_by)
    VALUES (_kind, NEW.id, _creator, 'edit', _creator)
    ON CONFLICT (doc_kind, doc_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_creator_access ON public.orders;
CREATE TRIGGER trg_orders_creator_access AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public._grant_creator_doc_access();

DROP TRIGGER IF EXISTS trg_boqs_creator_access ON public.boqs;
CREATE TRIGGER trg_boqs_creator_access AFTER INSERT ON public.boqs
  FOR EACH ROW EXECUTE FUNCTION public._grant_creator_doc_access();

DROP TRIGGER IF EXISTS trg_pi_creator_access ON public.proforma_invoices;
CREATE TRIGGER trg_pi_creator_access AFTER INSERT ON public.proforma_invoices
  FOR EACH ROW EXECUTE FUNCTION public._grant_creator_doc_access();

DROP TRIGGER IF EXISTS trg_po_creator_access ON public.purchase_orders;
CREATE TRIGGER trg_po_creator_access AFTER INSERT ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public._grant_creator_doc_access();

DROP TRIGGER IF EXISTS trg_req_creator_access ON public.requisitions;
CREATE TRIGGER trg_req_creator_access AFTER INSERT ON public.requisitions
  FOR EACH ROW EXECUTE FUNCTION public._grant_creator_doc_access();

-- 7. Backfill: existing rows -> creator gets edit access
INSERT INTO public.document_access (doc_kind, doc_id, user_id, permission, granted_by)
SELECT 'order'::public.doc_kind, id, user_id, 'edit'::public.access_perm, user_id
  FROM public.orders WHERE user_id IS NOT NULL
ON CONFLICT (doc_kind, doc_id, user_id) DO NOTHING;

INSERT INTO public.document_access (doc_kind, doc_id, user_id, permission, granted_by)
SELECT 'boq', id, user_id, 'edit', user_id FROM public.boqs WHERE user_id IS NOT NULL
ON CONFLICT (doc_kind, doc_id, user_id) DO NOTHING;

INSERT INTO public.document_access (doc_kind, doc_id, user_id, permission, granted_by)
SELECT 'pi', id, user_id, 'edit', user_id FROM public.proforma_invoices WHERE user_id IS NOT NULL
ON CONFLICT (doc_kind, doc_id, user_id) DO NOTHING;

INSERT INTO public.document_access (doc_kind, doc_id, user_id, permission, granted_by)
SELECT 'purchase_order', id, created_by, 'edit', created_by FROM public.purchase_orders WHERE created_by IS NOT NULL
ON CONFLICT (doc_kind, doc_id, user_id) DO NOTHING;

INSERT INTO public.document_access (doc_kind, doc_id, user_id, permission, granted_by)
SELECT 'requisition', id, user_id, 'edit', user_id FROM public.requisitions WHERE user_id IS NOT NULL
ON CONFLICT (doc_kind, doc_id, user_id) DO NOTHING;
