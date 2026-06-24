// ============================================================
// TemplatePicker — KawZone Studio
// Phase 2 : Sélection du template (3 cartes cliquables)
// ============================================================

import { ShoppingCart, Truck, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StudioTemplateKey } from "@/lib/studio/studio.types";

const TEMPLATES: { key: StudioTemplateKey; label: string; description: string; icon: typeof ShoppingCart }[] = [
  {
    key: "articles_vendus",
    label: "Articles vendus",
    description: "Tous les articles vendus avec filtrage par produit, vendeur, statut.",
    icon: ShoppingCart,
  },
  {
    key: "sous_commandes",
    label: "Sous-commandes",
    description: "Vue des sous-commandes avec statut, dates et détails.",
    icon: Truck,
  },
  {
    key: "produits",
    label: "Produits",
    description: "Catalogue produits avec filtres par catégorie, statut, prix.",
    icon: Package,
  },
];

interface TemplatePickerProps {
  onSelect: (key: StudioTemplateKey) => void;
}

export function TemplatePicker({ onSelect }: TemplatePickerProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {TEMPLATES.map((tpl) => {
        const Icon = tpl.icon;
        return (
          <Card
            key={tpl.key}
            className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
            onClick={() => onSelect(tpl.key)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <CardTitle className="text-base">{tpl.label}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{tpl.description}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
