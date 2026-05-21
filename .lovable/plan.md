## Goal

Extend Create Requisition to support both **auto-match** (current behavior) and **manual select** flow, plus an **edit-before-save** preview step. All requisitions still land in the Requisition module with PDF / Share Link / Send to Purchase intact.

No changes to OA, BOQ, approval, revision, pricing, calculation, or any existing workflow.

## UX Flow

`CreateRequisitionDialog` becomes a 2-step wizard.

### Step 1 — Select FG items + mode
Existing table of BOQ items + checkbox per row stays. Below the item list, add a **Mode** segmented control:

- **Auto-generate from RM Master** (default) — current behavior. Each selected FG is matched against `fg_raw_material_map` (first-line match) and raw materials auto-populate. Unmapped FGs become "Mapping Not Found" placeholders, as today.
- **Manual select** — skip auto-match. Each selected FG appears in step 2 with an empty RM list the user fills in.

A single dialog handles both. User picks FG items, picks mode, clicks **Next: Review & Edit**.

### Step 2 — Edit before save (new)
A review panel grouped by FG item. For each FG:

- Header row: item no, model, FG qty (read-only — comes from BOQ snapshot)
- Editable RM rows below: `make`, `material`, `size_model`, `qty_per_unit`, `unit`, `notes`. `required_qty` auto-computes as `qty_per_unit × fg_qty`.
- **Auto mode**: pre-filled from RM Master mapping; user can edit / add / remove rows.
- **Manual mode**: starts empty; **Add RM row** button per FG. For convenience, a **"Pick from RM Master"** combobox lets the user pull RM rows from any existing mapping into this FG.
- Per-FG **Mark as Direct Purchase** toggle — clears RM rows for that FG (no RM generated, matches current direct-purchase behavior).
- A small banner lists any unmapped FGs in auto mode so the user knows to fill them in or mark direct purchase.

Footer: **Back**, **Cancel**, **Create Requisition**. Save behaves like today — calls the `create-requisition` edge function with the full edited payload, then navigates to `/requisitions/:id`.

### After save
Nothing changes downstream. The new requisition shows up in **Requisitions** list with all existing actions: View, PDF Download, Generate/Copy Link, Send to Purchase. Old requisitions remain untouched snapshots.

## Technical changes

```text
src/components/manufacturing/CreateRequisitionDialog.tsx   (rewrite as 2-step wizard, keep existing matching logic for step 1 status badges)
supabase/functions/create-requisition/index.ts             (accept optional edited payload; fall back to current auto-match when absent)
```

### Edge function contract change (backwards compatible)

Extend request body:
```ts
{
  boq_id: string;
  notes?: string;
  selected_boq_item_ids?: string[];
  mode?: "auto" | "manual";                  // default: "auto"
  edited_items?: Array<{
    boq_item_id: string;
    is_direct_purchase?: boolean;
    raw_materials: Array<{
      make?: string | null;
      material: string;
      size_model?: string | null;
      qty_per_unit: number | null;
      unit?: string | null;
      notes?: string | null;
    }>;
  }>;
}
```

Logic:
- If `edited_items` present → insert exactly those RM rows (skip auto-match for those FGs). `required_qty = qty_per_unit × fg_quantity`. `source = "manual"` when mode is manual or row was user-added/edited; `source = "mapped"` when row equals an auto-match suggestion untouched (we can simplify and always tag `manual` for edited payloads).
- If `edited_items` absent → preserve current auto-match path (so existing callers / regenerate flow stay identical).
- Direct-purchase FGs → no RM rows inserted (same as today).

### Dialog component

- Keep current `mapInfo` lookup so step 1 still shows "Mapped · N RM / Direct Purchase / Mapping Not Found" badges.
- Introduce `step` state (`"select" | "review"`) and `mode` state.
- On **Next**, build the editable structure: for each selected FG, seed `raw_materials` from `mapInfo`'s underlying mapping (auto mode) or `[]` (manual mode).
- Use shadcn `Input` / `Button` / `Switch` for inline edits. Combobox for "Pick from RM Master" can reuse the loaded `cleanedFgMaps` list rendered through `Command` / `Popover`.
- Submit calls the edge function with `mode` + `edited_items`.

### What stays the same

- `RequisitionsList`, `RequisitionDetail`, PDF generation, share token, family token, status flow, "Send to Purchase", regenerate-for-latest-revision, RM Master page, RLS policies, counters, snapshots.

## Out of scope

- No DB migration (`source` enum already allows `"manual"`).
- No change to public requisition view, purchase pages, or BOQ/OA flows.
- "Send to Purchase" / "Generate Link" / "PDF" already exist in `RequisitionsList` and `RequisitionDetail` — not re-touched.
