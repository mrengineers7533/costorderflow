## Goal

In the **All Orders** card on `/orders`, add **tabs** to filter by document state, and split the current combined "Docs" column into two clearly separated action buttons — one for **BOQ**, one for **PI** — each showing whether the document exists (View) or needs to be created (Create).

## What the user will see

### 1. Tabs above the table

A `Tabs` row (using existing `@/components/ui/tabs`) sits at the top of the **All Orders** card, just under the title row. Four tabs:

- **All** — every OA (current behavior)
- **Has BOQ** — only OAs where at least one BOQ exists
- **Has PI** — only OAs where at least one PI exists
- **No Docs** — OAs with neither a BOQ nor a PI

Each tab label shows a small count chip on the right (e.g. `Has BOQ · 4`). The active tab uses the existing `TabsTrigger` active state. The "Show superseded revisions" switch stays on the right of the same header row.

### 2. Split BOQ / PI columns

The single **Docs** column is replaced by **two columns**: **BOQ** and **PI**. Each cell shows ONE of two states:

- **Create BOQ / Create PI** — small outline button with `Plus` icon when no document exists. Clicking navigates to the create flow:
  - BOQ → `/boqs/new?orderId=<oa.id>` (or whatever the existing BOQ create route uses — confirmed against `BoqList.tsx` during implementation)
  - PI → `/pi/new?orderId=<oa.id>`
- **View BOQ / View PI** — small filled badge-style button with the existing `ClipboardList` / `Receipt` icon, showing count if `>1` (e.g. `View BOQ ×2`). Clicking navigates to `/boqs` or `/pi`.

Both buttons use `e.stopPropagation()` so they don't trigger row navigation to the OA editor.

```text
| OA Number | Rev | Format | Company | Date | Net | Status | BOQ            | PI            | Actions |
| OA-0004   | R0  | GMS    | Acme    | …    | ₹X  | final  | + Create BOQ   | View PI ×4    |  ⋯      |
| SANJEEV   | R0  | MR     | Beta    | …    | ₹Y  | draft  | View BOQ ×2    | View PI       |  ⋯      |
| OA-0001   | R0  | MR     | Gamma   | …    | ₹Z  | draft  | + Create BOQ   | + Create PI   |  ⋯      |
```

## Technical plan

**File:** `src/pages/orders/OrdersList.tsx` (single-file change)

1. **Tabs state**: add `const [docFilter, setDocFilter] = useState<"all" | "boq" | "pi" | "none">("all")`.

2. **Filtered list**: derive `visibleOrders` from `orders` + `boqCounts` + `piCounts`:
   - `all` → orders
   - `boq` → orders where `boqCounts[o.id] > 0`
   - `pi` → orders where `piCounts[o.id] > 0`
   - `none` → orders where neither count exists
   Render the `TableBody` from `visibleOrders` and compute the per-tab counts for the chip labels.

3. **Tabs UI**: wrap the table area in `<Tabs value={docFilter} onValueChange={...}>` with a `TabsList` of four `TabsTrigger`s. Place it inside `CardContent` above the `<Table>`. Keep the existing "Show superseded" switch where it is in the `CardHeader`.

4. **Columns**: replace the single `<TableHead>Docs</TableHead>` and `DocsBadges` cell with two heads (`BOQ`, `PI`) and two cells. Replace `DocsBadges` with two small components:
   - `BoqCell({ orderId, count })` — if `count === 0`: outline `Button` "Create BOQ" → `navigate(\`/boqs/new?orderId=${orderId}\`)`. Else: link/badge "View BOQ[ ×N]" → `/boqs`.
   - `PiCell({ orderId, count })` — same pattern with `Receipt` icon and `/pi/new?orderId=${orderId}` / `/pi`.
   Both wrap clicks in `e.stopPropagation()`.

5. **Create routes**: during implementation, open `src/App.tsx`, `BoqList.tsx`, and `PiList.tsx` to confirm the exact "create new" routes used today (e.g. `/boqs/new`, `/pi/new`, or a button-driven flow). If a query-param-based pre-fill isn't supported, fall back to navigating to the existing create entry point and surface the OA id via state.

6. **No DB / schema / RLS changes.** No new queries — reuses the already-fetched `boqCounts` and `piCounts`.

## Out of scope

- Persisting the selected tab across page reloads.
- Filtering by OA status / format / date inside each tab.
- Any changes to the BOQ or PI list pages.
