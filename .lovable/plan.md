## Goal

Show every OA / BOQ / PI revision row-wise under its base record (R0, R1, R2…), sorted numerically, current always visible and clearly marked, older revisions read-only.

## Scope

Display/grouping only. No changes to revision creation logic, calculations, OA/BOQ/PI sync, link generation, edit permissions, or DB schema.

Files touched:
- `src/pages/orders/OrdersList.tsx`
- `src/pages/boqs/BoqList.tsx`
- `src/pages/pi/PiList.tsx`

## Changes

### 1. OrdersList — grouped row-wise display

Replace the current flat list. Group all rows by `parent_order_id || id` (base OA family). For each group:

- Render a "family header" row showing the base OA number (e.g. `GMSOA/2026-2027/211`), company, format, latest date, and a "× revisions" count. Clicking expands the group (open by default).
- Inside the group render every revision in **numeric ascending order by `revision`** (R0, R1, R2, …), each as a normal table row using the existing column layout:
  - OA Number (with `/R{n}` suffix when `revision > 0`)
  - Rev badge `R{n}`
  - Format, Company, Date, Net Payable, Status
  - BOQ link badge, PI link badge (per-row, using same `boqCounts` / `piCounts` map but keyed by that revision's `id`)
  - Current / Superseded badge (existing logic — `is_current`)
  - Actions: Edit, PDF, Excel, Print, Delete (existing handlers, unchanged)
- The "Show superseded revisions" switch keeps working: when OFF, only the current row of each family is shown (group collapses to one row).
- Sorting between families: by latest revision's `created_at` desc (matches current behavior).
- Numeric sort inside a family uses `Number(revision ?? 0)` — never string-sort the OA number.

Per-row counts: extend the existing `boqCounts` / `piCounts` queries so they count by `order_id` (BOQ) and `reference_oa_id` (PI) for **every** OA id in the loaded set, not just current — so superseded rows also show their related counts.

### 2. BoqList — grouped row-wise display

The current page already has a per-row expand chevron that lazy-loads the BOQ family into a nested card list. Replace that nested-card pattern with proper row-wise grouping that matches OrdersList:

- Group rows by BOQ family root: resolve via `parent_order_id` of the underlying OA (existing `loadFamilyFor` logic), but do the grouping up-front for all visible rows in a single batched fetch so the table renders the whole family inline.
- Render one family header row per group (base BOQ number, reference OA, latest date, `× revisions` count, expand toggle — open by default).
- Inside the group render every BOQ revision **sorted by `Number(revision)` ascending**:
  - BOQ No. (with `/R{n}` suffix when `revision > 0`)
  - Rev badge + Current/Superseded/Pending/Rejected (existing logic)
  - Format, Reference OA, Date, Status
  - Actions: Edit, PDF, Excel, Print, Delete (unchanged handlers)
- Older revisions: keep `Edit` button but the editor already enforces read-only on superseded rows — no permission changes here.
- `showSuperseded` toggle keeps working as today (also keeps pending/rejected visible).
- Remove the old "BOQ Revision History" nested card block (its info is now in the inline rows). Keep `BoqCompareDialog` available via a small "Compare" action on each non-current row that opens compare against the family's current row.

### 3. PiList — grouped row-wise display

PiList is currently flat with no grouping. Add the same pattern:

- Group by `parent_pi_id || id` (PI family root).
- Family header row: base PI number, ref OA, customer, latest date, `× revisions` count, expand toggle (open by default).
- Inside the group, render every PI revision **sorted by `Number(revision)` ascending** using the existing PI columns and actions (View, Edit, PDF, Excel, Delete). Current vs Superseded badge as today.
- `showSuperseded` toggle keeps working.

### 4. Revision number formatting helper

Add a tiny local helper in each list (or co-locate in `src/lib/revisions/index.ts`) used by all three pages:

```ts
function formatRevisionedNumber(base: string, revision: number) {
  const stripped = (base || "").replace(/\/R\d+$/i, "");
  return revision > 0 ? `${stripped}/R${revision}` : stripped;
}
```

Used wherever the OA/BOQ/PI number is rendered, replacing the inline IIFEs already present.

## Out of scope (explicit)

- No DB migration, no RLS change.
- No change to `reviseOrder`, `reviseBoqFromOrder`, `syncBoqsAndPisForOrder`, or any totals/calc code.
- No change to OA/BOQ/PI editors, permissions, design-comment workflow, or link generation.
- No change to public Design Comment / Approval / Final BOQ pages.

## Technical notes

- All grouping is client-side over already-loaded rows; no extra round-trips beyond the existing per-page queries (and the existing `boqCounts` / `piCounts` lookups).
- Sorting always uses `Number(revision ?? 0)` — never lexical string sort on the OA/BOQ/PI number, matching the BOQ item serial-number fix already applied.
- Expand state is local component state, defaulting to `true` for every family so users see "all revisions row-wise" by default, as requested.