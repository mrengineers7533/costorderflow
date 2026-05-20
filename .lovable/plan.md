## Issue

Network + console logs show the **Client Copy** upload to Supabase Storage is being rejected:

```
POST .../storage/v1/object/oa-documents/client-copies/<rootOrderId>/...
→ 403  "new row violates row-level security policy"
```

The `oa-documents` bucket has this INSERT policy:

```
bucket_id = 'oa-documents' AND auth.uid()::text = storage.foldername(name)[1]
```

i.e. the **first folder of the object path must equal the user's UID**. Our current upload path starts with `client-copies/...` (see `src/lib/orders/clientCopies.ts`), so every Client Copy save is blocked. The PDF is generated, `doc.save()` writes the local file, then the upload throws and the catch shows a destructive toast — to the user this looks like "download failed".

The plain **Export PDF** button (`downloadPDF` in `OrderEditor.tsx`) does not touch storage, so it should already work. We'll re-test after the fix to confirm.

## Fix

1. **Prefix the storage path with the user's UID** in `saveClientCopy` (`src/lib/orders/clientCopies.ts`):

   ```
   client-copies/<rootOrderId>/<ts>-<file>.pdf
   →
   <userId>/client-copies/<rootOrderId>/<ts>-<file>.pdf
   ```

   This satisfies all four `oa_docs_*` policies (INSERT / SELECT / UPDATE / DELETE) which all key off `storage.foldername(name)[1] = auth.uid()`.

   - Fetch `auth.getUser()` before computing the path (already done later in the function — move it up).
   - Throw a clear error if no user is signed in.
   - Existing rows already in the DB keep working because download uses the stored `file_path` + signed URL (SELECT policy allows admin or owner; legacy rows uploaded under the previous broken path don't exist since every prior insert was rejected).

2. **No DB or policy migration needed** — RLS stays as-is.

3. **No change to `downloadPDF`** — it only calls `doc.save()`. After fix, re-test both buttons.

## Verification

- Click **Export PDF** on an existing OA → file downloads, no toast error.
- Click **Client Copy PDF** on a finalized OA with `parentOrderId` → file downloads AND a row appears in `client_copies` with `file_path` starting `<uid>/client-copies/...`. No 403 in network tab.
- Open the saved copy from `RevisionsPanel` → signed URL view/download works.

## Out of scope

- The previous (unanswered) request about USD-vs-INR insurance base in EXW Murthal — not part of this bug fix.
