import { gridStyle, type DisplayConfig } from "@/lib/display/display-config";
import { cn } from "@/lib/utils";

/**
 * Grille produits pilotée par la configuration d'affichage admin
 * (nombre de colonnes mobile/desktop, espacement).
 */
export function ProductGrid({
  config,
  className,
  children,
}: {
  config: DisplayConfig;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid-products-cfg", className)} style={gridStyle(config)}>
      {children}
    </div>
  );
}
