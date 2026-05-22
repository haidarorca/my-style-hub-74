import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type NotificationType = "all" | "unread" | "order" | "vendor" | "product" | "other";

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
  user_id: string;
}

function deduceType(n: NotificationItem): "order" | "vendor" | "product" | "other" {
  const text = `${n.title} ${n.message} ${n.link ?? ""}`.toLowerCase();
  if (text.includes("commande") || text.includes("order") || n.link?.includes("/orders/")) return "order";
  if (text.includes("produit") || text.includes("product") || n.link?.includes("/products/")) return "product";
  if (text.includes("vendeur") || text.includes("vendor") || text.includes("boutique") || text.includes("shop")) return "vendor";
  return "other";
}

export function useNotifications(prefix: "admin" | "vendor") {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKeyBase = [prefix, "notifications"];
  const queryKeyUnread = [prefix, "notifications-unread"];

  const { data: items = [], isLoading } = useQuery({
    queryKey: [queryKeyBase, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, title, message, link, is_read, created_at, user_id")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      return (data ?? []) as NotificationItem[];
    },
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: [queryKeyUnread, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("is_read", false);
      return count ?? 0;
    },
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const itemsWithType = useMemo(
    () => items.map((n) => ({ ...n, type: deduceType(n) })),
    [items]
  );

  const filteredItems = useCallback(
    (filter: NotificationType) => {
      if (filter === "all") return itemsWithType;
      if (filter === "unread") return itemsWithType.filter((n) => !n.is_read);
      return itemsWithType.filter((n) => n.type === filter);
    },
    [itemsWithType]
  );

  const markAllRead = useCallback(async () => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    qc.invalidateQueries({ queryKey: queryKeyBase });
    qc.invalidateQueries({ queryKey: queryKeyUnread });
  }, [user, qc, queryKeyBase, queryKeyUnread]);

  const markOneRead = useCallback(
    async (id: string) => {
      await supabase.from("notifications").update({ is_read: true }).eq("id", id);
      qc.invalidateQueries({ queryKey: queryKeyBase });
      qc.invalidateQueries({ queryKey: queryKeyUnread });
    },
    [qc, queryKeyBase, queryKeyUnread]
  );

  const deleteOne = useCallback(
    async (id: string) => {
      await supabase.from("notifications").delete().eq("id", id);
      qc.invalidateQueries({ queryKey: queryKeyBase });
      qc.invalidateQueries({ queryKey: queryKeyUnread });
    },
    [qc, queryKeyBase, queryKeyUnread]
  );

  const deleteAll = useCallback(async () => {
    if (!user) return;
    await supabase.from("notifications").delete().eq("user_id", user.id);
    qc.invalidateQueries({ queryKey: queryKeyBase });
    qc.invalidateQueries({ queryKey: queryKeyUnread });
  }, [user, qc, queryKeyBase, queryKeyUnread]);

  const deleteRead = useCallback(async () => {
    if (!user) return;
    await supabase.from("notifications").delete().eq("user_id", user.id).eq("is_read", true);
    qc.invalidateQueries({ queryKey: queryKeyBase });
    qc.invalidateQueries({ queryKey: queryKeyUnread });
  }, [user, qc, queryKeyBase, queryKeyUnread]);

  return {
    items: itemsWithType,
    filteredItems,
    unreadCount,
    isLoading,
    markAllRead,
    markOneRead,
    deleteOne,
    deleteAll,
    deleteRead,
  };
}
