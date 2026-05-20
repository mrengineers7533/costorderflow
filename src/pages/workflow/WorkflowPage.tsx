import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Search, Eye, EyeOff, ChevronDown, ChevronRight, FileSpreadsheet,
  FileText, ClipboardList, Link2, Send, RefreshCw, CheckCircle2, Share2, Receipt, Copy,
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
  current: OrderRecord;
  original: OrderRecord;
  mrOa: OrderRecord | null;
  gmsOa: OrderRecord | null;
  costSheet: CostSheetRow | null;
  boqs: BoqRecord[];
  currentBoq: BoqRecord | null;
  reviews: DesignReviewLite[];
  pis: PiRecord[];
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
    const csByFile = new Map<string, CostSheetRow>();
    for (const c of costSheets) {
      const ex = (c.extracted || {}) as Record<string, unknown>;
      const num = String((ex.cost_sheet_number || ex.number || "") as string).trim();
      if (num) csByNumber.set(num.toLowerCase(), c);
      if (c.original_filename) csByFile.set(c.original_filename.toLowerCase(), c);
    }

    const rows: Family[] = [];
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
      const cs = (() => {
        const num = (current.cost_sheet_number || "").trim().toLowerCase();
        if (num && csByNumber.has(num)) return csByNumber.get(num)!;
        return null;
      })();
      // MR vs GMS picks: use the latest revision of each format in the family
      const currentByFormat = (fmt: "MR" | "GMS"): OrderRecord | null => {
        const list = sorted.filter((o) => o.format === fmt);
        if (!list.length) return null;
        return list.find((o) => o.is_current !== false) || list[list.length - 1];
      };
      rows.push({
        rootId,
        company: current.company_name || current.bill_to?.name || "—",
        orders: sorted,
        current,
        original,
        mrOa: currentByFormat("MR"),
        gmsOa: currentByFormat("GMS"),
        costSheet: cs,
        boqs: famBoqs,
        currentBoq,
        reviews: famReviews,
        pis: famPis,
      });
    }
    rows.sort((a, b) => (b.current.order_date || "").localeCompare(a.current.order_date || ""));
    return rows;
  }, [orders, boqs, pis, costSheets, reviews]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return families.filter((f) => {
      if (q) {
        const hay = [
          f.company, f.current.oa_number, f.original.oa_number,
          f.current.cost_sheet_number,
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
  const csNumber = String((csEx.cost_sheet_number || csEx.number || f.current.cost_sheet_number || "") as string) || "—";
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

  const activity = useMemo(
    () => buildActivity(f, csNumber, csDate, csTotal, csTotalA, csTotalB, csClientScope),
    [f, csNumber, csDate, csTotal, csTotalA, csTotalB, csClientScope],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="text-base">{f.company}</CardTitle>
          <div className="text-xs text-muted-foreground font-mono">{f.current.oa_number}</div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activity Timeline</div>
            <div className="text-[11px] text-muted-foreground">{activity.length} event(s)</div>
          </div>
          <ActivityTimeline events={activity} showHistory={historyOpen} />
        </div>

        <Step n={1} icon={<FileSpreadsheet className="h-4 w-4" />} label="Cost Sheet Upload"
          done={!!f.costSheet}
          meta={[
            `CS#: ${csNumber}`,
            `Date: ${fmtDate(csDate)}`,
            csTotalA ? `Total A: ${fmtINR(csTotalA)}` : null,
            csTotalB ? `Total (Other B): ${fmtINR(csTotalB)}` : null,
            csTotal ? `Cost of Project (A+B): ${fmtINR(csTotal)}` : null,
            csClientScope ? `Client Scope: ${fmtINR(csClientScope)}` : null,
          ]} />

        <Step n={2} icon={<FileText className="h-4 w-4" />} label="MR OA"
          done={!!f.mrOa}
          meta={f.mrOa
            ? [f.mrOa.oa_number, `Date: ${fmtDate(f.mrOa.order_date)}`, `Basic: ${fmtINR(mrBasic)}`]
            : ["—"]}
          actions={f.mrOa ? <Link to={`/orders/${f.mrOa.id}`}><Button size="sm" variant="outline">Open</Button></Link> : null} />

        <Step n={3} icon={<FileText className="h-4 w-4" />} label="GMS OA"
          done={!!f.gmsOa}
          meta={f.gmsOa
            ? [f.gmsOa.oa_number, `Date: ${fmtDate(f.gmsOa.order_date)}`, `Amount: ${fmtINR(gmsAmt)}`]
            : ["—"]}
          actions={f.gmsOa ? <Link to={`/orders/${f.gmsOa.id}`}><Button size="sm" variant="outline">Open</Button></Link> : null} />

        <Step n={4} icon={<ClipboardList className="h-4 w-4" />} label="Auto BOQ"
          done={!!f.currentBoq}
          meta={f.currentBoq
            ? [f.currentBoq.boq_number, `Date: ${fmtDate(f.currentBoq.boq_date)}`, `R${f.currentBoq.revision ?? 0}`]
            : ["No BOQ yet"]}
          actions={f.currentBoq ? <Link to={`/boqs/${f.currentBoq.id}`}><Button size="sm" variant="outline">Open BOQ</Button></Link> : null} />

        <Step n={5} icon={<Send className="h-4 w-4" />} label="Design Link Sent"
          done={!!commentRound}
          meta={commentRound
            ? [`Round R${commentRound.round_no} (Comment)`, `Sent: ${fmtDateTime(commentRound.sent_at)}`]
            : ["Not generated yet"]}
          actions={commentRound
            ? <Button size="sm" variant="outline" onClick={() => copy(reviewLink(commentRound.token), "Comment link copied")}><Copy className="h-3.5 w-3.5 mr-1" />Copy Link</Button>
            : null} />

        <Step n={6} icon={<RefreshCw className="h-4 w-4" />} label="Design Link Returned"
          done={!!commentSubmitted}
          meta={commentSubmitted
            ? [`Submitted: ${fmtDateTime(commentSubmitted.submitted_at)}`, `Outcome: ${commentSubmitted.overall_outcome || "—"}`]
            : ["Awaiting Design Team"]} />

        <Step n={7} icon={<FileText className="h-4 w-4" />} label="Update OA"
          done={!!updatedOa}
          meta={updatedOa
            ? [`${updatedOa.oa_number}`, `Revisions: R${updatedOa.revision ?? 0}`]
            : ["No revision yet"]}
          actions={updatedOa ? <Link to={`/orders/${updatedOa.id}`}><Button size="sm" variant="outline">Open Updated OA</Button></Link> : null} />

        <Step n={8} icon={<Link2 className="h-4 w-4" />} label="Send Updated OA for Design Approval"
          done={!!approvalRound}
          meta={approvalRound
            ? [
                `Round R${approvalRound.round_no} (Approval)`,
                `Sent: ${fmtDateTime(approvalRound.sent_at)}`,
                approvalSubmitted
                  ? `Submitted: ${fmtDateTime(approvalSubmitted.submitted_at)} · ${approvalSubmitted.overall_outcome || "—"}`
                  : `Status: Awaiting`,
              ]
            : ["Not generated yet"]}
          actions={approvalRound
            ? <Button size="sm" variant="outline" onClick={() => copy(reviewLink(approvalRound.token), "Approval link copied")}><Copy className="h-3.5 w-3.5 mr-1" />Copy Link</Button>
            : null} />

        <Step n={9} icon={<CheckCircle2 className="h-4 w-4" />} label="After Approval"
          done={approved}
          meta={approved
            ? [`OA revised`, revisedBoq ? `BOQ ${revisedBoq.boq_number} (R${revisedBoq.revision ?? 0})` : "BOQ auto-revised"]
            : ["Pending design approval"]}
          actions={approved && revisedBoq ? <Link to={`/boqs/${revisedBoq.id}`}><Button size="sm" variant="outline">Open Revised BOQ</Button></Link> : null} />

        <Step n={10} icon={<Share2 className="h-4 w-4" />} label="Send Links (Purchase & Manufacturing)"
          done={!!finalToken}
          meta={finalToken ? ["Final BOQ link active"] : ["Not sent yet"]}
          actions={finalToken
            ? <Button size="sm" variant="outline" onClick={() => copy(finalBoqLink(finalToken), "Final BOQ link copied")}><Copy className="h-3.5 w-3.5 mr-1" />Copy Final Link</Button>
            : null} />

        <Step n={11} icon={<Receipt className="h-4 w-4" />} label="PI Convert"
          done={f.pis.length > 0}
          meta={f.pis.length
            ? [f.pis.map((p) => p.pi_number).join(", "), `${f.pis.length} PI(s)`]
            : ["No PI yet"]}
          actions={
            <div className="flex gap-1">
              {f.pis.slice(0, 3).map((p) => (
                <Link key={p.id} to={`/pi/${p.id}`}><Button size="sm" variant="outline">{p.pi_number}</Button></Link>
              ))}
              <Link to={`/orders/${f.current.id}`}><Button size="sm">Convert to PI</Button></Link>
            </div>
          } />

        <HistorySection family={f} defaultOpen={historyOpen} />
      </CardContent>
    </Card>
  );
}

type ActivityEvent = {
  id: string;
  ts: string;
  icon: React.ReactNode;
  title: string;
  details: (string | null | undefined)[];
  status?: { label: string; tone: "ok" | "warn" | "muted" };
  href?: string;
  copyText?: string;
  copyLabel?: string;
  isHistory?: boolean;
};

function buildActivity(
  f: Family,
  csNumber: string,
  csDate: string | undefined,
  csTotal: number,
  csTotalA = 0,
  csTotalB = 0,
  csClientScope = 0,
): ActivityEvent[] {
  const evs: ActivityEvent[] = [];

  if (f.costSheet) {
    evs.push({
      id: `cs-${f.costSheet.id}`,
      ts: f.costSheet.created_at,
      icon: <FileSpreadsheet className="h-4 w-4" />,
      title: "Cost Sheet uploaded",
      details: [
        `CS#: ${csNumber}`,
        `CS Date: ${fmtDate(csDate)}`,
        csTotalA ? `Total A: ${fmtINR(csTotalA)}` : null,
        csTotalB ? `Total (Other B): ${fmtINR(csTotalB)}` : null,
        csTotal ? `Cost of Project (A+B): ${fmtINR(csTotal)}` : null,
        csClientScope ? `Client Scope: ${fmtINR(csClientScope)}` : null,
        `File: ${f.costSheet.original_filename}`,
      ],
      status: { label: "Uploaded", tone: "ok" },
    });
  }

  // Each OA creation / revision (chronological)
  for (const o of f.orders) {
    const amt = o.totals?.net_payable || o.totals?.subtotal || 0;
    const isRev = (o.revision ?? 0) > 0;
    evs.push({
      id: `oa-${o.id}`,
      ts: o.created_at || o.order_date,
      icon: <FileText className="h-4 w-4" />,
      title: isRev
        ? `${o.format} OA revised to R${o.revision}`
        : `${o.format} OA created`,
      details: [o.oa_number, `Date: ${fmtDate(o.order_date)}`, amt ? `Amount: ${fmtINR(amt)}` : null],
      status: { label: o.is_current ? "Current" : `R${o.revision ?? 0}`, tone: o.is_current ? "ok" : "muted" },
      href: `/orders/${o.id}`,
      isHistory: isRev && !o.is_current,
    });
  }

  // Each BOQ creation / revision
  for (const b of f.boqs) {
    const isRev = (b.revision ?? 0) > 0;
    evs.push({
      id: `boq-${b.id}`,
      ts: b.created_at || b.boq_date,
      icon: <ClipboardList className="h-4 w-4" />,
      title: isRev ? `BOQ auto-revised to R${b.revision}` : "BOQ auto-generated",
      details: [b.boq_number, `Date: ${fmtDate(b.boq_date)}`, `Status: ${b.status}`],
      status: { label: b.is_current ? "Current" : `R${b.revision ?? 0}`, tone: b.is_current ? "ok" : "muted" },
      href: `/boqs/${b.id}`,
      isHistory: isRev && !b.is_current,
    });
    const fst = (b as unknown as { final_share_token?: string | null; final_sent_at?: string | null });
    if (fst.final_sent_at) {
      evs.push({
        id: `boq-final-${b.id}`,
        ts: fst.final_sent_at,
        icon: <Share2 className="h-4 w-4" />,
        title: "Final BOQ link sent (Purchase & Manufacturing)",
        details: [b.boq_number, fst.final_share_token ? "Share link active" : null],
        status: { label: "Sent", tone: "ok" },
        copyText: fst.final_share_token ? finalBoqLink(fst.final_share_token) : undefined,
        copyLabel: "Final BOQ link copied",
        href: `/boqs/${b.id}`,
        isHistory: !b.is_current,
      });
    }
  }

  // Each design review: sent + submitted as separate events
  for (const r of f.reviews) {
    const isCommentR1 = r.kind === "comment" && r.round_no === 1;
    const kindLabel = r.kind === "approval" ? "Approval" : "Comment";
    evs.push({
      id: `dr-sent-${r.id}`,
      ts: r.sent_at,
      icon: <Send className="h-4 w-4" />,
      title: r.kind === "approval"
        ? `OA sent for Design Approval (R${r.round_no})`
        : `Design ${kindLabel} link sent (R${r.round_no})`,
      details: [`Round R${r.round_no}`, `Expires: ${fmtDate(r.expires_at)}`],
      status: { label: r.status === "submitted" ? "Submitted" : "Sent", tone: r.status === "submitted" ? "ok" : "warn" },
      copyText: reviewLink(r.token),
      copyLabel: `${kindLabel} link copied`,
      isHistory: !isCommentR1 && r.kind === "comment" && r.round_no > 1,
    });
    if (r.submitted_at) {
      evs.push({
        id: `dr-sub-${r.id}`,
        ts: r.submitted_at,
        icon: <RefreshCw className="h-4 w-4" />,
        title: r.kind === "approval"
          ? (r.overall_outcome === "approved" ? `Design Approval received (R${r.round_no})` : `Design Approval response (R${r.round_no})`)
          : `Design Team submitted comments (R${r.round_no})`,
        details: [`Outcome: ${r.overall_outcome || "—"}`],
        status: {
          label: r.overall_outcome === "approved" ? "Approved" : (r.overall_outcome || "Submitted"),
          tone: r.overall_outcome === "approved" ? "ok" : "warn",
        },
        isHistory: !isCommentR1 && r.kind === "comment" && r.round_no > 1,
      });
    }
  }

  // PIs
  for (const p of f.pis) {
    const isRev = (p.revision ?? 0) > 0;
    const amt = p.totals?.net_payable || p.totals?.subtotal || 0;
    evs.push({
      id: `pi-${p.id}`,
      ts: p.created_at || p.pi_date,
      icon: <Receipt className="h-4 w-4" />,
      title: isRev ? `PI revised to R${p.revision}` : "Converted to PI",
      details: [p.pi_number, `Date: ${fmtDate(p.pi_date)}`, amt ? `Amount: ${fmtINR(amt)}` : null],
      status: { label: p.is_current ? "Current" : `R${p.revision ?? 0}`, tone: p.is_current ? "ok" : "muted" },
      href: `/pi/${p.id}`,
      isHistory: isRev && !p.is_current,
    });
  }

  evs.sort((a, b) => (a.ts || "").localeCompare(b.ts || ""));
  return evs;
}

function ActivityTimeline({ events, showHistory }: { events: ActivityEvent[]; showHistory: boolean }) {
  const visible = showHistory ? events : events.filter((e) => !e.isHistory);
  const hiddenCount = events.length - visible.length;
  if (!visible.length) return <p className="text-xs text-muted-foreground">No activity yet.</p>;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto pb-2">
        <div className="flex items-stretch gap-2 min-w-min">
          {visible.map((e, i) => (
            <div key={e.id} className="flex items-stretch gap-2 shrink-0">
              <div className="w-64 shrink-0 rounded-md border bg-card p-2.5 flex flex-col">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-muted grid place-items-center text-muted-foreground shrink-0">
                    <span className="text-[11px] font-semibold tabular-nums">{i + 1}</span>
                  </div>
                  <div className="text-muted-foreground">{e.icon}</div>
                  {e.status && (
                    <Badge
                      variant={e.status.tone === "ok" ? "default" : e.status.tone === "warn" ? "secondary" : "outline"}
                      className={`ml-auto ${e.status.tone === "ok" ? "bg-emerald-600 hover:bg-emerald-600" : ""}`}
                    >
                      {e.status.label}
                    </Badge>
                  )}
                </div>
                <div className="mt-2 text-sm font-medium leading-snug">{e.title}</div>
                <div className="text-[11px] text-muted-foreground">{fmtDateTime(e.ts)}</div>
                {e.details.filter(Boolean).length > 0 && (
                  <div className="mt-1.5 flex flex-col gap-0.5 text-xs text-muted-foreground">
                    {e.details.filter(Boolean).map((d, idx) => <span key={idx} className="truncate">{d}</span>)}
                  </div>
                )}
                {(e.copyText || e.href) && (
                  <div className="mt-2 flex items-center gap-1.5">
                    {e.copyText && (
                      <Button size="sm" variant="outline" className="h-7" onClick={() => copy(e.copyText!, e.copyLabel || "Link copied")}>
                        <Copy className="h-3.5 w-3.5 mr-1" />Copy
                      </Button>
                    )}
                    {e.href && <Link to={e.href}><Button size="sm" variant="outline" className="h-7">Open</Button></Link>}
                  </div>
                )}
              </div>
              {i < visible.length - 1 && (
                <div className="flex items-center text-muted-foreground shrink-0">
                  <ChevronRight className="h-5 w-5" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {!showHistory && hiddenCount > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {hiddenCount} revision/historical entr{hiddenCount === 1 ? "y" : "ies"} hidden. Use "Show Revision History" to view.
        </p>
      )}
    </div>
  );
}

function Step({
  n, icon, label, meta, actions, done,
}: {
  n: number;
  icon: React.ReactNode;
  label: string;
  meta: (string | null | undefined)[];
  actions?: React.ReactNode;
  done: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-md border bg-card p-3">
      <div className="flex items-center gap-2 min-w-[200px]">
        <div className="h-6 w-6 rounded-full bg-muted grid place-items-center text-[11px] font-semibold tabular-nums">{n}</div>
        <div className="text-muted-foreground">{icon}</div>
        <div className="text-sm font-medium">{label}</div>
      </div>
      <div className="flex-1 min-w-[220px] text-xs text-muted-foreground space-y-0.5">
        {meta.filter(Boolean).map((m, i) => <div key={i}>{m}</div>)}
      </div>
      <div className="flex items-center gap-2">
        {done
          ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Done</Badge>
          : <Badge variant="secondary">Pending</Badge>}
        {actions}
      </div>
    </div>
  );
}

function HistorySection({ family, defaultOpen }: { family: Family; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => { setOpen(defaultOpen); }, [defaultOpen]);
  const f = family;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs">
          {open ? <ChevronDown className="h-3.5 w-3.5 mr-1" /> : <ChevronRight className="h-3.5 w-3.5 mr-1" />}
          Revision History
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-2">
        <HistoryList title="OA revisions" rows={f.orders.map((o) => ({
          id: o.id, label: o.oa_number, sub: `R${o.revision ?? 0} · ${fmtDate(o.order_date)} · ${o.format}`,
          href: `/orders/${o.id}`,
          tag: o.is_current ? "current" : undefined,
        }))} />
        <HistoryList title="BOQ revisions" rows={f.boqs.map((b) => ({
          id: b.id, label: b.boq_number, sub: `R${b.revision ?? 0} · ${fmtDate(b.boq_date)} · ${b.status}`,
          href: `/boqs/${b.id}`,
          tag: b.is_current ? "current" : undefined,
        }))} />
        <HistoryList title="Design review rounds" rows={f.reviews.map((r) => ({
          id: r.id,
          label: `R${r.round_no} · ${r.kind === "approval" ? "Approval" : "Comment"}`,
          sub: `Sent ${fmtDateTime(r.sent_at)}${r.submitted_at ? ` · Submitted ${fmtDateTime(r.submitted_at)}` : ""}${r.overall_outcome ? ` · ${r.overall_outcome}` : ""}`,
        }))} />
        <HistoryList title="PI history" rows={f.pis.map((p) => ({
          id: p.id, label: p.pi_number, sub: `R${p.revision ?? 0} · ${fmtDate(p.pi_date)} · ${p.format}`,
          href: `/pi/${p.id}`,
          tag: p.is_current ? "current" : undefined,
        }))} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function HistoryList({
  title, rows,
}: { title: string; rows: { id: string; label: string; sub: string; href?: string; tag?: string }[] }) {
  if (!rows.length) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{title}</div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 rounded border bg-card px-2 py-1.5 text-xs">
            <div className="min-w-0">
              <div className="font-mono truncate">{r.label} {r.tag && <Badge variant="outline" className="ml-1 text-[9px]">current</Badge>}</div>
              <div className="text-muted-foreground truncate">{r.sub}</div>
            </div>
            {r.href && <Link to={r.href}><Button size="sm" variant="ghost">Open</Button></Link>}
          </div>
        ))}
      </div>
    </div>
  );
}