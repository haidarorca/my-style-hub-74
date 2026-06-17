/**
 * OrderStatusBadge — Badge de statut commande (admin + vendor)
 * Remplace les definitions dupliquees dans admin.orders.tsx et vendor.orders.tsx
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, Package, XCircle } from "lucide-react";

export type OrderStatus = "new" | "confirmed" | "delivered" | "cancelled" | "refunded";

const STATUS_CONFIG: Record<OrderStatus, { label: string; variant: string; icon: typeof Clock }> = {
  new:       { label: "En attente",  variant: "bg-amber-500/15 text-amber-700 border-amber-500/30",       icon: Clock },
  confirmed: { label: "Confirmée",   variant: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30", icon: CheckCircle2 },
  delivered: { label: "Livrée",      variant: "bg-blue-500/15 text-blue-700 border-blue-500/30",         icon: Package },
  cancelled: { label: "Annulée",     variant: "bg-destructive/15 text-destructive border-destructive/30", icon: XCircle },
  refunded:  { label: "Remboursée",  variant: "bg-muted text-muted-foreground",                           icon: XCircle },
};

interface OrderStatusBadgeProps {
  status: string;
  className?: string;
  showIcon?: boolean;
  size?: "sm" | "md";
}

export function OrderStatusBadge({ status, className, showIcon = true, size = "sm" }: OrderStatusBadgeProps) {
  const cfg = STATUS_CONFIG[status as OrderStatus] ?? STATUS_CONFIG.new;
  const Icon = cfg.icon;

  if (size === "sm") {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", cfg.variant, className)}>
        {showIcon && <Icon className="h-3 w-3" />}
        {cfg.label}
      </span>
    );
  }

  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", cfg.variant, className)}>
      {showIcon && <Icon className="h-3.5 w-3.5" />}
      {cfg.label}
    </Badge>
  );
}

/** Version dot seule (pour les listes compactes) */
export function OrderStatusDot({ status, className }: { status: string; className?: string }) {
  const dotColors: Record<string, string> = {
    new:       "bg-amber-500",
    confirmed: "bg-emerald-500",
    delivered: "bg-blue-500",
    cancelled: "bg-destructive",
    refunded:  "bg-muted-foreground",
  };
  return (
    <span
      className={cn("inline-block h-2 w-2 rounded-full", dotColors[status] ?? "bg-gray-400", className)}
      title={STATUS_CONFIG[status as OrderStatus]?.label ?? status}
    />
  );
}
