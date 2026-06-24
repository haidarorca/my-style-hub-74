// ============================================================
// Hook useStudioViews — KawZone Studio
// Phase 2 : CRUD des vues sauvegardées
// ============================================================

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listViews, saveView, deleteView, getView } from "@/lib/studio/studio.functions";
import type { StudioTemplateKey, SaveViewParams } from "@/lib/studio/studio.types";

// Liste des vues
export function useStudioViewsList(templateKey?: StudioTemplateKey) {
  return useQuery({
    queryKey: ["studio", "views", templateKey],
    queryFn: async () => {
      const result = await listViews({ data: { templateKey } });
      return result.views;
    },
  });
}

// Sauvegarder une vue
export function useSaveStudioView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: SaveViewParams) => {
      return saveView({ data: params });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["studio", "views"] });
    },
  });
}

// Supprimer une vue
export function useDeleteStudioView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (viewId: string) => {
      return deleteView({ data: { viewId } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["studio", "views"] });
    },
  });
}

// Charger une vue spécifique
export function useStudioView(viewId: string | null) {
  return useQuery({
    queryKey: ["studio", "view", viewId],
    queryFn: async () => {
      if (!viewId) return null;
      return getView({ data: { viewId } });
    },
    enabled: !!viewId,
  });
}
