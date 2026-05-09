import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BoqRecord, BoqLineItem } from "@/lib/boq/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The older / selected revision to compare from. */
  from: BoqRecord | null;
  /** The current revision to compare against. */
  to: BoqRecord | null;
}

type FieldDiff = { label: string; from: string; to: string };

const FIELDS: { key: keyof BoqRecord; label: string }[] = [
  { key: "boq_number", label: "BOQ Number" },
  { key: "revision", label: "Revision" },
  { key: "format", label: "Format" },
  { key: "status", label: "Status" },
  { key: "verification_status", label: "Verification" },
  { key: "reference_oa_number", label: "Reference OA" },
  { key: "project_number", label: "Project / Cost Sheet No." },
  { key: "client_name", label: "Client" },
  { key: "prepared_by", label: "Prepared By" },
  { key: "boq_date", label: "Date" },
  { key: "terms", label: "Terms & Conditions" },
  { key: "notes", label: "Notes" },
];

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return String(v);
  return String(v);
}

function keyOf(it: BoqLineItem): string {
  const m = (it.model_number || "").trim().toLowerCase();
  if (m) return `m:${m}`;
  return `d:${(it.description || "").trim().toLowerCase()}`;
}

function itemDiff(a: BoqLineItem, b: BoqLineItem) {
  const fields: { key: keyof BoqLineItem; label: string }[] = [
    { key: "model_number", label: "Model" },
    { key: "description", label: "Description" },
    { key: "quantity", label: "Qty" },
    { key: "unit", label: "Unit" },
    { key: "remarks", label: "Remarks" },
  ];
  return fields
    .map((f) => ({ label: f.label, from: fmt(a[f.key]), to: fmt(b[f.key]) }))
    .filter((d) => d.from !== d.to);
}

export function BoqCompareDialog({ open, onOpenChange, from, to }: Props) {
  const fieldDiffs = useMemo<FieldDiff[]>(() => {
    if (!from || !to) return [];
    return FIELDS
      .map((f) => ({ label: f.label, from: fmt(from[f.key]), to: fmt(to[f.key]) }))
      .filter((d) => d.from !== d.to);
  }, [from, to]);

  const itemDiffs = useMemo(() => {
    if (!from || !to) return { added: [], removed: [], changed: [] as { from: BoqLineItem; to: BoqLineItem; diffs: { label: string; from: string; to: string }[] }[] };
    const fromMap = new Map<string, BoqLineItem>();
    (from.line_items || []).forEach((it) => fromMap.set(keyOf(it), it));
    const toMap = new Map<string, BoqLineItem>();
    (to.line_items || []).forEach((it) => toMap.set(keyOf(it), it));
    const added: BoqLineItem[] = [];
    const removed: BoqLineItem[] = [];
    const changed: { from: BoqLineItem; to: BoqLineItem; diffs: { label: string; from: string; to: string }[] }[] = [];
    toMap.forEach((it, k) => {
      const prev = fromMap.get(k);
      if (!prev) added.push(it);
      else {
        const d = itemDiff(prev, it);
        if (d.length) changed.push({ from: prev, to: it, diffs: d });
      }
    });
    fromMap.forEach((it, k) => {
      if (!toMap.has(k)) removed.push(it);
    });
    return { added, removed, changed };
  }, [from, to]);

  const noChanges = fieldDiffs.length === 0 && itemDiffs.added.length === 0 && itemDiffs.removed.length === 0 && itemDiffs.changed.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compare BOQ Revisions</DialogTitle>
          <DialogDescription>
            {from && to ? (
              <span className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline">From: {from.boq_number} · R{from.revision ?? 0}</Badge>
                <span className="text-muted-foreground">→</span>
                <Badge variant="default">To: {to.boq_number} · R{to.revision ?? 0} (Current)</Badge>
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {!from || !to ? (
          <p className="text-sm text-muted-foreground">Select two revisions to compare.</p>
        ) : noChanges ? (
          <p className="text-sm text-muted-foreground py-4">No differences between these revisions.</p>
        ) : (
          <div className="space-y-6">
            {/* Header field diffs */}
            <section>
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2 font-semibold">
                Header Fields ({fieldDiffs.length})
              </h3>
              {fieldDiffs.length === 0 ? (
                <p className="text-xs text-muted-foreground">No header changes.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-48">Field</TableHead>
                      <TableHead>From (R{from.revision ?? 0})</TableHead>
                      <TableHead>To (R{to.revision ?? 0})</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fieldDiffs.map((d) => (
                      <TableRow key={d.label}>
                        <TableCell className="font-medium text-xs">{d.label}</TableCell>
                        <TableCell className="text-xs whitespace-pre-wrap text-destructive/90 line-through decoration-destructive/40">{d.from}</TableCell>
                        <TableCell className="text-xs whitespace-pre-wrap text-primary">{d.to}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>

            {/* Added items */}
            {itemDiffs.added.length > 0 && (
              <section>
                <h3 className="text-xs uppercase tracking-wider text-primary mb-2 font-semibold">
                  Items Added ({itemDiffs.added.length})
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-16">Qty</TableHead>
                      <TableHead className="w-16">Unit</TableHead>
                      <TableHead>Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemDiffs.added.map((it) => (
                      <TableRow key={it.id} className="bg-primary/5">
                        <TableCell className="text-xs">{it.item_no}</TableCell>
                        <TableCell className="font-mono text-xs">{it.model_number}</TableCell>
                        <TableCell className="text-xs whitespace-pre-wrap">{it.description}</TableCell>
                        <TableCell className="text-xs">{it.quantity}</TableCell>
                        <TableCell className="text-xs">{it.unit}</TableCell>
                        <TableCell className="text-xs whitespace-pre-wrap">{it.remarks}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            )}

            {/* Removed items */}
            {itemDiffs.removed.length > 0 && (
              <section>
                <h3 className="text-xs uppercase tracking-wider text-destructive mb-2 font-semibold">
                  Items Removed ({itemDiffs.removed.length})
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-16">Qty</TableHead>
                      <TableHead className="w-16">Unit</TableHead>
                      <TableHead>Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemDiffs.removed.map((it) => (
                      <TableRow key={it.id} className="bg-destructive/5">
                        <TableCell className="text-xs">{it.item_no}</TableCell>
                        <TableCell className="font-mono text-xs line-through">{it.model_number}</TableCell>
                        <TableCell className="text-xs whitespace-pre-wrap line-through">{it.description}</TableCell>
                        <TableCell className="text-xs">{it.quantity}</TableCell>
                        <TableCell className="text-xs">{it.unit}</TableCell>
                        <TableCell className="text-xs whitespace-pre-wrap">{it.remarks}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            )}

            {/* Changed items */}
            {itemDiffs.changed.length > 0 && (
              <section>
                <h3 className="text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2 font-semibold">
                  Items Changed ({itemDiffs.changed.length})
                </h3>
                <div className="space-y-3">
                  {itemDiffs.changed.map((c) => (
                    <div key={c.to.id} className="rounded-md border bg-card p-3">
                      <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
                        <Badge variant="outline">Item #{c.to.item_no}</Badge>
                        <span className="font-mono font-semibold">{c.to.model_number}</span>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-32">Field</TableHead>
                            <TableHead>From</TableHead>
                            <TableHead>To</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {c.diffs.map((d) => (
                            <TableRow key={d.label}>
                              <TableCell className="font-medium text-xs">{d.label}</TableCell>
                              <TableCell className="text-xs whitespace-pre-wrap text-destructive/90 line-through decoration-destructive/40">{d.from}</TableCell>
                              <TableCell className="text-xs whitespace-pre-wrap text-primary">{d.to}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}