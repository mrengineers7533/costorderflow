# Fix: Autosave failed when changing status in Requisition Planning

## Root cause
The UI lets users pick plan_status values: `machine`, `3p`, `pipe`, `sheet_ss`, `sheet_ms`, `sheet_gi`, `structure`, `steel`.

But the DB CHECK constraint on `requisition_raw_materials.plan_status` only allows three values:

```
CHECK (plan_status IS NULL OR plan_status IN ('machine','3p','steel'))
```

So selecting "Sheet SS" (or Pipe / Sheet MS / Sheet GI / Structure) makes the autosave UPDATE fail with a 23514 check-constraint violation. The toast renders `[object Object]` because the Supabase error is not an `Error` instance.

## Changes

1. **New migration** — drop the old constraint and recreate it with the full allowed set:
   `machine, 3p, pipe, sheet_ss, sheet_ms, sheet_gi, structure, steel`.

2. **`src/pages/requisitions/RequisitionPlan.tsx`** — improve the error stringifier in `flushPending` so Supabase error objects render their `.message` / `.details` instead of `[object Object]`. No behavior changes elsewhere.

## Out of scope
No changes to the planning UI, statuses list, annexure flow, requisition upload/delete, or any other existing features.
