## Goal
When an OA is revised (either via the "Revise OA" button or by saving after a revision-bumping change), the linked BOQ must be auto-created as a new revision that reflects the latest OA data on **every** item field (Description, Quantity, Model, Unit, Remarks), using the existing OA/BOQ number formats.

## What already works
- `handleReviseOa` → `reviseOrder` → `reviseBoqFromOrder` inserts a new BOQ row with `revision = OA.revision`, `boq_number` carried from the previous BOQ (so `26-27/GMSBOQ/0004` stays as the base and the revision suffix is added by `deriveBoqNumber` whenever the BOQ number is re-derived).
- OA revision numbering (`/R{n}`) and BOQ revision numbering match the existing format. No format change.
- `save()` already calls `syncBoqsAndPisForOrder` after every OA save.

## Bug to fix
`createPendingBoqRevision` (called from `syncBoqsAndPisForOrder` when a saved OA's revision is higher than the current BOQ's revision) builds line items with:
- `description: prev?.description || it.description`  → prefers the **old** BOQ description, so updated OA descriptions don't propagate.
- `model_number: it.hsn_code`  → ignores `it.model`, so the Model field on the OA item never reaches the BOQ.
- Does not carry `quantity`/`unit` changes when prev row exists (these two are fine — already taken from OA — but Model/Description are not).

This is the only path that produces the "new pending BOQ revision" row when the user revises the OA, so the new BOQ ends up looking like a copy of the previous one instead of the latest OA.

## Fix (single file: `src/lib/revisions/index.ts`)

In `createPendingBoqRevision`, build each line item the same way `reviseBoqFromOrder` already does:
```ts
const model = ((it as any).model || "").trim() || it.hsn_code || "";
return {
  id: crypto.randomUUID(),
  item_no: String(i + 1),
  model_number: model,              // was: it.hsn_code only
  description: it.description || "",// was: prev?.description first
  quantity: Number(it.quantity) || 0,
  unit: it.unit || "Nos",
  remarks: ((it as any).remarks || "").trim() || prev?.remarks || "",
};
```
This matches the field-mapping used in `reviseBoqFromOrder` and the in-place sync block, so every code path that produces a BOQ row reads the same way from the OA.

Also:
- Keep `prev?.remarks` as a fallback only when the OA item has no remarks (preserves manually entered BOQ remarks when the OA didn't override them).
- Leave `boq_number`, `revision`, `verification_status`, `is_current`, terms/notes carry-over, and the verification-email side effect untouched.

## Out of scope (per user)
- No change to OA/BOQ number string format.
- No change to pricing, totals, charges, PI sync, RLS, or any UI.
- No DB schema migration.

## Verification
1. Open an existing OA with a current BOQ.
2. Edit an OA item's Description, Model, Quantity, Unit, Remarks → click **Revise OA**.
3. Confirm a new OA row `…/R{n+1}` is created and a new BOQ row `…/R{n+1}` (pending) appears in the BOQ list with all five fields matching the new OA.
4. Repeat with the auto-revise-on-save path: edit fields on the current OA, save → confirm the new pending BOQ row mirrors the OA item fields exactly.
5. Run for both MR and GMS formats.