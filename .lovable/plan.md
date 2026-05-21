## Goal

From the BOQ page, generate a PDF of the **latest approved/updated BOQ** that includes remarks, design comments, and change history, and distribute it (PDF + shareable link) to Purchase and Factory. The link must always resolve to the **current latest approved BOQ** for that order family, so any later revision automatically propagates to Purchase, Manufacturing, requisitions and every downstream stage — without changing any existing OA, BOQ, approval, revision, calculation, pricing, or app flow.

## Approach (non-invasive, additive only)

### 1. New "Distribute to Purchase & Factory" action on BOQ page
Location: `src/pages/boqs/BoqEditor.tsx` (and/or BOQ list row action) — visible **only when** `verification_status === 'approved'`. Existing approval / revision / pricing flows are untouched.

Action opens a dialog:
- Recipients: Purchase email(s), Factory email(s) (prefilled from a new admin setting, editable per send).
- Auto-attached: freshly generated PDF (see §2).
- Auto-included: a **stable family link** (see §3) — not a per-revision link.
- Optional message.
- "Send" button → calls a new edge function (see §4).

### 2. Enriched BOQ PDF (reuses existing generator, additive only)
New file: `src/lib/boq/pdfDistribution.ts`
- Wraps existing `generateBoqPDF(boq)` from `src/lib/boq/pdf.ts` — same header, same item table, same status pill — **no change to current PDF code**.
- Appends extra sections after the existing output:
  - **Remarks summary** — per-item remarks already on `line_items[].remarks` (already shown, but consolidated).
  - **Design comments** — pulled from latest `boq_design_reviews` + `boq_design_review_items.comment` / `column_comments` / `design_change_note` for this BOQ.
  - **Change log** — diff of this revision vs previous revision using existing `boq_revisions` snapshots (item added / removed / qty / model / description / remarks changed). Reuses `src/lib/revisions/index.ts` helpers where possible.
- Filename: `<BOQ_NO>_rev<N>_distribution.pdf`.

### 3. Stable "family" share link (always-latest)
Problem: the existing `final_share_token` lives on a single BOQ row and would point to a fixed revision.

Add a tiny new table — purely additive, no change to `boqs`:

```
boq_family_share_tokens
  id uuid pk
  order_root_id uuid not null   -- = orders.parent_order_id ?? orders.id (the family key already used in WorkflowPage)
  token uuid unique not null default gen_random_uuid()
  created_by uuid
  created_at timestamptz default now()
  revoked_at timestamptz
```

One row per order family. The public link `/boq/family/:token` resolves server-side (new SECURITY DEFINER RPC `get_latest_approved_boq_by_family_token(_token)`) to the **current latest BOQ where `is_current = true AND verification_status = 'approved'`** in that family.

Result: whenever a new revision is approved, the same link automatically serves the new BOQ + new PDF. Old links never go stale, no re-sending required.

New public page `src/pages/boqs/FamilyBoq.tsx` (mirrors existing `FinalBoq.tsx`): shows latest approved BOQ read-only + "Download Distribution PDF" button that runs the same enriched generator client-side.

### 4. Edge function: `send-boq-distribution`
New `supabase/functions/send-boq-distribution/index.ts`:
- Auth: validates caller JWT, checks they own the BOQ or are admin.
- Input: `{ boq_id, purchase_emails[], factory_emails[], message? }`.
- Re-checks BOQ is approved server-side.
- Ensures a `boq_family_share_tokens` row exists for this family (creates if missing).
- Generates the enriched PDF server-side (uses `pdf-lib` / `jspdf` via npm specifier — same libs the client uses) OR accepts a pre-rendered PDF from the client as base64 to avoid duplicating the renderer (preferred — simpler, identical output).
- Sends email via Lovable Emails (transactional) with PDF attachment + family link.
- Logs to a new `boq_distribution_log` table (boq_id, family_token, recipients, sent_at, sent_by, message_id, status).

If Lovable Emails domain is not yet configured, the dialog surfaces the `Set up email domain` button and stops there. After setup, the send proceeds.

### 5. Auto-propagation on OA revision (no flow changes)
Today: revising an OA already creates a new `orders` row in the same family, and the existing BOQ revision flow can produce a new BOQ. We do **not** change either flow.

What we add is purely **read-side**:
- The family token resolves to the latest approved BOQ → Purchase / Manufacturing list pages (already built) and the public family link automatically reflect the newest approved revision.
- Distribution log shows the history of which revision was last emailed, so users can see whether a re-send is desired. A small banner on the BOQ page says: "Latest approved revision (rev N) has not been re-distributed since OA was revised — [Resend to Purchase & Factory]."
- No auto-email is sent without user action — the user stays in control of when to re-send. The link itself is always current; only the email blast is manual (this matches "User should be able to update the BOQ flow if required").

### 6. Connected stages reflect changes automatically
Purchase and Manufacturing modules already read `boqs` where `verification_status='approved'` and `is_current=true` per family (built in the previous turn). Because they read live, any approved revision is immediately reflected there. Future requisition / lot / PI / invoice / dispatch screens (deferred) will hang off the same family key, so they inherit the same auto-update behavior by construction.

### 7. Admin defaults (optional, small)
`app_settings` key `boq_distribution_defaults`:
```
{ purchase_emails: string[], factory_emails: string[] }
```
Editable in `src/pages/admin/AdminBoqSettings.tsx`. Used only to prefill the dialog.

## Files

**New**
- `src/lib/boq/pdfDistribution.ts` — enriched PDF (wraps existing generator)
- `src/components/boqs/DistributeBoqDialog.tsx` — recipients + send UI
- `src/pages/boqs/FamilyBoq.tsx` — public always-latest viewer
- `supabase/functions/send-boq-distribution/index.ts` — email + log
- Migration: `boq_family_share_tokens`, `boq_distribution_log`, RPC `get_latest_approved_boq_by_family_token`, RLS policies

**Edited (additive only)**
- `src/pages/boqs/BoqEditor.tsx` — add "Distribute" button (visible only when approved)
- `src/App.tsx` — route `/boq/family/:token` → `FamilyBoq`
- `src/pages/admin/AdminBoqSettings.tsx` — default recipients field

## Explicitly NOT changed
- `src/lib/boq/pdf.ts` (existing PDF)
- `src/lib/boq/types.ts`, `src/lib/orders/calc.ts`, pricing, currency
- OA editor, BOQ editor approval logic, revision logic
- Existing `final_share_token` flow and `FinalBoq.tsx`
- Workflow page, calculations, formatting

## Out of scope (per request: "for now, base module only" applies to downstream)
Requisition, lot marking, manufacturing planning, PI, invoice, dispatch screens — they'll plug into the same family key when built.

## Open question (1)
Should the distribution email be sent through **Lovable Emails** (recommended — domain + queue already supported, branded sender) or do you want to use an existing Gmail/Resend setup? If Lovable Emails, I'll trigger the email domain setup as the first step on send if it isn't configured yet.
