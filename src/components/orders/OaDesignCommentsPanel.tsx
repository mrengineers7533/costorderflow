import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, MessageSquare, Pencil } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { LineItem } from "@/lib/orders/types";
import type { BoqRecord, BoqLineItem } from "@/lib/boq/types";

// Design column → OA LineItem field
const COL_MAP: Record<string, keyof LineItem | undefined> = {
  model_number: "model",
  description: "description",
  quantity: "quantity",
  unit: "unit",
  motor: "motor",
  motor_quantity: "motor_quantity",
  remarks: "remarks",
};

const COL_LABEL: Record<string, string> = {
  model_number: "Model",
  description: "Description",
  quantity: "Qty",
  unit: "Unit",
  motor: "Motor",
  motor_quantity: "Motor Qty",
  remarks: "Remarks",
};

interface DCRow {
  id: string;
  boq_id: string;
  boq_item_id: string;
  column_key: string | null;
  comment: string;
  user_name: string | null;
  department: string | null;
  created_at: string;
  applied_to_oa_at: string | null;
}

function norm(s: string | null | undefined): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function findOaIndex(items: LineItem[], boqItem: BoqLineItem | undefined, fallbackIdx: number): number {
  if (!boqItem) return -1;
  let idx = items.findIndex((r) => r.id === boqItem.id);
  if (idx >= 0) return idx;
  const key = norm(boqItem.description);
  if (key) idx = items.findIndex((r) => norm(r.description) === key);
  if (idx >= 0) return idx;
  return fallbackIdx < items.length ? fallbackIdx : -1;
}

export function OaDesignCommentsPanel({
  currentBoq,
  oaNumber,
  items,
  setItems,
  orderId,
}: {
  currentBoq: BoqRecord | null;
  oaNumber: string;
  items: LineItem[];
  setItems: (next: LineItem[]) => void;
  orderId: string | null;
}) {
  const [comments, setComments] = useState<DCRow[]>([]);

  async function load() {
    if (!currentBoq?.id) { setComments([]); return; }
    const { data } = await supabase
      .from("boq_design_comments" as never)
      .select("id,boq_id,boq_item_id,column_key,comment,user_name,department,created_at,applied_to_oa_at")
      .eq("boq_id", currentBoq.id)
      .order("created_at", { ascending: false });
    setComments(((data || []) as unknown) as DCRow[]);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentBoq?.id]);

  const boqItemsById = useMemo(() => {
    const m = new Map<string, { it: BoqLineItem; idx: number }>();
    (currentBoq?.line_items || []).forEach((it, idx) => m.set(it.id, { it, idx }));
    return m;
  }, [currentBoq]);

  if (!currentBoq || comments.length === 0) return null;

  async function applyComment(row: DCRow) {
    const ref = boqItemsById.get(row.boq_item_id);
    const oaField = row.column_key ? COL_MAP[row.column_key] : undefined;
    if (!ref || !oaField) {
      toast({ title: "Cannot auto-apply", description: "Please make the change manually.", variant: "destructive" });
      return;
    }
    const idx = findOaIndex(items, ref.it, ref.idx);
    if (idx < 0) {
      toast({ title: "Matching OA item not found", variant: "destructive" });
      return;
    }
    const next = items.slice();
    const value: unknown = (oaField === "quantity" || oaField === "motor_quantity")
      ? Number(row.comment.replace(/[^\d.-]/g, "")) || 0
      : row.comment;
    (next[idx] as Record<string, unknown>)[oaField as string] = value;
    setItems(next);
    try {
      await supabase.rpc("apply_design_comment_to_oa" as never, {
        _comment_id: row.id, _oa_id: orderId, _applied_value: row.comment,
      } as never);
    } catch { /* audit best-effort */ }
    toast({ title: "Applied to editor", description: "Review and Save / Revise to publish." });
    await load();
  }

  function manualFocus(row: DCRow) {
    const ref = boqItemsById.get(row.boq_item_id);
    if (!ref) return;
    const idx = findOaIndex(items, ref.it, ref.idx);
    const el = document.querySelector(`[data-oa-row-index="${idx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.classList.add("ring-2", "ring-primary");
    setTimeout(() => el?.classList.remove("ring-2", "ring-primary"), 1500);
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          Design Comments on linked BOQ
          <Badge variant="outline">{currentBoq.boq_number}</Badge>
          <Badge variant="secondary">{comments.length}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Click <b>Apply</b> to write the suggested value into the matching OA item, or <b>Manual</b> to jump to that row. Then Save / Revise to trigger the OA revision and auto-BOQ revise.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Item</TableHead>
              <TableHead className="w-24">Field</TableHead>
              <TableHead>Current OA value</TableHead>
              <TableHead>Design comment</TableHead>
              <TableHead className="w-40">By</TableHead>
              <TableHead className="w-44 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comments.map((c) => {
              const ref = boqItemsById.get(c.boq_item_id);
              const oaField = c.column_key ? COL_MAP[c.column_key] : undefined;
              const oaIdx = ref ? findOaIndex(items, ref.it, ref.idx) : -1;
              const cur = oaIdx >= 0 && oaField
                ? (items[oaIdx] as Record<string, unknown>)[oaField as string]
                : undefined;
              return (
                <TableRow key={c.id}>
                  <TableCell>{ref?.it.item_no ?? "—"}</TableCell>
                  <TableCell className="font-medium">{c.column_key ? COL_LABEL[c.column_key] || c.column_key : "Row"}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-pre-wrap">{cur == null || cur === "" ? "—" : String(cur)}</TableCell>
                  <TableCell className="whitespace-pre-wrap">{c.comment}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.user_name || "User"}{c.department ? ` · ${c.department}` : ""}<br />
                    {new Date(c.created_at).toLocaleString()}
                    {c.applied_to_oa_at && (
                      <div className="text-emerald-600 flex items-center gap-1 mt-1">
                        <CheckCircle2 className="h-3 w-3" /> Applied {new Date(c.applied_to_oa_at).toLocaleDateString()}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="outline" onClick={() => applyComment(c)} disabled={!oaField || oaIdx < 0}>
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Apply
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => manualFocus(c)} disabled={oaIdx < 0}>
                        <Pencil className="h-3 w-3 mr-1" /> Manual
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <p className="text-[11px] text-muted-foreground mt-2">
          Applying a comment only updates the editor — it does not auto-save. Use the existing Save / Revise button to run the OA revision and auto BOQ revision.
        </p>
      </CardContent>
    </Card>
  );
}
