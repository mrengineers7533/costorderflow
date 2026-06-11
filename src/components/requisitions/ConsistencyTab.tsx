import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle2, MinusCircle } from "lucide-react";
import { loadConsistencyForRequisition, type ConsistencyRow } from "@/lib/requisition/consistency";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border bg-muted/30 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}

function StatusBadge({ kind, delta }: { kind: "match" | "mismatch" | "na"; delta?: number }) {
  if (kind === "na") return <Badge variant="outline" className="gap-1"><MinusCircle className="h-3 w-3" />Not Applicable</Badge>;
  if (kind === "match") return <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600 text-white"><CheckCircle2 className="h-3 w-3" />Matched</Badge>;
  return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Mismatch{typeof delta === "number" && delta !== 0 ? ` (${delta > 0 ? "+" : ""}${delta})` : ""}</Badge>;
}

export default function ConsistencyTab({ requisitionId }: { requisitionId: string }) {
  const [row, setRow] = useState<ConsistencyRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { setRow(await loadConsistencyForRequisition(requisitionId)); } finally { setLoading(false); }
    })();
  }, [requisitionId]);

  if (loading) return <div className="py-6 text-sm text-muted-foreground">Loading consistency…</div>;
  if (!row) return <div className="py-6 text-sm text-muted-foreground">No consistency data.</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">Counts Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Stat label="OA / BOQ" value={row.boqRef} />
            <Stat label="BOQ Items" value={row.boqCount ?? "N/A"} />
            <Stat label="Requisition FG Items" value={row.fgCount} />
            <Stat label="Raw Material Total" value={row.rmTotal} />
            <Stat label="Annexure Created / Pending" value={`${row.annexCreated} / ${row.annexPending}`} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">Checks</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between border rounded px-3 py-2">
            <div className="text-sm">
              <div className="font-medium">BOQ Items = Requisition Finished Goods</div>
              <div className="text-xs text-muted-foreground">
                {row.boqVsFg === "na"
                  ? "General requisition — no BOQ reference. Not applicable."
                  : `BOQ ${row.boqCount} · FG ${row.fgCount}`}
              </div>
            </div>
            <StatusBadge kind={row.boqVsFg} delta={row.boqVsFgDelta} />
          </div>

          <div className="flex items-center justify-between border rounded px-3 py-2">
            <div className="text-sm">
              <div className="font-medium">Raw Material Total = Annexure Created + Not Created</div>
              <div className="text-xs text-muted-foreground">
                Total {row.rmTotal} · Created {row.annexCreated} · Not Created {row.annexPending}
              </div>
            </div>
            <StatusBadge kind={row.rmVsAnnex} delta={row.rmVsAnnexDelta} />
          </div>

          {row.boqVsFg === "mismatch" && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>BOQ ↔ FG mismatch</AlertTitle>
              <AlertDescription>
                BOQ has {row.boqCount} items but Requisition has {row.fgCount} Finished Goods
                ({row.boqVsFgDelta > 0 ? `+${row.boqVsFgDelta} extra in FG` : `${Math.abs(row.boqVsFgDelta)} missing from FG`}).
              </AlertDescription>
            </Alert>
          )}
          {row.rmVsAnnex === "mismatch" && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>RM ↔ Annexure mismatch</AlertTitle>
              <AlertDescription>
                Raw material total {row.rmTotal} does not equal Created ({row.annexCreated}) + Not Created ({row.annexPending}).
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}