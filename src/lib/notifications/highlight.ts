import { supabase } from "@/integrations/supabase/client";

export interface NotifLineChange {
  line_no?: string | number | null;
  kind: "added" | "removed" | "modified";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changed_fields: string[];
}

export interface NotifHighlightMap {
  notifId: string;
  module: string;
  recordId: string | null;
  byRow: Map<
    string,
    {
      kind: NotifLineChange["kind"];
      fields: Map<string, { before: unknown; after: unknown }>;
    }
  >;
  totalRows: number;
  totalCells: number;
}

export async function fetchHighlightMap(
  notifId: string,
): Promise<NotifHighlightMap | null> {
  const { data, error } = await supabase
    .from("app_notifications")
    .select("id, module, record_id, line_item_changes")
    .eq("id", notifId)
    .maybeSingle();
  if (error || !data) return null;
  const raw = (data as { line_item_changes?: unknown }).line_item_changes;
  const changes = (Array.isArray(raw) ? raw : []) as unknown as NotifLineChange[];
  const byRow = new Map<
    string,
    {
      kind: NotifLineChange["kind"];
      fields: Map<string, { before: unknown; after: unknown }>;
    }
  >();
  let totalCells = 0;
  for (const c of changes) {
    const key = String(c.line_no ?? "");
    if (!key) continue;
    const entry =
      byRow.get(key) ?? { kind: c.kind, fields: new Map() };
    for (const f of c.changed_fields || []) {
      entry.fields.set(f, {
        before: c.before ? (c.before as Record<string, unknown>)[f] : null,
        after: c.after ? (c.after as Record<string, unknown>)[f] : null,
      });
      totalCells += 1;
    }
    if (!entry.fields.size && c.kind !== "modified") {
      // added/removed without explicit fields — still mark the row.
    }
    byRow.set(key, entry);
  }
  return {
    notifId,
    module: String((data as { module: string }).module),
    recordId: ((data as { record_id: string | null }).record_id) ?? null,
    byRow,
    totalRows: byRow.size,
    totalCells,
  };
}

/** Convenience: lookup helpers used by the cell component. */
export function getCellChange(
  map: NotifHighlightMap | null,
  rowKey: string | number | null | undefined,
  field: string,
): { before: unknown; after: unknown } | null {
  if (!map || rowKey == null) return null;
  const row = map.byRow.get(String(rowKey));
  if (!row) return null;
  return row.fields.get(field) ?? null;
}

export function isRowChanged(
  map: NotifHighlightMap | null,
  rowKey: string | number | null | undefined,
): boolean {
  if (!map || rowKey == null) return false;
  return map.byRow.has(String(rowKey));
}

/** Build the deep-link URL for a notification's source page. */
export function notifDeepLink(n: {
  module: string;
  record_id?: string | null;
  related_order_root_id?: string | null;
  related_boq_id?: string | null;
  related_pi_id?: string | null;
  related_po_id?: string | null;
  related_requisition_id?: string | null;
  related_annexure_id?: string | null;
  id: string;
}, rowNo?: string | number | null): string | null {
  const q = new URLSearchParams({ notif: n.id });
  if (rowNo != null && String(rowNo)) q.set("row", String(rowNo));
  const qs = `?${q.toString()}`;
  switch (n.module) {
    case "boq":
    case "design_comment": {
      const id = n.related_boq_id || n.record_id;
      return id ? `/boqs/${id}${qs}` : null;
    }
    case "order": {
      const id = n.related_order_root_id || n.record_id;
      return id ? `/orders/${id}${qs}` : null;
    }
    case "pi": {
      const id = n.related_pi_id || n.record_id;
      return id ? `/pi/${id}${qs}` : null;
    }
    case "purchase":
    case "grn": {
      const id = n.related_po_id || n.record_id;
      return id ? `/purchase/${id}${qs}` : null;
    }
    case "requisition": {
      const id = n.related_requisition_id || n.record_id;
      return id ? `/requisitions/${id}${qs}` : null;
    }
    case "annexure": {
      const id = n.related_annexure_id || n.record_id;
      return id ? `/requisitions/annexure/${id}${qs}` : null;
    }
    default:
      return null;
  }
}