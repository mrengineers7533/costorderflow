## Root cause

The error `invalid input syntax for type uuid: ""` happens in `reviseOrder()` (`src/lib/revisions/index.ts`). `OrderEditor.tsx → snapshotOrder()` builds the snapshot with `user_id: ""` (and `revised_from_id` may also be `""` on legacy rows). `reviseOrder` strips `id`/`created_at`/etc. but passes the rest straight into `supabase.from("orders").insert(...)`, where the empty string hits a `uuid` column and Postgres rejects it.

The previous attempt didn't actually patch this — the empty `user_id` is still being sent.

## Fix

### 1. `src/lib/revisions/index.ts` — `reviseOrder()`

- **Sanitize the insert payload**: convert any empty-string uuid field (`user_id`, `revised_from_id`, plus a generic sweep of other `*_id` keys) to `null` before insert. This kills the crash for both fresh rows and legacy rows.
- **Compute the revised OA number** and override it on the insert payload:
  - Find the family's original OA number — query `orders` for the row in this family with `revision = 0` (fallback: strip a trailing `/R\d+` from `source.oa_number`).
  - New `oa_number = ${baseNumber}/R${nextRev}` → `MROA/2026-2027/001/R1`, then `/R2`, `/R3`, … and likewise `2026-27/GMS/0007/R1`, `/R2`, …
  - Numbering is derived purely from `nextRev` (= `max(revision) + 1` across the family, already computed), so it cannot collide and the original row is never modified.
- The OA counter RPC (`next_oa_number`) is **not** called for revisions, so the base counter stays untouched.

### 2. `src/pages/orders/OrderEditor.tsx`

No change to `handleReviseOa` flow. The fix is fully inside `reviseOrder`.

## Out of scope (untouched)

- BOQ/PI numbering and revisioning, GMS PI work, folder tabs, format chooser, save/finalize flows, RLS, schema, edge functions, `next_oa_number` / counters, `orders_keep_single_current` trigger.

## Technical notes

- Regex used to strip an existing suffix when the `revision = 0` row can't be located: `/\/R\d+$/`. Applied only to derive the base; the base is then re-suffixed with `/R${nextRev}`.
- Empty-string → null sweep is defensive: iterate the payload keys; for any value `=== ""` on a key ending in `_id` or equal to `user_id`, set it to `null`.
- Original OA row is never updated — only a new row is inserted; existing trigger marks the previous current row as superseded.
