# Revise Dashboard to cover OA, BOQ, and PI

## Goal
The dashboard at `/` (`src/pages/Index.tsx`) currently only shows Order Acceptance (OA) data. Revise it so all three modules — **OA, BOQ, PI** — are reflected in stats, value, splits, recent activity, and quick actions.

## Layout

```text
┌─────────────────────────────────────────────────────────────┐
│ Header: Dashboard  +  [View OAs] [View BOQs] [View PIs]     │
│                      [+ New OA]                             │
├─────────────────────────────────────────────────────────────┤
│ HERO STRIP                                                  │
│ ┌──────────────────────────┐ ┌──────────────────────────┐   │
│ │ Total OA Value (₹)       │ │ Total PI Value (₹)       │   │
│ │ + finalized/draft counts │ │ + finalized/draft counts │   │
│ │ MR/GMS split bar         │ │ MR/GMS split bar         │   │
│ └──────────────────────────┘ └──────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│ MODULE STAT TILES (3 rows × 4 cols, grouped & color-coded)  │
│ OA  : Total · This Month · Drafts · Finalized               │
│ BOQ : Total · This Month · Current Revs · Total Items       │
│ PI  : Total · This Month · Drafts · Finalized               │
├─────────────────────────────────────────────────────────────┤
│ Quick actions: Upload Cost Sheet · New Blank OA ·           │
│                Browse BOQs · Browse PIs                     │
├─────────────────────────────────────────────────────────────┤
│ RECENT ACTIVITY (tabbed)                                    │
│ [ Recent OAs | Recent BOQs | Recent PIs ]                   │
│ Top 5 of selected, link rows to their editor                │
└─────────────────────────────────────────────────────────────┘
```

## Data fetching

Inside `useEffect`, fire three parallel queries and join in state:

```ts
const [ordersRes, boqsRes, pisRes] = await Promise.all([
  supabase.from("orders").select("*").order("created_at", { ascending: false }),
  supabase.from("boqs").select("*").order("created_at", { ascending: false }),
  supabase.from("proforma_invoices").select("*").order("created_at", { ascending: false }),
]);
```

Filter `is_current === true` for the headline counts/values, but keep the unfiltered arrays for "recent activity" lists.

## Computed stats per module

Compute in a single `useMemo`:

- **OA**: total, drafts, finalized, thisMonth, mrCount, gmsCount, totalValue (sum of `totals.net_payable` over current).
- **BOQ**: total, currentRevs (rows with `is_current`), thisMonth, totalLineItems (sum `line_items.length`), mrCount, gmsCount.
- **PI**: total, drafts, finalized, thisMonth, mrCount, gmsCount, totalValue (sum `totals.net_payable`).

## Hero strip (top)

Two side-by-side gradient cards:
- **Total OA Value** (existing card, restyled to half-width).
- **Total PI Value** (new, mirrored card with PI counts and MR/GMS split).

## Stat tiles section

Reuse existing `StatTile` with a new optional `tone` prop ("oa" | "boq" | "pi") that picks a soft tinted background and icon color so each row is visually grouped. Section heading per row (`Order Acceptances`, `BOQs`, `Proforma Invoices`) with a small "View all →" link to the corresponding list page.

## Quick actions

Update the 3-card row to a 4-card row:
1. Upload Cost Sheet (AI) → `/orders/new`
2. New Blank OA → `/orders/new/edit`
3. Browse BOQs → `/boqs`
4. Browse PIs → `/pi`

## Recent activity

Replace single "Recent orders" list with a `Tabs` (shadcn) component with three tabs: **Recent OAs**, **Recent BOQs**, **Recent PIs**. Each tab renders the existing list-item style:
- OA row: oa_number · format · company · date · ₹ net_payable · status.
- BOQ row: boq_number · format · ref OA · date · status (no monetary value).
- PI row: pi_number · format · ref OA · customer · date · ₹ net_payable · status.

Each row links to its respective editor (`/orders/:id`, `/boqs/:id`, `/pi/:id`).

Empty-state per tab with a CTA pointing to the right "new" path.

## Files

- Edit `src/pages/Index.tsx` only. Add type imports `BoqRecord` from `@/lib/boq/types` and `PiRecord` from `@/lib/pi/types`. Use shadcn `Tabs` (already available).

## Out of scope

- No charts/graphs library — keep the lightweight progress-bar visualization for splits.
- No new routes, schema changes, or backend work.
- No changes to the sidebar.
