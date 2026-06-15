## Goal

In `src/pages/design/DesignBoqView.tsx`, change each line-item cell so it shows the cell's value AND a small "+ Comment" link directly beneath it (matching the example layout). The existing whole-row "Add" button in the Comments column stays.

## Changes (UI-only, single file)

`src/pages/design/DesignBoqView.tsx`:

1. Replace the current "click anywhere on the cell" button with a two-line stacked cell:
   - Line 1: the value (or `—`) with the existing comment-count badge if any.
   - Line 2: a small `+ Comment` text button (muted text, primary on hover, `text-[11px]`), which sets `activeRow` and `draft` to that `{itemId, column}` — same handler as today.
2. Applies to all 7 cells: Model, Description, Qty, Unit, Motor, Motor Qty, Remarks (driven by existing `COLS` array — no logic change needed).
3. Keep the inline comment editor / comments list / row "Add" button behavior unchanged.
4. No changes to data fetching, `addDesignComment`, schema, permissions, or any other module.

## Out of scope

- No DB / RPC / notification / read-only-rule changes.
- No changes to OA / BOQ editors, PI, Purchase, etc.
- No new columns or fields.
