import { parseColumnComments, type ColKey, type DesignReviewItemRow } from "@/lib/boq/designReview";
import type { LineItem } from "@/lib/orders/types";

export type { ColKey };
export { parseColumnComments };

function norm(s: string | null | undefined): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Find the design-review item that matches a given OA line item.
 *  Matches by normalized description first; falls back to positional index. */
export function findReviewItemForOaItem(
  reviewItems: DesignReviewItemRow[] | undefined | null,
  oaItem: LineItem,
  index: number,
): DesignReviewItemRow | null {
  if (!reviewItems || !reviewItems.length) return null;
  const key = norm(oaItem.description);
  if (key) {
    const matches = reviewItems.filter((r) => norm(r.description) === key);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      // Duplicate descriptions — use positional fallback among matches
      return matches[Math.min(index, matches.length - 1)] || null;
    }
  }
  return reviewItems[index] || null;
}

export function hasAnyColumnComment(r: DesignReviewItemRow): boolean {
  const cols = parseColumnComments(r);
  return (["model", "description", "quantity", "unit", "remarks"] as ColKey[])
    .some((k) => ((cols as Record<string, string>)[k] || "").trim() !== "");
}