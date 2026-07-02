## Goal
Fix the OA/PI PDF export so it does not shrink everything to fit on one page. The exported PDF should keep standard readable text size, keep the same Live Preview proportions, and naturally continue onto additional A4 pages when content is long.

## Planned changes
1. **Stop page-fit shrinking**
   - Update the Live Preview capture PDF logic so it preserves the preview’s normal readable scale instead of compressing all content onto one page.
   - Keep fixed A4 margins, but allow content height to paginate normally.

2. **Set standard PDF capture width/text sizing**
   - Use a stable template width for OA/PI capture instead of over-scaling based on available screen width.
   - Keep table text at the current preview/template size, not tiny export-only text.

3. **Improve page slicing without shrinking text**
   - Keep rows, totals, terms, and signature/stamp sections from being cut mid-section.
   - If content does not fit, create page 2/page 3 instead of reducing font size.

4. **Keep scope limited**
   - No data changes.
   - No calculation changes.
   - No approval/workflow/numbering changes.
   - Only OA/PI Live Preview PDF export layout behavior.

5. **Verify visually**
   - Export/check the current OA PDF route.
   - Confirm text size is readable, table cells stay aligned, and long content flows to next pages instead of being squeezed.