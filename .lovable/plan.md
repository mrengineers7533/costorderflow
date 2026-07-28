## Diagnosis (verified)

For the BOQ on screen (`MRBOQ/26-27/0001`, linked OA `MROA/2026-27/0001`), I queried the OA row: every line item has `make_label: ""` and `make: "MR"`, and no `n` value.

`src/lib/boq/makeResolver.ts` reads **only** `make_label`, so it resolves to an empty string for every row — that's why the Make column shows `—` and FG Make is blank.

## Changes

1. **`src/lib/boq/makeResolver.ts`** — resolve each OA line's Make as: `make_label` (trimmed) if present, else the raw OA make code as-is (`MR` / `GMS` / `OTHER`), else empty. No expansion to "M.R. Engineers". Matching priority stays exactly as today:
   - BOQ item's own `make`
   - OA line matched on normalized description + model/HSN
   - OA line at the same row index
   - empty string (no invented value)

2. **`src/components/manufacturing/CreateRequisitionDialog.tsx`** — when loading the linked OA, resolve to the **latest revision of that OA family** (walk to the `parent_order_id` root, take the `is_current` revision) and fall back to the directly linked order if none is found. The rest of the fetch is unchanged.

FG Make stays as it is today (editable input, prefilled), and the Direct Purchase 3P row already forwards `fg_make`, so it will now carry the OA make code automatically. No changes to calculations, BOM scaling, numbering, approvals, notifications, Purchase flow, permissions, or layout.

## Verification

- Type check.
- Open `/manufacturing/2f9c4552-…` and confirm the Make column and each Finish Good header show `MR`, and that rows with no OA make stay blank.
