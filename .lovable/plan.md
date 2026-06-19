# Fix: Hidden notification banner + page scroll jump

## Scope (only these two things)

1. The in-page notification banner (`ModuleNotifications`) must be **hidden by default** on every page/modal it appears on, and only open when the user clicks it.
2. Reduce auto page jumps caused by that banner mounting/expanding while the user is typing in forms.

Nothing else (workflows, approvals, calculations, save logic, PDF, notifications content, designs, BOQ/OA/PI/Purchase/Manufacturing/Design behavior) will be touched.

---

## Change 1 — Notification banner hidden by default

File: `src/components/notifications/ModuleNotifications.tsx`

Current behavior: `const [open, setOpen] = useState(true);` → banner auto-expands as soon as notifications load, on every page (BOQ Editor, OA Editor, PI Editor, Requisition Detail, Approved BOQ, Design BOQ View).

New behavior:
- Default `open = false` (collapsed).
- The component still mounts when there are notifications, but only renders the compact header bar (bell icon + count + "new" badge + chevron).
- The full list renders only after the user clicks the header to expand it.
- Clicking again collapses it. Once collapsed it stays collapsed until the user clicks again.
- Persist the open/closed choice per page in `sessionStorage` keyed by the links signature, so that re-renders / data refetches do NOT re-open it after the user has closed it.
- No change to: notification content, acknowledge logic, RPC call, detail dialog, badge counts, styling of items.

Pages that already use `<ModuleNotifications>` (BoqEditor, OrderEditor, PiEditor, RequisitionDetail, ApprovedBoqModule, DesignBoqView) get the new collapsed-by-default behavior automatically — no per-page edits needed.

## Change 2 — Stop page jump caused by the banner

Root cause of most "page jumps while typing": the banner is initially absent, then notifications load asynchronously and the expanded banner appears above the form, pushing all content down and shifting the user's caret/viewport.

Fix (same file, no other behavior change):
- Because the banner now renders only the small fixed-height header by default, expanding it from 0 → tall content no longer happens automatically — eliminating the main mid-typing layout shift.
- No `scrollIntoView`, `focus()`, or `window.scrollTo` calls will be added or removed in editor pages; the existing user-initiated scroll buttons in `BoqEditor.tsx` (lines 492, 499, 674) stay exactly as they are.

Out of scope: any other source of scroll jump that isn't the notification banner. If after this fix a specific page still jumps, we'll address that page separately with a follow-up scoped fix.

---

## Technical summary

- Edit only `src/components/notifications/ModuleNotifications.tsx`:
  - `useState(true)` → `useState(false)` for `open`.
  - On mount, hydrate `open` from `sessionStorage.getItem(\`notif-open:${linksKey}:${modsKey}\`)`.
  - On toggle, persist the new value to `sessionStorage`.
- No other files changed. No DB, no migrations, no edge functions, no UI library changes.

## Verification

- Open BOQ Editor / OA Editor / PI Editor / Requisition Detail / Design BOQ View / Approved BOQ: notification bar shows only the collapsed header, never auto-expands.
- Click the header → expands. Click again → collapses and stays collapsed across refetches.
- Typing in form fields while notifications are loading in the background no longer shifts the page (banner header reserves a constant small height instead of growing).
- All existing acknowledge / detail / count behavior unchanged.
