import { ShieldOff } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function AccessDenied({ module }: { module?: string }) {
  return (
    <div className="min-h-[60vh] grid place-items-center p-6">
      <div className="max-w-md w-full rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 text-destructive grid place-items-center">
          <ShieldOff className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Access Denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don't have permission to view {module ? `the "${module}" module` : "this page"}.
          Please contact an administrator if you believe this is a mistake.
        </p>
        <Button asChild className="mt-6">
          <Link to="/">Back to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

export default AccessDenied;