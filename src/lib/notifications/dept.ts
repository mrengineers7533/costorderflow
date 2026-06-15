import { supabase } from "@/integrations/supabase/client";

/**
 * Normalize a department label for case/whitespace-insensitive matching.
 * Examples that all collapse to the same key:
 *   "Design", "design", "Design Team", "  design  "
 */
export function normalizeDept(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s+team$/, "");
}

/**
 * Resolve the acknowledging user's department.
 * Prefers an active `notification_recipients` row, falls back to "Other".
 */
export async function resolveUserDepartment(
  userId: string,
): Promise<{ department: string; name: string | null }> {
  const { data } = await supabase
    .from("notification_recipients")
    .select("department,name,is_active")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const rec = data as { department?: string; name?: string } | null;
  return {
    department: rec?.department || "Other",
    name: rec?.name || null,
  };
}

/**
 * Returns the target department whose normalized form matches the read row's
 * department, or null if none.
 */
export function matchTargetDept(
  readDept: string | null | undefined,
  targets: string[],
): string | null {
  const key = normalizeDept(readDept);
  if (!key) return null;
  for (const t of targets) {
    if (normalizeDept(t) === key) return t;
  }
  return null;
}