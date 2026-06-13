import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, FileText, CheckCircle2, XCircle, Trash2, Wand2, Clock, Sparkles, ExternalLink, Plus, RefreshCw, Eye, Download } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

export interface ExtractedCostSheet {
  company_name?: string;
  bill_to?: { name?: string; address?: string; gstin?: string; state?: string };
  ship_to?: { name?: string; address?: string; gstin?: string; state?: string };
  cost_sheet_number?: string;
  reference?: string;
  line_items?: Array<{
    description: string;
    hsn_code?: string;
    make_label?: string;
    quantity: number;
    unit_rate: number;
    amount: number;
    motor?: string;
    motor_quantity?: number;
    motor_price?: number;
    remarks?: string;
  }>;
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

export function CostSheetPicker({ onApply, onParsingChange }: { onApply: (data: ExtractedCostSheet, sheet: CostSheetRow, forcedFormat?: "MR" | "GMS") => void; onParsingChange?: (parsing: boolean) => void }) {
  const [sheets, setSheets] = useState<CostSheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  // Map: cost_sheet_number → { MR?: {id, oa_number}, GMS?: {id, oa_number} }
  const [oaIndex, setOaIndex] = useState<Record<string, Partial<Record<"MR" | "GMS", { id: string; oa_number: string }>>>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onParsingChange?.(sheets.some((s) => s.status === "parsing"));
  }, [sheets, onParsingChange]);

  async function refresh() {
    setLoading(true);
    const { data, error } = await supabase
      .from("cost_sheets").select("*").order("created_at", { ascending: false });
    if (error) toast({ title: "Failed to load cost sheets", description: error.message, variant: "destructive" });
    else setSheets((data as unknown as CostSheetRow[]) || []);
    setLoading(false);
  }

  // Index OAs by cost_sheet_number so each sheet row can show "MR OA / GMS OA"
  // status (Create vs View). Refreshed whenever the sheet list changes.
  useEffect(() => {
    const numbers = Array.from(
      new Set(
        sheets
          .map((s) => s.extracted?.cost_sheet_number)
          .filter((n): n is string => !!n && n.trim().length > 0),
      ),
    );
    if (numbers.length === 0) { setOaIndex({}); return; }
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, oa_number, format, cost_sheet_number")
        .in("cost_sheet_number", numbers);
      const idx: Record<string, Partial<Record<"MR" | "GMS", { id: string; oa_number: string }>>> = {};
      for (const r of (data || []) as Array<{ id: string; oa_number: string; format: "MR" | "GMS"; cost_sheet_number: string | null }>) {
        if (!r.cost_sheet_number) continue;
        const slot = idx[r.cost_sheet_number] || {};
        // Prefer the most recent — keep the first one we see (orders aren't sorted, but
        // either record links the same OA family for the user's purposes).
        if (!slot[r.format]) slot[r.format] = { id: r.id, oa_number: r.oa_number };
        idx[r.cost_sheet_number] = slot;
      }
      setOaIndex(idx);
    })();
  }, [sheets]);

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
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      setUploading(false);
      return toast({ title: "Not signed in", variant: "destructive" });
    }
    const path = `${uid}/${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
    const up = await supabase.storage.from("cost-sheets").upload(path, file, { contentType: "application/pdf" });
    if (up.error) { setUploading(false); return toast({ title: "Upload failed", description: up.error.message, variant: "destructive" }); }

    const ins = await supabase.from("cost_sheets").insert({
      file_path: path, original_filename: file.name, status: "pending", user_id: uid,
    }).select().single();
    setUploading(false);
    if (ins.error) return toast({ title: "Save failed", description: ins.error.message, variant: "destructive" });

    await refresh();
    {
      // Fire-and-forget activity log
      import("@/lib/activity/log").then(({ logEvent }) => logEvent({
        module: "cost_sheet",
        event_type: "cost_sheet.uploaded",
        status: "info",
        title: "Cost sheet uploaded",
        message: file.name,
      }));
    }
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
    const extracted = (data as { extracted?: ExtractedCostSheet })?.extracted;
    if (extracted) {
      // Legacy synchronous response — apply immediately.
      toast({ title: "Cost sheet parsed", description: "Review and apply to your order." });
      const { data: row } = await supabase.from("cost_sheets").select("*").eq("id", id).maybeSingle();
      if (row) onApply(extracted, row as unknown as CostSheetRow);
    } else {
      // New async flow — parsing continues in background; realtime will deliver the result.
      toast({ title: "Parsing started", description: "AI extraction is running in the background…" });
    }
  }

  async function applySheet(sheet: CostSheetRow) {
    if (sheet.status === "parsing") return;
    if (sheet.status !== "parsed") return parseSheet(sheet.id);
    onApply(sheet.extracted, sheet);
    toast({ title: "Applied", description: sheet.original_filename });
  }

  // Triggers `onApply` after stamping the chosen format onto the extracted
  // payload. The OA chooser page reads this to decide which company's OA to
  // pre-fill. Other consumers ignore the format and behave as before.
  function applySheetFor(sheet: CostSheetRow, format: "MR" | "GMS") {
    if (sheet.status !== "parsed") return parseSheet(sheet.id);
    onApply(sheet.extracted, sheet, format);
  }

  function oaSlot(sheet: CostSheetRow, format: "MR" | "GMS") {
    const num = sheet.extracted?.cost_sheet_number || "";
    return num ? oaIndex[num]?.[format] : undefined;
  }

  async function deleteSheet(sheet: CostSheetRow) {
    if (!confirm(`Delete ${sheet.original_filename}?`)) return;
    await supabase.storage.from("cost-sheets").remove([sheet.file_path]);
    await supabase.from("cost_sheets").delete().eq("id", sheet.id);
  }

  async function openSheetInTab(sheet: CostSheetRow) {
    const { data, error } = await supabase.storage
      .from("cost-sheets").createSignedUrl(sheet.file_path, 600);
    if (error || !data?.signedUrl) {
      return toast({ title: "Could not open PDF", description: error?.message, variant: "destructive" });
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function downloadSheet(sheet: CostSheetRow) {
    const { data, error } = await supabase.storage
      .from("cost-sheets").createSignedUrl(sheet.file_path, 600, { download: sheet.original_filename });
    if (error || !data?.signedUrl) {
      return toast({ title: "Download failed", description: error?.message, variant: "destructive" });
    }
    window.location.href = data.signedUrl;
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
      <CardContent
        className="space-y-2"
        onDragOver={(e) => { e.preventDefault(); if (!isDragging) setIsDragging(true); }}
        onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleUpload(file);
        }}
      >
        <div
          onClick={() => fileInput.current?.click()}
          className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
            isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30"
          }`}
        >
          <Upload className={`h-6 w-6 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
          <p className="text-sm font-medium">
            {isDragging ? "Drop PDF to upload" : "Drag & drop a cost sheet PDF here"}
          </p>
          <p className="text-xs text-muted-foreground">or click to browse  AI will auto-fill the order fields below</p>
        </div>
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
                    {s.status === "parsed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isParsing}
                        onClick={() => parseSheet(s.id)}
                        title="Re-run AI extraction (use this to refresh Make values from the cost sheet)"
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-1" />Re-parse
                      </Button>
                    )}
                   <Button size="icon" variant="ghost" disabled={isParsing} onClick={() => openSheetInTab(s)} title="View PDF">
                     <Eye className="h-4 w-4" />
                   </Button>
                   <Button size="icon" variant="ghost" disabled={isParsing} onClick={() => downloadSheet(s)} title="Download PDF">
                     <Download className="h-4 w-4" />
                   </Button>
                   <Button size="sm" variant="default" disabled={isParsing} onClick={() => applySheet(s)}>
                     {isParsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                      s.status === "parsed" ? <><Wand2 className="h-3.5 w-3.5 mr-1" />Apply</> :
                      <><Wand2 className="h-3.5 w-3.5 mr-1" />Parse</>}
                   </Button>
                   <Button size="icon" variant="ghost" disabled={isParsing} onClick={() => deleteSheet(s)}><Trash2 className="h-4 w-4" /></Button>
                 </div>
                {s.status === "parsed" && (
                  <div className="pl-7 pr-2 flex flex-wrap gap-2">
                    {(["MR", "GMS"] as const).map((f) => {
                      const existing = oaSlot(s, f);
                      return existing ? (
                        <Button key={f} asChild size="sm" variant="secondary" className="h-7 text-xs">
                          <Link to={`/orders/${existing.id}`} title={existing.oa_number}>
                            <ExternalLink className="h-3 w-3 mr-1" />View {f} OA · <span className="font-mono ml-1 truncate max-w-[160px]">{existing.oa_number}</span>
                          </Link>
                        </Button>
                      ) : (
                        <Button key={f} size="sm" variant="outline" className="h-7 text-xs" onClick={() => applySheetFor(s, f)}>
                          <Plus className="h-3 w-3 mr-1" />Create {f} OA
                        </Button>
                      );
                    })}
                  </div>
                )}
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