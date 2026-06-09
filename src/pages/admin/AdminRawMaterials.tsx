import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Upload } from "lucide-react";
import type { FgRawMaterialMapRow } from "@/lib/requisition/types";
import * as XLSX from "xlsx";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Editable = FgRawMaterialMapRow & { _isNew?: boolean };

function emptyRow(): Editable {
  return {
    id: "",
    model_number: "",
    is_direct_purchase: false,
    raw_materials: [],
    notes: null,
    updated_at: new Date().toISOString(),
    _isNew: true,
  };
}

export default function AdminRawMaterials() {
  const [rows, setRows] = useState<FgRawMaterialMapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Editable | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await sb.from("fg_raw_material_map").select("*").order("model_number");
    setRows((data as FgRawMaterialMapRow[]) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.model_number.toLowerCase().includes(q));
  }, [rows, search]);

  async function save(row: Editable) {
    if (!row.model_number.trim()) {
      toast({ title: "Model number required", variant: "destructive" });
      return;
    }
    const payload = {
      model_number: row.model_number.trim(),
      is_direct_purchase: row.is_direct_purchase,
      raw_materials: row.raw_materials,
      notes: row.notes,
    };
    let error;
    if (row._isNew) {
      ({ error } = await sb.from("fg_raw_material_map").insert(payload));
    } else {
      ({ error } = await sb.from("fg_raw_material_map").update(payload).eq("id", row.id));
    }
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Saved" });
    setEditing(null);
    load();
  }

  async function remove(row: FgRawMaterialMapRow) {
    if (!confirm(`Delete mapping for ${row.model_number}?`)) return;
    const { error } = await sb.from("fg_raw_material_map").delete().eq("id", row.id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    load();
  }

  async function parseFileToCsvText(file: File): Promise<string> {
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      return XLSX.utils.sheet_to_csv(ws);
    }
    return await file.text();
  }

  async function importOne(text: string): Promise<boolean> {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return;
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const idx = (k: string) => header.indexOf(k);
    const iModel = idx("model_number");
    const iMat = idx("material");
    const iQty = idx("qty_per_unit");
    const iUnit = idx("unit");
    const iDirect = idx("is_direct_purchase");
    const iNotes = idx("notes");
    if (iModel < 0) {
      toast({ title: "CSV missing model_number column", variant: "destructive" });
      return;
    }
    const grouped = new Map<string, { model_number: string; is_direct_purchase: boolean; raw_materials: Array<{ material: string; qty_per_unit: number; unit?: string; notes?: string }> }>();
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(",").map((c) => c.trim());
      const model = cells[iModel]; if (!model) continue;
      const key = model.toLowerCase();
      if (!grouped.has(key)) {
        grouped.set(key, {
          model_number: model,
          is_direct_purchase: iDirect >= 0 ? /^(true|1|yes)$/i.test(cells[iDirect] || "") : false,
          raw_materials: [],
        });
      }
      const g = grouped.get(key)!;
      if (iDirect >= 0 && /^(true|1|yes)$/i.test(cells[iDirect] || "")) g.is_direct_purchase = true;
      if (iMat >= 0 && cells[iMat]) {
        g.raw_materials.push({
          material: cells[iMat],
          qty_per_unit: iQty >= 0 ? Number(cells[iQty]) || 0 : 0,
          unit: iUnit >= 0 ? cells[iUnit] : undefined,
          notes: iNotes >= 0 ? cells[iNotes] : undefined,
        });
      }
    }
    const payload = Array.from(grouped.values());
    const { error } = await sb.from("fg_raw_material_map").upsert(payload, { onConflict: "model_number" });
    if (error) { toast({ title: "Import failed", description: error.message, variant: "destructive" }); return false; }
    toast({ title: `Imported ${payload.length} mappings` });
    return true;
  }

  async function importFiles(files: File[]) {
    let ok = 0;
    for (const f of files) {
      try {
        const csv = await parseFileToCsvText(f);
        const res = await importOne(csv);
        if (res) ok++;
      } catch (e) {
        toast({ title: `Failed to read ${f.name}`, description: String((e as Error).message || e), variant: "destructive" });
      }
    }
    if (files.length > 1) toast({ title: `Imported ${ok} file(s)` });
    load();
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <AdminTabs title="Raw Material Master" description="Map each Finish Good model to its raw materials. Direct-purchase items are skipped during requisition." />

      <Card className="mb-4">
        <CardContent className="p-4 flex flex-wrap gap-2 items-center">
          <Input placeholder="Search model…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <div className="flex-1" />
          <label className="inline-flex items-center gap-2 text-sm border rounded px-3 py-1.5 cursor-pointer hover:bg-accent">
            <Upload className="h-4 w-4" />
            Import (CSV / Excel)
            <input type="file" accept=".csv,.xlsx,.xls" multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length) importFiles(fs); e.currentTarget.value = ""; }} />
          </label>
          <Button onClick={() => setEditing(emptyRow())}><Plus className="h-4 w-4 mr-1" />Add mapping</Button>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead>RM lines</TableHead>
              <TableHead>Direct Purchase</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No mappings yet.</TableCell></TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => setEditing({ ...r })}>
                <TableCell className="font-medium">{r.model_number}</TableCell>
                <TableCell>{Array.isArray(r.raw_materials) ? r.raw_materials.length : 0}</TableCell>
                <TableCell>
                  {r.is_direct_purchase ? <Badge variant="secondary">Direct Purchase</Badge> : <Badge variant="outline">Manufactured</Badge>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(r.updated_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); remove(r); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {editing && (
            <>
              <SheetHeader>
                <SheetTitle>{editing._isNew ? "New mapping" : `Edit: ${editing.model_number}`}</SheetTitle>
                <SheetDescription>Define raw materials per 1 unit of this Finish Good.</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-1.5">
                  <Label>Model number</Label>
                  <Input value={editing.model_number} onChange={(e) => setEditing({ ...editing, model_number: e.target.value })} />
                </div>
                <div className="flex items-center justify-between border rounded p-3">
                  <div>
                    <div className="text-sm font-medium">Direct Purchase</div>
                    <div className="text-xs text-muted-foreground">If on, requisition skips this FG (bought from outside).</div>
                  </div>
                  <Switch checked={editing.is_direct_purchase} onCheckedChange={(c) => setEditing({ ...editing, is_direct_purchase: c })} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Raw materials (per 1 unit FG)</Label>
                    <Button size="sm" variant="outline" onClick={() => setEditing({ ...editing, raw_materials: [...editing.raw_materials, { material: "", qty_per_unit: 0, unit: "" }] })}>
                      <Plus className="h-3.5 w-3.5 mr-1" />Add row
                    </Button>
                  </div>
                  <div className="border rounded">
                    <table className="w-full text-sm">
                      <thead className="text-xs text-muted-foreground border-b">
                        <tr>
                          <th className="text-left py-2 px-2">Material</th>
                          <th className="text-left py-2 px-2 w-24">Qty / unit</th>
                          <th className="text-left py-2 px-2 w-20">Unit</th>
                          <th className="text-left py-2 px-2">Notes</th>
                          <th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {editing.raw_materials.length === 0 ? (
                          <tr><td colSpan={5} className="py-3 text-center text-xs text-muted-foreground">No raw materials yet.</td></tr>
                        ) : editing.raw_materials.map((rm, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="px-2 py-1"><Input className="h-8" value={rm.material} onChange={(e) => { const arr = [...editing.raw_materials]; arr[i] = { ...rm, material: e.target.value }; setEditing({ ...editing, raw_materials: arr }); }} /></td>
                            <td className="px-2 py-1"><Input className="h-8" type="number" step="any" value={rm.qty_per_unit} onChange={(e) => { const arr = [...editing.raw_materials]; arr[i] = { ...rm, qty_per_unit: Number(e.target.value) || 0 }; setEditing({ ...editing, raw_materials: arr }); }} /></td>
                            <td className="px-2 py-1"><Input className="h-8" value={rm.unit ?? ""} onChange={(e) => { const arr = [...editing.raw_materials]; arr[i] = { ...rm, unit: e.target.value }; setEditing({ ...editing, raw_materials: arr }); }} /></td>
                            <td className="px-2 py-1"><Input className="h-8" value={rm.notes ?? ""} onChange={(e) => { const arr = [...editing.raw_materials]; arr[i] = { ...rm, notes: e.target.value }; setEditing({ ...editing, raw_materials: arr }); }} /></td>
                            <td className="px-2 py-1 text-right">
                              <Button size="sm" variant="ghost" onClick={() => { const arr = editing.raw_materials.filter((_, j) => j !== i); setEditing({ ...editing, raw_materials: arr }); }}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea rows={2} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value || null })} />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                  <Button onClick={() => save(editing)}>Save</Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}