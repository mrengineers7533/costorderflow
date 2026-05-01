# How to use? page + protected creator credit

## 1. New sidebar entry

In `src/components/AppSidebar.tsx`, add a new nav item:
- Title: "How to use?"
- Icon: `HelpCircle` (lucide-react)
- URL: `/how-to-use`

Add page meta in `src/components/AppLayout.tsx`:
- `/how-to-use` → title "How to use?", desc "Quick guide to using this app."

## 2. New page: `src/pages/HowToUse.tsx`

Layout (clean, responsive, matches existing card style):

- H1: "How to use this app"
- Intro paragraph
- 5 step cards in a responsive grid (1 col mobile, 2 cols md+):
  1. Open the dashboard
  2. Choose the feature you want to use
  3. Enter the required details
  4. Review the result
  5. Save, export, or continue as needed
- Each card: numbered badge, step title, short description, lucide icon
- Bottom: prominent `CreatorCredit` component (see §4)

Register route in `src/App.tsx`: `<Route path="/how-to-use" element={<HowToUse />} />`.

## 3. Backend: settings table + edge function

### Migration
New table `app_settings`:
- `key` text primary key
- `value` jsonb not null default `'{}'`
- `updated_at` timestamptz default now()
- `updated_by` uuid nullable

Seed row: `('creator_credit', '{"visible": true}')`.

RLS:
- SELECT: public (anon + authenticated) — so frontend can read visibility
- INSERT/UPDATE/DELETE: denied to all roles (only service role via edge function can write)

New table `credit_removal_attempts` (audit log):
- `id` uuid pk default gen_random_uuid()
- `attempted_at` timestamptz default now()
- `success` boolean
- `user_identifier` text (IP or user id if available)
RLS: all denied (service role only).

### Edge function: `toggle-creator-credit`
File: `supabase/functions/toggle-creator-credit/index.ts`
Config: `verify_jwt = false` (no auth required since app has no auth UI; security comes from PIN).

Behavior:
- POST body: `{ pin: string, action: "hide" | "show" }`
- Read `WATERMARK_REMOVAL_PIN` from env
- Validate pin is exactly 6 digits and matches (constant-time compare)
- Log attempt to `credit_removal_attempts` with timestamp + request IP from headers
- On success: upsert `app_settings` row `creator_credit` with `{visible: action === "show"}`, return `{ ok: true }`
- On failure: return 401 with `{ error: "Invalid PIN. You are not authorized to remove creator credit." }`

Uses service role key (already in secrets) for DB writes.

### Secret
Request `WATERMARK_REMOVAL_PIN` from user via add_secret. PIN never leaves backend.

## 4. Shared `CreatorCredit` component

File: `src/components/CreatorCredit.tsx`
- Fetches `app_settings` row `creator_credit` once on mount via supabase client
- Default state: visible = true (until proven otherwise)
- Renders: `Built by Sanjeev Kumar` (small muted text)
- If `visible === false`, renders nothing
- Two variants via prop: `variant="footer"` (compact) and `variant="page"` (larger, centered)

Used in:
- `HowToUse.tsx` bottom (page variant)
- `AppLayout.tsx` — add a thin footer below `<main>` rendering the footer variant. This puts the credit on every page in one shared place.

No UI control, toggle, button, or setting is exposed anywhere in the app for removing the credit. The only way to remove it is calling the edge function directly with the correct PIN (admin-only, out-of-band).

## 5. Security guarantees

- PIN stored only as Supabase secret `WATERMARK_REMOVAL_PIN`, read only inside edge function
- Frontend never sees, sends, or stores the PIN (no UI to enter it exists)
- No localStorage / sessionStorage usage for credit state
- Visibility flag stored server-side in `app_settings`, checked on every app load via shared component
- Every attempt (success or failure) logged to `credit_removal_attempts` with timestamp and requester IP
- RLS prevents anyone from flipping the flag through the public Supabase client

## How an admin removes the credit (out-of-band)

Documented in code comment in the edge function:
```
curl -X POST https://<project>.supabase.co/functions/v1/toggle-creator-credit \
  -H "Content-Type: application/json" \
  -H "apikey: <anon key>" \
  -d '{"pin":"123456","action":"hide"}'
```

## Files to create
- `src/pages/HowToUse.tsx`
- `src/components/CreatorCredit.tsx`
- `supabase/functions/toggle-creator-credit/index.ts`

## Files to edit
- `src/App.tsx` (route)
- `src/components/AppSidebar.tsx` (nav item)
- `src/components/AppLayout.tsx` (page meta + footer credit)

## Migration
- Create `app_settings` and `credit_removal_attempts` tables with RLS as described
- Seed `creator_credit` row with `{visible: true}`

## Secret to request
- `WATERMARK_REMOVAL_PIN` (6-digit string)
