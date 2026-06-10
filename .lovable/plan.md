## Goal

On the Purchase page, add two new sections without changing existing behavior:

1. **BOQ Folder** → **MR BOQ** and **GMS BOQ** sub-folders that filter the existing approved-BOQ list by order format.
2. **Purchase Material** folder → lot-wise list of annexure-created raw materials, with vendor selection (Steel / Machine / 3P) and multi-vendor PO creation (PDF download).

Existing Purchase list/detail and all other pages stay untouched.

---

## 1. Purchase landing redesign (`src/pages/purchase/PurchaseList.tsx` + module)

Replace the single approved-BOQ list with a folder grid (3 cards):

```text
┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐
│  BOQ Folder  │  │ Approved BOQs│  │  Purchase Material  │
│ MR · GMS     │  │ (existing)   │  │ Lot-wise · PO       │
└──────────────┘  └──────────────┘  └─────────────────────┘
```

- The existing "Approved BOQs" list stays exactly as today (kept as a card link / second tab).
- New routes:
  - `/purchase/boq-folder` → tabs `MR BOQ` | `GMS BOQ`, each rendering the existing approved-BOQ list filtered by `orders.format = 'MR'` / `'GMS'`. Reuses `pickLatestApprovedPerFamily` and the same row card → "Open" links into the existing `/purchase/:boqId` detail.
  - `/purchase/materials` → Purchase Material page (below).

No schema change for the BOQ folder — purely a filtered view.

## 2. Purchase Material page (`src/pages/purchase/PurchaseMaterial.tsx`, new)

Source data: only raw materials where `requisition_raw_materials.annexure_status = 'created'` AND their `annexure_id` points to a `requisition_annexures` row with `status = 'active'` (cancelled annexures auto-disappear, matching the existing folder behaviour).

UI:

- **Lot selector** (multi-select chips) listing every distinct `lot_no` that has annexure-created materials. Selecting one or more lots filters the table.
- **Category filter** (All / Steel / Machine / 3P) using existing `plan_status` (`steel`, `machine`, `3p`).
- **Material table** columns: checkbox · Lot · Category · Material · Size/Model · Make · Qty · Unit · PO status badge (Pending / PO Created · PO No.).
- **Vendor & PO panel** (right side or sticky footer):
  - Three free-text vendor inputs: `Steel Vendor`, `Machine Vendor`, `3P Vendor` (only the categories present in the selection are required).
  - Optional contact line per vendor (single text field — phone/email free text).
  - **Create PO** button: groups selected rows by category, generates one PO per category that has a vendor + selected rows (so 1–3 POs per click). Each PO gets a unique PO number, persists rows, and triggers a PDF download.

PO numbering: `PO/{FY}/{seq}` via a new `po_counters` table (one row per FY, atomic increment in a `next_po_number` function, mirroring `next_requisition_number`).

PDF: new helper `src/lib/purchase/poPdf.ts` (pdf-lib, same style as `src/lib/requisition/pdf.ts`) showing PO No · Date · Vendor block · Category · Lot(s) · line items · totals.

## 3. Database (single migration)

New tables (all in `public`, with GRANTs + RLS + `set_updated_at` triggers):

- `purchase_orders`
  - `po_number text unique`, `category text check in ('steel','machine','3p')`,
  - `vendor_name text`, `vendor_contact text`,
  - `lot_numbers text[]`,
  - `requisition_ids uuid[]`, `annexure_ids uuid[]`,
  - `status text default 'active' check in ('active','cancelled')`,
  - `notes text`, `created_by uuid references auth.users`, `created_at`, `updated_at`.

- `purchase_order_rows`
  - `po_id uuid references purchase_orders on delete cascade`,
  - `raw_material_id uuid` (snapshot reference to `requisition_raw_materials.id`),
  - `lot_no`, `material`, `size_model`, `make`, `unit`, `qty numeric`,
  - `created_at`, `updated_at`.

- `po_counters` (`financial_year text primary key`, `last_number int`, `updated_at`).

- `requisition_raw_materials` add columns `po_status text check in (null,'created')` and `po_id uuid references purchase_orders(id) on delete set null` (kept null until a PO is created for that row; cancelled annexure flow already nulls `annexure_status`, this is an independent flag).

- Function `public.next_po_number(_fy text)` (security definer, mirrors `next_requisition_number`).

RLS: authenticated users can read/insert/update their own POs (`auth.uid() = created_by` for write; admins via `has_role`); rows inherit via `po_id` join policy. `service_role` full access.

## 4. Sync rules

- After PO insert: update each contributing `requisition_raw_materials` row → `po_status = 'created'`, `po_id = <new>`. Surface a "PO Created" badge in the Raw Materials / Annexure Folder views by reading these fields (no UI change required this round beyond the badge in Purchase Material — existing tabs unchanged).
- Cancelling a PO (future, simple `Cancel` action in Purchase Material list of POs) sets `purchase_orders.status='cancelled'` and clears `po_status`/`po_id` on its rows, mirroring annexure cancel.

## 5. Routing & sidebar

- `src/App.tsx`: register `/purchase/boq-folder` and `/purchase/materials` under the same `RequireModule module="purchase"` guard.
- `src/components/AppSidebar.tsx`: keep "Purchase" as the parent link; no sub-nav added (entry points live as cards on the Purchase landing). Folder pages have a "Back to Purchase" button.

## 6. Out of scope (explicit)

- No changes to: Annexure Folder, Requisition Plan, Raw Materials tab logic, Generated Requisition behaviour, manufacturing flow, ES Page, BOQ list/editor, admin pages.
- No vendor master table (per user's choice — vendor is free text on each PO).
- No PO email sending in this round.
- No edits to existing approved-BOQ detail page; it remains reachable from both the legacy list card and from MR/GMS folders.

## Technical notes

Files added:
- `src/pages/purchase/PurchaseLanding.tsx` (folder grid; new default for `/purchase`)
- `src/pages/purchase/BoqFolder.tsx` (MR/GMS tabs reusing `pickLatestApprovedPerFamily`)
- `src/pages/purchase/PurchaseMaterial.tsx`
- `src/lib/purchase/poPdf.ts`
- `supabase/migrations/<ts>_purchase_orders.sql`

Files edited:
- `src/pages/purchase/PurchaseList.tsx` → render `PurchaseLanding` instead of `ApprovedBoqListPage` directly (existing list still mounted inside one of the cards as "All Approved BOQs").
- `src/App.tsx` → add 2 routes.
- `src/lib/requisition/types.ts` → add `po_status?: 'created' | null`, `po_id?: string | null` to `RequisitionRawMaterial`.

## Acceptance

- `/purchase` shows three cards: BOQ Folder, All Approved BOQs (existing flow), Purchase Material.
- BOQ Folder → MR BOQ tab lists only `format='MR'` approved BOQs; GMS BOQ tab lists only `format='GMS'`. "Open" jumps to the unchanged detail page.
- Purchase Material lists only raw materials with `annexure_status='created'` and active annexure, filterable by lot/category.
- Selecting rows + entering vendors + clicking Create PO produces 1–N POs (one per category), each downloads a PDF and shows up as "PO Created" badge on those rows.
- All existing Purchase flows, lists, and routes continue to work unchanged.
