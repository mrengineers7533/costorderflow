
REVOKE EXECUTE ON FUNCTION public.refresh_boq_revision_approval_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_boq_revision_approval_snapshot(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.carry_forward_boq_design_state(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carry_forward_boq_design_state(uuid, uuid) TO authenticated;
