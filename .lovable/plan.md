# Add "Create BOQ" dropdown on the BOQs page

## Goal
On `/boqs`, add a primary **Create BOQ** button next to "Go to Orders". Clicking it opens a dropdown listing all current OAs. Picking an OA navigates to `/boqs/new?orderId=<id>`, which the existing `BoqEditor` already handles (auto-fills items, header, T&C from the OA).

## UX

- New primary button in the page header: **+ Create BOQ ▾**
- Dropdown contents:
  - Search box at top (filter by OA number)
  - Scrollable list of current OAs (newest first), each row showing:
    - OA number (mono)
    - Order date
    - Format badge (MR / GMS)
    - "Has BOQ" badge if a current BOQ already exists for that OA (still selectable — picking it just opens the editor; if user wants a new revision they should use "Revise BOQ" from the OA page)
  - Empty state: "No OAs available yet."

## Technical details

**File edited:** `src/pages/boqs/BoqList.tsx`

1. Add imports: `DropdownMenu*` from `@/components/ui/dropdown-menu`, `Input`, and icons `ChevronDown`, `FilePlus2`, `Search`.
2. Add state:
   - `oas: { id, oa_number, format, order_date, has_boq }[]`
   - `oaSearch: string`
3. New `useEffect` (runs once + when `rows` changes so "Has BOQ" stays fresh):
   - Query `orders` where `is_current = true`, ordered by `created_at desc`, selecting `id, oa_number, format, order_date`.
   - Query `boqs` where `is_current = true`, selecting `order_id`. Build a `Set<order_id>` of OAs that already have a current BOQ.
   - Merge into `oas` with `has_boq` flag.
4. Replace the lone "Go to Orders" button with a flex row containing both that button and the new `DropdownMenu`:
   - Trigger: primary `Button` with `FilePlus2` icon, label "Create BOQ", `ChevronDown` chevron.
   - Content: width ~340px, label, search input, separator, scrollable list (`max-h-72 overflow-y-auto`).
   - Each `DropdownMenuItem` calls `nav(\`/boqs/new?orderId=${o.id}\`)` on `onSelect`.
5. No DB schema changes. No new routes. Reuses the existing `BoqEditor` flow.

## Out of scope
- Creating a BOQ without an OA (BOQs must originate from an OA per existing system rules).
- Changing how revisions are made (still done from the OA page via "Revise BOQ").
