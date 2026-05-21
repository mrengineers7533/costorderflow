import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import type { BoqRecord, BoqLineItem } from "@/lib/boq/types";
import { firstLine } from "@/lib/requisition/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  boq: BoqRecord;
}

type MapInfo = { is_direct_purchase: boolean; rm_count: number; matched_model: string };

export function CreateRequisitionDialog({ open, onOpenChange, boq }: Props) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [mapInfo, setMapInfo] = useState<Record<string, MapInfo>>({});
  const [loadingMap, setLoadingMap] = useState(false);
  const navigate = useNavigate();

  const items: BoqLineItem[] = useMemo(
    () => Array.isArray(boq.line_items) ? boq.line_items : [],
    [boq.line_items],
  );

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoadingMap(true);
      // Load whole master so we can fuzzy match against Column A
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("fg_raw_material_map")
        .select("model_number, is_direct_purchase, raw_materials");
      const all = (data as Array<{ model_number: string; is_direct_purchase: boolean; raw_materials: unknown[] }>) || [];
      // normalize Column A to first line for matching + display
      const cleaned = all.map((m) => ({ ...m, model_number: firstLine(m.model_number) || m.model_number }));
      const info: Record<string, MapInfo> = {};
      for (const it of items) {
        const mn = (it.model_number || "").trim().toLowerCase();
        const desc = (it.description || "").trim().slice(0, 40).toLowerCase();
        let match = mn ? cleaned.find((m) => m.model_number.toLowerCase() === mn) : undefined;
        if (!match && mn) match = cleaned.find((m) => m.model_number.toLowerCase().includes(mn));
        if (!match && desc) match = cleaned.find((m) => m.model_number.toLowerCase().includes(desc));
        if (match) {
          info[it.id] = {
            is_direct_purchase: !!match.is_direct_purchase,
            rm_count: Array.isArray(match.raw_materials) ? match.raw_materials.length : 0,
            matched_model: match.model_number,
          };
        }
      }
      setMapInfo(info);
      // default selection: everything except direct purchase
      const sel: Record<string, boolean> = {};
      for (const it of items) {
        const m = info[it.id];
        sel[it.id] = !(m?.is_direct_purchase);
      }
      setSelected(sel);
      setLoadingMap(false);
    })();
  }, [open, items]);

  function statusFor(it: BoqLineItem): { label: string; tone: "default" | "secondary" | "destructive" | "outline" } {
    const m = mapInfo[it.id];
    if (m?.is_direct_purchase) return { label: "Direct Purchase", tone: "secondary" };
    if (m && m.rm_count > 0) return { label: `Mapped · ${m.rm_count} RM`, tone: "default" };
    return { label: "Mapping Not Found", tone: "outline" };
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;

  function toggleAll(value: boolean) {
    const sel: Record<string, boolean> = {};
    for (const it of items) sel[it.id] = value;
    setSelected(sel);
  }

  async function create() {
    const ids = items.filter((it) => selected[it.id]).map((it) => it.id);
    if (!ids.length) {
      toast({ title: "Select at least one item", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-requisition", {
        body: { boq_id: boq.id, notes: notes || undefined, selected_boq_item_ids: ids },
      });
      if (error) throw error;
      const reqId = (data as { requisition?: { id: string } })?.requisition?.id;
      toast({ title: "Requisition created" });
      onOpenChange(false);
      if (reqId) navigate(`/requisitions/${reqId}`);
    } catch (e) {
      toast({ title: "Could not create requisition", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create Requisition</DialogTitle>
          <DialogDescription>
            Select Finish Good items for this requisition. Raw materials will be generated
            from the FG → RM master. Direct-purchase items are skipped by default.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>BOQ {boq.boq_number} · R{boq.revision ?? 0} · {items.length} items · {selectedCount} selected</span>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => toggleAll(true)}>All</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => toggleAll(false)}>None</Button>
          </div>
        </div>

        <div className="border rounded-md max-h-[40vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b text-xs text-muted-foreground">
              <tr>
                <th className="text-left py-2 pl-3 pr-2 w-8"></th>
                <th className="text-left py-2 pr-3">#</th>
                <th className="text-left py-2 pr-3">Model</th>
                <th className="text-left py-2 pr-3">Description</th>
                <th className="text-right py-2 pr-3">Qty</th>
                <th className="text-left py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {loadingMap ? (
                <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">Loading mapping…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">No items.</td></tr>
              ) : items.map((it) => {
                const s = statusFor(it);
                return (
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="py-1.5 pl-3 pr-2">
                      <Checkbox
                        checked={!!selected[it.id]}
                        onCheckedChange={(c) => setSelected((p) => ({ ...p, [it.id]: !!c }))}
                      />
                    </td>
                    <td className="py-1.5 pr-3">{it.item_no}</td>
                    <td className="py-1.5 pr-3">{it.model_number}</td>
                    <td className="py-1.5 pr-3 truncate max-w-[280px]">{it.description}</td>
                    <td className="py-1.5 pr-3 text-right">{it.quantity}</td>
                    <td className="py-1.5 pr-3"><Badge variant={s.tone}>{s.label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-2">
          <Label htmlFor="req-notes">Notes (optional)</Label>
          <Textarea id="req-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={create} disabled={busy || selectedCount === 0}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Create ({selectedCount})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}