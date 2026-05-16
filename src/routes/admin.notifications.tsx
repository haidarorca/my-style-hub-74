import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/admin/notifications")({
  component: AdminNotificationsPage,
});

function AdminNotificationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: items } = useQuery({
    queryKey: ["admin", "notifications", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, title, message, link, is_read, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
    refetchOnWindowFocus: true,
  });

  async function markAllRead() {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    qc.invalidateQueries({ queryKey: ["admin", "notifications"] });
    qc.invalidateQueries({ queryKey: ["admin", "notifications-unread"] });
  }

  async function openOne(n: { id: string; link: string | null }) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
    qc.invalidateQueries({ queryKey: ["admin", "notifications"] });
    qc.invalidateQueries({ queryKey: ["admin", "notifications-unread"] });
    if (n.link) navigate({ to: n.link });
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
                <button
                  type="button"
                  onClick={() => openOne(n)}
                  className="flex-1 text-left"
                >
                  <p className="text-sm font-semibold">{n.title}</p>
                  <p className="mt-0.5 text-xs text-foreground/80">{n.message}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {new Date(n.created_at).toLocaleString("fr-FR")}
                    {n.link && <span className="ml-2 text-primary">· Ouvrir →</span>}
                  </p>
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
