## Goal

Add a new top-level **Workflow** menu item that visualizes the full Cost Sheet → OA → BOQ → Design Review → PI lifecycle for each project family, with revision history kept collapsed by default.

Read-only view. No changes to existing pages, schemas, RPCs, or business logic.

## Sidebar + routing

### `src/components/AppSidebar.tsx`
Add a new entry between **Proforma Invoices** and **Flow Report**:

```ts
{ title: "Workflow", url: "/workflow", icon: Workflow }  // lucide "Workflow" icon
```

### `src/App.tsx`
Register the route inside the existing protected `<Routes>`:

```tsx
<Route path="/workflow" element={<WorkflowPage />} />
```

## New page: `src/pages/workflow/WorkflowPage.tsx`

### Data load (one effect, parallel queries — same pattern as `FlowReport.tsx`)

- `orders` — all rows
- `boqs` — all rows
- `proforma_invoices` — all rows
- `cost_sheets` — `id, original_filename, created_at, extracted` (cost sheet # / date / total live inside the `extracted` JSON; surface what is present)
- `boq_design_reviews` — `id, boq_id, round_no, kind, status, sent_at, submitted_at, overall_outcome, token, expires_at`
- `boqs.final_share_token` + `final_sent_at` are already on the BOQ row

### Family grouping (mirrors `FlowReport`)

Group orders by `parent_order_id || id`. For each family compute:

- `costSheet`: matched by `current.cost_sheet_number` against `cost_sheets.extracted->>'cost_sheet_number'` (fall back to filename match). Expose `cost_sheet_number`, `cost_sheet_date`, `total_cost`.
- `mrOa` / `gmsOa`: pick the current OA per `format`. If the family has both formats split across two orders, show both; otherwise the missing side shows "—".
- `boqs`: all BOQs whose `order_id ∈ familyIds`, sorted by `revision`.
- `designReviews`: all `boq_design_reviews` whose `boq_id ∈ family BOQ ids`, sorted by `sent_at`.
- `pis`: PIs joined via `reference_oa_id`.

### Layout

Top of page:
- Title "Workflow"
- Search input (company / OA / BOQ / PI), reusing the FlowReport pattern
- One global "Show / Hide Revision History" toggle (default = hidden)

Below: one **family card** per project. Each card renders an ordered, numbered step list. Each step is its own row with an icon, label, key meta, action chips, and an inline "Revisions" sub-list that is hidden unless the user expands either the global toggle or the per-card disclosure.

#### Step layout (per family)

```
1. Cost Sheet Upload      | CS# • Date • ₹Total Cost           | [View]
2. MR OA                  | MROA/… • Date • ₹Basic Amount      | [Open]   [+ History]
3. GMS OA                 | 25-26/GMS/… • Date • ₹Amount       | [Open]   [+ History]
4. Auto BOQ               | BOQ# • Created date                 | [Open BOQ]
5. Design Link Sent       | Round R{n} comment • Sent at        | [Copy Link]
6. Design Link Returned   | Submitted at • Outcome badge        | [View Round]
7. Update OA              | Revision bump after comments        | [Open Updated OA]
8. Approval Link Sent     | Round R{n} approval • Sent at       | [Copy Link]
   Approval Received      | Submitted • Outcome (Approved / Partial / Changes)
9. After Approval         | OA Revised → BOQ auto-revised       | [Open Revised BOQ]
10. Send Links            | Final BOQ link to Purchase & Mfg    | [Copy Final Link]
11. Convert to PI         | PI#(s) if any                       | [Convert to PI] / [Open PI]
```

Status rules per step (badge):

- **Done** when the underlying record exists (e.g. cost sheet found, BOQ exists, review submitted, PI present).
- **Pending** otherwise. No record creation from this page.

#### Revision history (collapsed by default)

Each step that has multiple revisions/rounds (OA, BOQ, design rounds, PI) gets a chevron disclosure. Collapsed → shows only the current item. Expanded → shows a small table of all revisions with date, number, status, and a link to open the editor at that revision.

A page-level toggle "Show / Hide Revision History" sets the initial state for every disclosure on the page.

### Linking out (uses existing routes — no editor changes)

- Cost sheet — link not navigable in the app today; show meta only, no button if no route exists.
- OA: `/orders/{id}`
- BOQ: `/boqs/{id}`
- PI: `/pi/{id}`
- Design review round: copy the existing `reviewLink(token)` URL to clipboard (same helper used in `DesignReviewPanel`).
- Final BOQ link: copy `finalBoqLink(token)` if `final_share_token` is set.
- **Convert to PI** chip: link to `/pi/new?fromOa={currentOaId}` if that route already exists; otherwise link to the OA editor where the user already has a "Convert to PI" action. (Will confirm during implementation by reading `PiEditor` / `OrderEditor`; no behavior change either way.)

## Out of scope

- No edits to OA / BOQ / PI editors, design-review flow, PDF, or RPCs.
- No schema / migration / RLS changes.
- No new mutating actions — page is read-only aggregation + deep links + copy-link buttons.
- No changes to FlowReport.
