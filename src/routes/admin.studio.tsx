// ============================================================
// Route /admin/studio — KawZone Studio
// Phase 2 : Page principale (TemplatePicker + Filtres + Tableau)
// ============================================================

import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { useStudioQuery } from "@/hooks/studio/use-studio-query";
import { useStudioViewsList, useSaveStudioView, useDeleteStudioView } from "@/hooks/studio/use-studio-views";
import { getSchema } from "@/lib/studio/studio.functions";
import { useQuery } from "@tanstack/react-query";
import type { StudioTemplateKey, StudioViewConfig, StudioSort } from "@/lib/studio/studio.types";

import { StudioShell } from "@/components/studio/StudioShell";
import { TemplatePicker } from "@/components/studio/TemplatePicker";
import { StudioTable } from "@/components/studio/StudioTable";
import { StudioFilters } from "@/components/studio/StudioFilters";
import { ColumnSelector } from "@/components/studio/ColumnSelector";
import { ViewSaveDialog } from "@/components/studio/ViewSaveDialog";
import { ViewLoadMenu } from "@/components/studio/ViewLoadMenu";
import { ExportCsvButton } from "@/components/studio/ExportCsvButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/studio")({
  component: () => (
    <PermissionGate perm="studio_access">
      <StudioPage />
    </PermissionGate>
  ),
});

// Colonnes par défaut par template
const DEFAULT_COLUMNS: Record<StudioTemplateKey, string[]> = {
  articles_vendus: ["id", "product_name", "product_code", "quantity", "unit_price", "color", "shop_name_snapshot"],
  sous_commandes: ["id", "sub_order_key", "status", "order_id", "created_at"],
  produits: ["id", "name", "code", "price", "status", "brand", "created_at"],
};

function StudioPage() {
  const [templateKey, setTemplateKey] = useState<StudioTemplateKey | null>(null);
  const [viewName, setViewName] = useState<string | undefined>();
  // Pagination : 1-based pour l'UI (PaginationBar), converti en 0-based pour l'API
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState<StudioSort | null>(null);

  // Config actuelle
  const config: StudioViewConfig | null = useMemo(() => {
    if (!templateKey) return null;
    return {
      templateKey,
      columns: DEFAULT_COLUMNS[templateKey],
      filters: [],
      sort,
      pageSize,
    };
  }, [templateKey, sort, pageSize]);

  // Chargement du schéma
  const { data: schemaData } = useQuery({
    queryKey: ["studio", "schema", templateKey],
    queryFn: async () => {
      if (!templateKey) return null;
      return getSchema({ data: { templateKey } });
    },
    enabled: !!templateKey,
  });

  // Chargement des données (page converti en 0-based pour l'API)
  const { data: queryResult, isLoading } = useStudioQuery(
    {
      templateKey: templateKey ?? "articles_vendus",
      columns: config?.columns ?? ["id"],
      filters: config?.filters ?? [],
      sort: config?.sort ?? null,
      page: page - 1,
      pageSize,
    },
    !!templateKey
  );

  // Vues sauvegardées
  const { data: savedViews } = useStudioViewsList(templateKey ?? undefined);
  const saveMutation = useSaveStudioView();
  const deleteMutation = useDeleteStudioView();

  // Handlers
  const handleSort = (field: string) => {
    setSort((prev) => {
      if (prev?.field === field) {
        return prev.dir === "asc" ? { field, dir: "desc" } : null;
      }
      return { field, dir: "asc" };
    });
    setPage(1);
  };

  const handleSaveView = (name: string, description: string) => {
    if (!config) return;
    saveMutation.mutate({ name, description, templateKey: config.templateKey, config });
    setViewName(name);
  };

  const handleLoadView = (view: { id: string; name: string; template_key: string; config: unknown }) => {
    setTemplateKey(view.template_key as StudioTemplateKey);
    setViewName(view.name);
    setPage(1);
  };

  const handleDeleteView = (id: string) => {
    deleteMutation.mutate(id);
  };

  const handleReset = () => {
    setTemplateKey(null);
    setViewName(undefined);
    setPage(1);
    setSort(null);
  };

  // Vue template picker
  if (!templateKey) {
    return (
      <StudioShell>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sélectionnez un modèle pour commencer votre analyse.
          </p>
          <TemplatePicker onSelect={(key) => { setTemplateKey(key); setPage(1); }} />
        </div>
      </StudioShell>
    );
  }

  const entityLabel = schemaData?.entity.label ?? templateKey;
  const fields = schemaData?.entity.fields ?? [];

  return (
    <StudioShell
      templateLabel={entityLabel}
      viewName={viewName}
      onReset={handleReset}
      actions={
        <div className="flex items-center gap-2">
          {savedViews && savedViews.length > 0 && (
            <ViewLoadMenu
              views={savedViews.map((v: any) => ({ id: v.id, name: v.name, description: v.description, template_key: v.template_key }))}
              onLoad={handleLoadView as any}
              onDelete={handleDeleteView}
            />
          )}
          {config && (
            <>
              <ViewSaveDialog onSave={handleSaveView} />
              <ExportCsvButton config={config} disabled={!queryResult || queryResult.rows.length === 0} />
            </>
          )}
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Sidebar : Filtres + Colonnes */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Colonnes</CardTitle>
            </CardHeader>
            <CardContent>
              <ColumnSelector
                fields={fields}
                selected={config?.columns ?? []}
                onChange={(cols) => {
                  // Les colonnes sont en lecture seule pour le MVP
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Filtres</CardTitle>
            </CardHeader>
            <CardContent>
              <StudioFilters
                fields={fields}
                filters={config?.filters ?? []}
                onChange={(filters) => {
                  // Les filtres sont en lecture seule pour le MVP
                }}
              />
            </CardContent>
          </Card>
        </div>

        {/* Main : Tableau */}
        <div>
          <StudioTable
            viewType="table"
            columns={config?.columns ?? ["id"]}
            fields={fields}
            rows={queryResult?.rows ?? []}
            total={queryResult?.total ?? 0}
            page={page}
            pageSize={pageSize}
            sortField={sort?.field ?? null}
            sortDir={sort?.dir ?? "asc"}
            onSort={handleSort}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            loading={isLoading}
          />
        </div>
      </div>
    </StudioShell>
  );
}
