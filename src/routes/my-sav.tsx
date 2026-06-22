import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listMyCases } from "@/lib/sav-workflow.functions";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { SavCaseList } from "@/components/sav/SavCaseList";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/my-sav")({
  component: AccountSavPage,
});

function AccountSavPage() {
  const list = useServerFn(listMyCases);
  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["my-sav-cases"],
    queryFn: () => list(),
  });

  return (
    <>
      <AppHeader />
      <div className="container max-w-5xl py-6 px-4">
        <BackButton />
        <div className="flex items-center gap-2 mb-4">
          <ShieldAlert className="w-6 h-6 text-amber-500" />
          <h1 className="text-2xl font-bold">Mes dossiers SAV</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Retours, échanges, garanties et remboursements. Pour ouvrir un nouveau dossier, rendez-vous sur la commande concernée depuis <Link to="/orders" className="underline">Mes commandes</Link>.
        </p>
        <SavCaseList cases={data as any} role="client" loading={isLoading} onChanged={refetch} />
      </div>
    </>
  );
}
