I will make a focused BOQ-number-only fix.

Plan:
1. Update BOQ revision creation so the new BOQ number is always derived from the revised OA number, not copied from the previous BOQ.
   - GMS example: `2026-27/GMS/0002/R1` -> `26-27/GMSBOQ/0002/R1`
   - MR example will continue through the existing MR mapping with `/R1`, `/R2`, etc.
2. Apply the same fix in both BOQ revision paths:
   - direct OA revise auto-BOQ path
   - pending BOQ verification revision path
3. Keep existing revision history untouched so old BOQs remain available.
4. Ensure latest draft/pending BOQ revisions remain visible where current code already lists them, including Design and BOQ folder views.
5. Do not change calculations, approvals, notifications, acknowledgement flow, PDF/print formatting, auto BOQ creation behavior, purchase/manufacturing behavior, or any other workflow.

Technical scope:
- Change only `src/lib/revisions/index.ts` BOQ payload number assignment from previous BOQ number fallback to `deriveBoqNumber(orderRev.oa_number)` for revised BOQ rows.
- Existing display surfaces already render `boq_number`; this makes Design, BOQ, Purchase, and Manufacturing show the corrected saved number without extra display-only hacks.