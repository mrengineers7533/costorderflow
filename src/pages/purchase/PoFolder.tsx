import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ConfirmBulkDeleteDialog } from "@/components/common/ConfirmBulkDeleteDialog";
import { deletePurchaseOrderCascade } from "@/lib/purchase/poDelete";
import { toast } from "sonner";
import { Download, XCircle, Send, Eye, Search, Trash2 } from "lucide-react";
import { generatePoPDF, financialYearOf } from "@/lib/purchase/poPdf";
import { fmtQty2 } from "@/lib/utils";
import { ModuleNotifications } from "@/components/notifications/ModuleNotifications";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Category =
  | "machine"
  | "3p"
  | "pipe"
  | "sheet_ss"
  | "sheet_ms"
  | "sheet_gi"
  | "structure"
  | "steel";
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
const ACTIVE_CATEGORIES: Category[] = [
  "machine",
  "3p",
  "pipe",
  "sheet_ss",
  "sheet_ms",
  "sheet_gi",
  "structure",
];

interface Po {
  id: string;
  po_number: string;
  category: Category;
  vendor_id: string | null;
  vendor_name: string;
  vendor_contact: string | null;
  lot_numbers: string[];
  annexure_ids: string[];
  status: "active" | "cancelled";
  notes: string | null;
  created_at: string;
  created_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  buyer_block: Record<string, unknown> | null;
  terms: string | null;
  dispatch_through: string | null;
  destination: string | null;
  payment_mode: string | null;
  subtotal: number | null;
  tax_total: number | null;
  grand_total: number | null;
  prepared_by_name: string | null;
  requisition_ids: string[];
}
interface PoRow {
  id: string; po_id: string; lot_no: string | null; material: string;
  size_model: string | null; make: string | null; unit: string | null;
  qty: number | null; rate: number | null; discount_pct: number | null;
  gst_pct: number | null; gst_amount: number | null; line_amount: number | null;
}
interface Vendor { id: string; name: string; email: string | null; phone: string | null; address: string | null; gstin: string | null; state_code: string | null; contact_person: string | null; }
interface Profile { id: string; full_name: string | null; email: string | null; }

export default function PoFolder() {
  const [pos, setPos] = useState<Po[]>([]);
  const [rows, setRows] = useState<PoRow[]>([]);
  const [vendors, setVendors] = useState<Record<string, Vendor>>({});
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "cancelled">("all");
  const [catFilter, setCatFilter] = useState<"all" | Category>("all");
  const [lotQ, setLotQ] = useState("");

  const [viewPo, setViewPo] = useState<Po | null>(null);
  const [sendPo, setSendPo] = useState<Po | null>(null);
  const [cancelPo, setCancelPo] = useState<Po | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDel, setConfirmDel] = useState<Po | null>(null);
  const [bulkOpen, setBulkOpen] = useState<null | { ids: string[]; numbers: string[]; mode: "selected" | "filtered" }>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: pData } = await sb.from("purchase_orders").select("*").order("created_at", { ascending: false });
    const list = (pData || []) as Po[];
    setPos(list);
    const ids = list.map((p) => p.id);
    if (ids.length) {
      const { data: rData } = await sb.from("purchase_order_rows").select("*").in("po_id", ids);
      setRows((rData || []) as PoRow[]);
    } else setRows([]);
    const vendorIds = Array.from(new Set(list.map((p) => p.vendor_id).filter(Boolean) as string[]));
    if (vendorIds.length) {
      const { data: vData } = await sb.from("vendors").select("*").in("id", vendorIds);
      const m: Record<string, Vendor> = {};
      ((vData || []) as Vendor[]).forEach((v) => { m[v.id] = v; });
      setVendors(m);
    }
    const uids = Array.from(new Set(list.map((p) => p.created_by).filter(Boolean) as string[]));
    if (uids.length) {
      const { data: pr } = await sb.from("profiles").select("id,full_name,email").in("id", uids);
      const pm: Record<string, Profile> = {};
      ((pr || []) as Profile[]).forEach((p) => { pm[p.id] = p; });
      setProfiles(pm);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      if (uid) {
        const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
        setIsAdmin(((roles as Array<{ role: string }>) || []).some((r) => r.role === "admin"));
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pos.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (catFilter !== "all" && p.category !== catFilter) return false;
      if (lotQ && !p.lot_numbers.some((l) => l.toLowerCase().includes(lotQ.toLowerCase()))) return false;
      if (needle) {
        const hay = [p.po_number, p.vendor_name, catLabel[p.category], p.lot_numbers.join(" "), p.status].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [pos, q, statusFilter, catFilter, lotQ]);

  const rowsForPo = (poId: string) => rows.filter((r) => r.po_id === poId);

  const buildPdf = (po: Po) => {
    const v = po.vendor_id ? vendors[po.vendor_id] : null;
    const pRows = rowsForPo(po.id);
    const buyer = (po.buyer_block as Record<string, unknown>) || {};
    const pdf = generatePoPDF({
      poNumber: po.po_number,
      category: po.category,
      vendor: {
        name: po.vendor_name,
        address: v?.address || undefined,
        gstin: v?.gstin || undefined,
        email: v?.email || undefined,
        state_code: v?.state_code || undefined,
        contact_person: v?.contact_person || undefined,
        phone: v?.phone || undefined,
      },
      buyer: buyer as never,
      preparedBy: po.prepared_by_name || undefined,
      dispatchThrough: po.dispatch_through || undefined,
      destination: po.destination || undefined,
      paymentMode: po.payment_mode || undefined,
      terms: po.terms || undefined,
      subtotal: po.subtotal ?? undefined,
      taxTotal: po.tax_total ?? undefined,
      grandTotal: po.grand_total ?? undefined,
      lots: po.lot_numbers,
      notes: po.notes || undefined,
      createdAt: po.created_at,
      rows: pRows.map((r) => ({
        lot: r.lot_no || "—",
        material: r.material,
        size: r.size_model || "—",
        make: r.make || "—",
        qty: r.qty ?? 0,
        unit: r.unit || "—",
        rate: r.rate ?? undefined,
        discountPct: r.discount_pct ?? undefined,
        gstPct: r.gst_pct ?? undefined,
        gstAmount: r.gst_amount ?? undefined,
        lineAmount: r.line_amount ?? undefined,
      })),
    });
    return pdf;
  };

  const download = (po: Po) => {
    const pdf = buildPdf(po);
    pdf.save(`${po.po_number.replace(/\//g, "_")}.pdf`);
  };

  const doCancel = async () => {
    if (!cancelPo) return;
    const reason = (document.getElementById("cancel_reason") as HTMLTextAreaElement)?.value || "";
    const { error } = await sb.rpc("cancel_purchase_order", { _po_id: cancelPo.id, _reason: reason });
    if (error) { toast.error(error.message); return; }
    toast.success("PO cancelled");
    setCancelPo(null);
    await load();
  };

  function toggleOne(id: string) {
    setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  function toggleAllFiltered() {
    setSelected((p) => {
      const n = new Set(p);
      if (allFilteredSelected) filtered.forEach((x) => n.delete(x.id));
      else filtered.forEach((x) => n.add(x.id));
      return n;
    });
  }

  async function deleteOne(po: Po) {
    setDeleting(true);
    try {
      await deletePurchaseOrderCascade(po.id);
      setPos((prev) => prev.filter((x) => x.id !== po.id));
      setSelected((prev) => { const n = new Set(prev); n.delete(po.id); return n; });
      toast.success(`Deleted PO ${po.po_number}`);
      setConfirmDel(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function runBulkDelete() {
    if (!bulkOpen) return;
    setDeleting(true);
    let ok = 0; let fail = 0; const errs: string[] = [];
    for (const id of bulkOpen.ids) {
      try { await deletePurchaseOrderCascade(id); ok++; }
      catch (e) { fail++; errs.push((e as Error).message); }
    }
    setDeleting(false);
    setBulkOpen(null);
    setSelected(new Set());
    await load();
    if (fail === 0) toast.success(`Deleted ${ok} PO${ok === 1 ? "" : "s"}`);
    else toast.error(`Deleted ${ok}, failed ${fail}: ${errs.slice(0, 2).join("; ")}`);
  }

  // financialYearOf is referenced to silence unused warning when nothing else uses it
  void financialYearOf;

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="container mx-auto px-4 lg:px-6 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">PO Folder</h1>
          <p className="text-xs text-muted-foreground">All Purchase Orders (active & cancelled).</p>
        </div>
        <Link to="/purchase"><Button size="sm" variant="outline">Back to Purchase</Button></Link>
      </div>

      <Card>
        <CardContent className="py-3 grid grid-cols-1 md:grid-cols-5 gap-2 text-xs">
          <div className="md:col-span-2 relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
            <Input className="h-8 pl-7" placeholder="Search PO / vendor / lot" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="h-8"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={catFilter} onValueChange={(v) => setCatFilter(v as typeof catFilter)}>
            <SelectTrigger className="h-8"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {ACTIVE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{catLabel[c]}</SelectItem>
              ))}
              {pos.some((p) => p.category === "steel") && (
                <SelectItem value="steel">Steel (legacy)</SelectItem>
              )}
            </SelectContent>
          </Select>
          <Input className="h-8" placeholder="Lot" value={lotQ} onChange={(e) => setLotQ(e.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isAdmin && (
            <div className="flex items-center justify-end gap-2 p-2 border-b bg-muted/20">
              <span className="text-[11px] text-muted-foreground mr-auto">
                {selected.size > 0 ? `${selected.size} selected` : `${filtered.length} shown`}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] text-destructive"
                disabled={selected.size === 0}
                onClick={() => {
                  const list = pos.filter((p) => selected.has(p.id));
                  setBulkOpen({ ids: list.map((p) => p.id), numbers: list.map((p) => p.po_number), mode: "selected" });
                }}
              >
                <Trash2 className="h-3 w-3 mr-1" />Delete Selected
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] text-destructive"
                disabled={filtered.length === 0}
                onClick={() => setBulkOpen({ ids: filtered.map((p) => p.id), numbers: filtered.map((p) => p.po_number), mode: "filtered" })}
              >
                <Trash2 className="h-3 w-3 mr-1" />Delete All Filtered
              </Button>
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/40 border-b">
              <tr>
                {isAdmin && (
                  <th className="text-left py-2 px-2 w-8">
                    <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAllFiltered} />
                  </th>
                )}
                <th className="text-left py-2 px-2">PO No.</th>
                <th className="text-left py-2 px-2">Lot(s)</th>
                <th className="text-left py-2 px-2">Vendor</th>
                <th className="text-left py-2 px-2">Category</th>
                <th className="text-left py-2 px-2">Annexure Ref</th>
                <th className="text-left py-2 px-2">Created</th>
                <th className="text-left py-2 px-2">By</th>
                <th className="text-right py-2 px-2">Grand</th>
                <th className="text-left py-2 px-2">Status</th>
                <th className="text-left py-2 px-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={isAdmin ? 11 : 10} className="py-8 text-center text-muted-foreground">No POs match.</td></tr>
              ) : filtered.map((p) => {
                const v = p.vendor_id ? vendors[p.vendor_id] : null;
                const createdBy = p.created_by ? (profiles[p.created_by]?.email || profiles[p.created_by]?.full_name || p.created_by.slice(0, 8)) : "—";
                return (
                  <tr key={p.id} className={`border-b last:border-0 ${p.status === "cancelled" ? "opacity-60" : ""}`}>
                    {isAdmin && (
                      <td className="py-2 px-2">
                        <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleOne(p.id)} />
                      </td>
                    )}
                    <td className="py-2 px-2 font-medium">{p.po_number}</td>
                    <td className="py-2 px-2">{p.lot_numbers.join(", ") || "—"}</td>
                    <td className="py-2 px-2">{p.vendor_name}</td>
                    <td className="py-2 px-2">{catLabel[p.category]}</td>
                    <td className="py-2 px-2 text-[11px]">{p.annexure_ids?.length ? `${p.annexure_ids.length} annexure(s)` : "—"}</td>
                    <td className="py-2 px-2 text-[11px]">{new Date(p.created_at).toLocaleString("en-IN")}</td>
                    <td className="py-2 px-2 text-[11px]">{createdBy}</td>
                    <td className="py-2 px-2 text-right">{p.grand_total != null ? p.grand_total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</td>
                    <td className="py-2 px-2">
                      {p.status === "cancelled"
                        ? <Badge variant="destructive" className="text-[10px]">Cancelled</Badge>
                        : <Badge className="bg-emerald-600 hover:bg-emerald-600 text-[10px]">Active</Badge>}
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" onClick={() => setViewPo(p)}>
                          <Eye className="h-3 w-3 mr-1" />View
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" onClick={() => download(p)}>
                          <Download className="h-3 w-3 mr-1" />PDF
                        </Button>
                        {p.status === "active" && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" disabled={!v?.email}
                              title={!v?.email ? "Vendor has no email on file" : ""}
                              onClick={() => setSendPo(p)}>
                              <Send className="h-3 w-3 mr-1" />Send
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-[11px] px-2 text-destructive" onClick={() => setCancelPo(p)}>
                              <XCircle className="h-3 w-3 mr-1" />Cancel
                            </Button>
                          </>
                        )}
                        {isAdmin && (
                          <Button size="sm" variant="outline" className="h-7 text-[11px] px-2 text-destructive" onClick={() => setConfirmDel(p)}>
                            <Trash2 className="h-3 w-3 mr-1" />Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* View dialog */}
      <Dialog open={!!viewPo} onOpenChange={(o) => !o && setViewPo(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle className="text-base">{viewPo?.po_number}</DialogTitle></DialogHeader>
          {viewPo && (
            <div className="space-y-3 text-xs">
              <ModuleNotifications links={{ poId: viewPo.id }} />
              <div className="grid grid-cols-2 gap-3">
                <div><b>Vendor:</b> {viewPo.vendor_name}<br />{viewPo.vendor_contact}</div>
                <div><b>Category:</b> {catLabel[viewPo.category]}<br /><b>Lots:</b> {viewPo.lot_numbers.join(", ") || "—"}</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border text-xs">
                  <thead className="bg-muted/40"><tr>
                    <th className="text-left p-1 border-r">Material</th>
                    <th className="text-left p-1 border-r">Size</th>
                    <th className="text-right p-1 border-r">Qty</th>
                    <th className="text-right p-1 border-r">Rate</th>
                    <th className="text-right p-1 border-r">Disc%</th>
                    <th className="text-right p-1 border-r">GST%</th>
                    <th className="text-right p-1">Amount</th>
                  </tr></thead>
                  <tbody>
                    {rowsForPo(viewPo.id).map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-1 border-r">{r.material}</td>
                        <td className="p-1 border-r">{r.size_model || "—"}</td>
                        <td className="p-1 border-r text-right">{fmtQty2(r.qty, "0.00")}</td>
                        <td className="p-1 border-r text-right">{r.rate ?? 0}</td>
                        <td className="p-1 border-r text-right">{r.discount_pct ?? 0}</td>
                        <td className="p-1 border-r text-right">{r.gst_pct ?? 0}</td>
                        <td className="p-1 text-right">{r.line_amount?.toFixed(2) ?? "0.00"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-right space-y-0.5">
                <div>Basic: {viewPo.subtotal?.toFixed(2) ?? "0.00"}</div>
                <div>Tax: {viewPo.tax_total?.toFixed(2) ?? "0.00"}</div>
                <div className="font-semibold">Grand Total: {viewPo.grand_total?.toFixed(2) ?? "0.00"}</div>
              </div>
              {viewPo.cancel_reason && (
                <div className="text-destructive">Cancellation reason: {viewPo.cancel_reason}</div>
              )}
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => download(viewPo)}><Download className="h-4 w-4 mr-1" />Download PDF</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog open={!!cancelPo} onOpenChange={(o) => !o && setCancelPo(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-base">Cancel PO {cancelPo?.po_number}?</DialogTitle></DialogHeader>
          <div className="space-y-2 text-xs">
            <p className="text-muted-foreground">This frees the linked raw materials so a new PO can be created. The cancelled PO stays visible for audit.</p>
            <Label>Reason (optional)</Label>
            <Textarea id="cancel_reason" rows={2} />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCancelPo(null)}>Keep</Button>
            <Button variant="destructive" size="sm" onClick={doCancel}>Cancel PO</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send dialog */}
      <SendDialog po={sendPo} vendor={sendPo?.vendor_id ? vendors[sendPo.vendor_id] : null} onClose={() => setSendPo(null)} onSent={load} />

      {/* Single delete */}
      <AlertDialog open={!!confirmDel} onOpenChange={(o) => { if (!o && !deleting) setConfirmDel(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete PO {confirmDel?.po_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the PO along with its line items, send log, and audit
              records. Linked raw materials will be released so they can be re-planned.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); if (confirmDel) deleteOne(confirmDel); }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete */}
      <ConfirmBulkDeleteDialog
        open={!!bulkOpen}
        onOpenChange={(o) => { if (!o) setBulkOpen(null); }}
        title={bulkOpen?.mode === "filtered" ? "Delete all filtered POs?" : "Delete selected POs?"}
        description="Each PO and its line items, send log, audit records will be permanently removed. Linked raw materials will be released. This cannot be undone."
        items={bulkOpen?.numbers || []}
        busy={deleting}
        onConfirm={runBulkDelete}
      />
    </div>
  );
}

function SendDialog({
  po, vendor, onClose, onSent,
}: { po: Po | null; vendor: Vendor | null; onClose: () => void; onSent: () => void }) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setTo(vendor?.email || "");
    setCc("");
    setMessage("");
  }, [vendor?.email, po?.id]);

  const send = async () => {
    if (!po) return;
    if (!to) { toast.error("Recipient email required"); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-po", {
        body: { po_id: po.id, to, cc: cc || null, message: message || null },
      });
      if (error) throw error;
      const result = data as { ok?: boolean; error?: string };
      if (!result?.ok) throw new Error(result?.error || "Send failed");
      toast.success("PO sent");
      onSent();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={!!po} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-base">Send PO {po?.po_number}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-xs">
          <div><Label>To *</Label><Input className="h-8" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div><Label>CC (optional)</Label><Input className="h-8" value={cc} onChange={(e) => setCc(e.target.value)} /></div>
          <div><Label>Message (optional)</Label><Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={sending} onClick={send}>{sending ? "Sending…" : "Send PO"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}