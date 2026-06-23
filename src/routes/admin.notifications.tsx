import { createFileRoute } from "@tanstack/react-router";
import { Check, Trash2, Archive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotifications, NotificationType } from "@/hooks/use-notifications";
import { NotificationFilters } from "@/components/notifications/NotificationFilters";
import { NotificationList } from "@/components/notifications/NotificationList";
import { useState, useMemo } from "react";

export const Route = createFileRoute("/admin/notifications")({
  component: AdminNotificationsPage,
});

function AdminNotificationsPage() {
  const {
    items, filteredItems, unreadCount, markAllRead, markOneRead, deleteOne, deleteRead,
    isLoading, filter, setFilter, hasNextPage, isFetchingNextPage, loadMore,
  } = useNotifications("admin");
  const [showActions, setShowActions] = useState(false);

  const displayed = filteredItems(filter);

  const counts = useMemo(() => {
    const c: Record<NotificationType, number> = {
      all: items.length,
      unread: items.filter((n) => !n.is_read).length,
      order: items.filter((n) => n.type === "order").length,
      vendor: items.filter((n) => n.type === "vendor").length,
      product: items.filter((n) => n.type === "product").length,
      other: items.filter((n) => n.type === "other").length,
    };
    return c;
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold">Notifications</h1>
          {unreadCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <Button size="sm" variant="outline" onClick={markAllRead}>
              <Check className="mr-1 h-3.5 w-3.5" />
              Tout marquer comme lu
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setShowActions((v) => !v)}>
            <Archive className="mr-1 h-3.5 w-3.5" />
            Actions
          </Button>
        </div>
      </div>

      {showActions && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Actions sur les notifications</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={deleteRead}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Supprimer les lues
            </Button>
          </div>
        </div>
      )}

      <NotificationFilters active={filter} onChange={setFilter} counts={counts} />

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          Chargement...
        </div>
      ) : (
        <>
          <NotificationList
            items={displayed}
            onMarkRead={markOneRead}
            onDelete={deleteOne}
            emptyMessage={
              filter === "unread"
                ? "Aucune notification non lue."
                : filter === "all"
                  ? "Aucune notification."
                  : `Aucune notification dans cette categorie.`
            }
          />
          {hasNextPage && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadMore()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Chargement…</>
                ) : (
                  "Voir plus"
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
