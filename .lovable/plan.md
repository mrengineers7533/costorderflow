## Goal

Two scoped fixes to the **Notification system only**. No changes to OA/BOQ/Design/Manufacturing/Purchase data, calculations, workflows, approvals, acknowledgement, PDFs, or any module screen.

---

## Why multiple notifications appear today

When an OA is saved, the app cascades the change into linked **BOQ** and **PI** rows so they stay in sync (`src/lib/revisions/index.ts` updates `boqs.line_items` and `proforma_invoices.line_items`). Each table has its own DB trigger that calls `emit_notification(...)` → so one OA save can produce: 1 OA `line_items_changed` + 1 BOQ `line_items_changed` + 1 PI `line_items_changed`. That is the "3 notifications" the user sees.

A single `emit_notification` already inserts **one row** per source event with a `target_departments[]` array, so the per-department fan-out is already correct. The real problem is the cascade producing 3 source events instead of 1.

---

## Part 1 — Backend: suppress cascade notifications (1 new migration)

Add a per-connection suppression flag the trigger respects so cascaded updates from an OA save don't emit their own notifications. The originating OA event is the single consolidated notification per related department.

1. New SQL function `public.set_notif_suppress(p_on boolean)` (SECURITY DEFINER, granted to `authenticated`) that calls `set_config('notif.suppress_cascade', 'on'/'off', false)`.
2. Update `public.emit_notification` to early-return when `current_setting('notif.suppress_cascade', true) = 'on'`. All other logic (target resolution, actor exclusion, line-items short-circuit) stays identical.
3. No trigger logic, no schema, no RLS, no other functions are changed.

Frontend change to use it (notification plumbing only, no business logic change):
- `src/lib/revisions/index.ts` — before the BOQ + PI sync loops call `supabase.rpc('set_notif_suppress', { p_on: true })`; after both loops finish (in a `finally`) call it again with `false`. The OA `UPDATE` itself runs BEFORE suppression is enabled, so the OA `line_items_changed` notification still fires once and reaches Design / Purchase / Manufacturing / Costing-BOQ / Costing-PI exactly as the user requested.

Result for one OA edit:
- BOQ recipients: 1 notification
- Design recipients: 1 notification
- Manufacturing recipients: 1 notification
- Purchase recipients: 1 notification
- OA (Costing-OA sub-module) recipients: excluded (already by existing source-module rule)

No change for BOQ-only, PI-only, Purchase-only, Requisition-only, Design-only edits — those don't cascade, so they keep producing exactly one notification per related department as today.

---

## Part 2 — Notification Details view (frontend only)

File: `src/components/notifications/NotificationDetailDialog.tsx`. Replace the current Before/After two-row table with a single-row-per-changed-item table matching the user's exact spec. No other file is touched.

Table header (fixed):

```text
S. No. | Description | HSN | Qty | Rate | Amount | Changes/Edit
```

Per row rules, driven entirely by the existing `line_item_changes` JSON payload (`{type: 'added'|'removed'|'modified', before, after, changed_fields[]}`):

- **modified** → one row showing `after` values. Any cell whose key (or its alias) appears in `changed_fields` is wrapped in `text-red-600 font-semibold`. "Changes/Edit" cell lists one line per changed field: `Change in <Label>: Old value was <old> and new value is <new>.` Labels: Description, HSN, Quantity, Rate, Amount (and other known fields).
- **added** → one row with `after` values in normal style. Changes/Edit = "New line item added."
- **removed** → one row with `before` values in red strike-through. Changes/Edit = "Line item removed."
- **Unchanged items are not rendered** (per spec).

Field alias resolution (already present, reused so no module breaks):
- Description ← `description` / `size_model` / `model`
- HSN ← `hsn` / `hsn_code` / `hsn_sac`
- Qty ← `qty` / `quantity`
- Rate ← `rate` / `unit_rate` / `price`
- Amount ← `amount` / `total` (fallback `qty * rate`)

Kept as-is: HeaderCard, StatusChipBar, "Header Fields Changed" section, Acknowledge button, Not-Seen Notifications badge, dashboard, data fetching, JSON shape, and every caller of the dialog.

---

## Files touched

- `supabase/migrations/<new timestamp>_notif_suppress_cascade.sql` — adds `set_notif_suppress` and updates `emit_notification` only.
- `src/lib/revisions/index.ts` — wraps the BOQ + PI cascade block with `set_notif_suppress(true/false)`. No data logic changed.
- `src/components/notifications/NotificationDetailDialog.tsx` — rewrites only the line-items table to the single-row format above.

## Out of scope (explicitly not changed)

OA/BOQ/PI/Design/Purchase/Manufacturing/Requisition screens, calculations, save logic, PDFs/Excel, approvals, acknowledgement flow, RLS, triggers other than `emit_notification`, sidebar, dashboard charts.

## Acceptance

1. Save one Qty change on one OA item → exactly one notification per related department (BOQ, Design, Manufacturing, Purchase); zero for OA itself.
2. Open Details on that notification → table shows only that one item, Qty cell in red, Changes/Edit reads "Change in Quantity: Old value was 11 and new value is 21."
3. Save multi-field, multi-item OA edit → still one notification per department; Details shows only the changed items with all changed fields red and one sentence per field in Changes/Edit.
4. BOQ-only / PI-only / Purchase-only edits behave exactly as before (one notification per related department).
5. Acknowledge, Seen/Unseen, Not-Seen badge, dashboard counts, and all module pages behave identically to before.
