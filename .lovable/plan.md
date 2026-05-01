# Add Delete option to BOQ, OA, and PI lists

## Goal
On the **BOQs**, **Orders (OA)**, and **Proforma Invoices (PI)** list pages, let the user delete an individual row. Each delete shows a confirmation dialog (irreversible) and then removes the row from the database.

## Scope per page

### 1. `src/pages/orders/OrdersList.tsx` (currently has NO Actions column)
- Add an **Actions** column header on the right.
- For each order row add a small **Delete** icon-button (trash icon, ghost variant, destructive color).
- The button stops row click propagation (otherwise it would also navigate to the editor).
- Clicking opens an `AlertDialog`: "Delete OA `{oa_number}`? This also removes its revision history and cannot be undone."
- On confirm:
  - If the OA is a revision root (no `parent_order_id`): delete all rows where `parent_order_id = id` OR `id = id` (whole family).
  - Else: delete just this revision row.
  - After delete, refetch the list and toast success.
- (Optional, minor) Also add an **Edit** icon-button to be consistent with BOQ/PI lists.

### 2. `src/pages/boqs/BoqList.tsx` (already has Edit + PDF in Actions)
- Add a third **Delete** icon-button in the existing Actions cell (after PDF), destructive style, with `e.stopPropagation()`.
- Confirmation dialog: "Delete BOQ `{boq_number}`?"
- On confirm: delete the BOQ row by id (BOQs already store revisions as separate rows tied via `parent_order_id` family but not via a direct parent ref on boqs — so delete just the selected row, like PI/OA per-revision behavior). Refetch + toast.

### 3. `src/pages/pi/PiList.tsx` (already has Edit + PDF in Actions)
- Add a third **Delete** icon-button after PDF.
- Confirmation dialog: "Delete PI `{pi_number}`?"
- On confirm:
  - If the PI has no `parent_pi_id` (it's the root of a family): delete the entire family — all rows where `parent_pi_id = id` OR `id = id`.
  - Else: delete just this revision row.
  - Refetch + toast.

## Shared implementation details
- Use the existing `AlertDialog` shadcn component (already used in `PiEditor.tsx` for the revision dialog).
- Use the `Trash2` icon from `lucide-react`.
- All Action buttons use `e.stopPropagation()` on their `onClick` so the row click that opens the editor doesn't also fire.
- Use the existing `supabase` client. The `proforma_invoices`, `orders`, and `boqs` tables already have public delete RLS policies, so `.delete().eq('id', ...)` works directly.
- Use the existing `useToast` (`@/hooks/use-toast`) for success/error feedback.
- Track which row is being confirmed in local state: `const [confirmDelete, setConfirmDelete] = useState<{id: string; label: string} | null>(null)` per page.

## Out of scope
- No bulk-delete / multi-select.
- No soft-delete / archive flag — these are hard deletes.
- No deletion of associated PDFs in storage buckets (`oa-documents`, `boq-documents`, `pi-documents`). We only remove the database rows. Can be added later if needed.
- No changes to editor pages (delete is list-only as requested).
