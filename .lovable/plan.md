## Consolidated Merge Summary in Notification Details View

### Goal
Add a merge-summary banner inside the Notification Details dialog that shows how many separate edit actions were merged into this notification and the time range they span.

### Scope
- **Backend:** Minimal additive change — one new JSONB column on `app_notifications` and a small update to `emit_notification`.
- **Frontend:** `NotificationDetailDialog.tsx` only. No other screens, calculations, workflows, or data-saving logic are touched.

---

### A. Backend (one migration)

1. **Add `merge_meta` JSONB column** to `public.app_notifications`.
2. **Update `emit_notification`:**
   - On **new insert**: set `merge_meta = jsonb_build_object('merge_count', 1, 'first_created_at', now(), 'last_merged_at', now())`.
   - On **merge into existing unread notification**: increment `merge_count`, update `last_merged_at`, preserve `first_created_at`.
3. **Update `src/integrations/supabase/types.ts`** to expose the new column.

### B. Frontend (`NotificationDetailDialog.tsx` only)

1. **Add `merge_meta` to `NotifFull` interface.**
2. **Render a merge summary banner** above the existing "Line Item Changes" section, visible only when `merge_count > 1`:
   - Text: "Merged 3 edits from 10:30 AM to 10:35 AM" (uses `first_created_at` and `last_merged_at`).
   - If the range spans multiple days, show dates too.
   - Styled as a subtle info badge (rounded pill, muted background) so it does not compete with the main content.
3. **Existing content untouched:** HeaderCard, StatusChipBar, Acknowledge button, Header Fields Changed table, BeforeAfterItemTable, edit-count label, and history aggregation remain exactly as-is.

---

### Acceptance
- A single-field edit on an unread record → no merge banner, normal display.
- Three rapid edits on the same unread record → one notification with a banner reading "Merged 3 edits from X to Y".
- Once the notification is acknowledged/read, the next edit starts a fresh notification (no banner).
- All existing module screens, calculations, acknowledgements, PDFs, and data persistence are unchanged.