import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, GitBranch, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PiRecord } from "@/lib/pi/types";
import { calcPiTotals } from "@/lib/pi/calc";
import { generatePiPDF } from "@/lib/pi/pdf";
import { createPiRevision, fetchPiFamily } from "@/lib/pi/convert";
import { OrderPreview } from "@/components/orders/OrderPreview";
import { amountInWords, calcLineAmount } from "@/lib/orders/calc";
import { Textarea } from "@/components/ui/textarea";
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
  const [confirmRevise, setConfirmRevise] = useState(false);
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
        setPi(rec);
        const fam = await fetchPiFamily(rec.parent_pi_id || rec.id);
        setFamily(fam);
        setLoading(false);
      });
  }, [id, nav]);

  const totals = useMemo(() => {
    if (!pi) return null;
    return calcPiTotals(pi.line_items, pi.charges, pi.one_time_discount_percent, pi.advance_adjustment_percent);
  }, [pi]);

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
          grand_total: totals!.grand_total_pi,
          net_payable: totals!.net_payable_pi,
        },
        amount_in_words: amountInWords(totals!.net_payable_pi),
      }, { terms, gmsTerms });
      const safe = (pi.pi_number || "PI").replace(/[/\\]/g, "_");
      doc.save(`${safe}.pdf`);
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message || String(e), variant: "destructive" });
    }
  }

  async function reviseSave() {
    if (!pi) return;
    setSaving(true);
    try {
      const newRev = await createPiRevision(pi, {});
      toast({ title: `Created ${newRev.pi_number}` });
      nav(`/pi/${newRev.id}`);
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSaving(false);
      setConfirmRevise(false);
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
            <Button className="rounded-lg" disabled={saving} onClick={() => setConfirmRevise(true)}>
              <GitBranch className="mr-1 h-4 w-4" />Save as new revision
            </Button>
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
              <CardHeader><CardTitle className="text-base">Line items</CardTitle></CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">PI adjustments</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <Label>One-Time Discount % <span className="text-muted-foreground text-xs">(on Subtotal)</span></Label>
                  <Input
                    type="number" step="0.01" min={0} max={100}
                    value={pi.one_time_discount_percent}
                    onChange={(e) => update("one_time_discount_percent", Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Advance Adjustment % <span className="text-muted-foreground text-xs">(on Grand Total)</span></Label>
                  <Input
                    type="number" step="0.01" min={0} max={100}
                    value={pi.advance_adjustment_percent}
                    onChange={(e) => update("advance_adjustment_percent", Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label>GST %</Label>
                  <Input type="number" step="0.01" value={pi.charges.gst_percent || 0}
                    onChange={(e) => update("charges", { ...pi.charges, gst_percent: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Freight (₹)</Label>
                  <Input type="number" value={pi.charges.freight || 0}
                    onChange={(e) => update("charges", { ...pi.charges, freight: Number(e.target.value), freight_enabled: Number(e.target.value) > 0 })} />
                </div>
              </CardContent>
              <CardContent className="border-t pt-3 text-sm space-y-1">
                <Row label="Basic Total" value={totals.basic_total} />
                <Row label="Subtotal" value={totals.subtotal} />
                {totals.one_time_discount_amount > 0 && (
                  <Row label={`(–) Discount @ ${pi.one_time_discount_percent}%`} value={-totals.one_time_discount_amount} />
                )}
                <Row label={`GST @ ${pi.charges.gst_percent}%`} value={totals.gst_amount} />
                <Row label="Grand Total" value={totals.grand_total_pi} bold />
                {totals.advance_adjustment_amount > 0 && (
                  <Row label={`(–) Advance @ ${pi.advance_adjustment_percent}%`} value={-totals.advance_adjustment_amount} />
                )}
                <Row label="Net Payable" value={totals.net_payable_pi} bold highlight />
              </CardContent>
            </Card>

            {/* Revision history */}
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
                grand_total: totals.grand_total_pi,
                net_payable: totals.grand_total_pi,
              }}
              amountInWords={amountInWords(totals.net_payable_pi)}
              notes={pi.notes || ""}
              onDownloadPDF={downloadPdf}
              docMeta={{
                title: "Proforma Invoice",
                numberLabel: pi.format === "MR" ? "PI Number" : "PI No.",
                numberValue: pi.pi_number,
                refLabel: "Ref. OA No.",
                refValue: pi.reference_oa_number || "-",
                extraTotalsRows: [
                  ...(pi.one_time_discount_percent > 0 && totals.one_time_discount_amount > 0
                    ? [{
                        label: `One-Time Discount @ ${pi.one_time_discount_percent}% (on Subtotal)`,
                        value: -totals.one_time_discount_amount,
                      }]
                    : []),
                  ...(pi.advance_adjustment_percent > 0 && totals.advance_adjustment_amount > 0
                    ? [
                        {
                          label: `Advance Adjustment @ ${pi.advance_adjustment_percent}% (on Grand Total)`,
                          value: -totals.advance_adjustment_amount,
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

      <AlertDialog open={confirmRevise} onOpenChange={setConfirmRevise}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save as a new revised copy?</AlertDialogTitle>
            <AlertDialogDescription>
              Any change in this PI will create a revised copy. The original
              <span className="font-mono mx-1">{pi.pi_number}</span> stays unchanged.
              The new revision will be numbered automatically (e.g. /R{(family[family.length - 1]?.revision || pi.revision) + 1}).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={reviseSave} disabled={saving}>
              <Save className="mr-1 h-4 w-4" />Create revision
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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