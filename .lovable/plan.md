# Fix: "permission denied for function is_design_review_owner" on document upload

## Root cause (verified in the database)

Two storage policies on `storage.objects` are granted to the `authenticated` role and call the helper `is_design_review_owner(text)`:

- `design_review_docs_select_owner` (SELECT)
- `design_review_docs_modify_owner` (ALL)

Both are scoped to `bucket_id = 'design-review-docs'`, but Postgres does not guarantee that the bucket check short-circuits before the function call. Every permissive policy on `storage.objects` gets evaluated for any storage operation, including a Cost Sheet PDF upload into the `cost-sheets` bucket.

A previous security-hardening pass revoked EXECUTE on that function from everyone except `postgres` and `service_role` (current ACL: `{postgres=X/postgres, service_role=X/postgres}`). So a signed-in user's upload hits a policy that calls a function they may not execute, and Postgres raises `permission denied for function is_design_review_owner` before the bucket condition can save it.

This is not an upload-code bug and not user-specific.

## Minimal fix

One migration, one statement in effect:

```sql
GRANT EXECUTE ON FUNCTION public.is_design_review_owner(text) TO authenticated;
```

Nothing else changes — no policy rewrite, no bucket change, no RLS disable.

## Why this is safe

- The function is `SECURITY DEFINER` and performs its own ownership check: it returns true only when the design review row belongs to `auth.uid()` or the caller is an admin. Executing it grants no data access by itself.
- The grant goes to `authenticated` only — not `anon`, not `public`.
- The two policies that need it are already restricted to `authenticated`, so this simply restores the privilege those policies require to be evaluable.
- Design Review ownership rules, bucket privacy, existing paths, and all other policies stay exactly as they are.

## Verification after the migration

- Confirm the function ACL now includes `authenticated=X`.
- Re-run the security linter to confirm no new finding.
- Confirm no other policy or function was touched (`pg_policies` diff on `storage.objects`).
- Upload a Cost Sheet PDF in Costing → Orders and confirm the record saves and the file remains available after refresh.

## Out of scope

No frontend, UI, workflow, calculation, numbering, approval, or access-control changes. No other grants, no bucket edits, no changes to existing attachments.
