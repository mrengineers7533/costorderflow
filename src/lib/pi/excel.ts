import * as XLSX from "xlsx";
import type { PiRecord } from "./types";
import { calcExTurkey, calcExMurthal } from "@/lib/orders/calc";
import { calcPiTotals } from "./calc";

/**
 * Build a PI .xlsx that mirrors the OA layout for the same revision:
 *  – item table with selected items + qty
 *  – full calculation chain (GMS Murthal/Turkey/CIF Port → same rows as OA PDF;
 *    MR / generic → standard PI chain via calcPiTotals)
 *  – currency follows the source OA (USD when PU Dollar Rate is set).
 */
export function buildPiXlsx(pi: PiRecord): Blob {
  const c = pi.charges;
  const t = pi.totals || ({} as PiRecord["totals"]);
  const basic = Number(t.basic_total) || 0;

  // Currency display rules — mirror src/lib/orders/pdf.ts (GMS branch).
  const turkeyRate = (c.turkey_pu_dollar_rate || 0) > 0
    ? (c.turkey_pu_dollar_rate as number)
    : (c.fx_rate || 0);
  const turkeyAlwaysUSD =
    pi.format === "GMS" && c.gms_mode === "EXW_TURKEY" && turkeyRate > 0;
  const isCifPort = pi.format === "GMS" && c.gms_mode === "EXW_CIF_PORT";
  const cifRate = c.cif_pu_dollar_rate || 0;
  const gmsUsd =
    pi.format === "GMS" && cifRate > 0 && c.gms_mode !== "EXW_TURKEY";
  const usdDisplay = turkeyAlwaysUSD || gmsUsd;
  const usdRate = turkeyAlwaysUSD ? (turkeyRate || 1) : (gmsUsd ? cifRate : 1);
  const cur = usdDisplay ? "USD" : "INR";
  const sym = usdDisplay ? "$" : "₹";
  const toDisplay = (inr: number) => (usdDisplay ? inr / usdRate : inr);
  const fmt = (n: number) =>
    usdDisplay
      ? Number((n / usdRate).toFixed(2))
      : Number(n.toFixed(2));

  const header: (string | number)[][] = [
    [`PI No.: ${pi.pi_number}`],
    [`Format: ${pi.format}    Revision: R${pi.revision ?? 0}${pi.is_current ? " (Current)" : " (Superseded)"}`],
    [`Reference OA: ${pi.reference_oa_number || "-"}`],
    [`Customer: ${pi.company_name || pi.bill_to?.name || ""}`],
    [`Date: ${pi.pi_date || ""}`],
    [`Prepared By: ${pi.prepared_by || ""}`],
    [`Currency: ${cur}`],
    [],
    ["S.No", "Description", "HSN/Model", "Qty", "Unit", `Rate (${cur})`, `Amount (${cur})`],
  ];

  const items = (pi.line_items || []).map((it, i) => [
    i + 1,
    it.description || "",
    it.hsn_code || "",
    Number(it.quantity) || 0,
    it.unit || "",
    fmt(Number(it.unit_rate) || 0),
    fmt(Number(it.amount) || 0),
  ]);

  // Build the calculation chain — same structure as OA / PI PDF.
  const chain: Array<[string, number]> = [];
  if (pi.format === "GMS" && isCifPort) {
    const basicUsd = cifRate > 0 ? basic / cifRate : 0;
    const seaUsd = (c.cif_sea_freight_mode || "amount") === "percent"
      ? (basicUsd * (c.cif_sea_freight_percent || 0)) / 100
      : (c.cif_sea_freight_usd || 0);
    const grandUsd = basicUsd + seaUsd;
    chain.push(["Basic Total", Number(basicUsd.toFixed(2))]);
    chain.push([
      (c.cif_sea_freight_mode || "amount") === "percent"
        ? `Local Freight @ ${c.cif_sea_freight_percent || 0}%`
        : "Local Freight",
      Number(seaUsd.toFixed(2)),
    ]);
    chain.push(["EX Work CIF Port", Number(grandUsd.toFixed(2))]);
  } else if (pi.format === "GMS" && c.gms_mode === "EXW_TURKEY") {
    const tk = calcExTurkey(basic, c);
    chain.push(["Base Amount (EXW Turkey)", fmt(tk.base_amount)]);
    if (c.turkey_sea_freight_enabled) chain.push(["Sea Freight", fmt(tk.sea_freight)]);
    if (c.turkey_custom_enabled)
      chain.push([`Custom Duty${c.turkey_custom_percent ? ` @ ${c.turkey_custom_percent}%` : ""}`, fmt(tk.custom)]);
    if (c.turkey_landed_discount_enabled && tk.landed_discount > 0) {
      chain.push(["Discount on Landed", fmt(-tk.landed_discount)]);
      chain.push(["Net Landed Price", fmt(tk.net_landed)]);
    }
    if (c.turkey_insurance_enabled) chain.push(["Insurance", fmt(tk.insurance)]);
    if (c.turkey_pf_enabled) chain.push(["P&F", fmt(tk.pf)]);
    if (c.turkey_freight_enabled && tk.freight > 0) chain.push(["Freight", fmt(tk.freight)]);
    if (c.turkey_gst_enabled) chain.push([`GST${c.turkey_gst_percent ? ` @ ${c.turkey_gst_percent}%` : ""}`, fmt(tk.gst)]);
    chain.push(["Grand Total", fmt(tk.grand_total)]);
    if (c.turkey_advance_enabled && tk.advance_amount > 0) {
      chain.push(["Advance Adjustment", fmt(tk.advance_amount)]);
    }
    chain.push(["Net Payable", fmt(tk.net_payable)]);
  } else if (pi.format === "GMS" && (c.gms_mode === "EXW_MURTHAL" || c.ex_murthal_enabled)) {
    const m = calcExMurthal(basic, c);
    chain.push(["Base Amount (EXW Turkey)", fmt(m.base_amount)]);
    if (c.sea_freight_enabled) chain.push(["Sea Freight", fmt(m.sea_freight)]);
    if (c.custom_enabled) chain.push(["Custom Duty", fmt(m.custom)]);
    if (c.clearing_enabled) chain.push(["Clearing Charge / CHA & Port", fmt(m.clearing)]);
    chain.push(["Landed Price", fmt(m.total_amount)]);
    if (c.murthal_landed_discount_enabled && m.landed_discount_amount > 0) {
      chain.push(["Discount on Landed", fmt(-m.landed_discount_amount)]);
      chain.push(["Net Landed Price", fmt(m.net_landed)]);
    }
    if (c.sea_insurance_enabled) chain.push(["Insurance", fmt(m.sea_insurance)]);
    if ((c.murthal_pf_enabled || c.pf_amount > 0 || c.pf_percent > 0) && m.pf > 0)
      chain.push(["P&F", fmt(m.pf)]);
    if ((c.murthal_freight_enabled || c.freight_enabled) && m.freight > 0)
      chain.push(["Freight", fmt(m.freight)]);
    if (c.landed_gst_enabled) chain.push(["GST", fmt(m.gst)]);
    chain.push(["Grand Total", fmt(m.grand_total)]);
    if (c.murthal_advance_enabled && m.advance_amount > 0)
      chain.push(["Advance Adjustment", fmt(-m.advance_amount)]);
    chain.push(["Net Payable", fmt(m.net_payable)]);
  } else {
    // MR / generic PI — use standard PI calc chain.
    const advMode = pi.advance_mode || "percent";
    const advValue = advMode === "amount"
      ? (pi.advance_amount || 0)
      : (pi.advance_adjustment_percent || 0);
    const tt = calcPiTotals(
      pi.line_items,
      c,
      pi.one_time_discount_percent || 0,
      { mode: advMode, value: advValue },
      pi.other_charges || 0,
    );
    chain.push(["Basic Total", fmt(tt.basic_total)]);
    if ((pi.apply_discount ?? (pi.one_time_discount_percent > 0)) && tt.one_time_discount_amount > 0) {
      const lbl = (pi.discount_label || "One Time Very Special Discount").trim() || "Discount";
      chain.push([lbl, fmt(tt.one_time_discount_amount)]);
      chain.push(["After Discount", fmt(tt.basic_after_discount)]);
    }
    if (tt.pf_amount > 0) chain.push(["P&F", fmt(tt.pf_amount)]);
    if (tt.insurance_amount > 0) chain.push(["Insurance", fmt(tt.insurance_amount)]);
    if (tt.freight_amount > 0) chain.push(["Freight", fmt(tt.freight_amount)]);
    if (tt.other_charges_amount > 0) chain.push(["Other Charges", fmt(tt.other_charges_amount)]);
    chain.push([`GST @ ${c.gst_percent || 0}%`, fmt(tt.gst_amount)]);
    chain.push(["Grand Total", fmt(tt.gross_invoice_total)]);
    if (tt.advance_adjustment_amount > 0) chain.push(["Advance Adjustment", fmt(tt.advance_adjustment_amount)]);
    chain.push(["Net Payable", fmt(tt.net_payable_pi)]);
  }

  const tail: (string | number)[][] = [
    [],
    ...chain.map(([label, val]) => ["", "", "", "", "", `${label} (${sym})`, val] as (string | number)[]),
  ];

  const ws = XLSX.utils.aoa_to_sheet([...header, ...items, ...tail]);
  ws["!cols"] = [
    { wch: 6 }, { wch: 50 }, { wch: 16 }, { wch: 8 }, { wch: 8 },
    { wch: 28 }, { wch: 18 },
  ];
  // Avoid unused var warning
  void toDisplay;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "PI");
  const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([arr], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}