## Goal

Turn the global search (⌘K) into an "everything" search. Right now it only finds OAs and a couple of hard-coded pages. Make it also search app features, settings, actions, and contextual jumps inside an OA — so typing things like "GST", "freight", "preview", "Turkey", "draft", "MR", "logout", "bank details" all surface useful results.

## What gets searchable

Three groups, all matched via Fuse.js with the existing fuzzy ranking:

1. **Orders** (existing) — OA number, company, reference, cost sheet no., line-item descriptions, HSN.
2. **Pages & navigation**
   - Dashboard, All Orders, New OA, Manual OA, Upload Cost Sheet (AI), Drafts, Finalized.
   - Filters: "MR orders", "GMS orders", "Recent orders".
3. **App features / actions** — a static catalog with rich keywords so fuzzy search hits them:
   - New OA (manual) — keywords: blank, manual, create, new
   - New OA from cost sheet — keywords: AI, PDF, upload, parse, extract
   - Download PDF (when on an order) — keywords: export, pdf, print
   - Toggle GST / P&F / Freight / Insurance / Discount
   - Switch format MR ↔ GMS
   - GMS modes: EXW Turkey, EXW Murthal — keywords: import, sea freight, custom, landed cost
   - Bank details, Terms & conditions
   - Add line item, Split by make
   - Theme/sidebar collapse (if present)
   - Sign out (if auth present)

Each entry has: `title`, `subtitle`, `keywords[]`, `icon`, `group`, and either a `path` to navigate to or an `action` callback (e.g. open new-from-AI flow). Order-context actions (Download PDF, toggle GST) only appear when the user is on an order route.

## UX

Single ⌘K dialog, grouped results in this order:
- **Suggested** (top 3 mixed best matches across all groups)
- **Pages**
- **Actions**
- **Orders** (top 8)

Empty query shows: Pages + top Actions + 5 recent orders.
Each result shows icon, title, subtitle, and a small group badge on the right ("Page", "Action", "Order").

Keyboard: arrow keys, Enter to run, Esc to close. ⌘K toggles. Recent picks (last 5) persisted in `localStorage` and shown above Suggested when query is empty.

## Technical plan

Files to change/create:

- **`src/lib/search/catalog.ts`** (new) — exports `getStaticEntries(ctx)` returning the Pages + Actions array. `ctx` includes `currentOrderId` so order-only actions can be conditionally included. Each entry: `{ id, kind: "page"|"action", title, subtitle, keywords, icon, run: (nav) => void }`.

- **`src/components/GlobalSearch.tsx`** (edit) — 
  - Build a unified Fuse index combining static entries + indexed orders. Use a discriminator field `kind` so we can render groups.
  - Tweak Fuse keys: add `title` (0.35), `subtitle` (0.10), `keywords` (0.25) for static entries; keep existing keys for orders.
  - Reuse current substring-boost logic only for order rows.
  - Add `useLocation()` to detect current order id (`/orders/:id`) and pass into the catalog.
  - Add `recentIds` localStorage helper (read on open, write on select).
  - Render four `CommandGroup`s as listed above. Use `value={entry.id}` to bypass cmdk filtering (we already filter via Fuse).

- **No DB or schema changes.** Order-context actions like "Download PDF" navigate to the order route with a query flag (e.g. `?action=download`); `OrderEditor` reads it on mount and triggers the existing `generateOrderPDF` flow, then strips the param. Toggles like "Enable GST" do the same with `?toggle=gst`.

- **`src/pages/orders/OrderEditor.tsx`** (edit) — small `useEffect` that reads `?action=` / `?toggle=` from `useLocation`, dispatches the matching handler (download PDF, flip a charges switch), then `navigate(pathname, { replace: true })` to clean the URL.

- **`src/test/searchExamples.test.ts`** (edit) — add cases: "gst" → Toggle GST action ranks #1; "turkey" → EXW Turkey action ranks above any order; "new oa" → Manual OA page #1; "upload" → Upload Cost Sheet (AI) #1; existing OA cases still pass.

## Out of scope

- Server-side search across all users.
- Search history sync across devices.
- Searching inside PDF cost sheets.
