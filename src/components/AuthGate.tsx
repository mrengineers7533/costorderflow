import { useEffect, useState } from "react";
import type React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { ShieldCheck } from "lucide-react";

export function AuthGate({ children }: { children: (user: User) => React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Checking secure session…</div>;
  if (!session?.user) return <AuthForm />;
  return <>{children(session.user)}</>;
}

function AuthForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (res.error) return toast({ title: mode === "signin" ? "Sign in failed" : "Sign up failed", description: res.error.message, variant: "destructive" });
    if (mode === "signup") toast({ title: "Check your email", description: "Confirm your account, then sign in." });
  }

  async function signInWithGoogle() {
    const { error } = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (error) toast({ title: "Google sign in failed", description: error.message, variant: "destructive" });
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <Card className="w-full max-w-md rounded-2xl border-border/70 shadow-lg">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary"><ShieldCheck className="h-6 w-6" /></div>
          <CardTitle className="text-2xl">Secure MR Engineers workspace</CardTitle>
          <p className="text-sm text-muted-foreground">Sign in to access orders, BOQs, invoices, and uploaded cost sheets.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button type="button" variant="outline" className="w-full" onClick={signInWithGoogle}>Continue with Google</Button>
          <div className="relative text-center text-xs text-muted-foreground before:absolute before:left-0 before:top-1/2 before:h-px before:w-[42%] before:bg-border after:absolute after:right-0 after:top-1/2 after:h-px after:w-[42%] after:bg-border">or</div>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1"><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-1"><Label>Password</Label><Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <Button className="w-full" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</Button>
          </form>
          <Button type="button" variant="ghost" className="w-full" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>{mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}