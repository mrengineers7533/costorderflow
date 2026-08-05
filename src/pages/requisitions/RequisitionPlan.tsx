import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Check, Download, FileText, Loader2, Send } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  AnnexureRecord,
  AnnexureRowRecord,
  RequisitionItemRecord,
  RequisitionRawMaterialRecord,
  RequisitionRecord,
} from "@/lib/requisition/types";
import type { BoqRecord } from "@/lib/boq/types";
import type { OrderRecord } from "@/lib/orders/types";
import { buildMakeResolver } from "@/lib/boq/makeResolver";

import { consolidateRawMaterialType } from "@/lib/requisition/rawMaterialType";
import { planStatusFromCategory } from "@/lib/requisition/planStatus";
import { resolveMaterialCategory, type CategoryRule } from "@/lib/requisition/materialCategory";
import {
  buildVendorPriceIndex,
  lookupVendorPrice,
  type VendorItemPrice,
  type VendorPriceIndex,
} from "@/lib/requisition/vendorPricing";

const fmtQty2 = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return (Math.trunc(n * 100) / 100).toFixed(2);
};
const fmtQty2Input = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return (Math.trunc(n * 100) / 100).toFixed(2);
};

type PlanStatus =
  | "machine"
  | "3p"
  | "pipe"
  | "sheet_ss"
  | "sheet_ms"
  | "sheet_gi"
  | "structure"
  | "steel"; // legacy
const STATUS_LABEL: Record<PlanStatus, string> = {
  machine: "Machine",
  "3p": "3P / Third Party",
  pipe: "Pipe",
  sheet_ss: "Sheet SS",
  sheet_ms: "Sheet MS",
  sheet_gi: "Sheet GI",
  structure: "Structure",
  steel: "Steel (legacy)",
};
const ACTIVE_STATUSES: PlanStatus[] = [
  "machine",
  "3p",
  "pipe",
  "sheet_ss",
  "sheet_ms",
  "sheet_gi",
  "structure",
];
const REPORT_TITLE: Record<PlanStatus, string> = {
  machine: "Machine List",
  "3p": "Outside Purchase",
  pipe: "Pipe Annexure",
  sheet_ss: "Sheet SS Annexure",
  sheet_ms: "Sheet MS Annexure",
  sheet_gi: "Sheet GI Annexure",
  structure: "Structure Annexure",
  steel: "Steel List (legacy)",
};

// --- RM Category display merge: MS + SS sheets show as a single "Sheet" ---
// Display-only. Stored plan_status keeps sheet_ms / sheet_ss so annexure
// bucketing, reports and downstream pages are unchanged.
const MERGED_SHEET = "sheet";
const MERGED_OPTIONS: { value: string; label: string }[] = [
  { value: "machine", label: "Machine" },
  { value: "3p", label: "3P / Third Party" },
  { value: "pipe", label: "Pipe" },
  { value: MERGED_SHEET, label: "Sheet" },
  { value: "sheet_gi", label: "Sheet GI" },
  { value: "structure", label: "Structure" },
];
function toMergedCategory(s: PlanStatus | null | undefined): string {
  if (s === "sheet_ms" || s === "sheet_ss") return MERGED_SHEET;
  return s || "";
}

/**
 * Last-resort RM Category inference from the material / size text so that
 * annexure creation never hard-blocks on unmapped rows. Only used when the
 * row has no stored plan_status and no category rule matched.
 */
function inferPlanStatus(material: string, sizeModel?: string | null): PlanStatus {
  const t = `${material || ""} ${sizeModel || ""}`.toUpperCase();
  if (/\bGI\b/.test(t) && /SHEET|PLATE|COIL/.test(t)) return "sheet_gi";
  if (/SHEET|PLATE|COIL/.test(t)) return /\bSS\b|STAINLESS|304|316/.test(t) ? "sheet_ss" : "sheet_ms";
  if (/PIPE|TUBE/.test(t)) return "pipe";
  if (/ANGLE|CHANNEL|BEAM|FLAT|ISMC|ISMB|SQUARE BAR|ROUND BAR|STRUCTURE/.test(t)) return "structure";
  if (/MOTOR|MACHINE|BLOWER|FAN|PUMP|GEAR/.test(t)) return "machine";
  return "3p";
}
/** Resolve a merged selection back to a concrete stored plan_status. */
function fromMergedCategory(v: string, current: PlanStatus | null | undefined, material: string): PlanStatus {
  if (v !== MERGED_SHEET) return v as PlanStatus;
  if (current === "sheet_ms" || current === "sheet_ss") return current;
  return /\bss\b|stainless/i.test(material || "") ? "sheet_ss" : "sheet_ms";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export default function RequisitionPlan() {
  const [sp] = useSearchParams();
  const ids = useMemo(
    () => (sp.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean),
    [sp],
  );

  const [reqs, setReqs] = useState<RequisitionRecord[]>([]);
  const [items, setItems] = useState<RequisitionItemRecord[]>([]);
  const [rms, setRms] = useState<RequisitionRawMaterialRecord[]>([]);
  const [boqs, setBoqs] = useState<Record<string, BoqRecord>>({});
  const [orders, setOrders] = useState<Record<string, OrderRecord>>({});
  const [annexures, setAnnexures] = useState<AnnexureRecord[]>([]);
  const [annexureRows, setAnnexureRows] = useState<AnnexureRowRecord[]>([]);
  const [vendorPrices, setVendorPrices] = useState<VendorItemPrice[]>([]);
  const [categoryRules, setCategoryRules] = useState<CategoryRule[]>([]);
  const [annexureMeta, setAnnexureMeta] = useState<Record<string, { created_at: string; lot_numbers: string[] }>>({});
  const [activeAnnexureId, setActiveAnnexureId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("generated");
  // Pre-select lots / tab passed via query string (e.g. recreate from Annexure Folder)
  useEffect(() => {
    const relot = sp.get("relotSelect");
    if (relot) {
      const wanted = relot.split(",").map((s) => s.trim()).filter(Boolean);
      if (wanted.length) setSelectedLots(new Set(wanted));
    }
    const t = sp.get("tab");
    if (t === "raw" || t === "generated" || t === "reports") setTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [reportMode, setReportMode] = useState<"live" | "saved">("live");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // Lot-wise selection state for annexure creation (Raw Materials tab)
  const [selectedLots, setSelectedLots] = useState<Set<string>>(new Set());
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());
  const [excludedRowKeys, setExcludedRowKeys] = useState<Set<string>>(new Set());

  // ---- Debounced autosave plumbing ----
  // pendingPatches keyed by `${table}:${id}` -> merged patch
  const pendingRef = useRef<Map<string, { table: "requisition_items" | "requisition_raw_materials"; id: string; patch: Record<string, unknown> }>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleFlush() {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    setSaveStatus("saving");
    flushTimerRef.current = setTimeout(flushPending, 600);
  }

  async function flushPending() {
    const entries = Array.from(pendingRef.current.values());
    pendingRef.current.clear();
    if (entries.length === 0) { setSaveStatus("saved"); return; }
    try {
      await Promise.all(entries.map((e) =>
        sb.from(e.table).update(e.patch).eq("id", e.id).then((res: { error: unknown }) => {
          if (res.error) throw res.error;
        })
      ));
      setSaveStatus("saved");
    } catch (err) {
      const e = err as { message?: string; details?: string; hint?: string; code?: string } | null;
      const msg =
        (e && (e.message || e.details || e.hint))
          ? [e.message, e.details, e.hint].filter(Boolean).join(" — ")
          : (err instanceof Error ? err.message : (() => { try { return JSON.stringify(err); } catch { return String(err); } })());
      setSaveStatus("error");
      toast({ title: "Autosave failed", description: msg, variant: "destructive" });
    }
  }

  function queuePatch(table: "requisition_items" | "requisition_raw_materials", id: string, patch: Record<string, unknown>) {
    const key = `${table}:${id}`;
    const existing = pendingRef.current.get(key);
    pendingRef.current.set(key, {
      table,
      id,
      patch: { ...(existing?.patch || {}), ...patch },
    });
    scheduleFlush();
  }

  // Optimistic local updaters (also push to autosave queue)
  function patchItem(id: string, patch: Partial<RequisitionItemRecord>) {
    setItems((prev) => prev.map((x) => x.id === id ? { ...x, ...patch } as RequisitionItemRecord : x));
    queuePatch("requisition_items", id, patch as Record<string, unknown>);
  }
  function patchItemMake(id: string, make: string) {
    setItems((prev) => prev.map((x) => {
      if (x.id !== id) return x;
      const snap = { ...(x.fg_snapshot as Record<string, unknown> | null || {}), make };
      return { ...x, fg_snapshot: snap } as RequisitionItemRecord;
    }));
    // persist into fg_snapshot
    const current = items.find((x) => x.id === id);
    const snap = { ...((current?.fg_snapshot as Record<string, unknown>) || {}), make };
    queuePatch("requisition_items", id, { fg_snapshot: snap });
  }
  function patchRm(id: string, patch: Partial<RequisitionRawMaterialRecord>) {
    setRms((prev) => prev.map((x) => x.id === id ? { ...x, ...patch } as RequisitionRawMaterialRecord : x));
    queuePatch("requisition_raw_materials", id, patch as Record<string, unknown>);
  }
  /** Apply one Lot number to every RM row of a single Finished Good group. */
  function setGroupLot(rows: { id: string; lot_no?: string | null }[], lot: string | null) {
    rows.forEach((r) => {
      if ((r.lot_no || null) === lot) return;
      patchRm(r.id, { lot_no: lot } as Partial<RequisitionRawMaterialRecord>);
    });
  }

  async function load() {
    if (ids.length === 0) { setLoading(false); return; }
    const [{ data: r }, { data: its }, { data: rmRows }] = await Promise.all([
      sb.from("requisitions").select("*").in("id", ids),
      sb.from("requisition_items").select("*").in("requisition_id", ids),
      sb.from("requisition_raw_materials").select("*").in("requisition_id", ids),
    ]);
    const rList = (r as RequisitionRecord[]) || [];
    setReqs(rList);
    // Vendor Item Master + category rules (used for auto-fill / auto-resolve)
    const [{ data: vip }, { data: rules }] = await Promise.all([
      sb.from("vendor_item_prices").select("*"),
      sb.from("rm_category_rules").select("pattern,category,priority,active").eq("active", true),
    ]);
    const vipRows = (vip as VendorItemPrice[]) || [];
    setVendorPrices(vipRows);
    setCategoryRules((rules as CategoryRule[]) || []);
    const itemsList = (its as RequisitionItemRecord[]) || [];
    let rmList = (rmRows as RequisitionRawMaterialRecord[]) || [];
    setItems(itemsList);

    // Bootstrap raw-material rows for general (non-BOQ) requisitions so
    // their items show in the Generated/Raw tabs and support lot/status edits.
    const generalReqIds = new Set(
      rList
        .filter((r) => ((r as unknown as { kind?: string }).kind === "general") || !r.boq_id)
        .map((r) => r.id),
    );
    if (generalReqIds.size > 0) {
      const rmItemIds = new Set(rmList.map((x) => x.requisition_item_id).filter(Boolean) as string[]);
      const toCreate = itemsList
        .filter((it) => generalReqIds.has(it.requisition_id) && !rmItemIds.has(it.id))
        .map((it) => {
          const snap = (it.fg_snapshot as Record<string, unknown> | null) || {};
          const make = typeof snap.make === "string" ? (snap.make as string) : null;
          const material = (typeof snap.material === "string" && (snap.material as string).trim())
            ? (snap.material as string).trim()
            : (it.description || it.model_number || "Item");
          const size = (typeof snap.size_model === "string" && (snap.size_model as string).trim())
            ? (snap.size_model as string).trim()
            : (it.model_number || null);
          const qty = it.quantity != null ? Number(it.quantity) : null;
          return {
            requisition_id: it.requisition_id,
            requisition_item_id: it.id,
            model_number: it.model_number || it.description || null,
            material,
            size_model: size,
            make,
            unit: it.unit,
            qty_per_unit: 1,
            fg_quantity: qty,
            required_qty: qty,
            source: "manual" as const,
            purchase_status: "pending" as const,
            notes: it.remarks || null,
          };
        });
      if (toCreate.length > 0) {
        const { data: inserted, error: insErr } = await sb
          .from("requisition_raw_materials")
          .insert(toCreate)
          .select("*");
        if (insErr) {
          console.error("[plan] bootstrap general rm rows failed", insErr);
        } else if (inserted) {
          rmList = [...rmList, ...(inserted as RequisitionRawMaterialRecord[])];
        }
      }
    }
    // Auto-fill Price / Vendor from the Vendor Item Master for rows that
    // have neither value yet. Values stay fully editable afterwards.
    if (vipRows.length) {
      const idx = buildVendorPriceIndex(vipRows);
      const fills: Array<{ id: string; rm_price: number | null; vendor_name: string | null }> = [];
      rmList = rmList.map((rm) => {
        const hasPrice = rm.rm_price != null;
        const hasVendor = !!(rm.vendor_name && String(rm.vendor_name).trim());
        if (hasPrice && hasVendor) return rm;
        const hit = lookupVendorPrice(idx, rm.material, rm.size_model);
        if (!hit) return rm;
        const next = {
          ...rm,
          rm_price: hasPrice ? rm.rm_price : (hit.price ?? null),
          vendor_name: hasVendor ? rm.vendor_name : (hit.vendor_name || null),
        } as RequisitionRawMaterialRecord;
        if (next.rm_price !== rm.rm_price || next.vendor_name !== rm.vendor_name) {
          fills.push({ id: rm.id, rm_price: next.rm_price ?? null, vendor_name: next.vendor_name ?? null });
        }
        return next;
      });
      await Promise.all(fills.map((f) =>
        sb.from("requisition_raw_materials")
          .update({ rm_price: f.rm_price, vendor_name: f.vendor_name })
          .eq("id", f.id)));
    }
    setRms(rmList);
    // Labels for the item-wise Annexure column
    const axIds = Array.from(new Set(rmList.map((x) => x.annexure_id).filter(Boolean) as string[]));
    if (axIds.length) {
      const { data: axMeta } = await sb
        .from("requisition_annexures")
        .select("id,created_at,lot_numbers")
        .in("id", axIds);
      const meta: Record<string, { created_at: string; lot_numbers: string[] }> = {};
      ((axMeta as Array<{ id: string; created_at: string; lot_numbers: string[] }>) || []).forEach((a) => {
        meta[a.id] = { created_at: a.created_at, lot_numbers: a.lot_numbers || [] };
      });
      setAnnexureMeta(meta);
    }
    const boqIds = Array.from(new Set(rList.map((x) => x.boq_id)));
    const nonNullBoqIds = boqIds.filter(Boolean) as string[];
    if (nonNullBoqIds.length) {
      const { data: b } = await supabase.from("boqs").select("*").in("id", nonNullBoqIds);
      const bm: Record<string, BoqRecord> = {};
      ((b as unknown as BoqRecord[]) || []).forEach((x) => { bm[x.id] = x; });
      setBoqs(bm);
      const oaIds = Array.from(new Set(((b as unknown as BoqRecord[]) || [])
        .map((x) => (x as { source_order_id?: string; order_id?: string }).source_order_id || x.order_id)
        .filter(Boolean)));
      if (oaIds.length) {
        const { data: oRows } = await supabase.from("orders").select("*").in("id", oaIds);
        const om: Record<string, OrderRecord> = {};
        ((oRows as unknown as OrderRecord[]) || []).forEach((x) => { om[x.id] = x; });
        setOrders(om);
      }
    }
    // most recent annexure that covers exactly this set of reqs
    const { data: ax } = await sb.from("requisition_annexures").select("*").order("created_at", { ascending: false }).limit(50);
    const matching = ((ax as AnnexureRecord[]) || []).filter((a) => {
      const s = new Set(a.requisition_ids);
      return ids.length === s.size && ids.every((i) => s.has(i));
    });
    setAnnexures(matching);
    if (matching[0]) {
      setActiveAnnexureId(matching[0].id);
      const { data: axr } = await sb.from("requisition_annexure_rows").select("*").eq("annexure_id", matching[0].id);
      setAnnexureRows((axr as AnnexureRowRecord[]) || []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ids.join(",")]);

  // Make resolver per BOQ
  const makeResolvers = useMemo(() => {
    const m = new Map<string, (it: RequisitionItemRecord) => string>();
    Object.values(boqs).forEach((b) => {
      const oaId = (b as { source_order_id?: string; order_id?: string }).source_order_id || b.order_id;
      const oa = oaId ? orders[oaId] : null;
      const fromOa = buildMakeResolver(oa?.line_items);
      const boqItems = Array.isArray(b.line_items) ? b.line_items : [];
      const byId = new Map(boqItems.map((bi, i) => [bi.id, { item: bi, index: i }] as const));
      m.set(b.id, (it) => {
        const snap = (it.fg_snapshot as { make?: string } | null)?.make;
        if (snap && snap.trim()) return snap.trim();
        const hit = byId.get(it.boq_item_id);
        if (hit) return fromOa(hit.item, hit.index);
        return "";
      });
    });
    return m;
  }, [boqs, orders]);

  const reqById = useMemo(() => {
    const m = new Map<string, RequisitionRecord>();
    reqs.forEach((r) => m.set(r.id, r));
    return m;
  }, [reqs]);

  const itemById = useMemo(() => {
    const m = new Map<string, RequisitionItemRecord>();
    items.forEach((it) => m.set(it.id, it));
    return m;
  }, [items]);

  function resolveMake(it: RequisitionItemRecord): string {
    const r = reqById.get(it.requisition_id);
    if (!r) return "";
    const fn = makeResolvers.get(r.boq_id);
    return fn ? fn(it) : "";
  }

  // Build flat generated rows grouped by (reqId, fgItemId)
  type Group = { reqNo: string; item: RequisitionItemRecord | null; fgLabel: string; fgName: string; fgCode: string; rms: RequisitionRawMaterialRecord[] };
  const groups: Group[] = useMemo(() => {
    const order: string[] = [];
    const buckets = new Map<string, Group>();
    rms.forEach((rm) => {
      const req = reqById.get(rm.requisition_id);
      const reqNo = req?.requisition_number || "—";
      const key = `${rm.requisition_id}::${rm.requisition_item_id || "_m_" + (rm.model_number || "")}`;
      let g = buckets.get(key);
      if (!g) {
        const it = rm.requisition_item_id ? itemById.get(rm.requisition_item_id) || null : null;
        g = {
          reqNo,
          item: it,
          fgLabel: it?.model_number || it?.description || rm.model_number || "—",
          fgName: it?.description || it?.model_number || rm.model_number || "—",
          fgCode: it?.model_number || rm.model_number || "",
          rms: [],
        };
        buckets.set(key, g);
        order.push(key);
      }
      g.rms.push(rm);
    });
    return order.map((k) => buckets.get(k)!);
  }, [rms, reqById, itemById]);

  // Legacy direct-save helper kept for spots that don't need debouncing (none after refactor)

  // Consolidate raw materials by material+size+make+unit+lot+status
  type ConsKey = string;
  type ConsRow = {
    key: ConsKey;
    material: string;
    size_model: string | null;
    make: string | null;
    unit: string | null;
    lot_no: string | null;
    plan_status: PlanStatus | null;
    total: number;
    sourceRmIds: string[];
    sourceReqNos: string[];
    annexureCount: number; // number of source rms already in an annexure
    annexureIds: string[];
    raw_material_type: string | null;
    rawTypeValues: Array<string | null | undefined>;
  };
  const consolidated: ConsRow[] = useMemo(() => {
    const map = new Map<ConsKey, ConsRow>();
    rms.forEach((rm) => {
      const key = [
        (rm.material || "").trim().toLowerCase(),
        (rm.size_model || "").trim().toLowerCase(),
        (rm.make || "").trim().toLowerCase(),
        (rm.unit || "").trim().toLowerCase(),
        (rm.lot_no || "").trim().toLowerCase(),
        (rm.plan_status || "").trim().toLowerCase(),
      ].join("|");
      let row = map.get(key);
      if (!row) {
        row = {
          key,
          material: rm.material,
          size_model: rm.size_model || null,
          make: rm.make || null,
          unit: rm.unit || null,
          lot_no: rm.lot_no || null,
          plan_status: (rm.plan_status as PlanStatus | null) || null,
          total: 0,
          sourceRmIds: [],
          sourceReqNos: [],
          annexureCount: 0,
          annexureIds: [],
          raw_material_type: null,
          rawTypeValues: [],
        };
        map.set(key, row);
      }
      row.total += Number(rm.required_qty || 0);
      row.sourceRmIds.push(rm.id);
      row.rawTypeValues.push((rm as { raw_material_type?: string | null }).raw_material_type);
      if (rm.annexure_status === "created") {
        row.annexureCount += 1;
        if (rm.annexure_id && !row.annexureIds.includes(rm.annexure_id)) row.annexureIds.push(rm.annexure_id);
      }
      const reqNo = reqById.get(rm.requisition_id)?.requisition_number;
      if (reqNo && !row.sourceReqNos.includes(reqNo)) row.sourceReqNos.push(reqNo);
    });
    const out = Array.from(map.values());
    out.forEach((r) => { r.raw_material_type = consolidateRawMaterialType(r.rawTypeValues); });
    return out.sort((a, b) => a.material.localeCompare(b.material));
  }, [rms, reqById]);

  function bulkPatch(rmIds: string[], patch: Partial<RequisitionRawMaterialRecord>) {
    rmIds.forEach((id) => patchRm(id, patch));
  }

  /** Short, stable label for an annexure shown on item rows. */
  function annexureLabel(id: string): string {
    const meta = annexureMeta[id];
    const short = `AX-${id.slice(0, 8).toUpperCase()}`;
    if (!meta) return short;
    const lots = (meta.lot_numbers || []).join(", ");
    return lots ? `${short} • Lot ${lots}` : short;
  }

  // Rows can be selected individually or through their lot. An explicitly
  // unchecked row remains excluded from a selected lot.
  function isRowSelected(c: { key: string; lot_no: string | null; plan_status: PlanStatus | null; annexureCount: number; sourceRmIds: string[] }) {
    if (!c.lot_no) return false;
    if (!c.plan_status) return false; // RM Category must be filled
    if (c.annexureCount >= c.sourceRmIds.length) return false; // fully created already
    if (selectedRowKeys.has(c.key)) return true;
    return selectedLots.has(c.lot_no) && !excludedRowKeys.has(c.key);
  }

  async function createAnnexure() {
    const eligible = consolidated.filter(isRowSelected);
    if (eligible.length === 0) {
      toast({
        title: "No eligible rows selected",
        description: "An annexure can only be created for rows that have both a Lot Number and an RM Category filled in.",
        variant: "destructive",
      });
      return;
    }
    const eligibleResolved = eligible.map((c) => ({ ...c, plan_status: c.plan_status as PlanStatus }));
    const lots = Array.from(new Set(eligibleResolved.map((c) => c.lot_no!).filter(Boolean)));
    const { data: { user } } = await supabase.auth.getUser();
    const { data: ax, error: e1 } = await sb.from("requisition_annexures").insert({
      requisition_ids: ids,
      lot_numbers: lots,
      created_by: user?.id ?? null,
    }).select("*").maybeSingle();
    if (e1 || !ax) { toast({ title: "Create failed", description: e1?.message, variant: "destructive" }); return; }
    const rows = eligibleResolved.map((c) => ({
      annexure_id: (ax as AnnexureRecord).id,
      lot_no: c.lot_no!,
      plan_status: c.plan_status!,
      material: c.material,
      size_model: c.size_model,
      make: c.make,
      unit: c.unit,
      total_qty: c.total,
      source_rm_ids: c.sourceRmIds,
      raw_material_type: c.raw_material_type,
    }));
    const { data: axRows, error: e2 } = await sb.from("requisition_annexure_rows").insert(rows).select("*");
    if (e2) { toast({ title: "Create failed", description: e2.message, variant: "destructive" }); return; }
    // Mark contributing raw materials as annexure_status='created'
    const contributingRmIds = Array.from(new Set(eligibleResolved.flatMap((c) => c.sourceRmIds)));
    const newAxId = (ax as AnnexureRecord).id;
    const { error: e3 } = await sb.from("requisition_raw_materials")
      .update({ annexure_status: "created", annexure_id: newAxId })
      .in("id", contributingRmIds);
    if (e3) { toast({ title: "Status sync failed", description: e3.message, variant: "destructive" }); }
    setRms((prev) => prev.map((x) => contributingRmIds.includes(x.id)
      ? { ...x, annexure_status: "created" as const, annexure_id: newAxId }
      : x));
    setAnnexures((p) => [ax as AnnexureRecord, ...p]);
    setAnnexureRows((axRows as AnnexureRowRecord[]) || []);
    setActiveAnnexureId((ax as AnnexureRecord).id);
    setAnnexureMeta((p) => ({
      ...p,
      [newAxId]: { created_at: (ax as AnnexureRecord).created_at, lot_numbers: lots },
    }));
    setSelectedLots(new Set());
    setSelectedRowKeys(new Set());
    setExcludedRowKeys(new Set());
    toast({
      title: "Annexure created",
      description: `${rows.length} consolidated row(s) across ${lots.length} lot(s).`,
    });
    setTab("reports");
  }

  async function forwardToPurchase() {
    const missing = groups.filter((g) => !g.rms.some((r) => (r.lot_no || "").trim()) || g.rms.some((r) => !(r.lot_no || "").trim()));
    if (missing.length) {
      const g = missing[0];
      toast({
        title: "Lot Number required",
        description: `Please enter the Lot Number for Finished Good '${g.fgLabel}' before forwarding.`,
        variant: "destructive",
      });
      return;
    }
    const { error } = await sb.from("requisitions").update({ status: "in_purchase" }).in("id", ids);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Forwarded to Purchase", description: `${ids.length} requisition(s) marked in_purchase.` });
    setReqs((p) => p.map((r) => ({ ...r, status: "in_purchase" })));
  }

  const activeAnnexure = annexures.find((a) => a.id === activeAnnexureId) || null;
  const reportRows = annexureRows.filter((r) => r.annexure_id === activeAnnexureId);

  // Live report rows derived from current consolidated state
  type LiveAnnexureRow = AnnexureRowRecord & { _createdState?: "created" | "partial" | "none" };
  const liveReportRows: LiveAnnexureRow[] = useMemo(() => consolidated
    .filter((c) => c.plan_status)
    .map((c, i) => {
      const state: "created" | "partial" | "none" =
        c.annexureCount >= c.sourceRmIds.length && c.sourceRmIds.length > 0 ? "created"
        : c.annexureCount > 0 ? "partial" : "none";
      return {
        id: `live-${i}`,
        annexure_id: "live",
        lot_no: c.lot_no || "",
        plan_status: c.plan_status as PlanStatus,
        material: c.material,
        size_model: c.size_model,
        make: c.make,
        unit: c.unit,
        total_qty: c.total,
        source_rm_ids: c.sourceRmIds,
        created_at: "",
        updated_at: "",
        _createdState: state,
      };
    }), [consolidated]);

  const displayReportRows = reportMode === "live" || !activeAnnexure ? liveReportRows : reportRows;
  const displayLotNumbers = reportMode === "live" || !activeAnnexure
    ? Array.from(new Set(consolidated.map((c) => c.lot_no).filter(Boolean) as string[]))
    : (activeAnnexure?.lot_numbers || []);

  function downloadReportPdf(kind: PlanStatus) {
    const rows = displayReportRows.filter((r) => r.plan_status === kind);
    const doc = new jsPDF({ orientation: "landscape" });
    const title = `${STATUS_LABEL[kind]} — Annexure`;
    doc.setFontSize(14); doc.text(title, 14, 14);
    doc.setFontSize(10);
    const lots = Array.from(new Set(rows.map((r) => r.lot_no))).join(", ");
    doc.text(`Lot Number(s): ${lots || "—"}`, 14, 22);
    doc.text(`Requisitions: ${reqs.map((r) => r.requisition_number).join(", ")}`, 14, 28);
    if (reportMode === "live") doc.text(`Live preview generated ${new Date().toLocaleString("en-IN")}`, 14, 32);
    const total = rows.reduce((s, r) => s + Number(r.total_qty || 0), 0);
    autoTable(doc, {
      startY: reportMode === "live" ? 38 : 34,
      head: [["Lot", "Raw Material", "Size", "BOQ/OA Number", "UOM", "Total Qty"]],
      body: rows.map((r) => [
        r.lot_no,
        r.material,
        r.size_model || "—",
        r.make || "—",
        r.unit || "—",
        String(r.total_qty ?? "—"),
      ]),
      foot: [["", "", "", "", "Grand Total", String(total)]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [40, 40, 40] },
    });
    doc.save(`${kind}_annexure.pdf`);
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (ids.length === 0) return <div className="p-6 text-sm text-muted-foreground">No requisitions selected. <Link to="/requisitions" className="underline">Back</Link></div>;

  const distinctLots = new Set(rms.map((r) => r.lot_no).filter(Boolean));

  return (
    <div className="container mx-auto px-4 lg:px-6 py-5 space-y-5">
      <datalist id="vendor-item-master-names">
        {Array.from(new Set(vendorPrices.map((v) => v.vendor_name).filter(Boolean))).map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Requisition Planning ({ids.length})</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {reqs.map((r) => r.requisition_number).join(" · ")}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/requisitions"><Button variant="outline" size="sm">Back</Button></Link>
          <Link to="/requisitions/annexures"><Button variant="outline" size="sm"><FileText className="mr-1 h-4 w-4" />Annexure Folder</Button></Link>
          <Button size="sm" onClick={forwardToPurchase}><Send className="mr-1 h-4 w-4" />Forward to Purchase</Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        {saveStatus === "saving" && (<><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>)}
        {saveStatus === "saved" && (<><Check className="h-3 w-3 text-green-600" /> All edits saved</>)}
        {saveStatus === "error" && <span className="text-destructive">Autosave failed — retry by editing again.</span>}
      </div>

      <Card>
        <CardContent className="py-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <div><span className="font-semibold text-foreground">{items.length}</span> Finished Goods</div>
          <div><span className="font-semibold text-foreground">{rms.length}</span> RM rows</div>
          <div><span className="font-semibold text-foreground">{consolidated.length}</span> consolidated</div>
          <div><span className="font-semibold text-foreground">{distinctLots.size}</span> distinct lots</div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="generated">Generated Requisition</TabsTrigger>
          <TabsTrigger value="raw">Raw Materials</TabsTrigger>
          <TabsTrigger value="reports">Annexure Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="generated">
          <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm">Consolidated generated requisition</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm border">
                <thead className="text-xs text-muted-foreground border-b bg-muted/40">
                  <tr>
                    <th className="text-left py-2 px-2 border-r">Finished Good</th>
                    <th className="text-left py-2 px-2 border-r">Make</th>
                    <th className="text-right py-2 px-2 border-r">Qty</th>
                    <th className="text-left py-2 px-2 border-r">Raw Material</th>
                    <th className="text-left py-2 px-2 border-r">Size</th>
                    <th className="text-right py-2 px-2 border-r">RM Qty</th>
                    <th className="text-left py-2 px-2 border-r">BOQ/OA Number</th>
                    <th className="text-left py-2 px-2 border-r">UOM</th>
                    <th className="text-left py-2 px-2 border-r">Lot</th>
                    <th className="text-left py-2 px-2 border-r">RM Category</th>
                    <th className="text-right py-2 px-2 border-r">Price</th>
                    <th className="text-left py-2 px-2 border-r">Vendor</th>
                    <th className="text-left py-2 px-2">Annexure</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.length === 0 ? (
                    <tr><td colSpan={12} className="py-4 text-center text-muted-foreground">No raw materials.</td></tr>
                  ) : groups.flatMap((g) => {
                    const fgLabel = `[${g.reqNo}] ${g.fgLabel}`;
                    const fgMake = g.item ? resolveMake(g.item) : "";
                          const fgQty = fmtQty2(g.item?.quantity);
                    return g.rms.map((r, idx) => (
                      <tr key={r.id} className="border-b last:border-0">
                        {idx === 0 && (
                          <>
                            <td className="py-2 px-1 align-top border-r" rowSpan={g.rms.length}>
                              <div className="text-sm font-semibold leading-tight">{g.fgName}</div>
                              {g.fgCode && <div className="text-[10px] text-muted-foreground">Code: {g.fgCode}</div>}
                              <div className="text-[10px] text-muted-foreground mb-0.5">Requisition: {g.reqNo}</div>
                              {g.item ? (
                                <Input
                                  className="h-7 w-44 text-sm"
                                  defaultValue={g.item.model_number || g.item.description || ""}
                                  onBlur={(e) => {
                                    const v = e.target.value.trim();
                                    if (!g.item) return;
                                    if ((g.item.model_number || "") === v) return;
                                    patchItem(g.item.id, { model_number: v });
                                  }}
                                />
                              ) : <span className="text-sm">{g.fgLabel}</span>}
                              <div className="mt-1.5 flex items-center gap-1.5">
                                <span className="text-[10px] text-muted-foreground">Lot:</span>
                                <Input
                                  key={`lot-${g.rms.map((x) => x.lot_no || "").join("|")}`}
                                  className="h-7 w-20 text-sm"
                                  defaultValue={g.rms.find((x) => (x.lot_no || "").trim())?.lot_no || ""}
                                  onBlur={(e) => setGroupLot(g.rms, e.target.value.trim() || null)}
                                />
                              </div>
                            </td>
                            <td className="py-2 px-1 align-top border-r" rowSpan={g.rms.length}>
                              {g.item ? (
                                <Input
                                  className="h-7 w-28 text-sm"
                                  defaultValue={fgMake}
                                  onBlur={(e) => {
                                    const v = e.target.value.trim();
                                    if (!g.item) return;
                                    if (fgMake === v) return;
                                    patchItemMake(g.item.id, v);
                                  }}
                                />
                              ) : "—"}
                            </td>
                            <td className="py-2 px-1 align-top border-r text-right" rowSpan={g.rms.length}>
                              {g.item ? (
                                <Input
                                  type="number"
                                  className="h-7 w-20 text-sm text-right"
                                  defaultValue={fmtQty2Input(g.item.quantity)}
                                  onBlur={(e) => {
                                    const raw = e.target.value.trim();
                                    const v = raw === "" ? null : Math.max(0, Number(raw));
                                    if (!g.item) return;
                                    if ((g.item.quantity ?? null) === v) return;
                                    patchItem(g.item.id, { quantity: v });
                                  }}
                                />
                              ) : fgQty}
                            </td>
                          </>
                        )}
                        <td className="py-2 px-1 border-r">
                          <Input className="h-7 w-40 text-sm" defaultValue={r.material}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (r.material === v) return;
                              patchRm(r.id, { material: v });
                            }} />
                        </td>
                        <td className="py-2 px-1 border-r">
                          <Input className="h-7 w-28 text-sm" defaultValue={r.size_model || ""}
                            onBlur={(e) => {
                              const v = e.target.value.trim() || null;
                              if ((r.size_model || null) === v) return;
                              patchRm(r.id, { size_model: v });
                            }} />
                        </td>
                        <td className="py-2 px-1 border-r text-right">
                          <Input type="number" className="h-7 w-20 text-sm text-right" defaultValue={fmtQty2Input(r.required_qty)}
                            onBlur={(e) => {
                              const raw = e.target.value.trim();
                              const v = raw === "" ? null : Math.max(0, Number(raw));
                              if ((r.required_qty ?? null) === v) return;
                              patchRm(r.id, { required_qty: v });
                            }} />
                        </td>
                        <td className="py-2 px-1 border-r">
                          <Input className="h-7 w-24 text-sm" defaultValue={r.make || ""}
                            onBlur={(e) => {
                              const v = e.target.value.trim() || null;
                              if ((r.make || null) === v) return;
                              patchRm(r.id, { make: v });
                            }} />
                        </td>
                        <td className="py-2 px-1 border-r">
                          <Input className="h-7 w-16 text-sm" defaultValue={r.unit || ""}
                            onBlur={(e) => {
                              const v = e.target.value.trim() || null;
                              if ((r.unit || null) === v) return;
                              patchRm(r.id, { unit: v });
                            }} />
                        </td>
                        <td className="py-2 px-1 border-r">
                          <Input
                            className="h-7 w-24 text-sm bg-muted/50"
                            value={r.lot_no || ""}
                            readOnly
                            title="Set the Lot number once on the Finished Good group"
                          />
                        </td>
                        <td className="py-2 px-1 border-r">
                          <Select
                            value={toMergedCategory(r.plan_status as PlanStatus | null)}
                            onValueChange={(v) =>
                              patchRm(r.id, {
                                plan_status: fromMergedCategory(v, r.plan_status as PlanStatus | null, r.material),
                              })
                            }
                          >
                            <SelectTrigger className="h-7 w-36 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              {MERGED_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                              {r.plan_status === "steel" && (
                                <SelectItem value="steel">Steel (legacy)</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-2 px-1 border-r text-right">
                          <Input
                            type="number"
                            className="h-7 w-24 text-sm text-right"
                            defaultValue={r.rm_price == null ? "" : String(r.rm_price)}
                            onBlur={(e) => {
                              const raw = e.target.value.trim();
                              const v = raw === "" ? null : Number(raw);
                              if ((r.rm_price ?? null) === v) return;
                              patchRm(r.id, { rm_price: v });
                            }}
                          />
                        </td>
                        <td className="py-2 px-1 border-r">
                          <Input
                            className="h-7 w-36 text-sm"
                            defaultValue={r.vendor_name || ""}
                            list="vendor-item-master-names"
                            onBlur={(e) => {
                              const v = e.target.value.trim() || null;
                              if ((r.vendor_name || null) === v) return;
                              patchRm(r.id, { vendor_name: v });
                            }}
                          />
                        </td>
                        <td className="py-2 px-1">
                          {r.annexure_id ? (
                            <Link
                              to={`/requisitions/annexures?annexureId=${r.annexure_id}`}
                              className="text-[11px] underline text-primary"
                            >
                              {annexureLabel(r.annexure_id)}
                            </Link>
                          ) : r.annexure_status === "created" ? (
                            <Badge variant="secondary" className="text-[10px]">Annexure Created</Badge>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="raw">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 py-3">
              <div>
                <CardTitle className="text-sm">Raw materials (consolidated)</CardTitle>
                <p className="text-[11px] text-muted-foreground mt-1">Auto-derived from Generated Requisition. Edit values in the Generated Requisition tab.</p>
              </div>
              <Button size="sm" onClick={createAnnexure}><FileText className="mr-1 h-4 w-4" />Create Annexure for Selection</Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {(() => {
                const lotsAvailable = Array.from(new Set(consolidated.map((c) => c.lot_no).filter(Boolean) as string[]));
                const hasNoLotRows = consolidated.some((c) => !c.lot_no);
                const eligibleCount = consolidated.filter(isRowSelected).length;
                return (
                  <div className="mb-3 rounded border bg-muted/30 p-2.5 text-xs">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="font-medium text-foreground">Select Lot(s) or individual row(s):</span>
                      <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={() => setSelectedLots(new Set(lotsAvailable))}>Select all</Button>
                      <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={() => { setSelectedLots(new Set()); setSelectedRowKeys(new Set()); setExcludedRowKeys(new Set()); }}>Clear</Button>
                      <span className="ml-auto text-muted-foreground">{eligibleCount} row(s) eligible</span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {lotsAvailable.length === 0 ? (
                        <span className="text-muted-foreground">No lots set yet. Add Lot numbers in the Generated Requisition tab.</span>
                      ) : lotsAvailable.map((lot) => (
                        <label key={lot} className="inline-flex items-center gap-1.5 cursor-pointer">
                          <Checkbox
                            checked={selectedLots.has(lot)}
                            onCheckedChange={(v) => {
                              setSelectedLots((prev) => {
                                const next = new Set(prev);
                                if (v) next.add(lot); else next.delete(lot);
                                return next;
                              });
                            }}
                          />
                          <span>{lot}</span>
                        </label>
                      ))}
                      {hasNoLotRows && (
                        <span className="text-muted-foreground italic">(some rows have no Lot — set Lot first)</span>
                      )}
                    </div>
                  </div>
                );
              })()}
              <table className="w-full text-sm border">
                <thead className="text-xs text-muted-foreground border-b bg-muted/40">
                  <tr>
                    <th className="w-8 py-2 px-2 border-r"></th>
                    <th className="text-left py-2 px-2 border-r">Raw Material</th>
                    <th className="text-left py-2 px-2 border-r">Size</th>
                    <th className="text-left py-2 px-2 border-r">BOQ/OA Number</th>
                    <th className="text-left py-2 px-2 border-r">UOM</th>
                    <th className="text-right py-2 px-2 border-r">Total Qty</th>
                    <th className="text-left py-2 px-2 border-r">Lot</th>
                    <th className="text-left py-2 px-2 border-r">RM Category</th>
                    <th className="text-left py-2 px-2 border-r">Source Req(s)</th>
                    <th className="text-left py-2 px-2">Annexure</th>
                  </tr>
                </thead>
                <tbody>
                  {consolidated.length === 0 ? (
                    <tr><td colSpan={10} className="py-4 text-center text-muted-foreground">No raw materials.</td></tr>
                  ) : consolidated.map((c) => {
                    const created = c.annexureCount >= c.sourceRmIds.length && c.sourceRmIds.length > 0;
                    const partial = c.annexureCount > 0 && !created;
                    const pending = !created && (!c.lot_no || !c.plan_status);
                    const lotSelected = c.lot_no ? selectedLots.has(c.lot_no) : false;
                    const rowChecked = !created && (selectedRowKeys.has(c.key) || (lotSelected && !excludedRowKeys.has(c.key)));
                    return (
                    <tr key={c.key} className={`border-b last:border-0 ${created ? "opacity-60" : ""}`}>
                      <td className="py-2 px-2 border-r">
                        <Checkbox
                          checked={rowChecked}
                          disabled={created || !c.lot_no || !c.plan_status}
                          onCheckedChange={(v) => {
                            if (lotSelected) {
                              setExcludedRowKeys((prev) => {
                                const next = new Set(prev);
                                if (v) next.delete(c.key); else next.add(c.key);
                                return next;
                              });
                            } else {
                              setSelectedRowKeys((prev) => {
                                const next = new Set(prev);
                                if (v) next.add(c.key); else next.delete(c.key);
                                return next;
                              });
                            }
                          }}
                        />
                      </td>
                      <td className="py-2 px-2 border-r font-medium">{c.material}</td>
                      <td className="py-2 px-2 border-r">{c.size_model || "—"}</td>
                      <td className="py-2 px-2 border-r">{c.make || "—"}</td>
                      <td className="py-2 px-2 border-r">{c.unit || "—"}</td>
                      <td className="py-2 px-2 border-r text-right">{fmtQty2(c.total)}</td>
                      <td className="py-2 px-2 border-r">
                        <Input
                          className="h-7 w-24"
                          defaultValue={c.lot_no || ""}
                          onBlur={(e) => {
                            const v = e.target.value.trim() || null;
                            if ((c.lot_no || null) === v) return;
                            bulkPatch(c.sourceRmIds, { lot_no: v });
                          }}
                        />
                      </td>
                      <td className="py-2 px-2 border-r">
                        <Select
                          value={toMergedCategory(c.plan_status as PlanStatus | null)}
                          onValueChange={(v) =>
                            bulkPatch(c.sourceRmIds, {
                              plan_status: fromMergedCategory(v, c.plan_status as PlanStatus | null, c.material),
                            })
                          }
                        >
                          <SelectTrigger className="h-7 w-40"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            {MERGED_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                            {c.plan_status === "steel" && (
                              <SelectItem value="steel">Steel (legacy)</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-2 border-r text-xs text-muted-foreground">{c.sourceReqNos.join(", ")}</td>
                      <td className="py-2 px-2">
                        {created ? (
                          <span className="text-[11px] font-medium text-muted-foreground">Annexure Created</span>
                        ) : partial ? (
                          <Badge variant="outline" className="text-[10px]">Partial</Badge>
                        ) : pending ? (
                          <span className="text-[11px] text-muted-foreground">Pending — Lot / RM Category required</span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports">
          <div className="space-y-4">
            <Card>
              <CardContent className="py-3 flex flex-wrap items-center gap-3 text-xs">
                <div className="inline-flex rounded-md border bg-muted p-0.5">
                  <button
                    onClick={() => setReportMode("live")}
                    className={`px-3 py-1 rounded text-xs ${reportMode === "live" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
                  >Live preview</button>
                  <button
                    onClick={() => setReportMode("saved")}
                    className={`px-3 py-1 rounded text-xs ${reportMode === "saved" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
                  >Saved annexures ({annexures.length})</button>
                </div>
                {reportMode === "live" ? (
                  <>
                    <Badge variant="secondary">Live</Badge>
                    <span><strong>Lots:</strong> {displayLotNumbers.join(", ") || "—"}</span>
                    <span className="text-muted-foreground">Reflecting current Generated Requisition edits</span>
                  </>
                ) : !activeAnnexure ? (
                  <span className="text-muted-foreground">No saved annexures yet. Use <strong>Create Annexure</strong> on the Raw Materials tab.</span>
                ) : (
                  <>
                    {(activeAnnexure.status as string | undefined) === "cancelled"
                      ? <Badge variant="outline">Cancelled</Badge>
                      : <Badge variant="secondary">Snapshot</Badge>}
                    <span><strong>Lots:</strong> {activeAnnexure.lot_numbers.join(", ") || "—"}</span>
                    <span className="text-muted-foreground">Created {new Date(activeAnnexure.created_at).toLocaleString("en-IN")}</span>
                    {annexures.length > 1 && (
                      <Select value={activeAnnexureId || ""} onValueChange={async (v) => {
                        setActiveAnnexureId(v);
                        const { data } = await sb.from("requisition_annexure_rows").select("*").eq("annexure_id", v);
                        setAnnexureRows((data as AnnexureRowRecord[]) || []);
                      }}>
                        <SelectTrigger className="h-7 w-64 ml-auto"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {annexures.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {new Date(a.created_at).toLocaleString("en-IN")} — {a.lot_numbers.join(", ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {(() => {
              const hasLegacySteel = displayReportRows.some((r) => r.plan_status === "steel");
              const kinds: PlanStatus[] = hasLegacySteel
                ? [...ACTIVE_STATUSES, "steel"]
                : ACTIVE_STATUSES;
              return kinds;
            })().map((kind) => {
                const rows = displayReportRows.filter((r) => r.plan_status === kind);
                const total = rows.reduce((s, r) => s + Number(r.total_qty || 0), 0);
                const title = REPORT_TITLE[kind];
                const lots = Array.from(new Set(rows.map((r) => r.lot_no))).join(", ");
                return (
                  <Card key={kind}>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 py-3">
                      <div>
                        <CardTitle className="text-sm">{title}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">Lot Number(s): <span className="font-medium text-foreground">{lots || "—"}</span></p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => downloadReportPdf(kind)} disabled={rows.length === 0}>
                        <Download className="mr-1 h-4 w-4" />PDF
                      </Button>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                      <table className="w-full text-sm border">
                        <thead className="text-xs text-muted-foreground border-b bg-muted/40">
                          <tr>
                            <th className="text-left py-2 px-2 border-r">Lot</th>
                            <th className="text-left py-2 px-2 border-r">Raw Material</th>
                            <th className="text-left py-2 px-2 border-r">Size</th>
                            <th className="text-left py-2 px-2 border-r">BOQ/OA Number</th>
                            <th className="text-left py-2 px-2 border-r">UOM</th>
                            <th className="text-right py-2 px-2 border-r">Total Qty</th>
                            <th className="text-left py-2 px-2">Annexure</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.length === 0 ? (
                            <tr><td colSpan={7} className="py-4 text-center text-muted-foreground">No rows in this category.</td></tr>
                          ) : rows.map((r) => (
                            <tr key={r.id} className="border-b last:border-0">
                              <td className="py-2 px-2 border-r">{r.lot_no}</td>
                              <td className="py-2 px-2 border-r">{r.material}</td>
                              <td className="py-2 px-2 border-r">{r.size_model || "—"}</td>
                              <td className="py-2 px-2 border-r">{r.make || "—"}</td>
                              <td className="py-2 px-2 border-r">{r.unit || "—"}</td>
                              <td className="py-2 px-2 border-r text-right">{fmtQty2(r.total_qty)}</td>
                              <td className="py-2 px-2">
                                {reportMode === "saved" ? (
                                  <Badge variant="secondary" className="text-[10px]">Annexure Created</Badge>
                                ) : (r as LiveAnnexureRow)._createdState === "created" ? (
                                  <Badge variant="secondary" className="text-[10px]">Annexure Created</Badge>
                                ) : (r as LiveAnnexureRow)._createdState === "partial" ? (
                                  <Badge variant="outline" className="text-[10px]">Partial</Badge>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        {rows.length > 0 && (
                          <tfoot>
                            <tr className="bg-muted/30 font-medium">
                              <td colSpan={5} className="py-2 px-2 text-right border-r">Grand Total</td>
                              <td className="py-2 px-2 text-right border-r">{fmtQty2(total)}</td>
                              <td className="py-2 px-2"></td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}