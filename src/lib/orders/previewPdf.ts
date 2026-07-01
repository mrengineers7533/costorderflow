import jsPDF from "jspdf";
import html2canvas from "html2canvas";

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
): Promise<{ ok: true; blob: Blob } | { ok: false }> {
  if (!element) return { ok: false };

  // Temporarily force a fixed rendering width so the capture is deterministic
  // regardless of the surrounding layout / zoom.
  const prevWidth = element.style.width;
  const prevMaxWidth = element.style.maxWidth;
  const CAPTURE_WIDTH_PX = 900; // ~ A4 width at 96dpi with margins
  element.style.width = `${CAPTURE_WIDTH_PX}px`;
  element.style.maxWidth = `${CAPTURE_WIDTH_PX}px`;

  // Collect safe break boundaries (top offsets of every row/section we do
  // NOT want to split across pages) BEFORE capture. These are used to snap
  // page breaks so Terms/Bank/Signature blocks aren't sliced.
  const rootTop = element.getBoundingClientRect().top;
  const boundaries: number[] = [0];
  element.querySelectorAll<HTMLElement>(
    "tr, .pdf-keep, [data-pdf-keep]",
  ).forEach((el) => {
    const t = el.getBoundingClientRect().top - rootTop;
    if (t > 0) boundaries.push(t);
    const b = t + el.getBoundingClientRect().height;
    if (b > 0) boundaries.push(b);
  });
  boundaries.sort((a, b) => a - b);

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: CAPTURE_WIDTH_PX,
    });
  } finally {
    element.style.width = prevWidth;
    element.style.maxWidth = prevMaxWidth;
  }

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();

  // px/mm conversion factors — canvas is rendered at scale=2 so canvas.width
  // corresponds to CAPTURE_WIDTH_PX * 2. We map canvas Y coords (in CSS px
  // × 2) into mm on the PDF via cssPxToMm.
  const scale = 2;
  const cssPxToMm = pdfW / CAPTURE_WIDTH_PX; // width mapping (canvas covers full pdf width)
  const pageCssPx = pdfH / cssPxToMm;         // CSS px per PDF page

  // Pick page breaks that snap to the nearest safe boundary BEFORE the
  // theoretical page cutoff. Never advance less than 40% of a page.
  const totalCssPx = canvas.height / scale;
  const breaks: number[] = [0];
  while (breaks[breaks.length - 1] < totalCssPx) {
    const start = breaks[breaks.length - 1];
    const maxEnd = start + pageCssPx;
    if (maxEnd >= totalCssPx) { breaks.push(totalCssPx); break; }
    // largest boundary <= maxEnd and > start + 40% page
    const minEnd = start + pageCssPx * 0.4;
    let snap = maxEnd;
    for (let i = boundaries.length - 1; i >= 0; i--) {
      const b = boundaries[i];
      if (b <= maxEnd && b >= minEnd) { snap = b; break; }
    }
    breaks.push(snap);
  }

  const imgW = pdfW;
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
    pdf.addImage(sliceImg, "PNG", 0, 0, imgW, sliceMmH);
  }

  const blob = pdf.output("blob");
  pdf.save(filename);
  return { ok: true, blob };
}

/** Convenience: find the OA / PI live-preview root in the current DOM. */
export function findOaPreviewRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-oa-preview-root]");
}