# Enable OA revise for Costing users (access-only fix)

## Root cause

Revising an OA fails for a Costing (`costing:edit`) user when the source OA was created by someone else. Two layers block it:

1. **`orders_insert_own` (permissive INSERT)** requires `auth.uid() = user_id OR admin`. `reviseOrder` in `src/lib/revisions/index.ts` copies the whole source row via `stripOrderForInsert`, so `user_id` on the new revision row still points to the original creator. The insert is rejected.
2. **`boqs_insert_own` (permissive INSERT)** on `boqs` has the same rule. Even if the OA insert succeeded, the auto-revised BOQ insert (`reviseBoqFromOrder`) would fail for the same reason (`user_id` copied from previous BOQ).
3. The equivalent policy `pi_insert_own` on `proforma_invoices` has the same shape and would eventually bite PI clone/revise paths — fix in the same migration so the three tables stay consistent.

`can_edit_module`, `can_edit_doc`, `has_doc_access` already grant Costing users edit/view; the SELECT/UPDATE/DELETE paths and the RESTRICTIVE `module_edit_gate_ins` policy already work. Only the permissive INSERT policies are too narrow.

Nothing else in the OA revise path (RPC, numbering, snapshot triggers, notifications) enforces creator identity — those layers already delegate to module/doc-access helpers.

## Fix

### 1. Migration (single file) — widen permissive INSERT policies

Drop and recreate the three permissive INSERT policies so the check is "creator OR admin OR module-editor":

- `orders_insert_own` on `public.orders`
  - `WITH CHECK ( auth.uid() = user_id OR has_role(auth.uid(),'admin') OR can_edit_module(auth.uid(),'costing') )`
- `boqs_insert_own` on `public.boqs` — same three-way check with `'costing'`.
- `pi_insert_own` on `public.proforma_invoices` — same three-way check with `'costing'`.

RESTRICTIVE `module_edit_gate_ins` policies stay in place, so a caller still needs `can_edit_module('costing')` (or admin). No other policies, functions, or triggers are touched. Design users are unaffected — they have no `costing:edit`, so this three-way check does not open OA/PI edit to them.

### 2. No code changes required in `src/lib/revisions/index.ts`

`reviseOrder` and `reviseBoqFromOrder` keep copying `user_id` unchanged so downstream reporting/history still show the original creator. RLS now permits the write for any `costing:edit` user.

### 3. No UI changes

Revise-OA button, save/apply-comment gates, and route guards already use `useDocAccess` + module perms after the earlier plan; they already show Revise/Save for `costing:edit` users. Admin behavior, Design gates, Purchase, and Requisition are untouched.

## Files touched

```text
supabase/migrations/<new>.sql   (drop + recreate 3 permissive INSERT policies)
```

No frontend, RPC, edge function, or business-logic files change.

## Explicitly not changed

- Admin behavior, Design access, Purchase/Requisition RLS.
- OA/BOQ numbering, revision logic, approval carry-forward, snapshots.
- `reviseOrder`, `reviseBoqFromOrder`, `syncBoqsAndPisForOrder`.
- Formulas, PDFs, notifications, UI layout.
- RESTRICTIVE `module_edit_gate_ins` policies (still enforce `costing:edit`).

## Acceptance mapping

- Costing user with `costing:view` + `costing:edit` opens another user's OA → allowed by existing SELECT policy.
- Edits / applies Design comment / saves → allowed by existing permissive UPDATE `orders_update_doc_access` (uses `has_doc_access` which honors `can_edit_module('costing')`).
- Clicks Revise OA → new `orders` INSERT now passes because of widened `orders_insert_own`; RESTRICTIVE gate passes because user has `costing:edit`.
- Auto-revised BOQ → `boqs` INSERT passes the same way.
- No changes to numbering, approval carry-forward, or Admin flow.
