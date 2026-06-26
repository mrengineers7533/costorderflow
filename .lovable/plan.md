# Allow Design module users to approve BOQ items

## Root cause

`boq_item_design_status` INSERT and UPDATE policies require the user to be in `notification_recipients` with `department='design'`. `design@mrengineers.com` has the Design module assigned but is not a notification recipient, so "Approve All" fails with "Could not update approvals".

The `module_edit_gate_*` policies use `can_edit_module(..., 'design')`, which requires **edit** permission. If the user was given **view** permission, those also fail.

## Fix (SQL migration only)

Replace the restrictive notification-recipient-based policies on `boq_item_design_status` with module-perm policies, so any user with Design module access (view or edit) can record approvals/comments:

- Drop `Design or admin can insert design status`, replace with policy that uses `has_module_perm(auth.uid(),'design','view')` OR admin.
- Drop `Design or admin can update design status`, same replacement.
- Drop `Owners or admins can read design status`, replace with module-perm SELECT (design/manufacturing/purchase view).
- Keep existing `module_edit_gate_*` policies (RLS is OR-combined, so either policy passing is enough).

No app/UI changes. No change to numbering, calculations, notifications, or approval workflow logic.

## Verification

- Re-query `pg_policies` to confirm new policies.
- Log in as `design@mrengineers.com`, click Approve All on R7 — toast should succeed and items should flip to Approved.
