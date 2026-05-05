# Add Save options to PI editor

## Problem
The PI editor (`src/pages/pi/PiEditor.tsx`) currently only exposes a **"Save as new revision"** button. There's no way to save edits in place to the current draft PI, and the existing `downloadPdf()` helper isn't wired to a button either.

## Changes

### 1. `src/pages/pi/PiEditor.tsx` — header actions
Add two buttons next to the existing "Save as new revision":

- **Save** (primary, `Save` icon) — persists edits to the current PI row in place. Only enabled when `pi.status === "draft"` (finalized PIs must be revised, not edited, matching OA behavior).
- **Save & Finalize** — same as Save but also flips `status` to `"finalized"`. Shown only for drafts.
- **Download PDF** (`Download` icon, outline variant) — calls the existing `downloadPdf()` function.

### 2. New `saveInPlace(finalize?: boolean)` handler
Updates the current `proforma_invoices` row with the editable fields:

```ts
async function saveInPlace(finalize = false) {
  if (!pi) return;
  setSaving(true);
  try {
    const patch = {
      pi_date: pi.pi_date,
      prepared_by: pi.prepared_by,
      bill_to: pi.bill_to,
      ship_to: pi.ship_to,
      line_items: pi.line_items,
      charges: pi.charges,
      notes: pi.notes,
      one_time_discount_percent: pi.one_time_discount_percent,
      apply_discount: pi.apply_discount,
      discount_label: pi.discount_label,
      advance_mode: pi.advance_mode,
      advance_amount: pi.advance_amount,
      advance_adjustment_percent: pi.advance_adjustment_percent,
      other_charges: pi.other_charges,
      totals: {
        basic_total: totals.basic_total,
        subtotal: totals.subtotal,
        grand_total: effectiveGrand,
        net_payable: effectiveNet,
      },
      amount_in_words: amountInWords(effectiveNet),
      ...(finalize ? { status: "finalized" as const } : {}),
    };
    const { error } = await supabase
      .from("proforma_invoices")
      .update(patch)
      .eq("id", pi.id);
    if (error) throw error;
    if (finalize) update("status", "finalized");
    toast({ title: finalize ? "PI finalized" : "PI saved" });
  } catch (e: any) {
    toast({ title: "Save failed", description: e?.message || String(e), variant: "destructive" });
  } finally {
    setSaving(false);
  }
}
```

### 3. Behavior guarantees
- **No schema changes** — only writes existing columns.
- **No effect on existing "Save as new revision" flow** — `createPiRevision` still works exactly as today.
- **Finalized PIs**: Save buttons hidden; user can still Download PDF or create a revision.
- Reuses the same `effectiveGrand` / `effectiveNet` (incl. GMS landed-cost) used in PDF & revision flows so the saved totals match what the user sees.

## Files to edit
- `src/pages/pi/PiEditor.tsx` (header buttons + `saveInPlace` handler)

No DB migrations, no other files affected.
