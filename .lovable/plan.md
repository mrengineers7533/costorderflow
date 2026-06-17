## Goal
On both the Manufacturing and Purchase landing pages (the approved-BOQ list), separate documents into **MR** and **GMS** sections so users can switch between them, similar to the Design BOQs list.

## Scope
- Only `src/pages/modules/ApprovedBoqModule.tsx` → `ApprovedBoqListPage`.
- No changes to detail page, workflow, calculations, notifications, acknowledgement, save/PDF/auto-BOQ logic, or data.

## Changes
1. Add a `Tabs` control (shadcn `Tabs`) with two triggers: **MR BOQs (n)** and **GMS BOQs (n)**, defaulting to MR. Counts derived from `boq.format` on the already-filtered approved+latest-per-family `rows`.
2. Filter the displayed cards by the active tab (`b.format === tab`) before applying the existing search filter. Card rendering, badges, "Open" button, NotSeenNotifBadge — all unchanged.
3. Empty-state message adapts to the active tab ("No approved MR BOQs…" / "No approved GMS BOQs…").
4. Search box behavior unchanged; it now filters within the active tab.

## Out of scope (untouched)
- `ApprovedBoqDetailPage` (BOQ details view incl. Motor / Motor Qty / Remarks columns).
- Routing, sidebar entries, requisition flow, PDF, notifications.
- Any backend / migration work.

## Tech notes
- Reuse existing `Tabs`, `TabsList`, `TabsTrigger` from `@/components/ui/tabs` (already used in `DesignBoqList`).
- Tab state via `useState<"MR" | "GMS">("MR")`.
- Counts via `useMemo` over `rows`.
