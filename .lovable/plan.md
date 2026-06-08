# Fix: Design team can't open/download item attachments

## Root cause

On the `/design-review/:token` page the file list (`Instructions:`) is fetched correctly via the `get_boq_item_attachments_by_token` SECURITY DEFINER RPC, so names appear. But clicking a link calls `supabase.storage.from('boq-item-docs').createSignedUrl(...)` as an **anonymous** user, which returns `404 Object not found`.

The current storage RLS policy is:

```text
Anon read boq-item-docs via open review (SELECT, roles=anon)
  USING bucket_id='boq-item-docs'
        AND EXISTS (SELECT 1 FROM boq_design_reviews r
                    WHERE r.status='sent' AND r.expires_at > now()
                      AND r.boq_id::text = split_part(objects.name,'/',1))
```

The `EXISTS` subquery runs as the `anon` role, which has **no SELECT grant on `public.boq_design_reviews`**, so the subquery returns false and the storage object is hidden — hence the 404 and the broken link/download.

Verified by curl against `/storage/v1/object/sign/...` with the anon key → 404, while the row + attachments + open review all exist in the DB.

The fallback RPC `public.sign_boq_item_doc_by_token` is also non-functional (returns NULL because `storage.create_signed_url` does not exist in this project), so the storage policy must be fixed.

## Fix (one migration, no app code changes)

1. Create `public.has_open_review_for_boq(_boq_id uuid) RETURNS boolean` — `SECURITY DEFINER`, `STABLE`, `SET search_path = public`. Returns true when there is a `boq_design_reviews` row with `boq_id = _boq_id`, `status = 'sent'`, `expires_at > now()`. `GRANT EXECUTE ... TO anon, authenticated`.
2. Drop and recreate the `Anon read boq-item-docs via open review` policy on `storage.objects` so its `USING` clause calls the new helper:

   ```text
   bucket_id = 'boq-item-docs'
     AND public.has_open_review_for_boq(
           (split_part(name, '/', 1))::uuid)
   ```

3. Leave every other storage policy, RPC, table, frontend file, and bucket unchanged.

## Acceptance

- Opening the link in the report (the user's `…/design-review/3d735e49-…` URL) shows the same items but the file names under "Instructions:" become live links that open/download in a new tab.
- Authenticated creators continue to upload, download, and delete via the existing `Auth …` policies.
- Submitting the review still works; no schema, RPC, or UI behavior changes.

## Out of scope

- The `sign_boq_item_doc_by_token` RPC stays as-is (unused).
- No changes to BOQ editor, link-generation panel, or the `boq_remarks_audit_log` flow already shipped this session.
