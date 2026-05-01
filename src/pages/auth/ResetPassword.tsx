import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) setReady(true);
    else {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) setReady(true);
      });
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    if (password !== confirm) return toast.error("Passwords do not match");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <form onSubmit={submit} className="w-full max-w-md bg-card border rounded-2xl shadow-sm p-8 space-y-4">
        <h1 className="text-2xl font-bold">Set a new password</h1>
        {!ready && (
          <p className="text-sm text-muted-foreground">
            Open this page from the link in your reset email.
          </p>
        )}
        <div className="space-y-1.5">
          <Label>New password</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Confirm password</Label>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={loading || !ready}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Update password
        </Button>
      </form>
    </div>
  );
}