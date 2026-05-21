import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, Search, RefreshCw } from "lucide-react";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import type { FgRawMaterialMapRow, RmMasterUploadRow } from "@/lib/requisition/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type ParsedFg = {
  model_number: string;
  raw_materials: Array<{ make?: string; material: string; size_model?: string; qty_per_unit: number; unit?: string }>;
};

function parseSheet(rows: unknown[][]): ParsedFg[] {
  // locate header row (first 6 rows) by finding "raw material" header
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const r = rows[i] || [];
    if (r.some((c) => typeof c === "string" && /raw\s*material/i.test(c))) {
      headerIdx = i; break;
    }
  }
  if (headerIdx < 0) return [];
  const headers = (rows[headerIdx] || []).map((h) => String(h ?? "").trim().toLowerCase());
  const findCol = (...keys: string[]) =>
    headers.findIndex((h) => keys.every((k) => h.includes(k)));
  const cFg = 0;
  const cMake = headers.findIndex((h) => h === "make" || h.startsWith("make"));
  const cMat = findCol("raw", "material");
  const cSize = headers.findIndex((h) => h.includes("size") || h.includes("model"));
  const cQty = headers.findIndex((h) => h.includes("reqd") || h.includes("qty"));
  const cUnit = headers.findIndex((h) => h === "unit" || h.startsWith("unit"));
  if (cMat < 0) return [];

  const out: ParsedFg[] = [];
  let current: ParsedFg | null = null;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const fg = String(row[cFg] ?? "").trim();
    if (fg) {
      // start new FG
      current = { model_number: fg, raw_materials: [] };
      out.push(current);
    }
    if (!current) continue;
    const mat = String(row[cMat] ?? "").trim();
    if (!mat) continue;
    current.raw_materials.push({
      make: cMake >= 0 ? String(row[cMake] ?? "").trim() || undefined : undefined,
      material: mat,
      size_model: cSize >= 0 ? String(row[cSize] ?? "").trim() || undefined : undefined,
      qty_per_unit: cQty >= 0 ? Number(row[cQty]) || 0 : 0,
      unit: cUnit >= 0 ? String(row[cUnit] ?? "").trim() || undefined : undefined,
    });
  }
  // drop empty FGs
  return out.filter((f) => f.raw_materials.length > 0);
}

export default function RawMaterialMaster() {
  const [rows, setRows] = useState<FgRawMaterialMapRow[]>([]);
  const [latestUpload, setLatestUpload] = useState<RmMasterUploadRow | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [viewing, setViewing] = useState<FgRawMaterialMapRow | null>(null);
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
      sb.from("rm_master_uploads").select("*").order("created_at", { ascending: false }).limit(1),
    ]);
    setRows((maps as FgRawMaterialMapRow[]) || []);
    setLatestUpload(((ups as RmMasterUploadRow[]) || [])[0] || null);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.model_number.toLowerCase().includes(q));
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
      for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null }) as unknown[][];
        allFgs.push(...parseSheet(aoa));
      }
      if (!allFgs.length) {
        toast({ title: "No rows parsed", description: "Could not detect FG / Raw Material columns.", variant: "destructive" });
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
      }));

      // Wipe existing Excel-sourced mappings to truly "replace"
      // To preserve any manual `notes` or `is_direct_purchase` flag, we upsert by model_number instead.
      const { error: upErr } = await sb.from("fg_raw_material_map").upsert(payload, { onConflict: "model_number" });
      if (upErr) throw upErr;

      const totalRows = payload.reduce((a, p) => a + p.raw_materials.length, 0);
      const { data: u } = await supabase.auth.getUser();
      await sb.from("rm_master_uploads").insert({
        file_path: file.name,
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
              {latestUpload ? "Replace Excel" : "Upload Excel"}
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
            {!isAdmin && <Badge variant="outline">View-only (admin can upload)</Badge>}
          </div>
          {latestUpload && (
            <div className="text-xs text-muted-foreground border rounded p-2 flex flex-wrap gap-4">
              <span><b>Latest:</b> {latestUpload.original_filename}</span>
              <span><b>Date:</b> {new Date(latestUpload.created_at).toLocaleString()}</span>
              <span><b>By:</b> {latestUpload.uploaded_by_email || "—"}</span>
              <span><b>Sheets:</b> {latestUpload.sheet_count}</span>
              <span><b>Finish Goods:</b> {latestUpload.fg_count}</span>
              <span><b>RM rows:</b> {latestUpload.row_count}</span>
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
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No mappings yet. Upload the Excel to begin.</td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id} className="border-b last:border-0 cursor-pointer hover:bg-accent/30" onClick={() => setViewing(r)}>
                  <td className="py-2 pr-3 font-medium">{r.model_number}</td>
                  <td className="py-2 pr-3">{Array.isArray(r.raw_materials) ? r.raw_materials.length : 0}</td>
                  <td className="py-2 pr-3">{r.is_direct_purchase ? <Badge variant="secondary">Direct Purchase</Badge> : <Badge variant="outline">Manufactured</Badge>}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{new Date(r.updated_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </div>
  );
}