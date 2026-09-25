import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { countCjStockIssues } from "@/lib/cj-orders.functions";

/** Alerte Cockpit : commandes bloquées pour problème de stock CJ. */
export function CjStockAlert() {
  const fn = useServerFn(countCjStockIssues);
  const { data } = useQuery({ queryKey: ["cj-stock-issues"], queryFn: () => fn(), refetchInterval: 120_000 });
  if (!data || data.length === 0) return null;
  return (
    <Link to="/admin/cj-orders" className="mb-3 flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div>
        <p className="font-semibold text-destructive">
          {data.length} commande(s) : problème de stock CJ — action requise
        </p>
        <p className="text-xs text-muted-foreground">
          {data.slice(0, 3).map((o) => `${o.reference ?? o.id.slice(0, 8)} (${o.issues.map((i) => i.product_name).join(", ").slice(0, 60)})`).join(" · ")}
        </p>
      </div>
    </Link>
  );
}
