import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Plus, Power } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

interface Vendor {
  id: string;
  name: string;
  categories: string[];
  address: string | null;
  gstin: string | null;
  state_code: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  payment_terms: string | null;
  notes: string | null;
  is_active: boolean;
}

const emptyForm = {
  name: "", address: "", gstin: "", state_code: "", contact_person: "", phone: "", email: "", payment_terms: "NEFT/RTGS",
  notes: "",
  cat_steel: false, cat_machine: false, cat_3p: false,
};

export default function AdminVendors() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    const { data } = await sb.from("vendors").select("*").order("name");
    setVendors((data || []) as Vendor[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const startNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const startEdit = (v: Vendor) => {
    setEditing(v);
    setForm({
      name: v.name, address: v.address || "", gstin: v.gstin || "", state_code: v.state_code || "",
      contact_person: v.contact_person || "", phone: v.phone || "", email: v.email || "",
      payment_terms: v.payment_terms || "",
      notes: v.notes || "",
      cat_steel: v.categories.includes("steel"),
      cat_machine: v.categories.includes("machine"),
      cat_3p: v.categories.includes("3p"),
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    const cats: string[] = [];
    if (form.cat_steel) cats.push("steel");
    if (form.cat_machine) cats.push("machine");
    if (form.cat_3p) cats.push("3p");
    if (cats.length === 0) { toast.error("Pick at least one category"); return; }
    const payload = {
      name: form.name.trim(), categories: cats,
      address: form.address.trim() || null, gstin: form.gstin.trim() || null, state_code: form.state_code.trim() || null,
      contact_person: form.contact_person.trim() || null, phone: form.phone.trim() || null,
      email: form.email.trim() || null, payment_terms: form.payment_terms.trim() || null,
      notes: form.notes.trim() || null,
    };
    if (editing) {
      const { error } = await sb.from("vendors").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await sb.from("vendors").insert({ ...payload, created_by: u?.user?.id ?? null });
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Saved");
    setOpen(false);
    await load();
  };

  const toggleActive = async (v: Vendor) => {
    const { error } = await sb.from("vendors").update({ is_active: !v.is_active }).eq("id", v.id);
    if (error) { toast.error(error.message); return; }
    await load();
  };

  return (
    <div className="container mx-auto px-4 lg:px-6 py-5">
      <AdminTabs title="Vendors" description="Manage vendor master for PO creation." />
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={startNew}><Plus className="h-4 w-4 mr-1" />Add vendor</Button>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/40 border-b">
                <tr>
                  <th className="text-left py-2 px-2">Name</th>
                  <th className="text-left py-2 px-2">Categories</th>
                  <th className="text-left py-2 px-2">GSTIN</th>
                  <th className="text-left py-2 px-2">Contact</th>
                  <th className="text-left py-2 px-2">Email</th>
                  <th className="text-left py-2 px-2">Phone</th>
                  <th className="text-left py-2 px-2">Status</th>
                  <th className="text-left py-2 px-2">Address</th>
                  <th className="text-left py-2 px-2">Remarks</th>
                  <th className="text-left py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {vendors.length === 0 ? (
                  <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">No vendors yet.</td></tr>
                ) : vendors.map((v) => (
                  <tr key={v.id} className="border-b last:border-0">
                    <td className="py-2 px-2 font-medium">{v.name}</td>
                    <td className="py-2 px-2">
                      <div className="flex gap-1">
                        {v.categories.map((c) => <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>)}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-xs">{v.gstin || "—"}</td>
                    <td className="py-2 px-2 text-xs">{v.contact_person || "—"}</td>
                    <td className="py-2 px-2 text-xs">{v.email || "—"}</td>
                    <td className="py-2 px-2 text-xs">{v.phone || "—"}</td>
                    <td className="py-2 px-2">
                      {v.is_active
                        ? <Badge className="bg-emerald-600 hover:bg-emerald-600 text-[10px]">Active</Badge>
                        : <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                    </td>
                    <td className="py-2 px-2 text-xs max-w-[220px] truncate" title={v.address || ""}>{v.address || "—"}</td>
                    <td className="py-2 px-2 text-xs max-w-[220px] truncate" title={v.notes || ""}>{v.notes || "—"}</td>
                    <td className="py-2 px-2">
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-7" onClick={() => startEdit(v)}><Pencil className="h-3 w-3" /></Button>
                        <Button size="sm" variant="outline" className="h-7" onClick={() => toggleActive(v)}><Power className="h-3 w-3" /></Button>
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
          <DialogHeader><DialogTitle className="text-base">{editing ? "Edit vendor" : "Add vendor"}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-xs">
            <div><Label>Name *</Label><Input className="h-8" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="flex gap-3 items-center">
              <Label className="text-xs">Categories:</Label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={form.cat_steel} onChange={(e) => setForm({ ...form, cat_steel: e.target.checked })} /> Steel</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={form.cat_machine} onChange={(e) => setForm({ ...form, cat_machine: e.target.checked })} /> Machine</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={form.cat_3p} onChange={(e) => setForm({ ...form, cat_3p: e.target.checked })} /> 3P</label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>GSTIN</Label><Input className="h-8" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} /></div>
              <div><Label>State Code</Label><Input className="h-8" value={form.state_code} onChange={(e) => setForm({ ...form, state_code: e.target.value })} /></div>
            </div>
            <div><Label>Address</Label><Input className="h-8" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Contact person</Label><Input className="h-8" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
              <div><Label>Phone</Label><Input className="h-8" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div><Label>Email</Label><Input className="h-8" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Payment terms</Label><Input className="h-8" value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} /></div>
            <div><Label>Remarks</Label><Input className="h-8" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
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