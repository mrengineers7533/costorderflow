import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Download, FileText, ArrowLeft } from "lucide-react";
import { VendorCombobox, type Vendor } from "@/components/purchase/VendorCombobox";
import { generatePoPDF, financialYearOf, type PoPdfContext } from "@/lib/purchase/poPdf";
import { amountInWords } from "@/lib/purchase/amountInWords";
import { fmtQty2 } from "@/lib/utils";
import type { AnnexureRecord, AnnexureRowRecord } from "@/lib/requisition/types";
import { ModuleNotifications } from "@/components/notifications/ModuleNotifications";
import {
  fetchRmPriceVendor, mergePriceVendor, formatReqPrice, formatReqVendor,
  type RmPriceVendor,
} from "@/lib/requisition/priceVendor";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Cat =
  | "machine"
  | "3p"
  | "pipe"
  | "sheet_ss"
  | "sheet_ms"
  | "sheet_gi"
  | "structure"
  | "steel";
const CAT_LABEL: Record<Cat, string> = {
  machine: "Machine",
  "3p": "Outside Purchase (3P)",
  pipe: "Pipe",
  sheet_ss: "Sheet SS",
  sheet_ms: "Sheet MS",
  sheet_gi: "Sheet GI",
  structure: "Structure",
  steel: "Steel (legacy)",
};

type RowMeta = { selected: boolean; rate: string; discount: string; gst: string; due: string };

interface BuyerBlock {
  name?: string;
  address?: string;
  gstin?: string;
  email?: string;
  state_code?: string;
}

export default function PoCreateFromAnnexure() {
  const { annexureId } = useParams<{ annexureId: string }>();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const lot = sp.get("lot") || "";
  const type = (sp.get("type") as Cat) || "structure";

  const [annexure, setAnnexure] = useState<AnnexureRecord | null>(null);
  const [rows, setRows] = useState<AnnexureRowRecord[]>([]);
  const [pvMap, setPvMap] = useState<Map<string, RmPriceVendor>>(new Map());
  const [rmStatus, setRmStatus] = useState<Record<string, { po_status: string | null; po_id: string | null }>>({});
  const [meta, setMeta] = useState<Record<string, RowMeta>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [invoiceTo, setInvoiceTo] = useState<BuyerBlock>({});
  const [shipTo, setShipTo] = useState<BuyerBlock>({});
  const [reqLine, setReqLine] = useState("");
  const [supplierRef, setSupplierRef] = useState("");
  const [dispatch, setDispatch] = useState("BY ROAD");
  const [destination, setDestination] = useState("MURTHAL / SONIPAT");
  const [paymentMode, setPaymentMode] = useState("NEFT/RTGS");
  const [preparedBy, setPreparedBy] = useState("");
  const [terms, setTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [poNumber, setPoNumber] = useState("PO/—");
  const today = new Date().toISOString().slice(0, 10);
  const [poDate, setPoDate] = useState<string>(today);
  const [dueOn, setDueOn] = useState<string>("");

  // Latest BOQ-revision guard. PO creation is hard-blocked unless the source
  // requisitions are on the latest approved BOQ revision of their family AND
  // the annexure is active and not flagged for refresh.
  const [revGuard, setRevGuard] = useState<{
    blocked: boolean;
    reason: string;
    latest: number | null;
    current: number | null;
  }>({ blocked: false, reason: "", latest: null, current: null });

  // Load annexure, rows, settings, profile
  useEffect(() => {
    (async () => {
      if (!annexureId) return;
      setLoading(true);
      const [{ data: a }, { data: r }, { data: s }, userRes] = await Promise.all([
        sb.from("requisition_annexures").select("*").eq("id", annexureId).maybeSingle(),
        sb.from("requisition_annexure_rows").select("*").eq("annexure_id", annexureId).eq("lot_no", lot).eq("plan_status", type).order("material"),
        sb.from("purchase_settings").select("*").eq("id", 1).maybeSingle(),
        supabase.auth.getUser(),
      ]);
      setAnnexure(a as AnnexureRecord);
      const list = (r as AnnexureRowRecord[]) || [];
      setRows(list);

      // collect underlying RM ids
      const rmIds = Array.from(new Set(list.flatMap((x) => x.source_rm_ids || [])));
      // Reference Price / Vendor from the requisition (display only).
      fetchRmPriceVendor(rmIds).then(setPvMap).catch(() => setPvMap(new Map()));
      if (rmIds.length) {
        const { data: rms } = await sb.from("requisition_raw_materials").select("id, po_status, po_id").in("id", rmIds);
        const map: Record<string, { po_status: string | null; po_id: string | null }> = {};
        ((rms as Array<{ id: string; po_status: string | null; po_id: string | null }>) || []).forEach((x) => { map[x.id] = { po_status: x.po_status, po_id: x.po_id }; });
        setRmStatus(map);
      }

      // init row meta
      const initial: Record<string, RowMeta> = {};
      list.forEach((row) => { initial[row.id] = { selected: false, rate: "0", discount: "0", gst: "18", due: "" }; });
      setMeta(initial);

      // buyer defaults
      const buyer = (s?.buyer_block as { invoice_to?: BuyerBlock; ship_to?: BuyerBlock } | null) || null;
      setInvoiceTo(buyer?.invoice_to || {});
      setShipTo(buyer?.ship_to || buyer?.invoice_to || {});
      setTerms(s?.default_terms || "Freight Extra · Payment 30 Days After Delivery");
      setDispatch(s?.default_dispatch || "BY ROAD");
      setDestination(s?.default_destination || "MURTHAL / SONIPAT");
      setPaymentMode(s?.default_payment_mode || "NEFT/RTGS");

      // prepared by
      const uid = userRes?.data?.user?.id;
      if (uid) {
        const { data: p } = await sb.from("profiles").select("full_name, email").eq("id", uid).maybeSingle();
        setPreparedBy(p?.full_name || p?.email || "");
      }

      // peek next PO number (does not consume counter); user can edit
      try {
        const { data: peek } = await sb.rpc("peek_next_po_number", { _fy: financialYearOf() });
        setPoNumber((peek as string) || `PO/${financialYearOf()}/0001`);
      } catch {
        setPoNumber(`PO/${financialYearOf()}/0001`);
      }

      // req line
      if (a?.requisition_ids?.length) {
        const { data: reqs } = await sb.from("requisitions").select("requisition_number").in("id", a.requisition_ids);
        setReqLine(((reqs as Array<{ requisition_number: string }>) || []).map((x) => x.requisition_number).join(", "));
      }

      // BOQ-revision guard: PO must be built from the latest approved BOQ.
      try {
        if (a?.status === "cancelled") {
          setRevGuard({ blocked: true, reason: "This annexure has been cancelled (superseded by a newer BOQ).", latest: null, current: null });
        } else if ((a as { needs_refresh?: boolean } | null)?.needs_refresh) {
          setRevGuard({ blocked: true, reason: "BOQ has been revised. Rebuild this annexure from the latest requisition before creating a PO.", latest: null, current: null });
        } else if (a?.requisition_ids?.length) {
          const { data: reqs2 } = await sb.from("requisitions")
            .select("order_root_id, boq_revision")
            .in("id", a.requisition_ids);
          const rootIds = Array.from(new Set(((reqs2 as Array<{ order_root_id: string; boq_revision: number }>) || []).map((x) => x.order_root_id)));
          let latestForFamily = 0;
          for (const root of rootIds) {
            const { data: famOrders } = await sb.from("orders").select("id").or(`id.eq.${root},parent_order_id.eq.${root}`);
            const ids = ((famOrders as Array<{ id: string }>) || []).map((o) => o.id);
            if (!ids.length) continue;
            const { data: latestB } = await sb.from("boqs")
              .select("revision").in("order_id", ids).eq("verification_status", "approved")
              .order("revision", { ascending: false }).limit(1).maybeSingle();
            const lv = Number((latestB as { revision?: number } | null)?.revision ?? 0);
            if (lv > latestForFamily) latestForFamily = lv;
          }
          const currentRev = Math.max(0, ...((reqs2 as Array<{ boq_revision: number }>) || []).map((x) => Number(x.boq_revision || 0)));
          if (latestForFamily > currentRev) {
            setRevGuard({
              blocked: true,
              reason: `Cannot create PO: BOQ has been revised to R${latestForFamily}. Open the regenerated requisition / annexure for this lot.`,
              latest: latestForFamily,
              current: currentRev,
            });
          } else {
            setRevGuard({ blocked: false, reason: "", latest: latestForFamily, current: currentRev });
          }
        }
      } catch (e) {
        console.warn("[PoCreate] revision guard check failed", e);
      }

      setLoading(false);
    })();
  }, [annexureId, lot, type]);

  const rowLocked = (row: AnnexureRowRecord): { locked: boolean; poId: string | null } => {
    const ids = row.source_rm_ids || [];
    for (const id of ids) {
      const st = rmStatus[id];
      if (st && st.po_status === "created") return { locked: true, poId: st.po_id };
    }
    return { locked: false, poId: null };
  };

  const eligibleRows = rows.filter((r) => !rowLocked(r).locked);
  const allSelected = eligibleRows.length > 0 && eligibleRows.every((r) => meta[r.id]?.selected);

  const setRowMeta = (id: string, patch: Partial<RowMeta>) =>
    setMeta((m) => ({ ...m, [id]: { ...m[id], ...patch } }));

  const toggleAll = () => {
    const next = !allSelected;
    setMeta((m) => {
      const out = { ...m };
      eligibleRows.forEach((r) => { out[r.id] = { ...out[r.id], selected: next }; });
      return out;
    });
  };

  const computed = useMemo(() => {
    return rows
      .filter((r) => meta[r.id]?.selected && !rowLocked(r).locked)
      .map((r) => {
        const m = meta[r.id];
        const qty = Number(r.total_qty || 0);
        const rate = Number(m.rate || 0);
        const discount = Number(m.discount || 0);
        const gst = Number(m.gst || 0);
        const gross = qty * rate;
        const basic = gross * (1 - discount / 100);
        const gstAmount = basic * (gst / 100);
        return { row: r, qty, rate, discount, gst, basic, gstAmount, lineAmount: basic + gstAmount, due: m.due };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, meta, rmStatus]);

  const subtotal = computed.reduce((s, x) => s + x.basic, 0);
  const taxTotal = computed.reduce((s, x) => s + x.gstAmount, 0);
  const grand = subtotal + taxTotal;
  const totalQty = computed.reduce((s, x) => s + x.qty, 0);

  const buildCtx = (poNumber: string): PoPdfContext => ({
    poNumber,
    category: type,
    vendor: vendor ? {
      name: vendor.name,
      address: vendor.address || undefined,
      gstin: vendor.gstin || undefined,
      email: vendor.email || undefined,
      state_code: vendor.state_code || undefined,
      contact_person: vendor.contact_person || undefined,
      phone: vendor.phone || undefined,
    } : { name: "—" },
    buyer: {
      invoice_to: { name: invoiceTo.name || "—", ...invoiceTo },
      ship_to: { name: shipTo.name || "—", ...shipTo },
    },
    preparedBy: preparedBy || undefined,
    dispatchThrough: dispatch || undefined,
    destination: destination || undefined,
    paymentMode: paymentMode || undefined,
    terms: terms || undefined,
    lots: [lot],
    notes: notes || undefined,
    createdAt: new Date().toISOString(),
    poDate: poDate || undefined,
    dueOn: dueOn || undefined,
    subtotal, taxTotal, grandTotal: grand,
    rows: computed.map((x) => ({
      lot: x.row.lot_no,
      material: x.row.material,
      size: x.row.size_model || "",
      make: x.row.make || "",
      qty: x.qty,
      unit: x.row.unit || "",
      dueOn: x.due || undefined,
      rate: x.rate,
      discountPct: x.discount,
      gstPct: x.gst,
      gstAmount: x.gstAmount,
      lineAmount: x.lineAmount,
    })),
  });

  const validate = (): string | null => {
    if (revGuard.blocked) return revGuard.reason;
    if (computed.length === 0) return "Select at least one row.";
    if (!vendor) return "Select a vendor.";
    if (computed.some((x) => !(x.rate > 0))) return "Enter a rate > 0 for every selected row.";
    return null;
  };

  const downloadPreview = () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    const ctx = buildCtx(poNumber);
    const pdf = generatePoPDF(ctx);
    pdf.save(`${poNumber.replace(/\//g, "_")}_preview.pdf`);
  };

  const generate = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    const trimmedPo = poNumber.trim();
    if (!/^PO\/\d{2}-\d{2}\/\d{3,5}$/.test(trimmedPo)) {
      toast.error("PO number must be in format PO/YY-YY/0001"); return;
    }
    setSubmitting(true);
    try {
      const fy = financialYearOf();
      // duplicate check
      const { data: dup } = await sb.from("purchase_orders").select("id").eq("po_number", trimmedPo).maybeSingle();
      if (dup) { toast.error(`PO number ${trimmedPo} already exists`); setSubmitting(false); return; }
      const finalPo = trimmedPo;

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;

      const lotSet = Array.from(new Set(computed.map((x) => x.row.lot_no)));
      const reqSet: string[] = annexure?.requisition_ids || [];

      const { data: poIns, error: poErr } = await sb
        .from("purchase_orders")
        .insert({
          po_number: finalPo,
          po_date: poDate || null,
          due_on: dueOn || null,
          category: type,
          vendor_id: vendor!.id,
          vendor_name: vendor!.name,
          vendor_contact: [vendor!.contact_person, vendor!.phone, vendor!.email].filter(Boolean).join(" · ") || null,
          buyer_block: { invoice_to: invoiceTo, ship_to: shipTo },
          terms: terms || null,
          dispatch_through: dispatch || null,
          destination: destination || null,
          payment_mode: paymentMode || null,
          subtotal,
          tax_total: taxTotal,
          grand_total: grand,
          amount_in_words: amountInWords(grand),
          prepared_by_name: preparedBy || null,
          lot_numbers: lotSet,
          requisition_ids: reqSet,
          annexure_ids: [annexureId],
          notes: notes.trim() || null,
          created_by: userId,
        })
        .select()
        .single();
      if (poErr) throw poErr;
      const poId = (poIns as { id: string }).id;

      // keep counter in sync with whatever number was actually used
      const suffixMatch = finalPo.match(/\/(\d+)$/);
      if (suffixMatch) {
        await sb.rpc("sync_po_counter", { _fy: fy, _used_number: Number(suffixMatch[1]) });
      }

      const { error: rowErr } = await sb.from("purchase_order_rows").insert(
        computed.map((x) => ({
          po_id: poId,
          raw_material_id: x.row.source_rm_ids?.[0] || null,
          lot_no: x.row.lot_no,
          material: x.row.material,
          size_model: x.row.size_model,
          make: x.row.make,
          unit: x.row.unit,
          due_on: x.due || null,
          qty: x.qty,
          rate: x.rate,
          discount_pct: x.discount,
          gst_pct: x.gst,
          gst_amount: x.gstAmount,
          line_amount: x.lineAmount,
        })),
      );
      if (rowErr) throw rowErr;

      // lock the underlying raw material rows
      const lockIds = Array.from(new Set(computed.flatMap((x) => x.row.source_rm_ids || [])));
      if (lockIds.length) {
        const { error: updErr } = await sb
          .from("requisition_raw_materials")
          .update({ po_status: "created", po_id: poId })
          .in("id", lockIds);
        if (updErr) throw updErr;
      }

      // PDF
      const pdf = generatePoPDF(buildCtx(finalPo));
      pdf.save(`${finalPo.replace(/\//g, "_")}.pdf`);

      toast.success(`PO ${finalPo} created.`);
      navigate("/purchase/po-folder");
    } catch (e) {
      console.error("PO create failed", e);
      const msg =
        e instanceof Error
          ? e.message
          : (e && typeof e === "object")
            ? [
                (e as { message?: string }).message,
                (e as { details?: string }).details,
                (e as { hint?: string }).hint,
                (e as { code?: string }).code,
              ].filter(Boolean).join(" · ")
            : String(e);
      toast.error(`Failed to create PO: ${msg || "Unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!annexure) return <div className="p-6 text-sm text-destructive">Annexure not found.</div>;

  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="container mx-auto px-4 lg:px-6 py-5 space-y-5">
      {annexureId && (
        <ModuleNotifications
          links={{
            annexureId,
            requisitionId: annexure.requisition_ids?.[0] ?? undefined,
          }}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Generate PO from Annexure</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Lot <span className="font-medium">{lot}</span> · {CAT_LABEL[type]} · Annexure created {new Date(annexure.created_at).toLocaleString("en-IN")}
          </p>
        </div>
        <Link to="/requisitions/annexures">
          <Button variant="outline" size="sm"><ArrowLeft className="h-3.5 w-3.5 mr-1" />Back to Annexure Folder</Button>
        </Link>
      </div>

      {revGuard.blocked && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <strong>PO creation blocked. </strong>{revGuard.reason}
        </div>
      )}

      {/* A. Selection */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">1 · Select raw materials</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs border">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-2 py-2 border-r w-10">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="select all" />
                </th>
                <th className="px-2 py-2 border-r text-left">Material</th>
                <th className="px-2 py-2 border-r text-left">Size</th>
                <th className="px-2 py-2 border-r text-left">Make</th>
                <th className="px-2 py-2 border-r text-right">Qty</th>
                <th className="px-2 py-2 border-r text-left">UOM</th>
                <th className="px-2 py-2 border-r text-left">Due On</th>
                <th className="px-2 py-2 border-r text-right">Rate</th>
                <th className="px-2 py-2 border-r text-right">Disc %</th>
                <th className="px-2 py-2 border-r text-right">GST %</th>
                <th className="px-2 py-2 border-r text-right">Req. Price</th>
                <th className="px-2 py-2 border-r text-left">Req. Vendor</th>
                <th className="px-2 py-2 text-left">PO Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const lock = rowLocked(r);
                const m = meta[r.id] || { selected: false, rate: "0", discount: "0", gst: "18", due: "" };
                return (
                  <tr key={r.id} className={`border-b last:border-0 ${lock.locked ? "opacity-50" : ""}`}>
                    <td className="px-2 py-1.5 border-r text-center">
                      <Checkbox
                        checked={m.selected}
                        disabled={lock.locked}
                        onCheckedChange={(v) => setRowMeta(r.id, { selected: !!v })}
                      />
                    </td>
                    <td className="px-2 py-1.5 border-r">{r.material}</td>
                    <td className="px-2 py-1.5 border-r">{r.size_model || "—"}</td>
                    <td className="px-2 py-1.5 border-r">{r.make || "—"}</td>
                    <td className="px-2 py-1.5 border-r text-right">{fmtQty2(r.total_qty)}</td>
                    <td className="px-2 py-1.5 border-r">{r.unit || "—"}</td>
                    <td className="px-2 py-1.5 border-r">
                      <Input type="date" className="h-7 text-xs" disabled={!m.selected || lock.locked}
                        value={m.due} onChange={(e) => setRowMeta(r.id, { due: e.target.value })} />
                    </td>
                    <td className="px-2 py-1.5 border-r">
                      <Input type="number" className="h-7 text-xs text-right" disabled={!m.selected || lock.locked}
                        value={m.rate} onChange={(e) => setRowMeta(r.id, { rate: e.target.value })} />
                    </td>
                    <td className="px-2 py-1.5 border-r">
                      <Input type="number" className="h-7 text-xs text-right w-16" disabled={!m.selected || lock.locked}
                        value={m.discount} onChange={(e) => setRowMeta(r.id, { discount: e.target.value })} />
                    </td>
                    <td className="px-2 py-1.5 border-r">
                      <Input type="number" className="h-7 text-xs text-right w-16" disabled={!m.selected || lock.locked}
                        value={m.gst} onChange={(e) => setRowMeta(r.id, { gst: e.target.value })} />
                    </td>
                    <td className="px-2 py-1.5 border-r text-right">
                      {formatReqPrice(mergePriceVendor(r.source_rm_ids || [], pvMap).rm_price)}
                    </td>
                    <td className="px-2 py-1.5 border-r">
                      {formatReqVendor(mergePriceVendor(r.source_rm_ids || [], pvMap).vendor_name)}
                    </td>
                    <td className="px-2 py-1.5">
                      {lock.locked
                        ? <Badge variant="secondary" className="text-[10px]">PO Created</Badge>
                        : <span className="text-muted-foreground text-[11px]">Available</span>}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={13} className="text-center text-muted-foreground py-6">No rows in this annexure.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* B. Vendor & header */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">2 · Vendor &amp; header</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="md:col-span-1">
            <Label className="text-xs">Vendor ({CAT_LABEL[type]})</Label>
            <VendorCombobox category={type} value={vendor} onChange={setVendor} />
            {vendor && (
              <div className="mt-2 text-[11px] text-muted-foreground space-y-0.5">
                {vendor.address && <div>{vendor.address}</div>}
                {vendor.gstin && <div>GSTIN: {vendor.gstin}</div>}
                {vendor.email && <div>{vendor.email}</div>}
                {(vendor.contact_person || vendor.phone) && <div>{[vendor.contact_person, vendor.phone].filter(Boolean).join(" · ")}</div>}
              </div>
            )}
          </div>
          <div><Label className="text-xs">Prepared By</Label><Input className="h-8" value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} /></div>
          <div><Label className="text-xs">Supplier's Ref / Order</Label><Input className="h-8" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} /></div>
          <div><Label className="text-xs">PO Number</Label><Input className="h-8" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="PO/YY-YY/0001" /></div>
          <div><Label className="text-xs">PO Date</Label><Input type="date" className="h-8" value={poDate} onChange={(e) => setPoDate(e.target.value)} /></div>
          <div><Label className="text-xs">Due On</Label><Input type="date" className="h-8" value={dueOn} onChange={(e) => setDueOn(e.target.value)} /></div>
          <div><Label className="text-xs">Dispatch Through</Label><Input className="h-8" value={dispatch} onChange={(e) => setDispatch(e.target.value)} /></div>
          <div><Label className="text-xs">Destination</Label><Input className="h-8" value={destination} onChange={(e) => setDestination(e.target.value)} /></div>
          <div><Label className="text-xs">Mode &amp; Terms Of Payment</Label><Input className="h-8" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} /></div>
          <div className="md:col-span-2"><Label className="text-xs">Terms Of Delivery</Label><Textarea rows={2} value={terms} onChange={(e) => setTerms(e.target.value)} /></div>
          <div className="md:col-span-3"><Label className="text-xs">Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </CardContent>
      </Card>

      {/* Buyer block editable */}
      <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">3 · Invoice To / Ship To</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {(["invoice_to", "ship_to"] as const).map((key) => {
            const val = key === "invoice_to" ? invoiceTo : shipTo;
            const set = key === "invoice_to" ? setInvoiceTo : setShipTo;
            return (
              <div key={key} className="space-y-2 border rounded p-3">
                <div className="font-medium text-xs uppercase text-muted-foreground">{key === "invoice_to" ? "Invoice To" : "Ship To"}</div>
                <Input className="h-8" placeholder="Name" value={val.name || ""} onChange={(e) => set({ ...val, name: e.target.value })} />
                <Textarea rows={2} placeholder="Address" value={val.address || ""} onChange={(e) => set({ ...val, address: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <Input className="h-8" placeholder="GSTIN" value={val.gstin || ""} onChange={(e) => set({ ...val, gstin: e.target.value })} />
                  <Input className="h-8" placeholder="State Code" value={val.state_code || ""} onChange={(e) => set({ ...val, state_code: e.target.value })} />
                </div>
                <Input className="h-8" placeholder="Email" value={val.email || ""} onChange={(e) => set({ ...val, email: e.target.value })} />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* PO Preview (matches PDF) */}
      <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">4 · PO Preview (K.D template)</CardTitle></CardHeader>
        <CardContent>
          <div className="border rounded-md bg-white text-black p-4 font-mono text-[11px] leading-tight">
            <div className="text-center font-bold text-sm tracking-wider mb-1">PURCHASE ORDER</div>
            <div className="flex justify-between text-[11px] mb-2">
              <span>PO No : {poNumber}</span>
              <span>DATE : {poDate ? new Date(poDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</span>
            </div>
            {dueOn && (
              <div className="text-[11px] mb-2 text-right">DUE ON : {new Date(dueOn).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
            )}
            <div className="grid grid-cols-2 gap-3 mb-3 border-t border-b py-2">
              <div>
                <div className="font-bold">Invoice To :</div>
                <div>{invoiceTo.name || "—"}</div>
                {invoiceTo.address && <div className="whitespace-pre-wrap">{invoiceTo.address}</div>}
                {invoiceTo.gstin && <div>GSTIN : {invoiceTo.gstin}</div>}
                {invoiceTo.email && <div>EMAIL : {invoiceTo.email}</div>}
                {invoiceTo.state_code && <div>STATE CODE : {invoiceTo.state_code}</div>}
              </div>
              <div>
                <div className="font-bold">SHIP TO :</div>
                <div>{shipTo.name || "—"}</div>
                {shipTo.address && <div className="whitespace-pre-wrap">{shipTo.address}</div>}
                {shipTo.gstin && <div>GSTIN : {shipTo.gstin}</div>}
                {shipTo.email && <div>EMAIL : {shipTo.email}</div>}
                {shipTo.state_code && <div>STATE CODE : {shipTo.state_code}</div>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3 border-b pb-2">
              <div>
                <div className="font-bold">VENDOR DETAILS :</div>
                <div>M/s {vendor?.name || "—"}</div>
                {vendor?.address && <div>Address : {vendor.address}</div>}
                {vendor?.gstin && <div>GSTIN : {vendor.gstin}</div>}
                {vendor?.contact_person && <div>Contact : {vendor.contact_person}</div>}
                {vendor?.phone && <div>Phone : {vendor.phone}</div>}
                {vendor?.email && <div>Email : {vendor.email}</div>}
                {vendor?.state_code && <div>State Code : {vendor.state_code}</div>}
              </div>
              <div>
                <div className="font-bold">Supplier's Ref</div>
                <div>{supplierRef || "—"}</div>
                <div className="mt-1 font-bold">Dispatch through</div>
                <div>{dispatch || "—"}</div>
                <div className="mt-1 font-bold">Destination</div>
                <div>{destination || "—"}</div>
              </div>
              <div>
                <div className="font-bold">Mode &amp; Terms Of Payment</div>
                <div>{paymentMode || "—"}</div>
                <div className="mt-2 font-bold">Prepared By</div>
                <div>{preparedBy || "—"}</div>
              </div>
            </div>
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border px-1 py-1">S.NO</th>
                  <th className="border px-1 py-1 text-left">DESCRIPTION</th>
                  <th className="border px-1 py-1">DUE ON</th>
                  <th className="border px-1 py-1 text-right">QTY</th>
                  <th className="border px-1 py-1 text-right">RATE</th>
                  <th className="border px-1 py-1 text-right">DISC</th>
                  <th className="border px-1 py-1 text-right">GST %</th>
                  <th className="border px-1 py-1 text-right">GST AMT</th>
                  <th className="border px-1 py-1 text-right">AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {computed.length === 0 ? (
                  <tr><td colSpan={9} className="border px-1 py-3 text-center text-gray-500">No rows selected.</td></tr>
                ) : computed.map((x, i) => (
                  <tr key={x.row.id}>
                    <td className="border px-1 py-1 text-center">{i + 1}</td>
                    <td className="border px-1 py-1">{x.row.material}{x.row.size_model ? ` (${x.row.size_model})` : ""}</td>
                    <td className="border px-1 py-1 text-center">{x.due || "—"}</td>
                    <td className="border px-1 py-1 text-right">{fmtQty2(x.qty, "0.00")} {x.row.unit || ""}</td>
                    <td className="border px-1 py-1 text-right">{fmt(x.rate)}</td>
                    <td className="border px-1 py-1 text-right">{x.discount}%</td>
                    <td className="border px-1 py-1 text-right">{x.gst}%</td>
                    <td className="border px-1 py-1 text-right">{fmt(x.gstAmount)}</td>
                    <td className="border px-1 py-1 text-right">{fmt(x.lineAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="grid grid-cols-2 mt-2 gap-3">
              <div>
                 <div className="font-bold">TOTAL QTY : {fmtQty2(totalQty, "0.00")}</div>
                <div className="mt-2 text-[10px]">{amountInWords(grand)}</div>
              </div>
              <div className="text-right">
                <div>BASIC : {fmt(subtotal)}</div>
                <div>IGST : {fmt(taxTotal)}</div>
                <div className="font-bold">GRAND TOTAL : {fmt(grand)}</div>
              </div>
            </div>
            {terms && (<div className="mt-3 border-t pt-2"><span className="font-bold">Terms Of Delivery : </span>{terms}</div>)}
            {notes && (<div className="mt-1"><span className="font-bold">Notes : </span>{notes}</div>)}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-2 sticky bottom-0 bg-background py-3 border-t">
        <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        <Button variant="outline" onClick={downloadPreview}>
          <FileText className="h-4 w-4 mr-1" />Download Preview PDF
        </Button>
        <Button onClick={generate} disabled={submitting || revGuard.blocked}>
          <Download className="h-4 w-4 mr-1" />{submitting ? "Generating…" : "Generate PO & Download"}
        </Button>
      </div>
    </div>
  );
}