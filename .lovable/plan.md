## Goal
Rebuild the Workflow page so each project is shown as a single horizontal row of compact stage cards (Example 1 layout). Each stage has its own ▾/▴ toggle that expands an inline detail panel beneath the strip. Per-stage revision history is hidden by default and revealed either by the stage's own toggle or by the global "Show Revision History" button.

## Scope
Edits only `src/pages/workflow/WorkflowPage.tsx`. No data model, RPC, edge function, or other page changes. Existing search, filter chips, routing, and data fetching are preserved.

## Stage list (16, left → right, horizontal scroll)
1. Cost Sheet Upload
2. MR OA
3. GMS OA
4. Auto BOQ
5. Design Link Sent
6. Comments Received
7. Update OA (MR/GMS)
8. Auto-Revised BOQ
9. Sent for Design Approval
10. Approval Received
11. Purchase/Mfg Link Sent
12. Requisition (placeholder)
13. Purchase (placeholder)
14. Manufacturing (placeholder)
15. Make PI
16. Dispatch (placeholder)

Stages 12, 13, 14, 16 have no backing data today and render as "Pending" placeholder cards — no business logic added.

## Compact card (default view, Example 1)
Fixed width ~13rem, fixed height. Contents:
- Step number (1–16) + stage icon
- Stage label (1 line, truncated)
- Status badge: Done / Sent / Awaiting / Pending
- One short summary line (e.g. `CS#1187`, `₹12.4L`, `R2`, `2 PI(s)`)
- ▾ toggle button

Cards are placed in `overflow-x-auto` flex row with `ChevronRight` separators between them.

## Expanded panel (per-stage)
When a card's ▾ is clicked, an inline detail panel drops directly under that card (still inside the same horizontal strip's row container, using a second row that anchors under the clicked card). Panel shows:
- All available fields (number, date, amount, link, status)
- Action buttons (Open, Copy Link, Convert to PI, etc.)
- A "▸ Revisions (N)" sub-toggle. When opened, revisions render as a **horizontal chip row** (left → right with arrows), never vertically.

Only one stage may be expanded at a time per family card (simpler, avoids layout reflow). Closing happens via ▴ on the same card or by clicking another stage's ▾.

## Global "Show Revision History" button
Drives a `globalRevisionsOpen` boolean. When true:
- Every expanded stage auto-opens its per-stage revisions chip row.
- Collapsed stage cards get a small "Nrev" pill so users see which stages have history.

## Data wiring (reuse existing `Family`)
- Stage 1: `f.costSheet` + extracted A/B/COP/Client Scope.
- Stage 2/3: `f.mrOa`, `f.gmsOa`; revisions = orders filtered by format with revision ≥ 0.
- Stage 4: first BOQ in `f.boqs` (revision 0); revisions = none here.
- Stage 5: first `comment` review (R1).
- Stage 6: comment reviews where `submitted_at` is set; revisions = all comment rounds.
- Stage 7: OA records with revision > 0; revisions = all such OAs.
- Stage 8: BOQ records with revision > 0; revisions = all such BOQs.
- Stage 9: any `approval` review.
- Stage 10: approval review with `overall_outcome === 'approved'`.
- Stage 11: `currentBoq.final_share_token` / `final_sent_at`.
- Stage 15: `f.pis`; revisions = all PIs incl. revisions; primary action remains "Convert to PI" link to current OA.
- Stages 12, 13, 14, 16: placeholder cards with "Pending" badge and short hint text in the expanded panel.

## Component changes inside `WorkflowPage.tsx`
- Remove the vertical `<Step>` block (current lines 303–398).
- Remove the existing `<HistorySection>` and `<HistoryList>` (replaced by per-stage revisions chip row inside each expanded panel).
- Keep `ActivityTimeline` removed from the family card render so nothing displays vertically. The function may be deleted to keep the file tidy.
- Add new components in the same file:
  - `HorizontalStageStrip({ family, globalRevisionsOpen })` — renders the 16 compact cards + handles which one is expanded.
  - `StageCard({ step, icon, label, status, summary, expanded, onToggle, revisionsCount })` — compact card UI.
  - `StageDetailPanel({ stage, family, revisionsOpen, onToggleRevisions })` — switch by stage id; renders the right detail block.
  - `RevisionsChips({ items })` — horizontal chip row with arrows.
- Keep existing header, search input, filter chips (Format / Cost Sheet / Stage), `globalRevisionsOpen` toggle button (rename label to "Show All Revisions" / "Hide All Revisions" for clarity).

## Visual rules
- Use existing semantic tokens (`bg-card`, `border`, `text-muted-foreground`, `bg-emerald-600` for Done badge, `bg-muted` for placeholders). No new colors.
- Cards: `w-52 shrink-0 rounded-md border bg-card p-2.5`.
- Strip: `overflow-x-auto pb-2` containing `flex items-stretch gap-2 min-w-min`.
- Separators: `<ChevronRight className="h-5 w-5 text-muted-foreground" />` between cards.
- Expanded panel: rendered in a second flex row directly under the strip, full width of the family card; no vertical lists of fields — fields laid out in a responsive grid (`grid grid-cols-2 md:grid-cols-4 gap-2`) so info still reads left-to-right.

## Out of scope
- No schema changes; no new tables for Requisition/Purchase/Manufacturing/Dispatch.
- No edits to OrdersList, BoqList, PiList, FlowReport, sidebar, or edge functions.
- No PDF/Excel export changes.
- No new dependencies.
