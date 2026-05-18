import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchLatestCommentBaseline, diffItemsAgainstBaseline, type ItemDiff } from "@/lib/boq/designReview";
import type { BoqLineItem } from "@/lib/boq/types";

/** Shows a "Previous → Updated" comparison of the live BOQ items vs the
 *  snapshot captured when the latest Design Comment link was generated.
 *  Visible only when there is at least one differing field. */
export function PendingChangesPanel({ boqId, items, designReviewStatus }: { boqId: string | null; items: BoqLineItem[]; designReviewStatus: string }) {
  const [diffs, setDiffs] = useState<ItemDiff[]>([]);
  const [round, setRound] = useState<number | null>(null);

  const show =
    designReviewStatus === "review_received" ||
    designReviewStatus === "changes_required" ||
    designReviewStatus === "boq_updated";

  useEffect(() => {
    if (!boqId || !show) { setDiffs([]); setRound(null); return; }
    let alive = true;
    (async () => {
      const base = await fetchLatestCommentBaseline(boqId).catch(() => null);
      if (!alive) return;
      if (!base) { setDiffs([]); setRound(null); return; }
      setRound(base.round.round_no);
      setDiffs(diffItemsAgainstBaseline(base.items, items));
    })();
    return () => { alive = false; };
  }, [boqId, items, show]);

  if (!show || !diffs.length) return null;

  const totalFields = diffs.reduce((n, d) => n + d.changes.length, 0);

  return (
    <Card className="border-amber-500/40">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Pending Changes vs Last Design Comment{round ? ` (R${round})` : ""}</CardTitle>
          <Badge variant="outline" className="border-amber-500 text-amber-700">
            {totalFields} field{totalFields === 1 ? "" : "s"} across {diffs.length} item{diffs.length === 1 ? "" : "s"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Design will see this Previous → Updated comparison on the next Approval link.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-2 w-14">Item</th>
                <th className="p-2 w-36">Model</th>
                <th className="p-2 w-28">Field</th>
                <th className="p-2">Previous</th>
                <th className="p-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {diffs.map((d) =>
                d.changes.map((c, i) => (
                  <tr key={`${d.itemId}-${c.field}`} className="border-t align-top">
                    {i === 0 ? (
                      <>
                        <td className="p-2" rowSpan={d.changes.length}>{d.item_no}</td>
                        <td className="p-2 font-mono" rowSpan={d.changes.length}>{d.model_number}</td>
                      </>
                    ) : null}
                    <td className="p-2 font-medium">{c.label}</td>
                    <td className="p-2 whitespace-pre-wrap text-muted-foreground line-through opacity-80">{c.from || "—"}</td>
                    <td className="p-2 whitespace-pre-wrap text-foreground">{c.to || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}