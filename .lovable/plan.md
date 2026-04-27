## Problem

After parsing a cost sheet PDF, the **GSTIN** and **State** fields under "Bill To" and "Ship To" stay empty in the order form, even though the rest of the customer data (name, address) and line items extract fine.

## Root cause

The edge function `parse-cost-sheet` already declares `gstin` and `state` in its tool-call schema (for both `bill_to` and `ship_to`), and the frontend (`OrderEditor.tsx`) correctly merges those values into the form state. The problem is the **AI system prompt**: it spends ~40 lines describing how to extract line items / sections / charges, but says **nothing** about how to find GSTIN and State on the cost sheet header. As a result Gemini omits those two fields from its tool call, leaving them blank.

Indian cost sheets typically print these as `GST No. / GSTIN: 09AAACI1234L1ZP` and `State Name: Uttar Pradesh, Code: 09` somewhere in the customer / billing block. We need to tell the model exactly that.

## Fix

Update **only** `supabase/functions/parse-cost-sheet/index.ts`:

1. Add a new explicit section to `SYSTEM_PROMPT` titled "CUSTOMER / ADDRESS EXTRACTION" that instructs the model to:
   - Always populate `bill_to.name`, `bill_to.address`, `bill_to.gstin`, `bill_to.state` and the same four fields for `ship_to`.
   - Recognise GSTIN under any of these labels: `GSTIN`, `GST No.`, `GST No`, `GST Number`, `GST IN`. Strip whitespace; it's a 15-character alphanumeric code.
   - Recognise State under labels: `State`, `State Name`, `State :`. If a state code (2 digits) is present alongside, still return the state name in `state`.
   - If only one address block is present on the cost sheet, copy its values into both `bill_to` and `ship_to`.
   - If GSTIN is present but state is missing, infer the state from the **first 2 digits** of the GSTIN using the standard Indian GST state-code mapping (e.g. `09` → Uttar Pradesh, `27` → Maharashtra, `07` → Delhi, `24` → Gujarat, `29` → Karnataka, etc.).
2. Tighten the tool-call user message to also say: "Extract bill_to and ship_to including GSTIN and State."
3. No schema change, no DB change, no frontend change needed — the plumbing already supports these fields.

## Verification

After deploying the updated edge function, re-upload the same cost sheet PDF on `/orders/new`. The GSTIN and State inputs under both "Bill To" and "Ship To" should auto-fill. If a sheet truly has no GSTIN printed, the fields will remain blank (expected) and the user can fill them manually.

## Files touched

- `supabase/functions/parse-cost-sheet/index.ts` — prompt-only change (auto-redeploys).
