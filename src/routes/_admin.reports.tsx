import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_admin/reports")({
  component: ReportsPage,
});

type ReportRow = {
  id: string; reason: string; status: "open" | "reviewed" | "dismissed";
  created_at: string;
  product: { id: string; name: string; code: string } | null;
};

function ReportsPage() {
  const qc = useQueryClient();
  const { data: reports } = useQuery({
    queryKey: ["admin", "reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_reports")
        .select("id, reason, status, created_at, product:products(id, name, code)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ReportRow[];
    },
  });

  async function setStatus(id: string, status: "reviewed" | "dismissed") {
    const { error } = await supabase.from("product_reports").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Mis à jour");
    qc.invalidateQueries({ queryKey: ["admin", "reports"] });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Signalements</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">Produits signalés</CardTitle></CardHeader>
        <CardContent>
          {!reports ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun signalement.</p>
          ) : (
            <ul className="divide-y">
              {reports.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{r.product?.name ?? "Produit supprimé"}</div>
                    {r.product && <div className="text-xs text-muted-foreground">Code {r.product.code}</div>}
                    <div className="mt-1 text-sm">{r.reason}</div>
                  </div>
                  <Badge variant={r.status === "open" ? "destructive" : "secondary"}>{r.status}</Badge>
                  {r.status === "open" && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "dismissed")}>Ignorer</Button>
                      <Button size="sm" onClick={() => setStatus(r.id, "reviewed")}>Marquer traité</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
