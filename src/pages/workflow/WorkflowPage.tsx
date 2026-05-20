import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search, Eye, EyeOff, ChevronDown, ChevronRight, ChevronUp, FileSpreadsheet,
  FileText, ClipboardList, Link2, Send, RefreshCw, CheckCircle2, Share2, Receipt, Copy,
  ClipboardCheck, ShoppingCart, Factory, Truck,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { OrderRecord } from "@/lib/orders/types";
import type { BoqRecord } from "@/lib/boq/types";
import type { PiRecord } from "@/lib/pi/types";
import { reviewLink, finalBoqLink } from "@/lib/boq/designReview";

const fmtINR = (n: number) =>
  `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("en-IN") : "—";
const fmtDateTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("en-IN") : "—";

interface CostSheetRow {
  id: string;
  original_filename: string;
  created_at: string;
  extracted: Record<string, unknown> | null;
}
interface DesignReviewLite {
  id: string;
  boq_id: string;
  round_no: number;
  kind: "comment" | "approval";
  status: string;
  sent_at: string;
  submitted_at: string | null;
  overall_outcome: string | null;
  token: string;
  expires_at: string;
}

interface Family {
  rootId: string;
  company: string;
  orders: OrderRecord[];
  current: OrderRecord | null;
  original: OrderRecord | null;
  mrOa: OrderRecord | null;
  gmsOa: OrderRecord | null;
  costSheet: CostSheetRow | null;
  boqs: BoqRecord[];
  currentBoq: BoqRecord | null;
  reviews: DesignReviewLite[];
  pis: PiRecord[];
  costSheetNumber: string;
}

function copy(text: string, label = "Link copied") {
  navigator.clipboard.writeText(text).then(
    () => toast({ title: label, description: text }),
    () => toast({ title: "Copy failed", variant: "destructive" }),
  );
}

export default function WorkflowPage() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [boqs, setBoqs] = useState<BoqRecord[]>([]);
  const [pis, setPis] = useState<PiRecord[]>([]);
  const [costSheets, setCostSheets] = useState<CostSheetRow[]>([]);
  const [reviews, setReviews] = useState<DesignReviewLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [fmtFilter, setFmtFilter] = useState<"ALL" | "MR" | "GMS">("ALL");
  const [stageFilter, setStageFilter] = useState<"ALL" | "no_boq" | "in_design" | "approved" | "has_pi" | "no_pi">("ALL");
  const [csFilter, setCsFilter] = useState<"ALL" | "with" | "without">("ALL");

  useEffect(() => {
    (async () => {
      const [o, b, p, cs, dr] = await Promise.all([
        supabase.from("orders").select("*").order("created_at", { ascending: false }),
        supabase.from("boqs").select("*").order("created_at", { ascending: false }),
        supabase.from("proforma_invoices").select("*").order("created_at", { ascending: false }),
        supabase.from("cost_sheets").select("id,original_filename,created_at,extracted").order("created_at", { ascending: false }),
        supabase.from("boq_design_reviews")
          .select("id,boq_id,round_no,kind,status,sent_at,submitted_at,overall_outcome,token,expires_at")
          .order("sent_at", { ascending: true }),
      ]);
      setOrders((o.data as unknown as OrderRecord[]) || []);
      setBoqs((b.data as unknown as BoqRecord[]) || []);
      setPis((p.data as unknown as PiRecord[]) || []);
      setCostSheets((cs.data as unknown as CostSheetRow[]) || []);
      setReviews((dr.data as unknown as DesignReviewLite[]) || []);
      setLoading(false);
    })();
  }, []);

  const families: Family[] = useMemo(() => {
    const byRoot = new Map<string, OrderRecord[]>();
    for (const o of orders) {
      const root = o.parent_order_id || o.id;
      if (!byRoot.has(root)) byRoot.set(root, []);
      byRoot.get(root)!.push(o);
    }
    const piByOaId = new Map<string, PiRecord[]>();
    for (const p of pis) {
      if (!p.reference_oa_id) continue;
      if (!piByOaId.has(p.reference_oa_id)) piByOaId.set(p.reference_oa_id, []);
      piByOaId.get(p.reference_oa_id)!.push(p);
    }
    const csByNumber = new Map<string, CostSheetRow>();
    for (const c of costSheets) {
      const ex = (c.extracted || {}) as Record<string, unknown>;
      const num = String((ex.cost_sheet_number || ex.number || "") as string).trim();
      if (num) csByNumber.set(num.toLowerCase(), c);
    }

    // Build per-OA-family aggregates first (preserving revision groupings),
    // then merge them into rows keyed by Cost Sheet so each CS = one row.
    type FamAgg = {
      rootId: string;
      orders: OrderRecord[];
      current: OrderRecord;
      original: OrderRecord;
      boqs: BoqRecord[];
      currentBoq: BoqRecord | null;
      reviews: DesignReviewLite[];
      pis: PiRecord[];
      csNum: string; // lowercased, "" if none
    };
    const aggs: FamAgg[] = [];
    for (const [rootId, fam] of byRoot.entries()) {
      const sorted = [...fam].sort((a, b) => (a.revision || 0) - (b.revision || 0));
      const original = sorted[0];
      const current = sorted.find((o) => o.is_current !== false) || sorted[sorted.length - 1];
      const familyOaIds = new Set(sorted.map((o) => o.id));
      const famBoqs = boqs.filter((bq) => familyOaIds.has(bq.order_id))
        .sort((a, b) => (a.revision || 0) - (b.revision || 0));
      const currentBoq = famBoqs.find((b) => b.is_current !== false) || famBoqs[famBoqs.length - 1] || null;
      const boqIds = new Set(famBoqs.map((b) => b.id));
      const famReviews = reviews.filter((r) => boqIds.has(r.boq_id));
      const famPis: PiRecord[] = [];
      for (const oa of sorted) famPis.push(...(piByOaId.get(oa.id) || []));
      const csNum = (current.cost_sheet_number || "").trim().toLowerCase();
      aggs.push({ rootId, orders: sorted, current, original, boqs: famBoqs, currentBoq, reviews: famReviews, pis: famPis, csNum });
    }

    // Group aggregates by cost sheet number. Aggregates with no CS become
    // their own per-family row (key = `__none__:${rootId}`) so nothing is lost.
    const rowsByKey = new Map<string, { cs: CostSheetRow | null; csNum: string; aggs: FamAgg[] }>();
    for (const a of aggs) {
      const key = a.csNum ? `cs:${a.csNum}` : `__none__:${a.rootId}`;
      if (!rowsByKey.has(key)) {
        rowsByKey.set(key, { cs: a.csNum ? csByNumber.get(a.csNum) || null : null, csNum: a.csNum, aggs: [] });
      }
      rowsByKey.get(key)!.aggs.push(a);
    }
    // Cost sheets with no linked OAs → empty row so user sees them too.
    for (const [num, cs] of csByNumber.entries()) {
      const key = `cs:${num}`;
      if (!rowsByKey.has(key)) {
        rowsByKey.set(key, { cs, csNum: num, aggs: [] });
      }
    }

    const rows: Family[] = [];
    for (const [key, bucket] of rowsByKey.entries()) {
      const allOrders = bucket.aggs.flatMap((a) => a.orders);
      const allBoqs = bucket.aggs.flatMap((a) => a.boqs);
      const allReviews = bucket.aggs.flatMap((a) => a.reviews);
      const allPis = bucket.aggs.flatMap((a) => a.pis);
      // Latest current order across the bucket (drives header + Convert-to-PI link)
      const currents = bucket.aggs.map((a) => a.current).filter(Boolean);
      currents.sort((a, b) => (b.order_date || "").localeCompare(a.order_date || ""));
      const current = currents[0] || null;
      const original = bucket.aggs[0]?.original || null;
      const pickByFormat = (fmt: "MR" | "GMS"): OrderRecord | null => {
        const list = allOrders.filter((o) => o.format === fmt);
        if (!list.length) return null;
        return list.find((o) => o.is_current !== false) || list[list.length - 1];
      };
      const currentBoq =
        allBoqs.find((b) => b.is_current !== false) ||
        allBoqs[allBoqs.length - 1] ||
        null;
      const csEx = (bucket.cs?.extracted || {}) as Record<string, unknown>;
      const csNumberPretty =
        String((csEx.cost_sheet_number || csEx.number || "") as string).trim() ||
        bucket.csNum.toUpperCase() ||
        "";
      const company =
        current?.company_name || current?.bill_to?.name || "(No OA yet)";
      rows.push({
        rootId: key,
        company,
        orders: allOrders,
        current,
        original,
        mrOa: pickByFormat("MR"),
        gmsOa: pickByFormat("GMS"),
        costSheet: bucket.cs,
        boqs: allBoqs,
        currentBoq,
        reviews: allReviews,
        pis: allPis,
        costSheetNumber: csNumberPretty,
      });
    }
    rows.sort((a, b) => {
      const ad = a.current?.order_date || a.costSheet?.created_at || "";
      const bd = b.current?.order_date || b.costSheet?.created_at || "";
      return bd.localeCompare(ad);
    });
    return rows;
  }, [orders, boqs, pis, costSheets, reviews]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return families.filter((f) => {
      if (q) {
        const hay = [
          f.company,
          f.current?.oa_number,
          f.original?.oa_number,
          f.current?.cost_sheet_number,
          f.costSheetNumber,
          f.boqs.map((b) => b.boq_number).join(" "),
          f.pis.map((p) => p.pi_number).join(" "),
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (fmtFilter !== "ALL") {
        const hasFmt = f.orders.some((o) => o.format === fmtFilter);
        if (!hasFmt) return false;
      }
      if (csFilter === "with" && !f.costSheet) return false;
      if (csFilter === "without" && f.costSheet) return false;
      if (stageFilter !== "ALL") {
        const approved = f.reviews.some((r) => r.kind === "approval" && r.overall_outcome === "approved");
        const inDesign = f.reviews.length > 0 && !approved;
        if (stageFilter === "no_boq" && f.boqs.length > 0) return false;
        if (stageFilter === "in_design" && !inDesign) return false;
        if (stageFilter === "approved" && !approved) return false;
        if (stageFilter === "has_pi" && f.pis.length === 0) return false;
        if (stageFilter === "no_pi" && f.pis.length > 0) return false;
      }
      return true;
    });
  }, [families, search, fmtFilter, csFilter, stageFilter]);

  return (
    <div className="container mx-auto px-4 lg:px-6 py-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Workflow</h1>
          <p className="text-xs text-muted-foreground">Complete Cost Sheet → OA → BOQ → Design → PI lifecycle for every project.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search company, CS#, OA, BOQ, PI…"
              className="h-8 pl-7 w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowHistory((s) => !s)}>
            {showHistory ? <><EyeOff className="h-3.5 w-3.5 mr-1" />Hide Revision History</> : <><Eye className="h-3.5 w-3.5 mr-1" />Show Revision History</>}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted-foreground mr-1">Format:</span>
        {(["ALL", "MR", "GMS"] as const).map((v) => (
          <Button key={v} size="sm" variant={fmtFilter === v ? "default" : "outline"} className="h-7" onClick={() => setFmtFilter(v)}>{v}</Button>
        ))}
        <span className="text-muted-foreground ml-3 mr-1">Cost Sheet:</span>
        {([["ALL", "All"], ["with", "With CS"], ["without", "Without CS"]] as const).map(([v, l]) => (
          <Button key={v} size="sm" variant={csFilter === v ? "default" : "outline"} className="h-7" onClick={() => setCsFilter(v)}>{l}</Button>
        ))}
        <span className="text-muted-foreground ml-3 mr-1">Stage:</span>
        {([
          ["ALL", "All"],
          ["no_boq", "No BOQ"],
          ["in_design", "In Design"],
          ["approved", "Approved"],
          ["has_pi", "Has PI"],
          ["no_pi", "No PI"],
        ] as const).map(([v, l]) => (
          <Button key={v} size="sm" variant={stageFilter === v ? "default" : "outline"} className="h-7" onClick={() => setStageFilter(v)}>{l}</Button>
        ))}
        <div className="ml-auto text-muted-foreground">{filtered.length} of {families.length}</div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects yet.</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((f) => (
            <FamilyCard key={f.rootId} family={f} historyOpen={showHistory} />
          ))}
        </div>
      )}
    </div>
  );
}

function FamilyCard({ family, historyOpen }: { family: Family; historyOpen: boolean }) {
  const f = family;
  const csEx = (f.costSheet?.extracted || {}) as Record<string, unknown>;
  const csNumber =
    String((csEx.cost_sheet_number || csEx.number || f.current?.cost_sheet_number || f.costSheetNumber || "") as string) ||
    "—";
  const csDate = (csEx.cost_sheet_date || csEx.date) as string | undefined;
  const csTotalA = Number((csEx.total_a as number) || 0) || 0;
  const csTotalB = Number((csEx.total_other_b as number) || 0) || 0;
  // Fallback: if AI didn't extract A/B but did extract a cost_of_project total, use that.
  const csCopPrinted = Number((csEx.cost_of_project || csEx.total_cost || csEx.total || csEx.grand_total) as number) || 0;
  const csTotal = (csTotalA + csTotalB) || csCopPrinted;
  const csClientScope = Number((csEx.client_scope_amount as number) || 0) || 0;

  const mrBasic = f.mrOa?.totals?.subtotal || f.mrOa?.totals?.net_payable || 0;
  const gmsAmt = f.gmsOa?.totals?.net_payable || f.gmsOa?.totals?.subtotal || 0;

  const commentRound = [...f.reviews].reverse().find((r) => r.kind === "comment");
  const commentSubmitted = [...f.reviews].reverse().find((r) => r.kind === "comment" && r.status === "submitted");
  const approvalRound = [...f.reviews].reverse().find((r) => r.kind === "approval");
  const approvalSubmitted = [...f.reviews].reverse().find((r) => r.kind === "approval" && r.status === "submitted");
  const approved = approvalSubmitted?.overall_outcome === "approved";
  const updatedOa = f.orders.length > 1 ? f.current : null;
  const revisedBoq = (f.boqs.length > 1 && approved) ? (f.currentBoq || null) : null;
  const finalToken = (f.currentBoq as unknown as { final_share_token?: string | null } | null)?.final_share_token || null;
  const finalSentAt = (f.currentBoq as unknown as { final_sent_at?: string | null } | null)?.final_sent_at || null;

  const oaRevs = f.orders.filter((o) => (o.revision ?? 0) > 0);
  const boqRevs = f.boqs.filter((b) => (b.revision ?? 0) > 0);
  const commentReviews = f.reviews.filter((r) => r.kind === "comment");
  const approvalReviews = f.reviews.filter((r) => r.kind === "approval");

  const stages: StageDef[] = [
    {
      id: 1, label: "Cost Sheet Upload", icon: <FileSpreadsheet className="h-4 w-4" />,
      status: f.costSheet ? "done" : "pending",
      summary: f.costSheet ? `CS#${csNumber}` : "—",
      detail: (
        <DetailGrid items={[
          ["CS Number", csNumber],
          ["CS Date", fmtDate(csDate)],
          ["Total (A)", csTotalA ? fmtINR(csTotalA) : "—"],
          ["Total (Other B)", csTotalB ? fmtINR(csTotalB) : "—"],
          ["Cost of Project (A+B)", csTotal ? fmtINR(csTotal) : "—"],
          ["Client Scope", csClientScope ? fmtINR(csClientScope) : "—"],
          ["File", f.costSheet?.original_filename || "—"],
        ]} />
      ),
      revisions: [],
    },
    {
      id: 2, label: "MR OA", icon: <FileText className="h-4 w-4" />,
      status: f.mrOa ? "done" : "pending",
      summary: f.mrOa ? `${f.mrOa.oa_number} · ${fmtShortINR(mrBasic)}` : "—",
      detail: f.mrOa ? (
        <>
          <DetailGrid items={[
            ["OA Number", f.mrOa.oa_number],
            ["Date", fmtDate(f.mrOa.order_date)],
            ["Basic", fmtINR(mrBasic)],
            ["Revision", `R${f.mrOa.revision ?? 0}`],
          ]} />
          <DetailActions>
            <Link to={`/orders/${f.mrOa.id}`}><Button size="sm" variant="outline">Open MR OA</Button></Link>
          </DetailActions>
        </>
      ) : <EmptyDetail text="No MR OA yet." />,
      revisions: f.orders.filter((o) => o.format === "MR").map((o) => ({
        id: o.id, label: `R${o.revision ?? 0}`,
        sub: `${o.oa_number} · ${fmtDate(o.order_date)} · ${fmtShortINR(o.totals?.net_payable || o.totals?.subtotal || 0)}`,
        href: `/orders/${o.id}`,
        current: !!o.is_current,
      })),
    },
    {
      id: 3, label: "GMS OA", icon: <FileText className="h-4 w-4" />,
      status: f.gmsOa ? "done" : "pending",
      summary: f.gmsOa ? `${f.gmsOa.oa_number} · ${fmtShortINR(gmsAmt)}` : "—",
      detail: f.gmsOa ? (
        <>
          <DetailGrid items={[
            ["OA Number", f.gmsOa.oa_number],
            ["Date", fmtDate(f.gmsOa.order_date)],
            ["Amount", fmtINR(gmsAmt)],
            ["Revision", `R${f.gmsOa.revision ?? 0}`],
          ]} />
          <DetailActions>
            <Link to={`/orders/${f.gmsOa.id}`}><Button size="sm" variant="outline">Open GMS OA</Button></Link>
          </DetailActions>
        </>
      ) : <EmptyDetail text="No GMS OA yet." />,
      revisions: f.orders.filter((o) => o.format === "GMS").map((o) => ({
        id: o.id, label: `R${o.revision ?? 0}`,
        sub: `${o.oa_number} · ${fmtDate(o.order_date)} · ${fmtShortINR(o.totals?.net_payable || o.totals?.subtotal || 0)}`,
        href: `/orders/${o.id}`,
        current: !!o.is_current,
      })),
    },
    (() => {
      const firstBoq = f.boqs[0] || null;
      return {
        id: 4, label: "Auto BOQ", icon: <ClipboardList className="h-4 w-4" />,
        status: firstBoq ? "done" : "pending",
        summary: firstBoq ? `${firstBoq.boq_number}` : "No BOQ",
        detail: firstBoq ? (
          <>
            <DetailGrid items={[
              ["BOQ Number", firstBoq.boq_number],
              ["Date", fmtDate(firstBoq.boq_date)],
              ["Status", firstBoq.status],
              ["Revision", `R${firstBoq.revision ?? 0}`],
            ]} />
            <DetailActions>
              <Link to={`/boqs/${firstBoq.id}`}><Button size="sm" variant="outline">Open BOQ</Button></Link>
            </DetailActions>
          </>
        ) : <EmptyDetail text="BOQ not generated yet." />,
        revisions: [],
      };
    })(),
    {
      id: 5, label: "Design Link Sent", icon: <Send className="h-4 w-4" />,
      status: commentRound ? "done" : "pending",
      summary: commentRound ? `R${commentRound.round_no} sent` : "Not sent",
      detail: commentRound ? (
        <>
          <DetailGrid items={[
            ["Round", `R${commentRound.round_no}`],
            ["Sent", fmtDateTime(commentRound.sent_at)],
            ["Expires", fmtDate(commentRound.expires_at)],
            ["Status", commentRound.status],
          ]} />
          <DetailActions>
            <Button size="sm" variant="outline" onClick={() => copy(reviewLink(commentRound.token), "Comment link copied")}>
              <Copy className="h-3.5 w-3.5 mr-1" />Copy Design Link
            </Button>
          </DetailActions>
        </>
      ) : <EmptyDetail text="Design comment link not generated yet." />,
      revisions: commentReviews.map((r) => ({
        id: r.id, label: `R${r.round_no}`,
        sub: `Sent ${fmtDateTime(r.sent_at)}${r.submitted_at ? ` · Submitted ${fmtDateTime(r.submitted_at)}` : ""}`,
        copyText: reviewLink(r.token),
        copyLabel: "Comment link copied",
        current: r.id === commentRound?.id,
      })),
    },
    {
      id: 6, label: "Comments Received", icon: <RefreshCw className="h-4 w-4" />,
      status: commentSubmitted ? "done" : commentRound ? "awaiting" : "pending",
      summary: commentSubmitted ? `R${commentSubmitted.round_no} ${commentSubmitted.overall_outcome || "received"}` : commentRound ? "Awaiting" : "—",
      detail: commentSubmitted ? (
        <DetailGrid items={[
          ["Round", `R${commentSubmitted.round_no}`],
          ["Submitted", fmtDateTime(commentSubmitted.submitted_at)],
          ["Outcome", commentSubmitted.overall_outcome || "—"],
        ]} />
      ) : <EmptyDetail text={commentRound ? "Awaiting design team response." : "Comments not received yet."} />,
      revisions: commentReviews.filter((r) => r.submitted_at).map((r) => ({
        id: `sub-${r.id}`, label: `R${r.round_no}`,
        sub: `Submitted ${fmtDateTime(r.submitted_at)} · ${r.overall_outcome || "—"}`,
        current: r.id === commentSubmitted?.id,
      })),
    },
    {
      id: 7, label: "Update OA", icon: <FileText className="h-4 w-4" />,
      status: updatedOa ? "done" : "pending",
      summary: updatedOa ? `${updatedOa.oa_number} R${updatedOa.revision ?? 0}` : "No revision",
      detail: updatedOa ? (
        <>
          <DetailGrid items={[
            ["OA Number", updatedOa.oa_number],
            ["Format", updatedOa.format],
            ["Revision", `R${updatedOa.revision ?? 0}`],
            ["Date", fmtDate(updatedOa.order_date)],
          ]} />
          <DetailActions>
            <Link to={`/orders/${updatedOa.id}`}><Button size="sm" variant="outline">Open Updated OA</Button></Link>
          </DetailActions>
        </>
      ) : <EmptyDetail text="OA not yet updated against design comments." />,
      revisions: oaRevs.map((o) => ({
        id: o.id, label: `R${o.revision}`,
        sub: `${o.oa_number} · ${o.format} · ${fmtDate(o.order_date)}`,
        href: `/orders/${o.id}`,
        current: !!o.is_current,
      })),
    },
    {
      id: 8, label: "Auto-Revised BOQ", icon: <ClipboardList className="h-4 w-4" />,
      status: boqRevs.length > 0 ? "done" : "pending",
      summary: boqRevs.length > 0 ? `${boqRevs[boqRevs.length - 1].boq_number} R${boqRevs[boqRevs.length - 1].revision}` : "—",
      detail: boqRevs.length > 0 ? (
        <>
          <DetailGrid items={[
            ["BOQ Number", boqRevs[boqRevs.length - 1].boq_number],
            ["Revision", `R${boqRevs[boqRevs.length - 1].revision}`],
            ["Date", fmtDate(boqRevs[boqRevs.length - 1].boq_date)],
            ["Status", boqRevs[boqRevs.length - 1].status],
          ]} />
          <DetailActions>
            <Link to={`/boqs/${boqRevs[boqRevs.length - 1].id}`}><Button size="sm" variant="outline">Open Revised BOQ</Button></Link>
          </DetailActions>
        </>
      ) : <EmptyDetail text="BOQ not yet auto-revised." />,
      revisions: boqRevs.map((b) => ({
        id: b.id, label: `R${b.revision}`,
        sub: `${b.boq_number} · ${fmtDate(b.boq_date)} · ${b.status}`,
        href: `/boqs/${b.id}`,
        current: !!b.is_current,
      })),
    },
    {
      id: 9, label: "Sent for Approval", icon: <Link2 className="h-4 w-4" />,
      status: approvalRound ? "done" : "pending",
      summary: approvalRound ? `R${approvalRound.round_no} sent` : "Not sent",
      detail: approvalRound ? (
        <>
          <DetailGrid items={[
            ["Round", `R${approvalRound.round_no}`],
            ["Sent", fmtDateTime(approvalRound.sent_at)],
            ["Expires", fmtDate(approvalRound.expires_at)],
            ["Status", approvalSubmitted ? `Submitted · ${approvalSubmitted.overall_outcome || "—"}` : "Awaiting"],
          ]} />
          <DetailActions>
            <Button size="sm" variant="outline" onClick={() => copy(reviewLink(approvalRound.token), "Approval link copied")}>
              <Copy className="h-3.5 w-3.5 mr-1" />Copy Approval Link
            </Button>
          </DetailActions>
        </>
      ) : <EmptyDetail text="Approval link not generated yet." />,
      revisions: approvalReviews.map((r) => ({
        id: r.id, label: `R${r.round_no}`,
        sub: `Sent ${fmtDateTime(r.sent_at)}${r.submitted_at ? ` · ${r.overall_outcome || "submitted"}` : ""}`,
        copyText: reviewLink(r.token),
        copyLabel: "Approval link copied",
        current: r.id === approvalRound?.id,
      })),
    },
    {
      id: 10, label: "Approval Received", icon: <CheckCircle2 className="h-4 w-4" />,
      status: approved ? "done" : approvalRound ? "awaiting" : "pending",
      summary: approved ? `R${approvalSubmitted?.round_no} approved` : approvalRound ? "Awaiting" : "—",
      detail: approved ? (
        <DetailGrid items={[
          ["Round", `R${approvalSubmitted?.round_no}`],
          ["Received", fmtDateTime(approvalSubmitted?.submitted_at)],
          ["Outcome", approvalSubmitted?.overall_outcome || "approved"],
          ["Revised BOQ", revisedBoq ? `${revisedBoq.boq_number} R${revisedBoq.revision ?? 0}` : "—"],
        ]} />
      ) : <EmptyDetail text={approvalRound ? "Awaiting design approval." : "Approval not received yet."} />,
      revisions: approvalReviews.filter((r) => r.submitted_at).map((r) => ({
        id: `sub-${r.id}`, label: `R${r.round_no}`,
        sub: `${fmtDateTime(r.submitted_at)} · ${r.overall_outcome || "—"}`,
        current: r.id === approvalSubmitted?.id,
      })),
    },
    {
      id: 11, label: "Purchase/Mfg Link", icon: <Share2 className="h-4 w-4" />,
      status: finalToken ? "done" : "pending",
      summary: finalToken ? "Link active" : "Not sent",
      detail: finalToken ? (
        <>
          <DetailGrid items={[
            ["BOQ", f.currentBoq?.boq_number || "—"],
            ["Sent At", fmtDateTime(finalSentAt)],
            ["Status", "Active"],
          ]} />
          <DetailActions>
            <Button size="sm" variant="outline" onClick={() => copy(finalBoqLink(finalToken), "Final BOQ link copied")}>
              <Copy className="h-3.5 w-3.5 mr-1" />Copy Final Link
            </Button>
          </DetailActions>
        </>
      ) : <EmptyDetail text="Final BOQ link not sent to Purchase/Manufacturing yet." />,
      revisions: [],
    },
    {
      id: 12, label: "Requisition", icon: <ClipboardCheck className="h-4 w-4" />,
      status: "pending",
      summary: "—",
      detail: <EmptyDetail text="Requisition tracking will appear here once recorded." />,
      revisions: [],
    },
    {
      id: 13, label: "Purchase", icon: <ShoppingCart className="h-4 w-4" />,
      status: "pending",
      summary: "—",
      detail: <EmptyDetail text="Purchase tracking will appear here once recorded." />,
      revisions: [],
    },
    {
      id: 14, label: "Manufacturing", icon: <Factory className="h-4 w-4" />,
      status: "pending",
      summary: "—",
      detail: <EmptyDetail text="Manufacturing tracking will appear here once recorded." />,
      revisions: [],
    },
    {
      id: 15, label: "Make PI", icon: <Receipt className="h-4 w-4" />,
      status: f.pis.length > 0 ? "done" : "pending",
      summary: f.pis.length > 0 ? `${f.pis.length} PI(s)` : "No PI",
      detail: (
        <>
          {f.pis.length > 0 ? (
            <DetailGrid items={[
              ["PI Numbers", f.pis.map((p) => p.pi_number).join(", ")],
              ["Count", String(f.pis.length)],
              ["Latest", f.pis[0]?.pi_number || "—"],
              ["Date", fmtDate(f.pis[0]?.pi_date)],
            ]} />
          ) : (
            <EmptyDetail text="No PI converted yet." />
          )}
          <DetailActions>
            {f.current && (
              <Link to={`/orders/${f.current.id}`}><Button size="sm">Convert to PI</Button></Link>
            )}
            {f.pis.slice(0, 3).map((p) => (
              <Link key={p.id} to={`/pi/${p.id}`}><Button size="sm" variant="outline">{p.pi_number}</Button></Link>
            ))}
          </DetailActions>
        </>
      ),
      revisions: f.pis.map((p) => ({
        id: p.id, label: `R${p.revision ?? 0}`,
        sub: `${p.pi_number} · ${fmtDate(p.pi_date)} · ${p.format}`,
        href: `/pi/${p.id}`,
        current: !!p.is_current,
      })),
    },
    {
      id: 16, label: "Dispatch", icon: <Truck className="h-4 w-4" />,
      status: "pending",
      summary: "—",
      detail: <EmptyDetail text="Dispatch tracking will appear here once recorded." />,
      revisions: [],
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="text-base">{f.company}</CardTitle>
          <div className="text-xs text-muted-foreground font-mono">
            {f.current?.oa_number || (f.costSheetNumber ? `CS# ${f.costSheetNumber}` : "—")}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <HorizontalStageStrip stages={stages} globalRevisionsOpen={historyOpen} />
      </CardContent>
    </Card>
  );
}


// ============================================================================
// Horizontal Stage Strip
// ============================================================================

type StageStatus = "done" | "awaiting" | "pending";

interface RevisionItem {
  id: string;
  label: string;
  sub: string;
  href?: string;
  copyText?: string;
  copyLabel?: string;
  current?: boolean;
}

interface StageDef {
  id: number;
  label: string;
  icon: React.ReactNode;
  status: StageStatus;
  summary: string;
  detail: React.ReactNode;
  revisions: RevisionItem[];
}

function fmtShortINR(n: number): string {
  if (!n) return "—";
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(0)}k`;
  return `₹${n}`;
}

function HorizontalStageStrip({
  stages,
  globalRevisionsOpen,
}: {
  stages: StageDef[];
  globalRevisionsOpen: boolean;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [revisionsOpenId, setRevisionsOpenId] = useState<number | null>(null);

  useEffect(() => {
    if (globalRevisionsOpen && expandedId != null) {
      setRevisionsOpenId(expandedId);
    }
  }, [globalRevisionsOpen, expandedId]);

  const expanded = stages.find((s) => s.id === expandedId) || null;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto pb-2">
        <div className="flex items-stretch gap-1.5 min-w-min">
          {stages.map((s, i) => (
            <div key={s.id} className="flex items-stretch gap-1.5 shrink-0">
              <StageCard
                stage={s}
                expanded={expandedId === s.id}
                onToggle={() =>
                  setExpandedId((prev) => (prev === s.id ? null : s.id))
                }
                showRevisionsHint={globalRevisionsOpen}
              />
              {i < stages.length - 1 && (
                <div className="flex items-center text-muted-foreground shrink-0">
                  <ChevronRight className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {expanded && (
        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-background border grid place-items-center text-[11px] font-semibold tabular-nums">
              {expanded.id}
            </div>
            <div className="text-muted-foreground">{expanded.icon}</div>
            <div className="text-sm font-semibold">{expanded.label}</div>
            <StatusBadge status={expanded.status} />
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7"
              onClick={() => setExpandedId(null)}
            >
              <ChevronUp className="h-3.5 w-3.5 mr-1" />
              Close
            </Button>
          </div>
          <div>{expanded.detail}</div>
          {expanded.revisions.length > 0 && (
            <div className="pt-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() =>
                  setRevisionsOpenId((prev) =>
                    prev === expanded.id ? null : expanded.id,
                  )
                }
              >
                {revisionsOpenId === expanded.id ? (
                  <ChevronDown className="h-3.5 w-3.5 mr-1" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 mr-1" />
                )}
                Revisions ({expanded.revisions.length})
              </Button>
              {revisionsOpenId === expanded.id && (
                <RevisionsChips items={expanded.revisions} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StageCard({
  stage,
  expanded,
  onToggle,
  showRevisionsHint,
}: {
  stage: StageDef;
  expanded: boolean;
  onToggle: () => void;
  showRevisionsHint: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-44 shrink-0 rounded-md border bg-card p-2.5 text-left flex flex-col gap-1.5 transition-colors hover:bg-accent/50 ${
        expanded ? "ring-2 ring-primary" : ""
      }`}
    >
      <div className="flex items-center gap-1.5">
        <div className="h-6 w-6 rounded-full bg-muted grid place-items-center text-[11px] font-semibold tabular-nums shrink-0">
          {stage.id}
        </div>
        <div className="text-muted-foreground shrink-0">{stage.icon}</div>
        <div className="ml-auto">
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </div>
      <div className="text-xs font-medium leading-snug line-clamp-2">
        {stage.label}
      </div>
      <div className="flex items-center justify-between gap-1">
        <StatusBadge status={stage.status} />
        {showRevisionsHint && stage.revisions.length > 0 && (
          <Badge variant="outline" className="text-[9px] px-1 py-0">
            {stage.revisions.length} rev
          </Badge>
        )}
      </div>
      <div className="text-[11px] text-muted-foreground truncate">
        {stage.summary}
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: StageStatus }) {
  if (status === "done") {
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-[9px] px-1.5 py-0">
        Done
      </Badge>
    );
  }
  if (status === "awaiting") {
    return (
      <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
        Awaiting
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[9px] px-1.5 py-0">
      Pending
    </Badge>
  );
}

function DetailGrid({ items }: { items: [string, string | null | undefined][] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
      {items.map(([k, v], i) => (
        <div key={i} className="rounded border bg-card px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {k}
          </div>
          <div className="font-medium truncate">{v || "—"}</div>
        </div>
      ))}
    </div>
  );
}

function DetailActions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5 pt-2">{children}</div>;
}

function EmptyDetail({ text }: { text: string }) {
  return <div className="text-xs text-muted-foreground italic">{text}</div>;
}

function RevisionsChips({ items }: { items: RevisionItem[] }) {
  return (
    <div className="overflow-x-auto pt-1.5">
      <div className="flex items-center gap-1.5 min-w-min">
        {items.map((r, i) => (
          <div key={r.id} className="flex items-center gap-1.5 shrink-0">
            <div
              className={`rounded border bg-card px-2 py-1 text-[11px] flex items-center gap-1.5 ${
                r.current ? "border-primary" : ""
              }`}
            >
              <span className="font-mono font-semibold">{r.label}</span>
              <span className="text-muted-foreground">{r.sub}</span>
              {r.current && (
                <Badge variant="outline" className="text-[9px] px-1 py-0">
                  current
                </Badge>
              )}
              {r.href && (
                <Link to={r.href}>
                  <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px]">
                    Open
                  </Button>
                </Link>
              )}
              {r.copyText && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 px-1.5 text-[10px]"
                  onClick={() => copy(r.copyText!, r.copyLabel || "Link copied")}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              )}
            </div>
            {i < items.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
