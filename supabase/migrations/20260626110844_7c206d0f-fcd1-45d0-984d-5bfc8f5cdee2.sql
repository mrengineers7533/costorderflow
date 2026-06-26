
-- Triggers on boq_item_design_status
DROP TRIGGER IF EXISTS trg_refresh_approval_snapshot_from_status ON public.boq_item_design_status;
CREATE TRIGGER trg_refresh_approval_snapshot_from_status
AFTER INSERT OR UPDATE OR DELETE ON public.boq_item_design_status
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_boq_revision_approval_snapshot();

-- Triggers on boq_design_comments
DROP TRIGGER IF EXISTS trg_refresh_approval_snapshot_from_comments ON public.boq_design_comments;
CREATE TRIGGER trg_refresh_approval_snapshot_from_comments
AFTER INSERT OR UPDATE OR DELETE ON public.boq_design_comments
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_boq_revision_approval_snapshot();

-- Backfill snapshots for every existing BOQ (idempotent — internal fn upserts)
DO $$
DECLARE _b record;
BEGIN
  FOR _b IN SELECT id FROM public.boqs LOOP
    PERFORM public.refresh_boq_revision_approval_snapshot_internal(_b.id);
  END LOOP;
END $$;
