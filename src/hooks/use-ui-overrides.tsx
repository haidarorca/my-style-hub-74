import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ButtonSize = "sm" | "md" | "lg" | "xl";

export interface UiOverride {
  label: string | null;
  size: ButtonSize | null;
}

interface UiOverridesContextValue {
  overrides: Record<string, UiOverride>;
  refresh: () => Promise<void>;
  upsert: (key: string, data: { label?: string | null; size?: ButtonSize | null }) => Promise<void>;
}

const UiOverridesContext = createContext<UiOverridesContextValue | undefined>(undefined);

export function UiOverridesProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, UiOverride>>({});

  const refresh = useCallback(async () => {
    const { data } = await (supabase as any).from("ui_overrides").select("key,label,size");
    const map: Record<string, UiOverride> = {};
    for (const row of (data ?? []) as Array<{ key: string; label: string | null; size: ButtonSize | null }>) {
      map[row.key] = { label: row.label, size: row.size };
    }
    setOverrides(map);
  }, []);

  const upsert = useCallback(async (key: string, data: { label?: string | null; size?: ButtonSize | null }) => {
    const { data: { user } } = await supabase.auth.getUser();
    const payload: any = { key, updated_by: user?.id ?? null };
    if (data.label !== undefined) payload.label = data.label;
    if (data.size !== undefined) payload.size = data.size;
    const { error } = await (supabase as any).from("ui_overrides").upsert(payload, { onConflict: "key" });
    if (error) throw error;
    setOverrides((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { label: null, size: null }), ...data } as UiOverride }));
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <UiOverridesContext.Provider value={{ overrides, refresh, upsert }}>
      {children}
    </UiOverridesContext.Provider>
  );
}

export function useUiOverrides() {
  const ctx = useContext(UiOverridesContext);
  if (!ctx) throw new Error("useUiOverrides must be used inside <UiOverridesProvider>");
  return ctx;
}

export function useOverride(key: string, defaults: { label: string; size?: ButtonSize }) {
  const { overrides } = useUiOverrides();
  const o = overrides[key];
  return {
    label: o?.label ?? defaults.label,
    size: (o?.size ?? defaults.size ?? "md") as ButtonSize,
  };
}

export const SIZE_TO_CLASS: Record<ButtonSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
  xl: "text-lg",
};
