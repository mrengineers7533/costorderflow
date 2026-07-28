import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { generatePoPDF, financialYearOf } from "@/lib/purchase/poPdf";
import { VendorCombobox, type Vendor } from "@/components/purchase/VendorCombobox";
import { formatReqPrice, formatReqVendor } from "@/lib/requisition/priceVendor";

import { Download, FileText, Plus, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Category =
  | "machine"
  | "3p"
  | "pipe"
  | "sheet_ss"
  | "sheet_ms"
  | "sheet_gi"
  | "structure"
  | "steel"; // legacy

interface RawRow {
  id: string;
  requisition_id: string;
  lot_no: string | null;
  material: string;
  size_model: string | null;
  make: string | null;
  unit: string | null;
  required_qty: number | null;
  plan_status: Category | null;
  annexure_status: "created" | null;
  annexure_id: string | null;
  po_status: "created" | null;
  po_id: string | null;
  rm_price: number | null;
  vendor_name: string | null;
  raw_material_type: string | null;
}

interface PoRecord {
  id: string;
  po_number: string;
  category: Category;
  vendor_name: string;
  vendor_contact: string | null;
  lot_numbers: string[];
  status: "active" | "cancelled";
  created_at: string;
}

const CATEGORIES: Category[] = [
  "machine",
  "3p",
  "pipe",
  "sheet_ss",
  "sheet_ms",
  "sheet_gi",
  "structure",
];
const catLabel: Record<Category, string> = {
  machine: "Machine",
  "3p": "3P / Outside",
  pipe: "Pipe",
  sheet_ss: "Sheet SS",
  sheet_ms: "Sheet MS",
  sheet_gi: "Sheet GI",
  structure: "Structure",
  steel: "Steel (legacy)",
};

interface CustomRow {
  id: string;
  lot_no: string;
  category: Category;
  material: string;
  size_model: string;
  make: string;
  unit: string;
  qty: string;
  rate: string;
  discount: string;
  gst: string;
  due: string;
}

interface RowMeta {
  rate: string;
  discount: string;
  gst: string;
  due: string;
  qty: string;
}

const emptyMeta = (): RowMeta => ({ rate: "0", discount: "0", gst: "18", due: "", qty: "" });

export default function PurchaseMaterial() {
  const [rows, setRows] = useState<RawRow[]>([]);
  const [activeAnnexIds, setActiveAnnexIds] = useState<Set<string>>(new Set());
  const [pos, setPos] = useState<PoRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedLots, setSelectedLots] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<"all" | Category>("all");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const [vendors, setVendors] = useState<Record<Category, Vendor | null>>(
    () => Object.fromEntries(CATEGORIES.map((c) => [c, null])) as Record<Category, Vendor | null>,
  );
  const [meta, setMeta] = useState<Record<string, RowMeta>>({});
  const [customRows, setCustomRows] = useState<CustomRow[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [params] = useSearchParams();

  const loadAll = async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const [{ data: rmData }, { data: annexData }, { data: poData }] = await Promise.all([
      sb
        .from("requisition_raw_materials")
        .select("id,requisition_id,lot_no,material,size_model,make,unit,required_qty,plan_status,annexure_status,annexure_id,po_status,po_id,rm_price,vendor_name,raw_material_type")
        .eq("annexure_status", "created"),
      sb.from("requisition_annexures").select("id,status").eq("status", "active"),
      sb.from("purchase_orders").select("*").order("created_at", { ascending: false }),
    ]);
    const activeIds = new Set<string>((annexData || []).map((a: { id: string }) => a.id));
    setActiveAnnexIds(activeIds);
    setRows(((rmData || []) as RawRow[]).filter((r) => r.annexure_id && activeIds.has(r.annexure_id)));
    setPos((poData || []) as PoRecord[]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  // Pre-select lots from query string (used by Annexure Folder "Generate PO")
  useEffect(() => {
    const lotsParam = params.get("lots");
    if (lotsParam) {
      setSelectedLots(new Set(lotsParam.split(",").map((s) => s.trim()).filter(Boolean)));
    }
  }, [params]);

  const allLots = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.lot_no && s.add(r.lot_no));
    return Array.from(s).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (selectedLots.size > 0 && (!r.lot_no || !selectedLots.has(r.lot_no))) return false;
      if (categoryFilter !== "all" && r.plan_status !== categoryFilter) return false;
      return true;
    });
  }, [rows, selectedLots, categoryFilter]);

  const toggleLot = (lot: string) => {
    setSelectedLots((prev) => {
      const n = new Set(prev);
      if (n.has(lot)) n.delete(lot);
      else n.add(lot);
      return n;
    });
  };

  const toggleRow = (id: string) => {
    setSelectedRows((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setMeta((m) => (m[id] ? m : { ...m, [id]: emptyMeta() }));
  };

  const setRowMeta = (id: string, patch: Partial<RowMeta>) =>
    setMeta((m) => ({ ...m, [id]: { ...(m[id] || emptyMeta()), ...patch } }));

  const addCustomRow = () => {
    const defaultCat: Category = (Array.from(categoriesInSelection)[0] as Category) || "machine";
    const defaultLot = Array.from(selectedLots)[0] || "";
    setCustomRows((cs) => [
      ...cs,
      {
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        lot_no: defaultLot,
        category: defaultCat,
        material: "",
        size_model: "",
        make: "",
        unit: "",
        qty: "1",
        rate: "0",
        discount: "0",
        gst: "18",
        due: "",
      },
    ]);
  };

  const updateCustomRow = (id: string, patch: Partial<CustomRow>) =>
    setCustomRows((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const deleteCustomRow = (id: string) =>
    setCustomRows((cs) => cs.filter((c) => c.id !== id));

  const selectedRowList = useMemo(
    () => filteredRows.filter((r) => selectedRows.has(r.id) && !r.po_status),
    [filteredRows, selectedRows],
  );
  const categoriesInSelection = useMemo(() => {
    const s = new Set<Category>();
    selectedRowList.forEach((r) => r.plan_status && s.add(r.plan_status));
    customRows.forEach((c) => s.add(c.category));
    return s;
  }, [selectedRowList, customRows]);

  const computeLine = (qty: number, rate: number, discPct: number, gstPct: number) => {
    const gross = qty * rate;
    const afterDisc = gross * (1 - discPct / 100);
    const gstAmount = afterDisc * (gstPct / 100);
    return { basic: afterDisc, gstAmount, lineAmount: afterDisc + gstAmount };
  };

  const totalsByCategory = useMemo(() => {
    const out: Record<string, { basic: number; tax: number; grand: number }> = {};
    const add = (cat: Category, basic: number, tax: number) => {
      if (!out[cat]) out[cat] = { basic: 0, tax: 0, grand: 0 };
      out[cat].basic += basic;
      out[cat].tax += tax;
      out[cat].grand += basic + tax;
    };
    selectedRowList.forEach((r) => {
      const m = meta[r.id] || emptyMeta();
      const qty = Number(m.qty || r.required_qty || 0);
      const { basic, gstAmount } = computeLine(qty, Number(m.rate || 0), Number(m.discount || 0), Number(m.gst || 0));
      if (r.plan_status) add(r.plan_status, basic, gstAmount);
    });
    customRows.forEach((c) => {
      const { basic, gstAmount } = computeLine(Number(c.qty || 0), Number(c.rate || 0), Number(c.discount || 0), Number(c.gst || 0));
      add(c.category, basic, gstAmount);
    });
    return out;
  }, [selectedRowList, customRows, meta]);

  const grandTotals = useMemo(() => {
    return Object.values(totalsByCategory).reduce(
      (s, x) => ({ basic: s.basic + x.basic, tax: s.tax + x.tax, grand: s.grand + x.grand }),
      { basic: 0, tax: 0, grand: 0 },
    );
  }, [totalsByCategory]);

  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleCreatePo = async () => {
    if (selectedRowList.length === 0 && customRows.length === 0) {
      toast.error("Select at least one raw material row or add a custom item.");
      return;
    }
    const missingVendor = Array.from(categoriesInSelection).filter((c) => !vendors[c]);
    if (missingVendor.length > 0) {
      toast.error(`Vendor name required for: ${missingVendor.map((c) => catLabel[c]).join(", ")}`);
      return;
    }
    // validate rows
    for (const r of selectedRowList) {
      const m = meta[r.id] || emptyMeta();
      if (!(Number(m.rate) > 0)) {
        toast.error(`Enter Rate > 0 for "${r.material}".`);
        return;
      }
    }
    for (const c of customRows) {
      if (!c.material.trim()) { toast.error("Custom item: material is required."); return; }
      if (!(Number(c.qty) > 0)) { toast.error(`Custom item "${c.material}": Qty > 0 required.`); return; }
      if (!(Number(c.rate) > 0)) { toast.error(`Custom item "${c.material}": Rate > 0 required.`); return; }
    }
    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;
      const { data: pSettings } = await (supabase as unknown as { from: (t: string) => { select: (q: string) => { eq: (c: string, v: number) => { maybeSingle: () => Promise<{ data: { buyer_block: Record<string, unknown>; default_terms: string | null; default_dispatch: string | null; default_destination: string | null; default_payment_mode: string | null } | null }> } } } }).from("purchase_settings").select("buyer_block,default_terms,default_dispatch,default_destination,default_payment_mode").eq("id", 1).maybeSingle();
      const { data: profileData } = await (supabase as unknown as { from: (t: string) => { select: (q: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { full_name: string | null; email: string | null } | null }> } } } }).from("profiles").select("full_name,email").eq("id", userId || "").maybeSingle();
      const preparedBy = profileData?.full_name || profileData?.email || "—";
      const fy = financialYearOf();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;

      const createdPdfs: Array<{ poNumber: string }> = [];
      for (const cat of categoriesInSelection) {
        const catRows = selectedRowList.filter((r) => r.plan_status === cat);
        const catCustom = customRows.filter((c) => c.category === cat);
        if (catRows.length === 0 && catCustom.length === 0) continue;

        const { data: numData, error: numErr } = await sb.rpc("next_po_number", { _fy: fy });
        if (numErr) throw numErr;
        const poNumber = numData as string;

        const lotSet = new Set<string>();
        const reqSet = new Set<string>();
        const annexSet = new Set<string>();
        catRows.forEach((r) => {
          if (r.lot_no) lotSet.add(r.lot_no);
          if (r.requisition_id) reqSet.add(r.requisition_id);
          if (r.annexure_id) annexSet.add(r.annexure_id);
        });
        catCustom.forEach((c) => { if (c.lot_no) lotSet.add(c.lot_no); });

        // compute totals
        const computed = catRows.map((r) => {
          const m = meta[r.id] || emptyMeta();
          const qty = Number(m.qty || r.required_qty || 0);
          const rate = Number(m.rate || 0);
          const discountPct = Number(m.discount || 0);
          const gstPct = Number(m.gst || 0);
          const { basic, gstAmount, lineAmount } = computeLine(qty, rate, discountPct, gstPct);
          return { r, qty, rate, discountPct, gstPct, gstAmount, lineAmount, basic, due: m.due };
        });
        const computedCustom = catCustom.map((c) => {
          const qty = Number(c.qty || 0);
          const rate = Number(c.rate || 0);
          const discountPct = Number(c.discount || 0);
          const gstPct = Number(c.gst || 0);
          const { basic, gstAmount, lineAmount } = computeLine(qty, rate, discountPct, gstPct);
          return { c, qty, rate, discountPct, gstPct, gstAmount, lineAmount, basic };
        });
        const subtotal = computed.reduce((s, x) => s + x.basic, 0);
        const taxTotal = computed.reduce((s, x) => s + x.gstAmount, 0);
        const customSubtotal = computedCustom.reduce((s, x) => s + x.basic, 0);
        const customTax = computedCustom.reduce((s, x) => s + x.gstAmount, 0);
        const grand = subtotal + taxTotal + customSubtotal + customTax;
        const v = vendors[cat]!;

        const { data: poIns, error: poErr } = await sb
          .from("purchase_orders")
          .insert({
            po_number: poNumber,
            category: cat,
            vendor_id: v.id,
            vendor_name: v.name,
            vendor_contact: [v.contact_person, v.phone, v.email].filter(Boolean).join(" · ") || null,
            buyer_block: pSettings?.buyer_block ?? {},
            terms: pSettings?.default_terms ?? null,
            dispatch_through: pSettings?.default_dispatch ?? null,
            destination: pSettings?.default_destination ?? null,
            payment_mode: pSettings?.default_payment_mode ?? null,
            subtotal: subtotal + customSubtotal,
            tax_total: taxTotal + customTax,
            grand_total: grand,
            prepared_by_name: preparedBy,
            lot_numbers: Array.from(lotSet),
            requisition_ids: Array.from(reqSet),
            annexure_ids: Array.from(annexSet),
            notes: notes.trim() || null,
            created_by: userId,
          })
          .select()
          .single();
        if (poErr) throw poErr;
        const poId = (poIns as { id: string }).id;

        const rowsPayload = [
          ...computed.map(({ r, qty, rate, discountPct, gstPct, gstAmount, lineAmount, due }) => ({
            po_id: poId,
            raw_material_id: r.id,
            lot_no: r.lot_no,
            material: r.material,
            size_model: r.size_model,
            make: r.make,
            unit: r.unit,
            raw_material_type: r.raw_material_type ?? null,
            due_on: due || null,
            qty,
            rate,
            discount_pct: discountPct,
            gst_pct: gstPct,
            gst_amount: gstAmount,
            line_amount: lineAmount,
          })),
          ...computedCustom.map(({ c, qty, rate, discountPct, gstPct, gstAmount, lineAmount }) => ({
            po_id: poId,
            raw_material_id: null,
            lot_no: c.lot_no || null,
            material: c.material,
            size_model: c.size_model || null,
            make: c.make || null,
            unit: c.unit || null,
            due_on: c.due || null,
            qty,
            rate,
            discount_pct: discountPct,
            gst_pct: gstPct,
            gst_amount: gstAmount,
            line_amount: lineAmount,
          })),
        ];
        const { error: rowErr } = await sb.from("purchase_order_rows").insert(rowsPayload);
        if (rowErr) throw rowErr;

        if (catRows.length > 0) {
          const { error: updErr } = await sb
            .from("requisition_raw_materials")
            .update({ po_status: "created", po_id: poId })
            .in("id", catRows.map((r) => r.id));
          if (updErr) throw updErr;
        }

        // Generate PDF
        const pdf = generatePoPDF({
          poNumber,
          category: cat,
          vendor: {
            name: v.name,
            address: v.address || undefined,
            gstin: v.gstin || undefined,
            email: v.email || undefined,
            state_code: v.state_code || undefined,
            contact_person: v.contact_person || undefined,
            phone: v.phone || undefined,
          },
          buyer: (pSettings?.buyer_block as Record<string, unknown> as never) || {},
          preparedBy,
          dispatchThrough: pSettings?.default_dispatch ?? undefined,
          destination: pSettings?.default_destination ?? undefined,
          paymentMode: pSettings?.default_payment_mode ?? undefined,
          terms: pSettings?.default_terms ?? undefined,
          subtotal: subtotal + customSubtotal, taxTotal: taxTotal + customTax, grandTotal: grand,
          lots: Array.from(lotSet),
          notes: notes.trim() || undefined,
          createdAt: new Date().toISOString(),
          rows: [
            ...computed.map(({ r, qty, rate, discountPct, gstPct, gstAmount, lineAmount }) => ({
              lot: r.lot_no || "—",
              material: r.material,
              size: r.size_model || "—",
              make: r.make || "—",
              qty,
              unit: r.unit || "—",
              rate, discountPct, gstPct, gstAmount, lineAmount,
            })),
            ...computedCustom.map(({ c, qty, rate, discountPct, gstPct, gstAmount, lineAmount }) => ({
              lot: c.lot_no || "—",
              material: c.material,
              size: c.size_model || "—",
              make: c.make || "—",
              qty,
              unit: c.unit || "—",
              rate, discountPct, gstPct, gstAmount, lineAmount,
            })),
          ],
        });
        pdf.save(`${poNumber.replace(/\//g, "_")}.pdf`);
        createdPdfs.push({ poNumber });
      }

      toast.success(`Created ${createdPdfs.length} PO${createdPdfs.length === 1 ? "" : "s"}.`);
      setSelectedRows(new Set());
      setCustomRows([]);
      setMeta({});
      setVendors(Object.fromEntries(CATEGORIES.map((c) => [c, null])) as Record<Category, Vendor | null>);
      setNotes("");
      await loadAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Failed to create PO: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelPo = async (po: PoRecord) => {
    if (!confirm(`Cancel PO ${po.po_number}? This will free its raw materials for a new PO.`)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: userData } = await supabase.auth.getUser();
    const { error: e1 } = await sb
      .from("purchase_orders")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: userData?.user?.id ?? null,
      })
      .eq("id", po.id);
    if (e1) { toast.error(e1.message); return; }
    const { error: e2 } = await sb
      .from("requisition_raw_materials")
      .update({ po_status: null, po_id: null })
      .eq("po_id", po.id);
    if (e2) { toast.error(e2.message); return; }
    toast.success("PO cancelled.");
    await loadAll();
  };

  const poById = useMemo(() => {
    const m = new Map<string, PoRecord>();
    pos.forEach((p) => m.set(p.id, p));
    return m;
  }, [pos]);

  return (
    <div className="container mx-auto px-4 lg:px-6 py-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Purchase Material</h1>
          <p className="text-xs text-muted-foreground">
            Annexure-created raw materials. Select lot(s) and create vendor POs.
          </p>
        </div>
        <Link to="/purchase"><Button size="sm" variant="outline">Back</Button></Link>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-sm">Lot selection</CardTitle></CardHeader>
            <CardContent>
              {allLots.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No annexure-created raw materials yet. Create an annexure from a requisition first.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {allLots.map((lot) => {
                    const active = selectedLots.has(lot);
                    return (
                      <button
                        key={lot}
                        type="button"
                        onClick={() => toggleLot(lot)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-accent"
                        }`}
                      >
                        Lot {lot}
                      </button>
                    );
                  })}
                  {selectedLots.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedLots(new Set())}
                      className="text-xs px-3 py-1.5 rounded-full border border-dashed text-muted-foreground hover:bg-accent"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-sm">Raw materials ({filteredRows.length})</CardTitle>
              <div className="flex items-center gap-1">
                {(["all", ...CATEGORIES] as const).map((c) => (
                  <Button
                    key={c}
                    type="button"
                    size="sm"
                    variant={categoryFilter === c ? "secondary" : "ghost"}
                    onClick={() => setCategoryFilter(c)}
                  >
                    {c === "all" ? "All" : catLabel[c]}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2 pr-3 w-8"></th>
                    <th className="text-left py-2 pr-3">Lot</th>
                    <th className="text-left py-2 pr-3">Category</th>
                    <th className="text-left py-2 pr-3">Material</th>
                    <th className="text-left py-2 pr-3">Size / Model</th>
                    <th className="text-left py-2 pr-3">Make</th>
                    <th className="text-right py-2 pr-3">Qty</th>
                    <th className="text-left py-2 pr-3">Unit</th>
                    <th className="text-left py-2 pr-3">Due On</th>
                    <th className="text-right py-2 pr-3">Rate</th>
                    <th className="text-right py-2 pr-3">Disc %</th>
                    <th className="text-right py-2 pr-3">GST %</th>
                    <th className="text-right py-2 pr-3">Amount</th>
                    <th className="text-right py-2 pr-3">Req. Price</th>
                    <th className="text-left py-2 pr-3">Req. Vendor</th>
                    <th className="text-left py-2 pr-3">PO</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr><td colSpan={16} className="py-6 text-center text-muted-foreground">
                      {selectedLots.size === 0 ? "Select a lot to view raw materials." : "No rows match the filter."}
                    </td></tr>
                  ) : filteredRows.map((r) => {
                    const po = r.po_id ? poById.get(r.po_id) : null;
                    const isSel = selectedRows.has(r.id);
                    const m = meta[r.id] || emptyMeta();
                    const qtyVal = Number(m.qty || r.required_qty || 0);
                    const { lineAmount } = computeLine(qtyVal, Number(m.rate || 0), Number(m.discount || 0), Number(m.gst || 0));
                    const editable = isSel && !r.po_status;
                    return (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          <Checkbox
                            checked={isSel}
                            disabled={!!r.po_status}
                            onCheckedChange={() => toggleRow(r.id)}
                          />
                        </td>
                        <td className="py-2 pr-3">{r.lot_no || "—"}</td>
                        <td className="py-2 pr-3">{r.plan_status ? catLabel[r.plan_status] : "—"}</td>
                        <td className="py-2 pr-3">{r.material}</td>
                        <td className="py-2 pr-3">{r.size_model || "—"}</td>
                        <td className="py-2 pr-3">{r.make || "—"}</td>
                        <td className="py-2 pr-3 text-right">
                          {editable ? (
                            <Input type="number" className="h-7 text-xs text-right w-20"
                              value={m.qty || String(r.required_qty ?? "")}
                              onChange={(e) => setRowMeta(r.id, { qty: e.target.value })} />
                          ) : (r.required_qty ?? "—")}
                        </td>
                        <td className="py-2 pr-3">{r.unit || "—"}</td>
                        <td className="py-2 pr-3">
                          <Input type="date" className="h-7 text-xs" disabled={!editable}
                            value={m.due} onChange={(e) => setRowMeta(r.id, { due: e.target.value })} />
                        </td>
                        <td className="py-2 pr-3">
                          <Input type="number" className="h-7 text-xs text-right w-24" disabled={!editable}
                            value={m.rate} onChange={(e) => setRowMeta(r.id, { rate: e.target.value })} />
                        </td>
                        <td className="py-2 pr-3">
                          <Input type="number" className="h-7 text-xs text-right w-16" disabled={!editable}
                            value={m.discount} onChange={(e) => setRowMeta(r.id, { discount: e.target.value })} />
                        </td>
                        <td className="py-2 pr-3">
                          <Input type="number" className="h-7 text-xs text-right w-16" disabled={!editable}
                            value={m.gst} onChange={(e) => setRowMeta(r.id, { gst: e.target.value })} />
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{editable ? fmt(lineAmount) : "—"}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{formatReqPrice(r.rm_price)}</td>
                        <td className="py-2 pr-3">{formatReqVendor(r.vendor_name)}</td>
                        <td className="py-2 pr-3">
                          {r.po_status === "created" && po ? (
                            <Badge className="bg-emerald-600 hover:bg-emerald-600">{po.po_number}</Badge>
                          ) : r.po_status === "created" ? (
                            <Badge variant="secondary">PO Created</Badge>
                          ) : (
                            <Badge variant="outline">Pending</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-sm">Custom items ({customRows.length})</CardTitle>
              <Button size="sm" variant="outline" onClick={addCustomRow}>
                <Plus className="h-3.5 w-3.5 mr-1" />Add custom item
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {customRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">No custom items. Use "Add custom item" to add ad-hoc lines not tied to any annexure.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2 pr-2">Lot</th>
                      <th className="text-left py-2 pr-2">Category</th>
                      <th className="text-left py-2 pr-2">Material *</th>
                      <th className="text-left py-2 pr-2">Size</th>
                      <th className="text-left py-2 pr-2">Make</th>
                      <th className="text-left py-2 pr-2">Unit</th>
                      <th className="text-right py-2 pr-2">Qty</th>
                      <th className="text-left py-2 pr-2">Due</th>
                      <th className="text-right py-2 pr-2">Rate</th>
                      <th className="text-right py-2 pr-2">Disc%</th>
                      <th className="text-right py-2 pr-2">GST%</th>
                      <th className="text-right py-2 pr-2">Amount</th>
                      <th className="py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {customRows.map((c) => {
                      const { lineAmount } = computeLine(Number(c.qty || 0), Number(c.rate || 0), Number(c.discount || 0), Number(c.gst || 0));
                      return (
                        <tr key={c.id} className="border-b last:border-0">
                          <td className="py-1 pr-2">
                            <Input className="h-7 text-xs w-20" value={c.lot_no} onChange={(e) => updateCustomRow(c.id, { lot_no: e.target.value })} placeholder="Lot" />
                          </td>
                          <td className="py-1 pr-2">
                            <Select value={c.category} onValueChange={(v) => updateCustomRow(c.id, { category: v as Category })}>
                              <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {CATEGORIES.map((cat) => (
                                  <SelectItem key={cat} value={cat}>{catLabel[cat]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-1 pr-2">
                            <Input className="h-7 text-xs w-40" value={c.material} onChange={(e) => updateCustomRow(c.id, { material: e.target.value })} />
                          </td>
                          <td className="py-1 pr-2">
                            <Input className="h-7 text-xs w-28" value={c.size_model} onChange={(e) => updateCustomRow(c.id, { size_model: e.target.value })} />
                          </td>
                          <td className="py-1 pr-2">
                            <Input className="h-7 text-xs w-24" value={c.make} onChange={(e) => updateCustomRow(c.id, { make: e.target.value })} />
                          </td>
                          <td className="py-1 pr-2">
                            <Input className="h-7 text-xs w-16" value={c.unit} onChange={(e) => updateCustomRow(c.id, { unit: e.target.value })} />
                          </td>
                          <td className="py-1 pr-2">
                            <Input type="number" className="h-7 text-xs text-right w-20" value={c.qty} onChange={(e) => updateCustomRow(c.id, { qty: e.target.value })} />
                          </td>
                          <td className="py-1 pr-2">
                            <Input type="date" className="h-7 text-xs" value={c.due} onChange={(e) => updateCustomRow(c.id, { due: e.target.value })} />
                          </td>
                          <td className="py-1 pr-2">
                            <Input type="number" className="h-7 text-xs text-right w-24" value={c.rate} onChange={(e) => updateCustomRow(c.id, { rate: e.target.value })} />
                          </td>
                          <td className="py-1 pr-2">
                            <Input type="number" className="h-7 text-xs text-right w-16" value={c.discount} onChange={(e) => updateCustomRow(c.id, { discount: e.target.value })} />
                          </td>
                          <td className="py-1 pr-2">
                            <Input type="number" className="h-7 text-xs text-right w-16" value={c.gst} onChange={(e) => updateCustomRow(c.id, { gst: e.target.value })} />
                          </td>
                          <td className="py-1 pr-2 text-right tabular-nums">{fmt(lineAmount)}</td>
                          <td className="py-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteCustomRow(c.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Vendor selection & PO creation</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Selected: {selectedRowList.length} row(s) · Custom: {customRows.length} ·{" "}
                Categories: {Array.from(categoriesInSelection).map((c) => catLabel[c]).join(", ") || "—"}.
                One PO will be created per category that has a vendor.
              </p>
              <div className="grid sm:grid-cols-3 gap-3">
                {CATEGORIES.map((c) => {
                  const needed = categoriesInSelection.has(c);
                  const t = totalsByCategory[c];
                  return (
                    <div key={c} className={`rounded-md border p-3 space-y-2 ${needed ? "" : "opacity-60"}`}>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">{catLabel[c]} vendor</Label>
                        {needed && <Badge variant="secondary" className="text-[10px]">required</Badge>}
                      </div>
                      <VendorCombobox
                        category={c}
                        value={vendors[c]}
                        onChange={(v) => setVendors((vs) => ({ ...vs, [c]: v }))}
                      />
                      {vendors[c] && (
                        <div className="text-[10px] text-muted-foreground space-y-0.5">
                          {vendors[c]!.email && <div>{vendors[c]!.email}</div>}
                          {vendors[c]!.phone && <div>{vendors[c]!.phone}</div>}
                        </div>
                      )}
                      {needed && t && (
                        <div className="text-[10px] text-muted-foreground border-t pt-1 mt-1 tabular-nums">
                          Basic {fmt(t.basic)} · Tax {fmt(t.tax)} · <span className="font-semibold text-foreground">Grand {fmt(t.grand)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-end gap-4 text-xs border-t pt-3 tabular-nums">
                <span>Subtotal: <b>{fmt(grandTotals.basic)}</b></span>
                <span>Tax: <b>{fmt(grandTotals.tax)}</b></span>
                <span className="text-sm">Grand Total: <b>{fmt(grandTotals.grand)}</b></span>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes (optional)</Label>
                <Textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Delivery instructions, payment terms…"
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleCreatePo} disabled={submitting || (selectedRowList.length === 0 && customRows.length === 0)}>
                  <Download className="mr-1 h-4 w-4" />
                  {submitting ? "Creating…" : "Create PO & download PDF"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Recent Purchase Orders</CardTitle></CardHeader>
            <CardContent>
              {pos.length === 0 ? (
                <p className="text-sm text-muted-foreground">No POs yet.</p>
              ) : (
                <div className="space-y-2">
                  {pos.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 text-sm border-b last:border-0 pb-2 last:pb-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">{p.po_number}</span>
                          <Badge variant="secondary">{catLabel[p.category]}</Badge>
                          {p.status === "cancelled" ? (
                            <Badge variant="destructive">Cancelled</Badge>
                          ) : (
                            <Badge className="bg-emerald-600 hover:bg-emerald-600">Active</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {p.vendor_name} · Lots {p.lot_numbers.join(", ") || "—"} ·{" "}
                          {new Date(p.created_at).toLocaleDateString("en-IN")}
                        </div>
                      </div>
                      {p.status === "active" && (
                        <Button size="sm" variant="outline" onClick={() => handleCancelPo(p)}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}