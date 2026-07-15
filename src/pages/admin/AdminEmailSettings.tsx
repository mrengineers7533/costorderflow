import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

interface Config {
  sender_email: string;
  sender_updated_at: string | null;
  sender_updated_by: string | null;
}

interface AuditRow {
  id: string;
  previous_sender: string | null;
  new_sender: string;
  changed_by_email: string | null;
  changed_at: string;
}

const emailSchema = z.string().trim().email("Enter a valid email address").max(255);

export default function AdminEmailSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [sender, setSender] = useState("");
  const [updatedByEmail, setUpdatedByEmail] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  const [audit, setAudit] = useState<AuditRow[]>([]);

  const load = async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("email_notification_config")
      .select("sender_email, sender_updated_at, sender_updated_by")
      .eq("id", true)
      .maybeSingle();
    if (data) {
      setCfg(data);
      setSender(data.sender_email || "");
      if (data.sender_updated_by) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("email")
          .eq("id", data.sender_updated_by)
          .maybeSingle();
        setUpdatedByEmail(prof?.email || null);
      } else {
        setUpdatedByEmail(null);
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: aud } = await (supabase as any)
      .from("email_sender_audit")
      .select("id, previous_sender, new_sender, changed_by_email, changed_at")
      .order("changed_at", { ascending: false })
      .limit(20);
    setAudit((aud as AuditRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    const parsed = emailSchema.safeParse(sender);
    if (!parsed.success) {
      toast({ title: "Invalid email", description: parsed.error.errors[0].message, variant: "destructive" });
      return;
    }
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("email_notification_config")
      .update({ sender_email: parsed.data })
      .eq("id", true);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Sender email updated", description: `Future emails will be sent from ${parsed.data}.` });
    load();
  };

  const sendTest = async () => {
    const parsed = emailSchema.safeParse(testTo);
    if (!parsed.success) {
      toast({ title: "Invalid recipient", description: parsed.error.errors[0].message, variant: "destructive" });
      return;
    }
    setTesting(true);
    const { data, error } = await supabase.functions.invoke("send-notification-test-email", {
      body: { to: parsed.data },
    });
    setTesting(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = data as any;
    if (error || !res?.ok) {
      toast({ title: "Test email failed", description: (res?.error || error?.message || "Unknown error").toString(), variant: "destructive" });
      return;
    }
    toast({ title: "Test email sent", description: `Sent from ${res.sender} to ${parsed.data}.` });
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <AdminTabs title="Email Settings" description="Configure the notification sender email and send a test message." />

      {loading ? (
        <div className="py-12 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading…</div>
      ) : (
        <div className="space-y-6">
          <div className="border rounded-lg p-5 bg-card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Notification Sender Email</h2>
              <Badge variant="outline">{cfg?.sender_email || "not set"}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              All future notification emails will be sent from this address. The sender must be a verified Gmail account or alias authorized with the connected provider.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                type="email"
                placeholder="notifications@yourdomain.com"
                value={sender}
                onChange={(e) => setSender(e.target.value)}
                className="flex-1"
              />
              <Button onClick={save} disabled={saving || sender === cfg?.sender_email}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                Save
              </Button>
            </div>
            {cfg?.sender_updated_at && (
              <div className="text-xs text-muted-foreground mt-3">
                Last updated: {new Date(cfg.sender_updated_at).toLocaleString()}
                {updatedByEmail ? ` by ${updatedByEmail}` : ""}
              </div>
            )}
          </div>

          <div className="border rounded-lg p-5 bg-card">
            <h2 className="text-lg font-semibold mb-2">Send Test Email</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Send a one-off test message using the current sender to verify provider connectivity and authorization. This does not create an in-app notification.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                type="email"
                placeholder="recipient@example.com"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                className="flex-1"
              />
              <Button onClick={sendTest} disabled={testing || !testTo}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                Send Test Email
              </Button>
            </div>
          </div>

          <div className="border rounded-lg p-5 bg-card">
            <h2 className="text-lg font-semibold mb-3">Recent Sender Changes</h2>
            {audit.length === 0 ? (
              <div className="text-sm text-muted-foreground">No changes recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left">
                    <tr>
                      <th className="px-3 py-2">When</th>
                      <th className="px-3 py-2">Previous</th>
                      <th className="px-3 py-2">New</th>
                      <th className="px-3 py-2">Changed By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {audit.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2 text-xs">{new Date(r.changed_at).toLocaleString()}</td>
                        <td className="px-3 py-2 text-xs">{r.previous_sender || "—"}</td>
                        <td className="px-3 py-2 text-xs font-medium">{r.new_sender}</td>
                        <td className="px-3 py-2 text-xs">{r.changed_by_email || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}