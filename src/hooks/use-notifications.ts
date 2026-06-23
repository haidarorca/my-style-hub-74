import { useCallback, useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
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

const PAGE_SIZE = 25;

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
  const [filter, setFilter] = useState<NotificationType>("all");

  // Paginated, server-side filtered (much cheaper for large datasets)
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteQuery({
    queryKey: [...queryKeyBase, user?.id, filter],
    enabled: !!user?.id,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = (pageParam as number) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("notifications")
        .select("id, title, message, link, is_read, created_at, user_id")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (filter === "unread") q = q.eq("is_read", false);
      const { data: rows } = await q;
      return (rows ?? []) as NotificationItem[];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.length : undefined,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const items = useMemo(
    () => (data?.pages.flat() ?? []).map((n) => ({ ...n, type: deduceType(n) })),
    [data],
  );

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

  const filteredItems = useCallback(
    (f: NotificationType) => {
      if (f === "all" || f === "unread") return items; // already server-filtered
      return items.filter((n) => n.type === f);
    },
    [items],
  );

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: queryKeyBase });
    qc.invalidateQueries({ queryKey: queryKeyUnread });
  }, [qc, queryKeyBase, queryKeyUnread]);

  // Realtime: auto-invalidate on any change to this user's notifications
  // (INSERT for new ones, UPDATE for read state, DELETE for removals).
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          invalidate();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, invalidate]);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    invalidate();
  }, [user, invalidate]);

  const markOneRead = useCallback(async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    invalidate();
  }, [invalidate]);

  const deleteOne = useCallback(async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    invalidate();
  }, [invalidate]);

  const deleteAll = useCallback(async () => {
    if (!user) return;
    await supabase.from("notifications").delete().eq("user_id", user.id);
    invalidate();
  }, [user, invalidate]);

  const deleteRead = useCallback(async () => {
    if (!user) return;
    await supabase.from("notifications").delete().eq("user_id", user.id).eq("is_read", true);
    invalidate();
  }, [user, invalidate]);

  return {
    items,
    filteredItems,
    unreadCount,
    isLoading,
    filter,
    setFilter,
    hasNextPage: !!hasNextPage,
    isFetchingNextPage,
    loadMore: fetchNextPage,
    refetch,
    markAllRead,
    markOneRead,
    deleteOne,
    deleteAll,
    deleteRead,
  };
}
