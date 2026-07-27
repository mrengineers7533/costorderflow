import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ClipboardList, Loader2 } from "lucide-react";
import type { RequisitionRecord } from "@/lib/requisition/types";

interface Props {
  requisition: RequisitionRecord;
}

/**
 * Header action on the Requisition detail page: pick this requisition (always
 * included) plus any related requisitions, then open the existing Planning
 * page (`/requisitions/plan?ids=…`) which handles lots, reports and Annexure
 * generation. Purely a navigation helper — no data is changed here.
 */
export function CreatePlanningDialog({ requisition }: Props) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<RequisitionRecord[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set([requisition.id]));
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      let query = supabase
        .from("requisitions")
        .select("*")
        .is("superseded_by_id", null)
        .order("requisition_number", { ascending: true });
      if (requisition.order_root_id) {
        query = query.eq("order_root_id", requisition.order_root_id);
      } else if (requisition.boq_id) {
        query = query.eq("boq_id", requisition.boq_id);
      } else if (requisition.family_token) {
        query = query.eq("family_token", requisition.family_token);
      } else {
        query = query.eq("id", requisition.id);
      }
      const { data } = await query;
      if (cancelled) return;
      const list = (data || []) as RequisitionRecord[];
      setRows(
        list.some((r) => r.id === requisition.id) ? list : [requisition, ...list],
      );
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, requisition]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => (r.requisition_number || "").toLowerCase().includes(t));
  }, [rows, q]);

  function toggle(id: string) {
    if (id === requisition.id) return; // current requisition is always included
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function go() {
    const ids = [requisition.id, ...Array.from(selected).filter((i) => i !== requisition.id)];
    setOpen(false);
    nav(`/requisitions/plan?ids=${ids.join(",")}`);
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ClipboardList className="mr-1 h-4 w-4" />Create Planning
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Planning</DialogTitle>
            <DialogDescription>
              Select one or more requisitions. Planning opens with the selected
              requisitions, where you can create the Annexure.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Search requisition number…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8"
          />
          <div className="max-h-72 overflow-y-auto rounded border divide-y">
            {loading ? (
              <div className="py-6 flex items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No requisitions found.</div>
            ) : filtered.map((r) => {
              const isCurrent = r.id === requisition.id;
              return (
                <label
                  key={r.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                >
                  <Checkbox
                    checked={isCurrent || selected.has(r.id)}
                    disabled={isCurrent}
                    onCheckedChange={() => toggle(r.id)}
                  />
                  <span className="font-medium flex-1 truncate">{r.requisition_number}</span>
                  {r.boq_revision != null && <Badge variant="secondary">R{r.boq_revision}</Badge>}
                  <Badge variant="outline">{r.status}</Badge>
                  {isCurrent && <Badge>Current</Badge>}
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={go} disabled={loading}>
              Create Planning ({selected.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default CreatePlanningDialog;