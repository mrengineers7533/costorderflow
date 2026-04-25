import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, FileText, CheckCircle2, XCircle, Trash2, Wand2, Clock, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";
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
  _progress?: { stage: string; percent: number; message: string };
}

interface CostSheetRow {
  id: string;
  file_path: string;
  original_filename: string;
  status: "pending" | "parsing" | "parsed" | "failed";
  parse_error: string | null;
  extracted: ExtractedCostSheet;
  created_at: string;
}

export function CostSheetPicker({ onApply }: { onApply: (data: ExtractedCostSheet, sheet: CostSheetRow) => void }) {
  const [sheets, setSheets] = useState<CostSheetRow[]>([]);
  const [loading, setLoading] = useState(true);
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
  useEffect(() => {
    refresh();
    // Realtime: live updates as edge function progresses
    const channel = supabase
      .channel("cost_sheets_progress")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cost_sheets" },
        (payload) => {
          setSheets((prev) => {
            if (payload.eventType === "DELETE") {
              return prev.filter((s) => s.id !== (payload.old as { id: string }).id);
            }
            const row = payload.new as unknown as CostSheetRow;
            const exists = prev.some((s) => s.id === row.id);
            if (!exists) return [row, ...prev];
            return prev.map((s) => (s.id === row.id ? row : s));
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

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
    // Optimistic local state: edge function will overwrite via realtime within ~1s
    setSheets((prev) => prev.map((s) => s.id === id ? { ...s, status: "parsing", parse_error: null, extracted: { _progress: { stage: "starting", percent: 5, message: "Starting…" } } } : s));
    const { data, error } = await supabase.functions.invoke("parse-cost-sheet", { body: { cost_sheet_id: id } });
    if (error) {
      const msg = (error as { message?: string }).message || "Parsing failed";
      toast({ title: "Parsing failed", description: msg, variant: "destructive" });
      await refresh();
      return;
    }
    toast({ title: "Cost sheet parsed", description: "Review and apply to your order." });
    const extracted = (data as { extracted?: ExtractedCostSheet })?.extracted;
    if (extracted) {
      // Find the refreshed row to pass along
      const { data: row } = await supabase.from("cost_sheets").select("*").eq("id", id).maybeSingle();
      if (row) onApply(extracted, row as unknown as CostSheetRow);
    }
  }

  async function applySheet(sheet: CostSheetRow) {
    if (sheet.status === "parsing") return;
    if (sheet.status !== "parsed") return parseSheet(sheet.id);
    onApply(sheet.extracted, sheet);
    toast({ title: "Applied", description: sheet.original_filename });
  }

  async function deleteSheet(sheet: CostSheetRow) {
    if (!confirm(`Delete ${sheet.original_filename}?`)) return;
    await supabase.storage.from("cost-sheets").remove([sheet.file_path]);
    await supabase.from("cost_sheets").delete().eq("id", sheet.id);
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
           {sheets.map((s) => {
             const isParsing = s.status === "parsing";
             const progress = s.extracted?._progress;
             return (
               <div key={s.id} className="p-2 space-y-2">
                 <div className="flex items-center gap-3">
                   <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                   <div className="flex-1 min-w-0">
                     <div className="text-sm font-medium truncate">{s.original_filename}</div>
                     <div className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString("en-IN")}</div>
                     {s.status === "failed" && s.parse_error && (
                       <div className="text-xs text-destructive truncate" title={s.parse_error}>{s.parse_error}</div>
                     )}
                   </div>
                   <StatusBadge status={s.status} />
                   <Button size="sm" variant="default" disabled={isParsing} onClick={() => applySheet(s)}>
                     {isParsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                      s.status === "parsed" ? <><Wand2 className="h-3.5 w-3.5 mr-1" />Apply</> :
                      <><Wand2 className="h-3.5 w-3.5 mr-1" />Parse</>}
                   </Button>
                   <Button size="icon" variant="ghost" disabled={isParsing} onClick={() => deleteSheet(s)}><Trash2 className="h-4 w-4" /></Button>
                 </div>
                 {isParsing && (
                   <div className="pl-7 pr-2 space-y-1">
                     <Progress value={progress?.percent ?? 5} className="h-1.5" />
                     <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                       <Sparkles className="h-3 w-3 animate-pulse" />
                       <span>{progress?.message ?? "Starting…"}</span>
                     </div>
                   </div>
                 )}
               </div>
             );
           })}
         </div>}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: "pending" | "parsing" | "parsed" | "failed" }) {
  if (status === "parsed") return <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" />Parsed</Badge>;
  if (status === "failed") return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Failed</Badge>;
  if (status === "parsing") return <Badge variant="default" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Parsing</Badge>;
  return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
}