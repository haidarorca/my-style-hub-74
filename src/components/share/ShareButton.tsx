// ═══════════════════════════════════════════════════════════════
// ShareButton — bouton réutilisable qui ouvre le ShareCenter.
// ═══════════════════════════════════════════════════════════════

import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShareCenter, type ShareCenterProps } from "./ShareCenter";
import { cn } from "@/lib/utils";

type Variant = "default" | "outline" | "ghost" | "icon" | "cta";

interface Props {
  product: ShareCenterProps["product"];
  variant?: Variant;
  label?: string;
  className?: string;
}

export function ShareButton({ product, variant = "outline", label, className }: Props) {
  const [open, setOpen] = useState(false);

  const trigger =
    variant === "icon" ? (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label="Partager le produit"
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full bg-background/85 text-foreground backdrop-blur-sm shadow-soft transition-all duration-200 hover:bg-primary hover:text-primary-foreground active:scale-90",
          className,
        )}
      >
        <Share2 className="h-4 w-4" strokeWidth={2.5} />
      </button>
    ) : variant === "cta" ? (
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "w-full h-11 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold shadow-md",
          className,
        )}
      >
        <Share2 className="mr-2 h-4 w-4" />
        {label ?? "Partager ce produit"}
      </Button>
    ) : (
      <Button
        type="button"
        variant={variant === "default" ? "default" : variant}
        onClick={() => setOpen(true)}
        className={className}
      >
        <Share2 className="mr-2 h-4 w-4" />
        {label ?? "Partager"}
      </Button>
    );

  return (
    <>
      {trigger}
      <ShareCenter open={open} onOpenChange={setOpen} product={product} />
    </>
  );
}
