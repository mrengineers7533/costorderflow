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

  const imgW = pdfW;
  const imgH = (canvas.height * pdfW) / canvas.width;

  const imgData = canvas.toDataURL("image/png");
  let heightLeft = imgH;
  let position = 0;
  pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
  heightLeft -= pdfH;
  while (heightLeft > 0) {
    position = heightLeft - imgH;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
    heightLeft -= pdfH;
  }

  const blob = pdf.output("blob");
  pdf.save(filename);
  return { ok: true, blob };
}

/** Convenience: find the OA / PI live-preview root in the current DOM. */
export function findOaPreviewRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-oa-preview-root]");
}