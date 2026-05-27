/**
 * SmartCard — Card intelligente avec hover lift
 * Usage: KPIs, métriques, cartes d'action
 */
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface SmartCardProps {
  title: string;
  value?: string | number;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  trend?: { value: string; positive?: boolean };
  actions?: Array<{ label: string; onClick: () => void; variant?: "primary" | "secondary" | "ghost" }>;
  children?: React.ReactNode;
  className?: string;
  href?: string;
  onClick?: () => void;
  delay?: number; // stagger delay in ms
}

export function SmartCard({
  title,
  value,
  icon: Icon,
  iconColor = "text-primary",
  iconBg = "bg-primary/10",
  trend,
  actions,
  children,
  className,
  href,
  onClick,
  delay = 0,
}: SmartCardProps) {
  const content = (
    <div
      className={cn(
        "card-premium rounded-2xl border border-border bg-card p-5",
        (href || onClick) && "cursor-pointer",
        className,
      )}
      style={{ animationDelay: `${delay}ms` }}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconBg)}>
            <Icon className={cn("h-5 w-5", iconColor)} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{title}</p>
            {value !== undefined && (
              <p className="text-2xl font-bold mt-1">{value}</p>
            )}
          </div>
        </div>
        {trend && (
          <span
            className={cn(
              "text-xs font-medium shrink-0",
              trend.positive !== false ? "text-success" : "text-destructive",
            )}
          >
            {trend.positive !== false ? "↗" : "↘"} {trend.value}
          </span>
        )}
      </div>

      {/* Content */}
      {children && <div className="mt-4">{children}</div>}

      {/* Actions */}
      {actions && actions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {actions.map((a, i) => (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                a.onClick();
              }}
              className={cn(
                "btn-premium text-xs font-medium rounded-lg px-3 py-1.5 transition-colors",
                a.variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90 text-white shadow-sm",
                a.variant === "secondary" && "bg-secondary text-secondary-foreground hover:bg-accent",
                a.variant === "ghost" && "text-muted-foreground hover:text-foreground hover:bg-accent",
                !a.variant && "bg-secondary text-secondary-foreground hover:bg-accent",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block">
        {content}
      </a>
    );
  }

  return content;
}
