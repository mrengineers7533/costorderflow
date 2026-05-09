import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, ClipboardList, ChevronDown, ChevronRight, Users, Printer, FileDown, FileSpreadsheet } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fetchOrderFamily, fetchBoqsForFamily } from "@/lib/revisions";
import type { OrderRecord } from "@/lib/orders/types";
import type { BoqRecord } from "@/lib/boq/types";
import { generateOrderPDF } from "@/lib/orders/pdf";
import { buildOrderXlsx } from "@/lib/orders/excel";
import { generateBoqPDF } from "@/lib/boq/pdf";
import { buildBoqXlsx } from "@/lib/boq/excel";
import {
  fetchClientCopiesForOrderIds,
  getClientCopySignedUrl,
  downloadClientCopyBlob,
  type ClientCopyRecord,
} from "@/lib/orders/clientCopies";
import { buildClientCopyXlsx } from "@/lib/orders/clientCopyExcel";

interface Props {
  rootOrderId: string;
  /** Bumped by the parent after a revise to force refetch. */
  reloadKey?: number;
}

export function RevisionsPanel({ rootOrderId, reloadKey }: Props) {
  const nav = useNavigate();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [boqs, setBoqs] = useState<BoqRecord[]>([]);
  const [clientCopies, setClientCopies] = useState<ClientCopyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ords = await fetchOrderFamily(rootOrderId);
      setOrders(ords);
      const ids = ords.map((o) => o.id);
      const [boqs, copies] = await Promise.all([
        fetchBoqsForFamily(ids),
        fetchClientCopiesForOrderIds(ids),
      ]);
      setBoqs(boqs);
      setClientCopies(copies);
    } catch (e) {
      toast({ title: "Could not load revisions", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [rootOrderId]);

  // Lazy-load: only fetch when the section is opened (refetch on reloadKey while open).
  useEffect(() => { if (open) load(); }, [open, load, reloadKey]);

  // Group BOQ revisions by their source OA revision id.
  const boqsBySourceOrder = new Map<string, BoqRecord[]>();
  boqs.forEach((b) => {
    const k = b.source_order_id || b.order_id;
    const arr = boqsBySourceOrder.get(k) || [];
    arr.push(b);
    boqsBySourceOrder.set(k, arr);
  });

  const copiesByOrder = new Map<string, ClientCopyRecord[]>();
  clientCopies.forEach((c) => {
    const arr = copiesByOrder.get(c.order_id) || [];
    arr.push(c);
    copiesByOrder.set(c.order_id, arr);
  });

  async function viewCopy(c: ClientCopyRecord) {
    try {
      const url = await getClientCopySignedUrl(c.file_path);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast({ title: "Open failed", description: (e as Error).message, variant: "destructive" });
    }
  }
  async function printCopy(c: ClientCopyRecord) {
    try {
      const url = await getClientCopySignedUrl(c.file_path);
      const w = window.open(url, "_blank", "noopener");
      if (w) {
        // Best effort — many browsers block scripted print on cross-origin docs.
        setTimeout(() => { try { w.print(); } catch { /* ignore */ } }, 1200);
      }
    } catch (e) {
      toast({ title: "Print failed", description: (e as Error).message, variant: "destructive" });
    }
  }
  async function downloadPdf(c: ClientCopyRecord) {
    try {
      const blob = await downloadClientCopyBlob(c.file_path);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = c.file_name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      toast({ title: "Download failed", description: (e as Error).message, variant: "destructive" });
    }
  }
  function downloadXlsx(c: ClientCopyRecord) {
    try {
      const blob = buildClientCopyXlsx(
        {
          oa_number: c.snapshot?.oa_number || "",
          format: c.format,
          version_label: c.version_label,
          company_name: c.snapshot?.company_name,
          order_date: c.snapshot?.order_date,
        },
        c.line_items,
        c.totals,
        c.charges,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = c.file_name.replace(/\.pdf$/i, ".xlsx");
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      toast({ title: "Excel export failed", description: (e as Error).message, variant: "destructive" });
    }
  }

  async function downloadOaPdf(o: OrderRecord) {
    try {
      const doc = await generateOrderPDF(o);
      const safe = (o.oa_number || "OA").replace(/[/\\]/g, "_");
      doc.save(`${safe}.pdf`);
    } catch (e) {
      toast({ title: "Download failed", description: (e as Error).message, variant: "destructive" });
    }
  }
  async function printOa(o: OrderRecord) {
    try {
      const doc = await generateOrderPDF(o);
      const url = doc.output("bloburl") as unknown as string;
      const w = window.open(url, "_blank", "noopener");
      if (w) setTimeout(() => { try { w.print(); } catch { /* */ } }, 1000);
    } catch (e) {
      toast({ title: "Print failed", description: (e as Error).message, variant: "destructive" });
    }
  }
  function downloadOaXlsx(o: OrderRecord) {
    try {
      const blob = buildOrderXlsx(o);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safe = (o.oa_number || "OA").replace(/[/\\]/g, "_");
      a.href = url; a.download = `${safe}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      toast({ title: "Excel export failed", description: (e as Error).message, variant: "destructive" });
    }
  }
  async function downloadBoqPdf(b: BoqRecord) {
    try {
      const doc = await generateBoqPDF(b);
      const safe = (b.boq_number || "BOQ").replace(/[/\\]/g, "_");
      doc.save(`${safe}.pdf`);
    } catch (e) {
      toast({ title: "Download failed", description: (e as Error).message, variant: "destructive" });
    }
  }
  async function printBoq(b: BoqRecord) {
    try {
      const doc = await generateBoqPDF(b);
      const url = doc.output("bloburl") as unknown as string;
      const w = window.open(url, "_blank", "noopener");
      if (w) setTimeout(() => { try { w.print(); } catch { /* */ } }, 1000);
    } catch (e) {
      toast({ title: "Print failed", description: (e as Error).message, variant: "destructive" });
    }
  }
  function downloadBoqXlsx(b: BoqRecord) {
    try {
      const blob = buildBoqXlsx(b);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safe = (b.boq_number || "BOQ").replace(/[/\\]/g, "_");
      a.href = url; a.download = `${safe}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      toast({ title: "Excel export failed", description: (e as Error).message, variant: "destructive" });
    }
  }

  return (
    <Card>
      <CardHeader
        className="pb-3 cursor-pointer select-none"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        <CardTitle className="text-base flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Revision History
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          {loading && orders.length === 0 ? (
            <div className="py-2 text-sm text-muted-foreground">Loading revisions…</div>
          ) : null}
          {orders.map((o) => {
            const linkedBoqs = boqsBySourceOrder.get(o.id) || [];
            const linkedCopies = copiesByOrder.get(o.id) || [];
            return (
              <div key={o.id} className="rounded-lg border bg-card overflow-hidden">
                {/* OA row */}
                <div className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 ${o.is_current ? "bg-primary/5" : "bg-muted/30"}`}>
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <Badge variant={o.is_current ? "default" : "secondary"} className="text-[10px] uppercase tracking-wide">
                      {o.is_current ? "Current" : "Superseded"}
                    </Badge>
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">OA</span>
                    <span className="font-mono text-sm font-semibold">{o.oa_number}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted font-mono">Rev {o.revision ?? 0}</span>
                    <span className="text-[11px] text-muted-foreground capitalize">· {o.status}</span>
                    <span className="text-[11px] text-muted-foreground">· {new Date(o.created_at).toLocaleDateString("en-IN")}</span>
                    {o.prepared_by && <span className="text-[11px] text-muted-foreground">· by {o.prepared_by}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => nav(`/orders/${o.id}`)}>
                      <Eye className="h-3.5 w-3.5 mr-1" />View
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => printOa(o)} title="Print">
                      <Printer className="h-3.5 w-3.5 mr-1" />Print
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => downloadOaPdf(o)} title="Download PDF">
                      <FileDown className="h-3.5 w-3.5 mr-1" />PDF
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => downloadOaXlsx(o)} title="Download Excel">
                      <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />Excel
                    </Button>
                  </div>
                </div>
                {/* Linked BOQs (indented) */}
                {linkedBoqs.length > 0 ? (
                  <div className="divide-y border-t">
                    {linkedBoqs.map((b) => (
                      <div key={b.id} className={`flex flex-wrap items-center justify-between gap-2 pl-8 pr-3 py-1.5 ${b.is_current ? "" : "opacity-70"}`}>
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <Badge variant={b.is_current ? "default" : "outline"} className="text-[10px]">
                            {b.is_current ? "Current" : "Superseded"}
                          </Badge>
                          <ClipboardList className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">BOQ</span>
                          <span className="font-mono text-xs font-semibold">{b.boq_number}</span>
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted font-mono">Rev {b.revision ?? 0}</span>
                          <span className="text-[11px] text-muted-foreground capitalize">· {b.status}</span>
                          <span className="text-[11px] text-muted-foreground">· {new Date(b.created_at).toLocaleDateString("en-IN")}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => nav(`/boqs/${b.id}`)}>
                            <Eye className="h-3.5 w-3.5 mr-1" />View
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => printBoq(b)} title="Print">
                            <Printer className="h-3.5 w-3.5 mr-1" />Print
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => downloadBoqPdf(b)} title="Download PDF">
                            <FileDown className="h-3.5 w-3.5 mr-1" />PDF
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => downloadBoqXlsx(b)} title="Download Excel">
                            <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />Excel
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="pl-8 pr-3 py-1.5 text-[11px] text-muted-foreground border-t italic">No BOQ generated for this OA revision.</div>
                )}
                {/* Linked Client Copies */}
                {linkedCopies.length > 0 && (
                  <div className="divide-y border-t">
                    {linkedCopies.map((c) => (
                      <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 pl-8 pr-3 py-1.5">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <Badge variant="outline" className="text-[10px]">{c.version_label}</Badge>
                          <Users className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Client Copy</span>
                          <span className="font-mono text-xs font-semibold truncate">{c.file_name}</span>
                          <span className="text-[11px] text-muted-foreground">· {c.format}</span>
                          <span className="text-[11px] text-muted-foreground">· {new Date(c.created_at).toLocaleString("en-IN")}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => viewCopy(c)}>
                            <Eye className="h-3.5 w-3.5 mr-1" />View
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => printCopy(c)}>
                            <Printer className="h-3.5 w-3.5 mr-1" />Print
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => downloadPdf(c)}>
                            <FileDown className="h-3.5 w-3.5 mr-1" />PDF
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => downloadXlsx(c)}>
                            <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />Excel
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
