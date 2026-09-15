import { Truck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Message informatif affiché lorsqu'aucun tarif de livraison automatique
 * n'est disponible pour la destination du client.
 * La commande reste toujours possible : le vendeur confirmera le montant.
 */
export function DeliveryToConfirmNotice({
  className,
  variant = "default",
}: {
  className?: string;
  /** "shop" adapte le texte à la page boutique. */
  variant?: "default" | "shop";
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-amber-900 dark:text-amber-200",
        className,
      )}
    >
      <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        {variant === "shop" ? (
          <>Livraison vers votre destination à confirmer avec le vendeur.</>
        ) : (
          <>
            <strong>Frais de livraison à confirmer.</strong>{" "}
            Le montant de la livraison vous sera communiqué après confirmation de votre commande.
          </>
        )}
      </span>
    </div>
  );
}
