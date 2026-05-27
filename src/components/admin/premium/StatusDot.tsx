/**
 * StatusDot — Indicateur de statut avec pulse
 * 8px diameter, couleur map sur accent tokens
 */
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, { bg: string; pulse?: boolean; fast?: boolean }> = {
  active: { bg: "bg-success", pulse: true },
  pending: { bg: "bg-warning", pulse: true },
  blocked: { bg: "bg-destructive", fast: true },
  shipped: { bg: "bg-info", pulse: false },
  delivered: { bg: "bg-success", pulse: false },
  cancelled: { bg: "bg-muted-foreground", pulse: false },
  new: { bg: "bg-warning", pulse: true },
  confirmed: { bg: "bg-success", pulse: false },
  processing: { bg: "bg-info", pulse: true },
};

interface StatusDotProps {
  status: string;
  className?: string;
}

export function StatusDot({ status, className }: StatusDotProps) {
  const config = STATUS_COLORS[status] ?? { bg: "bg-muted-foreground", pulse: false };

  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        config.bg,
        config.pulse && (config.fast ? "status-pulse-fast" : "status-pulse"),
        className,
      )}
    />
  );
}

export function StatusLabel({ status, label }: { status: string; label?: string }) {
  const labels: Record<string, string> = {
    new: "Nouvelle",
    confirmed: "Confirmée",
    processing: "En cours",
    shipped: "Expédiée",
    delivered: "Livrée",
    cancelled: "Annulée",
    blocked: "Bloquée",
    pending: "En attente",
    active: "Active",
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusDot status={status} />
      <span className="admin-text-xs text-muted-foreground">{label ?? labels[status] ?? status}</span>
    </span>
  );
}
