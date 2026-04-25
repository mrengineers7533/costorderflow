import { useMemo, useState } from "react";
import { CostSheetPicker, type ExtractedCostSheet } from "@/components/orders/CostSheetPicker";
import { OrderPreview } from "@/components/orders/OrderPreview";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Address, Charges, LineItem, OrderFormat } from "@/lib/orders/types";
import { amountInWords, calcLineAmount, calcTotals, detectFormat } from "@/lib/orders/calc";

const emptyAddress: Address = { name: "", address: "", gstin: "", state: "", state_code: "" };
const emptyCharges: Charges = {
  pf_percent: 1.5, pf_amount: 0, insurance: 0, insurance_percent: 0.071,
  freight_enabled: false, freight: 0,
  gst_percent: 18, gst_amount: 0, discount: 0, discount_percent: 0,
};

/**
 * Self-contained panel: upload a cost sheet PDF, watch the order preview
 * fill in live as AI extraction completes. Read-only preview — to edit,
 * users continue into the full editor.
 */
export function QuickOrderPanel() {
  const [companyName, setCompanyName] = useState("");
  const [billTo, setBillTo] = useState<Address>(emptyAddress);
  const [shipTo, setShipTo] = useState<Address>(emptyAddress);
  const [sameAsBill, setSameAsBill] = useState(true);
  const [reference, setReference] = useState("");
  const [costSheetNumber, setCostSheetNumber] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [charges, setCharges] = useState<Charges>(emptyCharges);
  const [notes, setNotes] = useState("");
  const [format, setFormat] = useState<OrderFormat>("MR");
  const [parsing, setParsing] = useState(false);
  const [hasData, setHasData] = useState(false);

  const itemsWithAmounts = useMemo(
    () => items.map((it) => ({ ...it, amount: calcLineAmount(it.quantity, it.unit_rate) })),
    [items],
  );
  const totals = useMemo(() => calcTotals(itemsWithAmounts, charges), [itemsWithAmounts, charges]);
  const words = useMemo(() => amountInWords(totals.net_payable), [totals.net_payable]);

  function applyCostSheet(data: ExtractedCostSheet) {
    setHasData(true);
    if (data.company_name) setCompanyName(data.company_name);
    // Decide format from company name AND line items (any "GMS" → GMS).
    setFormat(detectFormat(data.company_name || "", data.line_items));
    if (data.bill_to) setBillTo({ ...emptyAddress, ...data.bill_to });
    if (data.ship_to && (data.ship_to.name || data.ship_to.address)) {
      setShipTo({ ...emptyAddress, ...data.ship_to });
      setSameAsBill(false);
    }
    if (data.cost_sheet_number) setCostSheetNumber(data.cost_sheet_number);
    if (data.reference) setReference(data.reference);
    if (data.line_items?.length) {
      setItems(
        data.line_items.map((it) => ({
          id: crypto.randomUUID(),
          description: it.description || "",
          hsn_code: it.hsn_code || "",
          quantity: Number(it.quantity) || 0,
          unit_rate: Number(it.unit_rate) || 0,
          amount: Number(it.amount) || (Number(it.quantity) || 0) * (Number(it.unit_rate) || 0),
        })),
      );
    }
    if (data.charges) {
      setCharges((c) => ({
        ...c,
        pf_percent: data.charges?.pf_percent ?? c.pf_percent,
        pf_amount: data.charges?.pf_amount ?? c.pf_amount,
        insurance: data.charges?.insurance ?? c.insurance,
        freight: data.charges?.freight ?? c.freight,
        freight_enabled: (data.charges?.freight ?? 0) > 0 ? true : c.freight_enabled,
        gst_percent: data.charges?.gst_percent ?? c.gst_percent,
        discount: data.charges?.discount ?? c.discount,
      }));
    }
    if (data.notes) setNotes(data.notes);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-3 min-w-0">
        <CostSheetPicker onApply={applyCostSheet} onParsingChange={setParsing} />
        {(hasData || parsing) && (
          <Button asChild variant="default" size="sm">
            <Link to="/orders/new">Continue editing in full editor<ArrowRight className="ml-1 h-4 w-4" /></Link>
          </Button>
        )}
      </div>
      <div className="lg:sticky lg:top-4 lg:self-start">
        <OrderPreview
          oaNumber=""
          format={format}
          companyName={companyName}
          billTo={billTo}
          shipTo={shipTo}
          sameAsBill={sameAsBill}
          reference={reference}
          costSheetNumber={costSheetNumber}
          orderDate={new Date().toISOString().slice(0, 10)}
          preparedBy=""
          items={itemsWithAmounts}
          charges={charges}
          totals={totals}
          amountInWords={words}
          notes={notes}
          parsing={parsing}
        />
      </div>
    </div>
  );
}