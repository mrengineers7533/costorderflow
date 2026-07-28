import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import type { VendorItemPrice } from "@/lib/requisition/vendorPricing";
import { ConfirmBulkDeleteDialog } from "@/components/common/ConfirmBulkDeleteDialog";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

interface VendorLite { id: string; name: string; is_active: boolean }

type ItemRow = VendorItemPrice & {
  notes?: string | null;
  import_status?: string | null;
  import_issues?: string[] | null;
  source_row?: Record<string, string> | null;
  source_row_no?: number | null;
  source_file?: string | null;
};

type StatusFilter = "all" | "valid" | "pending";

/** Reasons a row still cannot be used as a normal vendor price. */
const computeIssues = (vendorName: string, material: string, price: string): string[] => {
  const out: string[] = [];
  if (!vendorName.trim()) out.push("Vendor name missing");
  if (!material.trim()) out.push("Item code missing (Material)");
  if (price.trim() === "") out.push("Price missing");
  else if (Number.isNaN(Number(price))) out.push("Invalid price format");
  return out;
};

const emptyForm = {
  vendor_id: "",
  vendor_name: "",
  material: "",
  size_model: "",
  unit: "",
  price: "",
  is_preferred: false,
  is_active: true,
  notes: "",
};

export default function AdminVendorItems() {
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [vendors, setVendors] = useState<VendorLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ItemRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [pendingDelete, setPendingDelete] = useState<ItemRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: vip }, { data: v }] = await Promise.all([
      sb.from("vendor_item_prices").select("*").order("material"),
      sb.from("vendors").select("id,name,is_active").order("name"),
    ]);
    setRows((vip || []) as ItemRow[]);
    setVendors((v || []) as VendorLite[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      const st = r.import_status || "ok";
      if (statusFilter === "valid" && st !== "ok") return false;
      if (statusFilter === "pending" && st === "ok") return false;
      if (!s) return true;
      return [r.material, r.size_model, r.vendor_name, r.unit].some((x) => (x || "").toLowerCase().includes(s));
    });
  }, [rows, q, statusFilter]);

  const pendingCount = useMemo(() => rows.filter((r) => (r.import_status || "ok") !== "ok").length, [rows]);

  const startNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const startEdit = (r: ItemRow) => {
    setEditing(r);
    setForm({
      vendor_id: r.vendor_id || "",
      vendor_name: r.vendor_name || "",
      material: r.material || "",
      size_model: r.size_model || "",
      unit: r.unit || "",
      price: r.price == null ? "" : String(r.price),
      is_preferred: !!r.is_preferred,
      is_active: r.is_active !== false,
      notes: (r as unknown as { notes?: string | null }).notes || "",
    });
    setOpen(true);
  };

  const save = async () => {
    const material = form.material.trim();
    const vendorName = form.vendor_id
      ? (vendors.find((v) => v.id === form.vendor_id)?.name || form.vendor_name.trim())
      : form.vendor_name.trim();
    const issues = computeIssues(vendorName, material, form.price);
    const wasImported = !!editing && (editing.import_status || "ok") !== "ok";
    if (issues.length && !wasImported) {
      if (!material) { toast.error("Material is required"); return; }
      if (!vendorName) { toast.error("Vendor is required"); return; }
    }
    const payload = {
      vendor_id: form.vendor_id || null,
      vendor_name: vendorName,
      material,
      size_model: form.size_model.trim() || null,
      unit: form.unit.trim() || null,
      price: form.price.trim() === "" ? null : Number(form.price),
      is_preferred: form.is_preferred,
      is_active: issues.length ? false : form.is_active,
      notes: form.notes.trim() || null,
      import_status: issues.length ? (editing?.import_status === "error" ? "error" : "pending") : "ok",
      import_issues: issues,
    };
    if (editing) {
      const { error } = await sb.from("vendor_item_prices").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await sb.from("vendor_item_prices").insert({ ...payload, created_by: u?.user?.id ?? null });
      if (error) { toast.error(error.message); return; }
    }
    toast.success(issues.length ? `Saved as pending — ${issues.join("; ")}` : "Saved and marked valid");
    setOpen(false);
    await load();
  };

  const togglePreferred = async (r: ItemRow) => {
    const { error } = await sb.from("vendor_item_prices").update({ is_preferred: !r.is_preferred }).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    await load();
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const { error } = await sb.from("vendor_item_prices").delete().eq("id", pendingDelete.id);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    setPendingDelete(null);
    toast.success("Item price deleted");
    await load();
  };

  return (
    <div className="container mx-auto px-4 lg:px-6 py-5">
      <AdminTabs title="Vendor Item Master" description="Vendor-wise item prices used to auto-fill Price / Vendor on requisitions." />
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Input className="h-8 max-w-xs" placeholder="Search material / vendor…" value={q} onChange={(e) => setQ(e.target.value)} />
          {([["all", "All"], ["valid", "Valid"], ["pending", `Needs correction${pendingCount ? ` (${pendingCount})` : ""}`]] as [StatusFilter, string][]).map(([v, label]) => (
            <Button key={v} size="sm" variant={statusFilter === v ? "default" : "outline"} className="h-8" onClick={() => setStatusFilter(v)}>{label}</Button>
          ))}
        </div>
        <Button size="sm" onClick={startNew}><Plus className="h-4 w-4 mr-1" />Add item price</Button>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/40 border-b">
                <tr>
                  <th className="text-left py-2 px-2">Material</th>
                  <th className="text-left py-2 px-2">Size / Model</th>
                  <th className="text-left py-2 px-2">UOM</th>
                  <th className="text-left py-2 px-2">Vendor</th>
                  <th className="text-right py-2 px-2">Price</th>
                  <th className="text-left py-2 px-2">Preferred</th>
                  <th className="text-left py-2 px-2">Status</th>
                  <th className="text-left py-2 px-2">Import status</th>
                  <th className="text-left py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No vendor item prices yet.</td></tr>
                ) : filtered.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 px-2 font-medium">{r.material || <span className="text-muted-foreground">—</span>}</td>
                    <td className="py-2 px-2 text-xs">{r.size_model || "—"}</td>
                    <td className="py-2 px-2 text-xs">{r.unit || "—"}</td>
                    <td className="py-2 px-2 text-xs">{r.vendor_name || "—"}</td>
                    <td className="py-2 px-2 text-right text-xs">
                      {r.price == null ? "—" : Number(r.price).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-2">
                      <button onClick={() => togglePreferred(r)} title="Toggle preferred vendor">
                        <Star className={`h-4 w-4 ${r.is_preferred ? "fill-amber-400 text-amber-500" : "text-muted-foreground"}`} />
                      </button>
                    </td>
                    <td className="py-2 px-2">
                      {r.is_active !== false
                        ? <Badge className="bg-emerald-600 hover:bg-emerald-600 text-[10px]">Active</Badge>
                        : <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                    </td>
                    <td className="py-2 px-2">
                      {(r.import_status || "ok") === "ok" ? (
                        <Badge variant="secondary" className="text-[10px]">Valid</Badge>
                      ) : (
                        <Badge
                          variant="destructive"
                          className="text-[10px] cursor-help"
                          title={(r.import_issues || []).join("\n")}
                        >
                          {r.import_status === "error" ? "Import error" : "Pending"}
                          {r.source_row_no ? ` · row ${r.source_row_no}` : ""}
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-7" onClick={() => startEdit(r)}><Pencil className="h-3 w-3" /></Button>
                        <Button size="sm" variant="outline" className="h-7" title="Delete" onClick={() => setPendingDelete(r)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-base">{editing ? "Edit item price" : "Add item price"}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-xs">
            {editing && (editing.import_status || "ok") !== "ok" && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 space-y-1">
                <p className="font-medium text-destructive">Needs correction</p>
                <ul className="list-disc pl-4 text-muted-foreground">
                  {(editing.import_issues || []).map((x, i) => <li key={i}>{x}</li>)}
                </ul>
                {editing.source_row && (
                  <details className="pt-1">
                    <summary className="cursor-pointer text-muted-foreground">
                      Original Excel row{editing.source_row_no ? ` ${editing.source_row_no}` : ""}
                      {editing.source_file ? ` — ${editing.source_file}` : ""}
                    </summary>
                    <div className="pt-1 space-y-0.5">
                      {Object.entries(editing.source_row).map(([kk, vv]) => (
                        <div key={kk} className="flex gap-2"><span className="text-muted-foreground min-w-28">{kk}</span><span>{vv || "—"}</span></div>
                      ))}
                    </div>
                  </details>
                )}
                <p className="text-muted-foreground">Fix the fields below and save to mark this row valid.</p>
              </div>
            )}
            <div>
              <Label>Vendor *</Label>
              <Select value={form.vendor_id} onValueChange={(v) => setForm({ ...form, vendor_id: v })}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                className="h-8 mt-1"
                placeholder="…or type a vendor name"
                value={form.vendor_name}
                onChange={(e) => setForm({ ...form, vendor_name: e.target.value, vendor_id: "" })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Material *</Label><Input className="h-8" value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} /></div>
              <div><Label>Size / Model</Label><Input className="h-8" value={form.size_model} onChange={(e) => setForm({ ...form, size_model: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>UOM</Label><Input className="h-8" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
              <div><Label>Price</Label><Input className="h-8" type="number" placeholder="Can be filled later" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
            </div>
            <div className="flex gap-4 items-center pt-1">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={form.is_preferred} onChange={(e) => setForm({ ...form, is_preferred: e.target.checked })} /> Preferred vendor
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active
              </label>
            </div>
            <div><Label>Notes</Label><Input className="h-8" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmBulkDeleteDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title="Delete vendor item price"
        description="This permanently removes the item price from the Vendor Item Master."
        items={pendingDelete ? [`${pendingDelete.material}${pendingDelete.size_model ? ` (${pendingDelete.size_model})` : ""} — ${pendingDelete.vendor_name}`] : []}
        busy={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}