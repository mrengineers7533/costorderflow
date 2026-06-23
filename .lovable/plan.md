## Goal

Persist the uploaded Raw Material Excel file so it can be downloaded later from the Upload history. Today, `rm_master_uploads.file_path` only stores the original filename — the actual file bytes are never saved anywhere, so download is impossible until we store the file.

## Changes

### 1. Storage bucket
Create a new private storage bucket `rm-master-uploads` with RLS policies on `storage.objects`:
- `authenticated` can read (so signed URLs work for any logged-in user viewing history).
- Only admins (`has_role(auth.uid(),'admin')`) can insert/delete (matches existing "admin-only upload" rule).

### 2. Upload flow (`src/pages/RawMaterialMaster.tsx`)
In `handleUpload`, before inserting the `rm_master_uploads` history row, upload the original `File` to `rm-master-uploads/{userId}/{timestamp}-{safeName}.xlsx` and save that storage path into `file_path`. Keep `original_filename` exactly as the user uploaded (used for the download filename). No parser, validation, or mapping logic changes.

If the storage upload fails, surface the error but still complete the existing mapping import (so existing functionality is preserved); the history row in that case stores just the filename like before and the Download button will show the "file not available" message.

### 3. Upload history UI
For each row in the "Upload history" card:
- Show the filename (already shown).
- Add a **Download** button next to it.
  - Enabled only when `file_path` looks like a storage path (contains `/`). Otherwise show muted text "File not stored" and disable.
  - On click: create a signed URL via `supabase.storage.from('rm-master-uploads').createSignedUrl(file_path, 60, { download: original_filename })` and trigger a download via a temporary `<a>` so the original filename + `.xlsx` extension is preserved.
  - On error (missing object, etc.) show a friendly toast: "Excel file is no longer available."

If `uploads.length === 0`, the card already shows "No uploads yet." — keep that copy.

### 4. Cleanup on history delete
When an admin deletes a history row (existing `setDeletingUpload` flow), also remove the corresponding object from storage if `file_path` is a storage path. No change to mapping data.

## Out of scope (explicitly unchanged)

- Excel parsing, FG/RM mapping logic, upsert into `fg_raw_material_map`, requisition behaviour, validations, formulas, permissions for editing mappings, and every other module.

## Technical notes

- Bucket creation via `supabase--storage_create_bucket` (private).
- RLS policy migration on `storage.objects` scoped to `bucket_id = 'rm-master-uploads'`.
- No schema change to `rm_master_uploads` — `file_path` already exists and is reused to hold the storage object path.
