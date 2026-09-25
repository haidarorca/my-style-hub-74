import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { DEFAULT_PREFS, type NotificationPrefs } from "@/lib/notification-sound";

export function useNotificationPrefs() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["admin-notification-prefs", user?.id];
  const { data: prefs = DEFAULT_PREFS, isLoading } = useQuery({
    queryKey: key,
    enabled: !!user?.id,
    queryFn: async (): Promise<NotificationPrefs> => {
      const { data } = await supabase.from("admin_notification_prefs" as never)
        .select("sound_enabled, muted, volume, types").eq("user_id", user!.id).maybeSingle();
      return data ? { ...DEFAULT_PREFS, ...(data as NotificationPrefs) } : DEFAULT_PREFS;
    },
    staleTime: 60_000,
  });

  const save = useCallback(async (next: NotificationPrefs) => {
    if (!user?.id) return;
    qc.setQueryData(key, next);
    const { error } = await supabase.from("admin_notification_prefs" as never)
      .upsert({ user_id: user.id, ...next, updated_at: new Date().toISOString() } as never);
    if (error) throw error;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, qc]);

  return { prefs, isLoading, save };
}
