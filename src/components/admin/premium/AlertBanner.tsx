/**
 * AlertBanner — Bandeau d'alerte intelligent
 * Severity: info | warning | critical
 * Auto-dismiss pour info, persistant pour critical
 */
import { useEffect, useState } from "react";
import { AlertTriangle, Zap, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlertBannerProps {
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
  autoDismiss?: boolean;
  dismissDelay?: number;
}

const SEVERITY_CONFIG = {
  info: {
    icon: AlertTriangle,
    border: "border-info/30",
    bg: "bg-info/5",
    iconColor: "text-info",
    glow: "",
  },
  warning: {
    icon: AlertTriangle,
    border: "border-warning/30",
    bg: "bg-warning/5",
    iconColor: "text-warning",
    glow: "",
  },
  critical: {
    icon: Zap,
    border: "border-destructive/30",
    bg: "bg-destructive/5",
    iconColor: "text-destructive",
    glow: "shadow-[0_0_16px_rgba(239,68,68,0.1)]",
  },
};

export function AlertBanner({
  severity,
  title,
  description,
  action,
  onDismiss,
  autoDismiss = false,
  dismissDelay = 10000,
}: AlertBannerProps) {
  const [visible, setVisible] = useState(true);
  const cfg = SEVERITY_CONFIG[severity];
  const Icon = cfg.icon;

  useEffect(() => {
    if (autoDismiss && severity !== "critical") {
      const timer = setTimeout(() => {
        setVisible(false);
        onDismiss?.();
      }, dismissDelay);
      return () => clearTimeout(timer);
    }
  }, [autoDismiss, dismissDelay, severity, onDismiss]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        "alert-enter flex items-start gap-3 rounded-xl border px-4 py-3",
        cfg.border,
        cfg.bg,
        cfg.glow,
      )}
    >
      <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", cfg.iconColor)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        {action && (
          <button
            onClick={action.onClick}
            className="btn-premium mt-2 inline-flex items-center gap-1 rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/25 transition-colors"
          >
            {action.label}
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={() => {
            setVisible(false);
            onDismiss();
          }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
