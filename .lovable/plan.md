## Goal
Make the sidebar icons feel more premium and visually polished — without changing layout, colors theme, or navigation behavior.

## Visual changes (sidebar only)

For each nav item (main + footer) in `src/components/AppSidebar.tsx`:

1. **Icon tile wrapper**
   - Wrap each `<item.icon />` in a small rounded square (`h-8 w-8 rounded-lg flex items-center justify-center shrink-0`).
   - **Inactive**: soft tinted background `bg-primary/10 text-primary` (orange tint on white) so icons stand out instead of looking gray.
   - **Hover** (inactive): `group-hover:bg-primary/15` + slight `group-hover:scale-105` for a subtle lift.
   - **Active**: tile becomes `bg-white/20 text-white` so the icon reads cleanly on the orange pill background, with `shadow-sm` inside the tile for depth.

2. **Icon styling**
   - Use `strokeWidth={2}` consistently (drop the active 2.4 / inactive 1.8 jitter — it currently makes icons feel inconsistent in weight).
   - Slightly larger icon: `h-[18px] w-[18px]` stays, but inside the tile it now has breathing room.
   - Add `transition-all duration-200` on the tile for smooth hover/active transitions.

3. **Active pill refinement**
   - Keep the orange pill, but soften shadow from `shadow-md` to `shadow-sm shadow-primary/30` for a more modern feel.
   - Add a thin left accent: `before:content-[''] before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:bg-white/60` only on active (gives a refined indicator).
   - Make the menu button `relative` so the `before` pseudo-element anchors correctly.

4. **Icon swap (one upgrade)**
   - Replace `Receipt` (Proforma Invoices) with `FileSpreadsheet` — reads better as an invoice/document with line items and pairs more nicely with the other doc icons (`FileText`, `ClipboardList`).
   - Keep all other icons (`LayoutDashboard`, `FileText`, `ClipboardList`, `HelpCircle`, `Settings`).

5. **Collapsed state**
   - When the sidebar is collapsed, the icon tile becomes the focal point (center-aligned, no label). The tinted tile makes collapsed mode look intentional rather than empty.
   - Center the tile inside the button when `collapsed` is true (`justify-center`).

6. **Footer separator polish**
   - Tiny touch: change the footer top border from solid to `border-dashed border-sidebar-border` so the footer feels distinct from main nav without a hard line.

## Files to edit
- `src/components/AppSidebar.tsx` — only file changed. No CSS variables or theme changes; everything uses existing `--primary` / `--sidebar-*` tokens so dark mode keeps working.

## Out of scope
- No route changes, no behavior changes, no layout shift.
- No changes to `AppLayout.tsx`, `index.css`, or any other file.
