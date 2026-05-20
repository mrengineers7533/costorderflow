## Update Client Copy Make labels

Set the `make_label` field on the four summarized Client Copy rows in `src/lib/orders/clientCopy.ts` so the "Make" column displays the correct value per group.

### Change

In `buildClientCopyItems`, when constructing the summarized rows, attach a fixed `make_label` per group:

- `MHE` (Material Handling Equipments) → `"M.R. Engg"`
- `SPOUTING` (Spouting, Aspiration Ducting & Pneumatic Manifold) → `"M.R. Engg"`
- `FAN` (Centrifugal Fans (Ferrari)) → `"Ferrari"`
- `MAGNET` (Magnets (J. K.)) → `"J. K."`

Implementation: add a `GROUP_MAKE: Record<GroupKey, string>` map next to `GROUP_LABEL`, and include `make_label: GROUP_MAKE[g]` in the synthesized line item returned by the `FIXED_ORDER.map(...)` block.

### Scope guard

- Only `src/lib/orders/clientCopy.ts` is touched.
- No changes to grouping logic, totals, qty/rate math, passthrough items, ordering, PDF/Excel renderers, or any OA/BOQ/PI calculations.
- Non-grouped passthrough items keep their original `make_label` unchanged.
