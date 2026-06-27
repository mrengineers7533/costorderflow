import { supabase } from "@/integrations/supabase/client";

export type RepairStatus =
  | "native_approved"
  | "repaired_inherited"
  | "needs_repair"
  | "not_approved_by_design"
  | "no_boq";

export type RepairRow = {
  orderId: string;
  oaNumber: string;
  oaRevision: number;
  family: "GMS" | "MR" | "OTHER";
  boqId: string | null;
  boqNumber: string | null;
  boqRevision: number | null;
  totalItems: number;
  approvedItems: number;
  directRows: number;
  inheritedRows: number;
  ancestorApproved: boolean;
  status: RepairStatus;
};

type OrderRow = {
  id: string;
  oa_number: string;
  revision: number;
  parent_order_id: string | null;
};

type BoqRow = {
  id: string;
  source_order_id: string | null;
  revision: number;
  boq_number: string;
};

type SnapshotRow = {
  boq_id: string;
  boq_revision: number;
  boq_item_id: string;
  approval_status: string;
  source_snapshot_id: string | null;
};

type DesignStatusRow = {
  boq_id: string;
  boq_revision: number;
  status: string;
};

function familyOf(oaNumber: string): "GMS" | "MR" | "OTHER" {
  if (/MROA|\/MR\//i.test(oaNumber)) return "MR";
  if (/GMS/i.test(oaNumber)) return "GMS";
  return "OTHER";
}

export function classifyRow(args: {
  hasBoq: boolean;
  totalItems: number;
  approvedItems: number;
  directRows: number;
  inheritedRows: number;
  ancestorApproved: boolean;
}): RepairStatus {
  if (!args.hasBoq) return "no_boq";
  const { totalItems, approvedItems, directRows, inheritedRows, ancestorApproved } = args;
  const allApproved = totalItems > 0 && approvedItems === totalItems;
  if (allApproved) {
    if (directRows > 0) return "native_approved";
    if (inheritedRows > 0) return "repaired_inherited";
    return "repaired_inherited";
  }
  if (ancestorApproved) return "needs_repair";
  return "not_approved_by_design";
}

export async function loadRevisionRepairReport(): Promise<RepairRow[]> {
  const [ordersRes, boqsRes] = await Promise.all([
    supabase
      .from("orders")
      .select("id,oa_number,revision,parent_order_id")
      .order("oa_number", { ascending: true })
      .order("revision", { ascending: true }),
    supabase
      .from("boqs")
      .select("id,source_order_id,revision,boq_number"),
  ]);
  const orders = (ordersRes.data as OrderRow[]) || [];
  const boqs = (boqsRes.data as BoqRow[]) || [];

  const boqByOrder = new Map<string, BoqRow>();
  for (const b of boqs) {
    if (!b.source_order_id) continue;
    const existing = boqByOrder.get(b.source_order_id);
    if (!existing || b.revision > existing.revision) boqByOrder.set(b.source_order_id, b);
  }

  const boqIds = orders.map((o) => boqByOrder.get(o.id)?.id).filter((x): x is string => !!x);

  const [snapRes, dsRes] = await Promise.all([
    boqIds.length
      ? supabase
          .from("boq_revision_approval_snapshots")
          .select("boq_id,boq_revision,boq_item_id,approval_status,source_snapshot_id")
          .in("boq_id", boqIds)
      : Promise.resolve({ data: [] as SnapshotRow[] } as { data: SnapshotRow[] }),
    boqIds.length
      ? supabase
          .from("boq_item_design_status")
          .select("boq_id,boq_revision,status")
          .in("boq_id", boqIds)
      : Promise.resolve({ data: [] as DesignStatusRow[] } as { data: DesignStatusRow[] }),
  ]);
  const snaps = (snapRes.data as SnapshotRow[]) || [];
  const dss = (dsRes.data as DesignStatusRow[]) || [];

  const snapByBoq = new Map<string, SnapshotRow[]>();
  for (const s of snaps) {
    const arr = snapByBoq.get(s.boq_id) || [];
    arr.push(s);
    snapByBoq.set(s.boq_id, arr);
  }
  const dsByBoq = new Map<string, DesignStatusRow[]>();
  for (const d of dss) {
    const arr = dsByBoq.get(d.boq_id) || [];
    arr.push(d);
    dsByBoq.set(d.boq_id, arr);
  }

  // Group orders by oa_number to evaluate ancestor approval
  const byNumber = new Map<string, OrderRow[]>();
  for (const o of orders) {
    const arr = byNumber.get(o.oa_number) || [];
    arr.push(o);
    byNumber.set(o.oa_number, arr);
  }
  for (const arr of byNumber.values()) arr.sort((a, b) => a.revision - b.revision);

  const approvedRevByOaNumber = new Map<string, Set<number>>();
  for (const [num, arr] of byNumber.entries()) {
    const set = new Set<number>();
    for (const o of arr) {
      const boq = boqByOrder.get(o.id);
      if (!boq) continue;
      const items = (snapByBoq.get(boq.id) || []).filter((s) => s.boq_revision === boq.revision);
      if (items.length > 0 && items.every((s) => s.approval_status === "approved")) {
        set.add(o.revision);
      }
    }
    approvedRevByOaNumber.set(num, set);
  }

  const rows: RepairRow[] = [];
  for (const o of orders) {
    const boq = boqByOrder.get(o.id) || null;
    const items = boq
      ? (snapByBoq.get(boq.id) || []).filter((s) => s.boq_revision === boq.revision)
      : [];
    const totalItems = items.length;
    const approvedItems = items.filter((s) => s.approval_status === "approved").length;
    const directRows = boq
      ? (dsByBoq.get(boq.id) || []).filter((d) => d.boq_revision === boq.revision).length
      : 0;
    const inheritedRows = items.filter((s) => !!s.source_snapshot_id).length;
    const approvedSet = approvedRevByOaNumber.get(o.oa_number) || new Set<number>();
    let ancestorApproved = false;
    for (const r of approvedSet) if (r < o.revision) { ancestorApproved = true; break; }
    const status = classifyRow({
      hasBoq: !!boq,
      totalItems,
      approvedItems,
      directRows,
      inheritedRows,
      ancestorApproved,
    });
    rows.push({
      orderId: o.id,
      oaNumber: o.oa_number,
      oaRevision: o.revision,
      family: familyOf(o.oa_number),
      boqId: boq?.id ?? null,
      boqNumber: boq?.boq_number ?? null,
      boqRevision: boq?.revision ?? null,
      totalItems,
      approvedItems,
      directRows,
      inheritedRows,
      ancestorApproved,
      status,
    });
  }
  return rows;
}