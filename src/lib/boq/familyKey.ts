import type { BoqRecord } from "@/lib/boq/types";

type OrderFamilyRow = { id: string; parent_order_id?: string | null };

export type BoqFamilyRow = Pick<BoqRecord, "id" | "order_id" | "boq_number" | "reference_oa_number"> &
  Partial<Pick<BoqRecord,
    "revision" | "is_current" | "created_at" | "updated_at" | "source_order_id" | "revised_from_id" | "verification_status"
  >>;

/**
 * Strip a trailing `/R<digits>` suffix from a BOQ / OA number so that base
 * and revised documents share the same stem.
 * `26-27/GMSBOQ/0004/R1` → `26-27/GMSBOQ/0004`
 */
export function stripRevisionSuffix(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/\/R\d+\s*$/i, "").trim();
}

function normalizedRevisionStem(s: string | null | undefined): string {
  return stripRevisionSuffix(s).toLowerCase();
}

export function buildOrderRootMap(orders: OrderFamilyRow[]): Map<string, string> {
  const rootById = new Map<string, string>();
  for (const o of orders) rootById.set(o.id, o.parent_order_id || o.id);
  return rootById;
}

/**
 * Resolve a stable family key for a BOQ row.
 *
 * Priority:
 *  1. OA family root via `orders.parent_order_id` (admin path — unchanged).
 *  2. `boq_number` stem (revision suffix stripped) — works for non-admin
 *     users whose `orders` RLS hides sibling revision rows.
 *  3. `reference_oa_number` stem.
 *  4. `order_id` or `id` as a last resort.
 */
export function boqFamilyKey(
  b: Pick<BoqRecord, "id" | "order_id" | "boq_number" | "reference_oa_number">,
  rootById: Map<string, string>,
): string {
  const root = b.order_id ? rootById.get(b.order_id) : undefined;
  if (root) return root;
  const stem = stripRevisionSuffix(b.boq_number);
  if (stem) return `boq:${stem}`;
  const oaStem = stripRevisionSuffix(b.reference_oa_number);
  if (oaStem) return `oa:${oaStem}`;
  return b.order_id || b.id;
}

function familyCandidateKeys(b: BoqFamilyRow, rootById: Map<string, string>): string[] {
  const keys: string[] = [`boq-id:${b.id}`];
  const root = b.order_id ? rootById.get(b.order_id) : undefined;
  if (root) keys.push(`root:${root}`);
  if (b.order_id) keys.push(`order:${b.order_id}`);
  if (b.source_order_id) keys.push(`order:${b.source_order_id}`);
  if (b.revised_from_id) keys.push(`boq-id:${b.revised_from_id}`);
  const boqStem = normalizedRevisionStem(b.boq_number);
  if (boqStem) keys.push(`boq:${boqStem}`);
  const oaStem = normalizedRevisionStem(b.reference_oa_number);
  if (oaStem) keys.push(`oa:${oaStem}`);
  return Array.from(new Set(keys));
}

function isNewerBoqRevision<T extends BoqFamilyRow>(candidate: T, current: T): boolean {
  const cr = candidate.revision ?? -1;
  const rr = current.revision ?? -1;
  if (cr !== rr) return cr > rr;
  if (candidate.is_current !== current.is_current) return candidate.is_current === true;
  const ct = candidate.updated_at || candidate.created_at || "";
  const rt = current.updated_at || current.created_at || "";
  if (ct !== rt) return ct > rt;
  return candidate.id > current.id;
}

function newestFirst<T extends BoqFamilyRow>(a: T, b: T): number {
  if (isNewerBoqRevision(a, b)) return -1;
  if (isNewerBoqRevision(b, a)) return 1;
  return 0;
}

function canonicalFamilyKey<T extends BoqFamilyRow>(rows: T[], rootById: Map<string, string>): string {
  const roots = rows
    .map((r) => r.order_id ? rootById.get(r.order_id) : undefined)
    .filter(Boolean) as string[];
  if (roots.length) return `root:${roots.sort()[0]}`;
  const chainRoot = rows.find((r) => !r.revised_from_id)?.id || rows.map((r) => r.revised_from_id).find(Boolean);
  if (chainRoot) return `boq-chain:${chainRoot}`;
  const stem = rows.map((r) => normalizedRevisionStem(r.boq_number)).find(Boolean);
  if (stem) return `boq:${stem}`;
  const oaStem = rows.map((r) => normalizedRevisionStem(r.reference_oa_number)).find(Boolean);
  if (oaStem) return `oa:${oaStem}`;
  return rows[0]?.order_id || rows[0]?.id || "unknown";
}

export function groupBoqsByFamily<T extends BoqFamilyRow>(
  boqs: T[],
  ordersOrRootMap: OrderFamilyRow[] | Map<string, string> = [],
): {
  rows: T[];
  groups: Map<string, T[]>;
  familyKeyById: Map<string, string>;
  familyIdsByLatestId: Map<string, string[]>;
  latestByFamily: Map<string, T>;
} {
  const rootById = ordersOrRootMap instanceof Map ? ordersOrRootMap : buildOrderRootMap(ordersOrRootMap);
  const parent = new Map<string, string>();
  const keyOwner = new Map<string, string>();

  const find = (id: string): string => {
    const p = parent.get(id) || id;
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  for (const b of boqs) parent.set(b.id, b.id);
  for (const b of boqs) {
    for (const key of familyCandidateKeys(b, rootById)) {
      const owner = keyOwner.get(key);
      if (owner) union(b.id, owner);
      else keyOwner.set(key, b.id);
    }
  }

  const rawGroups = new Map<string, T[]>();
  for (const b of boqs) {
    const key = find(b.id);
    const list = rawGroups.get(key) || [];
    list.push(b);
    rawGroups.set(key, list);
  }

  const groups = new Map<string, T[]>();
  const familyKeyById = new Map<string, string>();
  const familyIdsByLatestId = new Map<string, string[]>();
  const latestByFamily = new Map<string, T>();

  for (const list of rawGroups.values()) {
    const sorted = list.slice().sort(newestFirst);
    const key = canonicalFamilyKey(sorted, rootById);
    const latest = sorted[0];
    groups.set(key, sorted);
    latestByFamily.set(key, latest);
    familyIdsByLatestId.set(latest.id, sorted.map((r) => r.id));
    for (const r of sorted) familyKeyById.set(r.id, key);
  }

  const rows = Array.from(latestByFamily.values()).sort((a, b) => {
    const at = a.updated_at || a.created_at || "";
    const bt = b.updated_at || b.created_at || "";
    if (at !== bt) return bt.localeCompare(at);
    return newestFirst(a, b);
  });

  return { rows, groups, familyKeyById, familyIdsByLatestId, latestByFamily };
}

export function pickLatestApprovedBoqsPerFamily<T extends BoqFamilyRow>(
  boqs: T[],
  ordersOrRootMap: OrderFamilyRow[] | Map<string, string> = [],
): T[] {
  return groupBoqsByFamily(
    boqs.filter((b) => (b.verification_status ?? "approved") === "approved"),
    ordersOrRootMap,
  ).rows;
}