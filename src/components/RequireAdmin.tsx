import type { User } from "@supabase/supabase-js";
import { Navigate } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";

export function RequireAdmin({ user, children }: { user: User; children: React.ReactNode }) {
  const { isAdmin, loading } = useUserRole(user.id);
  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading admin panel…</div>;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function RoleRedirectHome({ user, fallback }: { user: User; fallback: React.ReactNode }) {
  const { isAdmin, loading } = useUserRole(user.id);
  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  if (isAdmin) return <Navigate to="/admin" replace />;
  return <>{fallback}</>;
}