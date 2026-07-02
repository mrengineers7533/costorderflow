Change the sidebar header text from "MR Engineers" to "Cost Order Flow" and refine the header alignment so it visually matches the sticky page header. Also ensure the collapsed sidebar icons and toggle stay clean and centered.

### What will change
- **Text:** Replace the sidebar brand text with "Cost Order Flow".
- **Alignment:** Make the sidebar header use the same height (`h-14`) and left/right padding as the top page header (`px-5`), so the text baselines line up when the sidebar is expanded.
- **Collapsed state:** Keep the hamburger toggle centered when the sidebar is collapsed; hide the text label as today.
- **Icons:** No icon list changes, only minor spacing tweaks in the header so the menu button and brand text sit on the same optical line.

### Files to change
- `src/components/AppSidebar.tsx` — header text and alignment/padding.
- No changes to business logic, routing, access, notifications, sidebar menu items, or icon imports.

### Verification
- Preview the sidebar in both expanded and collapsed states.
- Confirm "Cost Order Flow" is visible and aligned with the page header title.
- Confirm no icon overlap or label truncation in collapsed mode.