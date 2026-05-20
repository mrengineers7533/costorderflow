# Show Total (A+B) in Workflow

## Problem
The 200TPD cost sheet PDF clearly prints:
- Total (A) = 8,42,17,000
- Total Others (B) = 1,69,67,000
- TOTAL (A+B) = 10,11,84,000

But the AI parser stored only `line_items` for this sheet — `total_a`, `total_other_b`, and `cost_of_project` are all `null` in the DB. So in the Workflow card the row shows "—" for A, B and Cost of Project, and the Matched/Not Matched badge has nothing to compare against.

We cannot re-run the AI parse for every old sheet, so the fix has to work from data already on disk: the `line_items` array (84 rows for this sheet) plus the `make` field already classified by the parser.

## Fix (UI only — `src/pages/workflow/WorkflowPage.tsx`)

In `FamilyCard`, when `total_a` / `total_other_b` / `cost_of_project` are missing, derive them from `extracted.line_items`:

```ts
const items = Array.isArray(csEx.line_items) ? csEx.line_items as Array<{amount?: number; make?: string}> : [];
const sumA = items.filter(i => (i.make || "").toUpperCase() !== "GMS")
                  .reduce((s, i) => s + (Number(i.amount) || 0), 0);
const sumB = items.filter(i => (i.make || "").toUpperCase() === "GMS")
                  .reduce((s, i) => s + (Number(i.amount) || 0), 0);

const csTotalA = Number(csEx.total_a as number) || sumA;
const csTotalB = Number(csEx.total_other_b as number) || sumB;
const csCopPrinted = Number((csEx.cost_of_project || csEx.total_cost || csEx.total || csEx.grand_total) as number) || 0;
const csTotal = csCopPrinted || (csTotalA + csTotalB);
```

Result for the 200TPD sheet: A = 8,42,17,000, B = 1,69,67,000, A+B = **10,11,84,000** — shown in both the Cost Sheet Upload detail grid and the Matched/Not Matched badge in the card header.

## Strengthen the parser (optional follow-up — `supabase/functions/parse-cost-sheet/index.ts`)
Add one line to the prompt so future uploads persist the totals directly:
> "If `total_a`, `total_other_b` or `cost_of_project` are not labelled exactly, still compute and return them: `total_a` = sum of all non-GMS section sub-totals (machinery sections), `total_other_b` = sum of GMS / Others sub-totals, `cost_of_project` = A + B. Never leave these null when line items are present."

This doesn't affect existing data but makes new uploads self-sufficient.

## Out of scope
- No DB migration.
- No change to OA / BOQ / PI flows.
- No change to the Matched/Not Matched logic itself — it already reads `csTotal`, which will now be populated.
