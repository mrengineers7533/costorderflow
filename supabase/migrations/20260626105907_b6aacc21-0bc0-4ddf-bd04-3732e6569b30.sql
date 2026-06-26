REVOKE ALL ON FUNCTION public.refresh_boq_revision_approval_snapshot_internal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_boq_revision_approval_snapshot_internal(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.trg_refresh_boq_revision_approval_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_refresh_boq_revision_approval_snapshot() TO service_role;

REVOKE ALL ON FUNCTION public.trg_refresh_boq_snapshot_from_boq() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_refresh_boq_snapshot_from_boq() TO service_role;

REVOKE ALL ON FUNCTION public.refresh_boq_revision_approval_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_boq_revision_approval_snapshot(uuid) TO authenticated, service_role;