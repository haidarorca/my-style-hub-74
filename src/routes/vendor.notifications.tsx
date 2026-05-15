import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/vendor/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: items } = useQuery({
    queryKey: ["vendor", "notifications", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, title, message, is_read, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  async function markAllRead() {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    qc.invalidateQueries({ queryKey: ["vendor", "notifications"] });
  }

  async function markOneRead(id: string) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["vendor", "notifications"] });
  }

  const unread = (items ?? []).filter((n) => !n.is_read).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Notifications</h1>
        {unread > 0 && (
          <Button size="sm" variant="outline" onClick={markAllRead}>
            <Check className="mr-1 h-3.5 w-3.5" /> Tout marquer comme lu
          </Button>
        )}
      </div>

      {(!items || items.length === 0) && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-sm text-muted-foreground">
          <Bell className="mb-2 h-6 w-6" />
          Aucune notification.
        </div>
      )}

      <div className="space-y-2">
        {(items ?? []).map((n) => (
          <Card key={n.id} className={n.is_read ? "" : "border-primary/40 bg-primary/5"}>
            <CardContent className="space-y-1 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold">{n.title}</p>
                {!n.is_read && (
                  <button onClick={() => markOneRead(n.id)} className="text-[10px] font-medium text-primary hover:underline">
                    Marquer lu
                  </button>
                )}
              </div>
              <p className="text-xs text-foreground/80">{n.message}</p>
              <p className="text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString("fr-FR")}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
