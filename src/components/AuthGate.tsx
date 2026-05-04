import { useEffect, useState } from "react";
import type React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Mail, Lock, LogIn, Eye, EyeOff, AlertCircle, User as UserIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import gmsLogo from "@/assets/gms-logo.png";

const FALLBACK_DOMAINS = ["fmec.in", "gmsdelhi.com", "mrengineers.com"];

function getDomain(email: string) {
  const m = email.trim().toLowerCase().match(/@([^@]+)$/);
  return m ? m[1] : "";
}

async function isDomainAllowed(email: string): Promise<boolean> {
  const domain = getDomain(email);
  if (!domain) return false;
  try {
    const { data, error } = await supabase.rpc("is_domain_allowed", { _domain: domain });
    if (error) throw error;
    if (typeof data === "boolean") return data;
  } catch {
    /* fall through */
  }
  return FALLBACK_DOMAINS.includes(domain);
}

async function logLoginAttempt(email: string, status: "success" | "failed", userId?: string | null) {
  try {
    await supabase.from("login_activity").insert({
      email: email.trim().toLowerCase(),
      status,
      user_agent: navigator.userAgent.slice(0, 300),
      user_id: userId ?? null,
    });
  } catch {
    /* non-blocking */
  }
}

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

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Checking secure session…</div>;
  }
  if (!session?.user) return <AuthForm />;
  return <>{children(session.user)}</>;
}

function AuthForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    setForgotMsg(null);
    setForgotBusy(true);
    try {
      const target = forgotEmail.trim();
      if (!target) { setForgotMsg("Please enter your email."); return; }
      const allowed = await isDomainAllowed(target);
      if (!allowed) {
        setForgotMsg(`The email domain "${getDomain(target) || "—"}" is not permitted.`);
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(target, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) { setForgotMsg(error.message); return; }
      setForgotMsg("If an account exists for that email, a reset link has been sent. Check your inbox (and spam).");
      toast({ title: "Reset email sent", description: "Check your inbox for the password reset link." });
    } finally {
      setForgotBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const allowed = await isDomainAllowed(email);
      if (!allowed) {
        setError(`Sign-in is restricted. The email domain "${getDomain(email) || "—"}" is not permitted.`);
        await logLoginAttempt(email, "failed");
        return;
      }

      if (mode === "signin") {
        const res = await supabase.auth.signInWithPassword({ email, password });
        if (res.error) {
          setError("Invalid email or password.");
          await logLoginAttempt(email, "failed");
          return;
        }
        // Remember-me: when off, drop persisted session on tab close.
        try {
          if (!remember) localStorage.setItem("lovable.remember", "false");
          else localStorage.removeItem("lovable.remember");
        } catch { /* ignore */ }
        await logLoginAttempt(email, "success", res.data.user?.id);
      } else {
        if (!fullName.trim()) {
          setError("Please enter your full name.");
          return;
        }
        const res = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName.trim() },
          },
        });
        if (res.error) {
          setError(res.error.message);
          return;
        }
        toast({ title: "Account created", description: "If email confirmation is on, check your inbox before signing in." });
      }
    } finally {
      setBusy(false);
    }
  }

  // Honor remember=false by clearing the session when the tab is closed.
  useEffect(() => {
    const handler = () => {
      try {
        if (localStorage.getItem("lovable.remember") === "false") {
          // best-effort: drop the persisted Supabase session entry
          Object.keys(localStorage).forEach((k) => { if (k.startsWith("sb-") && k.endsWith("-auth-token")) localStorage.removeItem(k); });
        }
      } catch { /* ignore */ }
    };
    window.addEventListener("pagehide", handler);
    return () => window.removeEventListener("pagehide", handler);
  }, []);

  return (
    <div className="min-h-screen grid place-items-center bg-muted/40 p-4 sm:p-6">
      <div className="w-full max-w-md rounded-2xl bg-card shadow-xl border border-border/60 p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <img src={gmsLogo} alt="GMS" className="h-16 w-auto" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">
            {mode === "signin" ? "Welcome Back" : "Create Account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Sign in to your account to continue" : "Sign up with your company email"}
          </p>
        </div>

        {error && (
          <div className="mt-5 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full Name</Label>
              <div className="relative">
                <UserIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="fullName"
                  type="text"
                  required
                  placeholder="Your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="pl-9 h-11 rounded-xl bg-muted/40"
                  autoComplete="name"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email Address</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9 h-11 rounded-xl bg-muted/40"
                autoComplete="email"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type={showPw ? "text" : "password"}
                required
                minLength={1}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9 pr-10 h-11 rounded-xl bg-muted/40"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
              <button
                type="button"
                aria-label={showPw ? "Hide password" : "Show password"}
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {mode === "signin" && (
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                <span className="text-muted-foreground">Remember me</span>
              </label>
              <button
                type="button"
                className="text-primary font-medium hover:underline"
                onClick={() => {
                  setForgotEmail(email);
                  setForgotMsg(null);
                  setForgotOpen(true);
                }}
              >
                Forgot password?
              </button>
            </div>
          )}

          <Button
            type="submit"
            disabled={busy}
            className="w-full h-11 rounded-xl text-base font-semibold shadow-sm"
          >
            <LogIn className="h-4 w-4" />
            {busy ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
          <button
            type="button"
            className="text-primary font-semibold hover:underline"
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>

        <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset your password</DialogTitle>
              <DialogDescription>
                Enter the email associated with your account. We'll send you a link to set a new password.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={sendReset} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="forgotEmail">Email Address</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="forgotEmail"
                    type="email"
                    required
                    placeholder="you@company.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="pl-9 h-11 rounded-xl bg-muted/40"
                    autoComplete="email"
                  />
                </div>
              </div>
              {forgotMsg && (
                <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 p-3 text-sm text-foreground">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                  <span>{forgotMsg}</span>
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={forgotBusy}>{forgotBusy ? "Sending…" : "Send reset link"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}