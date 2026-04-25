ALTER TABLE public.cost_sheets REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cost_sheets;