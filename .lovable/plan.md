
# Round 1 Design Review — Comments-Only Table Layout

Change `src/pages/boqs/DesignReview.tsx` only. No DB changes, no other screen changes.

## Layout (replaces current card-per-item list)

Render BOQ items in a single `<Table>` matching the BOQ columns shown in the screenshot:

```
| # | Model | Description | Qty | Unit | Remarks | Status |
```

For each item render two rows:

1. **Data row** — read-only BOQ data, one cell per column (row-wise like main BOQ).
2. **Comment sub-row** — directly below, same columns, each cell contains a small `<Textarea>` placeholder "Comment" so the reviewer can leave a comment on any specific column (Model / Description / Qty / Unit / Remarks). The `#` cell shows "Comments" label. The Status cell stays empty in round 1.

The comment for each column is stored locally and concatenated on submit into the existing `comment` field per item as:
```
Description: ...
Qty: ...
Remarks: ...
```
This keeps the existing `submit_design_review_with_token` RPC and DB schema unchanged.

## Approval buttons

- **Round 1 (round_no === 1):** hide Approved / Change Required buttons and the design_change_note textarea entirely. All items submit with `decision: "pending"`. Only column-wise comment cells are shown.
- **Round 2+:** keep current behavior (approval buttons + change-required note) unchanged.

## Other elements kept as-is

- Reviewer Details card (Name / Design Team / Email).
- Sticky summary header with counts (hidden in round 1 since no decisions; show only item count instead).
- Attach file affordance: move to a small icon button in the `#` cell of each comment sub-row so attachments still work per item.
- Submit button unchanged.

## Files touched

- `src/pages/boqs/DesignReview.tsx` — restructure JSX to table + conditional UI based on `meta.round_no`.

## Out of scope

- No changes to BOQ editor, RPC, migrations, types, calculations, OA/PI sync, or other rounds' behavior.
