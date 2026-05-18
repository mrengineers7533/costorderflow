## Root cause

The OA Folder already filters `is_current = true` (default `showSuperseded = false`), and `OaRevisionHistory` is already wired inside the OA editor. But the folder still shows both `2026-27/GMS/0003` and `2026-27/GMS/0003/R1` because **both rows have `is_current = true` in the database**.

The DB trigger `orders_keep_single_current` only flips *siblings* (rows that share the same `parent_order_id`) to superseded — it never touches the **root** row (`parent_order_id IS NULL`). So when R1 is inserted with `parent_order_id = <root id>`, the root R0 keeps `is_current = true`. Verified against the DB:

```
2026-27/GMS/0003       R0  is_current=true  parent_order_id=NULL
2026-27/GMS/0003/R1    R1  is_current=true  parent_order_id=<R0 id>
```

This also explains the screenshot showing two "CURRENT" badges in the revision history.

## Changes

### 1. Migration — fix the trigger and backfill

New file under `supabase/migrations/`:

- Replace `public.orders_keep_single_current()` so that when a row is saved with `is_current = true` and `parent_order_id IS NOT NULL`, it ALSO marks the **root** (`id = NEW.parent_order_id`) as `is_current = false`. Sibling update stays the same.
- One-time backfill: for every OA family that has any row with `revision > 0`, mark all non-max-revision rows in the family as `is_current = false`, leaving exactly the highest-`revision` row as current. Done with a single `UPDATE` using a window function over `coalesce(parent_order_id, id)` as the family key.
- No changes to columns, RLS, indexes, or other tables.

After this runs, the OA Folder query (`is_current = true`) will naturally show only the latest row per family — no client-side change needed.

### 2. `src/components/orders/OaRevisionHistory.tsx` — display polish only

- Keep numeric sort by `revision` ascending (already correct: `(a.revision ?? 0) - (b.revision ?? 0)` handles R0, R1, R2, R10).
- No logic change. After the backfill, the Status column will correctly render exactly one "Current" badge (the latest) and "Superseded" for all older rows.

### 3. No other code changes

- `OrdersList.tsx` already defaults `showSuperseded = false` and filters `is_current = true` — counts (`all`, `MR`, `GMS`) and BOQ/PI badges automatically reflect only current rows.
- `OrderEditor.tsx` already passes `rootOrderId = parent_order_id || id` to `OaRevisionHistory`, already enforces the read-only guard on superseded revisions in `save()`/Finalize, already shows the "Superseded — newer revision exists" banner with an Open-current link, and already disables the Save/Finalize buttons when not current.
- No change to `reviseOrder`, OA/BOQ/PI sync, cost-sheet parsing, formats, PDFs/Excel, permissions, or revision save logic.
- No deletion or merging of any old revisions — they are only flipped to `is_current = false` so the folder hides them while the editor's revision history still lists them in read-only View mode.

## Technical notes

Trigger body (new):

```sql
IF NEW.is_current = TRUE AND NEW.parent_order_id IS NOT NULL THEN
  UPDATE public.orders
     SET is_current = FALSE
   WHERE (parent_order_id = NEW.parent_order_id OR id = NEW.parent_order_id)
     AND id <> NEW.id
     AND is_current = TRUE;
END IF;
RETURN NEW;
```

Backfill:

```sql
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY COALESCE(parent_order_id, id)
           ORDER BY revision DESC, created_at DESC
         ) AS rn
  FROM public.orders
)
UPDATE public.orders o
   SET is_current = (r.rn = 1)
  FROM ranked r
 WHERE o.id = r.id;
```

This guarantees exactly one current row per OA family and immediately resolves the duplicate `2026-27/GMS/0003` + `2026-27/GMS/0003/R1` folder rows.
