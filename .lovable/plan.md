## Goal
In the OA PDF (preview/download/print), remove the "Format" and "Status" fields from the header meta box. Only 4 fields should remain — matching the attached screenshot layout.

## Current state
`src/lib/orders/pdf.ts` (lines 150–174) renders a 2-column meta box:
- Left column: OA Number, Date, Reference (3 rows)
- Right column: Prepared By, Format, Status (3 rows)

## Change
Rearrange to a 2×2 layout (4 fields total), matching the screenshot:

```text
| OA No.: MROA/2024-25/0220                    | Dated: 09-01-2025          |
| Ref. NO.: Cost Sheet GMS/OFF/23-24/076/...   | Prepared By- Shubham Kumar |
```

Implementation in `src/lib/orders/pdf.ts`:
- `metaLeft` → `[OA Number, Reference]`
- `metaRight` → `[Date, Prepared By]`
- Remove `Format` and `Status` rows entirely
- Adjust `y += 18` → `y += 13` (2 rows instead of 3)

## Scope guard
- Only edit the OA PDF meta-box rendering. Do not touch BOQ, PI, Excel exports, totals, calculations, or any other layout.
- PI PDF reuses `generateOrderPDF` with its own `docMeta` overrides — it already overrides the number/ref labels and is unaffected by removing Format/Status (those fields aren't overridden, just dropped for everyone). Confirmed acceptable since user request is global to OA-style header.
- No DB / RLS / functionality changes.

## Files touched
- `src/lib/orders/pdf.ts` (header meta block only)