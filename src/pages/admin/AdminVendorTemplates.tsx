import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import {
  VENDOR_HEADERS,
  VENDOR_ITEM_HEADERS,
  exportVendorTemplate,
  exportVendorItemTemplate,
  parseVendorWorkbook,
  parseVendorItemWorkbook,
  type VendorRow,
  type VendorItemParsedRow,
} from "@/lib/vendors/templates";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Kind = "vendors" | "items";
interface PlanEntry { label: string; id?: string; payload: Record<string, unknown>; issues: string[]; row?: number }
interface Planned {
  kind: Kind;
  total: number;
  create: PlanEntry[];
  update: (PlanEntry & { id: string })[];
  skipped: { row: number; reason: string }[];
}

interface ImportSummary {
  kind: Kind;
  total: number;
  created: number;
  updated: number;
  pending: number;
  failed: { label: string; reason: string }[];
  skipped: { row: number; reason: string }[];
  issues: { row?: number; label: string; reasons: string[] }[];
}

/** Drop blank/null optional fields so an incomplete sheet never wipes existing data. */
const pruneBlank = (payload: Record<string, unknown>) => {
  const out: Record<string, unknown> = {};
  for (const [k2, v] of Object.entries(payload)) {
    if (v === null || v === undefined || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k2] = v;
  }
  return out;
};

const k = (s: string | null | undefined) => (s || "").trim().toLowerCase();

export default function AdminVendorTemplates() {
  const [plan, setPlan] = useState<Planned | null>(null);
  const [busy, setBusy] = useState(false);
  const vendorInput = useRef<HTMLInputElement>(null);
  const itemInput = useRef<HTMLInputElement>(null);

  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const buildVendorPlan = async (rows: VendorRow[], skipped: Planned["skipped"], total: number): Promise<Planned> => {
    const { data } = await sb.from("vendors").select("id,name");
    const byName = new Map<string, string>();
    (data || []).forEach((v: { id: string; name: string }) => byName.set(k(v.name), v.id));
    const p: Planned = { kind: "vendors", total, create: [], update: [], skipped };
    for (const r of rows) {
      const id = byName.get(k(r.name));
      if (id) p.update.push({ label: r.name, id, payload: { ...r }, issues: [] });
      else p.create.push({ label: r.name, payload: { ...r }, issues: [] });
    }
    return p;
  };

  const buildItemPlan = async (rows: VendorItemParsedRow[], _skipped: Planned["skipped"], total: number, fileName: string): Promise<Planned> => {
    const [{ data: vendors }, { data: existing }] = await Promise.all([
      sb.from("vendors").select("id,name"),
      sb.from("vendor_item_prices").select("id,vendor_name,material,size_model"),
    ]);
    const byName = new Map<string, string>();
    (vendors || []).forEach((v: { id: string; name: string }) => byName.set(k(v.name), v.id));
    const existingMap = new Map<string, string>();
    (existing || []).forEach((e: { id: string; vendor_name: string; material: string; size_model: string | null }) =>
      existingMap.set(`${k(e.vendor_name)}|${k(e.material)}|${k(e.size_model)}`, e.id));

    const p: Planned = { kind: "items", total, create: [], update: [], skipped: [] };
    rows.forEach((r) => {
      const vendor_id = byName.get(k(r.vendor_name));
      const issues = [...r.issues];
      if (r.vendor_name && !vendor_id) issues.push(`Vendor not found in Vendor Master: "${r.vendor_name}"`);
      const status = issues.length ? "pending" : "ok";
      const payload = {
        vendor_id: vendor_id ?? null,
        vendor_name: r.vendor_name,
        material: r.material,
        size_model: r.size_model,
        unit: r.unit,
        price: r.price,
        is_preferred: r.is_preferred,
        is_active: status === "ok" ? r.is_active : false,
        notes: r.notes,
        import_status: status,
        import_issues: issues,
        source_row: r.source,
        source_row_no: r.row_no,
        source_file: fileName,
      };
      const label = `Row ${r.row_no}: ${r.material || "(no material)"}${r.size_model ? ` (${r.size_model})` : ""} — ${r.vendor_name || "(no vendor)"}`;
      const id = existingMap.get(`${k(r.vendor_name)}|${k(r.material)}|${k(r.size_model)}`);
      if (id && r.vendor_name && r.material) p.update.push({ label, id, payload, issues, row: r.row_no });
      else p.create.push({ label, payload, issues, row: r.row_no });
    });
    return p;
  };

  const onFile = async (kind: Kind, file: File | undefined) => {
    if (!file) return;
    try {
      setBusy(true);
      const buf = await file.arrayBuffer();
      const parsed = kind === "vendors" ? parseVendorWorkbook(buf) : parseVendorItemWorkbook(buf);
      if (!parsed.rows.length && !parsed.skipped.length) { toast.error("No rows found in the file"); return; }
      const built = kind === "vendors"
        ? await buildVendorPlan(parsed.rows as VendorRow[], parsed.skipped, parsed.total)
        : await buildItemPlan(parsed.rows as VendorItemParsedRow[], parsed.skipped, parsed.total, file.name);
      setPlan(built);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the file");
    } finally {
      setBusy(false);
      if (vendorInput.current) vendorInput.current.value = "";
      if (itemInput.current) itemInput.current.value = "";
    }
  };

  const applyPlan = async () => {
    if (!plan) return;
    setBusy(true);
    const table = plan.kind === "vendors" ? "vendors" : "vendor_item_prices";
    const { data: u } = await supabase.auth.getUser();
    const createdBy = u?.user?.id ?? null;
    let created = 0, updated = 0;
    const failed: { label: string; reason: string }[] = [];
    const isItems = plan.kind === "items";
    /** Import bookkeeping columns must always be written, even when blank-pruned. */
    const meta = (payload: Record<string, unknown>) => (isItems
      ? {
          import_status: payload.import_status,
          import_issues: payload.import_issues,
          source_row: payload.source_row,
          source_row_no: payload.source_row_no,
          source_file: payload.source_file,
          is_active: payload.is_active,
        }
      : {});
    for (const row of plan.update) {
      const patch = { ...pruneBlank(row.payload), ...meta(row.payload) };
      if (Object.keys(patch).length === 0) { updated++; continue; }
      const { error } = await sb.from(table).update(patch).eq("id", row.id);
      if (error) failed.push({ label: row.label, reason: error.message }); else updated++;
    }
    for (const row of plan.create) {
      const { error } = await sb.from(table).insert({ ...row.payload, created_by: createdBy });
      if (!error) { created++; continue; }
      if (!isItems) { failed.push({ label: row.label, reason: error.message }); continue; }
      // Never lose an Excel row: retry as an error record holding the original data.
      const { error: e2 } = await sb.from(table).insert({
        vendor_name: row.payload.vendor_name || null,
        material: row.payload.material || null,
        is_active: false,
        import_status: "error",
        import_issues: [...(row.issues || []), `Import error: ${error.message}`],
        source_row: row.payload.source_row,
        source_row_no: row.payload.source_row_no,
        source_file: row.payload.source_file,
        created_by: createdBy,
      });
      if (e2) failed.push({ label: row.label, reason: error.message }); else created++;
    }
    const withIssues = [...plan.create, ...plan.update].filter((r) => r.issues.length);
    const pending = withIssues.length;
    setBusy(false);
    setSummary({
      kind: plan.kind,
      total: plan.total,
      created,
      updated,
      pending,
      failed,
      skipped: plan.skipped,
      issues: withIssues.map((r) => ({ row: r.row, label: r.label, reasons: r.issues })),
    });
    setPlan(null);
    if (failed.length) toast.warning(`Imported with ${failed.length} failed row(s)`);
    else if (pending) toast.success(`Imported — ${created} created, ${updated} updated, ${pending} need correction`);
    else toast.success(`Imported — ${created} created, ${updated} updated`);
  };

  const cards: { kind: Kind; title: string; desc: string; cols: readonly string[]; download: () => void; ref: React.RefObject<HTMLInputElement> }[] = [
    { kind: "vendors", title: "Vendor Master", desc: "Vendor records used across PO creation.", cols: VENDOR_HEADERS, download: exportVendorTemplate, ref: vendorInput },
    { kind: "items", title: "Vendor Item Master", desc: "Vendor-wise material prices used to auto-fill Price / Vendor.", cols: VENDOR_ITEM_HEADERS, download: exportVendorItemTemplate, ref: itemInput },
  ];

  return (
    <div className="container mx-auto px-4 lg:px-6 py-5">
      <AdminTabs title="Vendor Templates" description="Download an Excel template, fill it in, and upload it straight into the master." />
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((c) => (
          <Card key={c.kind}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{c.title}</CardTitle>
              <p className="text-xs text-muted-foreground">{c.desc}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1">
                {c.cols.map((h) => <Badge key={h} variant="secondary" className="text-[10px] font-normal">{h}</Badge>)}
              </div>
              <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                <li>Keep the header row exactly as provided.</li>
                <li>Existing records are updated; new ones are created.</li>
                <li>Blank optional columns are allowed — fill them in later via Edit.</li>
                {c.kind === "items" && <li>Upload the Vendor Master first so vendors can be matched.</li>}
              </ul>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={c.download}>
                  <Download className="h-4 w-4 mr-1" />Download template
                </Button>
                <Button size="sm" disabled={busy} onClick={() => c.ref.current?.click()}>
                  <Upload className="h-4 w-4 mr-1" />Upload filled file
                </Button>
                <input
                  ref={c.ref}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => onFile(c.kind, e.target.files?.[0])}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!plan} onOpenChange={(o) => !o && setPlan(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              Review import — {plan?.kind === "vendors" ? "Vendor Master" : "Vendor Item Master"}
            </DialogTitle>
          </DialogHeader>
          <div className="text-xs space-y-3 max-h-[55vh] overflow-y-auto">
            <div className="flex gap-2">
              <Badge variant="outline">{plan?.total ?? 0} total rows</Badge>
              <Badge className="bg-emerald-600 hover:bg-emerald-600">{plan?.create.length ?? 0} to create</Badge>
              <Badge variant="secondary">{plan?.update.length ?? 0} to update</Badge>
              <Badge variant="outline">{plan?.skipped.length ?? 0} skipped</Badge>
            </div>
            {!!plan?.create.length && (
              <div>
                <p className="font-medium mb-1">Create</p>
                <ul className="space-y-0.5 text-muted-foreground">{plan.create.map((r, i) => <li key={i}>{r.label}</li>)}</ul>
              </div>
            )}
            {!!plan?.update.length && (
              <div>
                <p className="font-medium mb-1">Update</p>
                <ul className="space-y-0.5 text-muted-foreground">{plan.update.map((r, i) => <li key={i}>{r.label}</li>)}</ul>
              </div>
            )}
            {!!plan?.skipped.length && (
              <div>
                <p className="font-medium mb-1">Skipped</p>
                <ul className="space-y-0.5 text-muted-foreground">{plan.skipped.map((r, i) => <li key={i}>Row {r.row}: {r.reason}</li>)}</ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setPlan(null)}>Cancel</Button>
            <Button size="sm" disabled={busy || !((plan?.create.length ?? 0) + (plan?.update.length ?? 0))} onClick={applyPlan}>
              Confirm import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!summary} onOpenChange={(o) => !o && setSummary(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              Import summary — {summary?.kind === "vendors" ? "Vendor Master" : "Vendor Item Master"}
            </DialogTitle>
          </DialogHeader>
          <div className="text-xs space-y-3 max-h-[55vh] overflow-y-auto">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{summary?.total ?? 0} total rows</Badge>
              <Badge className="bg-emerald-600 hover:bg-emerald-600">{summary?.created ?? 0} imported</Badge>
              <Badge variant="secondary">{summary?.updated ?? 0} updated</Badge>
              <Badge variant="destructive">{(summary?.failed.length ?? 0) + (summary?.skipped.length ?? 0)} skipped / failed</Badge>
            </div>
            {!!summary?.skipped.length && (
              <div>
                <p className="font-medium mb-1">Skipped rows</p>
                <ul className="space-y-0.5 text-muted-foreground">{summary.skipped.map((r, i) => <li key={i}>Row {r.row}: {r.reason}</li>)}</ul>
              </div>
            )}
            {!!summary?.failed.length && (
              <div>
                <p className="font-medium mb-1">Failed rows</p>
                <ul className="space-y-0.5 text-muted-foreground">{summary.failed.map((r, i) => <li key={i}>{r.label}: {r.reason}</li>)}</ul>
              </div>
            )}
            <p className="text-muted-foreground">Incomplete records were imported with blank fields — complete them anytime using Edit in the master.</p>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={() => setSummary(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
