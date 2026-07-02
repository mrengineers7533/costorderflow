import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import "@/styles/oa-pdf.css";

export const ORDER_PREVIEW_PDF_WIDTH_PX = 794;
const PDF_MARGIN_MM = 4;

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
      windowWidth: CAPTURE_WIDTH_PX,
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
  const cssPxToMm = printableW / CAPTURE_WIDTH_PX; // width mapping inside consistent PDF margins
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