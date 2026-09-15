import { createFileRoute } from "@tanstack/react-router";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CatalogDisplayManager } from "@/components/admin/display/CatalogDisplayManager";
import { HomeSectionsManager } from "@/components/admin/display/HomeSectionsManager";
import { HomeMerchandisingManager } from "@/components/admin/display/HomeMerchandisingManager";
import { IntelligencePanel } from "@/components/admin/display/IntelligencePanel";

export const Route = createFileRoute("/admin/display")({
  component: () => (
    <PermissionGate perm="settings.view">
      <DisplayAdminPage />
    </PermissionGate>
  ),
});

function DisplayAdminPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">Vitrine & affichage</h1>
        <p className="text-xs text-muted-foreground">
          Réglez l'apparence des cartes produits et la composition de la page d'accueil.
          Les images ne sont jamais recadrées : elles restent affichées en entier.
        </p>
      </div>

      <Tabs defaultValue="catalog">
        <TabsList>
          <TabsTrigger value="catalog">Cartes produits</TabsTrigger>
          <TabsTrigger value="home">Page d'accueil</TabsTrigger>
          <TabsTrigger value="merch">Merchandising</TabsTrigger>
          <TabsTrigger value="intelligence">Intelligence</TabsTrigger>
        </TabsList>
        <TabsContent value="catalog" className="mt-4">
          <CatalogDisplayManager />
        </TabsContent>
        <TabsContent value="home" className="mt-4">
          <HomeSectionsManager />
        </TabsContent>
        <TabsContent value="merch" className="mt-4">
          <HomeMerchandisingManager />
        </TabsContent>
        <TabsContent value="intelligence" className="mt-4">
          <IntelligencePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
