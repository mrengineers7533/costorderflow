## What's already working

- `create-requisition` edge function already saves every new requisition into the `requisitions` table with items + raw materials.
- `/requisitions` route already exists and lists all saved requisitions — so requisitions are *not* trapped on the BOQ/Manufacturing page; they already persist to the Requisition module.
- Detail page (`/requisitions/:id`) already has PDF download, share link copy, and editable per-item purchase status.

## What's missing (the actual gap)

The list view shows requisitions as cards but doesn't surface the columns and inline actions the user is asking for. We'll upgrade only that list page plus add a single status transition for "Send to Purchase".

## Changes

### 1. `src/pages/requisitions/RequisitionsList.tsx` — rebuild as a table

Replace the card layout with a proper table showing:

| Requisition # | OA # | BOQ # | Rev | Client | Created | Status | Actions |

Actions column (icon buttons, all inline — no navigation required for the quick ones):
- **View** → `Link` to `/requisitions/:id`
- **PDF** → reuses `generateRequisitionPDF` from `src/lib/requisition/pdf.ts`; loads the row's items + raw materials on demand (single click handler, lazy fetch per row)
- **Link** → copies `${origin}/requisition/${share_token}` to clipboard, toast confirms
- **Send to Purchase** → updates `requisitions.status` to `in_purchase` (status enum already supports it per `RequisitionRecord`), shows toast, refreshes row; hidden / disabled when status is already `in_purchase` or `closed`

Keep existing search input. Keep the "BOQ revised to Rn" stale badge inline in the Status cell.

### 2. No DB migration needed

`status: "draft" | "issued" | "in_purchase" | "closed"` already exists on the requisitions table. RLS already lets the owning user update their requisitions (used by the detail page's status edits).

### 3. Nothing else changes

- `CreateRequisitionDialog`, `create-requisition` function, BOQ/Manufacturing, OA, approval, revision, pricing, calculation, PDF layout, share-link routing — all untouched.
- Sidebar entry for Requisitions already exists.

## Technical notes

- The PDF action will issue two lightweight `select * where requisition_id = ?` queries (items + raw materials) and the BOQ fetch is already cached in the list's `boqs` map, so no extra round-trips for header fields.
- "Send to Purchase" is a single `update({ status: "in_purchase" }).eq("id", r.id)` call followed by local state patch — no edge function needed.
- Table uses existing shadcn `Table` primitives; status badge uses existing `Badge` variants.