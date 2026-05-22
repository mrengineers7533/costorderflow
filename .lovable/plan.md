## Goal

Add a notification trigger that fires whenever an OA is revised, capturing recipients across Design, Purchase, Manufacturing, and the OA Creator. No delivery channel is wired up yet — only the storage + dispatch hook so email / SMS / WhatsApp / in‑app can be plugged in later.

Nothing in existing OA, BOQ, PI, Requisition, approval, revision, pricing, calculation, or workflow code changes behavior.

---

## What gets added

### 1. New table: `order_revision_notifications`

Stores one row per revision event. Acts as an outbox so a future delivery worker can pick pending rows and send via any channel.

Fields (domain):
- `order_id` (the new revision row)
- `order_root_id`
- `oa_number`, `revision`, `previous_revision`
- `revised_from_id`
- `client_name`, `format`
- `recipients` jsonb — array of `{ role, user_id, email, name, channels: ["email","sms","whatsapp","in_app"] }`
- `audience` jsonb — `{ design: [...], purchase: [...], manufacturing: [...], creator: {...} }`
- `status` text — `pending | queued | sent | failed | skipped` (default `pending`)
- `channel_status` jsonb — per-channel delivery state (default `{}`)
- `payload` jsonb — snapshot of summary fields for the future sender
- `error` text, `triggered_by` uuid, `sent_at`, `created_at`, `updated_at`

RLS: owner of the underlying order OR admin can read; insert via the trigger (security definer) and via owner/admin. No client UPDATE/DELETE needed yet (admin only).

### 2. New table: `notification_recipients` (config-only, no delivery)

So admins can later assign which users belong to Design / Purchase / Manufacturing groups without touching code.

Fields:
- `department` text — `design | purchase | manufacturing`
- `user_id` uuid (nullable) — links to `profiles`
- `email` text (nullable, for external recipients)
- `name` text
- `channels` text[] default `{email}`
- `is_active` bool default true

RLS: admin write, authenticated read.

OA Creator is resolved at trigger time from `orders.user_id` → `profiles` (no config row needed).

### 3. DB trigger on `orders`

`AFTER INSERT ON public.orders` — when `revision > 0` (i.e. a new revision, not the root row), insert one `order_revision_notifications` row with:
- recipients pulled from `notification_recipients` (active rows) grouped by department
- plus the OA creator from `profiles` joined on `orders.user_id`
- `status = 'pending'`
- `payload` = summary jsonb (oa_number, revision, previous_revision, client_name, format, revised_from_id)

Security definer function so it bypasses RLS for the insert. Does NOT modify the order row, send anything, or block the insert on error (wrapped so a failed notification never breaks revision creation).

### 4. Frontend hook (no UI delivery, just plumbing)

- `src/lib/notifications/orderRevision.ts` — typed helpers:
  - `listPendingRevisionNotifications()`
  - `markNotificationSent(id, channelStatus)`
  - `getRevisionNotificationsForOrder(orderId)`
- `src/hooks/useOrderRevisionNotifications.ts` — thin React hook around the above for any future admin/notifications screen.

Nothing is imported by existing screens, so behavior is unchanged. `reviseOrder()` in `src/lib/revisions/index.ts` is **not modified** — the DB trigger handles capture automatically when the new revision row is inserted.

### 5. Admin config screen (optional, minimal)

Add a small `src/pages/admin/AdminNotificationRecipients.tsx` so admins can add/remove department recipients. Linked from existing `AdminTabs.tsx` as a new tab "Notifications". Pure CRUD on `notification_recipients` — no other admin tabs change.

---

## What is explicitly NOT changed

- `src/lib/revisions/index.ts`, `reviseOrder`, `syncBoqsAndPisForOrder`, `createPendingBoqRevision` — untouched
- BOQ verification, design review, requisition, PI flows — untouched
- OA editor / preview / PDF / pricing / calc — untouched
- No edge function, no email provider, no Twilio/WhatsApp keys, no realtime broadcast — deferred until channel selection
- `supabase/config.toml`, existing storage buckets, existing RLS — untouched

---

## Technical notes

```text
orders (INSERT, revision > 0)
        │
        ▼
trg_orders_after_insert_notify  (SECURITY DEFINER)
        │
        ├── resolve audience from notification_recipients + profiles
        └── INSERT order_revision_notifications (status='pending')
                │
                ▼
        (future) delivery worker / edge function
                ├── email
                ├── sms
                ├── whatsapp
                └── in_app
```

Channel dispatch is intentionally a no-op now: rows accumulate as `pending`, ready for whichever channel(s) you wire up later. To enable a channel later, add an edge function that selects `status='pending'`, sends, then calls `markNotificationSent`.

---

## Deliverables

1. Migration creating `order_revision_notifications`, `notification_recipients`, the trigger function, the trigger, and RLS policies.
2. `src/lib/notifications/orderRevision.ts` + `src/hooks/useOrderRevisionNotifications.ts`.
3. `src/pages/admin/AdminNotificationRecipients.tsx` + new tab in `AdminTabs.tsx` + route.

Approve and I will implement in this order: migration → lib/hook → admin tab.