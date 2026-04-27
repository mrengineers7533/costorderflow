## Update GMS Head Office address

Replace the GMS HEAD OFFICE address shown in the exported PDF (and live preview, which reads the same constant) with the new Noida address.

### Change
**File:** `src/lib/orders/defaults.ts`

Update `GMS_HEAD_OFFICE_LINES` to:
```ts
export const GMS_HEAD_OFFICE_LINES = [
  "C-27, C-Block, Ground Floor, Trapezoid IT Park",
  "Sector-62, Noida",
  "Pin- 201309",
  "Uttar Pradesh, INDIA",
  "info@gmsdelhi.com",
];
```

### Effect
- GMS PDF export footer (`src/lib/orders/pdf.ts` → `drawFooterBlock`) will render the new address.
- GMS live preview (`OrderPreview.tsx`) will also reflect it since both consume the same constant.
- Bank details, terms, and MR template are unchanged.

Note: The old address contained `Tel : +91 0120-4567202/03`. Your new address has no phone number, so it will be omitted. Let me know if you'd like a phone line added.