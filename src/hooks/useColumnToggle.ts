import { useEffect, useState } from "react";

/** Boolean toggle persisted in localStorage. Used for per-surface
 *  "show Make column" preferences across BOQ / PI / Requisition /
 *  Purchase / Manufacturing views. Defaults to hidden (`false`). */
export function useColumnToggle(storageKey: string, defaultValue = false) {
  const [value, setValue] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw == null) return defaultValue;
      return raw === "1" || raw === "true";
    } catch {
      return defaultValue;
    }
  });
  useEffect(() => {
    try { window.localStorage.setItem(storageKey, value ? "1" : "0"); } catch {
      /* ignore quota / private-mode errors */
    }
  }, [storageKey, value]);
  return [value, setValue] as const;
}