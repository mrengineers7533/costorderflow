# Make Uploaded PDF the Default MR Header & Footer

The uploaded `MROA/2026-27/0001` PDF will become the canonical reference for MR Engineers PDF generation. The current MR header and footer in `src/lib/orders/pdf.ts` (and supporting constants) will be updated to match it exactly.

## What will change

### 1. MR Header (top of every MR PDF)

Currently the header shows:
- "MR ENGINEERS PVT. LTD." 
- "Plot No. 7, Sector-3, IMT Manesar, Gurgaon..."
- "GSTIN: 06AABCM3429K1ZP | +91-124-4374444 | info@mrengineers.com"

It will be replaced with the exact template branding:
- Left side: existing MR logo (kept, sized to match reference ~60mm wide)
- Right side, right-aligned, bold large: **"M.R. Engineers"**
- Below it (smaller): `* ENGINEERS    * CONTRACTORS    * SUPPLIERS`
- Below that: `Shed No. 33, HSIIDC, Murthal, Sonepat.`
- Below that: `GSTIN-06AARPM1849G1ZF`
- Thin orange accent rule beneath the header band (kept)

No phone/email line in the header (the reference template doesn't have one — corresponding info moves to the footer band).

### 2. MR Footer (bottom band on MR PDFs)

The yellow "PLEASE DO ALL CORRESPONDENCE..." strip will be updated to:
- A small right-aligned **"M.R. ENGINEERS"** label sitting just above the yellow strip (matches reference)
- The yellow strip text becomes:
  `PLEASE DO ALL CORRESPONDENCE AND SEND PAYMENTS AT C-27, C-BLOCK, GROUND FLOOR, TRAPEZOID IT PARK, SECTOR-62, NOIDA, PIN- 201309`
  (Already matches — confirmed correct in `defaults.ts`.)

### 3. Constant updates in `src/lib/orders/defaults.ts`

No changes needed to `MR_FOOTER_ADDRESS` (already matches).
No bank changes needed (`DEFAULT_MR_BANK` already matches: AXIS BANK / NOIDA / 0001568288 / UTIB0005147).

### 4. Constant updates in `src/lib/orders/pdf.ts`

The `COMPANY_MR` constant will be replaced with:
```ts
const COMPANY_MR = {
  name: "M.R. Engineers",
  tagline: "* ENGINEERS    * CONTRACTORS    * SUPPLIERS",
  address: "Shed No. 33, HSIIDC, Murthal, Sonepat.",
  gstin: "06AARPM1849G1ZF",
};
```
The header rendering block for MR will be rewritten to draw these four lines right-aligned next to the logo, matching the reference layout.

A small "M.R. ENGINEERS" label will be added directly above the yellow footer band on the right side.

## Out of scope

- GMS header/footer (untouched).
- Template-PDF overlay system (`src/lib/orders/templatePdf.ts` and Templates page) — that uses a different uploaded-PDF approach and isn't affected.
- The data inside the uploaded PDF (Geofast order itself) is not being imported as an order — only the header/footer styling is being adopted.

## Files to edit

- `src/lib/orders/pdf.ts` — replace `COMPANY_MR` and rewrite the MR header drawing block; add small "M.R. ENGINEERS" label above the footer strip.
