## Goal

Add a clear **MR / GMS toggle** inside the **Line Items** section header so users can quickly switch which subset of items is displayed and edited — independent of the global Format dropdown above.

## Current behavior

Today, when a cost sheet contains both MR and GMS items, the Line Items table only shows items matching the currently selected **Format** dropdown (top of the Order Details card). Users have to scroll up and change the OA Format to view the other group, which is confusing because the Format dropdown also drives which OA template is used for the PDF.

## Proposed change

Add a **segmented toggle** (`MR` | `GMS` | `All`) directly in the Line Items card header, visible only when the order contains items of more than one make.

- **MR** — show only MR items
- **GMS** — show only GMS items
- **All** — show every item (including OTHER)

Behavior details:
- The toggle controls **only the Line Items table view** — it does NOT change the OA Format dropdown or which template is used for the PDF.
- Default selection mirrors the current OA Format (so existing `splitMode` behavior is preserved on first render).
- The existing info banner ("This cost sheet has both MR and GMS items…") stays, but its wording is updated to mention the new toggle.
- Add buttons (`+ Add`) create new items pre-tagged with the currently selected toggle make (MR or GMS); when "All" is active, defaults to the OA Format.
- The OrderPreview, totals, and PDF download logic remain driven by the OA `format` (unchanged) — only the editor table view is filtered by the toggle.

## Files to edit

- `src/pages/orders/OrderEditor.tsx`
  - Add new state: `lineItemsView: "MR" | "GMS" | "ALL"` (initialized to `format` when split, else `"ALL"`).
  - Replace the current `itemsWithAmounts` derivation used for the **table only** with one filtered by `lineItemsView`. Keep the OA-format-filtered list (used for preview/PDF) as-is.
  - Render a `ToggleGroup` (using existing `@/components/ui/toggle-group`) in the Line Items `CardHeader`, beside the **Add** button. Show only when the order has multiple makes present.
  - Update the info banner copy to point at the new toggle.

No other files, schema, or backend changes required.
