## Goal

On the **Order Acceptances** list (`/orders`), split the current single **"Docs"** column into two distinct columns — one for **BOQ** badges and one for **PI** badges — so users can scan each document type independently.

## What the user will see

Replace the single `Docs` column with two separate columns, each rendering only its own badge (or a faint `—` when none exists):

```text
| OA Number | Rev | Format | Company | Date | Net | Status   | BOQ      | PI       | Actions |
| OA-0004   | R0  | GMS    | Acme    | …    | ₹X  | finalized| —        | [PI ×4]  |  ⋯      |
| SANJEEV   | R0  | MR     | Beta    | …    | ₹Y  | draft    | [BOQ ×2] | [PI]     |  ⋯      |
| OA-0001   | R0  | MR     | Gamma   | …    | ₹Z  | draft    | —        | —        |  ⋯      |
```

- **BOQ column**: shows the secondary-styled `BOQ` badge with `ClipboardList` icon and count suffix (`×N` if >1). Click → `/boqs`.
- **PI column**: shows the primary-tinted `PI` badge with `Receipt` icon and count suffix. Click → `/pi`.
- Both cells use `stopPropagation` on click so row navigation isn't triggered.
- Empty state in each column is a muted dash so the columns never look broken.

## Technical plan

**File:** `src/pages/orders/OrdersList.tsx`

1. Replace the single `<TableHead>Docs</TableHead>` with two heads: `<TableHead>BOQ</TableHead>` and `<TableHead>PI</TableHead>` (kept between Status and Actions).
2. Replace the single `<TableCell>` containing `<DocsBadges />` with two adjacent cells, each with `onClick={(e) => e.stopPropagation()}`:
   - First cell renders just the BOQ badge (or `—`)
   - Second cell renders just the PI badge (or `—`)
3. Refactor the inline `DocsBadges` component into two small components — `BoqBadge` and `PiBadge` — each taking a `count` prop and returning either the badge `<Link>` or the muted dash. Reuses existing `ClipboardList` / `Receipt` icons and the same color scheme already in place.
4. No data-fetching changes — `boqCounts` and `piCounts` state already exist and continue to power the new cells.

## Out of scope

- No DB changes, no new queries, no schema changes.
- No filtering by "has BOQ" / "has PI".
- No dashboard "Recent OAs" changes.
