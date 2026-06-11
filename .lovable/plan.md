# Fix PO Create / Download Failure

## Root cause

The toast shows `Failed to create PO: [object Object]` — two real problems:

1. **DB CHECK constraint mismatch (the actual blocker).**
   `purchase_orders.category` is constrained to only `('steel','machine','3p')`:
   ```
   purchase_orders_category_check CHECK (category = ANY (ARRAY['steel','machine','3p']))
   ```
   But the Annexure → PO flow sends categories like `sheet_ss`, `sheet_ms`, `sheet_gi`, `pipe`, `structure` (passed via the `?type=sheet_ss` URL param). Every insert from those categories fails with a check-violation, which the UI then swallows.

2. **Error reporting bug.**
   The `catch` does `e instanceof Error ? e.message : String(e)`. Supabase returns a plain object `{ message, code, details, hint }`, which is not an `Error`, so `String(e)` becomes `"[object Object]"`. That's why the toast shows no useful reason. Same pattern would hide the cause of any future failure.

## Changes

### 1. New migration: widen `purchase_orders.category` check

```sql
ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_category_check;

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_category_check
  CHECK (category = ANY (ARRAY[
    'machine','3p','pipe',
    'sheet_ss','sheet_ms','sheet_gi',
    'structure','steel'
  ]));
```

No data changes, no other column or table touched. Existing rows (only `machine`/`3p`/`steel` were possible before) remain valid.

### 2. `src/pages/purchase/PoCreateFromAnnexure.tsx` — better error messages

In `generate()`'s `catch`, build a readable message from Supabase error shape so future failures are visible:
```ts
const msg =
  e instanceof Error ? e.message
  : (e && typeof e === "object")
    ? [e.message, e.details, e.hint, e.code].filter(Boolean).join(" · ")
    : String(e);
toast.error(`Failed to create PO: ${msg || "Unknown error"}`);
console.error("PO create failed", e);
```
Apply the same defensive formatter to `downloadPreview` for consistency. No other logic changes.

## Out of scope / unchanged

- No changes to PO PDF rendering, annexure logic, raw-material locking, PO counter RPCs, RLS policies, grants, or any other module (BOQ, Requisition, Planning, GRN, etc.).
- No edits to `supabase/functions/send-po` or `poPdf.ts`.

## Verification

1. Open `/annexures/<id>/po/new?lot=1&type=sheet_ss`, select a row, set rate, click **Generate PO & Download** — insert succeeds, PDF downloads, toast shows success.
2. Repeat with `type=pipe` and `type=structure` to confirm all categories pass the constraint.
3. Force a failure (e.g. duplicate PO number) → toast now shows the actual message/details instead of `[object Object]`.
