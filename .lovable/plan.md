# Sidebar icon + alignment fix (UI only)

Presentation-only tweaks to `src/components/AppSidebar.tsx`. No behavior, routing, access, or notification-count logic changes.

## Issues seen in current build

1. **Collapsed sidebar** — icons are left-shifted instead of centered. Both `MenuItem` and the group-toggle buttons (Report & Dashboard, Costing) use a hard-coded `px-4`, which pushes the 18px icon against the left edge of the 3rem-wide collapsed rail.
2. **Collapsed notification badge** — the unread pill on the Notifications item renders large ("30" bubble covering the icon) because it uses `min-w-5 h-5` with absolute top-1/right-1. Needs a compact dot / small badge in collapsed mode.
3. **Costing group** uses a text `₹` glyph instead of a real Lucide icon, so it looks inconsistent with the rest of the rail.
4. **Group toggle buttons** (Report & Dashboard, Costing) show the chevron in collapsed mode via layout that assumes expanded width, causing overflow / off-center icon.

## Fix

In `src/components/AppSidebar.tsx` only:

- `MenuItem`: conditional padding — `px-4` when expanded, `justify-center px-0` when collapsed. Keep pill shape.
- Group toggle buttons (Report, Costing): same conditional centering; hide the chevron entirely when collapsed (it's meaningless without a label). Never render `justify-between` in collapsed mode.
- Replace the `₹` span with `IndianRupee` from `lucide-react` (same 18px sizing as siblings) for the Costing group icon.
- Unread notification badge:
  - Expanded: keep current `ml-auto` pill.
  - Collapsed: render a small dot (`h-2 w-2 rounded-full bg-destructive`) positioned `absolute top-1.5 right-1.5` — no number, so it can't overflow the icon.
- Sidebar header row: when collapsed, keep just the centered Menu toggle (already ok, verify no stray padding).
- Footer Collapse button: apply same conditional centering so the chevron sits in the middle of the rail.

## Non-goals

- No changes to menu structure, access filtering, routes, unread count query, or notification navigation.
- No token / theme changes.
- No changes outside `AppSidebar.tsx`.

## Verify

Screenshot expanded + collapsed states via Playwright; icons centered on the rail, badge no longer covering the notifications icon, Costing shows the rupee icon.
