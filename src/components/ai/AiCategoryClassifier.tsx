/**
 * AiCategoryClassifier
 * --------------------
 * Classe un produit dans le catalogue EXISTANT.
 * L'IA propose jusqu'à 3 catégories existantes avec un niveau de confiance.
 * Aucune création de catégorie n'est possible depuis ce composant.
 */

import React, { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, Check, Loader2, AlertTriangle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  classifyProductCategory,
  recordClassificationFeedback,
  type CategorySuggestionItem,
} from "@/lib/ai-classifier.functions";

interface Props {
  name?: string;
  designation?: string;
  description?: string;
  brand?: string;
  keywords?: string;
  attributes?: string;
  imageDataUrls?: string[];
  onApply: (categoryId: string) => void;
  autoRunKey?: number; // change de valeur => lance la classification
  compact?: boolean;
}

function confidenceTone(c: number) {
  if (c >= 85) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (c >= 70) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-destructive bg-destructive/5 border-destructive/20";
}

export const AiCategoryClassifier = React.memo(function AiCategoryClassifier({
  name,
  designation,
  description,
  brand,
  keywords,
  attributes,
  imageDataUrls,
  onApply,
  autoRunKey,
  compact,
}: Props) {
  const classify = useServerFn(classifyProductCategory);
  const sendFeedback = useServerFn(recordClassificationFeedback);

  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);
  const [suggestions, setSuggestions] = useState<CategorySuggestionItem[]>([]);
  const [appliedId, setAppliedId] = useState<string | null>(null);

  const signals = [name, designation, brand, keywords, attributes, description]
    .filter(Boolean)
    .join(" ")
    .slice(0, 2000);

  const run = useCallback(async () => {
    if (!signals.trim() && (imageDataUrls ?? []).length === 0) {
      toast.error("Renseignez d'abord le nom, la description ou une image.");
      return;
    }
    setLoading(true);
    try {
      const r = await classify({
        data: {
          name: name || undefined,
          designation: designation || undefined,
          description: description || undefined,
          brand: brand || undefined,
          keywords: keywords || undefined,
          attributes: attributes || undefined,
          image_data_urls: (imageDataUrls ?? []).slice(0, 4),
        },
      });
      setSuggestions(r.suggestions);
      setRan(true);
      if (r.suggestions.length === 0) {
        toast.warning("Aucune correspondance fiable trouvée.");
      } else {
        toast.success(`Classification prête (${r.suggestions.length} proposition(s)).`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur de classification";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [classify, signals, name, designation, description, brand, keywords, attributes, imageDataUrls]);

  // Lancement automatique (bouton "Générer + Classifier")
  React.useEffect(() => {
    if (autoRunKey && autoRunKey > 0) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRunKey]);

  const apply = useCallback(
    async (s: CategorySuggestionItem) => {
      onApply(s.category_id);
      setAppliedId(s.category_id);
      toast.success("Catégorie appliquée.");
      try {
        await sendFeedback({
          data: {
            signals: signals || s.label,
            suggested_category_id: suggestions[0]?.category_id ?? null,
            chosen_category_id: s.category_id,
          },
        });
      } catch {
        /* l'apprentissage ne doit jamais bloquer l'utilisateur */
      }
    },
    [onApply, sendFeedback, signals, suggestions],
  );

  const top = suggestions[0];
  const lowConfidence = ran && (!top || top.confidence < 70);

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant={compact ? "outline" : "secondary"}
        onClick={run}
        disabled={loading}
        className="w-full gap-2"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
        {loading ? "Analyse du catalogue..." : "Classifier avec l'IA"}
      </Button>

      {ran && suggestions.length === 0 && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>Aucune correspondance suffisamment fiable trouvée — sélection manuelle recommandée.</p>
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <Card className="border-primary/20">
          <CardContent className="space-y-3 p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Catégories existantes proposées</p>
            </div>

            {lowConfidence && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
                ⚠️ Confiance faible — vérification recommandée. L'IA ne crée jamais de nouvelle catégorie.
              </div>
            )}

            <div className="space-y-2">
              {suggestions.map((s, i) => (
                <div
                  key={s.category_id}
                  className={cn(
                    "rounded-lg border p-2.5 transition",
                    appliedId === s.category_id ? "border-primary bg-primary/5" : "bg-muted/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1 text-sm font-medium">
                        <span className="text-muted-foreground">{i + 1}.</span>
                        {[s.level1?.name, s.level2?.name, s.level3?.name]
                          .filter(Boolean)
                          .map((n, idx, arr) => (
                            <span key={`${n}-${idx}`} className="flex items-center gap-1">
                              {n}
                              {idx < arr.length - 1 && (
                                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                              )}
                            </span>
                          ))}
                      </div>
                      {s.reason && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{s.reason}</p>
                      )}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                        confidenceTone(s.confidence),
                      )}
                    >
                      {s.confidence}%
                    </span>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant={appliedId === s.category_id ? "default" : "outline"}
                    className="mt-2 w-full gap-1"
                    onClick={() => apply(s)}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {appliedId === s.category_id ? "Appliquée" : "Choisir cette catégorie"}
                  </Button>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-muted-foreground">
              L'IA sélectionne uniquement des catégories déjà présentes dans votre catalogue.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
});
