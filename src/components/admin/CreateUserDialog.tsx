import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { MODULES, type ModuleKey } from "@/lib/access/modules";

type Preset = "custom" | "purchase" | "manufacturing" | "requisitions" | "costing" | "admin";

const PRESETS: Record<Exclude<Preset, "custom" | "admin">, ModuleKey[]> = {
  purchase: ["purchase"],
  manufacturing: ["manufacturing"],
  requisitions: ["requisitions", "annexures"],
  costing: ["costing"],
};

export function CreateUserDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [authMode, setAuthMode] = useState<"password" | "invite">("password");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [modules, setModules] = useState<Set<ModuleKey>>(new Set());
  const [preset, setPreset] = useState<Preset>("custom");
  const [busy, setBusy] = useState(false);

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p === "admin") { setIsAdmin(true); setModules(new Set()); return; }
    setIsAdmin(false);
    if (p === "custom") return;
    setModules(new Set(PRESETS[p]));
  }

  function toggleModule(m: ModuleKey, on: boolean) {
    setPreset("custom");
    setModules((prev) => {
      const next = new Set(prev);
      if (on) next.add(m); else next.delete(m);
      return next;
    });
  }

  function reset() {
    setEmail(""); setFullName(""); setAuthMode("password"); setPassword("");
    setIsAdmin(false); setModules(new Set()); setPreset("custom");
  }

  async function submit() {
    if (!email.trim()) { toast.error("Email is required"); return; }
    if (authMode === "password" && password.length < 8) {
      toast.error("Password must be at least 8 characters"); return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          email: email.trim(),
          full_name: fullName.trim() || undefined,
          password: authMode === "password" ? password : undefined,
          send_invite: authMode === "invite",
          is_admin: isAdmin,
          modules: isAdmin ? [] : Array.from(modules),
        },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast.success(authMode === "invite" ? "Invite sent" : "User created");
      reset();
      onCreated();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || "Failed to create user");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add new user</DialogTitle>
          <DialogDescription>Create an account and assign module access.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 col-span-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="off"
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="user@mrengineers.com" />
            </div>
            <div className="space-y-2 col-span-2">
              <Label htmlFor="fn">Full name (optional)</Label>
              <Input id="fn" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Authentication</Label>
            <RadioGroup value={authMode} onValueChange={(v) => setAuthMode(v as "password" | "invite")}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="password" id="m-pw" />
                <Label htmlFor="m-pw" className="font-normal cursor-pointer">Set password now</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="invite" id="m-inv" />
                <Label htmlFor="m-inv" className="font-normal cursor-pointer">Send invite email</Label>
              </div>
            </RadioGroup>
            {authMode === "password" && (
              <Input type="text" placeholder="Min 8 characters"
                value={password} onChange={(e) => setPassword(e.target.value)} />
            )}
          </div>

          <div className="space-y-2">
            <Label>Quick preset</Label>
            <div className="flex flex-wrap gap-2">
              {([
                ["custom", "Custom"], ["purchase", "Purchase only"],
                ["manufacturing", "Manufacturing only"], ["requisitions", "Requisition only"],
                ["costing", "Costing only"], ["admin", "Full access (Admin)"],
              ] as [Preset, string][]).map(([k, lbl]) => (
                <Button key={k} type="button" size="sm"
                  variant={preset === k ? "default" : "outline"}
                  onClick={() => applyPreset(k)}>
                  {lbl}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">Make admin</div>
              <div className="text-xs text-muted-foreground">Grants full access to every module.</div>
            </div>
            <Switch checked={isAdmin} onCheckedChange={(v) => { setIsAdmin(v); if (v) setPreset("admin"); }} />
          </div>

          {!isAdmin && (
            <div className="space-y-2">
              <Label>Module access</Label>
              <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 max-h-56 overflow-auto">
                {MODULES.map((m) => (
                  <label key={m.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={modules.has(m.key)}
                      onCheckedChange={(v) => toggleModule(m.key, v === true)}
                    />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create user"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}