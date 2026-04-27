# Make Uploaded PDF the Default GMS Header & Footer

The uploaded `26-27/GMS/UGUR-002` PDF will become the canonical template for GMS Order Acceptance PDFs. All GMS-format PDFs will adopt its dual-logo header (GMS + Uğur), the customer/meta block layout, the unified items+totals table, and the head-office / bank-details footer block. The header will repeat on every page.

## What will change

### 1. New asset: Uğur logo

Save the uploaded `Picture1.jpg` into the project as `src/assets/ugur-logo.png` so it can be imported and embedded in GMS PDFs.

### 2. GMS Header (top of every GMS page)

Replace the current single-logo GMS header with the template's dual-logo banner:

- **Left block**: existing GMS logo + bold caption `GRAIN MILLING SOLUTIONS PRIVATE LIMITED` underneath
- **Right block**: new Uğur logo + bold caption `UGUR MACHINE, TURKEY` underneath, with a small italic line `Quality Standard is an Assurance of UGUR at all parts`
- A grey title bar `ORDER ACCEPTANCE` (centered, bold, light-grey fill) immediately under the header — matching the reference

This header (logos + captions + grey ORDER ACCEPTANCE bar) will be drawn on **every page** of the GMS PDF, not just page 1, by hooking into jsPDF-autotable's `didDrawPage` callback.

### 3. GMS Customer/Meta block (first page only)

Below the header, render a two-column block:

- **Left**: Bill-To name, address, contact person, mobile, email, GSTIN + state code
- **Right** (right-aligned): Date, OA No., Ref., Contact (Mr. Bhavesh Makin), Mob, Prepared By

This replaces the current generic "Bill To / Ship To" boxes for GMS only. (MR layout stays as-is.)

### 4. GMS Items + Totals table

Rebuild to match the reference columns exactly:

`ITEM NO | MODEL NUMBER | DESCRIPTION | HSN CODE | QTY | UNIT | UNIT PRICE (INR) | AMOUNT (INR)`

Header style: light-grey fill, black text, bold, centered, black borders. Body: black borders, left-aligned description, right-aligned numerics.

Totals rows are appended inside the same table (right-aligned label spanning the first 7 columns, value in the Amount column), in order: Ex-works Murthal Price, Discount (if any), After Discount, P&F (if any), Insurance (if any), Freight (if any), GST @ x%, **Grand Total** (bold).

### 5. GMS Footer block (last page)

Two-column block matching the template:

- **Left — HEAD OFFICE**: bold heading, then the `GMS_HEAD_OFFICE_LINES` from `defaults.ts` (already correct).
- **Right — Our Bank Details**: bold heading, then `GRAIN MILLING SOLUTIONS PVT. LTD.`, Bank, Branch, A/C No, IFSC CODE — populated from the new default GMS bank.

### 6. Default GMS bank update (`src/lib/orders/defaults.ts`)

Replace the current `DEFAULT_GMS_BANK` (Citi Bank) with the bank shown in the template:

```ts
export const DEFAULT_GMS_BANK: BankDetails = {
  bank_name: "HDFC Bank",
  branch: "Kaushambi",
  account_no: "50200078882730",
  ifsc: "HDFC0002653",
};
```

(If the user wants to keep Citi as a per-order override later, the order-level bank picker continues to work — only the default changes.)

### 7. Terms & Conditions page (GMS)

After the items/totals + footer, append a **dedicated Terms & Conditions page** styled like page 2 of the reference:

- Same repeated dual-logo header at top
- Centered bold title `TERMS & CONDITIONS`
- Underlined section header `COMMERCIAL CONDITION :`
- Bold labels with values below: Taxation, Freight, INSURANCE, Delivery Time, Payment Terms, General Conditions — pulled from the existing `DEFAULT_GMS_TERMS` object (already in `defaults.ts`)
- Same HEAD OFFICE / Bank Details footer block at the bottom

## Files to edit

- `src/assets/ugur-logo.png` — **new**, copied from the uploaded `Picture1.jpg`.
- `src/lib/orders/pdf.ts` — add Uğur logo import; introduce a `drawGmsHeader(doc)` helper used as `didDrawPage` for every GMS page; rewrite the GMS branch to use the new meta block, new items/totals table styling, dual-column footer, and append a terms-and-conditions page using `DEFAULT_GMS_TERMS`.
- `src/lib/orders/defaults.ts` — update `DEFAULT_GMS_BANK` to HDFC / Kaushambi as above.

## Out of scope

- MR header/footer (untouched — already matches its own reference template).
- The Templates page / `templatePdf.ts` overlay system (separate uploaded-PDF flow).
- Importing the data from the uploaded PDF as an actual order — only the styling/branding is being adopted as the default.
- Per-order customization UI for the GMS header logos or captions.

