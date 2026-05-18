Plan: Improve BOQ page navigation buttons

## What to build

### 1. Top Quick Action Buttons
Add a row of quick-action buttons just below the BOQ header bar on `BoqEditor.tsx`:
- **Print View** — triggers `window.print()`
- **Create Design Comment Link** — smooth-scrolls to the Design Review panel where the actual button lives, OR directly generates it
- **Create Design Approval Link** — same as above

### 2. Bottom "Go to Top" Button
Add a "Go to Top" button next to the existing Print / Download PDF buttons at the bottom of the Live Preview section. It smooth-scrolls the page back to the top.

### 3. Technical approach

**Top buttons (in BoqEditor):**
- Print View: simple `window.print()` call.
- Comment / Approval links: add an `id="design-review-panel"` to the `DesignReviewPanel` root `<Card>`, and have the top buttons call `document.getElementById("design-review-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })`. This satisfies "directly go to/create" by immediately bringing the user to the panel where they can click the existing generate buttons.
- Alternatively, we can directly generate by exposing imperative handles from `DesignReviewPanel`. Given complexity, scrolling is simplest and cleanest.

**Bottom button (in BoqEditor):**
- Add to the existing button row in the Live Preview section (around line 478).
- `window.scrollTo({ top: 0, behavior: "smooth" })`.
- Icon: `ArrowUp` from lucide-react.

### 4. Files to change
- `src/pages/boqs/BoqEditor.tsx` — add top quick action buttons, add bottom "Go to Top" button, import `ArrowUp`.
- `src/components/boqs/DesignReviewPanel.tsx` — add `id="design-review-panel"` to root Card.

### 5. Constraints
- Do not change existing BOQ data, calculations, OA sync, revision logic, or permissions.
- Do not remove existing buttons.
- Only add shortcut buttons for better navigation.