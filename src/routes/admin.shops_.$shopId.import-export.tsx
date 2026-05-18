import { createFileRoute } from "@tanstack/react-router";
import { ImportExportPanel } from "@/components/import-export/ImportExportPanel";

export const Route = createFileRoute("/admin/shops_/$shopId/import-export")({
  component: AdminShopImportExport,
});

function AdminShopImportExport() {
  const { shopId } = Route.useParams();
  return <ImportExportPanel scope="admin" shopId={shopId} />;
}
