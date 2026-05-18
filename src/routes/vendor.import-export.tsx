import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { ImportExportPanel } from "@/components/import-export/ImportExportPanel";

export const Route = createFileRoute("/vendor/import-export")({
  component: VendorImportExport,
});

function VendorImportExport() {
  const { user } = useAuth();
  if (!user) return <div className="p-6 text-sm text-muted-foreground">Connexion requise</div>;
  return <ImportExportPanel scope="vendor" shopId={user.id} />;
}
