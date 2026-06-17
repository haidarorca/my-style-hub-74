/**
 * OrderItemsList — Affichage des items d'une commande (admin + vendor)
 * Remplace le code duplique dans :
 *   - admin.orders.tsx (lignes 325-402)
 *   - vendor.orders.tsx (lignes 341-400 + 498-553)
 *
 * Affiche : image, nom, code, quantite, prix, taille, couleur, customisation
 */
import { cn } from "@/lib/utils";
import { ZoomIn } from "lucide-react";

export interface OrderItemDisplay {
  id: string;
  product_name: string;
  product_code: string;
  product_image_url: string | null;
  quantity: number;
  unit_price: number;
  size: string | null;
  color: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customization?: Record<string, any> | null;
  commission_amount?: number;
}

interface OrderItemsListProps {
  items: OrderItemDisplay[];
  onImageClick?: (url: string) => void;
  className?: string;
  compact?: boolean;
}

export function OrderItemsList({ items, onImageClick, className, compact = false }: OrderItemsListProps) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-muted-foreground italic">Aucun article</p>;
  }

  return (
    <div className={cn("space-y-2", className)}>
      {items.map((item) => (
        <OrderItemRow
          key={item.id}
          item={item}
          onImageClick={onImageClick}
          compact={compact}
        />
      ))}

      {/* Total */}
      <div className="flex justify-end border-t pt-2 mt-2">
        <span className="text-sm font-semibold">
          Total : {items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0).toLocaleString("fr-FR")} FCFA
        </span>
      </div>
    </div>
  );
}

function OrderItemRow({
  item,
  onImageClick,
  compact,
}: {
  item: OrderItemDisplay;
  onImageClick?: (url: string) => void;
  compact: boolean;
}) {
  const hasCustomization = item.customization && Object.keys(item.customization).length > 0;

  return (
    <div className={cn("flex gap-3 rounded-lg border bg-card/50 p-2.5", compact && "p-2")}>
      {/* Image */}
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-md border bg-muted cursor-pointer group",
          compact ? "h-14 w-14" : "h-16 w-16"
        )}
        onClick={() => item.product_image_url && onImageClick?.(item.product_image_url)}
      >
        {item.product_image_url ? (
          <>
            <img
              src={item.product_image_url}
              alt={item.product_name}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
              <ZoomIn className="h-4 w-4 text-white" />
            </div>
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-[10px] text-muted-foreground">?</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.product_name}</p>
        <p className="text-[11px] text-muted-foreground font-mono">{item.product_code}</p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
          <span className="text-xs">
            <span className="text-muted-foreground">Qté :</span> {item.quantity}
          </span>
          <span className="text-xs font-medium">
            {(item.unit_price * item.quantity).toLocaleString("fr-FR")} FCFA
          </span>
          {item.size && (
            <span className="text-[11px] bg-muted rounded px-1.5 py-0.5">Taille : {item.size}</span>
          )}
          {item.color && (
            <span className="text-[11px] bg-muted rounded px-1.5 py-0.5">Couleur : {item.color}</span>
          )}
        </div>

        {/* Customization */}
        {hasCustomization && (
          <div className="mt-1.5 rounded-md bg-muted/70 p-2 text-[11px]">
            <p className="font-medium text-muted-foreground mb-1">Personnalisation :</p>
            <CustomizationBlock data={item.customization!} />
          </div>
        )}
      </div>
    </div>
  );
}

function CustomizationBlock({ data }: { data: Record<string, unknown> }) {
  const text = data.text as string | undefined;
  const font = data.font as string | undefined;
  const imageUrl = data.image_url as string | undefined;

  return (
    <div className="space-y-1">
      {text && (
        <p>
          <span className="text-muted-foreground">Texte :</span>{" "}
          <span className="font-medium italic">&ldquo;{text}&rdquo;</span>
          {font && <span className="text-muted-foreground ml-1">({font})</span>}
        </p>
      )}
      {imageUrl && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Image :</span>
          <img src={imageUrl} alt="" className="h-8 w-8 rounded object-cover border" />
        </div>
      )}
      {/* Fallback: display raw keys */}
      {!text && !imageUrl && Object.entries(data).map(([k, v]) => (
        <p key={k}>
          <span className="text-muted-foreground capitalize">{k} :</span>{" "}
          <span className="font-medium">{String(v)}</span>
        </p>
      ))}
    </div>
  );
}
