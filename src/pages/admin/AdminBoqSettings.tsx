import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Save, Loader2 } from "lucide-react";

export default function AdminBoqSettings() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "boq_verifier").maybeSingle();
      const e = (data?.value as { email?: string } | null)?.email || "";
      setEmail(e);
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "boq_verifier", value: { email: email.trim() || null } } as never, { onConflict: "key" });
    setSaving(false);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else toast({ title: "Saved" });
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <AdminTabs title="BOQ Verification" description="Configure who receives BOQ verification emails" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Senior verifier</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="verifier-email">Verifier email</Label>
            <Input
              id="verifier-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="senior@company.com"
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              When an OA is revised, the linked BOQ is queued in <span className="font-medium">Pending Verification</span>.
              A verification link is sent to this address. The new BOQ revision becomes active only after the senior approves it.
              Email delivery wiring can be configured later — until then, the verification link is logged for manual sharing.
            </p>
          </div>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}Save
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}