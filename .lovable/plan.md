## Problem

The homepage repeats the same actions in multiple places, making it feel cluttered:

- "Upload cost sheet" — appears in hero AND in Quick actions grid (both link to `/orders/new`)
- "Start blank order" / "New blank order" — appears in hero AND in Quick actions grid (both link to `/orders/new`, and both are actually the same destination as "Upload cost sheet")
- "View all orders" — appears in hero, in Quick actions grid, in the Recent orders header link, AND in the top nav
- "Templates" — appears in top nav AND in Quick actions grid

The hero and the Quick actions grid are essentially showing the same four buttons twice.

## Fix

Keep the hero as the single primary call-to-action area, and remove the redundant Quick actions grid entirely. The top nav already covers Orders / Templates / New OA, and the hero covers the primary upload flow.

### Changes to `src/pages/Index.tsx`

1. **Simplify the hero buttons** to one clear primary CTA:
   - Keep: `Upload cost sheet` (primary, → `/orders/new`)
   - Remove: `Start blank order` (same route, redundant)
   - Remove: `View all orders` (already in nav and in Recent-orders section header)

2. **Remove the entire "Quick actions" section** (the 4-card grid). Every destination it offers is already reachable from the top nav or the hero:
   - Upload cost sheet → hero
   - New blank order → hero / nav "New OA"
   - All orders → nav "Orders" + Recent orders section
   - Templates → nav "Templates"

3. **Clean up unused imports** in `Index.tsx` (`LayoutTemplate`, `FilePlus2` if no longer used in body, and the `FeatureCard` helper component).

### Result

Homepage flow becomes: Header nav → Hero (one CTA) → Stats → Recent orders → How it works. No button or link is repeated across sections.
