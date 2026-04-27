## Goal
Replace the small Sparkles icon + "Order Acceptance" text in the app's header with the uploaded merged **GMS | MR Engineers** logo, and increase the header height so the logo fits comfortably.

### 1. Add the logo asset
- Copy `user-uploads://MR_GMS_Merge_Logo.pptx_1.png` → `src/assets/app-logo.png`.

### 2. Update the home page header (`src/pages/Index.tsx`)
- Import: `import appLogo from "@/assets/app-logo.png";`
- Increase header height: `h-14` → `h-20` so the logo has breathing room.
- Replace the current brand block (Sparkles icon + "Order Acceptance" text) with:
  ```tsx
  <Link to="/" className="flex items-center">
    <img src={appLogo} alt="GMS | MR Engineers" className="h-14 w-auto object-contain" />
  </Link>
  ```
- Remove the now-unused `Sparkles` import.
- Keep right-side nav (`Home`, `Orders`, `Templates`, `New OA`) unchanged.

### 3. Add the same logo to other pages' top bars (for consistency)
On `OrdersList.tsx`, `TemplatesPage.tsx`, and `OrderEditor.tsx`:
- Add a small clickable logo (`h-10 w-auto`) to the left of the existing "Home" button, linked to `/`.
- Keep existing titles and back buttons intact.

### 4. Out of scope
- PDF logos (MR / GMS templates) remain untouched — this is purely the app UI.
- No theme, routing, or data changes.

### Files to edit
- `src/assets/app-logo.png` *(new — copied from upload)*
- `src/pages/Index.tsx`
- `src/pages/orders/OrdersList.tsx`
- `src/pages/orders/TemplatesPage.tsx`
- `src/pages/orders/OrderEditor.tsx`
