import { useEffect, useState } from "react";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  addNotificationRecipient,
  deleteNotificationRecipient,
  listNotificationRecipients,
  updateNotificationRecipient,
  type NotificationDepartment,
  type NotificationRecipientConfig,
} from "@/lib/notifications/orderRevision";

const PRESET_DEPTS: NotificationDepartment[] = [
  "design",
  "purchase",
  "manufacturing",
  "DME Team",
  "CRM Team",
  "Reception",
  "HR",
  "Production",
];
const CUSTOM_SENTINEL = "__custom__";

export default function AdminNotificationRecipients() {
  const [rows, setRows] = useState<NotificationRecipientConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [dept, setDept] = useState<NotificationDepartment>("design");
  const [customDept, setCustomDept] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLoading(true);
    try { setRows(await listNotificationRecipients()); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);

  async function add() {
    const em = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
      toast.error("Enter a valid email address");
      return;
    }
    let finalDept = dept;
    if (dept === CUSTOM_SENTINEL) {
      finalDept = customDept.trim().replace(/\s+/g, " ");
      if (!finalDept) { toast.error("Enter a department name"); return; }
      if (finalDept.length > 60) { toast.error("Department name too long (max 60)"); return; }
    }
    setBusy(true);
    try {
      await addNotificationRecipient({ department: finalDept, email: em, name: name.trim() || null });
      setEmail(""); setName(""); setCustomDept("");
      toast.success("Recipient added");
      refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function toggle(r: NotificationRecipientConfig) {
    try {
      await updateNotificationRecipient(r.id, { is_active: !r.is_active });
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function remove(r: NotificationRecipientConfig) {
    if (!confirm(`Remove ${r.email || r.name} from ${r.department}?`)) return;
    try { await deleteNotificationRecipient(r.id); toast.success("Removed"); refresh(); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <AdminTabs
        title="Revision Notifications"
        description="Recipients notified when an OA is revised. Delivery channels (email, SMS, WhatsApp, in-app) can be wired up later — entries are captured as pending now."
      />

      <Card className="mb-4">
        <CardContent className="p-4 flex flex-wrap gap-2 items-end">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Department</div>
            <Select value={dept} onValueChange={(v) => setDept(v as NotificationDepartment)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRESET_DEPTS.map((d) => (
                  <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
                ))}
                <SelectItem value={CUSTOM_SENTINEL}>Custom…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {dept === CUSTOM_SENTINEL && (
            <div className="space-y-1 min-w-[180px]">
              <div className="text-xs text-muted-foreground">Custom department</div>
              <Input
                placeholder="e.g. DME Team"
                value={customDept}
                onChange={(e) => setCustomDept(e.target.value)}
                maxLength={60}
              />
            </div>
          )}
          <div className="space-y-1 flex-1 min-w-[200px]">
            <div className="text-xs text-muted-foreground">Email</div>
            <Input placeholder="user@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1 flex-1 min-w-[160px]">
            <div className="text-xs text-muted-foreground">Name (optional)</div>
            <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button onClick={add} disabled={busy}><Plus className="h-4 w-4 mr-1" /> Add</Button>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Channels</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No recipients configured</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="capitalize font-medium">{r.department}</TableCell>
                <TableCell>{r.email || "—"}</TableCell>
                <TableCell>{r.name || "—"}</TableCell>
                <TableCell className="text-xs">
                  {(r.channels || []).map((c) => <Badge key={c} variant="secondary" className="mr-1">{c}</Badge>)}
                </TableCell>
                <TableCell>
                  {r.is_active
                    ? <Badge>Active</Badge>
                    : <Badge variant="outline">Disabled</Badge>}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button size="sm" variant="ghost" onClick={() => toggle(r)}>
                    {r.is_active ? "Disable" : "Enable"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(r)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}