# Activity & Notification Layer (Plan)

Add a non-invasive, read-only "what changed / what's pending" layer across OA, BOQ, Design, Requisition, Manufacturing, Purchase, and PI. No existing workflow, calculation, auto-revision, approval, layout, or linked-data behavior is altered — we only **observe** existing events and **surface** them.

## What the user gets

1. **Right-side Activity Panel** (slide-over) available from the global header on every module page.
   - Timeline of events (newest first), filterable by module and by status (Pending / Warning / Info / Approved / Impacted).
   - Each entry: icon, title, module, related entity link (OA / BOQ / PI / Requisition), actor, time, status badge.
   - Bell button in header with unread count.

2. **In-page banner** at the top of OA, BOQ, Requisition, Manufacturing, Purchase, and PI detail pages, showing the most relevant pending/warning items for the entity currently open. Examples:
   - "Design approval pending — required before final processing"
   - "OA revised — BOQ auto-revised to Rev 3"
   - "BOQ updated after this Requisition was generated"
   - Banner is dismissible per-user per-event; never blocks the page.

3. **Status chips** next to the entity title ("Approval Pending", "Impacted", "Up to date") derived from the same event store.

## Events captured

| Trigger (already exists in app) | Event type | Status |
|---|---|---|
| Cost sheet uploaded | cost_sheet.uploaded | info |
| OA created / edited / revised | oa.created / oa.edited / oa.revised | info / info / warning |
| BOQ auto-revised from OA | boq.auto_revised | warning |
| BOQ link sent to Design | design.link_sent | pending |
| Design data submitted | design.submitted | info |
| Approval link generated / submitted / completed | approval.requested / submitted / completed | pending / pending / approved |
| Requisition created | requisition.created | info |
| BOQ changes after Requisition exists | requisition.impacted | impacted |
| Purchase data updated | purchase.updated | info |
| PI created / revised | pi.created / pi.revised | info |

Downstream "impacted" rows are derived (not separately written) by a SQL view that joins the latest BOQ revision with linked requisitions/PIs.

## Technical design

### Database (one new table + one read-state table + one view)

`activity_events`
- id uuid pk, event_type text, status text (info|pending|warning|approved|impacted), module text
- title text, message text
- order_root_id uuid (nullable, links every event in a family)
- order_id, boq_id, pi_id, requisition_id uuid (nullable)
- actor_id uuid, actor_email text, actor_name text
- metadata jsonb default '{}', created_at timestamptz default now()
- Indexes on (order_root_id, created_at desc), (module, status), (created_at desc)
- RLS: select for any authenticated user who can see the linked entity (mirrors existing orders/boqs/requisitions/proforma_invoices ownership); insert for owner or admin

`activity_event_reads` — per-user dismissal / unread tracking
- (event_id uuid, user_id uuid, read_at timestamptz), PK (event_id, user_id)

View `v_entity_pending_state` — for a given order_root_id returns latest design approval state, latest BOQ revision, and whether any linked requisition/PI references an older revision. Powers banners and chips without touching source tables.

### Event emission (additive)

A tiny `logEvent(...)` helper in `src/lib/activity/log.ts`. Call sites are added next to existing success paths; emission is fire-and-forget (errors swallowed + console.warn) so existing flows cannot regress:

- `src/components/orders/CostSheetPicker.tsx` — after successful upload
- `src/pages/orders/OrderEditor.tsx` — after create / save / revise
- `src/pages/boqs/BoqEditor.tsx` — after BOQ auto-revision branch and after sending Design link
- `src/components/boqs/DesignReviewPanel.tsx` and `src/pages/boqs/DesignReview.tsx` — link generation / submission
- `src/pages/boqs/BoqVerify.tsx` — approval request / completion
- `src/components/manufacturing/CreateRequisitionDialog.tsx`, `src/pages/requisitions/RequisitionDetail.tsx` — requisition create / status change
- `src/pages/pi/PiEditor.tsx` — PI create / revise

### UI components (new, isolated)

- `src/lib/activity/{types,api,log}.ts`
- `src/hooks/useActivityFeed.ts` — paginated + realtime via `supabase.channel('activity_events')`
- `src/components/activity/ActivityBell.tsx` — header bell + unread badge, added to `AppLayout` next to `GlobalSearch`
- `src/components/activity/ActivityPanel.tsx` — right-side `Sheet` timeline, filters, mark-all-read
- `src/components/activity/EntityActivityBanner.tsx` — single-line `<EntityActivityBanner orderRootId={...} />` dropped into the six detail pages
- `src/components/activity/EntityStatusChip.tsx` — small badge for page headers

### Explicitly NOT changed

- No existing column, RLS policy, trigger, or enum modified.
- No change to auto-revision, BOQ recalculation, approval gating, PDF/Excel output, requisition generation, purchase flow.
- Banner is advisory only — never blocks save/approve/generate.
- `order_revision_notifications` and `notification_recipients` (email side) remain as-is; this layer is **internal in-app only**.

## Rollout

1. Migration: `activity_events` + `activity_event_reads` + RLS + view.
2. Library + hook + UI components.
3. Wire `<ActivityBell />` into `AppLayout`.
4. Add `logEvent` calls at each trigger site listed above.
5. Add `<EntityActivityBanner />` and `<EntityStatusChip />` to the six detail pages.

Estimated touch: 1 migration, ~7 new files, ~8 existing files each with a 1-3 line additive change.
