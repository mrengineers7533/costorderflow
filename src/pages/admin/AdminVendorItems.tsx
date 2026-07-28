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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

interface VendorLite { id: string; name: string; is_active: boolean }

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
  const [rows, setRows] = useState<VendorItemPrice[]>([]);
  const [vendors, setVendors] = useState<VendorLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VendorItemPrice | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    const [{ data: vip }, { data: v }] = await Promise.all([
      sb.from("vendor_item_prices").select("*").order("material"),
      sb.from("vendors").select("id,name,is_active").order("name"),
    ]);
    setRows((vip || []) as VendorItemPrice[]);
    setVendors((v || []) as VendorLite[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.material, r.size_model, r.vendor_name, r.unit].some((x) => (x || "").toLowerCase().includes(s)));
  }, [rows, q]);

  const startNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const startEdit = (r: VendorItemPrice) => {
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
      notes: "",
    });
    setOpen(true);
  };

  const save = async () => {
    const material = form.material.trim();
    const vendorName = form.vendor_id
      ? (vendors.find((v) => v.id === form.vendor_id)?.name || form.vendor_name.trim())
      : form.vendor_name.trim();
    if (!material) { toast.error("Material is required"); return; }
    if (!vendorName) { toast.error("Vendor is required"); return; }
    const payload = {
      vendor_id: form.vendor_id || null,
      vendor_name: vendorName,
      material,
      size_model: form.size_model.trim() || null,
      unit: form.unit.trim() || null,
      price: form.price.trim() === "" ? null : Number(form.price),
      is_preferred: form.is_preferred,
      is_active: form.is_active,
      notes: form.notes.trim() || null,
    };
    if (editing) {
      const { error } = await sb.from("vendor_item_prices").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await sb.from("vendor_item_prices").insert({ ...payload, created_by: u?.user?.id ?? null });
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Saved");
    setOpen(false);
    await load();
  };

  const togglePreferred = async (r: VendorItemPrice) => {
    const { error } = await sb.from("vendor_item_prices").update({ is_preferred: !r.is_preferred }).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    await load();
  };

  const remove = async (r: VendorItemPrice) => {
    if (!window.confirm(`Delete ${r.material} — ${r.vendor_name}?`)) return;
    const { error } = await sb.from("vendor_item_prices").delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    await load();
  };

  return (
    <div className="container mx-auto px-4 lg:px-6 py-5">
      <AdminTabs title="Vendor Item Master" description="Vendor-wise item prices used to auto-fill Price / Vendor on requisitions." />
      <div className="flex items-center justify-between gap-2 mb-3">
        <Input className="h-8 max-w-xs" placeholder="Search material / vendor…" value={q} onChange={(e) => setQ(e.target.value)} />
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
                  <th className="text-left py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No vendor item prices yet.</td></tr>
                ) : filtered.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 px-2 font-medium">{r.material}</td>
                    <td className="py-2 px-2 text-xs">{r.size_model || "—"}</td>
                    <td className="py-2 px-2 text-xs">{r.unit || "—"}</td>
                    <td className="py-2 px-2 text-xs">{r.vendor_name}</td>
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
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-7" onClick={() => startEdit(r)}><Pencil className="h-3 w-3" /></Button>
                        <Button size="sm" variant="outline" className="h-7" onClick={() => remove(r)}><Trash2 className="h-3 w-3" /></Button>
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
            <div>
              <Label>Vendor *</Label>
              <Select value={form.vendor_id} onValueChange={(v) => setForm({ ...form, vendor_id: v })}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Material *</Label><Input className="h-8" value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} /></div>
              <div><Label>Size / Model</Label><Input className="h-8" value={form.size_model} onChange={(e) => setForm({ ...form, size_model: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>UOM</Label><Input className="h-8" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
              <div><Label>Price</Label><Input className="h-8" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
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
    </div>
  );
}