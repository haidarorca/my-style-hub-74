/**
 * AiCategoryDetector - Composant de detection intelligente des categories
 * ---------------------------------------------------------------------
 * Apres generation du nom/description par l'IA, ce composant :
 *   1. Demande a l'IA de suggerer une hierarchie de categories
 *   2. Cherche les categories similaires dans la base
 *   3. Affiche les resultats avec options "Appliquer existante" / "Creer"
 */

import React, { useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  FolderTree,
  Check,
  Plus,
  Loader2,
  AlertTriangle,
  FolderOpen,
  Folder,
  FolderPlus,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  detectCategories,
  findExistingCategories,
  createCategoryHierarchy,
} from "@/lib/admin-category-generator.functions";

interface CategoryResult {
  rayon: string;
  categorie: string;
  sous_categorie: string | null;
}

interface ExistingCategories {
  rayon: { id: string; name: string } | null;
  categorie: { id: string; name: string } | null;
  sous_categorie: { id: string; name: string } | null;
  all_rayons: { id: string; name: string }[];
}

interface Props {
  name: string;
  designation: string;
  description: string;
  onApply: (categoryId: string) => void;
}

export const AiCategoryDetector = React.memo(function AiCategoryDetector({
  name,
  designation,
  description,
  onApply,
}: Props) {
  const detect = useServerFn(detectCategories);
  const findExisting = useServerFn(findExistingCategories);
  const createHierarchy = useServerFn(createCategoryHierarchy);

  const [loading, setLoading] = useState(false);
  const [detected, setDetected] = useState<CategoryResult | null>(null);
  const [existing, setExisting] = useState<ExistingCategories | null>(null);
  const [creating, setCreating] = useState(false);
  const [applied, setApplied] = useState(false);

  // Lancer la detection
  const runDetection = useCallback(async () => {
    if (!name || !description) {
      toast.error("Generez d'abord le nom et la description du produit.");
      return;
    }
    setLoading(true);
    try {
      const result = await detect({
        data: { name, designation, description },
      });
      setDetected(result);

      // Chercher les categories existantes
      const existingResult = await findExisting({
        data: {
          rayon_name: result.rayon,
          categorie_name: result.categorie,
          sous_categorie_name: result.sous_categorie,
        },
      });
      setExisting(existingResult);

      toast.success("Categories analysees !");
    } catch (err: any) {
      console.error("[AiCategoryDetector] Erreur:", err);
      toast.error(err.message || "Erreur de detection");
    } finally {
      setLoading(false);
    }
  }, [name, designation, description, detect, findExisting]);

  // Appliquer une categorie existante
  const applyExisting = useCallback(
    async (categoryId: string) => {
      onApply(categoryId);
      setApplied(true);
      toast.success("Categorie appliquee !");
    },
    [onApply],
  );

  // Creer et appliquer les nouvelles categories
  const createAndApply = useCallback(async () => {
    if (!detected) return;
    setCreating(true);
    try {
      const result = await createHierarchy({
        data: {
          rayon_name: detected.rayon,
          categorie_name: detected.categorie,
          sous_categorie_name: detected.sous_categorie,
        },
      });

      // Appliquer la sous-categorie si elle existe, sinon la categorie
      const categoryId = result.sous_categorie_id ?? result.categorie_id;
      onApply(categoryId);
      setApplied(true);

      // Message de confirmation
      const createdParts: string[] = [];
      if (result.created.rayon) createdParts.push(detected.rayon);
      if (result.created.categorie) createdParts.push(detected.categorie);
      if (result.created.sous_categorie && detected.sous_categorie)
        createdParts.push(detected.sous_categorie);

      if (createdParts.length > 0) {
        toast.success(`${createdParts.join(", ")} cree(s) et appliques !`);
      } else {
        toast.success("Categories existantes appliquees !");
      }
    } catch (err: any) {
      console.error("[AiCategoryDetector] Erreur creation:", err);
      toast.error(err.message || "Erreur de creation");
    } finally {
      setCreating(false);
    }
  }, [detected, createHierarchy, onApply]);

  // Si deja applique
  if (applied) {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center gap-2 text-sm text-primary">
          <Check className="h-4 w-4" />
          Categorie appliquee avec succes
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bouton de detection */}
      {!detected && (
        <Button
          type="button"
          variant="outline"
          onClick={runDetection}
          disabled={loading || !name}
          className="w-full gap-2"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FolderTree className="h-4 w-4" />
          )}
          {loading ? "Analyse des categories..." : "Detecter la categorie automatiquement"}
        </Button>
      )}

      {/* Resultat de detection */}
      {detected && existing && (
        <Card className="border-primary/20">
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-2">
              <FolderTree className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Hierarchie suggeree par l'IA</p>
            </div>

            {/* Arbre visuel des categories */}
            <div className="space-y-2">
              {/* Rayon */}
              <CategoryTreeItem
                icon={<FolderOpen className="h-4 w-4 text-blue-500" />}
                label="Rayon"
                name={detected.rayon}
                existing={existing.rayon}
                onApply={applyExisting}
              />

              <div className="ml-4 border-l-2 border-border pl-4">
                {/* Categorie */}
                <CategoryTreeItem
                  icon={<Folder className="h-4 w-4 text-green-500" />}
                  label="Categorie"
                  name={detected.categorie}
                  existing={existing.categorie}
                  onApply={applyExisting}
                />

                {/* Sous-categorie */}
                {detected.sous_categorie && (
                  <div className="ml-4 border-l-2 border-border pl-4">
                    <CategoryTreeItem
                      icon={<FolderPlus className="h-4 w-4 text-amber-500" />}
                      label="Sous-categorie"
                      name={detected.sous_categorie}
                      existing={existing.sous_categorie}
                      onApply={applyExisting}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Alerte si categories similaires existent */}
            {(existing.rayon || existing.categorie) && (
              <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    <p className="font-medium">Categories similaires detectees</p>
                    <p className="mt-0.5 text-amber-700">
                      L'IA a trouve des categories existantes similaires. Vous pouvez les
                      reutiliser ou en creer de nouvelles.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2 sm:flex-row">
              {/* Bouton : Appliquer existante */}
              {(existing.categorie || existing.rayon) && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const id =
                      existing.sous_categorie?.id ??
                      existing.categorie?.id ??
                      existing.rayon?.id;
                    if (id) applyExisting(id);
                  }}
                  className="flex-1 gap-2"
                  disabled={!existing.categorie && !existing.rayon}
                >
                  <Check className="h-4 w-4" />
                  Appliquer une categorie existante
                </Button>
              )}

              {/* Bouton : Creer et appliquer */}
              <Button
                type="button"
                onClick={createAndApply}
                disabled={creating}
                className="flex-1 gap-2"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {creating ? "Creation..." : "Creer et appliquer cette hierarchie"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
});

// ── Sous-composant : Item d'arbre de categories ──

function CategoryTreeItem({
  icon,
  label,
  name,
  existing,
  onApply,
}: {
  icon: React.ReactNode;
  label: string;
  name: string;
  existing: { id: string; name: string } | null;
  onApply: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg p-2 transition",
        existing ? "bg-green-50 border border-green-200" : "bg-muted/50 border border-border",
      )}
    >
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{name}</p>
      </div>
      {existing ? (
        <button
          type="button"
          onClick={() => onApply(existing.id)}
          className="flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 transition hover:bg-green-200"
        >
          <Check className="h-3 w-3" />
          Existe
        </button>
      ) : (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
          <Plus className="h-3 w-3" />
          Nouveau
        </span>
      )}
    </div>
  );
}
