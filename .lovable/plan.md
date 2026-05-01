## Goal

On the **Order Acceptances** list (`/orders`), visually indicate for each OA whether a **BOQ** and/or a **PI (Proforma Invoice)** has already been created from it — so users can tell at a glance which OAs already have downstream documents.

## What the user will see

A new **"Docs"** column (between *Status* and *Actions*) on each OA row showing two small badges:

- **BOQ** badge — appears when one or more BOQs exist for that OA. Shows count if more than 1 (e.g. `BOQ ×2`). Tooltip: "2 BOQ revisions created".
- **PI** badge — appears when one or more PIs exist. Shows count if more than 1 (e.g. `PI ×4`). Tooltip: "4 PI revisions created".
- When neither exists, a faint dash (`—`) is shown so the column never looks broken.

Badges use existing UI:
- BOQ → `secondary` variant with a `ClipboardList` icon
- PI → `default` variant (primary tint) with a `Receipt` icon
- Both rounded-full, `text-[10px]`, compact padding to match existing row density.

Clicking a badge navigates to the filtered list (BOQ badge → `/boqs`, PI badge → `/pi`); clicks on the badge `stopPropagation` so the row's edit navigation does not fire.

```text
| OA Number | Rev | Format | Company | Date | Net | Status   | Docs        | Actions |
| OA-0004   | R0  | GMS    | Acme    | …    | ₹X  | finalized| [PI ×4]     |  ⋯      |
| SANJEEV   | R0  | MR     | Beta    | …    | ₹Y  | draft    | [BOQ ×2][PI]|  ⋯      |
| OA-0001   | R0  | MR     | Gamma   | …    | ₹Z  | draft    | —           |  ⋯      |
```

## Technical plan

**File:** `src/pages/orders/OrdersList.tsx`

1. After loading `orders`, fetch counts in two lightweight queries (only the linking columns, scoped to the loaded order ids):
   - `supabase.from("boqs").select("order_id").in("order_id", ids)`
   - `supabase.from("proforma_invoices").select("reference_oa_id").in("reference_oa_id", ids)`
   
   Reduce each result into a `Record<orderId, number>` map stored in state (`boqCounts`, `piCounts`). Re-run alongside the existing `refreshTick` / `showSuperseded` effect.

2. Add a new `<TableHead>Docs</TableHead>` between Status and Actions, plus a matching `<TableCell>` per row that renders:
   - `BoqBadge` if `boqCounts[o.id] > 0`
   - `PiBadge` if `piCounts[o.id] > 0`
   - else a muted `—`

3. Add small inline `BoqBadge` / `PiBadge` components using the existing `Badge` + `lucide-react` icons (`ClipboardList`, `Receipt`). Wrap each in a `<Link>` (with `onClick={(e) => e.stopPropagation()}`) so clicks don't trigger row navigation.

4. No DB schema changes, no migrations, no RLS changes — these tables already allow public select.

## Out of scope

- Doing the same on the dashboard's "Recent OAs" list (can be added later if you want).
- Filtering OAs by "has BOQ" / "has PI" — only visual indicators for now.
