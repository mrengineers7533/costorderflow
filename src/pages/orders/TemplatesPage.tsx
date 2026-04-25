import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Upload, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  FIELD_LABELS,
  type FieldMap,
  type FieldMapKey,
  type FieldPlacement,
  type OrderFormat,
  type OrderTemplate,
} from "@/lib/orders/types";
import { publicTemplateUrl } from "@/lib/orders/templatePdf";

// Lazy-load pdfjs only on this page
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const FIELD_KEYS = Object.keys(FIELD_LABELS) as FieldMapKey[];

export default function TemplatesPage() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<OrderFormat>("MR");

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { navigate("/auth"); return; }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
    })();
  }, [navigate]);

  if (isAdmin === null) return <div className="min-h-screen flex items-center justify-center">Loading…</div>;

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" asChild><Link to="/orders"><ArrowLeft className="mr-2 h-4 w-4" />Back to Orders</Link></Button>
          <h1 className="text-xl font-semibold">Order Templates</h1>
        </div>

        {!isAdmin && <PromoteCard onDone={() => setIsAdmin(true)} />}

        {isAdmin && (
          <Tabs value={tab} onValueChange={(v) => setTab(v as OrderFormat)}>
            <TabsList>
              <TabsTrigger value="MR">MR Engineers</TabsTrigger>
              <TabsTrigger value="GMS">GMS</TabsTrigger>
            </TabsList>
            <TabsContent value="MR"><TemplateEditor format="MR" /></TabsContent>
            <TabsContent value="GMS"><TemplateEditor format="GMS" /></TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

function PromoteCard({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function promote() {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    // Allow only if no admin exists yet
    const { count } = await supabase.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) > 0) {
      toast({ title: "Admin already exists", description: "Ask an existing admin to grant you access.", variant: "destructive" });
      setBusy(false);
      return;
    }
    const { error } = await supabase.from("user_roles").insert({ user_id: u.user.id, role: "admin" });
    setBusy(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "You are now admin" });
    onDone();
  }
  return (
    <Card>
      <CardHeader><CardTitle>Admin access required</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">Templates are managed by admins. If no admin exists yet, you can claim the role.</p>
        <Button onClick={promote} disabled={busy}>Make me admin (first user only)</Button>
      </CardContent>
    </Card>
  );
}

function TemplateEditor({ format }: { format: OrderFormat }) {
  const [template, setTemplate] = useState<OrderTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [fieldMap, setFieldMap] = useState<FieldMap>({});
  const [selectedField, setSelectedField] = useState<FieldMapKey>("oa_number");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Load template
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("order_templates").select("*").eq("format", format).maybeSingle();
      if (data) {
        const t = data as unknown as OrderTemplate;
        setTemplate(t);
        setFieldMap(t.field_map || {});
        setPdfUrl(publicTemplateUrl(t.file_path));
      } else {
        setTemplate(null); setFieldMap({}); setPdfUrl(null);
      }
      setLoading(false);
    })();
  }, [format]);

  // Render current page
  useEffect(() => {
    if (!pdfUrl || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      const task = pdfjsLib.getDocument(pdfUrl);
      const doc = await task.promise;
      if (cancelled) return;
      setPageCount(doc.numPages);
      const page = await doc.getPage(Math.min(pageNum, doc.numPages));
      const containerW = wrapRef.current?.clientWidth || 800;
      const viewport = page.getViewport({ scale: 1 });
      const scale = containerW / viewport.width;
      const scaled = page.getViewport({ scale });
      const canvas = canvasRef.current!;
      canvas.width = scaled.width;
      canvas.height = scaled.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport: scaled, canvas }).promise;
    })();
    return () => { cancelled = true; };
  }, [pdfUrl, pageNum]);

  async function uploadFile(file: File) {
    const path = `${format}/template.pdf`;
    const { error: upErr } = await supabase.storage
      .from("order-templates")
      .upload(path, file, { upsert: true, contentType: "application/pdf" });
    if (upErr) return toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });

    // Determine page count
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    const pages = doc.numPages;

    const { data: u } = await supabase.auth.getUser();
    const payload = { format, file_path: path, page_count: pages, field_map: fieldMap as never, updated_by: u.user?.id };
    const { data, error } = await supabase
      .from("order_templates")
      .upsert(payload as never, { onConflict: "format" })
      .select()
      .single();
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    const t = data as unknown as OrderTemplate;
    setTemplate(t);
    // Cache-bust the URL so the new file is fetched
    setPdfUrl(publicTemplateUrl(t.file_path) + `?t=${Date.now()}`);
    setPageNum(1);
    toast({ title: "Template uploaded", description: `${pages} page(s)` });
  }

  async function deleteTemplate() {
    if (!template) return;
    if (!confirm("Delete this template and all field mappings?")) return;
    await supabase.storage.from("order-templates").remove([template.file_path]);
    await supabase.from("order_templates").delete().eq("id", template.id);
    setTemplate(null); setPdfUrl(null); setFieldMap({});
    toast({ title: "Template removed" });
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const existing = fieldMap[selectedField];
    const placement: FieldPlacement = {
      page: pageNum,
      x,
      y,
      width: existing?.width ?? (selectedField === "items_table" ? 0.9 : 0.4),
      fontSize: existing?.fontSize ?? (selectedField === "items_table" ? 9 : 10),
      align: existing?.align ?? "left",
      bold: existing?.bold ?? false,
    };
    setFieldMap({ ...fieldMap, [selectedField]: placement });
  }

  async function saveMap() {
    if (!template) return;
    const { error } = await supabase
      .from("order_templates")
      .update({ field_map: fieldMap as never })
      .eq("id", template.id);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: "Field map saved" });
  }

  if (loading) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{format} Template</CardTitle>
          <div className="flex gap-2">
            <label className="inline-flex">
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
              <Button asChild variant="outline" size="sm"><span><Upload className="h-4 w-4 mr-1" />{template ? "Replace PDF" : "Upload PDF"}</span></Button>
            </label>
            {template && <Button variant="ghost" size="sm" onClick={deleteTemplate}><Trash2 className="h-4 w-4 mr-1" />Delete</Button>}
          </div>
        </CardHeader>
        <CardContent>
          {!template ? (
            <p className="text-sm text-muted-foreground">No template uploaded yet. Upload a PDF that will be used as the visual background for {format} orders.</p>
          ) : (
            <div className="grid grid-cols-12 gap-4">
              {/* Field picker */}
              <div className="col-span-3 space-y-2 max-h-[600px] overflow-y-auto">
                <Label className="text-xs uppercase tracking-wide">Click a field, then click on the PDF</Label>
                <div className="space-y-1">
                  {FIELD_KEYS.map((k) => {
                    const has = !!fieldMap[k];
                    const active = selectedField === k;
                    return (
                      <button
                        key={k}
                        onClick={() => setSelectedField(k)}
                        className={`w-full text-left px-2 py-1.5 rounded text-sm border ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted border-border"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{FIELD_LABELS[k]}</span>
                          {has && <Badge variant={active ? "secondary" : "outline"} className="text-xs">p{fieldMap[k]!.page}</Badge>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Preview */}
              <div className="col-span-9 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm">Page {pageNum} / {pageCount}</div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={pageNum <= 1} onClick={() => setPageNum(pageNum - 1)}>Prev</Button>
                    <Button size="sm" variant="outline" disabled={pageNum >= pageCount} onClick={() => setPageNum(pageNum + 1)}>Next</Button>
                    <Button size="sm" onClick={saveMap}>Save Field Map</Button>
                  </div>
                </div>

                <PlacementInspector
                  fieldKey={selectedField}
                  placement={fieldMap[selectedField]}
                  onChange={(p) => setFieldMap({ ...fieldMap, [selectedField]: p })}
                  onClear={() => { const m = { ...fieldMap }; delete m[selectedField]; setFieldMap(m); }}
                />

                <div ref={wrapRef} className="relative border rounded overflow-hidden bg-white">
                  <canvas ref={canvasRef} onClick={handleCanvasClick} className="block w-full cursor-crosshair" />
                  {/* Overlay markers for fields on this page */}
                  <div className="pointer-events-none absolute inset-0">
                    {(Object.keys(fieldMap) as FieldMapKey[]).map((k) => {
                      const p = fieldMap[k];
                      if (!p || p.page !== pageNum) return null;
                      const isSelected = k === selectedField;
                      return (
                        <div
                          key={k}
                          className={`absolute -translate-y-full text-[10px] px-1 rounded-t ${isSelected ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"}`}
                          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                        >
                          {FIELD_LABELS[k]}
                          <div className={`absolute left-0 ${isSelected ? "bg-primary" : "bg-accent"}`}
                            style={{ top: 0, width: `${(p.width || 0.02) * 100 / 1}%`, height: 2, minWidth: 8 }} />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Tip: Choose a field from the left, then click on the PDF where its top-left corner should appear. Use the inspector above to fine-tune width, font size, and alignment.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PlacementInspector({
  fieldKey, placement, onChange, onClear,
}: {
  fieldKey: FieldMapKey;
  placement: FieldPlacement | undefined;
  onChange: (p: FieldPlacement) => void;
  onClear: () => void;
}) {
  if (!placement) {
    return <div className="rounded border bg-card p-2 text-xs text-muted-foreground">Selected: <strong>{FIELD_LABELS[fieldKey]}</strong> — not placed yet. Click on the PDF below.</div>;
  }
  const update = (patch: Partial<FieldPlacement>) => onChange({ ...placement, ...patch });
  return (
    <div className="rounded border bg-card p-2 grid grid-cols-12 gap-2 items-end text-xs">
      <div className="col-span-12 sm:col-span-3">
        <div className="font-medium truncate">{FIELD_LABELS[fieldKey]}</div>
        <div className="text-muted-foreground">Page {placement.page} · ({placement.x.toFixed(3)}, {placement.y.toFixed(3)})</div>
      </div>
      <NumField label="Width %" value={Math.round((placement.width || 0) * 100)} onChange={(v) => update({ width: v / 100 })} />
      <NumField label="Font" value={placement.fontSize || 10} onChange={(v) => update({ fontSize: v })} />
      <div className="col-span-6 sm:col-span-2">
        <Label className="text-xs">Align</Label>
        <select className="w-full h-8 rounded border bg-background px-2"
          value={placement.align || "left"}
          onChange={(e) => update({ align: e.target.value as "left" | "right" | "center" })}>
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </div>
      <div className="col-span-6 sm:col-span-2 flex items-center gap-2">
        <input type="checkbox" checked={!!placement.bold} onChange={(e) => update({ bold: e.target.checked })} /> Bold
      </div>
      <div className="col-span-12 sm:col-span-1 text-right">
        <Button size="sm" variant="ghost" onClick={onClear}>Clear</Button>
      </div>
    </div>
  );
}
function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="col-span-4 sm:col-span-2">
      <Label className="text-xs">{label}</Label>
      <Input className="h-8" type="number" value={value} onChange={(e) => onChange(+e.target.value || 0)} />
    </div>
  );
}