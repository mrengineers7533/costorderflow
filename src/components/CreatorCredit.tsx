import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Shared, protected creator credit.
 *
 * Visibility is controlled by the `app_settings.creator_credit` row in the
 * backend. The frontend has NO UI to toggle this — the only way to hide it
 * is by calling the `toggle-creator-credit` edge function with the correct
 * 6-digit PIN, which is verified server-side.
 */
export function CreatorCredit({
  variant = "footer",
  className,
}: {
  variant?: "footer" | "page";
  className?: string;
}) {
  // Default to visible — credit shows by default and only hides if the
  // backend explicitly says so.
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "creator_credit")
        .maybeSingle();
      if (cancelled) return;
      const v = (data?.value as { visible?: boolean } | null)?.visible;
      if (v === false) setVisible(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  if (variant === "page") {
    return (
      <div
        className={cn(
          "mt-10 flex items-center justify-center border-t pt-6",
          className,
        )}
      >
        <p className="text-sm font-medium text-muted-foreground">
          Built by{" "}
          <span className="text-foreground font-semibold">Sanjeev Kumar</span>
        </p>
      </div>
    );
  }

  return (
    <footer
      className={cn(
        "border-t bg-background px-4 py-2 text-center text-[11px] text-muted-foreground",
        className,
      )}
    >
      Built by <span className="text-foreground font-medium">Sanjeev Kumar</span>
    </footer>
  );
}