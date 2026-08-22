import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import "@/styles/oa-pdf.css";

export const ORDER_PREVIEW_PDF_WIDTH_PX = 794;
const PDF_MARGIN_MM = 4;
/**
 * Empirically calibrated upward nudge (in `em`) applied ONLY inside the
 * off-screen capture clone, to counter html2canvas painting text low in
 * each line box. Live Preview is never affected.
 */
const RASTER_TEXT_DROP_EM = 0.6;


/**
 * Capture a live-preview DOM element and export it as a paginated A4 PDF.
 * Guarantees the generated PDF matches the on-screen preview exactly,
 * because it rasterises the same DOM the user is looking at.
 *
 * Returns `true` when a PDF was produced, `false` when the element was not
 * found (callers can then fall back to the legacy PDF builder).
 */
export async function capturePreviewToPdf(
  element: HTMLElement | null,
  filename: string,
  options: { save?: boolean } = {},
): Promise<{ ok: true; blob: Blob } | { ok: false }> {
  if (!element) return { ok: false };

  // Capture at an A4-template CSS width instead of the current screen/card
  // width. Using a very wide desktop preview as the capture width makes the
  // PDF scale everything down to fit A4, which is why text became tiny and too
  // much content appeared on one page. A fixed 794px width matches A4 at 96dpi
  // and lets long documents paginate naturally at a readable size.
  const CAPTURE_WIDTH_PX = ORDER_PREVIEW_PDF_WIDTH_PX;

  // Build an off-screen clone so the live UI is never mutated and the
  // capture is deterministic (no scrollbars / sticky headers / Card
  // constraints from the surrounding app layout).
  const host = document.createElement("div");
  host.className = "oa-pdf-capture";
  host.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    `width:${CAPTURE_WIDTH_PX}px`,
    "background:#ffffff",
    "z-index:-1",
    "pointer-events:none",
  ].join(";");
  const clone = element.cloneNode(true) as HTMLElement;
  // Kill scroll/height caps inherited from the live layout.
  clone.style.width = "100%";
  clone.style.maxWidth = "100%";
  clone.style.maxHeight = "none";
  clone.style.overflow = "visible";
  host.appendChild(clone);
  document.body.appendChild(host);

  // Wait for images (stamp, logos) to finish decoding before capture.
  const imgs = Array.from(clone.querySelectorAll<HTMLImageElement>("img"));
  await Promise.all(
    imgs.map(async (img) => {
      img.loading = "eager";
      img.decoding = "sync";
      try { await img.decode(); } catch { /* ignore */ }
    }),
  );
  // Also allow layout/fonts to settle.
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  // Export-only guardrail: guarantee no total / tax / amount value ever
  // overflows its cell in the exported PDF. When Rate/Amount columns are
  // hidden (5- or 6-column layouts) the totals amount lands in a narrow
  // trailing column (e.g. Unit at ~6% width). The `.oa-cell-nowrap` value
  // then paints past the right border in the rasterised canvas even though
  // the DOM cell technically ends earlier. Widen the last `<col>` of each
  // items table in the CLONE (Live Preview untouched) so the longest totals
  // value fits inside its cell with a small padding buffer. Other columns
  // re-flow via table-fixed's percentage weights on the remaining space.
  clone.querySelectorAll<HTMLTableElement>("table.oa-items").forEach((tbl) => {
    const cols = tbl.querySelectorAll<HTMLTableColElement>("colgroup > col");
    if (!cols.length) return;
    const lastCol = cols[cols.length - 1];
    // Measure the widest no-wrap value cell that lands in the last column.
    // Totals rows always render their value cell as `.oa-cell-nowrap`; item
    // rows use it for the Amount column when visible. Either way we want
    // the last-column width to accommodate every nowrap value.
    let needed = 0;
    tbl.querySelectorAll<HTMLElement>("tr").forEach((tr) => {
      const cells = tr.children;
      if (!cells.length) return;
      const last = cells[cells.length - 1] as HTMLElement;
      if (!last.classList.contains("oa-cell-nowrap")) return;
      const inner = last.querySelector<HTMLElement>(".oa-cell-inner") || last;
      // scrollWidth reflects the real text width even when the cell is
      // narrower than the content.
      const w = Math.max(inner.scrollWidth, last.scrollWidth);
      if (w > needed) needed = w;
    });
    if (!needed) return;
    // Add horizontal padding buffer (~10px covers 5px l/r padding + border).
    const targetPx = Math.ceil(needed + 12);
    const currentPx = (lastCol as HTMLElement).getBoundingClientRect
      ? lastCol.getBoundingClientRect().width
      : 0;
    if (targetPx > currentPx) {
      lastCol.style.width = `${targetPx}px`;
    }
  });
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  // ---------------------------------------------------------------------
  // Export-only vertical centering for the OA item + totals table.
  // html2canvas does not honour `vertical-align: middle` on table cells /
  // inline-block cell content, so the rasterised text drifts toward the
  // bottom border even though the Live Preview centres it correctly.
  // Fix: measure each row in the CLONE and convert the centering into
  // explicit, symmetric top/bottom padding with top alignment — which
  // html2canvas renders faithfully. The Live Preview DOM is never touched.
  // ---------------------------------------------------------------------
  clone.querySelectorAll<HTMLTableElement>("table.oa-items").forEach((tbl) => {
    const rows = Array.from(tbl.querySelectorAll<HTMLTableRowElement>("tr"));
    rows.forEach((tr) => {
      const cells = Array.from(tr.children) as HTMLElement[];
      if (!cells.length) return;
      const rowH = tr.getBoundingClientRect().height;
      if (!rowH) return;
      // Content height per cell (tallest cell drives the row height).
      const measured = cells.map((cell) => {
        const inner = cell.querySelector<HTMLElement>(".oa-cell-inner");
        const rect = (inner || cell).getBoundingClientRect();
        const cs = window.getComputedStyle(cell);
        const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const h = inner ? rect.height : Math.max(rect.height - padY, 0);
        return { cell, contentH: h, basePad: parseFloat(cs.paddingTop) || 4 };
      });
      measured.forEach(({ cell, contentH, basePad }) => {
        const free = rowH - contentH;
        // Keep the existing padding as the floor so nothing gets tighter
        // than the Live Preview; split the remaining space evenly.
        const pad = Math.max(basePad, free / 2);
        cell.style.setProperty("vertical-align", "top", "important");
        cell.style.setProperty("padding-top", `${pad.toFixed(2)}px`, "important");
        cell.style.setProperty("padding-bottom", `${pad.toFixed(2)}px`, "important");
        const inner = cell.querySelector<HTMLElement>(".oa-cell-inner");
        if (inner) {
          inner.style.setProperty("vertical-align", "top", "important");
          // html2canvas paints glyphs near the BOTTOM of each line box
          // instead of honouring the half-leading, so even perfectly
          // symmetric padding renders text hugging the lower border.
          // Compensate with a purely visual (relative) upward nudge that
          // does not change row height or the Live Preview.
          const fs = parseFloat(window.getComputedStyle(inner).fontSize) || 10;
          const nudge = fs * RASTER_TEXT_DROP_EM;
          inner.style.setProperty("position", "relative", "important");
          inner.style.setProperty("top", `${(-nudge).toFixed(2)}px`, "important");
        }
      });
    });

  });

  // Same rasteriser correction for the GMS/EXW totals card, which is built
  // from vertically-centered grid/flex rows (Base Amount, Landed Price, P&F,
  // Grand Total, Net Payable) rather than an `.oa-items` table.
  clone.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const cs = window.getComputedStyle(el);
    if (cs.alignItems !== "center") return;
    if (!/grid|flex/.test(cs.display)) return;
    Array.from(el.children).forEach((childNode) => {
      const child = childNode as HTMLElement;
      if (!child.textContent || !child.textContent.trim()) return;
      if (child.querySelector("table, img")) return;
      const fs = parseFloat(window.getComputedStyle(child).fontSize) || 10;
      child.style.setProperty("position", "relative", "important");
      child.style.setProperty("top", `${(-fs * RASTER_TEXT_DROP_EM).toFixed(2)}px`, "important");
    });
  });
  await new Promise((r) => requestAnimationFrame(() => r(null)));


  // Overflow-safe capture width. Some column configurations (e.g. 5-col MR
  // with Rate/Amount hidden and long no-wrap totals like "1,88,59,552.00")
  // push content past the nominal 794px template width. If we rasterise at
  // exactly CAPTURE_WIDTH_PX, html2canvas silently crops anything past that
  // boundary — losing right-side totals, GST rows, or borders even though
  // the on-screen preview shows them. Measure the real content extent and
  // widen the capture window when needed so nothing is ever clipped. The
  // Live Preview UI is not touched (this is an invisible off-screen clone).
  const cloneLeft = clone.getBoundingClientRect().left;
  let measuredRight = clone.scrollWidth;
  let measuredBottom = clone.scrollHeight;
  clone.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const r = el.getBoundingClientRect();
    const right = r.right - cloneLeft;
    const bottom = r.bottom - clone.getBoundingClientRect().top;
    if (right > measuredRight) measuredRight = right;
    if (bottom > measuredBottom) measuredBottom = bottom;
  });
  const effectiveCaptureWidth = Math.max(CAPTURE_WIDTH_PX, Math.ceil(measuredRight));
  if (effectiveCaptureWidth > CAPTURE_WIDTH_PX) {
    host.style.width = `${effectiveCaptureWidth}px`;
    // let layout settle at the new width so overflow content lands inside
    // the canvas rather than being clipped at the old boundary.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }

  // Collect safe break boundaries from the CLONE (post-normalization). We
  // never want to slice across a `<tr>` or `.pdf-keep`, and inside a
  // `.pdf-keep-group` we still allow the group's direct children to break.
  const hostTop = clone.getBoundingClientRect().top;
  const boundarySet = new Set<number>();
  boundarySet.add(0);
  const addBounds = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const t = r.top - hostTop;
    const b = t + r.height;
    if (t > 0) boundarySet.add(t);
    if (b > 0) boundarySet.add(b);
  };
  clone
    .querySelectorAll<HTMLElement>(
      "thead tr, tbody tr, tfoot tr, table.oa-items, .pdf-keep, .pdf-keep-group, .pdf-keep-group > *, [data-pdf-keep]",
    )
    .forEach(addBounds);
  // Line-level fallbacks inside Terms so a very tall Terms block can flow
  // across pages instead of being sliced mid-glyph.
  clone
    .querySelectorAll<HTMLElement>(".pdf-keep p, .pdf-keep div, .pdf-keep li")
    .forEach(addBounds);
  const boundaries = Array.from(boundarySet).sort((a, b) => a - b);
  const forcedBreaks = Array.from(
    clone.querySelectorAll<HTMLElement>(".page-break-before, [data-pdf-page-break-before='true']"),
  )
    .map((el) => el.getBoundingClientRect().top - hostTop)
    .filter((y) => y > 0.5)
    .sort((a, b) => a - b);

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: effectiveCaptureWidth,
      width: effectiveCaptureWidth,
    });
  } finally {
    document.body.removeChild(host);
  }

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  const pdfMargin = PDF_MARGIN_MM;
  const printableW = pdfW - pdfMargin * 2;
  const printableH = pdfH - pdfMargin * 2;

  // px/mm conversion factors — canvas is rendered at scale=2 so canvas.width
  // corresponds to CAPTURE_WIDTH_PX * 2. We map canvas Y coords (in CSS px
  // × 2) into mm on the PDF via cssPxToMm.
  const scale = 2;
  // Map the actual measured capture width (not the nominal template width)
  // to the A4 printable area so any overflow content ends up inside the
  // page instead of past the right margin. Overflow is typically <5%, so
  // the resulting A4 scale-down is minor and text stays readable.
  const cssPxToMm = printableW / effectiveCaptureWidth;
  const pageCssPx = printableH / cssPxToMm;         // CSS px per PDF page

  // Pick page breaks that snap to the nearest safe boundary BEFORE the
  // theoretical page cutoff. Prefer not to cut rows/sections, even if that
  // leaves a shorter page. If no safe boundary exists in-window we accept
  // the hard cutoff so the flow still progresses.
  const totalCssPx = canvas.height / scale;
  const breaks: number[] = [0];
  while (breaks[breaks.length - 1] < totalCssPx - 0.5) {
    const start = breaks[breaks.length - 1];
    const maxEnd = start + pageCssPx;
    if (maxEnd >= totalCssPx) { breaks.push(totalCssPx); break; }
    const nextForced = forcedBreaks.find((b) => b > start + 1 && b <= maxEnd);
    if (nextForced && nextForced - start > pageCssPx * 0.12) {
      breaks.push(nextForced);
      continue;
    }
    const minEnd = start + pageCssPx * 0.12;
    let snap = maxEnd;
    for (let i = boundaries.length - 1; i >= 0; i--) {
      const b = boundaries[i];
      if (b <= maxEnd && b >= minEnd) { snap = b; break; }
    }
    // Guarantee forward progress.
    if (snap <= start) snap = Math.min(maxEnd, totalCssPx);
    breaks.push(snap);
  }

  const imgW = printableW;
  for (let i = 0; i < breaks.length - 1; i++) {
    const startCssPx = breaks[i];
    const endCssPx = breaks[i + 1];
    const sliceHeightPx = Math.round((endCssPx - startCssPx) * scale);
    if (sliceHeightPx <= 0) continue;
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sliceHeightPx;
    const ctx = slice.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(
      canvas,
      0, Math.round(startCssPx * scale),
      canvas.width, sliceHeightPx,
      0, 0,
      canvas.width, sliceHeightPx,
    );
    const sliceImg = slice.toDataURL("image/png");
    const sliceMmH = (endCssPx - startCssPx) * cssPxToMm;
    if (i > 0) pdf.addPage();
    pdf.addImage(sliceImg, "PNG", pdfMargin, pdfMargin, imgW, sliceMmH);
  }

  const blob = pdf.output("blob");
  if (options.save !== false) pdf.save(filename);
  return { ok: true, blob };
}

/** Convenience: find the OA / PI live-preview root in the current DOM. */
export function findOaPreviewRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-oa-preview-root]");
}