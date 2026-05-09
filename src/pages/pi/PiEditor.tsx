import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PiRecord } from "@/lib/pi/types";
import { calcPiTotals } from "@/lib/pi/calc";
import { generatePiPDF } from "@/lib/pi/pdf";
import { fetchPiFamily } from "@/lib/pi/convert";
import { OrderPreview } from "@/components/orders/OrderPreview";
import { amountInWords, calcLineAmount, calcExTurkey, calcExMurthal } from "@/lib/orders/calc";
import type { Charges } from "@/lib/orders/types";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_MR_TERMS,
  DEFAULT_GMS_TERMS,
  DEFAULT_MR_BANK,
  type GMSTerms,
} from "@/lib/orders/defaults";

export default function PiEditor() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [pi, setPi] = useState<PiRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [family, setFamily] = useState<PiRecord[]>([]);
  const [terms, setTerms] = useState<string>(DEFAULT_MR_TERMS);
  const [gmsTerms, setGmsTerms] = useState<GMSTerms>(DEFAULT_GMS_TERMS);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    supabase.from("proforma_invoices").select("*").eq("id", id).maybeSingle()
      .then(async ({ data, error }) => {
        if (error || !data) {
          toast({ title: "PI not found", variant: "destructive" });
          nav("/pi"); return;
        }
        const rec = data as unknown as PiRecord;
        // OA-driven model: mirror line items + charges from the latest OA in
        // this PI's family. Only Advance Adjustment stays editable.
        let mirrored = rec;
        if (rec.reference_oa_id) {
          const { data: oaRow } = await supabase
            .from("orders").select("*").eq("id", rec.reference_oa_id).maybeSingle();
          if (oaRow) {
            const oa = oaRow as never as import("@/lib/orders/types").OrderRecord;
            // Preserve PI-level partial quantities & amounts. We mirror OA
            // metadata (description/rate/HSN/etc.) but keep the qty stored
            // on the PI so partial conversions (e.g. PI qty 1 of OA qty 2)
            // don't get rewritten back to the full OA quantity.
            const oaById = new Map(
              (oa.line_items || []).map((it) => [it.id, it] as const),
            );
            const items = (rec.line_items || []).map((piIt) => {
              const oaIt = piIt.id ? oaById.get(piIt.id) : undefined;
              if (!oaIt) return piIt;
              const qty = Number(piIt.quantity) || 0;
              const rate = Number(oaIt.unit_rate) || 0;
              return {
                ...oaIt,
                quantity: qty,
                amount: qty * rate,
              };
            });
            mirrored = {
              ...rec,
              charges: oa.charges,
              line_items: items.length ? items : rec.line_items,
              bill_to: oa.bill_to,
              ship_to: oa.ship_to,
              company_name: oa.company_name,
              format: oa.format,
              reference_oa_number: oa.oa_number,
            };
          }
        }
        setPi(mirrored);
        const fam = await fetchPiFamily(rec.parent_pi_id || rec.id);
        setFamily(fam);
        setLoading(false);
      });
  }, [id, nav]);

  const totals = useMemo(() => {
    if (!pi) return null;
    const advMode = pi.advance_mode || "percent";
    const advValue = advMode === "amount"
      ? (pi.advance_amount || 0)
      : (pi.advance_adjustment_percent || 0);
    return calcPiTotals(
      pi.line_items,
      pi.charges,
      pi.one_time_discount_percent,
      { mode: advMode, value: advValue },
      pi.other_charges || 0,
    );
  }, [pi]);

  // GMS landed-cost breakdown (drives the editor preview & saved net for
  // GMS PIs whose charges have a `gms_mode` set). Mirrors the OA editor.
  const gmsBreakdown = useMemo(() => {
    if (!pi || pi.format !== "GMS" || !totals) return null;
    const mode = pi.charges.gms_mode;
    if (mode === "EXW_TURKEY") {
      return { kind: "turkey" as const, data: calcExTurkey(totals.basic_total, pi.charges) };
    }
    if (mode === "EXW_MURTHAL" || pi.charges.ex_murthal_enabled) {
      return { kind: "murthal" as const, data: calcExMurthal(totals.basic_total, pi.charges) };
    }
    if (mode === "EXW_CIF_PORT") {
      const rate = pi.charges.cif_pu_dollar_rate || 0;
      const basicUsd = rate > 0 ? totals.basic_total / rate : 0;
      const seaUsd = (pi.charges.cif_sea_freight_mode || "amount") === "percent"
        ? (basicUsd * (pi.charges.cif_sea_freight_percent || 0)) / 100
        : (pi.charges.cif_sea_freight_usd || 0);
      const grandUsd = basicUsd + seaUsd;
      // grand/net stored back in INR equivalent so existing list/reports keep working.
      const grandInr = grandUsd * (rate || 1);
      return { kind: "cif" as const, data: { grand_total: grandInr, net_payable: grandInr } };
    }
    return null;
  }, [pi, totals]);

  // The figure that flows into the saved `totals.net_payable` row and the
  // PI list. For GMS landed-cost modes, prefer the GMS net.
  const effectiveGrand = gmsBreakdown
    ? gmsBreakdown.data.grand_total
    : (totals?.gross_invoice_total ?? 0);

  // PI-level overrides (apply on TOP of the OA-mirrored grand total so the
  // PI math matches OA exactly, then layers Advance + Discount that the user
  // edits directly on the PI). Works for MR + every GMS pricing mode.
  const piAdvanceAmt = (() => {
    if (!pi) return 0;
    const mode = pi.advance_mode || "percent";
    if (mode === "amount") return Math.max(0, pi.advance_amount || 0);
    return Math.max(0, (effectiveGrand * (pi.advance_adjustment_percent || 0)) / 100);
  })();
  const piDiscountAmt = (() => {
    if (!pi) return 0;
    const mode = pi.discount_mode || "percent";
    const v = pi.discount_value || 0;
    if (mode === "amount") return Math.max(0, v);
    return Math.max(0, (effectiveGrand * v) / 100);
  })();
  const effectiveNet = Math.max(0, effectiveGrand - piAdvanceAmt - piDiscountAmt);

  if (loading || !pi || !totals) {
    return <div className="p-6 text-muted-foreground">Loading PI…</div>;
  }

  function update<K extends keyof PiRecord>(key: K, value: PiRecord[K]) {
    setPi((cur) => cur ? { ...cur, [key]: value } : cur);
  }

  async function downloadPdf() {
    if (!pi) return;
    try {
      const doc = await generatePiPDF({
        ...pi,
        totals: {
          basic_total: totals!.basic_total,
          subtotal: totals!.subtotal,
          grand_total: effectiveGrand,
          net_payable: effectiveNet,
        },
        amount_in_words: amountInWords(effectiveNet),
      }, { terms, gmsTerms });
      const safe = (pi.pi_number || "PI").replace(/[/\\]/g, "_");
      doc.save(`${safe}.pdf`);
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message || String(e), variant: "destructive" });
    }
  }

  async function saveInPlace(finalize = false) {
    if (!pi || !totals) return;
    setSaving(true);
    try {
      const patch: any = {
        pi_date: pi.pi_date,
        prepared_by: pi.prepared_by,
        bill_to: pi.bill_to,
        ship_to: pi.ship_to,
        line_items: pi.line_items,
        charges: pi.charges,
        notes: pi.notes,
        one_time_discount_percent: pi.one_time_discount_percent,
        apply_discount: pi.apply_discount,
        discount_label: pi.discount_label,
        advance_mode: pi.advance_mode,
        advance_amount: pi.advance_amount,
        advance_adjustment_percent: pi.advance_adjustment_percent,
        discount_mode: pi.discount_mode || "percent",
        discount_value: pi.discount_value || 0,
        other_charges: pi.other_charges,
        totals: {
          basic_total: totals.basic_total,
          subtotal: totals.subtotal,
          grand_total: effectiveGrand,
          net_payable: effectiveNet,
        },
        amount_in_words: amountInWords(effectiveNet),
      };
      if (finalize) patch.status = "finalized";
      const { error } = await supabase
        .from("proforma_invoices")
        .update(patch)
        .eq("id", pi.id);
      if (error) throw error;
      if (finalize) update("status", "finalized");
      toast({ title: finalize ? "PI finalized" : "PI saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  // Items handlers
  function updateItem(idx: number, patch: Partial<PiRecord["line_items"][number]>) {
    if (!pi) return;
    const items = pi.line_items.map((it, i) => i === idx ? { ...it, ...patch } : it);
    items.forEach((it) => { it.amount = calcLineAmount(it.quantity || 0, it.unit_rate || 0); });
    update("line_items", items);
  }

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="sm" onClick={() => nav("/pi")} className="rounded-lg">
              <ArrowLeft className="mr-1 h-4 w-4" />PIs
            </Button>
            <div className="h-6 w-px bg-border" />
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Proforma Invoice</div>
              <div className="flex items-center gap-2">
                <div className="font-mono font-semibold truncate">{pi.pi_number}</div>
                <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-[11px] font-medium px-2 py-0.5">{pi.format}</span>
                <Badge variant="outline" className="text-[10px]">R{pi.revision}</Badge>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-lg" onClick={downloadPdf}>
              <Download className="mr-1 h-4 w-4" />Download PDF
            </Button>
            {pi.status === "draft" && (
              <>
                <Button className="rounded-lg" disabled={saving} onClick={() => saveInPlace(false)}>
                  <Save className="mr-1 h-4 w-4" />Save
                </Button>
                <Button variant="secondary" className="rounded-lg" disabled={saving} onClick={() => saveInPlace(true)}>
                  <Save className="mr-1 h-4 w-4" />Save & Finalize
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Edit sections (stacked, full width — preview moved to bottom) */}
        <div className="space-y-5">
          <Card>
              <CardHeader><CardTitle className="text-base">PI details</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <Label>PI Number</Label>
                  <Input value={pi.pi_number} readOnly className="font-mono" />
                </div>
                <div>
                  <Label>PI Date</Label>
                  <Input type="date" value={pi.pi_date} onChange={(e) => update("pi_date", e.target.value)} />
                </div>
                <div>
                  <Label>Reference OA No.</Label>
                  <Input value={pi.reference_oa_number || ""} readOnly className="font-mono" />
                </div>
                <div>
                  <Label>Prepared By</Label>
                  <Input value={pi.prepared_by || ""} onChange={(e) => update("prepared_by", e.target.value)} placeholder="Name" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Line items</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Mirrored from OA <span className="font-mono">{pi.reference_oa_number}</span> — read-only.
                </p>
              </CardHeader>
              <CardContent>
                <fieldset disabled className="contents">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">Description</TableHead>
                      <TableHead>HSN</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pi.line_items.map((it, idx) => (
                      <TableRow key={it.id || idx}>
                        <TableCell>
                          <Input value={it.description} onChange={(e) => updateItem(idx, { description: e.target.value })} />
                        </TableCell>
                        <TableCell>
                          <Input value={it.hsn_code || ""} onChange={(e) => updateItem(idx, { hsn_code: e.target.value })} className="w-24" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} className="w-20" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={it.unit_rate} onChange={(e) => updateItem(idx, { unit_rate: Number(e.target.value) })} className="w-28" />
                        </TableCell>
                        <TableCell className="text-right font-mono">₹ {it.amount.toLocaleString("en-IN")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </fieldset>
              </CardContent>
            </Card>

          <Card>
              <CardHeader>
                <CardTitle className="text-base">PI adjustments</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Charges, discount, taxes mirror the OA. Only Advance Adjustment is editable.
                </p>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <Label>
                    Advance Adjustment{" "}
                    <span className="text-muted-foreground text-xs">(deducted at the end)</span>
                  </Label>
                  <div className="flex gap-2">
                    <select
                      className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                      value={pi.advance_mode || "percent"}
                      onChange={(e) => update("advance_mode", e.target.value as "amount" | "percent")}
                    >
                      <option value="percent">% of Gross</option>
                      <option value="amount">₹ Amount</option>
                    </select>
                    {(pi.advance_mode || "percent") === "amount" ? (
                      <Input
                        type="number" step="0.01" min={0}
                        value={pi.advance_amount || 0}
                        onChange={(e) => update("advance_amount", Number(e.target.value))}
                      />
                    ) : (
                      <Input
                        type="number" step="0.01" min={0} max={100}
                        value={pi.advance_adjustment_percent}
                        onChange={(e) => update("advance_adjustment_percent", Number(e.target.value))}
                      />
                    )}
                  </div>
                </div>
                <div>
                  <Label>
                    Discount{" "}
                    <span className="text-muted-foreground text-xs">(deducted at the end)</span>
                  </Label>
                  <div className="flex gap-2">
                    <select
                      className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                      value={pi.discount_mode || "percent"}
                      onChange={(e) => update("discount_mode", e.target.value as "amount" | "percent")}
                    >
                      <option value="percent">% of Gross</option>
                      <option value="amount">₹ Amount</option>
                    </select>
                    <Input
                      type="number" step="0.01" min={0}
                      max={(pi.discount_mode || "percent") === "percent" ? 100 : undefined}
                      value={pi.discount_value || 0}
                      onChange={(e) => update("discount_value", Number(e.target.value))}
                    />
                  </div>
                </div>
              </CardContent>
              <CardContent className="border-t pt-3 text-sm space-y-1">
                {(() => {
                  // GMS landed-cost breakdown takes over when active.
                  if (gmsBreakdown?.kind === "turkey") {
                    const t = gmsBreakdown.data;
                    const c = pi.charges;
                    return (
                      <>
                        <Row label="Basic Total" value={t.base_amount} />
                        {t.hike > 0 && <Row label="Hike" value={t.hike} />}
                        {t.sea_freight > 0 && <Row label="Sea Freight" value={t.sea_freight} />}
                        {t.custom > 0 && <Row label={`Custom Duty${c.turkey_custom_percent != null ? ` @ ${c.turkey_custom_percent}%` : ""}`} value={t.custom} />}
                        <Row label="Landed Price" value={t.total_amount} />
                        {t.landed_discount > 0 && <Row label="Discount on Landed" value={t.landed_discount} />}
                        {t.landed_discount > 0 && <Row label="Net Landed" value={t.net_landed} />}
                        {t.insurance > 0 && <Row label="Insurance" value={t.insurance} />}
                        {t.pf > 0 && <Row label="P&F" value={t.pf} />}
                        {t.freight > 0 && <Row label="Freight" value={t.freight} />}
                        {t.gst > 0 && <Row label={`GST @ ${c.turkey_gst_percent ?? 18}%`} value={t.gst} />}
                        <Row label="Grand Total" value={t.grand_total} bold highlight={piAdvanceAmt === 0 && piDiscountAmt === 0} />
                      </>
                    );
                  }
                  if (gmsBreakdown?.kind === "murthal") {
                    const m = gmsBreakdown.data;
                    const c = pi.charges;
                    return (
                      <>
                        <Row label="Basic Total" value={m.base_amount} />
                        {m.hike > 0 && <Row label="Hike" value={m.hike} />}
                        {m.sea_freight > 0 && <Row label="Sea Freight" value={m.sea_freight} />}
                        {m.custom > 0 && <Row label={`Custom Duty${c.custom_percent != null ? ` @ ${c.custom_percent}%` : ""}`} value={m.custom} />}
                        {m.clearing > 0 && <Row label={`Clearing${c.clearing_percent != null ? ` @ ${c.clearing_percent}%` : ""}`} value={m.clearing} />}
                        <Row label="Landed Price" value={m.total_amount} />
                        {m.landed_discount_amount > 0 && <Row label="Discount on Landed" value={m.landed_discount_amount} />}
                        {m.landed_discount_amount > 0 && <Row label="Net Landed" value={m.net_landed} />}
                        {m.sea_insurance > 0 && <Row label="Insurance" value={m.sea_insurance} />}
                        {m.pf > 0 && <Row label="P&F" value={m.pf} />}
                        {m.freight > 0 && <Row label="Freight" value={m.freight} />}
                        {m.gst > 0 && <Row label={`GST @ ${c.landed_gst_percent ?? 18}%`} value={m.gst} />}
                        <Row label="Grand Total" value={m.grand_total} bold highlight={piAdvanceAmt === 0 && piDiscountAmt === 0} />
                      </>
                    );
                  }
                  const showDisc = !!pi.apply_discount && totals.one_time_discount_amount > 0;
                  const discLbl = (pi.discount_label || "").trim() || "One Time Very Special Discount";
                  return (
                    <>
                      <Row label={showDisc ? "Sub Total" : "Basic Total"} value={totals.basic_total} />
                      {showDisc && <Row label={discLbl} value={totals.one_time_discount_amount} />}
                      {showDisc && <Row label="After Discount" value={totals.basic_after_discount} />}
                      {totals.pf_amount > 0 && <Row label="P&F" value={totals.pf_amount} />}
                      {totals.insurance_amount > 0 && <Row label="Insurance" value={totals.insurance_amount} />}
                      {totals.freight_amount > 0 && <Row label="Freight" value={totals.freight_amount} />}
                      {totals.other_charges_amount > 0 && <Row label="Other Charges" value={totals.other_charges_amount} />}
                      <Row label={`GST @ ${pi.charges.gst_percent}%`} value={totals.gst_amount} />
                      <Row label="Grand Total" value={totals.gross_invoice_total} bold highlight={piAdvanceAmt === 0 && piDiscountAmt === 0} />
                    </>
                  );
                })()}
                {(piAdvanceAmt > 0 || piDiscountAmt > 0) && (
                  <>
                    {piDiscountAmt > 0 && (
                      <Row
                        label={
                          (pi.discount_mode || "percent") === "amount"
                            ? "Discount"
                            : `Discount @ ${pi.discount_value || 0}%`
                        }
                        value={piDiscountAmt}
                      />
                    )}
                    {piAdvanceAmt > 0 && (
                      <Row
                        label={
                          (pi.advance_mode || "percent") === "amount"
                            ? "Advance Adjustment"
                            : `Advance Adjustment @ ${pi.advance_adjustment_percent || 0}%`
                        }
                        value={piAdvanceAmt}
                      />
                    )}
                    <Row label="Net Payable" value={effectiveNet} bold highlight />
                  </>
                )}
              </CardContent>
            </Card>

            {/* GMS landed-cost charges (parity with OA editor) */}
            {pi.format === "GMS" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">GMS Charges</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Pre-filled from OA. Edit any field to override for this PI; totals recalc automatically.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                <fieldset className="contents">
                  <div>
                    {/* Single global PU Dollar Rate — controls INR→USD across all GMS modes. */}
                    {pi.charges.gms_mode !== "EXW_TURKEY" && (
                      <div className="mb-3 rounded-md border bg-muted/30 p-3">
                        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                          PU Dollar Rate (₹ per $)
                        </Label>
                        <Input
                          type="number" step="any" className="h-8 mt-1"
                          value={pi.charges.cif_pu_dollar_rate || 0}
                          onChange={(e) => update("charges", { ...pi.charges, cif_pu_dollar_rate: +e.target.value || 0 })}
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Single global rate for GMS. When &gt; 0, every GMS amount
                          (items, charges, totals, PDF) is shown in USD as INR ÷ this rate.
                          Leave 0 / blank to keep GMS in ₹. Not applicable to EXW Turkey
                          (already in USD).
                        </p>
                      </div>
                    )}
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">GMS Pricing Mode</Label>
                    <p className="text-[11px] text-muted-foreground mb-2">
                      EXW Turkey: base + Sea Freight, Custom, Local Freight, Insurance, GST as extras.
                      EXW Murthal: full landed-cost breakdown (uses the section below).
                    </p>
                    <Select
                      value={pi.charges.gms_mode || "NONE"}
                      onValueChange={(v) => {
                        const mode = v === "NONE" ? undefined : (v as "EXW_TURKEY" | "EXW_MURTHAL" | "EXW_CIF_PORT");
                        update("charges", {
                          ...pi.charges,
                          gms_mode: mode,
                          ex_murthal_enabled:
                            mode === "EXW_MURTHAL" ? true
                            : mode === "EXW_TURKEY" || mode === "EXW_CIF_PORT" ? false
                            : pi.charges.ex_murthal_enabled,
                          display_currency: mode === "EXW_CIF_PORT" ? undefined : pi.charges.display_currency,
                          turkey_custom_percent: pi.charges.turkey_custom_percent ?? 10,
                          turkey_gst_percent: pi.charges.turkey_gst_percent ?? 18,
                          turkey_pf_percent: pi.charges.turkey_pf_percent ?? 1.5,
                          turkey_pf_mode: pi.charges.turkey_pf_mode ?? "percent",
                          turkey_advance_mode: pi.charges.turkey_advance_mode ?? "percent",
                        });
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">Legacy (use simple PI charges above)</SelectItem>
                        <SelectItem value="EXW_TURKEY">EXW Turkey (charges as extras)</SelectItem>
                        <SelectItem value="EXW_MURTHAL">EXW Murthal (full landed cost)</SelectItem>
                        <SelectItem value="EXW_CIF_PORT">EXW CIF Port (USD only — Basic + Local Freight)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {pi.charges.gms_mode === "EXW_CIF_PORT" && (
                    <div className="space-y-3 rounded-md border p-3 bg-muted/20">
                      <div className="text-xs font-semibold uppercase tracking-wide">EXW CIF Port (USD only)</div>
                      <p className="text-[11px] text-muted-foreground -mt-1">
                        Basic Total (USD) + Local Freight (USD) = EX Work CIF Port (USD). No GST / taxes / extras.
                      </p>
                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <Label className="text-xs">Local Freight</Label>
                          <div className="flex gap-2">
                            <Select
                              value={pi.charges.cif_sea_freight_mode || "amount"}
                              onValueChange={(v) => update("charges", { ...pi.charges, cif_sea_freight_mode: v as "amount" | "percent" })}
                            >
                              <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="amount">Fixed $</SelectItem>
                                <SelectItem value="percent">% of Basic</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              type="number" step="any" className="h-8"
                              value={(pi.charges.cif_sea_freight_mode || "amount") === "percent"
                                ? (pi.charges.cif_sea_freight_percent || 0)
                                : (pi.charges.cif_sea_freight_usd || 0)}
                              onChange={(e) => {
                                const v = +e.target.value || 0;
                                if ((pi.charges.cif_sea_freight_mode || "amount") === "percent") {
                                  update("charges", { ...pi.charges, cif_sea_freight_percent: v });
                                } else {
                                  update("charges", { ...pi.charges, cif_sea_freight_usd: v });
                                }
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {false && pi.charges.gms_mode === "EXW_TURKEY" && (
                    <div className="space-y-2 rounded-md border p-3 bg-muted/20">
                      <div className="text-xs font-semibold uppercase tracking-wide">EXW Turkey Charges</div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <Label className="text-xs">Cost Sheet $ Rate (₹)</Label>
                        <Input
                          type="number" step="any" className="h-8 w-28"
                          value={pi.charges.fx_rate || 0}
                          onChange={(e) => update("charges", { ...pi.charges, fx_rate: +e.target.value || 0, currency: pi.charges.currency || "USD" })}
                        />
                        {(pi.charges.fx_rate || 0) > 0 && (
                          <span className="text-[11px] text-muted-foreground ml-2">
                            EXW Turkey is always shown in USD ($) using cost-sheet $ rate (₹{pi.charges.fx_rate}).
                          </span>
                        )}
                      </div>
                      <PiModeToggleRow
                        label="Sea Freight"
                        enabled={!!pi.charges.turkey_sea_freight_enabled}
                        mode={pi.charges.turkey_sea_freight_mode || "amount"}
                        amount={pi.charges.turkey_sea_freight || 0}
                        percent={pi.charges.turkey_sea_freight_percent || 0}
                        base={pi.charges.turkey_sea_freight_base || "basic"}
                        onPatch={(p) => update("charges", { ...pi.charges, ...p })}
                        keys={{ enabled: "turkey_sea_freight_enabled", mode: "turkey_sea_freight_mode", amount: "turkey_sea_freight", percent: "turkey_sea_freight_percent", base: "turkey_sea_freight_base" }}
                      />
                      <PiModeToggleRow
                        label="Insurance"
                        enabled={!!pi.charges.turkey_insurance_enabled}
                        mode={pi.charges.turkey_insurance_mode || "amount"}
                        amount={pi.charges.turkey_insurance || 0}
                        percent={pi.charges.turkey_insurance_percent || 0}
                        base={pi.charges.turkey_insurance_base || "basic"}
                        onPatch={(p) => update("charges", { ...pi.charges, ...p })}
                        keys={{ enabled: "turkey_insurance_enabled", mode: "turkey_insurance_mode", amount: "turkey_insurance", percent: "turkey_insurance_percent", base: "turkey_insurance_base" }}
                      />
                      <div className="grid grid-cols-[auto_1fr_120px_140px] items-center gap-3">
                        <Switch checked={!!pi.charges.turkey_custom_enabled} onCheckedChange={(b) => update("charges", { ...pi.charges, turkey_custom_enabled: b })} />
                        <Label className={`text-sm ${pi.charges.turkey_custom_enabled ? "" : "text-muted-foreground line-through"}`}>Custom Duty (%)</Label>
                        <Select
                          value={pi.charges.turkey_custom_base || "basic"}
                          onValueChange={(v) => update("charges", { ...pi.charges, turkey_custom_base: v as "basic" | "landed" })}
                        >
                          <SelectTrigger className="h-9" disabled={!pi.charges.turkey_custom_enabled}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="basic">on Basic + Sea</SelectItem>
                            <SelectItem value="landed">on Landed</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number" step="any" disabled={!pi.charges.turkey_custom_enabled}
                          value={pi.charges.turkey_custom_percent ?? 10}
                          onChange={(e) => update("charges", { ...pi.charges, turkey_custom_percent: +e.target.value || 0 })}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground -mt-1">
                        Landed Price = Base + Sea Freight + Custom Duty.
                      </p>
                      <div className="grid grid-cols-[auto_1fr_120px_140px] items-center gap-3">
                        <Switch
                          checked={!!pi.charges.turkey_landed_discount_enabled}
                          onCheckedChange={(b) => update("charges", { ...pi.charges, turkey_landed_discount_enabled: b })}
                        />
                        <Label className={`text-sm ${pi.charges.turkey_landed_discount_enabled ? "" : "text-muted-foreground line-through"}`}>Discount on Landed Price</Label>
                        <Select
                          value={pi.charges.turkey_landed_discount_mode || "percent"}
                          onValueChange={(v) => update("charges", { ...pi.charges, turkey_landed_discount_mode: v as "amount" | "percent" })}
                        >
                          <SelectTrigger className="h-9" disabled={!pi.charges.turkey_landed_discount_enabled}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percent">% of Landed</SelectItem>
                            <SelectItem value="amount">Flat ₹</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number" step="any" disabled={!pi.charges.turkey_landed_discount_enabled}
                          value={(pi.charges.turkey_landed_discount_mode || "percent") === "percent"
                            ? (pi.charges.turkey_landed_discount_percent || 0)
                            : (pi.charges.turkey_landed_discount_amount || 0)}
                          onChange={(e) => {
                            const v = +e.target.value || 0;
                            if ((pi.charges.turkey_landed_discount_mode || "percent") === "percent") {
                              update("charges", { ...pi.charges, turkey_landed_discount_percent: v });
                            } else {
                              update("charges", { ...pi.charges, turkey_landed_discount_amount: v });
                            }
                          }}
                        />
                      </div>
                      <div className="grid grid-cols-[auto_1fr_120px_140px] items-center gap-3">
                        <Switch checked={!!pi.charges.turkey_pf_enabled} onCheckedChange={(b) => update("charges", { ...pi.charges, turkey_pf_enabled: b })} />
                        <Label className={`text-sm ${pi.charges.turkey_pf_enabled ? "" : "text-muted-foreground line-through"}`}>P&amp;F (on Landed)</Label>
                        <Select
                          value={pi.charges.turkey_pf_mode || "percent"}
                          onValueChange={(v) => update("charges", { ...pi.charges, turkey_pf_mode: v as "amount" | "percent" })}
                        >
                          <SelectTrigger className="h-9" disabled={!pi.charges.turkey_pf_enabled}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percent">%</SelectItem>
                            <SelectItem value="amount">Flat ₹</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number" step="any" disabled={!pi.charges.turkey_pf_enabled}
                          value={(pi.charges.turkey_pf_mode || "percent") === "percent" ? (pi.charges.turkey_pf_percent ?? 1.5) : (pi.charges.turkey_pf_amount || 0)}
                          onChange={(e) => {
                            const v = +e.target.value || 0;
                            if ((pi.charges.turkey_pf_mode || "percent") === "percent") {
                              update("charges", { ...pi.charges, turkey_pf_percent: v });
                            } else {
                              update("charges", { ...pi.charges, turkey_pf_amount: v });
                            }
                          }}
                        />
                      </div>
                      <PiToggleNumberRow
                        label="Local Freight (flat ₹) — joins GST base"
                        enabled={!!pi.charges.turkey_freight_enabled}
                        value={pi.charges.turkey_freight || 0}
                        onToggle={(b) => update("charges", { ...pi.charges, turkey_freight_enabled: b })}
                        onValue={(v) => update("charges", { ...pi.charges, turkey_freight: v })}
                      />
                      <PiToggleNumberRow
                        label="GST % (on Landed + P&F + Insurance + Freight)"
                        enabled={!!pi.charges.turkey_gst_enabled}
                        value={pi.charges.turkey_gst_percent ?? 18}
                        onToggle={(b) => update("charges", { ...pi.charges, turkey_gst_enabled: b })}
                        onValue={(v) => update("charges", { ...pi.charges, turkey_gst_percent: v })}
                      />
                      <PiToggleNumberRow
                        label="One-time Discount (₹) — after GST"
                        enabled={!!pi.charges.turkey_discount_enabled}
                        value={pi.charges.turkey_discount || 0}
                        onToggle={(b) => update("charges", { ...pi.charges, turkey_discount_enabled: b })}
                        onValue={(v) => update("charges", { ...pi.charges, turkey_discount: v })}
                      />
                      <div className="grid grid-cols-[auto_1fr_120px_140px] items-center gap-3">
                        <Switch checked={!!pi.charges.turkey_advance_enabled} onCheckedChange={(b) => update("charges", { ...pi.charges, turkey_advance_enabled: b })} />
                        <Label className={`text-sm ${pi.charges.turkey_advance_enabled ? "" : "text-muted-foreground line-through"}`}>Advance Adjustment</Label>
                        <Select
                          value={pi.charges.turkey_advance_mode || "percent"}
                          onValueChange={(v) => update("charges", { ...pi.charges, turkey_advance_mode: v as "amount" | "percent" })}
                        >
                          <SelectTrigger className="h-9" disabled={!pi.charges.turkey_advance_enabled}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percent">% of Grand Total</SelectItem>
                            <SelectItem value="amount">Flat ₹</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number" step="any" disabled={!pi.charges.turkey_advance_enabled}
                          value={(pi.charges.turkey_advance_mode || "percent") === "percent" ? (pi.charges.turkey_advance_percent || 0) : (pi.charges.turkey_advance_amount || 0)}
                          onChange={(e) => {
                            const v = +e.target.value || 0;
                            if ((pi.charges.turkey_advance_mode || "percent") === "percent") {
                              update("charges", { ...pi.charges, turkey_advance_percent: v });
                            } else {
                              update("charges", { ...pi.charges, turkey_advance_amount: v });
                            }
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {pi.charges.gms_mode === "EXW_MURTHAL" && (
                    <div className="space-y-2 rounded-md border p-3 bg-muted/20">
                      <div className="text-xs font-semibold uppercase tracking-wide">EXW Murthal Charges</div>
                      <PiModeToggleRow
                        label="Sea Freight"
                        enabled={!!pi.charges.sea_freight_enabled}
                        mode={pi.charges.murthal_sea_freight_mode || "percent"}
                        amount={pi.charges.murthal_sea_freight_amount || 0}
                        percent={pi.charges.sea_freight || 0}
                        base={pi.charges.murthal_sea_freight_base || "basic"}
                        onPatch={(p) => update("charges", { ...pi.charges, ...p })}
                        keys={{ enabled: "sea_freight_enabled", mode: "murthal_sea_freight_mode", amount: "murthal_sea_freight_amount", percent: "sea_freight", base: "murthal_sea_freight_base" }}
                      />
                      <div className="grid grid-cols-[auto_1fr_120px_140px] items-center gap-3">
                        <Switch checked={!!pi.charges.custom_enabled} onCheckedChange={(b) => update("charges", { ...pi.charges, custom_enabled: b })} />
                        <Label className={`text-sm ${pi.charges.custom_enabled ? "" : "text-muted-foreground line-through"}`}>Custom Duty (%)</Label>
                        <Select
                          value={pi.charges.murthal_custom_base || "basic"}
                          onValueChange={(v) => update("charges", { ...pi.charges, murthal_custom_base: v as "basic" | "landed" })}
                        >
                          <SelectTrigger className="h-9" disabled={!pi.charges.custom_enabled}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="basic">on Basic + Sea</SelectItem>
                            <SelectItem value="landed">on Landed</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number" step="any" disabled={!pi.charges.custom_enabled}
                          value={pi.charges.custom_percent ?? 8.25}
                          onChange={(e) => update("charges", { ...pi.charges, custom_percent: +e.target.value || 0 })}
                        />
                      </div>
                      <div className="grid grid-cols-[auto_1fr_120px_140px] items-center gap-3">
                        <Switch checked={!!pi.charges.clearing_enabled} onCheckedChange={(b) => update("charges", { ...pi.charges, clearing_enabled: b })} />
                        <Label className={`text-sm ${pi.charges.clearing_enabled ? "" : "text-muted-foreground line-through"}`}>Clearing (CHA &amp; Port) (%)</Label>
                        <Select
                          value={pi.charges.murthal_clearing_base || "basic"}
                          onValueChange={(v) => update("charges", { ...pi.charges, murthal_clearing_base: v as "basic" | "landed" })}
                        >
                          <SelectTrigger className="h-9" disabled={!pi.charges.clearing_enabled}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="basic">on Basic + Sea</SelectItem>
                            <SelectItem value="landed">on Landed</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number" step="any" disabled={!pi.charges.clearing_enabled}
                          value={pi.charges.clearing_percent ?? 1.5}
                          onChange={(e) => update("charges", { ...pi.charges, clearing_percent: +e.target.value || 0 })}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground -mt-1">
                        Landed Price = Base + Sea Freight + Custom + Clearing.
                      </p>
                      <div className="grid grid-cols-[auto_1fr_120px_140px] items-center gap-3">
                        <Switch
                          checked={!!pi.charges.murthal_landed_discount_enabled}
                          onCheckedChange={(b) => update("charges", { ...pi.charges, murthal_landed_discount_enabled: b })}
                        />
                        <Label className={`text-sm ${pi.charges.murthal_landed_discount_enabled ? "" : "text-muted-foreground line-through"}`}>Discount on Landed Price</Label>
                        <Select
                          value={pi.charges.murthal_landed_discount_mode || "percent"}
                          onValueChange={(v) => update("charges", { ...pi.charges, murthal_landed_discount_mode: v as "amount" | "percent" })}
                        >
                          <SelectTrigger className="h-9" disabled={!pi.charges.murthal_landed_discount_enabled}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percent">% of Landed</SelectItem>
                            <SelectItem value="amount">Flat ₹</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number" step="any" disabled={!pi.charges.murthal_landed_discount_enabled}
                          value={(pi.charges.murthal_landed_discount_mode || "percent") === "percent"
                            ? (pi.charges.murthal_landed_discount_percent || 0)
                            : (pi.charges.murthal_landed_discount_amount || 0)}
                          onChange={(e) => {
                            const v = +e.target.value || 0;
                            if ((pi.charges.murthal_landed_discount_mode || "percent") === "percent") {
                              update("charges", { ...pi.charges, murthal_landed_discount_percent: v });
                            } else {
                              update("charges", { ...pi.charges, murthal_landed_discount_amount: v });
                            }
                          }}
                        />
                      </div>
                      <PiModeToggleRow
                        label="Insurance"
                        enabled={!!pi.charges.sea_insurance_enabled}
                        mode={pi.charges.murthal_insurance_mode || "percent"}
                        amount={pi.charges.murthal_insurance_amount || 0}
                        percent={pi.charges.sea_insurance || 0}
                        base={pi.charges.murthal_insurance_base || "landed"}
                        onPatch={(p) => update("charges", { ...pi.charges, ...p })}
                        keys={{ enabled: "sea_insurance_enabled", mode: "murthal_insurance_mode", amount: "murthal_insurance_amount", percent: "sea_insurance", base: "murthal_insurance_base" }}
                      />
                      <div className="grid grid-cols-[auto_1fr_120px_140px] items-center gap-3">
                        <Switch checked={!!pi.charges.murthal_pf_enabled} onCheckedChange={(b) => update("charges", { ...pi.charges, murthal_pf_enabled: b })} />
                        <Label className={`text-sm ${pi.charges.murthal_pf_enabled ? "" : "text-muted-foreground line-through"}`}>P&amp;F (on Landed)</Label>
                        <Select
                          value={pi.charges.murthal_pf_mode || "percent"}
                          onValueChange={(v) => update("charges", { ...pi.charges, murthal_pf_mode: v as "amount" | "percent" })}
                        >
                          <SelectTrigger className="h-9" disabled={!pi.charges.murthal_pf_enabled}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percent">%</SelectItem>
                            <SelectItem value="amount">Flat ₹</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number" step="any" disabled={!pi.charges.murthal_pf_enabled}
                          value={(pi.charges.murthal_pf_mode || "percent") === "percent" ? (pi.charges.murthal_pf_percent ?? 1.5) : (pi.charges.murthal_pf_amount || 0)}
                          onChange={(e) => {
                            const v = +e.target.value || 0;
                            if ((pi.charges.murthal_pf_mode || "percent") === "percent") {
                              update("charges", { ...pi.charges, murthal_pf_percent: v });
                            } else {
                              update("charges", { ...pi.charges, murthal_pf_amount: v });
                            }
                          }}
                        />
                      </div>
                      <PiToggleNumberRow
                        label="Local Freight (flat ₹) — joins GST base"
                        enabled={!!pi.charges.murthal_freight_enabled}
                        value={pi.charges.murthal_freight || 0}
                        onToggle={(b) => update("charges", { ...pi.charges, murthal_freight_enabled: b })}
                        onValue={(v) => update("charges", { ...pi.charges, murthal_freight: v })}
                      />
                      <PiToggleNumberRow
                        label="GST % (on Net Landed + Insurance + P&F + Freight)"
                        enabled={!!pi.charges.landed_gst_enabled}
                        value={pi.charges.landed_gst_percent ?? 18}
                        onToggle={(b) => update("charges", { ...pi.charges, landed_gst_enabled: b })}
                        onValue={(v) => update("charges", { ...pi.charges, landed_gst_percent: v })}
                      />
                      <div className="grid grid-cols-[auto_1fr_120px_140px] items-center gap-3">
                        <Switch
                          checked={!!pi.charges.landed_discount_enabled}
                          onCheckedChange={(b) => update("charges", { ...pi.charges, landed_discount_enabled: b })}
                        />
                        <Label className={`text-sm ${pi.charges.landed_discount_enabled ? "" : "text-muted-foreground line-through"}`}>One-time Discount — after GST</Label>
                        <Select
                          value={pi.charges.murthal_one_time_discount_mode || "percent"}
                          onValueChange={(v) => update("charges", { ...pi.charges, murthal_one_time_discount_mode: v as "amount" | "percent" })}
                        >
                          <SelectTrigger className="h-9" disabled={!pi.charges.landed_discount_enabled}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percent">% of Grand Total</SelectItem>
                            <SelectItem value="amount">Flat ₹</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number" step="any" disabled={!pi.charges.landed_discount_enabled}
                          value={(pi.charges.murthal_one_time_discount_mode || "percent") === "percent"
                            ? (pi.charges.landed_discount || 0)
                            : (pi.charges.murthal_one_time_discount_amount || 0)}
                          onChange={(e) => {
                            const v = +e.target.value || 0;
                            if ((pi.charges.murthal_one_time_discount_mode || "percent") === "percent") {
                              update("charges", { ...pi.charges, landed_discount: v });
                            } else {
                              update("charges", { ...pi.charges, murthal_one_time_discount_amount: v });
                            }
                          }}
                        />
                      </div>
                      <div className="grid grid-cols-[auto_1fr_120px_140px] items-center gap-3">
                        <Switch checked={!!pi.charges.murthal_advance_enabled} onCheckedChange={(b) => update("charges", { ...pi.charges, murthal_advance_enabled: b })} />
                        <Label className={`text-sm ${pi.charges.murthal_advance_enabled ? "" : "text-muted-foreground line-through"}`}>Advance Adjustment</Label>
                        <Select
                          value={pi.charges.murthal_advance_mode || "percent"}
                          onValueChange={(v) => update("charges", { ...pi.charges, murthal_advance_mode: v as "amount" | "percent" })}
                        >
                          <SelectTrigger className="h-9" disabled={!pi.charges.murthal_advance_enabled}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percent">% of Grand Total</SelectItem>
                            <SelectItem value="amount">Flat ₹</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number" step="any" disabled={!pi.charges.murthal_advance_enabled}
                          value={(pi.charges.murthal_advance_mode || "percent") === "percent" ? (pi.charges.murthal_advance_percent || 0) : (pi.charges.murthal_advance_amount || 0)}
                          onChange={(e) => {
                            const v = +e.target.value || 0;
                            if ((pi.charges.murthal_advance_mode || "percent") === "percent") {
                              update("charges", { ...pi.charges, murthal_advance_percent: v });
                            } else {
                              update("charges", { ...pi.charges, murthal_advance_amount: v });
                            }
                          }}
                        />
                      </div>
                    </div>
                  )}
                </fieldset>
                </CardContent>
              </Card>
            )}

            {/* Revision history (legacy — kept read-only) */}
            {family.length > 1 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Revision history</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PI Number</TableHead>
                      <TableHead>Rev</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {family.map((f) => (
                      <TableRow key={f.id} className={f.id === pi.id ? "bg-primary/5" : ""}>
                        <TableCell className="font-mono text-xs">{f.pi_number}</TableCell>
                        <TableCell>R{f.revision}{f.is_current ? " · current" : ""}</TableCell>
                        <TableCell>{new Date(f.pi_date).toLocaleDateString("en-IN")}</TableCell>
                        <TableCell className="text-right">₹ {(f.totals?.net_payable || 0).toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => nav(`/pi/${f.id}`)}>Open</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            )}

            {/* Terms & Conditions */}
            {pi.format === "MR" ? (
              <Card>
                <CardHeader><CardTitle className="text-base">Terms &amp; Conditions</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={8} className="font-mono text-xs" />
                  <div className="flex justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setTerms(DEFAULT_MR_TERMS)}>Reset to default</Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader><CardTitle className="text-base">GMS Terms &amp; Conditions</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 text-sm">
                  <div><Label>Taxation</Label><Input value={gmsTerms.taxation} onChange={(e) => setGmsTerms({ ...gmsTerms, taxation: e.target.value })} /></div>
                  <div><Label>Freight</Label><Input value={gmsTerms.freight} onChange={(e) => setGmsTerms({ ...gmsTerms, freight: e.target.value })} /></div>
                  <div><Label>Insurance</Label><Input value={gmsTerms.insurance} onChange={(e) => setGmsTerms({ ...gmsTerms, insurance: e.target.value })} /></div>
                  <div className="col-span-2"><Label>Delivery Time</Label><Textarea rows={2} value={gmsTerms.delivery_time} onChange={(e) => setGmsTerms({ ...gmsTerms, delivery_time: e.target.value })} /></div>
                  <div className="col-span-2"><Label>Payment Terms</Label><Textarea rows={2} value={gmsTerms.payment_terms} onChange={(e) => setGmsTerms({ ...gmsTerms, payment_terms: e.target.value })} /></div>
                  <div className="col-span-2"><Label>General Conditions</Label><Textarea rows={2} value={gmsTerms.general_conditions} onChange={(e) => setGmsTerms({ ...gmsTerms, general_conditions: e.target.value })} /></div>
                  <div className="col-span-2 flex justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setGmsTerms(DEFAULT_GMS_TERMS)}>Reset to default</Button>
                  </div>
                </CardContent>
              </Card>
            )}
        </div>

        {/* Review & Export — full-width preview at the bottom (matches OA/BOQ) */}
        <section id="preview" className="space-y-3 pt-6 border-t">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Review &amp; Export</h2>
            <p className="text-sm text-muted-foreground">
              Scroll through the preview below. When everything looks correct, export the PI PDF.
            </p>
          </div>
          <OrderPreview
              oaNumber={pi.pi_number}
              format={pi.format}
              companyName={pi.company_name || ""}
              billTo={pi.bill_to}
              shipTo={pi.ship_to}
              sameAsBill={JSON.stringify(pi.bill_to) === JSON.stringify(pi.ship_to)}
              reference={pi.reference_oa_number || ""}
              costSheetNumber=""
              orderDate={pi.pi_date}
              preparedBy={pi.prepared_by || ""}
              items={pi.line_items}
              charges={{ ...pi.charges, discount_percent: 0 }}
              totals={{
                basic_total: totals.basic_total,
                subtotal: totals.subtotal,
                grand_total: effectiveGrand,
                net_payable: effectiveNet,
              }}
              amountInWords={amountInWords(effectiveNet)}
              notes={pi.notes || ""}
              onDownloadPDF={downloadPdf}
              terms={terms}
              bank={pi.format === "MR" ? DEFAULT_MR_BANK : undefined}
              gmsTerms={pi.format === "GMS" ? gmsTerms : undefined}
              docMeta={{
                title: "Proforma Invoice",
                numberLabel: pi.format === "MR" ? "PI Number" : "PI No.",
                numberValue: pi.pi_number,
                refLabel: "Ref. OA No.",
                refValue: pi.reference_oa_number || "-",
                hideFirstPageFooter: pi.format === "GMS",
                extraTotalsRows: gmsBreakdown ? [] : [
                  ...(pi.apply_discount && totals.one_time_discount_amount > 0
                    ? [
                        {
                          label: (pi.discount_label || "").trim() || "One Time Very Special Discount",
                          value: totals.one_time_discount_amount,
                        },
                        { label: "After Discount", value: totals.basic_after_discount },
                      ]
                    : []),
                  ...(totals.other_charges_amount > 0
                    ? [{ label: "Other Charges", value: totals.other_charges_amount }]
                    : []),
                  ...(totals.advance_adjustment_amount > 0
                    ? [
                        { label: "Grand Total", value: totals.gross_invoice_total, bold: true },
                        {
                          label: (pi.advance_mode || "percent") === "amount"
                            ? "Advance Adjustment"
                            : `Advance Adjustment @ ${pi.advance_adjustment_percent}%`,
                          value: totals.advance_adjustment_amount,
                        },
                        { label: "Net Payable", value: totals.net_payable_pi, bold: true },
                      ]
                    : []),
                ],
              }}
          />
          <div className="flex justify-end pt-2">
            <Button size="lg" onClick={downloadPdf} className="w-full sm:w-auto">
              <Download className="mr-2 h-4 w-4" />Export PI PDF
            </Button>
          </div>
        </section>
      </div>

    </div>
  );
}

function Row({ label, value, bold, highlight }: { label: string; value: number; bold?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${highlight ? "bg-primary/10 px-2 py-1 rounded" : ""}`}>
      <span className={bold ? "font-semibold" : ""}>{label}</span>
      <span className={`font-mono tabular-nums ${bold ? "font-semibold" : ""}`}>
        {value < 0 ? "−" : ""}₹ {Math.abs(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}

function PiToggleNumberRow({
  label, enabled, value, onToggle, onValue,
}: { label: string; enabled: boolean; value: number; onToggle: (b: boolean) => void; onValue: (v: number) => void; }) {
  return (
    <div className="grid grid-cols-[auto_1fr_140px] items-center gap-3">
      <Switch checked={enabled} onCheckedChange={onToggle} />
      <Label className={`text-sm ${enabled ? "" : "text-muted-foreground line-through"}`}>{label}</Label>
      <Input type="number" step="any" disabled={!enabled} value={value} onChange={(e) => onValue(+e.target.value || 0)} />
    </div>
  );
}

function PiModeToggleRow({
  label, enabled, mode, amount, percent, base, onPatch, keys,
}: {
  label: string;
  enabled: boolean;
  mode: "amount" | "percent";
  amount: number;
  percent: number;
  base?: "basic" | "landed";
  onPatch: (patch: Partial<Charges>) => void;
  keys: {
    enabled: keyof Charges;
    mode: keyof Charges;
    amount: keyof Charges;
    percent: keyof Charges;
    base?: keyof Charges;
  };
}) {
  const isPercent = mode === "percent";
  return (
    <div className="grid grid-cols-[auto_1fr_120px_120px_140px] items-center gap-3">
      <Switch checked={enabled} onCheckedChange={(b) => onPatch({ [keys.enabled]: b } as Partial<Charges>)} />
      <Label className={`text-sm ${enabled ? "" : "text-muted-foreground line-through"}`}>
        {label} {isPercent ? "(%)" : "(₹)"}
      </Label>
      <Select
        value={mode}
        onValueChange={(v) => onPatch({ [keys.mode]: v as "amount" | "percent" } as Partial<Charges>)}
      >
        <SelectTrigger className="h-9" disabled={!enabled}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="amount">Flat ₹</SelectItem>
          <SelectItem value="percent">%</SelectItem>
        </SelectContent>
      </Select>
      {isPercent && keys.base ? (
        <Select
          value={base || "basic"}
          onValueChange={(v) => onPatch({ [keys.base as keyof Charges]: v as "basic" | "landed" } as Partial<Charges>)}
        >
          <SelectTrigger className="h-9" disabled={!enabled}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="basic">on Basic</SelectItem>
            <SelectItem value="landed">on Landed</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <div />
      )}
      <Input
        type="number" step="any" disabled={!enabled}
        value={isPercent ? percent : amount}
        onChange={(e) => {
          const v = +e.target.value || 0;
          if (isPercent) onPatch({ [keys.percent]: v } as Partial<Charges>);
          else onPatch({ [keys.amount]: v } as Partial<Charges>);
        }}
      />
    </div>
  );
}