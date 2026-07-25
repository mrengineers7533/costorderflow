export type MaterialCategorySource = "bom" | "master" | "rule" | "manual";

export interface CategoryRule {
  pattern: string;
  category: string;
  priority: number;
  active?: boolean;
}

export interface ResolveCategoryInput {
  bomCategory?: string | null;
  itemMasterCategory?: string | null;
  material?: string | null;
  sizeModel?: string | null;
  rules?: CategoryRule[];
}

export interface ResolvedCategory {
  category: string | null;
  source: MaterialCategorySource | null;
}

/**
 * Resolve a Raw Material category using a strict priority:
 *   1. Explicit BOM value (highest)
 *   2. Item Master value
 *   3. First matching keyword rule (by priority ASC, then longest pattern)
 *   4. null — stays pending for user selection
 *
 * The helper is deliberately pure and framework-free so both the browser UI
 * and the create-requisition edge function can share the same behavior.
 */
export function resolveMaterialCategory(input: ResolveCategoryInput): ResolvedCategory {
  const bom = norm(input.bomCategory);
  if (bom) return { category: bom, source: "bom" };
  const master = norm(input.itemMasterCategory);
  if (master) return { category: master, source: "master" };
  const haystack = `${input.material ?? ""} ${input.sizeModel ?? ""}`.toUpperCase();
  if (haystack.trim()) {
    const active = (input.rules ?? []).filter((r) => r.active !== false && r.pattern && r.category);
    const sorted = active.slice().sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.pattern.length - a.pattern.length;
    });
    for (const r of sorted) {
      if (haystack.includes(r.pattern.toUpperCase())) {
        return { category: r.category, source: "rule" };
      }
    }
  }
  return { category: null, source: null };
}

function norm(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t.length ? t : null;
}
