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

type Category = "steel" | "machine" | "3p";

interface RawRow {
  id: string;
  requisition_id: string;
  lot_no: string | null;
  material: string;
  size_model: string | null;
  make: string | null;
  unit: string | null;
  required_qty: number | null;
  plan_status: "machine" | "3p" | "steel" | null;
  annexure_status: "created" | null;
  annexure_id: string | null;
  po_status: "created" | null;
  po_id: string | null;
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

const CATEGORIES: Category[] = ["steel", "machine", "3p"];
const catLabel: Record<Category, string> = {
  steel: "Steel",
  machine: "Machine",
  "3p": "3P / Outside",
};

export default function PurchaseMaterial() {
  const [rows, setRows] = useState<RawRow[]>([]);
  const [activeAnnexIds, setActiveAnnexIds] = useState<Set<string>>(new Set());
  const [pos, setPos] = useState<PoRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedLots, setSelectedLots] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<"all" | Category>("all");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const [vendors, setVendors] = useState<Record<Category, Vendor | null>>({
    steel: null, machine: null, "3p": null,
  });
  const [rates, setRates] = useState<Record<string, { rate: string; discount: string; gst: string }>>({});
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
        .select("id,requisition_id,lot_no,material,size_model,make,unit,required_qty,plan_status,annexure_status,annexure_id,po_status,po_id")
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
  };

  const selectedRowList = useMemo(
    () => filteredRows.filter((r) => selectedRows.has(r.id) && !r.po_status),
    [filteredRows, selectedRows],
  );
  const categoriesInSelection = useMemo(() => {
    const s = new Set<Category>();
    selectedRowList.forEach((r) => r.plan_status && s.add(r.plan_status));
    return s;
  }, [selectedRowList]);

  const handleCreatePo = async () => {
    if (selectedRowList.length === 0) {
      toast.error("Select at least one raw material row (without an existing PO).");
      return;
    }
    const missingVendor = Array.from(categoriesInSelection).filter((c) => !vendors[c]);
    if (missingVendor.length > 0) {
      toast.error(`Vendor name required for: ${missingVendor.map((c) => catLabel[c]).join(", ")}`);
      return;
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
        if (catRows.length === 0) continue;

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

        // compute totals
        const computed = catRows.map((r) => {
          const meta = rates[r.id] || { rate: "0", discount: "0", gst: "18" };
          const qty = Number(r.required_qty || 0);
          const rate = Number(meta.rate || 0);
          const discountPct = Number(meta.discount || 0);
          const gstPct = Number(meta.gst || 0);
          const gross = qty * rate;
          const afterDisc = gross * (1 - discountPct / 100);
          const gstAmount = afterDisc * (gstPct / 100);
          return { r, qty, rate, discountPct, gstPct, gstAmount, lineAmount: afterDisc + gstAmount, basic: afterDisc };
        });
        const subtotal = computed.reduce((s, x) => s + x.basic, 0);
        const taxTotal = computed.reduce((s, x) => s + x.gstAmount, 0);
        const grand = subtotal + taxTotal;
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
            subtotal,
            tax_total: taxTotal,
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

        const { error: rowErr } = await sb.from("purchase_order_rows").insert(
          computed.map(({ r, qty, rate, discountPct, gstPct, gstAmount, lineAmount }) => ({
            po_id: poId,
            raw_material_id: r.id,
            lot_no: r.lot_no,
            material: r.material,
            size_model: r.size_model,
            make: r.make,
            unit: r.unit,
            qty,
            rate,
            discount_pct: discountPct,
            gst_pct: gstPct,
            gst_amount: gstAmount,
            line_amount: lineAmount,
          })),
        );
        if (rowErr) throw rowErr;

        const { error: updErr } = await sb
          .from("requisition_raw_materials")
          .update({ po_status: "created", po_id: poId })
          .in("id", catRows.map((r) => r.id));
        if (updErr) throw updErr;

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
          reqLine: Array.from(reqSet).slice(0, 2).join(", ") || undefined,
          preparedBy,
          dispatchThrough: pSettings?.default_dispatch ?? undefined,
          destination: pSettings?.default_destination ?? undefined,
          paymentMode: pSettings?.default_payment_mode ?? undefined,
          terms: pSettings?.default_terms ?? undefined,
          subtotal, taxTotal, grandTotal: grand,
          lots: Array.from(lotSet),
          notes: notes.trim() || undefined,
          createdAt: new Date().toISOString(),
          rows: computed.map(({ r, qty, rate, discountPct, gstPct, gstAmount, lineAmount }) => ({
            lot: r.lot_no || "—",
            material: r.material,
            size: r.size_model || "—",
            make: r.make || "—",
            qty,
            unit: r.unit || "—",
            rate, discountPct, gstPct, gstAmount, lineAmount,
          })),
        });
        pdf.save(`${poNumber.replace(/\//g, "_")}.pdf`);
        createdPdfs.push({ poNumber });
      }

      toast.success(`Created ${createdPdfs.length} PO${createdPdfs.length === 1 ? "" : "s"}.`);
      setSelectedRows(new Set());
      setVendors({ steel: null, machine: null, "3p": null });
      setRates({});
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
                    <th className="text-left py-2 pr-3">PO</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">
                      {selectedLots.size === 0 ? "Select a lot to view raw materials." : "No rows match the filter."}
                    </td></tr>
                  ) : filteredRows.map((r) => {
                    const po = r.po_id ? poById.get(r.po_id) : null;
                    return (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          <Checkbox
                            checked={selectedRows.has(r.id)}
                            disabled={!!r.po_status}
                            onCheckedChange={() => toggleRow(r.id)}
                          />
                        </td>
                        <td className="py-2 pr-3">{r.lot_no || "—"}</td>
                        <td className="py-2 pr-3">{r.plan_status ? catLabel[r.plan_status] : "—"}</td>
                        <td className="py-2 pr-3">{r.material}</td>
                        <td className="py-2 pr-3">{r.size_model || "—"}</td>
                        <td className="py-2 pr-3">{r.make || "—"}</td>
                        <td className="py-2 pr-3 text-right">{r.required_qty ?? "—"}</td>
                        <td className="py-2 pr-3">{r.unit || "—"}</td>
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
            <CardHeader><CardTitle className="text-sm">Vendor selection & PO creation</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Selected: {selectedRowList.length} row(s) ·{" "}
                Categories: {Array.from(categoriesInSelection).map((c) => catLabel[c]).join(", ") || "—"}.
                One PO will be created per category that has a vendor.
              </p>
              <div className="grid sm:grid-cols-3 gap-3">
                {CATEGORIES.map((c) => {
                  const needed = categoriesInSelection.has(c);
                  return (
                    <div key={c} className={`rounded-md border p-3 space-y-2 ${needed ? "" : "opacity-60"}`}>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">{catLabel[c]} vendor</Label>
                        {needed && <Badge variant="secondary" className="text-[10px]">required</Badge>}
                      </div>
                      <Input
                        placeholder="Vendor name"
                        className="h-8"
                        value={vendors[c].name}
                        onChange={(e) =>
                          setVendors((v) => ({ ...v, [c]: { ...v[c], name: e.target.value } }))
                        }
                      />
                      <Input
                        placeholder="Contact (phone/email)"
                        className="h-8"
                        value={vendors[c].contact}
                        onChange={(e) =>
                          setVendors((v) => ({ ...v, [c]: { ...v[c], contact: e.target.value } }))
                        }
                      />
                    </div>
                  );
                })}
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
                <Button onClick={handleCreatePo} disabled={submitting || selectedRowList.length === 0}>
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