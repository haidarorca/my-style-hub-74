import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listMyShopCases } from "@/lib/sav-workflow.functions";
import { SavCaseList } from "@/components/sav/SavCaseList";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/vendor/sav")({
  component: VendorSavPage,
});

function VendorSavPage() {
  const list = useServerFn(listMyShopCases);
  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["vendor-sav-cases"],
    queryFn: () => list(),
  });

  return (
    <div className="container max-w-6xl py-6 px-4">
      <div className="flex items-center gap-2 mb-4">
        <ShieldAlert className="w-6 h-6 text-amber-500" />
        <h1 className="text-2xl font-bold">SAV — Dossiers de ma boutique</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Vous pouvez répondre, ajouter des preuves et formuler une recommandation. La décision finale appartient à l'administration KawZone.
      </p>
      <SavCaseList cases={data as any} role="vendor" loading={isLoading} onChanged={refetch} />
    </div>
  );
}
