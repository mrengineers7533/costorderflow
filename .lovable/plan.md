# Add MR Engineers Logo to Template

## Context
- The MR preview header (`MRHeader` in `src/components/orders/OrderPreview.tsx`) already imports `@/assets/mr-logo.png`.
- The exported PDF (`src/lib/orders/pdf.ts`) currently renders only a plain orange/blue band with the company name — no logo image.
- User uploaded `MR_Engineers_Fin1_Logo.png` to be used as the official MR logo.

## Changes

### 1. Replace the logo asset
- Copy `user-uploads://MR_Engineers_Fin1_Logo.png` → `src/assets/mr-logo.png` (overwrite).
- This automatically updates the on-screen MR preview header, since `OrderPreview.tsx` already imports that path. No code change needed there.

### 2. Embed the logo in the exported MR PDF (`src/lib/orders/pdf.ts`)
- Import the logo: `import mrLogoUrl from "@/assets/mr-logo.png";`
- Add a small async helper `loadImageDataUrl(url)` that fetches the asset and converts it to a base64 data URL (so jsPDF's `addImage` can embed it).
- Make `generateOrderPDF` async (or pre-load the image before constructing the doc) and, when `order.format === "MR"`:
  - Increase header band height slightly (e.g. 22 → 26 mm) to accommodate the logo.
  - Call `doc.addImage(dataUrl, "PNG", M, 3, 20, 20)` to place the logo on the left of the orange header band.
  - Shift the company name / address / GSTIN text to the right of the logo (e.g. start text at `M + 24` instead of `M`).
- Update callers of `generateOrderPDF` (in `src/pages/orders/OrderEditor.tsx`) to `await` the new async signature.
- GMS format remains unchanged (no logo).

### 3. No DB / template-PDF changes
- The uploaded background-template flow (`templatePdf.ts`) already lets users place fields on a user-supplied PDF, so it does not need the logo embedded.

## Acceptance
- The MR preview at `/orders/new` shows the new gear+circuit logo in the header.
- Exporting an MR PDF includes the same logo in the top-left of the orange header band, with company text properly aligned next to it.
- GMS preview/PDF are visually unchanged.
