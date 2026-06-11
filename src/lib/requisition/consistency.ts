import { supabase } from "@/integrations/supabase/client";

export interface ConsistencyRow {
  requisitionId: string;
  requisitionNumber: string;
  isGeneral: boolean;
  boqRef: string; // "OA / BOQ" string or "General"
  boqCount: number | null; // null = N/A
  fgCount: number;
  rmTotal: number;
  annexCreated: number;
  annexPending: number;
  boqVsFg: "match" | "mismatch" | "na";
  boqVsFgDelta: number; // fg - boq (when applicable)
  rmVsAnnex: "match" | "mismatch";
  rmVsAnnexDelta: number; // (created+pending) - total
  overall: "match" | "mismatch" | "na-ok";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const sb = supabase as any;

export async function loadConsistencyRows(): Promise<ConsistencyRow[]> {
  const [{ data: reqs }, { data: items }, { data: rms }, { data: ax }] = await Promise.all([
    sb.from("requisitions").select("id, requisition_number, boq_id, order_root_id, source, client_name_override").order("created_at", { ascending: false }),
    sb.from("requisition_items").select("id, requisition_id"),
    sb.from("requisition_raw_materials").select("id, requisition_id, annexure_status, annexure_id"),
    sb.from("requisition_annexures").select("id, status"),
  ]);

  const reqList = (reqs as Array<any>) || [];
  const boqIds = Array.from(new Set(reqList.map((r) => r.boq_id).filter(Boolean)));
  let boqs: Array<{ id: string; boq_number: string | null; reference_oa_number: string | null; line_items: unknown }> = [];
  if (boqIds.length) {
    const { data: b } = await sb.from("boqs").select("id, boq_number, reference_oa_number, line_items").in("id", boqIds);
    boqs = (b as any[]) || [];
  }
  const boqMap = new Map(boqs.map((b) => [b.id, b]));

  const axMap = new Map<string, string>(); // id -> status
  ((ax as Array<{ id: string; status?: string }>) || []).forEach((a) => axMap.set(a.id, a.status || "active"));

  const fgByReq = new Map<string, number>();
  ((items as Array<{ requisition_id: string }>) || []).forEach((it) => {
    fgByReq.set(it.requisition_id, (fgByReq.get(it.requisition_id) || 0) + 1);
  });

  type RmBucket = { total: number; created: number; pending: number };
  const rmByReq = new Map<string, RmBucket>();
  ((rms as Array<{ requisition_id: string; annexure_status: string | null; annexure_id: string | null }>) || []).forEach((r) => {
    const bucket = rmByReq.get(r.requisition_id) || { total: 0, created: 0, pending: 0 };
    bucket.total += 1;
    const linkedActive = r.annexure_id && axMap.get(r.annexure_id) !== "cancelled";
    if (r.annexure_status === "created" && linkedActive) bucket.created += 1;
    else bucket.pending += 1;
    rmByReq.set(r.requisition_id, bucket);
  });

  return reqList.map((r): ConsistencyRow => {
    const boq = r.boq_id ? boqMap.get(r.boq_id) : undefined;
    const isGeneral = !r.boq_id || r.source === "uploaded" && !boq;
    const boqLineItems = Array.isArray(boq?.line_items) ? (boq!.line_items as unknown[]).length : 0;
    const boqCount = boq ? boqLineItems : null;
    const fgCount = fgByReq.get(r.id) || 0;
    const bucket = rmByReq.get(r.id) || { total: 0, created: 0, pending: 0 };

    let boqVsFg: ConsistencyRow["boqVsFg"];
    let boqVsFgDelta = 0;
    if (boqCount == null) {
      boqVsFg = "na";
    } else {
      boqVsFgDelta = fgCount - boqCount;
      boqVsFg = boqVsFgDelta === 0 ? "match" : "mismatch";
    }

    const rmVsAnnexDelta = (bucket.created + bucket.pending) - bucket.total;
    const rmVsAnnex: ConsistencyRow["rmVsAnnex"] = rmVsAnnexDelta === 0 ? "match" : "mismatch";

    const overall: ConsistencyRow["overall"] =
      (boqVsFg === "mismatch" || rmVsAnnex === "mismatch") ? "mismatch"
      : (boqVsFg === "na") ? "na-ok"
      : "match";

    const boqRef = boq
      ? `${boq.reference_oa_number || "—"} / ${boq.boq_number || "—"}`
      : "General";

    return {
      requisitionId: r.id,
      requisitionNumber: r.requisition_number,
      isGeneral: boqCount == null,
      boqRef,
      boqCount,
      fgCount,
      rmTotal: bucket.total,
      annexCreated: bucket.created,
      annexPending: bucket.pending,
      boqVsFg,
      boqVsFgDelta,
      rmVsAnnex,
      rmVsAnnexDelta,
      overall,
    };
  });
}

export async function loadConsistencyForRequisition(reqId: string): Promise<ConsistencyRow | null> {
  const all = await loadConsistencyRows();
  return all.find((r) => r.requisitionId === reqId) || null;
}