import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, FileText, CheckCircle2, XCircle, Trash2, Wand2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export interface ExtractedCostSheet {
  company_name?: string;
  bill_to?: { name?: string; address?: string; gstin?: string; state?: string };
  ship_to?: { name?: string; address?: string; gstin?: string; state?: string };
  cost_sheet_number?: string;
  reference?: string;
  line_items?: Array<{ description: string; hsn_code?: string; quantity: number; unit_rate: number; amount: number }>;
  charges?: { pf_percent?: number; pf_amount?: number; insurance?: number; freight?: number; gst_percent?: number; discount?: number };
  notes?: string;
}

interface CostSheetRow {
  id: string;
  file_path: string;
  original_filename: string;
  status: "pending" | "parsed" | "failed";
  parse_error: string | null;
  extracted: ExtractedCostSheet;
  created_at: string;
}

export function CostSheetPicker({ onApply }: { onApply: (data: ExtractedCostSheet, sheet: CostSheetRow) => void }) {
  const [sheets, setSheets] = useState<CostSheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [parsingId, setParsingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    setLoading(true);
    const { data, error } = await supabase
      .from("cost_sheets").select("*").order("created_at", { ascending: false });
    if (error) toast({ title: "Failed to load cost sheets", description: error.message, variant: "destructive" });
    else setSheets((data as unknown as CostSheetRow[]) || []);
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);

  async function handleUpload(file: File) {
    if (file.type !== "application/pdf") {
      return toast({ title: "Only PDF files are supported", variant: "destructive" });
    }
    setUploading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setUploading(false); return; }
    const path = `${u.user.id}/${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
    const up = await supabase.storage.from("cost-sheets").upload(path, file, { contentType: "application/pdf" });
    if (up.error) { setUploading(false); return toast({ title: "Upload failed", description: up.error.message, variant: "destructive" }); }

    const ins = await supabase.from("cost_sheets").insert({
      user_id: u.user.id, file_path: path, original_filename: file.name, status: "pending",
    }).select().single();
    setUploading(false);
    if (ins.error) return toast({ title: "Save failed", description: ins.error.message, variant: "destructive" });

    await refresh();
    // Auto-parse the freshly uploaded sheet
    parseSheet((ins.data as { id: string }).id);
  }

  async function parseSheet(id: string) {
    setParsingId(id);
    const { data, error } = await supabase.functions.invoke("parse-cost-sheet", { body: { cost_sheet_id: id } });
    setParsingId(null);
    if (error) {
      const msg = (error as { message?: string }).message || "Parsing failed";
      toast({ title: "Parsing failed", description: msg, variant: "destructive" });
      await refresh();
      return;
    }
    toast({ title: "Cost sheet parsed", description: "Review and apply to your order." });
    await refresh();
    const extracted = (data as { extracted?: ExtractedCostSheet })?.extracted;
    if (extracted) {
      // Find the refreshed row to pass along
      const { data: row } = await supabase.from("cost_sheets").select("*").eq("id", id).maybeSingle();
      if (row) onApply(extracted, row as unknown as CostSheetRow);
    }
  }

  async function applySheet(sheet: CostSheetRow) {
    if (sheet.status !== "parsed") return parseSheet(sheet.id);
    onApply(sheet.extracted, sheet);
    toast({ title: "Applied", description: sheet.original_filename });
  }

  async function deleteSheet(sheet: CostSheetRow) {
    if (!confirm(`Delete ${sheet.original_filename}?`)) return;
    await supabase.storage.from("cost-sheets").remove([sheet.file_path]);
    await supabase.from("cost_sheets").delete().eq("id", sheet.id);
    refresh();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Cost Sheet Source</CardTitle>
        <div>
          <input ref={fileInput} type="file" accept="application/pdf" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
          <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
            Upload Cost Sheet PDF
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">Upload a cost sheet PDF or pick one you uploaded earlier. AI will auto-fill the order fields below — you can still edit anything.</p>
        {loading ? <p className="text-sm text-muted-foreground">Loading…</p> :
         sheets.length === 0 ? <p className="text-sm text-muted-foreground italic">No cost sheets yet.</p> :
         <div className="divide-y rounded border">
           {sheets.map((s) => (
             <div key={s.id} className="flex items-center gap-3 p-2">
               <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
               <div className="flex-1 min-w-0">
                 <div className="text-sm font-medium truncate">{s.original_filename}</div>
                 <div className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString("en-IN")}</div>
                 {s.parse_error && <div className="text-xs text-destructive truncate">{s.parse_error}</div>}
               </div>
               <StatusBadge status={s.status} />
               <Button size="sm" variant="default" disabled={parsingId === s.id} onClick={() => applySheet(s)}>
                 {parsingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                  s.status === "parsed" ? <><Wand2 className="h-3.5 w-3.5 mr-1" />Apply</> :
                  <><Wand2 className="h-3.5 w-3.5 mr-1" />Parse</>}
               </Button>
               <Button size="icon" variant="ghost" onClick={() => deleteSheet(s)}><Trash2 className="h-4 w-4" /></Button>
             </div>
           ))}
         </div>}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: "pending" | "parsed" | "failed" }) {
  if (status === "parsed") return <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" />Parsed</Badge>;
  if (status === "failed") return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Failed</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}