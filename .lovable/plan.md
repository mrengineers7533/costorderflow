## Goal

Make the OA `Make` value flow end-to-end and surface as a hidden-by-default column on every downstream surface, without touching any existing calculation, layout, workflow, or print output unless the column is explicitly enabled.

## Root cause (why Make is missing today)

- **BOQ Editor — new BOQ from OA** (`src/pages/boqs/BoqEditor.tsx` lines 232–240): the mapper that converts OA line items → BOQ items drops `make_label`. So a freshly-created BOQ has empty Make values; toggling the column on shows blanks. The revision flow already propagates it (`src/lib/revisions/index.ts` line 185) — only the initial create is broken.
- **PI Item Select Dialog** (`src/components/pi/PiItemSelectDialog.tsx`): has no Make column at all. (The selected items already carry `make_label` into the saved PI via the spread in `createPiFromOaItems`, so once the column is added the data is already there.)
- **Requisition Detail — Items / Steel / Outside tabs** (`src/pages/requisitions/RequisitionDetail.tsx`): no FG Make column. `requisition_items.fg_snapshot` already stores the full BOQ item (including `make`), so no migration is needed.
- **Purchase / Manufacturing detail** (`ApprovedBoqModule.tsx`): already has the hidden Make column wired against `it.make` — it will start showing values automatically once BOQ items carry Make.

## Plan

### 1. BOQ — carry `make` from OA on new-BOQ creation
**File:** `src/pages/boqs/BoqEditor.tsx` (lines ~232–240)

Add `make: ((it.make_label || "") as string).trim()` to the OA → BOQ item map so every newly created BOQ inherits the OA's Make. No layout or default-visibility change.

### 2. PI Select Items dialog — add hidden-by-default Make column
**File:** `src/components/pi/PiItemSelectDialog.tsx`

- Add a `useColumnToggle("pi.select.columns.make", false)` toggle button (`Columns3` icon, same pattern used elsewhere) in the dialog header next to "Convert OA to PI — Select Items".
- When `showMake` is on, insert one extra `<TableHead>Make</TableHead>` immediately after Description, and a matching `<TableCell>{it.make_label || "—"}</TableCell>` in each row. Bump the loading/empty `colSpan` by 1 when `showMake`.
- No change to selection logic, qty/amount math, balance checks, or PI generation — these are presentation-only.

PI line items already carry `make_label` end-to-end because `createPiFromOaItems` spreads `...it` into `filteredItems` (no code change there). PI editor / PDF Make column toggle already exists from earlier work.

### 3. Requisition Detail — hidden Make column on FG Items + Steel/Outside tabs
**File:** `src/pages/requisitions/RequisitionDetail.tsx`

- Reuse the existing `showMake` toggle (already wired against `"requisition.columns.make"`) — move/duplicate the toggle button so it controls the Items, Steel, and Outside tabs too (or render the toggle once at the page header). Simplest: render the same toggle button in the header of each of those tab cards (they share the same `showMake` state).
- In the **Items** tab table, when `showMake` is true, insert a `Make` `<th>` between Description and Qty and `<td>{(it.fg_snapshot as { make?: string })?.make || "—"}</td>` in each row. Bump empty-row `colSpan` accordingly.
- In the **Steel** and **Outside** tab tables, same treatment: read from `(it.fg_snapshot as { make?: string })?.make`. (No new DB column — `fg_snapshot` already stores the BOQ item including `make`.)
- Raw Materials tab Make column (RM-level make) stays exactly as it is — separate from FG Make.

### 4. Purchase / Manufacturing detail — no code change
`ApprovedBoqModule.tsx` already shows a hidden-by-default Make column reading `(it as { make?: string }).make`. It will populate automatically once step 1 ships.

### Out of scope (explicitly not touched)

- No DB migrations, no RLS changes, no edge function changes (`create-requisition` already stores the BOQ item verbatim in `fg_snapshot`).
- No changes to OA editor / OA PDF / OA Excel.
- No changes to PI/BOQ/Requisition PDFs (the PDF Make toggles wired in earlier work continue to drive print output independently).
- No calculation, workflow, approval, revision, notification, or default-visibility change. Every Make column stays hidden until the user toggles it on per surface (`localStorage`-persisted via `useColumnToggle`).

## Files touched

- `src/pages/boqs/BoqEditor.tsx` — 1-line addition to the OA→BOQ map.
- `src/components/pi/PiItemSelectDialog.tsx` — toggle button + 1 header + 1 cell per row + colSpan bumps.
- `src/pages/requisitions/RequisitionDetail.tsx` — toggle button(s) on Items/Steel/Outside cards + 1 header + 1 cell per row + colSpan bumps.
