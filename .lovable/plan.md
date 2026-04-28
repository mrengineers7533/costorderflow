## UI Redesign — ClickUp-style, Orange & White

Goal: refresh the visual layer of the app to match the attached reference (clean white canvas, sleek left sidebar with icon nav, soft rounded cards, subtle borders, colored chips). All existing logic, routes, data flow, calculations, PDF output, and form features remain untouched.

### Visual direction

- Color theme: white canvas (`#FFFFFF` / `#FAFAFB`), orange primary `hsl(24 95% 53%)` reserved for CTAs, active nav, key accents only. Neutral text gray for body. No theme color changes — current orange/white tokens already match.
- Typography: keep system font, tighten weights (semibold for headers, medium for nav, regular for body), slightly smaller base where dense.
- Surfaces: white cards, `border-border` 1px, `rounded-xl`, soft shadow on hover only. Generous padding (p-5/p-6).
- Iconography: keep lucide icons; nav icons in muted gray, active icon in orange.
- Chips/badges: soft pastel backgrounds (orange-50, gray-50) with colored dot prefix where useful.

### Scope of changes (UI only)

1. **Sidebar (`AppSidebar.tsx`)**
   - Add app logo block at the top (replaces current logo placement on pages).
   - Reorganize nav into two groups with labels: "Main" (Home, Orders, New OA) and "Workspace" (placeholder pass-through — only existing routes; no new routes added).
   - Active item: orange-tinted background `bg-primary/10`, orange text + icon, left accent bar.
   - Inactive: muted gray icon, hover `bg-muted/60`.
   - Slightly wider sidebar, white background, right border only.

2. **Top header (`AppLayout.tsx`)**
   - Taller (h-14), white with bottom border, holds the sidebar trigger and a right-aligned slot (page title placeholder + space for a "mentions"-style chip if needed later — purely visual, no new functionality).

3. **Home (`src/pages/Index.tsx`)**
   - Remove the duplicate top header (logo now in sidebar).
   - Page title row: "Dashboard" + subtitle.
   - Stats row: redesigned `StatCard` — larger number, label above, soft icon tile in orange-50.
   - Quick actions: redesigned `FeatureCard` — bigger icon tile, clearer hover lift, primary card uses solid orange tile + white icon.
   - Recent orders list: keep table data; restyle rows with more breathing room, status chip with dot, monospaced OA number in subtle pill.
   - "How it works" steps: numbered circles in orange, cleaner card.

4. **Orders list (`OrdersList.tsx`)**
   - Remove inline logo/home button (sidebar handles nav).
   - Page header row: title + "+ New Order" button (orange).
   - Card with cleaner table: zebra-free, hover row highlight, status pill with dot, right-aligned amount in tabular numerals.

5. **Order editor (`OrderEditor.tsx`)**
   - Remove inline logo/back-home buttons from page top (sidebar handles nav). Keep "Back to Orders" link.
   - Sticky page header: OA number + format pill on left, action buttons (Save / Download PDF) on right with consistent orange primary + outline secondary styling.
   - Section cards get the new card treatment (rounded-xl, subtle border, p-6, section title with small icon). No structural reordering, no field changes.
   - Inputs: keep shadcn `Input`/`Select`/`Switch` — only adjust container spacing and labels (uppercase tracking-wide muted label) for a more polished form feel.
   - Right-side preview column: unchanged content, lifted into a cleaner sticky card.

6. **Global tokens (`src/index.css`)**
   - Soften `--background` to pure white, `--muted` to a slightly cooler off-white, tweak `--border` for crisper hairlines. Keep orange primary identical so PDFs/branding stay consistent. Dark theme tokens left as-is.
   - Add a `--radius` bump to `0.75rem` for the new rounded-xl feel.

### Out of scope (explicitly unchanged)

- All business logic in `src/lib/orders/*` (calc, pdf, types, defaults).
- Supabase queries, parse-cost-sheet edge function, data shapes.
- OrderPreview content & PDF output (visual print layout untouched).
- Routes in `App.tsx`.
- Form fields, validation, charges logic, format detection, GMS/MR rules.

### Files to edit

- `src/index.css` — token polish + radius
- `src/components/AppLayout.tsx` — header refresh
- `src/components/AppSidebar.tsx` — logo + grouped nav + active styles
- `src/pages/Index.tsx` — remove duplicate header, restyle cards/stats/list
- `src/pages/orders/OrdersList.tsx` — remove inline header, restyle table card
- `src/pages/orders/OrderEditor.tsx` — restyle page header + section cards (no field/logic edits)

### Acceptance

- Every feature works exactly as before (parse cost sheet, save, PDF download, format auto-detect, GMS/MR splits, charges).
- Look matches reference: white canvas, orange accents only on active nav / primary buttons / key icon tiles, generous spacing, rounded-xl cards, sleek sidebar.
