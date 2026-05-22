import { Bell, Check, Trash2, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NotificationItem, NotificationType } from "@/hooks/use-notifications";
import { useNavigate } from "@tanstack/react-router";

interface Props {
  items: (NotificationItem & { type: NotificationType })[];
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
  emptyMessage?: string;
}

export function NotificationList({ items, onMarkRead, onDelete, emptyMessage = "Aucune notification." }: Props) {
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-sm text-muted-foreground">
        <Bell className="mb-2 h-6 w-6" />
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((n) => (
        <Card
          key={n.id}
          className={n.is_read ? "" : "border-primary/40 bg-primary/5"}
        >
          <CardContent className="space-y-1 p-3">
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  onMarkRead(n.id);
                  if (n.link) navigate({ to: n.link });
                }}
                className="flex-1 text-left"
              >
                <div className="flex items-center gap-2">
                  {!n.is_read && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                  <p className={`text-sm ${n.is_read ? "font-normal text-foreground/80" : "font-semibold"}`}>
                    {n.title}
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-foreground/70 line-clamp-2">{n.message}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {new Date(n.created_at).toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {n.link && (
                    <span className="ml-2 inline-flex items-center gap-0.5 text-primary">
                      <ExternalLink className="h-3 w-3" />
                      Ouvrir
                    </span>
                  )}
                </p>
              </button>

              <div className="flex shrink-0 flex-col gap-1">
                {!n.is_read && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => onMarkRead(n.id)}
                    title="Marquer comme lu"
                  >
                    <Check className="h-3.5 w-3.5 text-primary" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => onDelete(n.id)}
                  title="Supprimer"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
