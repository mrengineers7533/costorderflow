import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Trash2, Plus, Download, ArrowLeft, ClipboardList, GitBranch, Eye, Receipt, Users } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { Address, Charges, LineItem, OrderFormat, OrderRecord } from "@/lib/orders/types";
import { amountInWords, calcLineAmount, calcTotals, detectFormat, displayMake, getFinancialYear, inferItemMake, splitItemsByMake } from "@/lib/orders/calc";
import { amountInWordsUSD } from "@/lib/orders/calc";
import { generateOrderPDF } from "@/lib/orders/pdf";
import type { PdfColumnKey } from "@/lib/orders/pdfColumns";
import { PdfColumnVisibility } from "@/components/orders/PdfColumnVisibility";
import { buildClientCopyItems } from "@/lib/orders/clientCopy";
import { saveClientCopy } from "@/lib/orders/clientCopies";
import { CostSheetPicker, type ExtractedCostSheet } from "@/components/orders/CostSheetPicker";
import { OrderPreview } from "@/components/orders/OrderPreview";
import { DEFAULT_MR_BANK, DEFAULT_MR_TERMS, DEFAULT_GMS_TERMS, type BankDetails, type GMSTerms } from "@/lib/orders/defaults";
import { RevisionsPanel } from "@/components/orders/RevisionsPanel";
import { OaRevisionHistory } from "@/components/orders/OaRevisionHistory";
import { reviseOrder, syncBoqsAndPisForOrder, createInitialBoqForOrder } from "@/lib/revisions";
import type { BoqRecord } from "@/lib/boq/types";
import { PiItemSelectDialog } from "@/components/pi/PiItemSelectDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CurrencyToolbar } from "@/components/common/CurrencyToolbar";
import { convertItems, convertCharges, type CurrencyMode } from "@/lib/currency/convert";
import { useLatestDesignReview } from "@/components/boqs/DesignCommentsInline";
import { findReviewItemForOaItem, parseColumnComments, type ColKey } from "@/lib/orders/designComments";
import type { DesignReviewItemRow, DesignReviewRow } from "@/lib/boq/designReview";

const emptyAddress: Address = { name: "", address: "", gstin: "", state: "", state_code: "" };
const emptyCharges: Charges = {
  pf_percent: 1.5, pf_amount: 0, insurance: 0, insurance_percent: 0.071,
  freight_enabled: false, freight: 0,
  gst_percent: 18, gst_amount: 0, discount: 0, discount_percent: 0,
};

export default function OrderEditor() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = !id || id === "new";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [orderId, setOrderId] = useState<string | null>(null);
  const [oaNumber, setOaNumber] = useState<string>("");
  // Revision metadata for the loaded order
  const [parentOrderId, setParentOrderId] = useState<string | null>(null);
  const [revision, setRevision] = useState<number>(0);
  const [isCurrent, setIsCurrent] = useState<boolean>(true);
  const [revisionsKey, setRevisionsKey] = useState(0);
  // Tracks the BOQ that's current for this OA family (for View / Revise / Download BOQ buttons).
  const [currentBoq, setCurrentBoq] = useState<BoqRecord | null>(null);
  // Confirmation dialogs
  const [confirmReviseOa, setConfirmReviseOa] = useState(false);
  // BOQ revisions removed — BOQ auto-syncs from current OA on save.
  const [format, setFormat] = useState<OrderFormat>("MR");
  const [autoFormat, setAutoFormat] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [billTo, setBillTo] = useState<Address>(emptyAddress);
  const [shipTo, setShipTo] = useState<Address>(emptyAddress);
  const [sameAsBill, setSameAsBill] = useState(true);
  const [reference, setReference] = useState("");
  const [costSheetNumber, setCostSheetNumber] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [preparedBy, setPreparedBy] = useState("");
  const [items, setItems] = useState<LineItem[]>([newItem()]);
  const [chargesMr, setChargesMr] = useState<Charges>(emptyCharges);
  const [chargesGms, setChargesGms] = useState<Charges>(emptyCharges);
  const [notes, setNotes] = useState("");
  const [parsing, setParsing] = useState(false);
  const [terms, setTerms] = useState<string>(DEFAULT_MR_TERMS);
  const [bank, setBank] = useState<BankDetails>(DEFAULT_MR_BANK);
  const [gmsTerms, setGmsTerms] = useState<GMSTerms>(DEFAULT_GMS_TERMS);
  // Optional free-form note that prints under the Terms & Conditions block.
  const [tcNote, setTcNote] = useState<string>("");
  // Editor-only filter for the Line Items table. Does NOT affect the OA
  // format / preview / PDF — those still follow the Format dropdown above.
  const [lineItemsView, setLineItemsView] = useState<"MR" | "GMS" | "ALL">("ALL");
  // INR↔USD conversion state. Persisted on the OA record.
  const [currencyMode, setCurrencyMode] = useState<CurrencyMode>("INR");
  const [exchangeRate, setExchangeRate] = useState<number>(83);
  // EXW Murthal — separate "Amount in INR" rate (₹ per $) used by the
  // Landed Price panel to convert the USD Landed Price into INR for
  // P&F / Insurance / GST / Grand Total. Persisted on charges
  // (`murthal_landed_inr_rate`); this local mirror keeps the input
  // controlled when charges change.
  // Columns hidden from the rendered PDF / preview only. Not persisted —
  // it's an export-time toggle and does not affect saved data.
  const [hiddenPdfColumns, setHiddenPdfColumns] = useState<PdfColumnKey[]>([]);

  // PI item-selection dialog state (opened from "Convert to PI" button).
  const [piDialogOpen, setPiDialogOpen] = useState(false);
  const [piDialogOa, setPiDialogOa] = useState<OrderRecord | null>(null);

  function newItem(): LineItem {
    return { id: crypto.randomUUID(), description: "", hsn_code: "", make_label: "", quantity: 1, unit: "Nos", unit_rate: 0, amount: 0, make: "MR" };
  }

  // Load existing
  useEffect(() => {
    if (isNew) return;
    supabase.from("orders").select("*").eq("id", id!).maybeSingle().then(({ data, error }) => {
      if (error || !data) {
        toast({ title: "Not found", variant: "destructive" });
        navigate("/orders");
        return;
      }
      const o = data as unknown as OrderRecord;
      setOrderId(o.id); setOaNumber(o.oa_number); setFormat(o.format); setAutoFormat(false);
      setCompanyName(o.company_name || ""); setBillTo(o.bill_to || emptyAddress);
      setShipTo(o.ship_to || emptyAddress); setSameAsBill(JSON.stringify(o.bill_to) === JSON.stringify(o.ship_to));
      setReference(o.reference || ""); setCostSheetNumber(o.cost_sheet_number || "");
      setOrderDate(o.order_date); setPreparedBy(o.prepared_by || "");
      setItems(o.line_items?.length ? o.line_items : [newItem()]);
      setChargesMr({ ...emptyCharges, ...o.charges });
      // Independent GMS slot. If the row has no charges_gms (legacy single-make
      // OA), seed an empty GMS block — do NOT copy from MR, otherwise toggling
      // the Format dropdown would pre-fill GMS with MR's values.
      setChargesGms({ ...emptyCharges, ...(o.charges_gms || {}) });
      setNotes(o.notes || "");
      setTcNote((o as unknown as { tc_note?: string }).tc_note || "");
      const saved = o as unknown as { currency_mode?: CurrencyMode; exchange_rate?: number | null };
      setCurrencyMode(saved.currency_mode === "USD" ? "USD" : "INR");
      if (saved.exchange_rate && saved.exchange_rate > 0) setExchangeRate(Number(saved.exchange_rate));
      setParentOrderId(o.parent_order_id || o.id);
      setRevision(o.revision ?? 0);
      setIsCurrent(o.is_current ?? true);
      setLoading(false);
    });
  }, [id, isNew, navigate]);

  // Look up the current BOQ in this OA family (so we can render View/Revise/Download BOQ buttons).
  useEffect(() => {
    if (!parentOrderId) { setCurrentBoq(null); return; }
    (async () => {
      const { data: family } = await supabase.from("orders").select("id").eq("parent_order_id", parentOrderId);
      const ids = (family || []).map((r) => (r as { id: string }).id);
      if (!ids.length) { setCurrentBoq(null); return; }
      const { data } = await supabase.from("boqs").select("*").in("order_id", ids).eq("is_current", true).maybeSingle();
      setCurrentBoq((data as unknown as BoqRecord) || null);
    })();
  }, [parentOrderId, revisionsKey]);

  // Auto-backfill `make_label` from the linked cost sheet for OAs saved
  // before the Make column was captured. Read-only state hydration: matches
  // by description (case-insensitive) with index fallback for duplicates.
  // Does NOT auto-save and does NOT touch any numeric fields.
  useEffect(() => {
    if (isNew || loading) return;
    if (!costSheetNumber) return;
    if (!items.some((it) => !(it.make_label || "").trim())) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("cost_sheets")
        .select("extracted, created_at")
        .eq("status", "parsed")
        .order("created_at", { ascending: false });
      if (cancelled || !data) return;
      const match = (data as Array<{ extracted: { cost_sheet_number?: string; line_items?: Array<{ description?: string; make_label?: string }> } }>)
        .find((r) => (r.extracted?.cost_sheet_number || "").trim() === costSheetNumber.trim());
      const csItems = match?.extracted?.line_items || [];
      if (!csItems.length) return;
      const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
      // Build a multimap so duplicate descriptions get consumed in order.
      const buckets = new Map<string, string[]>();
      csItems.forEach((ci) => {
        const key = norm(ci.description || "");
        const lbl = (ci.make_label || "").trim();
        if (!lbl) return;
        const arr = buckets.get(key) || [];
        arr.push(lbl);
        buckets.set(key, arr);
      });
      setItems((prev) => {
        const consumed = new Map<string, number>();
        let changed = false;
        const next = prev.map((it, idx) => {
          if ((it.make_label || "").trim()) return it;
          const key = norm(it.description || "");
          const arr = buckets.get(key);
          let lbl: string | undefined;
          if (arr && arr.length) {
            const used = consumed.get(key) || 0;
            lbl = arr[used];
            consumed.set(key, used + 1);
          } else if (csItems[idx]) {
            // Index fallback when description doesn't match
            lbl = (csItems[idx].make_label || "").trim() || undefined;
          }
          if (!lbl) return it;
          changed = true;
          return { ...it, make_label: lbl };
        });
        return changed ? next : prev;
      });
    })();
    return () => { cancelled = true; };
  }, [isNew, loading, costSheetNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto format from company name AND line items (any "GMS" mention → GMS).
  useEffect(() => {
    if (!autoFormat) return;
    setFormat(detectFormat(companyName, items));
  }, [companyName, items, autoFormat]);

  // Pre-fill from extracted cost sheet passed via router state (from chooser page).
  useEffect(() => {
    if (!isNew) return;
    let extracted: ExtractedCostSheet | undefined;
    let forcedFormat: OrderFormat | undefined;
    const state = location.state as { extracted?: ExtractedCostSheet; forcedFormat?: OrderFormat } | null;
    if (state?.extracted) {
      extracted = state.extracted;
      forcedFormat = state.forcedFormat;
    } else {
      // Recover from sessionStorage so a hard refresh doesn't lose the
      // Apply'd cost-sheet data.
      try {
        const raw = sessionStorage.getItem("oa-draft-extracted");
        if (raw) {
          const parsed = JSON.parse(raw) as { extracted?: ExtractedCostSheet; forcedFormat?: OrderFormat | null };
          extracted = parsed.extracted;
          forcedFormat = parsed.forcedFormat || undefined;
        }
      } catch { /* ignore */ }
    }
    if (!extracted) return;
    if (forcedFormat) {
      setFormat(forcedFormat);
      setAutoFormat(false);
      applyCostSheet(extracted, forcedFormat);
    } else {
      applyCostSheet(extracted);
    }
    // Clear router state so refresh / back doesn't re-apply.
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Honor ?action=download from the global search command palette.
  // Triggers the existing downloadPDF flow once the order has loaded,
  // then strips the query so refresh won't re-trigger it.
  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(location.search);
    if (params.get("action") === "download") {
      // Defer to next tick so all state (items/charges) is settled.
      setTimeout(() => { downloadPDF(); }, 50);
      params.delete("action");
      const next = params.toString();
      navigate(`${location.pathname}${next ? `?${next}` : ""}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, location.search]);

  // Recompute amounts (full set, all makes)
  const allItemsWithAmounts = useMemo(
    () => items.map((it) => ({
      ...it,
      make: it.make || inferItemMake(it),
      amount: calcLineAmount(it.quantity, it.unit_rate),
    })),
    [items]
  );

  // Items visible / printed for the currently selected OA format.
  // If the cost sheet has both MR and GMS items, only items matching the
  // current format render in this OA — switch the Format dropdown to see
  // (and download) the other one.
  const hasMR = allItemsWithAmounts.some((i) => i.make === "MR");
  const hasGMS = allItemsWithAmounts.some((i) => i.make === "GMS");
  const splitMode = hasMR && hasGMS;
  const itemsWithAmounts = useMemo(
    () => splitMode
      ? allItemsWithAmounts.filter((i) => i.make === format)
      : allItemsWithAmounts,
    [allItemsWithAmounts, splitMode, format]
  );
  // Active charges: when the OA contains both MR and GMS items, each side
  // edits its own independent charges block. Otherwise both states stay in
  // lock-step on the MR slot (legacy behaviour).
  // Charges are always per-format. Switching the Format dropdown swaps the
  // entire charges block (P&F, Insurance, Sea Freight, Custom, GST, Discount,
  // EXW Murthal/Turkey rows, currency/FX, etc.) regardless of split mode.
  const charges = format === "GMS" ? chargesGms : chargesMr;
  // Functional updates so the write always uses the latest slot for the
  // currently-active format and never accidentally captures the other side.
  const setCharges = (updater: Charges | ((c: Charges) => Charges)) => {
    const fn = typeof updater === "function"
      ? (updater as (c: Charges) => Charges)
      : () => updater;
    if (format === "GMS") setChargesGms((prev) => fn(prev));
    else setChargesMr((prev) => fn(prev));
  };
  // Single helper so the top Format dropdown, preview MR/GMS toggle, and
  // line-items MR/GMS toggle all switch the active company in lock-step.
  const switchFormat = (f: OrderFormat) => {
    setAutoFormat(false);
    setFormat(f);
  };
  // List used by the editor table — filtered by the in-section toggle.
  const editorItems = useMemo(
    () => lineItemsView === "ALL"
      ? allItemsWithAmounts
      : allItemsWithAmounts.filter((i) => i.make === lineItemsView),
    [allItemsWithAmounts, lineItemsView]
  );
  // Design-team comments on the linked BOQ — surfaced item-wise under the
  // matching OA row so the OA creator can update the OA directly. Pure UI:
  // no effect on totals, charges, saved payload, PDFs, BOQ, or PI.
  const designReview = useLatestDesignReview(currentBoq?.id || null);
  const oaEditable = isNew || isCurrent;
  // Keep the editor view in sync with the OA format when the order has both
  // makes — first time we detect a split, default the toggle to the current
  // format so behavior matches what users saw before.
  useEffect(() => {
    if (splitMode && lineItemsView === "ALL") setLineItemsView(format);
    if (!splitMode && lineItemsView !== "ALL") setLineItemsView("ALL");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitMode]);
  const totals = useMemo(() => calcTotals(itemsWithAmounts, charges), [itemsWithAmounts, charges]);
  const words = useMemo(() => amountInWords(totals.net_payable), [totals.net_payable]);

  function updateItemById(itemId: string, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...patch } : it)));
  }
  function removeItemById(itemId: string) {
    setItems((prev) => {
      const next = prev.filter((it) => it.id !== itemId);
      return next.length === 0 ? [newItem()] : next;
    });
  }

  async function save(finalize: boolean) {
    if (!isNew && !isCurrent) {
      toast({ title: "Read-only revision", description: "This is a superseded OA revision. Open the current revision to edit.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const ship = sameAsBill ? billTo : shipTo;
    let oa = oaNumber;
    if (isNew && !oa) {
      const fy = getFinancialYear(new Date(orderDate));
      const { data, error } = await supabase.rpc("next_oa_number", { _format: format, _financial_year: fy });
      if (error) { setSaving(false); return toast({ title: "OA number failed", description: error.message, variant: "destructive" }); }
      oa = data as string;
      setOaNumber(oa);
    }
    const { data: authData } = await supabase.auth.getUser();
    const currentUserId = authData.user?.id ?? null;
    const payload = {
      oa_number: oa, format, status: finalize ? "finalized" as const : "draft" as const,
      company_name: companyName, bill_to: billTo, ship_to: ship,
      reference, cost_sheet_number: costSheetNumber, order_date: orderDate, prepared_by: preparedBy,
      line_items: itemsWithAmounts,
      // Always persist both sides so the Format dropdown restores its own
      // independent values on reload.
      charges: chargesMr,
      charges_gms: chargesGms,
      totals, amount_in_words: words, notes,
      tc_note: tcNote,
      currency_mode: currencyMode,
      exchange_rate: exchangeRate || null,
      ...(isNew ? { user_id: currentUserId } : {}),
    };

    const res = isNew
      ? await supabase.from("orders").insert(payload as never).select().single()
      : await supabase.from("orders").update(payload as never).eq("id", orderId!).select().single();

    setSaving(false);
    if (res.error) return toast({ title: "Save failed", description: res.error.message, variant: "destructive" });
    // OA-driven model: push fresh data into linked BOQs & PIs.
    try {
      await syncBoqsAndPisForOrder(res.data as never);
    } catch (e) {
      console.warn("BOQ/PI auto-sync failed", e);
    }
    // Auto-create the initial BOQ (MR or GMS) so it appears in the BOQ folder
    // immediately after the OA is saved. No-op if a BOQ already exists.
    try {
      await createInitialBoqForOrder(res.data as never);
    } catch (e) {
      console.warn("Auto BOQ create failed", e);
    }
    // Clear the cost-sheet draft cache — data is now persisted in the DB.
    try { sessionStorage.removeItem("oa-draft-extracted"); } catch { /* ignore */ }
    toast({ title: "OA data saved successfully", description: `OA ${oa} · ${itemsWithAmounts.length} item${itemsWithAmounts.length === 1 ? "" : "s"} saved` });
    if (isNew) navigate(`/orders/${res.data.id}`, { replace: true });
  }

  function applyCurrencyConversion(target: CurrencyMode, factor: number) {
    setItems((prev) => convertItems(prev, factor));
    setChargesMr((prev) => convertCharges(prev, factor));
    setChargesGms((prev) => convertCharges(prev, factor));
    setCurrencyMode(target);
  }

  async function downloadPDF() {
    const baseName = (oaNumber || "OA").replace(/[/\\]/g, "_");
    const ship = sameAsBill ? billTo : shipTo;

    // Render one PDF for a given format + item subset.
    const renderOne = async (fmt: OrderFormat, subsetItems: LineItem[], suffix: string, sideCharges: Charges) => {
      const subTotals = calcTotals(subsetItems, sideCharges);
      const subWords = amountInWords(subTotals.net_payable);
      const record: OrderRecord = {
        id: orderId || "preview", user_id: "", oa_number: oaNumber || "PREVIEW",
        format: fmt, status: "draft", company_name: companyName, bill_to: billTo,
        ship_to: ship, reference, cost_sheet_number: costSheetNumber,
        order_date: orderDate, prepared_by: preparedBy, line_items: subsetItems,
        charges: sideCharges, totals: subTotals, amount_in_words: subWords, notes,
        tc_note: tcNote,
        created_at: "", updated_at: "",
      };
      const filename = `${baseName}${suffix}.pdf`;
      const doc = await generateOrderPDF(record, { terms, bank, gmsTerms, tcNote, currencyMode, hiddenColumns: hiddenPdfColumns });
      doc.save(filename);
      return { used: "default" as const };
    };

    if (splitMode) {
      // Mixed makes detected — only download the format the user has selected,
      // using that format's items only.
      const { mr, gms } = splitItemsByMake(allItemsWithAmounts);
      const subset = format === "MR" ? mr : gms;
      const sideCharges = format === "MR" ? chargesMr : chargesGms;
      await renderOne(format, subset, `-${format}`, sideCharges);
      toast({ title: "PDF generated", description: `${format} PDF downloaded` });
      return;
    }

    await renderOne(format, itemsWithAmounts, "", format === "GMS" ? chargesGms : chargesMr);
    toast({ title: "PDF generated", description: `${format} PDF downloaded` });
  }

  async function downloadClientCopy() {
    const baseName = (oaNumber || "OA").replace(/[/\\]/g, "_");
    const ship = sameAsBill ? billTo : shipTo;

    const renderOne = async (fmt: OrderFormat, subsetItems: LineItem[], suffix: string, sideCharges: Charges) => {
      const summarized = buildClientCopyItems(subsetItems);
      const subTotals = calcTotals(summarized, sideCharges);
      const subWords = amountInWords(subTotals.net_payable);
      const record: OrderRecord = {
        id: orderId || "preview", user_id: "", oa_number: oaNumber || "PREVIEW",
        format: fmt, status: "draft", company_name: companyName, bill_to: billTo,
        ship_to: ship, reference, cost_sheet_number: costSheetNumber,
        order_date: orderDate, prepared_by: preparedBy, line_items: summarized,
        charges: sideCharges, totals: subTotals, amount_in_words: subWords, notes,
        tc_note: tcNote,
        created_at: "", updated_at: "",
      };
      const doc = await generateOrderPDF(record, { terms, bank, gmsTerms, tcNote, currencyMode, hiddenColumns: hiddenPdfColumns });
      const fileName = `${baseName}-CLIENT-COPY${suffix}.pdf`;
      doc.save(fileName);
      // Persist a copy so it shows up in the OA Version History.
      if (orderId && parentOrderId) {
        try {
          const blob = doc.output("blob");
          await saveClientCopy({
            rootOrderId: parentOrderId,
            orderId,
            format: fmt,
            oaNumber: oaNumber || "OA",
            pdfBlob: blob,
            lineItems: summarized,
            charges: sideCharges,
            totals: subTotals,
            snapshot: {
              oa_number: oaNumber, company_name: companyName,
              bill_to: billTo, ship_to: ship, reference,
              cost_sheet_number: costSheetNumber, order_date: orderDate,
              prepared_by: preparedBy, amount_in_words: subWords,
              notes, tc_note: tcNote, terms,
              bank, gmsTerms,
            },
          });
          setRevisionsKey((k) => k + 1);
        } catch (e) {
          console.warn("Save Client Copy failed", e);
          toast({ title: "Saved PDF locally only", description: (e as Error).message, variant: "destructive" });
        }
      }
    };

    if (splitMode) {
      const { mr, gms } = splitItemsByMake(allItemsWithAmounts);
      const subset = format === "MR" ? mr : gms;
      const sideCharges = format === "MR" ? chargesMr : chargesGms;
      await renderOne(format, subset, `-${format}`, sideCharges);
    } else {
      await renderOne(format, itemsWithAmounts, "", format === "GMS" ? chargesGms : chargesMr);
    }
    toast({ title: "Client Copy generated", description: "Saved to OA version history" });
  }

  /** Build an in-memory snapshot of the currently-loaded order (with whatever
   *  unsaved edits exist) — used for revising. */
  function snapshotOrder(): OrderRecord {
    const ship = sameAsBill ? billTo : shipTo;
    return {
      id: orderId || "",
      user_id: "",
      oa_number: oaNumber, format, status: "finalized",
      company_name: companyName, bill_to: billTo, ship_to: ship,
      reference, cost_sheet_number: costSheetNumber, order_date: orderDate,
      prepared_by: preparedBy, line_items: itemsWithAmounts,
      charges: chargesMr,
      charges_gms: chargesGms,
      totals, amount_in_words: words, notes,
      tc_note: tcNote,
      created_at: "", updated_at: "",
      parent_order_id: parentOrderId || orderId || "",
      revision, is_current: isCurrent,
    };
  }

  async function handleReviseOa() {
    if (!orderId) return;
    setSaving(true);
    try {
      const { order: newOrder, boq: newBoq } = await reviseOrder(snapshotOrder(), { autoReviseBoq: true });
      toast({
        title: `OA Rev ${newOrder.revision} created`,
        description: newBoq ? `Linked BOQ Rev ${newBoq.revision} also created.` : "No existing BOQ to revise.",
      });
      navigate(`/orders/${newOrder.id}`);
    } catch (e) {
      toast({ title: "Revise failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
      setConfirmReviseOa(false);
    }
  }

  // BOQ revisions are no longer supported. BOQs auto-sync from the current OA
  // whenever the OA is saved (see syncBoqsAndPisForOrder in save()).

  async function downloadCurrentBoqPdf() {
    if (!currentBoq) return;
    const { generateBoqPDF } = await import("@/lib/boq/pdf");
    const doc = await generateBoqPDF(currentBoq);
    doc.save(`${(currentBoq.boq_number || "BOQ").replace(/[/\\]/g, "_")}-Rev${currentBoq.revision ?? 0}.pdf`);
  }

  async function handleConvertToPi() {
    if (!orderId) return;
    try {
      const { data: oa, error } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
      if (error || !oa) throw error || new Error("OA not found");
      setPiDialogOa(oa as unknown as OrderRecord);
      setPiDialogOpen(true);
    } catch (e: any) {
      toast({ title: "Failed to open PI dialog", description: e?.message || String(e), variant: "destructive" });
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading…</div>;

  function applyCostSheet(data: ExtractedCostSheet, forcedFormat?: OrderFormat) {
    if (data.company_name) setCompanyName(data.company_name);
    if (data.bill_to) setBillTo({ ...emptyAddress, ...billTo, ...data.bill_to });
    if (data.ship_to && (data.ship_to.name || data.ship_to.address)) {
      setShipTo({ ...emptyAddress, ...shipTo, ...data.ship_to });
      setSameAsBill(false);
    }
    if (data.cost_sheet_number) setCostSheetNumber(data.cost_sheet_number);
    if (data.reference) setReference(data.reference);
    if (data.line_items?.length) {
      const mapped = data.line_items.map((it) => {
          const base = {
            description: it.description || "",
            hsn_code: it.hsn_code || "",
          };
          const make = (it as { make?: "MR" | "GMS" | "OTHER" }).make
            || inferItemMake(base);
          return {
            id: crypto.randomUUID(),
            ...base,
            make_label: (it as { make_label?: string }).make_label || "",
            quantity: Number(it.quantity) || 0,
            unit_rate: Number(it.unit_rate) || 0,
            amount: Number(it.amount) || (Number(it.quantity) || 0) * (Number(it.unit_rate) || 0),
            make,
          };
        });
      // When the user picked a specific company on the chooser page, only keep
      // items that belong to that company. "OTHER" follows MR by default so
      // unclassified rows aren't silently dropped.
      const filtered = forcedFormat
        ? mapped.filter((it) => {
            if (it.make === forcedFormat) return true;
            if (forcedFormat === "MR" && it.make === "OTHER") return true;
            return false;
          }).map((it) => ({ ...it, make: forcedFormat }))
        : mapped;
      setItems(filtered.length ? filtered : [newItem()]);
    }
    if (data.charges) {
      // Apply extracted charges only into the slot for the chosen format.
      // The other slot stays at emptyCharges so the two OAs are independent.
      const apply = (c: Charges): Charges => ({
        ...c,
        pf_percent: data.charges?.pf_percent ?? c.pf_percent,
        pf_amount: data.charges?.pf_amount ?? c.pf_amount,
        insurance: data.charges?.insurance ?? c.insurance,
        freight: data.charges?.freight ?? c.freight,
        freight_enabled: (data.charges?.freight ?? 0) > 0 ? true : c.freight_enabled,
        gst_percent: data.charges?.gst_percent ?? c.gst_percent,
        discount: data.charges?.discount ?? c.discount,
      });
      if (forcedFormat === "GMS") setChargesGms((c) => apply(c));
      else if (forcedFormat === "MR") setChargesMr((c) => apply(c));
      else setCharges((c) => apply(c));
    }
    if (data.notes) setNotes(data.notes);
  }

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="sm" onClick={() => navigate("/orders")} className="rounded-lg">
              <ArrowLeft className="mr-1 h-4 w-4" />Orders
            </Button>
            <div className="h-6 w-px bg-border" />
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Order Acceptance</div>
              <div className="flex items-center gap-2">
                <div className="font-mono font-semibold truncate">{oaNumber || "New Order"}</div>
                <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-[11px] font-medium px-2 py-0.5">
                  {format}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isNew && (
              <>
                {!currentBoq ? (
                  <Button
                    variant="default"
                    className="rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                    onClick={() => navigate(`/boqs/new?orderId=${orderId}`)}
                    title="Generate a BOQ from this OA — auto-fills items, header, T&C"
                  >
                    <ClipboardList className="mr-1 h-4 w-4" />Create BOQ from this OA
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  className="rounded-lg"
                  onClick={() => setConfirmReviseOa(true)}
                  title="Create a new OA revision (and matching BOQ revision)"
                >
                  <GitBranch className="mr-1 h-4 w-4" />Revise OA
                </Button>
                <Button
                  variant="default"
                  className="rounded-lg"
                  onClick={handleConvertToPi}
                  disabled={saving}
                  title="Create a new Proforma Invoice from this OA"
                >
                  <Receipt className="mr-1 h-4 w-4" />Convert to PI
                </Button>
                <Button
                  variant="outline"
                  className="rounded-lg"
                  onClick={downloadClientCopy}
                  title="Generate a customer-facing PDF with summarized item groups"
                >
                  <Users className="mr-1 h-4 w-4" />Create Client Copy
                </Button>
              </>
            )}
            <Button variant="secondary" className="rounded-lg" disabled={saving || (!isNew && !isCurrent)} onClick={() => save(false)}>Save Draft</Button>
            <Button className="rounded-lg" disabled={saving || (!isNew && !isCurrent)} onClick={() => save(true)}>Finalize</Button>
          </div>
        </div>

        {/* Revision badge banner when viewing a non-current revision */}
        {!isNew && !isCurrent && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-4 py-2 text-sm flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] uppercase">Superseded</Badge>
              <span>You are viewing OA <span className="font-mono">{oaNumber}</span> — Rev {revision}. A newer revision exists.</span>
            </div>
            <span className="text-xs text-muted-foreground">Open the current revision from the OA Revision History below.</span>
          </div>
        )}
        {!isNew && isCurrent && revision > 0 && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm flex items-center gap-2">
            <Badge variant="default" className="text-[10px] uppercase">Current</Badge>
            <span>Revision {revision} — latest revision of <span className="font-mono">{oaNumber}</span>.</span>
          </div>
        )}

        {/* Revisions section (OA + linked BOQ history) */}
        {!isNew && parentOrderId && (
          <RevisionsPanel rootOrderId={parentOrderId} reloadKey={revisionsKey} />
        )}

        {!isNew && parentOrderId && orderId && (
          <OaRevisionHistory currentOrderId={orderId} rootOrderId={parentOrderId} />
        )}

        {/* Confirmation prompts */}
        <AlertDialog open={confirmReviseOa} onOpenChange={setConfirmReviseOa}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Create new OA revision?</AlertDialogTitle>
              <AlertDialogDescription>
                This will create a new revision copy and keep the previous revision saved.
                {currentBoq ? " A matching BOQ revision will also be created automatically." : ""}
                {" "}Do you want to continue?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleReviseOa}>Create revision</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* BOQ revision dialog removed — BOQs auto-sync from current OA on save. */}

        <div className="space-y-4">
          <div className="space-y-4 min-w-0">
            {isNew && location.pathname !== "/orders/new/edit" && (
              <CostSheetPicker onApply={(data) => applyCostSheet(data)} onParsingChange={setParsing} />
            )}

        {format === "GMS" && (charges.gms_mode === "EXW_MURTHAL" || (!charges.gms_mode && charges.ex_murthal_enabled)) && (
          <div className="space-y-2">
            <CurrencyToolbar
              mode={currencyMode}
              rate={exchangeRate}
              onRateChange={setExchangeRate}
              onConvert={applyCurrencyConversion}
              hideUsdToInr
              rateLabel="PU Dollar Rate (₹ per $)"
            />
            <p className="text-[11px] text-muted-foreground px-1">
              Items, Basic Total and charges up to Landed Price stay in USD. Use the
              "Amount in INR" panel inside Charges &amp; Totals to convert Landed Price
              into INR for P&amp;F, Insurance, GST and Grand Total.
            </p>
          </div>
        )}

        <Card>
          <CardHeader><CardTitle>Order Details</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            <div><Label>OA Number</Label><Input value={oaNumber} placeholder="Auto-generated on save" onChange={(e) => setOaNumber(e.target.value)} /></div>
            <div>
              <Label>Format</Label>
              <div className="flex gap-2 items-center">
                <Select value={format} onValueChange={(v) => switchFormat(v as OrderFormat)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MR">MR Engineers</SelectItem>
                    <SelectItem value="GMS">GMS</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 text-sm whitespace-nowrap">
                  <Switch checked={autoFormat} onCheckedChange={setAutoFormat} /> Auto
                </div>
              </div>
              {splitMode && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Mixed makes detected — this dropdown switches both the on-screen preview and the downloaded PDF. Switch to GMS to download the GMS PDF, or MR for the MR PDF.
                </p>
              )}
            </div>
            <div><Label>Company / Customer Name</Label><Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} /></div>
            <div><Label>Reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. customer enquiry no." /></div>
            <div><Label>Cost Sheet Number</Label><Input value={costSheetNumber} onChange={(e) => setCostSheetNumber(e.target.value)} placeholder="CS/2026-27/001" /></div>
            <div><Label>Date</Label><Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
            <div className="md:col-span-2"><Label>Prepared By</Label><Input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} /></div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-4">
          <AddressCard title="Bill To" value={billTo} onChange={setBillTo} />
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Ship To</CardTitle>
              <div className="flex items-center gap-2 text-sm"><Switch checked={sameAsBill} onCheckedChange={setSameAsBill} />Same as Bill To</div>
            </CardHeader>
            {!sameAsBill && (
              <CardContent className="space-y-2">
                <AddressFields value={shipTo} onChange={setShipTo} />
              </CardContent>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2"><CardTitle>Line Items</CardTitle>
            <div className="flex items-center gap-2">
              {(hasMR || hasGMS) && (
                <ToggleGroup
                  type="single"
                  size="sm"
                  value={lineItemsView}
                  onValueChange={(v) => {
                    if (!v) return;
                    const next = v as "MR" | "GMS" | "ALL";
                    setLineItemsView(next);
                    // MR/GMS also switches the active company so the
                    // Charges & Totals panel below edits the right side.
                    if (next === "MR" || next === "GMS") switchFormat(next);
                  }}
                  className="border rounded-md"
                >
                  <ToggleGroupItem value="MR" aria-label="Show MR items" disabled={!hasMR}>MR</ToggleGroupItem>
                  <ToggleGroupItem value="GMS" aria-label="Show GMS items" disabled={!hasGMS}>GMS</ToggleGroupItem>
                  <ToggleGroupItem value="ALL" aria-label="Show all items">All</ToggleGroupItem>
                </ToggleGroup>
              )}
              <Button size="sm" variant="outline" onClick={() => setItems([...items, { ...newItem(), make: lineItemsView === "ALL" ? format : lineItemsView }])}><Plus className="h-4 w-4 mr-1" />Add</Button>
            </div>
          </CardHeader>
          <CardContent>
            {splitMode && (
              <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                <div className="font-medium">This cost sheet has both MR and GMS items.</div>
                <div className="text-muted-foreground">Use the <span className="font-semibold">MR / GMS / All</span> toggle to filter the table below. The OA preview &amp; PDF still follow the Format dropdown above (currently <span className="font-semibold">{format}</span>) — download will produce only the selected format’s PDF.</div>
              </div>
            )}
            <div className="space-y-2">
              <div className="grid grid-cols-14 gap-2 text-xs font-medium text-muted-foreground px-1" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>
                <div className="col-span-4">Description</div>
                <div className="col-span-2">Make</div>
                <div className="col-span-1">Qty</div>
                <div className="col-span-1">Unit</div>
                <div className="col-span-2">Rate</div>
                <div className="col-span-1">Make</div>
                <div className="col-span-2 text-right">Amount</div>
                <div className="col-span-1" />
              </div>
              {editorItems.map((it, idx) => (
                <div key={it.id} className="space-y-1.5">
                <div className="grid gap-2 items-center" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>
                  <Input className="col-span-4" value={it.description} onChange={(e) => updateItemById(it.id, { description: e.target.value })} placeholder="Item description" />
                  <Input className="col-span-2" value={it.make_label || ""} onChange={(e) => updateItemById(it.id, { make_label: e.target.value })} placeholder={displayMake(it) || "Make"} />
                  <Input className="col-span-1" type="number" step="any" value={it.quantity} onChange={(e) => updateItemById(it.id, { quantity: +e.target.value })} />
                  <Input className="col-span-1" value={it.unit || "Nos"} onChange={(e) => updateItemById(it.id, { unit: e.target.value })} placeholder="Nos" />
                  <Input className="col-span-2" type="number" step="any" value={it.unit_rate} onChange={(e) => updateItemById(it.id, { unit_rate: +e.target.value })} />
                  <Select value={it.make || "MR"} onValueChange={(v) => updateItemById(it.id, { make: v as "MR" | "GMS" | "OTHER" })}>
                    <SelectTrigger className="col-span-1 h-9 px-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MR">MR</SelectItem>
                      <SelectItem value="GMS">GMS</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="col-span-2 text-right font-medium">{it.amount.toFixed(2)}</div>
                  <Button size="icon" variant="ghost" className="col-span-1" onClick={() => removeItemById(it.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
                {designReview && (
                  <OaDesignSuggestionRow
                    reviewItem={findReviewItemForOaItem(designReview.items, it, idx)}
                    round={designReview.round}
                    canApply={oaEditable}
                    onApply={(patch) => updateItemById(it.id, patch)}
                  />
                )}
                </div>
              ))}
              {editorItems.length === 0 && (
                <div className="text-sm text-muted-foreground italic px-1 py-4">No {lineItemsView === "ALL" ? "" : lineItemsView + " "}items. {lineItemsView !== "ALL" ? "Switch view or add one." : "Add one to get started."}</div>
              )}
              {splitMode && lineItemsView !== "ALL" && (
                <div className="pt-2 text-xs text-muted-foreground">
                  Hidden from this view: {allItemsWithAmounts.length - editorItems.length} item(s) with make ≠ {lineItemsView}.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Charges & Totals</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            {format === "GMS" && (charges.gms_mode === "EXW_MURTHAL" || (!charges.gms_mode && charges.ex_murthal_enabled)) && (
              <div className="md:col-span-2 flex flex-wrap items-end gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
                <div className="flex flex-col">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">Amount in INR</span>
                  <span className="text-[11px] text-muted-foreground">
                    Converts Landed Price (USD) into INR. P&amp;F, Insurance, GST, etc. calculate on this INR value.
                    Does not change PU Dollar Rate or item rates.
                  </span>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Amount in INR Rate (₹ per $)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={charges.murthal_landed_inr_rate || ""}
                    onChange={(e) => setCharges({ ...charges, murthal_landed_inr_rate: Number(e.target.value) || 0 })}
                    className="h-9 w-28"
                    placeholder="85.70"
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-md"
                  onClick={() => {
                    if (currencyMode !== "USD") {
                      toast({ title: "Convert items to USD first", description: "Use INR → USD above so Landed Price is in USD before applying the INR rate.", variant: "destructive" });
                      return;
                    }
                    const r = charges.murthal_landed_inr_rate || 0;
                    if (!(r > 0)) {
                      toast({ title: "Enter a valid INR rate", variant: "destructive" });
                      return;
                    }
                    toast({
                      title: "Amount in INR applied",
                      description: `Landed Price converted at 1 USD = ₹ ${r}. Downstream charges now in INR.`,
                    });
                  }}
                  title="Convert Landed Price (USD) into INR using the entered rate. Items and PU Dollar Rate are not changed."
                >
                  Calculate Amount in INR
                </Button>
              </div>
            )}
            <div className="space-y-3">
              {format === "MR" && (
                <>
                  <NumberField label="P&F %" value={charges.pf_percent} onChange={(v) => setCharges({ ...charges, pf_percent: v, pf_amount: 0 })} />
                  <NumberField label="P&F Amount (override)" value={charges.pf_amount} onChange={(v) => setCharges({ ...charges, pf_amount: v, pf_percent: 0 })} />
                  <NumberField label="Insurance %" value={charges.insurance_percent} onChange={(v) => setCharges({ ...charges, insurance_percent: v, insurance: 0 })} />
                  <NumberField label="Insurance Amount (override)" value={charges.insurance} onChange={(v) => setCharges({ ...charges, insurance: v, insurance_percent: 0 })} />
                  <div className="flex items-center gap-3">
                    <Switch checked={charges.freight_enabled} onCheckedChange={(b) => setCharges({ ...charges, freight_enabled: b })} />
                    <Label>Include Freight</Label>
                  </div>
                  {charges.freight_enabled && <NumberField label="Freight" value={charges.freight} onChange={(v) => setCharges({ ...charges, freight: v })} />}
                  <NumberField label="GST %" value={charges.gst_percent} onChange={(v) => setCharges({ ...charges, gst_percent: v, gst_amount: 0 })} />
                  <div className="flex items-center gap-3 pt-1">
                    <Switch
                      checked={charges.apply_discount ?? false}
                      onCheckedChange={(b) => setCharges({ ...charges, apply_discount: b })}
                    />
                    <Label>Apply discount</Label>
                  </div>
                  {charges.apply_discount && (
                    <>
                      <div>
                        <Label>Discount label</Label>
                        <Input
                          placeholder="One Time Very Special Discount"
                          value={charges.discount_label || ""}
                          onChange={(e) => setCharges({ ...charges, discount_label: e.target.value })}
                        />
                      </div>
                      <NumberField label="Discount %" value={charges.discount_percent} onChange={(v) => setCharges({ ...charges, discount_percent: v, discount: 0 })} />
                      <NumberField label="Discount Amount (one-time ₹)" value={charges.discount} onChange={(v) => setCharges({ ...charges, discount: v, discount_percent: 0 })} />
                    </>
                  )}
                  {/* Advance Adjustment (% of Grand Total or flat ₹) */}
                  <div className="grid grid-cols-[auto_1fr_140px_140px] items-center gap-3 pt-2 border-t">
                    <Switch
                      checked={!!charges.mr_advance_enabled}
                      onCheckedChange={(b) => setCharges({ ...charges, mr_advance_enabled: b, mr_advance_mode: charges.mr_advance_mode ?? "percent" })}
                    />
                    <Label className={`text-sm ${charges.mr_advance_enabled ? "" : "text-muted-foreground line-through"}`}>Advance Adjustment</Label>
                    <Select
                      value={charges.mr_advance_mode || "percent"}
                      onValueChange={(v) => setCharges({ ...charges, mr_advance_mode: v as "amount" | "percent" })}
                      disabled={!charges.mr_advance_enabled}
                    >
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">% of Grand Total</SelectItem>
                        <SelectItem value="amount">Flat ₹</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number" step="any" disabled={!charges.mr_advance_enabled}
                      value={(charges.mr_advance_mode || "percent") === "percent" ? (charges.mr_advance_percent || 0) : (charges.mr_advance_amount || 0)}
                      onChange={(e) => {
                        const v = +e.target.value || 0;
                        if ((charges.mr_advance_mode || "percent") === "percent") {
                          setCharges({ ...charges, mr_advance_percent: v });
                        } else {
                          setCharges({ ...charges, mr_advance_amount: v });
                        }
                      }}
                    />
                  </div>
                </>
              )}
              {format === "GMS" && (
                <div className="pt-2 border-t">
                  {/* Single global PU Dollar Rate — controls INR→USD conversion
                      across all GMS modes (items, charges, totals, PDF/export).
                      Hidden for EXW Turkey (already USD via cost-sheet $ rate). */}
                  {charges.gms_mode !== "EXW_TURKEY" && (
                    <div className="mb-3 rounded-md border bg-muted/30 p-3">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                        PU Dollar Rate (₹ per $)
                      </Label>
                      <NumberField
                        label=""
                        value={charges.cif_pu_dollar_rate || 0}
                        onChange={(v) => setCharges({ ...charges, cif_pu_dollar_rate: v })}
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
                    value={charges.gms_mode || "NONE"}
                    onValueChange={(v) => {
                      const mode = v === "NONE" ? undefined : (v as "EXW_TURKEY" | "EXW_MURTHAL" | "EXW_CIF_PORT");
                      setCharges({
                        ...charges,
                        gms_mode: mode,
                        // Hard-reset ex_murthal_enabled when leaving the Murthal/Legacy
                        // path so hidden Murthal values can't sneak into CIF / Turkey totals.
                        ex_murthal_enabled:
                          mode === "EXW_MURTHAL" ? true
                          : mode === undefined ? true
                          : mode === "EXW_TURKEY" || mode === "EXW_CIF_PORT" ? false
                          : charges.ex_murthal_enabled,
                        // Drop Turkey display toggle when switching to CIF / Murthal — CIF
                        // is USD-only via its own PU Dollar Rate.
                        display_currency: mode === "EXW_CIF_PORT" ? undefined : charges.display_currency,
                        // sensible defaults on first enable of EXW Turkey
                        turkey_custom_percent: charges.turkey_custom_percent ?? 10,
                        turkey_gst_percent: charges.turkey_gst_percent ?? 18,
                        turkey_pf_percent: charges.turkey_pf_percent ?? 1.5,
                        turkey_pf_mode: charges.turkey_pf_mode ?? "percent",
                        turkey_advance_mode: charges.turkey_advance_mode ?? "percent",
                        // Legacy & Murthal share the same Murthal defaults
                        custom_percent: charges.custom_percent ?? 8.25,
                        clearing_percent: charges.clearing_percent ?? 1.5,
                        landed_gst_percent: charges.landed_gst_percent ?? 18,
                        murthal_pf_percent: charges.murthal_pf_percent ?? 1.5,
                        murthal_pf_mode: charges.murthal_pf_mode ?? "percent",
                        murthal_advance_mode: charges.murthal_advance_mode ?? "percent",
                      });
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Legacy (current behavior)</SelectItem>
                      <SelectItem value="EXW_TURKEY">EXW Turkey (charges as extras)</SelectItem>
                      <SelectItem value="EXW_MURTHAL">EXW Murthal (full landed cost)</SelectItem>
                      <SelectItem value="EXW_CIF_PORT">EXW CIF Port (USD only — Basic + Sea Freight)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {format === "GMS" && charges.gms_mode === "EXW_CIF_PORT" && (
                <div className="mt-3 space-y-3 rounded-md border p-3 bg-muted/20">
                  <div className="text-xs font-semibold uppercase tracking-wide">EXW CIF Port (USD only)</div>
                  <p className="text-[11px] text-muted-foreground -mt-1">
                    Calculation: Basic Total (USD) + Sea Freight (USD) = EX Work CIF Port (USD).
                    No GST, taxes or other charges apply in this mode.
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <Label className="text-xs">Sea Freight</Label>
                      <div className="flex gap-2">
                        <Select
                          value={charges.cif_sea_freight_mode || "amount"}
                          onValueChange={(v) => setCharges({ ...charges, cif_sea_freight_mode: v as "amount" | "percent" })}
                        >
                          <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="amount">Fixed $</SelectItem>
                            <SelectItem value="percent">% of Basic</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number" step="any"
                          value={(charges.cif_sea_freight_mode || "amount") === "percent"
                            ? (charges.cif_sea_freight_percent || 0)
                            : (charges.cif_sea_freight_usd || 0)}
                          onChange={(e) => {
                            const v = +e.target.value || 0;
                            if ((charges.cif_sea_freight_mode || "amount") === "percent") {
                              setCharges({ ...charges, cif_sea_freight_percent: v });
                            } else {
                              setCharges({ ...charges, cif_sea_freight_usd: v });
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  {(charges.cif_pu_dollar_rate || 0) > 0 && (
                    <div className="text-[11px] text-muted-foreground">
                      Basic Total (USD) = ₹ Item Total ÷ {charges.cif_pu_dollar_rate}.
                      EX Work CIF Port (USD) = Basic + Sea Freight.
                    </div>
                  )}
                </div>
              )}
              {format === "GMS" && charges.gms_mode === "EXW_TURKEY" && (
                <div className="mt-3 space-y-2 rounded-md border p-3 bg-muted/20">
                  <div className="text-xs font-semibold uppercase tracking-wide">EXW Turkey</div>
                  <Label className="text-xs">PU Dollar Rate (₹ per $)</Label>
                  <Input
                    type="number" step="any" className="h-9 w-40"
                    value={charges.turkey_pu_dollar_rate || 0}
                    onChange={(e) => setCharges({ ...charges, turkey_pu_dollar_rate: +e.target.value || 0 })}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Used only for EXW Turkey. When &gt; 0, overrides the cost-sheet $ rate for INR→USD display.
                  </p>
                </div>
              )}
              {false && format === "GMS" && charges.gms_mode === "EXW_TURKEY" && (
                <div className="mt-3 space-y-2 rounded-md border p-3 bg-muted/20">
                  <div className="text-xs font-semibold uppercase tracking-wide">EXW Turkey Charges</div>
                  <ModeToggleRow
                    label="Sea Freight"
                    enabled={!!charges.turkey_sea_freight_enabled}
                    mode={charges.turkey_sea_freight_mode || "amount"}
                    amount={charges.turkey_sea_freight || 0}
                    percent={charges.turkey_sea_freight_percent || 0}
                    base={charges.turkey_sea_freight_base || "basic"}
                    onToggle={(b) => setCharges({ ...charges, turkey_sea_freight_enabled: b })}
                    onMode={(m) => setCharges({ ...charges, turkey_sea_freight_mode: m })}
                    onAmount={(v) => setCharges({ ...charges, turkey_sea_freight: v })}
                    onPercent={(v) => setCharges({ ...charges, turkey_sea_freight_percent: v })}
                    onBase={(b) => setCharges({ ...charges, turkey_sea_freight_base: b })}
                  />
                  <ModeToggleRow
                    label="Insurance"
                    enabled={!!charges.turkey_insurance_enabled}
                    mode={charges.turkey_insurance_mode || "amount"}
                    amount={charges.turkey_insurance || 0}
                    percent={charges.turkey_insurance_percent || 0}
                    base={charges.turkey_insurance_base || "basic"}
                    onToggle={(b) => setCharges({ ...charges, turkey_insurance_enabled: b })}
                    onMode={(m) => setCharges({ ...charges, turkey_insurance_mode: m })}
                    onAmount={(v) => setCharges({ ...charges, turkey_insurance: v })}
                    onPercent={(v) => setCharges({ ...charges, turkey_insurance_percent: v })}
                    onBase={(b) => setCharges({ ...charges, turkey_insurance_base: b })}
                  />
                  <div className="grid grid-cols-[auto_1fr_120px_140px] items-center gap-3">
                    <Switch checked={!!charges.turkey_custom_enabled} onCheckedChange={(b) => setCharges({ ...charges, turkey_custom_enabled: b })} />
                    <Label className={`text-sm ${charges.turkey_custom_enabled ? "" : "text-muted-foreground line-through"}`}>Custom Duty (%)</Label>
                    <Select
                      value={charges.turkey_custom_base || "basic"}
                      onValueChange={(v) => setCharges({ ...charges, turkey_custom_base: v as "basic" | "landed" })}
                      disabled={!charges.turkey_custom_enabled}
                    >
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="basic">on Basic + Sea</SelectItem>
                        <SelectItem value="landed">on Landed</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number" step="any" disabled={!charges.turkey_custom_enabled}
                      value={charges.turkey_custom_percent ?? 10}
                      onChange={(e) => setCharges({ ...charges, turkey_custom_percent: +e.target.value || 0 })}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground -mt-1">
                    Landed Price = Base + Sea Freight + Custom Duty. Insurance &amp; P&amp;F below are computed on the Landed Price.
                  </p>
                  {/* Discount on Landed Price (GMS rule) */}
                  <div className="grid grid-cols-[auto_1fr_120px_140px] items-center gap-3">
                    <Switch
                      checked={!!charges.turkey_landed_discount_enabled}
                      onCheckedChange={(b) => setCharges({ ...charges, turkey_landed_discount_enabled: b })}
                    />
                    <Label className={`text-sm ${charges.turkey_landed_discount_enabled ? "" : "text-muted-foreground line-through"}`}>
                      Discount on Landed Price
                    </Label>
                    <Select
                      value={charges.turkey_landed_discount_mode || "percent"}
                      onValueChange={(v) => setCharges({ ...charges, turkey_landed_discount_mode: v as "amount" | "percent" })}
                      disabled={!charges.turkey_landed_discount_enabled}
                    >
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">% of Landed</SelectItem>
                        <SelectItem value="amount">Flat ₹</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number" step="any" disabled={!charges.turkey_landed_discount_enabled}
                      value={(charges.turkey_landed_discount_mode || "percent") === "percent"
                        ? (charges.turkey_landed_discount_percent || 0)
                        : (charges.turkey_landed_discount_amount || 0)}
                      onChange={(e) => {
                        const v = +e.target.value || 0;
                        if ((charges.turkey_landed_discount_mode || "percent") === "percent") {
                          setCharges({ ...charges, turkey_landed_discount_percent: v });
                        } else {
                          setCharges({ ...charges, turkey_landed_discount_amount: v });
                        }
                      }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground -mt-1">
                    Net Landed Price = Landed − Discount. Insurance, P&amp;F &amp; GST below recompute on Net Landed Price.
                  </p>
                  {/* P&F on Landed Price */}
                  <div className="grid grid-cols-[auto_1fr_120px_140px] items-center gap-3">
                    <Switch checked={!!charges.turkey_pf_enabled} onCheckedChange={(b) => setCharges({ ...charges, turkey_pf_enabled: b })} />
                    <Label className={`text-sm ${charges.turkey_pf_enabled ? "" : "text-muted-foreground line-through"}`}>P&amp;F (on Landed)</Label>
                    <Select
                      value={charges.turkey_pf_mode || "percent"}
                      onValueChange={(v) => setCharges({ ...charges, turkey_pf_mode: v as "amount" | "percent" })}
                      disabled={!charges.turkey_pf_enabled}
                    >
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">%</SelectItem>
                        <SelectItem value="amount">Flat ₹</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number" step="any" disabled={!charges.turkey_pf_enabled}
                      value={(charges.turkey_pf_mode || "percent") === "percent" ? (charges.turkey_pf_percent ?? 1.5) : (charges.turkey_pf_amount || 0)}
                      onChange={(e) => {
                        const v = +e.target.value || 0;
                        if ((charges.turkey_pf_mode || "percent") === "percent") {
                          setCharges({ ...charges, turkey_pf_percent: v });
                        } else {
                          setCharges({ ...charges, turkey_pf_amount: v });
                        }
                      }}
                    />
                  </div>
                  {/* Freight (flat ₹) */}
                  <ToggleNumberRow
                    label="Local Freight (flat ₹) — joins GST base"
                    enabled={!!charges.turkey_freight_enabled}
                    value={charges.turkey_freight || 0}
                    onToggle={(b) => setCharges({ ...charges, turkey_freight_enabled: b })}
                    onValue={(v) => setCharges({ ...charges, turkey_freight: v })}
                  />
                  <ToggleNumberRow
                    label="GST % (on Landed + P&F + Insurance + Freight)" enabled={!!charges.turkey_gst_enabled} value={charges.turkey_gst_percent ?? 18}
                    onToggle={(b) => setCharges({ ...charges, turkey_gst_enabled: b })}
                    onValue={(v) => setCharges({ ...charges, turkey_gst_percent: v })}
                  />
                  <ToggleNumberRow
                    label="One-time Discount (₹) — after GST" enabled={!!charges.turkey_discount_enabled} value={charges.turkey_discount || 0}
                    onToggle={(b) => setCharges({ ...charges, turkey_discount_enabled: b })}
                    onValue={(v) => setCharges({ ...charges, turkey_discount: v })}
                  />
                  {/* Advance Adjustment (% or flat ₹) */}
                  <div className="grid grid-cols-[auto_1fr_120px_140px] items-center gap-3">
                    <Switch checked={!!charges.turkey_advance_enabled} onCheckedChange={(b) => setCharges({ ...charges, turkey_advance_enabled: b })} />
                    <Label className={`text-sm ${charges.turkey_advance_enabled ? "" : "text-muted-foreground line-through"}`}>Advance Adjustment</Label>
                    <Select
                      value={charges.turkey_advance_mode || "percent"}
                      onValueChange={(v) => setCharges({ ...charges, turkey_advance_mode: v as "amount" | "percent" })}
                      disabled={!charges.turkey_advance_enabled}
                    >
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">% of Grand Total</SelectItem>
                        <SelectItem value="amount">Flat ₹</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number" step="any" disabled={!charges.turkey_advance_enabled}
                      value={(charges.turkey_advance_mode || "percent") === "percent" ? (charges.turkey_advance_percent || 0) : (charges.turkey_advance_amount || 0)}
                      onChange={(e) => {
                        const v = +e.target.value || 0;
                        if ((charges.turkey_advance_mode || "percent") === "percent") {
                          setCharges({ ...charges, turkey_advance_percent: v });
                        } else {
                          setCharges({ ...charges, turkey_advance_amount: v });
                        }
                      }}
                    />
                  </div>
                </div>
              )}
              {format === "GMS" && charges.gms_mode !== "EXW_CIF_PORT" && charges.gms_mode !== "EXW_MURTHAL" && (
              <div className="pt-2 border-t">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Foreign Currency (Ex-works)</Label>
                <p className="text-[11px] text-muted-foreground mb-2">For GMS imports (e.g. Ex-works Turkey in USD). Leave currency blank or "INR" for domestic orders.</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Currency</Label>
                    <Select
                      value={charges.currency || "INR"}
                      onValueChange={(v) => setCharges({ ...charges, currency: v === "INR" ? undefined : v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INR">INR (domestic)</SelectItem>
                        <SelectItem value="USD">USD ($)</SelectItem>
                        <SelectItem value="EUR">EUR (€)</SelectItem>
                        <SelectItem value="GBP">GBP (£)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <NumberField label="Cost Sheet $ Rate (₹)" value={charges.fx_rate || 0} onChange={(v) => setCharges({ ...charges, fx_rate: v })} />
                  <NumberField label="Advance %" value={charges.advance_percent ?? 40} onChange={(v) => setCharges({ ...charges, advance_percent: v })} />
                </div>
                {charges.gms_mode === "EXW_TURKEY" && ((charges.turkey_pu_dollar_rate || 0) > 0 || (charges.fx_rate || 0) > 0) && (
                  <p className="text-[11px] text-muted-foreground mt-3">
                    EXW Turkey is shown in USD ($) using ₹{(charges.turkey_pu_dollar_rate || 0) > 0 ? charges.turkey_pu_dollar_rate : charges.fx_rate}
                    {(charges.turkey_pu_dollar_rate || 0) > 0 ? " (PU Dollar Rate)" : " (cost-sheet $ rate)"}.
                  </p>
                )}
              </div>
              )}
              {format === "GMS" && charges.gms_mode !== "EXW_TURKEY" && charges.gms_mode !== "EXW_CIF_PORT" && (
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Ex-works Murthal (Landed Cost)</Label>
                    <p className="text-[11px] text-muted-foreground">GMS imports landing at Murthal — base, hike, freight, sea freight, customs, clearing & GST. Toggle each line.</p>
                  </div>
                  <Switch
                    checked={!!charges.ex_murthal_enabled}
                    onCheckedChange={(b) => setCharges({ ...charges, ex_murthal_enabled: b,
                      // sensible defaults on first enable
                      custom_percent: charges.custom_percent ?? 8.25,
                      clearing_percent: charges.clearing_percent ?? 1.5,
                      landed_gst_percent: charges.landed_gst_percent ?? 18,
                      murthal_pf_percent: charges.murthal_pf_percent ?? 1.5,
                      murthal_pf_mode: charges.murthal_pf_mode ?? "percent",
                      murthal_advance_mode: charges.murthal_advance_mode ?? "percent",
                    })}
                  />
                </div>
                {charges.ex_murthal_enabled && (
                  <div className="mt-3 space-y-2 rounded-md border p-3 bg-muted/20">
                    {/* Sea Freight (₹ or %) */}
                    <ModeToggleRow
                      label="Sea Freight"
                      enabled={!!charges.sea_freight_enabled}
                      mode={charges.murthal_sea_freight_mode || "percent"}
                      amount={charges.murthal_sea_freight_amount || 0}
                      percent={charges.sea_freight || 0}
                      base={charges.murthal_sea_freight_base || "basic"}
                      onToggle={(b) => setCharges({ ...charges, sea_freight_enabled: b })}
                      onMode={(m) => setCharges({ ...charges, murthal_sea_freight_mode: m })}
                      onAmount={(v) => setCharges({ ...charges, murthal_sea_freight_amount: v })}
                      onPercent={(v) => setCharges({ ...charges, sea_freight: v })}
                      onBase={(b) => setCharges({ ...charges, murthal_sea_freight_base: b })}
                    />
                    {/* Custom Duty */}
                    <div className="grid grid-cols-[auto_1fr_120px_140px] items-center gap-3">
                      <Switch checked={!!charges.custom_enabled} onCheckedChange={(b) => setCharges({ ...charges, custom_enabled: b })} />
                      <Label className={`text-sm ${charges.custom_enabled ? "" : "text-muted-foreground line-through"}`}>Custom Duty (%)</Label>
                      <Select
                        value={charges.murthal_custom_base || "basic"}
                        onValueChange={(v) => setCharges({ ...charges, murthal_custom_base: v as "basic" | "landed" })}
                        disabled={!charges.custom_enabled}
                      >
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="basic">on Basic + Sea</SelectItem>
                          <SelectItem value="landed">on Landed</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number" step="any" disabled={!charges.custom_enabled}
                        value={charges.custom_percent ?? 8.25}
                        onChange={(e) => setCharges({ ...charges, custom_percent: +e.target.value || 0 })}
                      />
                    </div>
                    {/* Clearing (CHA & Port) */}
                    <div className="grid grid-cols-[auto_1fr_120px_140px] items-center gap-3">
                      <Switch checked={!!charges.clearing_enabled} onCheckedChange={(b) => setCharges({ ...charges, clearing_enabled: b })} />
                      <Label className={`text-sm ${charges.clearing_enabled ? "" : "text-muted-foreground line-through"}`}>Clearing (CHA &amp; Port) (%)</Label>
                      <Select
                        value={charges.murthal_clearing_base || "basic"}
                        onValueChange={(v) => setCharges({ ...charges, murthal_clearing_base: v as "basic" | "landed" })}
                        disabled={!charges.clearing_enabled}
                      >
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="basic">on Basic + Sea</SelectItem>
                          <SelectItem value="landed">on Landed</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number" step="any" disabled={!charges.clearing_enabled}
                        value={charges.clearing_percent ?? 1.5}
                        onChange={(e) => setCharges({ ...charges, clearing_percent: +e.target.value || 0 })}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground -mt-1">
                      Landed Price = Base + Sea Freight + Custom + Clearing. Insurance &amp; P&amp;F below are computed on the Landed Price.
                    </p>
                    {/* Discount on Landed Price */}
                    <div className="grid grid-cols-[auto_1fr_120px_140px] items-center gap-3">
                      <Switch
                        checked={!!charges.murthal_landed_discount_enabled}
                        onCheckedChange={(b) => setCharges({ ...charges, murthal_landed_discount_enabled: b })}
                      />
                      <Label className={`text-sm ${charges.murthal_landed_discount_enabled ? "" : "text-muted-foreground line-through"}`}>
                        Discount on Landed Price
                      </Label>
                      <Select
                        value={charges.murthal_landed_discount_mode || "percent"}
                        onValueChange={(v) => setCharges({ ...charges, murthal_landed_discount_mode: v as "amount" | "percent" })}
                        disabled={!charges.murthal_landed_discount_enabled}
                      >
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percent">% of Landed</SelectItem>
                          <SelectItem value="amount">Flat ₹</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number" step="any" disabled={!charges.murthal_landed_discount_enabled}
                        value={(charges.murthal_landed_discount_mode || "percent") === "percent"
                          ? (charges.murthal_landed_discount_percent || 0)
                          : (charges.murthal_landed_discount_amount || 0)}
                        onChange={(e) => {
                          const v = +e.target.value || 0;
                          if ((charges.murthal_landed_discount_mode || "percent") === "percent") {
                            setCharges({ ...charges, murthal_landed_discount_percent: v });
                          } else {
                            setCharges({ ...charges, murthal_landed_discount_amount: v });
                          }
                        }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground -mt-1">
                      Net Landed Price = Landed − Discount. Insurance, P&amp;F &amp; GST below recompute on Net Landed Price.
                    </p>
                    {/* Insurance (on Landed) */}
                    <ModeToggleRow
                      label="Insurance"
                      enabled={!!charges.sea_insurance_enabled}
                      mode={charges.murthal_insurance_mode || "percent"}
                      amount={charges.murthal_insurance_amount || 0}
                      percent={charges.sea_insurance || 0}
                      base={charges.murthal_insurance_base || "landed"}
                      onToggle={(b) => setCharges({ ...charges, sea_insurance_enabled: b })}
                      onMode={(m) => setCharges({ ...charges, murthal_insurance_mode: m })}
                      onAmount={(v) => setCharges({ ...charges, murthal_insurance_amount: v })}
                      onPercent={(v) => setCharges({ ...charges, sea_insurance: v })}
                      onBase={(b) => setCharges({ ...charges, murthal_insurance_base: b })}
                    />
                    {/* P&F (on Landed) */}
                    <div className="grid grid-cols-[auto_1fr_120px_140px] items-center gap-3">
                      <Switch checked={!!charges.murthal_pf_enabled} onCheckedChange={(b) => setCharges({ ...charges, murthal_pf_enabled: b })} />
                      <Label className={`text-sm ${charges.murthal_pf_enabled ? "" : "text-muted-foreground line-through"}`}>P&amp;F (on Landed)</Label>
                      <Select
                        value={charges.murthal_pf_mode || "percent"}
                        onValueChange={(v) => setCharges({ ...charges, murthal_pf_mode: v as "amount" | "percent" })}
                        disabled={!charges.murthal_pf_enabled}
                      >
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percent">%</SelectItem>
                          <SelectItem value="amount">Flat ₹</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number" step="any" disabled={!charges.murthal_pf_enabled}
                        value={(charges.murthal_pf_mode || "percent") === "percent" ? (charges.murthal_pf_percent ?? 1.5) : (charges.murthal_pf_amount || 0)}
                        onChange={(e) => {
                          const v = +e.target.value || 0;
                          if ((charges.murthal_pf_mode || "percent") === "percent") {
                            setCharges({ ...charges, murthal_pf_percent: v });
                          } else {
                            setCharges({ ...charges, murthal_pf_amount: v });
                          }
                        }}
                      />
                    </div>
                    {/* Freight (flat ₹) */}
                    <ToggleNumberRow
                      label="Local Freight (flat ₹) — joins GST base"
                      enabled={!!charges.murthal_freight_enabled}
                      value={charges.murthal_freight || 0}
                      onToggle={(b) => setCharges({ ...charges, murthal_freight_enabled: b })}
                      onValue={(v) => setCharges({ ...charges, murthal_freight: v })}
                    />
                    {/* GST */}
                    <ToggleNumberRow
                      label="GST % (on Net Landed + Insurance + P&F + Freight)"
                      enabled={!!charges.landed_gst_enabled} value={charges.landed_gst_percent ?? 18}
                      onToggle={(b) => setCharges({ ...charges, landed_gst_enabled: b })}
                      onValue={(v) => setCharges({ ...charges, landed_gst_percent: v })}
                    />
                    {/* One-time Discount (₹ or %) */}
                    <div className="grid grid-cols-[auto_1fr_120px_140px] items-center gap-3">
                      <Switch
                        checked={!!charges.landed_discount_enabled}
                        onCheckedChange={(b) => setCharges({ ...charges, landed_discount_enabled: b })}
                      />
                      <Label className={`text-sm ${charges.landed_discount_enabled ? "" : "text-muted-foreground line-through"}`}>One-time Discount — after GST</Label>
                      <Select
                        value={charges.murthal_one_time_discount_mode || "percent"}
                        onValueChange={(v) => setCharges({ ...charges, murthal_one_time_discount_mode: v as "amount" | "percent" })}
                        disabled={!charges.landed_discount_enabled}
                      >
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percent">% of Grand Total</SelectItem>
                          <SelectItem value="amount">Flat ₹</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number" step="any" disabled={!charges.landed_discount_enabled}
                        value={(charges.murthal_one_time_discount_mode || "percent") === "percent"
                          ? (charges.landed_discount || 0)
                          : (charges.murthal_one_time_discount_amount || 0)}
                        onChange={(e) => {
                          const v = +e.target.value || 0;
                          if ((charges.murthal_one_time_discount_mode || "percent") === "percent") {
                            setCharges({ ...charges, landed_discount: v });
                          } else {
                            setCharges({ ...charges, murthal_one_time_discount_amount: v });
                          }
                        }}
                      />
                    </div>
                    {/* Advance Adjustment */}
                    <div className="grid grid-cols-[auto_1fr_120px_140px] items-center gap-3">
                      <Switch checked={!!charges.murthal_advance_enabled} onCheckedChange={(b) => setCharges({ ...charges, murthal_advance_enabled: b })} />
                      <Label className={`text-sm ${charges.murthal_advance_enabled ? "" : "text-muted-foreground line-through"}`}>Advance Adjustment</Label>
                      <Select
                        value={charges.murthal_advance_mode || "percent"}
                        onValueChange={(v) => setCharges({ ...charges, murthal_advance_mode: v as "amount" | "percent" })}
                        disabled={!charges.murthal_advance_enabled}
                      >
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percent">% of Grand Total</SelectItem>
                          <SelectItem value="amount">Flat ₹</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number" step="any" disabled={!charges.murthal_advance_enabled}
                        value={(charges.murthal_advance_mode || "percent") === "percent" ? (charges.murthal_advance_percent || 0) : (charges.murthal_advance_amount || 0)}
                        onChange={(e) => {
                          const v = +e.target.value || 0;
                          if ((charges.murthal_advance_mode || "percent") === "percent") {
                            setCharges({ ...charges, murthal_advance_percent: v });
                          } else {
                            setCharges({ ...charges, murthal_advance_amount: v });
                          }
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
              )}
            </div>
            <div className="rounded-lg border p-4 space-y-2 bg-card">
              {(() => {
                const rawDisc = charges.discount_percent > 0
                  ? (totals.basic_total * charges.discount_percent) / 100
                  : (charges.discount || 0);
                const showDisc = !!charges.apply_discount && rawDisc > 0;
                const discLbl = (charges.discount_label || "").trim()
                  || "One Time Very Special Discount";
                const baseAfter = totals.basic_total - (showDisc ? rawDisc : 0);
                const pf = charges.pf_amount > 0
                  ? charges.pf_amount
                  : (baseAfter * (charges.pf_percent || 0)) / 100;
                const ins = charges.insurance_percent > 0
                  ? (baseAfter * charges.insurance_percent) / 100
                  : (charges.insurance || 0);
                const frt = charges.freight_enabled ? (charges.freight || 0) : 0;
                const taxable = baseAfter + pf + ins + frt;
                const gst = (taxable * (charges.gst_percent || 0)) / 100;
                const grand = taxable + gst;
                // EXW Murthal USD display: convert all sidebar values to USD
                // when GMS + EXW Murthal mode + PU Dollar Rate > 0. Underlying
                // calc stays in INR — this only changes display/format.
                const isMurthalUSD =
                  format === "GMS"
                  && (charges.gms_mode === "EXW_MURTHAL" || charges.ex_murthal_enabled)
                  && (charges.cif_pu_dollar_rate || 0) > 0;
                const usdR = charges.cif_pu_dollar_rate || 1;
                const fmtAmt = isMurthalUSD
                  ? (n: number) => `$ ${((n || 0) / usdR).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : undefined;
                const grandFinal = showDisc ? grand : totals.grand_total;
                const wordsLine = isMurthalUSD ? amountInWordsUSD(grandFinal / usdR) : words;
                return (
                  <>
                    <Row k={showDisc ? "Sub Total" : "Basic Total"} v={totals.basic_total} fmt={fmtAmt} />
                    {showDisc && <Row k={discLbl} v={rawDisc} fmt={fmtAmt} />}
                    {showDisc && <Row k="After Discount" v={baseAfter} fmt={fmtAmt} />}
                    {pf > 0 && <Row k={`P&F${charges.pf_percent ? ` @ ${charges.pf_percent}%` : ""}`} v={pf} fmt={fmtAmt} />}
                    {ins > 0 && <Row k={`Insurance${charges.insurance_percent ? ` @ ${charges.insurance_percent}%` : ""}`} v={ins} fmt={fmtAmt} />}
                    {frt > 0 && <Row k="Freight" v={frt} fmt={fmtAmt} />}
                    {!showDisc && <Row k="Subtotal" v={totals.subtotal} fmt={fmtAmt} />}
                    <Row k={`GST @ ${charges.gst_percent || 0}%`} v={gst} fmt={fmtAmt} />
                    <Row k="Grand Total" v={grandFinal} bold fmt={fmtAmt} />
                    {(() => {
                      if (format !== "MR" || !charges.mr_advance_enabled) return null;
                      const mode = charges.mr_advance_mode || "percent";
                      const adv = mode === "percent"
                        ? (grandFinal * (charges.mr_advance_percent || 0)) / 100
                        : (charges.mr_advance_amount || 0);
                      if (adv <= 0) return null;
                      const lbl = mode === "percent"
                        ? `Advance Adjustment @ ${charges.mr_advance_percent || 0}%`
                        : "Advance Adjustment";
                      return (
                        <>
                          <Row k={lbl} v={adv} fmt={fmtAmt} />
                          <Row k="Net Payable" v={Math.max(0, grandFinal - adv)} bold fmt={fmtAmt} />
                        </>
                      );
                    })()}
                    <div className="pt-2 text-sm text-muted-foreground italic">{wordsLine}</div>
                  </>
                );
              })()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></CardContent>
        </Card>

        {format === "MR" && (
          <>
            <Card>
              <CardHeader><CardTitle>Terms &amp; Conditions</CardTitle></CardHeader>
              <CardContent>
                <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={8} className="font-mono text-xs" />
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setTerms(DEFAULT_MR_TERMS)}>Reset to default</Button>
                </div>
                <div className="mt-3">
                  <Label>Additional Note (optional)</Label>
                  <Textarea
                    value={tcNote}
                    onChange={(e) => setTcNote(e.target.value)}
                    rows={3}
                    placeholder="Any extra note to print under Terms & Conditions"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Bank Details</CardTitle></CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-3">
                <div><Label>Bank Name</Label><Input value={bank.bank_name} onChange={(e) => setBank({ ...bank, bank_name: e.target.value })} /></div>
                <div><Label>Branch</Label><Input value={bank.branch} onChange={(e) => setBank({ ...bank, branch: e.target.value })} /></div>
                <div><Label>Account Number</Label><Input value={bank.account_no} onChange={(e) => setBank({ ...bank, account_no: e.target.value })} /></div>
                <div><Label>IFSC Code</Label><Input value={bank.ifsc} onChange={(e) => setBank({ ...bank, ifsc: e.target.value })} /></div>
                <div className="md:col-span-2 flex justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setBank(DEFAULT_MR_BANK)}>Reset to default</Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {format === "GMS" && (
          <Card>
            <CardHeader><CardTitle>GMS Terms &amp; Conditions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs uppercase tracking-wide font-semibold underline">Commercial Condition</div>
              <div><Label>Taxation</Label><Input value={gmsTerms.taxation} onChange={(e) => setGmsTerms({ ...gmsTerms, taxation: e.target.value })} /></div>
              <div className="grid md:grid-cols-2 gap-3">
                <div><Label>Freight</Label><Input value={gmsTerms.freight} onChange={(e) => setGmsTerms({ ...gmsTerms, freight: e.target.value })} /></div>
                <div><Label>Insurance</Label><Input value={gmsTerms.insurance} onChange={(e) => setGmsTerms({ ...gmsTerms, insurance: e.target.value })} /></div>
              </div>
              <div><Label>Delivery Time</Label><Textarea rows={2} value={gmsTerms.delivery_time} onChange={(e) => setGmsTerms({ ...gmsTerms, delivery_time: e.target.value })} /></div>
              <div><Label>Payment Terms</Label><Textarea rows={2} value={gmsTerms.payment_terms} onChange={(e) => setGmsTerms({ ...gmsTerms, payment_terms: e.target.value })} /></div>
              <div><Label>General Conditions</Label><Textarea rows={2} value={gmsTerms.general_conditions} onChange={(e) => setGmsTerms({ ...gmsTerms, general_conditions: e.target.value })} /></div>
              <div>
                <Label>Additional Note (optional)</Label>
                <Textarea
                  rows={3}
                  value={tcNote}
                  onChange={(e) => setTcNote(e.target.value)}
                  placeholder="Any extra note to print under Terms & Conditions"
                />
              </div>
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" onClick={() => setGmsTerms(DEFAULT_GMS_TERMS)}>Reset to default</Button>
              </div>
            </CardContent>
          </Card>
        )}
          </div>

          <section id="preview" className="space-y-3 pt-6 border-t">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Review &amp; Export</h2>
              <p className="text-sm text-muted-foreground">
                Scroll through the preview below. When everything looks correct, export the PDF.
              </p>
            </div>
            <OrderPreview
              oaNumber={oaNumber}
              format={format}
              companyName={companyName}
              billTo={billTo}
              shipTo={shipTo}
              sameAsBill={sameAsBill}
              reference={reference}
              costSheetNumber={costSheetNumber}
              orderDate={orderDate}
              preparedBy={preparedBy}
              items={itemsWithAmounts}
              charges={charges}
              totals={totals}
              amountInWords={words}
              notes={notes}
              parsing={parsing}
              splitMode={splitMode}
              onFormatChange={(f) => switchFormat(f)}
              onDownloadPDF={downloadPDF}
              terms={terms}
              bank={bank}
              gmsTerms={gmsTerms}
              currencyMode={currencyMode}
              hiddenColumns={hiddenPdfColumns}
            />
            {(!companyName.trim() || !itemsWithAmounts.some((i) => i.description.trim())) && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Add at least one item description and a customer name before exporting.
              </p>
            )}
            <div className="flex justify-end pt-2">
              <div className="mr-auto">
                <PdfColumnVisibility
                  format={format}
                  hidden={hiddenPdfColumns}
                  onChange={setHiddenPdfColumns}
                />
              </div>
              <Button size="lg" onClick={downloadPDF} className="w-full sm:w-auto">
                <Download className="mr-2 h-4 w-4" />
                {splitMode ? `Export ${format} PDF` : "Export PDF"}
              </Button>
            </div>
          </section>
        </div>
      </div>

      <PiItemSelectDialog
        open={piDialogOpen}
        onOpenChange={setPiDialogOpen}
        oa={piDialogOa}
      />
    </div>
  );
}

function AddressCard({ title, value, onChange }: { title: string; value: Address; onChange: (a: Address) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2"><AddressFields value={value} onChange={onChange} /></CardContent>
    </Card>
  );
}
function AddressFields({ value, onChange }: { value: Address; onChange: (a: Address) => void }) {
  return (
    <>
      <div><Label>Name</Label><Input value={value.name || ""} onChange={(e) => onChange({ ...value, name: e.target.value })} /></div>
      <div><Label>Address</Label><Textarea rows={2} value={value.address || ""} onChange={(e) => onChange({ ...value, address: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>GSTIN</Label><Input value={value.gstin || ""} onChange={(e) => onChange({ ...value, gstin: e.target.value })} /></div>
        <div><Label>State</Label><Input value={value.state || ""} onChange={(e) => onChange({ ...value, state: e.target.value })} /></div>
      </div>
    </>
  );
}
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return <div><Label>{label}</Label><Input type="number" step="any" value={value} onChange={(e) => onChange(+e.target.value || 0)} /></div>;
}
function ToggleNumberRow({
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
function ModeToggleRow({
  label, enabled, mode, amount, percent, base, onToggle, onMode, onAmount, onPercent, onBase,
}: {
  label: string; enabled: boolean; mode: "amount" | "percent";
  amount: number; percent: number;
  base?: "basic" | "landed";
  onToggle: (b: boolean) => void;
  onMode: (m: "amount" | "percent") => void;
  onAmount: (v: number) => void;
  onPercent: (v: number) => void;
  onBase?: (b: "basic" | "landed") => void;
}) {
  const isPercent = mode === "percent";
  return (
    <div className="grid grid-cols-[auto_1fr_120px_120px_140px] items-center gap-3">
      <Switch checked={enabled} onCheckedChange={onToggle} />
      <Label className={`text-sm ${enabled ? "" : "text-muted-foreground line-through"}`}>
        {label} {isPercent ? "(%)" : "(₹)"}
      </Label>
      <Select value={mode} onValueChange={(v) => onMode(v as "amount" | "percent")} disabled={!enabled}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="amount">Flat ₹</SelectItem>
          <SelectItem value="percent">%</SelectItem>
        </SelectContent>
      </Select>
      {isPercent && onBase ? (
        <Select value={base || "basic"} onValueChange={(v) => onBase(v as "basic" | "landed")} disabled={!enabled}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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
          if (isPercent) onPercent(v); else onAmount(v);
        }}
      />
    </div>
  );
}
function Row({ k, v, bold, fmt }: { k: string; v: number; bold?: boolean; fmt?: (n: number) => string }) {
  const text = fmt ? fmt(v) : `₹ ${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return <div className={`flex justify-between ${bold ? "font-bold text-base" : "text-sm"}`}><span>{k}</span><span>{text}</span></div>;
}

/** Inline "Design Suggested Update" block shown below an OA item row. Surfaces
 *  the design team's per-column comments on the linked BOQ. Apply buttons map
 *  to OA fields (Description, Qty, Unit). Model & Remarks are shown read-only
 *  because they have no OA-row counterpart. Pure UI — no calc impact. */
function OaDesignSuggestionRow({
  reviewItem, round, canApply, onApply,
}: {
  reviewItem: DesignReviewItemRow | null;
  round: DesignReviewRow;
  canApply: boolean;
  onApply: (patch: Partial<LineItem>) => void;
}) {
  if (!reviewItem) return null;
  const cols = parseColumnComments(reviewItem);
  const tiles: { key: ColKey; label: string; apply?: (v: string) => Partial<LineItem> }[] = [
    { key: "model", label: "Model" },
    { key: "description", label: "Description", apply: (v) => ({ description: v }) },
    { key: "quantity", label: "Qty", apply: (v) => ({ quantity: Number(v) || 0 }) },
    { key: "unit", label: "Unit", apply: (v) => ({ unit: v }) },
    { key: "remarks", label: "Remarks" },
  ];
  const hasAny = tiles.some(({ key }) => ((cols as Record<string, string>)[key] || "").trim() !== "");
  if (!hasAny) return null;
  return (
    <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-2 text-xs">
      <div className="px-1 pb-1 text-[10px] uppercase tracking-wider text-primary font-semibold">
        Design Suggested Update · R{round.round_no}
        {round.reviewer_name && <span className="ml-1 text-muted-foreground font-normal">· {round.reviewer_name}</span>}
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
        {tiles.map(({ key, label, apply }) => {
          const v = ((cols as Record<string, string>)[key] || "").trim();
          return (
            <div key={key} className="px-1.5 py-1 rounded bg-background/60 min-h-9">
              <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
              {v ? (
                <>
                  <div className="whitespace-pre-wrap text-foreground">{v}</div>
                  {apply && canApply && (
                    <button
                      type="button"
                      onClick={() => onApply(apply(v))}
                      className="mt-1 text-[10px] underline text-primary hover:opacity-80"
                    >
                      Apply
                    </button>
                  )}
                </>
              ) : (
                <div className="text-muted-foreground">—</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
