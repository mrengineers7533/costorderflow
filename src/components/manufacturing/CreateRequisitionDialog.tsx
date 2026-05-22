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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Search, Columns3 } from "lucide-react";
import type { BoqRecord, BoqLineItem } from "@/lib/boq/types";
import { firstLine } from "@/lib/requisition/types";
import type { OrderRecord } from "@/lib/orders/types";
import { buildMakeResolver } from "@/lib/boq/makeResolver";
import { useColumnToggle } from "@/hooks/useColumnToggle";
import { logEvent } from "@/lib/activity/log";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  boq: BoqRecord;
}

type MapInfo = { is_direct_purchase: boolean; rm_count: number; matched_model: string };

type RmRow = {
  make: string;
  material: string;
  size_model: string;
  qty_per_unit: string;
  unit: string;
  notes: string;
};

type EditedFg = {
  boq_item_id: string;
  is_direct_purchase: boolean;
  raw_materials: RmRow[];
};

type FullMap = {
  model_number: string;
  is_direct_purchase: boolean;
  raw_materials: Array<{ make?: string; material: string; size_model?: string; qty_per_unit: number; unit?: string; notes?: string }>;
};

export function CreateRequisitionDialog({ open, onOpenChange, boq }: Props) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [mapInfo, setMapInfo] = useState<Record<string, MapInfo>>({});
  const [fullMaps, setFullMaps] = useState<FullMap[]>([]);
  const [loadingMap, setLoadingMap] = useState(false);
  const [step, setStep] = useState<"select" | "review">("select");
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [edited, setEdited] = useState<Record<string, EditedFg>>({});
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [showMake, setShowMake] = useColumnToggle("req.create.columns.make", false);
  const navigate = useNavigate();

  const items: BoqLineItem[] = useMemo(
    () => Array.isArray(boq.line_items) ? boq.line_items : [],
    [boq.line_items],
  );

  useEffect(() => {
    if (!open) return;
    setStep("select");
    setMode("auto");
    setEdited({});
    setNotes("");
    (async () => {
      setLoadingMap(true);
      // Fetch linked OA so we can resolve Make even when BOQ items are legacy.
      const oaId = (boq as { source_order_id?: string }).source_order_id || boq.order_id;
      if (oaId) {
        const { data: o } = await supabase.from("orders").select("*").eq("id", oaId).maybeSingle();
        setOrder((o as unknown as OrderRecord) || null);
      }
      // Load whole master so we can fuzzy match against Column A
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("fg_raw_material_map")
        .select("model_number, is_direct_purchase, raw_materials");
      const all = (data as FullMap[]) || [];
      // normalize Column A to first line for matching + display
      const cleaned = all.map((m) => ({ ...m, model_number: firstLine(m.model_number) || m.model_number }));
      setFullMaps(cleaned);
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
  }, [open, items, boq]);

  const resolveMake = useMemo(() => buildMakeResolver(order?.line_items), [order]);

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

  function findMappingFor(it: BoqLineItem): FullMap | null {
    const mn = (it.model_number || "").trim().toLowerCase();
    const desc = (it.description || "").trim().slice(0, 40).toLowerCase();
    if (mn) {
      const exact = fullMaps.find((m) => m.model_number.toLowerCase() === mn);
      if (exact) return exact;
      const contains = fullMaps.find((m) => m.model_number.toLowerCase().includes(mn));
      if (contains) return contains;
    }
    if (desc) {
      const c = fullMaps.find((m) => m.model_number.toLowerCase().includes(desc));
      if (c) return c;
    }
    return null;
  }

  function goToReview() {
    const ids = items.filter((it) => selected[it.id]).map((it) => it.id);
    if (!ids.length) {
      toast({ title: "Select at least one item", variant: "destructive" });
      return;
    }
    const next: Record<string, EditedFg> = {};
    for (const it of items) {
      if (!selected[it.id]) continue;
      const mapping = mode === "auto" ? findMappingFor(it) : null;
      const isDirect = mode === "auto" && !!mapping?.is_direct_purchase;
      const rms: RmRow[] = mapping && !isDirect && mode === "auto"
        ? mapping.raw_materials.map((rm) => ({
            make: rm.make ?? "",
            material: rm.material ?? "",
            size_model: rm.size_model ?? "",
            qty_per_unit: rm.qty_per_unit != null ? String(rm.qty_per_unit) : "",
            unit: rm.unit ?? "",
            notes: rm.notes ?? "",
          }))
        : [];
      next[it.id] = { boq_item_id: it.id, is_direct_purchase: isDirect, raw_materials: rms };
    }
    setEdited(next);
    setStep("review");
  }

  function updateRm(fgId: string, idx: number, patch: Partial<RmRow>) {
    setEdited((prev) => {
      const cur = prev[fgId]; if (!cur) return prev;
      const rms = cur.raw_materials.slice();
      rms[idx] = { ...rms[idx], ...patch };
      return { ...prev, [fgId]: { ...cur, raw_materials: rms } };
    });
  }
  function addRm(fgId: string) {
    setEdited((prev) => {
      const cur = prev[fgId]; if (!cur) return prev;
      return { ...prev, [fgId]: { ...cur, raw_materials: [...cur.raw_materials, { make: "", material: "", size_model: "", qty_per_unit: "", unit: "", notes: "" }] } };
    });
  }
  function removeRm(fgId: string, idx: number) {
    setEdited((prev) => {
      const cur = prev[fgId]; if (!cur) return prev;
      return { ...prev, [fgId]: { ...cur, raw_materials: cur.raw_materials.filter((_, i) => i !== idx) } };
    });
  }
  function toggleDirect(fgId: string, v: boolean) {
    setEdited((prev) => {
      const cur = prev[fgId]; if (!cur) return prev;
      return { ...prev, [fgId]: { ...cur, is_direct_purchase: v, raw_materials: v ? [] : cur.raw_materials } };
    });
  }
  function loadFromMaster(fgId: string) {
    const it = items.find((x) => x.id === fgId);
    if (!it) return;
    const mapping = findMappingFor(it);
    if (!mapping) { toast({ title: "No mapping found in RM Master", variant: "destructive" }); return; }
    applyMappingTo(fgId, mapping);
  }

  function applyMappingTo(fgId: string, mapping: FullMap) {
    setEdited((prev) => ({
      ...prev,
      [fgId]: {
        ...prev[fgId],
        is_direct_purchase: !!mapping.is_direct_purchase,
        raw_materials: mapping.raw_materials.map((rm) => ({
          make: rm.make ?? "",
          material: rm.material ?? "",
          size_model: rm.size_model ?? "",
          qty_per_unit: rm.qty_per_unit != null ? String(rm.qty_per_unit) : "",
          unit: rm.unit ?? "",
          notes: rm.notes ?? "",
        })),
      },
    }));
    toast({
      title: mapping.is_direct_purchase
        ? `Marked as Direct Purchase from "${mapping.model_number}"`
        : `Loaded ${mapping.raw_materials.length} raw material row(s) from "${mapping.model_number}"`,
    });
  }

  async function create() {
    const ids = Object.keys(edited);
    if (!ids.length) {
      toast({ title: "Nothing to create", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const edited_items = ids.map((id) => ({
        boq_item_id: id,
        is_direct_purchase: edited[id].is_direct_purchase,
        raw_materials: edited[id].raw_materials
          .filter((r) => r.material.trim().length > 0)
          .map((r) => ({
            make: r.make || null,
            material: r.material,
            size_model: r.size_model || null,
            qty_per_unit: r.qty_per_unit.trim() === "" ? null : Number(r.qty_per_unit),
            unit: r.unit || null,
            notes: r.notes || null,
          })),
      }));
      const { data, error } = await supabase.functions.invoke("create-requisition", {
        body: { boq_id: boq.id, notes: notes || undefined, selected_boq_item_ids: ids, mode, edited_items },
      });
      if (error) throw error;
      const reqId = (data as { requisition?: { id: string } })?.requisition?.id;
      toast({ title: "Requisition created" });
      logEvent({
        module: "requisition",
        event_type: "requisition.created",
        status: "info",
        title: `Requisition created`,
        message: `From BOQ ${boq.boq_number} (R${boq.revision ?? 0})`,
        boq_id: boq.id,
        requisition_id: reqId ?? null,
      });
      onOpenChange(false);
      if (reqId) navigate(`/requisitions/${reqId}`);
    } catch (e) {
      toast({ title: "Could not create requisition", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const unmappedInReview = step === "review" && mode === "auto"
    ? Object.values(edited).filter((e) => !e.is_direct_purchase && e.raw_materials.length === 0).length
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Requisition {step === "review" ? "· Review & Edit" : ""}</DialogTitle>
          <DialogDescription>
            {step === "select"
              ? "Select Finish Good items, then choose how to generate raw materials."
              : "Review and edit raw material rows for each Finish Good before saving."}
          </DialogDescription>
        </DialogHeader>

        {step === "select" ? (
          <>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>BOQ {boq.boq_number} · R{boq.revision ?? 0} · {items.length} items · {selectedCount} selected</span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={showMake ? "secondary" : "ghost"}
              className="gap-1"
              onClick={() => setShowMake(!showMake)}
            >
              <Columns3 className="h-3.5 w-3.5" />
              {showMake ? "Hide Make" : "Show Make"}
            </Button>
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
                {showMake && <th className="text-left py-2 pr-3">Make</th>}
                <th className="text-right py-2 pr-3">Qty</th>
                <th className="text-left py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {loadingMap ? (
                <tr><td colSpan={showMake ? 7 : 6} className="py-4 text-center text-muted-foreground">Loading mapping…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={showMake ? 7 : 6} className="py-4 text-center text-muted-foreground">No items.</td></tr>
              ) : items.map((it, idx) => {
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
                    {showMake && <td className="py-1.5 pr-3">{resolveMake(it, idx) || "—"}</td>}
                    <td className="py-1.5 pr-3 text-right">{it.quantity}</td>
                    <td className="py-1.5 pr-3"><Badge variant={s.tone}>{s.label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-2">
          <Label>Generation mode</Label>
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as "auto" | "manual")} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className={`flex items-start gap-2 border rounded-md p-3 cursor-pointer ${mode === "auto" ? "border-primary bg-accent/30" : ""}`}>
              <RadioGroupItem value="auto" className="mt-1" />
              <div>
                <div className="text-sm font-medium">Auto-generate from RM Master</div>
                <div className="text-xs text-muted-foreground">Match Finish Goods against Raw Material Master and pre-fill rows.</div>
              </div>
            </label>
            <label className={`flex items-start gap-2 border rounded-md p-3 cursor-pointer ${mode === "manual" ? "border-primary bg-accent/30" : ""}`}>
              <RadioGroupItem value="manual" className="mt-1" />
              <div>
                <div className="text-sm font-medium">Manual select & create</div>
                <div className="text-xs text-muted-foreground">Start with empty rows and enter raw materials yourself.</div>
              </div>
            </label>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="req-notes">Notes (optional)</Label>
          <Textarea id="req-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={goToReview} disabled={selectedCount === 0 || loadingMap}>
            Next: Review & Edit ({selectedCount})
          </Button>
        </DialogFooter>
          </>
        ) : (
          <>
            {unmappedInReview > 0 && (
              <div className="text-xs rounded border border-amber-400/50 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 px-3 py-2">
                {unmappedInReview} Finish Good item(s) have no raw materials. Add rows manually or mark as Direct Purchase.
              </div>
            )}
            <div className="space-y-4">
              {Object.values(edited).map((efg) => {
                const it = items.find((x) => x.id === efg.boq_item_id);
                if (!it) return null;
                const fgQty = Number(it.quantity) || 0;
                return (
                  <div key={efg.boq_item_id} className="border rounded-md">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/40">
                      <div className="text-sm">
                        <span className="font-medium">{it.item_no}. {it.model_number}</span>
                        <span className="text-muted-foreground"> · {it.description?.slice(0, 60)}</span>
                        <span className="text-muted-foreground"> · Qty {fgQty}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <RmMasterPicker maps={fullMaps} onPick={(m) => applyMappingTo(efg.boq_item_id, m)} />
                        <label className="flex items-center gap-2 text-xs">
                          <Switch checked={efg.is_direct_purchase} onCheckedChange={(v) => toggleDirect(efg.boq_item_id, v)} />
                          Direct Purchase
                        </label>
                        <Button type="button" size="sm" variant="ghost" onClick={() => loadFromMaster(efg.boq_item_id)}>
                          Load from RM Master
                        </Button>
                      </div>
                    </div>
                    {!efg.is_direct_purchase && (
                      <div className="p-3 space-y-2">
                        <table className="w-full text-xs">
                          <thead className="text-muted-foreground">
                            <tr>
                              <th className="text-left pr-2 pb-1">Make</th>
                              <th className="text-left pr-2 pb-1">Material *</th>
                              <th className="text-left pr-2 pb-1">Size / Model</th>
                              <th className="text-right pr-2 pb-1">Qty / unit</th>
                              <th className="text-left pr-2 pb-1">Unit</th>
                              <th className="text-right pr-2 pb-1">Reqd</th>
                              <th className="text-left pr-2 pb-1">Notes</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {efg.raw_materials.length === 0 ? (
                              <tr><td colSpan={8} className="py-2 text-center text-muted-foreground">No raw materials. Add a row.</td></tr>
                            ) : efg.raw_materials.map((rm, i) => {
                              const per = Number(rm.qty_per_unit) || 0;
                              const reqd = per * fgQty;
                              return (
                                <tr key={i} className="border-t">
                                  <td className="pr-2 py-1"><Input className="h-7" value={rm.make} onChange={(e) => updateRm(efg.boq_item_id, i, { make: e.target.value })} /></td>
                                  <td className="pr-2 py-1"><Input className="h-7" value={rm.material} onChange={(e) => updateRm(efg.boq_item_id, i, { material: e.target.value })} /></td>
                                  <td className="pr-2 py-1"><Input className="h-7" value={rm.size_model} onChange={(e) => updateRm(efg.boq_item_id, i, { size_model: e.target.value })} /></td>
                                  <td className="pr-2 py-1"><Input className="h-7 text-right w-20" value={rm.qty_per_unit} onChange={(e) => updateRm(efg.boq_item_id, i, { qty_per_unit: e.target.value })} /></td>
                                  <td className="pr-2 py-1"><Input className="h-7 w-16" value={rm.unit} onChange={(e) => updateRm(efg.boq_item_id, i, { unit: e.target.value })} /></td>
                                  <td className="pr-2 py-1 text-right tabular-nums">{rm.qty_per_unit ? reqd : "—"}</td>
                                  <td className="pr-2 py-1"><Input className="h-7" value={rm.notes} onChange={(e) => updateRm(efg.boq_item_id, i, { notes: e.target.value })} /></td>
                                  <td className="py-1"><Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeRm(efg.boq_item_id, i)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <Button type="button" size="sm" variant="outline" onClick={() => addRm(efg.boq_item_id)}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add RM row
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("select")} disabled={busy}>Back</Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button onClick={create} disabled={busy}>
                {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Create Requisition
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RmMasterPicker({ maps, onPick }: { maps: FullMap[]; onPick: (m: FullMap) => void }) {
  const [open, setOpen] = useState(false);
  const empty = !maps || maps.length === 0;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={empty} className="h-8">
          <Search className="h-3.5 w-3.5 mr-1" />
          {empty ? "RM Master is empty" : "Search RM Master"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[360px]" align="end">
        <Command>
          <CommandInput placeholder="Search Finish Good in RM Master…" />
          <CommandList>
            <CommandEmpty>No FG found in RM Master</CommandEmpty>
            <CommandGroup>
              {maps.slice(0, 200).map((m, i) => {
                const rmCount = Array.isArray(m.raw_materials) ? m.raw_materials.length : 0;
                return (
                  <CommandItem
                    key={`${m.model_number}-${i}`}
                    value={m.model_number}
                    onSelect={() => { onPick(m); setOpen(false); }}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{m.model_number}</span>
                    <Badge variant={m.is_direct_purchase ? "secondary" : "default"} className="shrink-0">
                      {m.is_direct_purchase ? "Direct Purchase" : `${rmCount} RM`}
                    </Badge>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}