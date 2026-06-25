// ============================================================
// ReturnBadge — KawZone Cockpit
// Badge affiche sur les OrderCard / SubOrderCard
// Indique qu'un retour est en cours sur cette commande
// ============================================================

import { RotateCcw, AlertTriangle, Check, Clock, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ReturnBadgeStatus =
  | "requested"   // Demande en attente de validation
  | "accepted"    // Accepte, en attente de reception
  | "in_transit"  // Colis en route
  | "received"    // Recu, inspection en attente
  | "inspecting"  // Inspection en cours
  | "processing"  // Traitement (restock/destruction/...)
  | "refunding"   // Remboursement en cours
  | "closed"      // Dossier cloture
  | "refused";    // Retour refuse

interface ReturnBadgeProps {
  status: ReturnBadgeStatus;
  count?: number;
  className?: string;
  onClick?: () => void;
}

const STATUS_CONFIG: Record<ReturnBadgeStatus, { label: string; variant: string; icon: typeof RotateCcw }> = {
  requested: { label: "Retour demandé", variant: "bg-blue-100 text-blue-700 hover:bg-blue-200", icon: RotateCcw },
  accepted: { label: "Retour accepté", variant: "bg-green-100 text-green-700 hover:bg-green-200", icon: Check },
  in_transit: { label: "Colis en transit", variant: "bg-yellow-100 text-yellow-700 hover:bg-yellow-200", icon: Truck },
  received: { label: "Colis reçu", variant: "bg-purple-100 text-purple-700 hover:bg-purple-200", icon: RotateCcw },
  inspecting: { label: "Inspection", variant: "bg-orange-100 text-orange-700 hover:bg-orange-200", icon: AlertTriangle },
  processing: { label: "Traitement", variant: "bg-gray-100 text-gray-700 hover:bg-gray-200", icon: Clock },
  refunding: { label: "Remboursement", variant: "bg-cyan-100 text-cyan-700 hover:bg-cyan-200", icon: RotateCcw },
  closed: { label: "Retour clôturé", variant: "bg-muted text-muted-foreground", icon: Check },
  refused: { label: "Retour refusé", variant: "bg-red-100 text-red-700 hover:bg-red-200", icon: AlertTriangle },
};

export function ReturnBadge({ status, count, className, onClick }: ReturnBadgeProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <Badge
      className={cn(
        "inline-flex items-center gap-1 cursor-pointer transition-colors",
        config.variant,
        className,
      )}
      onClick={onClick}
    >
      <Icon className="h-3 w-3" />
      {config.label}
      {count && count > 1 && (
        <span className="ml-0.5 text-[10px] font-bold">({count})</span>
      )}
    </Badge>
  );
}
