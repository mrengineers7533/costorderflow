import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, ChevronsUpDown, Check } from "lucide-react";
import { toast } from "sonner";

export interface Vendor {
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
  is_active: boolean;
}

interface Props {
  category: "steel" | "machine" | "3p";
  value: Vendor | null;
  onChange: (v: Vendor | null) => void;
}

export function VendorCombobox({ category, value, onChange }: Props) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const load = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data } = await sb.from("vendors").select("*").eq("is_active", true).order("name");
    setVendors((data || []) as Vendor[]);
  };
  useEffect(() => { load(); }, []);

  const filtered = vendors.filter((v) => {
    if (!v.categories.includes(category)) return false;
    if (search && !v.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" size="sm" className="w-full justify-between h-8 text-xs font-normal">
            {value ? value.name : "Select vendor…"}
            <ChevronsUpDown className="h-3 w-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="start">
          <Input
            placeholder="Search vendors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs mb-2"
          />
          <div className="max-h-56 overflow-auto space-y-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">No vendors for {category}.</p>
            ) : filtered.map((v) => (
              <button
                key={v.id}
                type="button"
                className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent flex items-center justify-between"
                onClick={() => { onChange(v); setOpen(false); }}
              >
                <span>
                  <span className="font-medium">{v.name}</span>
                  {v.email && <span className="text-muted-foreground"> · {v.email}</span>}
                </span>
                {value?.id === v.id && <Check className="h-3 w-3" />}
              </button>
            ))}
          </div>
          <div className="border-t mt-2 pt-2 flex justify-between gap-2">
            <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => { onChange(null); setOpen(false); }}>
              Clear
            </Button>
            <Button size="sm" variant="secondary" className="text-xs h-7" onClick={() => { setOpen(false); setAddOpen(true); }}>
              <Plus className="h-3 w-3 mr-1" />Add new
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <AddVendorDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultCategory={category}
        onCreated={async (v) => { await load(); onChange(v); }}
      />
    </>
  );
}

function AddVendorDialog({
  open, onOpenChange, defaultCategory, onCreated,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  defaultCategory: "steel" | "machine" | "3p";
  onCreated: (v: Vendor) => void;
}) {
  const [form, setForm] = useState({
    name: "", address: "", gstin: "", state_code: "",
    contact_person: "", phone: "", email: "", payment_terms: "NEFT/RTGS",
    cat_steel: defaultCategory === "steel",
    cat_machine: defaultCategory === "machine",
    cat_3p: defaultCategory === "3p",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    const cats: string[] = [];
    if (form.cat_steel) cats.push("steel");
    if (form.cat_machine) cats.push("machine");
    if (form.cat_3p) cats.push("3p");
    if (cats.length === 0) { toast.error("Pick at least one category"); return; }
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await sb.from("vendors").insert({
      name: form.name.trim(),
      categories: cats,
      address: form.address.trim() || null,
      gstin: form.gstin.trim() || null,
      state_code: form.state_code.trim() || null,
      contact_person: form.contact_person.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      payment_terms: form.payment_terms.trim() || null,
      created_by: u?.user?.id ?? null,
    }).select().single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Vendor added");
    onCreated(data as Vendor);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-base">Add vendor</DialogTitle></DialogHeader>
        <div className="space-y-3 text-xs">
          <div className="grid gap-1"><Label>Name *</Label>
            <Input className="h-8" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
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
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save vendor"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}