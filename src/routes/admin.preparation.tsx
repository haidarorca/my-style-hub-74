import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { PreparationView } from "@/components/orders/PreparationView";
import { getAdminPreparation, markOrdersInPreparation } from "@/lib/preparation.functions";

const searchSchema = z.object({
  ids: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/admin/preparation")({
  validateSearch: zodValidator(searchSchema),
  component: () => (
    <PermissionGate perm="orders">
      <AdminPreparation />
    </PermissionGate>
  ),
});

function AdminPreparation() {
  const { ids } = Route.useSearch();
  const qc = useQueryClient();
  const fetchPrep = useServerFn(getAdminPreparation);
  const mark = useServerFn(markOrdersInPreparation);

  const orderIds = useMemo(
    () => ids.split(",").map((s: string) => s.trim()).filter((s: string) => /^[0-9a-f-]{36}$/i.test(s)),
    [ids],
  );

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "preparation", orderIds],
    enabled: orderIds.length > 0,
    queryFn: () => fetchPrep({ data: { order_ids: orderIds } }),
    staleTime: 10_000,
  });

  const onMark = async () => {
    try {
      const res = await mark({ data: { order_ids: orderIds, mode: "admin" } });
      toast.success(`${res.updated ?? 0} commande(s) marquée(s) en préparation`);
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center gap-2 print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/commandes"><ArrowLeft className="h-4 w-4" /> Retour</Link>
        </Button>
        <h1 className="text-xl font-bold">Préparation groupée (Admin)</h1>
      </div>

      {orderIds.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          Aucune commande sélectionnée.
        </div>
      ) : isLoading || !data ? (
        <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : (
        <PreparationView data={data} onMarkInPreparation={onMark} />
      )}
    </div>
  );
}
