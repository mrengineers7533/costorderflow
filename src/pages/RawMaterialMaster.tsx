import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, Search, RefreshCw, Eye, Pencil, Trash2, Plus, Download } from "lucide-react";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { FgRawMaterialMapRow, RmMasterUploadRow } from "@/lib/requisition/types";
import { firstLine } from "@/lib/requisition/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type ParsedFg = {
  model_number: string;
  fg_description_full?: string;
  raw_materials: Array<{ make?: string; material: string; size_model?: string; qty_per_unit: number; unit?: string }>;
};

function parseSheet(rows: unknown[][]): ParsedFg[] {
  // Material column synonyms (case-insensitive, exact-after-trim match against cell text).
  const MATERIAL_SYNONYMS = [
    "raw material", "raw materials",
    "material", "material name", "material description", "description of material",
    "item", "item name", "item description",
    "particulars", "description",
  ];
  const isMaterialHeader = (h: string) => MATERIAL_SYNONYMS.includes(h);
  const SUPPORT_KEYS = ["qty", "reqd", "required", "unit", "size", "model", "make"];

  // Scan first 25 rows for a header row containing a material-column synonym
  // AND at least one supporting column (qty/unit/size/etc) to avoid false positives.
  let headerIdx = -1;
  let cMat = -1;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const r = (rows[i] || []).map((c) => String(c ?? "").trim().toLowerCase());
    const matIdx = r.findIndex(isMaterialHeader);
    if (matIdx < 0) continue;
    const hasSupport = r.some((h) => h && SUPPORT_KEYS.some((k) => h.includes(k)));
    if (!hasSupport) continue;
    headerIdx = i;
    cMat = matIdx;
    break;
  }
  if (headerIdx < 0 || cMat < 0) return [];
  const headers = (rows[headerIdx] || []).map((h) => String(h ?? "").trim().toLowerCase());
  // Detect Finished Good column from header. Must lie to the left of Material
  // so we don't accidentally pick "Size/Model". Falls back to column A
  // (legacy behaviour) when no FG-like header is found.
  const FG_SYNONYMS = [
    "finished good", "finished goods", "finish good",
    "fg", "fg name", "fg description",
    "model", "model number", "model no", "model no.",
    "product", "product name",
  ];
  let cFg = -1;
  for (let i = 0; i < cMat; i++) {
    const h = headers[i];
    if (h && FG_SYNONYMS.some((s) => h === s || h.includes(s))) { cFg = i; break; }
  }
  if (cFg < 0) cFg = 0;
  // Resolve columns strictly relative to the Raw Material column to avoid
  // picking up Sr/Model/Qty-like columns that may sit to its left.
  const afterIdx = (predicate: (h: string) => boolean) => {
    for (let i = cMat + 1; i < headers.length; i++) if (predicate(headers[i])) return i;
    return -1;
  };
  const beforeIdx = (predicate: (h: string) => boolean) => {
    for (let i = cMat - 1; i >= 0; i--) if (predicate(headers[i])) return i;
    return -1;
  };
  // Size: prefer header containing "size" (after Material). Never match on
  // "model" alone — there is often a Sr/Model column to the left of Material.
  let cSize = afterIdx((h) => h.includes("size"));
  if (cSize < 0) cSize = afterIdx((h) => h.includes("size") && h.includes("model"));
  const cQtyPerUnit = afterIdx((h) => h.includes("qty"));
  const cReqd = afterIdx((h) => h.includes("reqd") || h.includes("required"));
  const cUnit = afterIdx((h) => h === "unit" || h.startsWith("unit"));
  // Make conventionally precedes Material
  const cMake = beforeIdx((h) => h === "make" || h.startsWith("make"));
  // Diagnostic — visible in DevTools, no UI impact
  // eslint-disable-next-line no-console
  console.info("[RM parser] headers:", headers, { cFg, cMake, cMat, cSize, cQtyPerUnit, cReqd, cUnit });

  const out: ParsedFg[] = [];
  let current: ParsedFg | null = null;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const fgRaw = String(row[cFg] ?? "");
    if (fgRaw.trim()) {
      const clean = firstLine(fgRaw);
      // start new FG (Column A first line only is the matching key)
      current = {
        model_number: clean || fgRaw.trim(),
        fg_description_full: fgRaw.trim(),
        raw_materials: [],
      };
      out.push(current);
    }
    if (!current) continue;
    const mat = String(row[cMat] ?? "").trim();
    if (!mat) continue;
    const sizeRaw = cSize >= 0 ? String(row[cSize] ?? "").trim() : "";
    const sizeVal = sizeRaw || undefined;
    const qtyPerUnitRaw = cQtyPerUnit >= 0 ? row[cQtyPerUnit] : null;
    const reqdRaw = cReqd >= 0 ? row[cReqd] : null;
    const qtyPerUnitNum = Number(qtyPerUnitRaw);
    const reqdNum = Number(reqdRaw);
    let qtyVal = 0;
    if (Number.isFinite(qtyPerUnitNum) && qtyPerUnitNum !== 0) qtyVal = qtyPerUnitNum;
    else if (Number.isFinite(reqdNum) && reqdNum !== 0) qtyVal = reqdNum;
    else if (Number.isFinite(qtyPerUnitNum)) qtyVal = qtyPerUnitNum;
    else if (Number.isFinite(reqdNum)) qtyVal = reqdNum;
    current.raw_materials.push({
      make: cMake >= 0 ? String(row[cMake] ?? "").trim() || undefined : undefined,
      material: mat,
      size_model: sizeVal,
      qty_per_unit: qtyVal,
      unit: cUnit >= 0 ? String(row[cUnit] ?? "").trim() || undefined : undefined,
    });
  }
  // drop empty FGs
  return out.filter((f) => f.raw_materials.length > 0);
}

export default function RawMaterialMaster() {
  const [rows, setRows] = useState<FgRawMaterialMapRow[]>([]);
  const [uploads, setUploads] = useState<RmMasterUploadRow[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [viewing, setViewing] = useState<FgRawMaterialMapRow | null>(null);
  const [editing, setEditing] = useState<FgRawMaterialMapRow | null>(null);
  const [deletingMap, setDeletingMap] = useState<FgRawMaterialMapRow | null>(null);
  const [deletingUpload, setDeletingUpload] = useState<RmMasterUploadRow | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const { data: user } = await supabase.auth.getUser();
    if (user?.user) {
      const { data: roleRow } = await sb.from("user_roles").select("role").eq("user_id", user.user.id).eq("role", "admin").maybeSingle();
      setIsAdmin(!!roleRow);
    }
    const [{ data: maps }, { data: ups }] = await Promise.all([
      sb.from("fg_raw_material_map").select("*").order("model_number"),
      sb.from("rm_master_uploads").select("*").order("created_at", { ascending: false }).limit(20),
    ]);
    setRows((maps as FgRawMaterialMapRow[]) || []);
    setUploads((ups as RmMasterUploadRow[]) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function downloadUploadedExcel(u: RmMasterUploadRow) {
    if (!u.file_path || !u.file_path.includes("/")) {
      toast({ title: "No file available", description: "This upload predates file storage.", variant: "destructive" });
      return;
    }
    try {
      const { data, error } = await supabase.storage
        .from("rm-master-uploads")
        .createSignedUrl(u.file_path, 60, { download: u.original_filename || "raw-material-master.xlsx" });
      if (error || !data?.signedUrl) throw error || new Error("Could not create download link");
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = u.original_filename || "raw-material-master.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast({
        title: "Excel file is no longer available",
        description: (e as Error).message || "The stored file could not be retrieved.",
        variant: "destructive",
      });
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cleaned = rows.map((r) => ({ ...r, model_number: firstLine(r.model_number) || r.model_number }));
    if (!q) return cleaned;
    return cleaned.filter((r) => r.model_number.toLowerCase().includes(q));
  }, [rows, search]);

  async function handleUpload(file: File) {
    if (!isAdmin) {
      toast({ title: "Admin only", description: "Only admins can replace the master.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const allFgs: ParsedFg[] = [];
      const failedSheets: string[] = [];
      for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null }) as unknown[][];
        const parsed = parseSheet(aoa);
        if (parsed.length === 0) failedSheets.push(name);
        allFgs.push(...parsed);
      }
      if (!allFgs.length) {
        toast({
          title: "No rows parsed",
          description: `Could not detect header row in: ${failedSheets.join(", ") || "(none)"}. Expected a row with 'Raw Material' (or Material/Item/Particulars) plus Qty/Unit.`,
          variant: "destructive",
        });
        setBusy(false); return;
      }
      // De-dupe by model_number (case-insensitive); keep first
      const map = new Map<string, ParsedFg>();
      for (const f of allFgs) {
        const k = f.model_number.toLowerCase();
        if (!map.has(k)) map.set(k, f);
        else map.get(k)!.raw_materials.push(...f.raw_materials);
      }
      const payload = Array.from(map.values()).map((f) => ({
        model_number: f.model_number,
        is_direct_purchase: false,
        raw_materials: f.raw_materials,
        fg_description_full: f.fg_description_full ?? null,
      }));

      // Wipe existing Excel-sourced mappings to truly "replace"
      // To preserve any manual `notes` or `is_direct_purchase` flag, we upsert by model_number instead.
      const { error: upErr } = await sb.from("fg_raw_material_map").upsert(payload, { onConflict: "model_number" });
      if (upErr) throw upErr;

      const totalRows = payload.reduce((a, p) => a + p.raw_materials.length, 0);
      const { data: u } = await supabase.auth.getUser();

      // Upload original Excel to storage so it can be downloaded later.
      // If this fails, we still record the history row so existing import behaviour is preserved.
      let storedPath = file.name;
      try {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
        const uid = u?.user?.id ?? "anon";
        const objectPath = `${uid}/${Date.now()}-${safe}`;
        const { error: storageErr } = await supabase.storage
          .from("rm-master-uploads")
          .upload(objectPath, file, {
            contentType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            upsert: false,
          });
        if (storageErr) throw storageErr;
        storedPath = objectPath;
      } catch (storageErr) {
        toast({
          title: "File saved without attachment",
          description: "Mappings imported, but the Excel file could not be stored for download: " + ((storageErr as Error).message || String(storageErr)),
          variant: "destructive",
        });
      }

      await sb.from("rm_master_uploads").insert({
        file_path: storedPath,
        original_filename: file.name,
        sheet_count: wb.SheetNames.length,
        fg_count: payload.length,
        row_count: totalRows,
        uploaded_by: u?.user?.id ?? null,
        uploaded_by_email: u?.user?.email ?? null,
      });
      toast({ title: "Master replaced", description: `${payload.length} Finish Goods · ${totalRows} raw material rows imported.` });
      load();
    } catch (e) {
      toast({ title: "Upload failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="container mx-auto px-4 lg:px-6 py-5 space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Raw Material Master</h1>
        <p className="text-sm text-muted-foreground">
          Upload the Excel master to map each Finish Good to its raw materials. Requisitions are auto-generated from this mapping.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Excel upload
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Expected sheets: each row group starts with a Finish Good name in Column A. Recognized columns:
            <span className="font-medium"> Make, Raw Material, Size/Model, Reqd Qty, Unit</span>.
            Uploading replaces existing mappings for the same Finish Good name.
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
            />
            <Button disabled={!isAdmin || busy} onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-1" />
              {uploads.length > 0 ? "Replace Excel" : "Upload Excel"}
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
            {!isAdmin && <Badge variant="outline">View-only (admin can upload)</Badge>}
          </div>
          {isAdmin && rows.length > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setConfirmWipe(true)} disabled={busy}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete all mappings
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Upload history</CardTitle>
        </CardHeader>
        <CardContent>
          {uploads.length === 0 ? (
            <p className="text-xs text-muted-foreground">No uploads yet.</p>
          ) : (
            <div className="space-y-2">
              {uploads.map((u) => {
                const hasStoredFile = !!u.file_path && u.file_path.includes("/");
                return (
                  <div key={u.id} className="text-xs border rounded p-2 flex flex-wrap items-center gap-4">
                    <span className="font-medium">{u.original_filename}</span>
                    <span className="text-muted-foreground">{new Date(u.created_at).toLocaleString()}</span>
                    <span className="text-muted-foreground">By: {u.uploaded_by_email || "—"}</span>
                    <Badge variant="outline">{u.sheet_count} sheets</Badge>
                    <Badge variant="outline">{u.fg_count} FG</Badge>
                    <Badge variant="outline">{u.row_count} RM rows</Badge>
                    <div className="ml-auto flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!hasStoredFile}
                        title={hasStoredFile ? "Download original Excel" : "Original file not stored for this upload"}
                        onClick={() => downloadUploadedExcel(u)}
                      >
                        <Download className="h-3.5 w-3.5 mr-1" /> Download
                      </Button>
                      {isAdmin && (
                        <Button variant="ghost" size="sm" className="text-destructive"
                                onClick={() => setDeletingUpload(u)}>
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete entry
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              <p className="text-[11px] text-muted-foreground">
                If an upload predates file storage, the Download button is disabled.
              </p>
              <p className="text-[11px] text-muted-foreground">
                Deleting an upload entry only clears the history record. It does not remove any Finish Good mappings or affect existing requisitions.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Finish Good → Raw Material mappings ({rows.length})</span>
            <div className="relative w-64">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-7 h-8" placeholder="Search Finish Good…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2 pr-3">Finish Good (Column A)</th>
                <th className="text-left py-2 pr-3">RM rows</th>
                <th className="text-left py-2 pr-3">Direct Purchase</th>
                <th className="text-left py-2 pr-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No mappings yet. Upload the Excel to begin.</td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-accent/30">
                  <td className="py-2 pr-3 font-medium">{r.model_number}</td>
                  <td className="py-2 pr-3">{Array.isArray(r.raw_materials) ? r.raw_materials.length : 0}</td>
                  <td className="py-2 pr-3">{r.is_direct_purchase ? <Badge variant="secondary">Direct Purchase</Badge> : <Badge variant="outline">Manufactured</Badge>}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{new Date(r.updated_at).toLocaleDateString()}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" title="View" onClick={() => setViewing(r)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {isAdmin && (
                        <>
                          <Button size="sm" variant="ghost" title="Edit"
                                  onClick={() => setEditing(JSON.parse(JSON.stringify(r)))}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" title="Delete"
                                  className="text-destructive"
                                  onClick={() => setDeletingMap(r)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <thead className="hidden">
            <tr><th /></tr>
          </thead>
        </CardContent>
      </Card>

      <Sheet open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {viewing && (
            <>
              <SheetHeader>
                <SheetTitle className="break-words">{viewing.model_number}</SheetTitle>
                <SheetDescription>Raw materials per 1 unit of this Finish Good (from Excel master).</SheetDescription>
              </SheetHeader>
              <div className="mt-4 border rounded overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2 px-2">Make</th>
                      <th className="text-left py-2 px-2">Raw Material</th>
                      <th className="text-left py-2 px-2">Size / Model</th>
                      <th className="text-right py-2 px-2 w-20">Reqd Qty</th>
                      <th className="text-left py-2 px-2 w-16">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewing.raw_materials.map((rm, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1.5 px-2">{rm.make || "—"}</td>
                        <td className="py-1.5 px-2">{rm.material}</td>
                        <td className="py-1.5 px-2">{rm.size_model || "—"}</td>
                        <td className="py-1.5 px-2 text-right">{rm.qty_per_unit}</td>
                        <td className="py-1.5 px-2">{rm.unit || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                To edit fields manually, use Admin → Raw Material Master. Re-uploading the Excel will overwrite this Finish Good's rows.
              </p>
            </>
          )}
        </SheetContent>
      </Sheet>

      <EditMappingSheet
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />

      <AlertDialog open={!!deletingMap} onOpenChange={(o) => !o && setDeletingMap(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Finish Good mapping?</AlertDialogTitle>
            <AlertDialogDescription>
              "<b>{deletingMap?.model_number}</b>" and its raw-material rows will be removed from the master.
              Existing requisitions are snapshots and will not change. Future requisitions will skip or flag this Finish Good until it is re-added.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const target = deletingMap; setDeletingMap(null);
                if (!target) return;
                const { error } = await sb.from("fg_raw_material_map").delete().eq("id", target.id);
                if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
                else { toast({ title: "Mapping deleted" }); load(); }
              }}>
              Delete mapping
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingUpload} onOpenChange={(o) => !o && setDeletingUpload(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete upload history entry?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes only the history record for "{deletingUpload?.original_filename}". Mappings are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const target = deletingUpload; setDeletingUpload(null);
                if (!target) return;
                if (target.file_path && target.file_path.includes("/")) {
                  await supabase.storage.from("rm-master-uploads").remove([target.file_path]);
                }
                const { error } = await sb.from("rm_master_uploads").delete().eq("id", target.id);
                if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
                else { toast({ title: "History entry deleted" }); load(); }
              }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmWipe} onOpenChange={setConfirmWipe}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete ALL Finish Good mappings?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes every row in the Raw Material Master. Existing requisitions stay intact (they hold their own snapshot).
              You will need to re-upload the Excel before new requisitions can match Finish Goods.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                setConfirmWipe(false);
                const { error } = await sb.from("fg_raw_material_map").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                if (error) toast({ title: "Wipe failed", description: error.message, variant: "destructive" });
                else { toast({ title: "All mappings deleted" }); load(); }
              }}>
              Delete all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EditMappingSheet({
  editing, onClose, onSaved,
}: { editing: FgRawMaterialMapRow | null; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<FgRawMaterialMapRow | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(editing ? { ...editing, raw_materials: [...(editing.raw_materials || [])] } : null); }, [editing]);

  if (!draft) return (
    <Sheet open={false} onOpenChange={onClose}><SheetContent /></Sheet>
  );

  function patchRm(i: number, patch: Partial<NonNullable<FgRawMaterialMapRow["raw_materials"]>[number]>) {
    setDraft((d) => d ? { ...d, raw_materials: d.raw_materials.map((rm, idx) => idx === i ? { ...rm, ...patch } : rm) } : d);
  }
  function removeRm(i: number) {
    setDraft((d) => d ? { ...d, raw_materials: d.raw_materials.filter((_, idx) => idx !== i) } : d);
  }
  function addRm() {
    setDraft((d) => d ? { ...d, raw_materials: [...d.raw_materials, { material: "", qty_per_unit: 0 }] } : d);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    const { error } = await sb.from("fg_raw_material_map").update({
      raw_materials: draft.raw_materials,
      is_direct_purchase: draft.is_direct_purchase,
      base_quantity: Number(draft.base_quantity) > 0 ? Number(draft.base_quantity) : 1,
      notes: draft.notes,
    }).eq("id", draft.id);
    setSaving(false);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Mapping updated" });
    onSaved();
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="break-words">Edit · {draft.model_number}</SheetTitle>
          <SheetDescription>Updates apply to future requisitions only. Existing requisitions keep their snapshot.</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between border rounded p-3">
            <div>
              <Label className="text-sm">Direct Purchase</Label>
              <p className="text-xs text-muted-foreground">When on, no raw materials are generated for this FG.</p>
            </div>
            <Switch checked={draft.is_direct_purchase}
                    onCheckedChange={(v) => setDraft((d) => d ? { ...d, is_direct_purchase: v } : d)} />
          </div>

          <div className="flex items-center justify-between border rounded p-3 gap-3">
            <div>
              <Label className="text-sm">BOM Base Quantity</Label>
              <p className="text-xs text-muted-foreground">Finished-good qty this BOM was built for. Requisition multiplies RM proportionally.</p>
            </div>
            <Input type="number" min={1} step="any" className="w-24 text-right"
                   value={draft.base_quantity ?? 1}
                   onChange={(e) => setDraft((d) => d ? { ...d, base_quantity: e.target.value === "" ? 1 : Number(e.target.value) } : d)} />
          </div>

          <div className="space-y-1">
            <Label className="text-sm">Notes</Label>
            <Textarea rows={2} value={draft.notes ?? ""}
                      onChange={(e) => setDraft((d) => d ? { ...d, notes: e.target.value } : d)} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm">Raw materials</Label>
              <Button size="sm" variant="outline" onClick={addRm}><Plus className="h-3.5 w-3.5 mr-1" /> Add row</Button>
            </div>
            <div className="border rounded overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b bg-muted/30">
                  <tr>
                    <th className="text-left py-2 px-2">Make</th>
                    <th className="text-left py-2 px-2">Raw Material</th>
                    <th className="text-left py-2 px-2">Size / Model</th>
                    <th className="text-right py-2 px-2 w-24">Reqd Qty</th>
                    <th className="text-left py-2 px-2 w-20">Unit</th>
                    <th className="py-2 px-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {draft.raw_materials.length === 0 ? (
                    <tr><td colSpan={6} className="py-4 text-center text-muted-foreground text-xs">No rows. Click "Add row".</td></tr>
                  ) : draft.raw_materials.map((rm, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1 px-1"><Input className="h-8" value={rm.make ?? ""} onChange={(e) => patchRm(i, { make: e.target.value })} /></td>
                      <td className="py-1 px-1"><Input className="h-8" value={rm.material} onChange={(e) => patchRm(i, { material: e.target.value })} /></td>
                      <td className="py-1 px-1"><Input className="h-8" value={rm.size_model ?? ""} onChange={(e) => patchRm(i, { size_model: e.target.value })} /></td>
                      <td className="py-1 px-1"><Input type="number" className="h-8 text-right" value={rm.qty_per_unit} onChange={(e) => patchRm(i, { qty_per_unit: Number(e.target.value) || 0 })} /></td>
                      <td className="py-1 px-1"><Input className="h-8" value={rm.unit ?? ""} onChange={(e) => patchRm(i, { unit: e.target.value })} /></td>
                      <td className="py-1 px-1 text-right">
                        <Button size="sm" variant="ghost" className="text-destructive h-7 w-7 p-0" onClick={() => removeRm(i)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}