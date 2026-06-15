# Per-cell Design Comments

Today the Design BOQ review page (`src/pages/design/DesignBoqView.tsx`) renders one comment box per row in a separate "Design Comment" column. We will change it so every cell of every line item has its own comment box directly underneath the cell value, auto-saving against `boq_id + line_item_id + field_name`.

The storage layer already supports this — `boq_design_comments` has `column_key`, and `upsertDesignComment({ boqId, itemId, columnKey, comment })` already keys on (user, boq, item, column). No DB / schema / RLS / submit / approve / OA-flow changes.

## Changes (single file: `src/pages/design/DesignBoqView.tsx`)

1. **Remove the trailing "Design Comment" column** from the table header and body.
2. **Render each value cell** as:
   - Top: existing read-only value (`Model`, `Qty`, `Make/Unit`, `Motor`, `Motor Qty`, `Remarks`, …) — unchanged display.
   - Below: a compact `Textarea` (rows=1, small font) bound to `drafts[keyOf(itemId, c.key)]`.
   - `onChange` → `scheduleSave(itemId, c.key, value)` (600 ms debounce, already implemented).
   - `onBlur` → `saveNow(itemId, c.key, value)` (immediate flush).
   - Saving / "Saved · HH:MM" indicator under the textarea (existing pattern, shrunk).
   - Other reviewers' comments for the same cell rendered underneath (existing `otherCommentsByCell` map, already keyed by `itemId + column_key`).
   - Disabled when `alreadySubmitted || designApproved` (existing rule).
3. **Drop the legacy row-level box** (`column_key = "__row__"`). Hydration on load will simply ignore row-level rows, but we will still display them under each cell? No — to keep semantics clean we render row-level comments (if any pre-existing) as a small "General" strip above the row. (Optional, low risk.)
4. **Draft count + Post Submit** logic unchanged — `myDraftCount` already counts non-empty drafts across all keys, so per-cell drafts feed in naturally. The Post Submit flush loop already splits the key into `itemId` / `col` and writes `columnKey` correctly.
5. **Column set** stays the existing `COLS` list (`model_number`, `description`, `quantity`, `unit`, `motor`, `motor_quantity`, `remarks`) — these are the canonical field names used across the BOQ format and match how the cost sheet maps to line items (e.g. `description`/`model_number` cover "Machine Name", `quantity` covers "Qty", `remarks`/`model_number` cover "Make"). The `field_name` stored in `column_key` is exactly the BOQ field key.

## Out of scope

- No changes to `boq_design_comments` schema, RLS, or `upsertDesignComment` logic.
- No changes to OA Creator flow, revised-BOQ generation, approval gating, Purchase/Manufacturing visibility, or notifications.
- No changes to BOQ/OA calculations or PDF/Excel exports.

## UX note

Each cell becomes taller because of the inline textarea. The table is already horizontally scrollable (`overflow-x-auto`) so column widths stay readable; we'll set `min-w-[160px]` per cell and use `rows={1}` with auto-growing text for compactness.
