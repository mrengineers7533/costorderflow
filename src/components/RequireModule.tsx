import type { User } from "@supabase/supabase-js";
import { useUserAccess } from "@/hooks/useUserAccess";
import { AccessDenied } from "./AccessDenied";
import type { ModuleKey } from "@/lib/access/modules";

export function RequireModule({
  user,
  module,
  children,
}: {
  user: User;
  module: ModuleKey;
  children: React.ReactNode;
}) {
  const { canAccess, loading } = useUserAccess(user.id);
  if (loading) {
    return <div className="min-h-[40vh] grid place-items-center text-muted-foreground">Checking access…</div>;
  }
  if (!canAccess(module)) return <AccessDenied module={module} />;
  return <>{children}</>;
}