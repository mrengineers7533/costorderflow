/**
 * Global, presentation-only helper that exposes the FULL value of any element
 * whose content is visually truncated (clipped by overflow, narrow column,
 * ellipsis, or a value too long for an <input>/<textarea>).
 *
 * It listens at the document level for `mouseover` and, when the hovered
 * element is actually overflowing, sets a native `title` attribute carrying
 * the full text. The browser then shows its own hover tooltip — no layout,
 * data, calculations, or workflows are touched.
 *
 * Existing `title` attributes are preserved (we never overwrite them) and
 * any title we add is tagged with `data-auto-title` so it can be cleaned
 * up on mouseout, avoiding leaks across re-renders.
 */

const AUTO_FLAG = "data-auto-title";

function isInputLike(el: Element): el is HTMLInputElement | HTMLTextAreaElement {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

function getFullValue(el: HTMLElement): string {
  if (isInputLike(el)) return el.value ?? "";
  return (el.innerText ?? el.textContent ?? "").trim();
}

function isTruncated(el: HTMLElement): boolean {
  if (isInputLike(el)) {
    if (!el.value) return false;
    return el.scrollWidth > el.clientWidth + 1;
  }
  const overflowX = el.scrollWidth > el.clientWidth + 1;
  const overflowY = el.scrollHeight > el.clientHeight + 1;
  return overflowX || overflowY;
}

function handleMouseOver(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (!target || !(target instanceof HTMLElement)) return;
  if (target.hasAttribute("title") && target.getAttribute(AUTO_FLAG) !== "1") return;
  if (!isTruncated(target)) return;
  const full = getFullValue(target);
  if (!full) return;
  target.setAttribute("title", full);
  target.setAttribute(AUTO_FLAG, "1");
}

function handleMouseOut(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (!target || !(target instanceof HTMLElement)) return;
  if (target.getAttribute(AUTO_FLAG) === "1") {
    target.removeAttribute("title");
    target.removeAttribute(AUTO_FLAG);
  }
}

let installed = false;
export function installTruncationTooltips() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener("mouseover", handleMouseOver, true);
  document.addEventListener("mouseout", handleMouseOut, true);
}
