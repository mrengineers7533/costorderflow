/**
 * Browser-native "print → PDF" export for the OA / PI Live Preview.
 *
 * We deep-clone the on-screen preview node into a hidden iframe that inherits
 * every stylesheet from the parent document, then trigger `window.print()`.
 * Because the same Blink layout engine that paints the Live Preview also
 * paints the PDF, the exported file matches the preview pixel-for-pixel:
 * fonts, borders, table widths, row heights, wrapping, spacing and page
 * breaks are all identical.
 *
 * This is intentionally presentation-only — no business logic, calculations,
 * or workflow state is touched.
 */

import "@/styles/oa-pdf.css";

function collectStyleTags(): string {
  // Inline every <style> and <link rel="stylesheet"> from the host document
  // so the iframe renders with exactly the same CSS as the live preview.
  const parts: string[] = [];
  document.querySelectorAll<HTMLStyleElement | HTMLLinkElement>(
    'style, link[rel="stylesheet"]',
  ).forEach((node) => {
    parts.push(node.outerHTML);
  });
  return parts.join("\n");
}

const PRINT_CSS = `
@page { size: A4; margin: 8mm; }
html, body { margin: 0; padding: 0; background: #ffffff; }
body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.print\\:hidden, [data-oa-preview-toolbar] { display: none !important; }
/* Snap page breaks to safe boundaries — mirrors the on-screen preview. */
tr, .pdf-keep, .pdf-keep-group > *, [data-pdf-keep] {
  page-break-inside: avoid;
  break-inside: avoid;
}
/* Neutralise the surrounding Card chrome so the preview fills the page. */
.order-preview-card { border: 0 !important; box-shadow: none !important; }
[data-oa-preview-root] { padding: 0 !important; }
`;

export async function exportPreviewAsPdf(
  root: HTMLElement | null,
  filename: string,
): Promise<boolean> {
  if (!root) return false;

  // Make sure images/fonts are ready in the source document before cloning.
  const srcImgs = Array.from(root.querySelectorAll<HTMLImageElement>("img"));
  await Promise.all(
    srcImgs.map(async (img) => {
      img.loading = "eager";
      img.decoding = "sync";
      try { await img.decode(); } catch { /* ignore */ }
    }),
  );
  try { await (document as any).fonts?.ready; } catch { /* ignore */ }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = [
    "position:fixed",
    "right:0",
    "bottom:0",
    "width:210mm",
    "height:297mm",
    "border:0",
    "opacity:0",
    "pointer-events:none",
    "z-index:-1",
  ].join(";");
  document.body.appendChild(iframe);

  const cleanup = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    document.title = originalTitle;
  };

  // The browser's "Save as PDF" dialog uses document.title as the default
  // filename — set it just for the print window's lifetime.
  const originalTitle = document.title;
  const safeName = filename.replace(/\.pdf$/i, "");

  try {
    const doc = iframe.contentDocument;
    if (!doc) { cleanup(); return false; }

    const cloneHtml = (root.cloneNode(true) as HTMLElement).outerHTML;
    const stylesHtml = collectStyleTags();

    doc.open();
    doc.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${safeName}</title>
${stylesHtml}
<style>${PRINT_CSS}</style>
</head>
<body class="oa-pdf-capture">${cloneHtml}</body>
</html>`);
    doc.close();

    // Wait for the iframe's own images/fonts to settle before printing.
    await new Promise<void>((resolve) => {
      if (doc.readyState === "complete") resolve();
      else iframe.addEventListener("load", () => resolve(), { once: true });
    });
    const imgs = Array.from(doc.querySelectorAll<HTMLImageElement>("img"));
    await Promise.all(
      imgs.map(async (img) => {
        img.loading = "eager";
        img.decoding = "sync";
        try { await img.decode(); } catch { /* ignore */ }
      }),
    );
    try { await (doc as any).fonts?.ready; } catch { /* ignore */ }
    // Extra frame so layout is finalised.
    await new Promise((r) => setTimeout(r, 60));

    document.title = safeName;

    const win = iframe.contentWindow;
    if (!win) { cleanup(); return false; }

    // Print, then clean up when the user closes the print dialog.
    win.focus();
    win.print();

    const done = () => setTimeout(cleanup, 300);
    win.addEventListener("afterprint", done, { once: true });
    // Safety net in case afterprint doesn't fire.
    setTimeout(cleanup, 60_000);

    return true;
  } catch (err) {
    console.warn("[previewPrint] export failed", err);
    cleanup();
    return false;
  }
}

export function findOaPreviewRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-oa-preview-root]");
}