import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Eye } from "lucide-react";
import { fetchRevisions, statusLabel, type BoqRevisionRow } from "@/lib/boq/designReview";

export function RevisionsTable({ boqId, currentLabel }: { boqId: string | null; currentLabel: string }) {
  const [rows, setRows] = useState<BoqRevisionRow[]>([]);
  const [open, setOpen] = useState<BoqRevisionRow | null>(null);

  useEffect(() => {
    if (!boqId) return;
    fetchRevisions(boqId).then(setRows).catch(() => setRows([]));
  }, [boqId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">BOQ Versions</CardTitle>
        <p className="text-xs text-muted-foreground">
          Every time the BOQ is updated and resent to Design, a new revision is recorded here.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-2">Version</th>
                <th className="p-2">Date</th>
                <th className="p-2">Link Type</th>
                <th className="p-2">Status at snapshot</th>
                <th className="p-2">Reviewer outcome</th>
                <th className="p-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t bg-primary/5">
                <td className="p-2 font-semibold">{currentLabel} <Badge className="ml-1">Current</Badge></td>
                <td className="p-2">—</td>
                <td className="p-2">—</td>
                <td className="p-2">Live</td>
                <td className="p-2">—</td>
                <td className="p-2"></td>
              </tr>
              {rows.map((r) => {
                const note = (r.snapshot_note || "").toLowerCase();
                const kind = note.includes("approval") ? "Approval" : note.includes("comment") ? "Comment" : (r.round_no ? `R${r.round_no}` : "—");
                return (
                <tr key={r.id} className="border-t">
                  <td className="p-2 font-mono">{r.revision_label}</td>
                  <td className="p-2">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="p-2">{kind}</td>
                  <td className="p-2">{statusLabel(r.design_review_status)}</td>
                  <td className="p-2">{r.reviewer_outcome || "—"}</td>
                  <td className="p-2"><Button size="sm" variant="outline" onClick={() => setOpen(r)}><Eye className="h-3 w-3 mr-1" />View</Button></td>
                </tr>
                );
              })}
              {!rows.length && (
                <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">No previous revisions yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Version {open?.revision_label} (read-only)</DialogTitle>
          </DialogHeader>
          {open && <RevisionView row={open} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function RevisionView({ row }: { row: BoqRevisionRow }) {
  const items = (row.line_items || []) as Array<{ id?: string; item_no?: string; model_number?: string; description?: string; quantity?: number; unit?: string; remarks?: string }>;
  const reviews = (row.review_items || []) as Array<{ boq_item_id: string; decision: string; comment?: string; design_change_note?: string }>;
  const byId = new Map(reviews.map((r) => [r.boq_item_id, r]));
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Snapshot taken {new Date(row.created_at).toLocaleString()} · Status: {statusLabel(row.design_review_status)}
        {row.reviewer_outcome ? ` · Outcome: ${row.reviewer_outcome}` : ""}
      </div>
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr className="text-left">
            <th className="p-2">#</th><th className="p-2">Model</th><th className="p-2">Description</th>
            <th className="p-2">Qty</th><th className="p-2">Remarks</th><th className="p-2">Design</th>
          </tr>
        </thead>
        <tbody>
          {sortByItemNo(items).map((it, i) => {
            const r = byId.get(it.id || "");
            return (
              <tr key={i} className="border-t align-top">
                <td className="p-2">{it.item_no || i + 1}</td>
                <td className="p-2 font-mono">{it.model_number}</td>
                <td className="p-2 whitespace-pre-wrap">{it.description}</td>
                <td className="p-2">{it.quantity}</td>
                <td className="p-2 whitespace-pre-wrap">{it.remarks}</td>
                <td className="p-2">
                  {r ? (
                    <>
                      <div className="font-medium">{r.decision}</div>
                      {r.comment && <div className="text-muted-foreground whitespace-pre-wrap">{r.comment}</div>}
                    </>
                  ) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
