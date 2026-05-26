## Goal

In Admin → Revision Notifications, allow adding recipients under any department name (e.g. DME Team, CRM Team, Reception, HR, Production) in addition to the existing Design, Purchase, Manufacturing — without affecting any other behavior.

## Why no DB change is needed

`notification_recipients.department` is already a free-form `text` column. The restriction is purely in the frontend (a hardcoded preset list and a TypeScript union). So this is a UI-only change.

## Changes

### 1. `src/lib/notifications/orderRevision.ts`
- Widen `NotificationDepartment` from a fixed union to `string` (keep the three existing values documented as known presets via a separate `KNOWN_DEPARTMENTS` const). Existing rows and code paths keep working unchanged.

### 2. `src/pages/admin/AdminNotificationRecipients.tsx`
Replace the fixed `Select` with a combined preset + custom input:
- Keep the three preset options (Design, Purchase, Manufacturing) plus newly added presets: DME Team, CRM Team, Reception, HR, Production.
- Add a "Custom…" option at the bottom of the dropdown. When chosen, reveal a text input where the admin types any department name.
- Normalize on add: trim whitespace, collapse internal spaces, store as-is (preserve case the user entered, e.g. "DME Team"). Validate non-empty and max length 60 chars.
- Department column in the existing recipients table already renders whatever string is stored, so custom names will display correctly. Remove the `capitalize` class on the cell so names like "DME Team" aren't lowercased visually — or keep it (CSS `capitalize` only capitalizes first letter of each word, it won't break uppercase acronyms). Verify and keep behavior consistent.

### 3. No other module touched
- Revision notification trigger, OA/PI/MR flows, PDFs, calculations, preview — unchanged.
- Existing recipients (design/purchase/manufacturing) continue to work exactly as today.
- `NotificationRecipient.role` type in `orderRevision.ts` similarly widened to `string | "creator"` so future audience payloads can reference custom departments. No runtime code paths currently constrain it.

## Verification

1. Open Admin → Revision Notifications.
2. Add a recipient under preset "Design" → still works as before.
3. Choose "Custom…", type "DME Team", add email → row appears with department "DME Team".
4. Repeat for "CRM Team", "Reception", "HR", "Production".
5. Toggle / delete works for both preset and custom department rows.
6. Refresh page → all rows persist.
7. Existing OA-revision notification creation flow is unchanged (recipients list query is the same).
