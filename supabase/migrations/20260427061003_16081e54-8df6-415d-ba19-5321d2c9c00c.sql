-- Make user_id optional on data tables
ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.cost_sheets ALTER COLUMN user_id DROP NOT NULL;

-- Drop existing per-user policies on orders
DROP POLICY IF EXISTS orders_select_own ON public.orders;
DROP POLICY IF EXISTS orders_insert_own ON public.orders;
DROP POLICY IF EXISTS orders_update_own ON public.orders;
DROP POLICY IF EXISTS orders_delete_own ON public.orders;

-- Public access on orders
CREATE POLICY orders_public_select ON public.orders FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY orders_public_insert ON public.orders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY orders_public_update ON public.orders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY orders_public_delete ON public.orders FOR DELETE TO anon, authenticated USING (true);

-- Drop existing per-user policies on cost_sheets
DROP POLICY IF EXISTS cost_sheets_select_own ON public.cost_sheets;
DROP POLICY IF EXISTS cost_sheets_insert_own ON public.cost_sheets;
DROP POLICY IF EXISTS cost_sheets_update_own ON public.cost_sheets;
DROP POLICY IF EXISTS cost_sheets_delete_own ON public.cost_sheets;

-- Public access on cost_sheets
CREATE POLICY cost_sheets_public_select ON public.cost_sheets FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY cost_sheets_public_insert ON public.cost_sheets FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY cost_sheets_public_update ON public.cost_sheets FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY cost_sheets_public_delete ON public.cost_sheets FOR DELETE TO anon, authenticated USING (true);

-- Drop existing template policies
DROP POLICY IF EXISTS templates_admin_delete ON public.order_templates;
DROP POLICY IF EXISTS templates_admin_insert ON public.order_templates;
DROP POLICY IF EXISTS templates_admin_update ON public.order_templates;
DROP POLICY IF EXISTS templates_select_authenticated ON public.order_templates;

-- Public access on order_templates
CREATE POLICY templates_public_select ON public.order_templates FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY templates_public_insert ON public.order_templates FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY templates_public_update ON public.order_templates FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY templates_public_delete ON public.order_templates FOR DELETE TO anon, authenticated USING (true);

-- Storage policies: cost-sheets bucket — public read/write
DROP POLICY IF EXISTS "cost_sheets_public_select" ON storage.objects;
DROP POLICY IF EXISTS "cost_sheets_public_insert" ON storage.objects;
DROP POLICY IF EXISTS "cost_sheets_public_update" ON storage.objects;
DROP POLICY IF EXISTS "cost_sheets_public_delete" ON storage.objects;
CREATE POLICY "cost_sheets_public_select" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'cost-sheets');
CREATE POLICY "cost_sheets_public_insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'cost-sheets');
CREATE POLICY "cost_sheets_public_update" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'cost-sheets') WITH CHECK (bucket_id = 'cost-sheets');
CREATE POLICY "cost_sheets_public_delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'cost-sheets');

-- Storage policies: order-templates bucket — public write (already public read)
DROP POLICY IF EXISTS "order_templates_public_insert" ON storage.objects;
DROP POLICY IF EXISTS "order_templates_public_update" ON storage.objects;
DROP POLICY IF EXISTS "order_templates_public_delete" ON storage.objects;
CREATE POLICY "order_templates_public_insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'order-templates');
CREATE POLICY "order_templates_public_update" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'order-templates') WITH CHECK (bucket_id = 'order-templates');
CREATE POLICY "order_templates_public_delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'order-templates') ;