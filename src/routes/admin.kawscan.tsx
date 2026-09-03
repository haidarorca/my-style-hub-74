import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScanLine } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { subscriptionState, type KawscanStore, type KawscanSubscription } from "@/lib/kawscan/api";
import { storeScanUrl } from "@/lib/kawscan/codes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin/kawscan")({
  component: AdminKawscan,
});

type Row = KawscanStore & { kawscan_subscriptions: KawscanSubscription[] };

function AdminKawscan() {
  const qc = useQueryClient();
  const stores = useQuery({
    queryKey: ["admin-kawscan-stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kawscan_stores")
        .select("*, kawscan_subscriptions(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  async function setSub(storeId: string, patch: Partial<KawscanSubscription>) {
    const { error } = await supabase
      .from("kawscan_subscriptions")
      .upsert({ store_id: storeId, status: "active", ...patch }, { onConflict: "store_id" });
    if (error) return toast.error(error.message);
    toast.success("Abonnement mis à jour");
    void qc.invalidateQueries({ queryKey: ["admin-kawscan-stores"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ScanLine className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">KawScan — Magasins &amp; abonnements</h1>
      </div>

      <div className="divide-y rounded-xl border bg-background">
        {stores.data?.map((s) => {
          const sub = s.kawscan_subscriptions?.[0] ?? null;
          const state = subscriptionState(sub, s.is_active);
          return (
            <div key={s.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-48 flex-1">
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground">{storeScanUrl(s.slug)}</p>
              </div>
              <Badge variant={state === "active" ? "default" : "secondary"}>{state}</Badge>
              <Input
                type="date"
                className="w-40"
                defaultValue={sub?.ends_at?.slice(0, 10) ?? ""}
                onChange={(e) =>
                  void setSub(s.id, {
                    ends_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                  })
                }
              />
              <Button
                size="sm"
                variant={state === "active" ? "outline" : "default"}
                onClick={() =>
                  void setSub(s.id, { status: state === "active" ? "suspended" : "active" })
                }
              >
                {state === "active" ? "Suspendre" : "Activer"}
              </Button>
            </div>
          );
        })}
        {stores.data?.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">Aucun magasin KawScan.</p>
        )}
      </div>
    </div>
  );
}
