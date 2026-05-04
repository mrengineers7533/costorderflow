DO $$
DECLARE
  _owner uuid;
BEGIN
  SELECT user_id INTO _owner
  FROM public.user_roles
  WHERE role = 'admin'::public.app_role
  ORDER BY created_at ASC
  LIMIT 1;

  IF _owner IS NULL THEN
    SELECT id INTO _owner FROM public.profiles ORDER BY created_at ASC LIMIT 1;
  END IF;

  IF _owner IS NOT NULL THEN
    UPDATE public.orders SET user_id = _owner WHERE user_id IS NULL;
    UPDATE public.cost_sheets SET user_id = _owner WHERE user_id IS NULL;
    UPDATE public.boqs SET user_id = _owner WHERE user_id IS NULL;
    UPDATE public.proforma_invoices SET user_id = _owner WHERE user_id IS NULL;
  END IF;
END $$;

ALTER TABLE public.proforma_invoice_documents
  ADD COLUMN IF NOT EXISTS user_id uuid;

UPDATE public.proforma_invoice_documents d
SET user_id = p.user_id
FROM public.proforma_invoices p
WHERE d.pi_id = p.id
  AND d.user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_boqs_user ON public.boqs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pi_user ON public.proforma_invoices(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pi_docs_user ON public.proforma_invoice_documents(user_id, created_at DESC);

DROP POLICY IF EXISTS orders_public_select ON public.orders;
DROP POLICY IF EXISTS orders_public_insert ON public.orders;
DROP POLICY IF EXISTS orders_public_update ON public.orders;
DROP POLICY IF EXISTS orders_public_delete ON public.orders;
DROP POLICY IF EXISTS orders_select_own ON public.orders;
DROP POLICY IF EXISTS orders_insert_own ON public.orders;
DROP POLICY IF EXISTS orders_update_own ON public.orders;
DROP POLICY IF EXISTS orders_delete_own ON public.orders;

CREATE POLICY orders_select_owned_or_admin ON public.orders
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY orders_insert_own ON public.orders
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY orders_update_owned_or_admin ON public.orders
FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY orders_delete_owned_or_admin ON public.orders
FOR DELETE TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS cost_sheets_public_select ON public.cost_sheets;
DROP POLICY IF EXISTS cost_sheets_public_insert ON public.cost_sheets;
DROP POLICY IF EXISTS cost_sheets_public_update ON public.cost_sheets;
DROP POLICY IF EXISTS cost_sheets_public_delete ON public.cost_sheets;
DROP POLICY IF EXISTS cost_sheets_select_own ON public.cost_sheets;
DROP POLICY IF EXISTS cost_sheets_insert_own ON public.cost_sheets;
DROP POLICY IF EXISTS cost_sheets_update_own ON public.cost_sheets;
DROP POLICY IF EXISTS cost_sheets_delete_own ON public.cost_sheets;

CREATE POLICY cost_sheets_select_owned_or_admin ON public.cost_sheets
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY cost_sheets_insert_own ON public.cost_sheets
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY cost_sheets_update_owned_or_admin ON public.cost_sheets
FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY cost_sheets_delete_owned_or_admin ON public.cost_sheets
FOR DELETE TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS boqs_public_select ON public.boqs;
DROP POLICY IF EXISTS boqs_public_insert ON public.boqs;
DROP POLICY IF EXISTS boqs_public_update ON public.boqs;
DROP POLICY IF EXISTS boqs_public_delete ON public.boqs;
DROP POLICY IF EXISTS boqs_select_owned_or_admin ON public.boqs;
DROP POLICY IF EXISTS boqs_insert_own ON public.boqs;
DROP POLICY IF EXISTS boqs_update_owned_or_admin ON public.boqs;
DROP POLICY IF EXISTS boqs_delete_owned_or_admin ON public.boqs;

CREATE POLICY boqs_select_owned_or_admin ON public.boqs
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY boqs_insert_own ON public.boqs
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY boqs_update_owned_or_admin ON public.boqs
FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY boqs_delete_owned_or_admin ON public.boqs
FOR DELETE TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS pi_public_select ON public.proforma_invoices;
DROP POLICY IF EXISTS pi_public_insert ON public.proforma_invoices;
DROP POLICY IF EXISTS pi_public_update ON public.proforma_invoices;
DROP POLICY IF EXISTS pi_public_delete ON public.proforma_invoices;
DROP POLICY IF EXISTS pi_select_owned_or_admin ON public.proforma_invoices;
DROP POLICY IF EXISTS pi_insert_own ON public.proforma_invoices;
DROP POLICY IF EXISTS pi_update_owned_or_admin ON public.proforma_invoices;
DROP POLICY IF EXISTS pi_delete_owned_or_admin ON public.proforma_invoices;

CREATE POLICY pi_select_owned_or_admin ON public.proforma_invoices
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY pi_insert_own ON public.proforma_invoices
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY pi_update_owned_or_admin ON public.proforma_invoices
FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY pi_delete_owned_or_admin ON public.proforma_invoices
FOR DELETE TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS pi_docs_public_select ON public.proforma_invoice_documents;
DROP POLICY IF EXISTS pi_docs_public_insert ON public.proforma_invoice_documents;
DROP POLICY IF EXISTS pi_docs_public_update ON public.proforma_invoice_documents;
DROP POLICY IF EXISTS pi_docs_public_delete ON public.proforma_invoice_documents;
DROP POLICY IF EXISTS pi_docs_select_owned_or_admin ON public.proforma_invoice_documents;
DROP POLICY IF EXISTS pi_docs_insert_own ON public.proforma_invoice_documents;
DROP POLICY IF EXISTS pi_docs_update_owned_or_admin ON public.proforma_invoice_documents;
DROP POLICY IF EXISTS pi_docs_delete_owned_or_admin ON public.proforma_invoice_documents;

CREATE POLICY pi_docs_select_owned_or_admin ON public.proforma_invoice_documents
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY pi_docs_insert_own ON public.proforma_invoice_documents
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY pi_docs_update_owned_or_admin ON public.proforma_invoice_documents
FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY pi_docs_delete_owned_or_admin ON public.proforma_invoice_documents
FOR DELETE TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS templates_public_insert ON public.order_templates;
DROP POLICY IF EXISTS templates_public_update ON public.order_templates;
DROP POLICY IF EXISTS templates_public_delete ON public.order_templates;

DROP POLICY IF EXISTS "cost_sheets_public_select" ON storage.objects;
DROP POLICY IF EXISTS "cost_sheets_public_insert" ON storage.objects;
DROP POLICY IF EXISTS "cost_sheets_public_update" ON storage.objects;
DROP POLICY IF EXISTS "cost_sheets_public_delete" ON storage.objects;
DROP POLICY IF EXISTS "cost_sheets_select_own" ON storage.objects;
DROP POLICY IF EXISTS "cost_sheets_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "cost_sheets_update_own" ON storage.objects;
DROP POLICY IF EXISTS "cost_sheets_delete_own" ON storage.objects;

CREATE POLICY "cost_sheets_select_owned_or_admin" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'cost-sheets' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "cost_sheets_insert_own" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'cost-sheets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "cost_sheets_update_owned_or_admin" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'cost-sheets' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::public.app_role)))
WITH CHECK (bucket_id = 'cost-sheets' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "cost_sheets_delete_owned_or_admin" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'cost-sheets' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::public.app_role)));

DROP POLICY IF EXISTS "oa_docs_select" ON storage.objects;
DROP POLICY IF EXISTS "oa_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "oa_docs_update" ON storage.objects;
DROP POLICY IF EXISTS "oa_docs_delete" ON storage.objects;
DROP POLICY IF EXISTS "boq_docs_select" ON storage.objects;
DROP POLICY IF EXISTS "boq_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "boq_docs_update" ON storage.objects;
DROP POLICY IF EXISTS "boq_docs_delete" ON storage.objects;
DROP POLICY IF EXISTS "pi_docs_select" ON storage.objects;
DROP POLICY IF EXISTS "pi_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "pi_docs_update" ON storage.objects;
DROP POLICY IF EXISTS "pi_docs_delete" ON storage.objects;

CREATE POLICY "oa_docs_select_owned_or_admin" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'oa-documents' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::public.app_role)));
CREATE POLICY "oa_docs_insert_own" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'oa-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "oa_docs_update_owned_or_admin" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'oa-documents' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::public.app_role)))
WITH CHECK (bucket_id = 'oa-documents' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::public.app_role)));
CREATE POLICY "oa_docs_delete_owned_or_admin" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'oa-documents' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "boq_docs_select_owned_or_admin" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'boq-documents' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::public.app_role)));
CREATE POLICY "boq_docs_insert_own" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'boq-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "boq_docs_update_owned_or_admin" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'boq-documents' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::public.app_role)))
WITH CHECK (bucket_id = 'boq-documents' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::public.app_role)));
CREATE POLICY "boq_docs_delete_owned_or_admin" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'boq-documents' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "pi_docs_select_owned_or_admin" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'pi-documents' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::public.app_role)));
CREATE POLICY "pi_docs_insert_own" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'pi-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "pi_docs_update_owned_or_admin" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'pi-documents' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::public.app_role)))
WITH CHECK (bucket_id = 'pi-documents' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::public.app_role)));
CREATE POLICY "pi_docs_delete_owned_or_admin" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'pi-documents' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::public.app_role)));

DROP POLICY IF EXISTS "order_templates_public_insert" ON storage.objects;
DROP POLICY IF EXISTS "order_templates_public_update" ON storage.objects;
DROP POLICY IF EXISTS "order_templates_public_delete" ON storage.objects;

GRANT EXECUTE ON FUNCTION public.next_oa_number(public.order_format, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.next_oa_number(public.order_format, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.next_pi_number(public.order_format, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.next_pi_number(public.order_format, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;