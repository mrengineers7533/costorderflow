import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const { user, isAdmin } = useAuth();

  // Profile
  const [profile, setProfile] = useState({ full_name: "", prepared_by: "", email_notifications: true });
  const [savingProfile, setSavingProfile] = useState(false);

  // Password
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);

  // Company / app settings
  const [company, setCompany] = useState<any>({
    name: "", address: "", gstin: "",
    bank_name: "", bank_account: "", bank_ifsc: "",
    default_terms: "",
  });
  const [savingCompany, setSavingCompany] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, prepared_by, email_notifications")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProfile({
          full_name: data.full_name ?? "",
          prepared_by: data.prepared_by ?? "",
          email_notifications: data.email_notifications ?? true,
        });
      });

    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "company_profile")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) setCompany({ ...company, ...(data.value as any) });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update(profile)
      .eq("id", user.id);
    setSavingProfile(false);
    if (error) toast.error(error.message);
    else toast.success("Profile saved");
  };

  const savePassword = async () => {
    if (pw.next.length < 6) return toast.error("Password too short");
    if (pw.next !== pw.confirm) return toast.error("Passwords do not match");
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: pw.next });
    setSavingPw(false);
    if (error) return toast.error(error.message);
    setPw({ next: "", confirm: "" });
    toast.success("Password updated");
  };

  const saveCompany = async () => {
    setSavingCompany(true);
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key: "company_profile", value: company, updated_at: new Date().toISOString(), updated_by: user?.id },
        { onConflict: "key" }
      );
    setSavingCompany(false);
    if (error) toast.error(error.message);
    else toast.success("Company settings saved");
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile and app preferences.</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          {isAdmin && <TabsTrigger value="company">Company</TabsTrigger>}
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Update how your name appears on documents.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Email</Label>
                <Input value={user?.email ?? ""} disabled />
              </div>
              <div>
                <Label>Full name</Label>
                <Input value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} />
              </div>
              <div>
                <Label>Prepared by (signature line)</Label>
                <Input value={profile.prepared_by} onChange={(e) => setProfile({ ...profile, prepared_by: e.target.value })} />
              </div>
              <Button onClick={saveProfile} disabled={savingProfile}>
                {savingProfile && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="password">
          <Card>
            <CardHeader>
              <CardTitle>Change password</CardTitle>
              <CardDescription>Use a strong password you don't reuse.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>New password</Label>
                <Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              </div>
              <div>
                <Label>Confirm new password</Label>
                <Input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
              </div>
              <Button onClick={savePassword} disabled={savingPw}>
                {savingPw && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Update password
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Choose what you want to be notified about.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">Email notifications</div>
                  <div className="text-xs text-muted-foreground">Receive product and account emails.</div>
                </div>
                <Switch
                  checked={profile.email_notifications}
                  onCheckedChange={(v) => setProfile({ ...profile, email_notifications: v })}
                />
              </div>
              <Button onClick={saveProfile} disabled={savingProfile}>
                {savingProfile && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save preferences
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="company">
            <Card>
              <CardHeader>
                <CardTitle>Company profile</CardTitle>
                <CardDescription>Used as defaults across OAs, BOQs, and PIs.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div><Label>Company name</Label><Input value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} /></div>
                  <div><Label>GSTIN</Label><Input value={company.gstin} onChange={(e) => setCompany({ ...company, gstin: e.target.value })} /></div>
                </div>
                <div><Label>Address</Label><Textarea rows={2} value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} /></div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div><Label>Bank name</Label><Input value={company.bank_name} onChange={(e) => setCompany({ ...company, bank_name: e.target.value })} /></div>
                  <div><Label>Account #</Label><Input value={company.bank_account} onChange={(e) => setCompany({ ...company, bank_account: e.target.value })} /></div>
                  <div><Label>IFSC</Label><Input value={company.bank_ifsc} onChange={(e) => setCompany({ ...company, bank_ifsc: e.target.value })} /></div>
                </div>
                <div><Label>Default Terms & Conditions</Label><Textarea rows={5} value={company.default_terms} onChange={(e) => setCompany({ ...company, default_terms: e.target.value })} /></div>
                <Button onClick={saveCompany} disabled={savingCompany}>
                  {savingCompany && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save company settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}