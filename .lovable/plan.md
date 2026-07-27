## Diagnosis (confirmed by reading the code)

The page isn't "auto-scrolling" — it is re-rendering and re-fetching in a loop, and every loop re-lays-out the wide table, which makes the page jump vertically and shift horizontally as the scrollbar appears/disappears.

Two confirmed infinite-loop paths:

1. **`useItemAttachments` re-fires every render** (`src/components/boqs/BoqItemAttachmentsView.tsx:106-122`). Its effect depends on the `items` array, and `RequisitionDetail.tsx:116-119` passes a freshly built `items.map(...)` array on every render. The effect always calls `setMap(...)` with a brand-new `Map`, which re-renders, which builds a new array, which re-fires the effect → endless render/fetch loop.

2. **`ModuleNotifications` reloads every render** (`src/components/notifications/ModuleNotifications.tsx:86-92, 267-277`). `mergedLinks` is memoized on the `links` prop, but `RequisitionDetail.tsx:315-323` passes an inline object literal, so `mergedLinks` is new each render, `load` (a `useCallback` with `mergedLinks` in its deps) is new each render, and `useEffect(() => load(), [load])` runs on every render → constant refetch + state churn.

Layout amplifiers: no `scrollbar-gutter` on the page shell, the app has no `overflow-x` guard on `html/body`, and the 14-column Generated table uses auto layout so column widths recompute on every one of those re-renders.

## Fixes

### 1. Break the attachment-hook loop
- In `BoqItemAttachmentsView.tsx`, key the effect off a stable string signature of the items (id + description + model_number) instead of the array identity, and skip `setMap` when the result is equivalent to the current state (avoid setting a new empty `Map` when it is already empty).
- In `RequisitionDetail.tsx`, memoize the array passed to `useItemAttachments` with `useMemo` over `items`.

### 2. Break the notifications loop
- In `ModuleNotifications.tsx`, memoize `mergedLinks` on the stringified link signature rather than the `links` object identity, and drive the `load` callback + its effect from the primitive `modsKey`/`linksKey`/`limit`/`hasAnyLink` values only (drop the object from the dep list).
- In `RequisitionDetail.tsx`, memoize the `links` object passed to `ModuleNotifications`.

### 3. Remove residual layout shift / horizontal page movement
- Add `html, body { overflow-x: hidden; }` and `scrollbar-gutter: stable` on the scrolling shell in `src/index.css`, so the vertical scrollbar appearing never shifts content left/right.
- Ensure the app `main` container in `AppLayout.tsx` cannot overflow horizontally (`min-w-0` is present; add `overflow-x-clip` on the shell only, never on the table wrapper).
- Wrap the Generated / Raw Materials tables in a stable container: `relative w-full max-w-full overflow-x-auto overflow-y-visible`, with the table given a stable `min-width` so wide content scrolls **inside** the container only.
- Give the tables fixed layout with explicit column widths so widths don't re-compute when late data (price, vendor, attachments) lands.
- Keep the existing reserved-height wrapper for the async banners and the existing `[overflow-anchor:none]`, and render the loading/not-found states inside the same container shell so first paint and loaded paint have identical geometry.

### 4. No auto-focus / auto-scroll
Verified there are no `scrollIntoView`, `window.scrollTo`, or `autoFocus` calls on this page; nothing to remove. The Lot `Input` and Status `Select` stay uncontrolled/controlled exactly as they are — only the surrounding re-render churn goes away, which is what made clicking them appear to move the page.

## Explicitly unchanged

Price and Vendor columns stay exactly as they are on the Requisition detail page and in every downstream view (Annexure, Purchase Planning, Purchase Material, PO create, GRN). No changes to Order, PI, Design, Manufacturing, Purchase, BOQ revision, requisition/quantity/price calculations, vendor selection, status workflow, approvals, notification content, PDFs, numbering, or permissions.

## Technical notes

- Files touched: `src/pages/requisitions/RequisitionDetail.tsx`, `src/components/boqs/BoqItemAttachmentsView.tsx`, `src/components/notifications/ModuleNotifications.tsx`, `src/index.css`, and a small shell tweak in `src/components/AppLayout.tsx`.
- No database migration.
- Verification: typecheck, then drive the page in a headless browser to confirm the network requests for attachments/notifications fire once (not continuously) and that `document.scrollingElement.scrollLeft` stays at 0 while the table scrolls internally.
